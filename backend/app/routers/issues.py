from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import (
    IssueOrder, IssueItem, Part, User, Stock, StockMovement, MovementType, UserRole,
    Barcode, OemNumber
)
from app.schemas import (
    IssueOrderCreate, IssueOrderOut, IssueOrderList, IssueItemOut, IssueItemCreate
)
from app.auth import get_current_user

router = APIRouter(prefix="/api/issues", tags=["issues"])


def _load_opts():
    return [
        selectinload(IssueOrder.created_by_user),
        selectinload(IssueOrder.items).selectinload(IssueItem.part).selectinload(Part.barcodes),
        selectinload(IssueOrder.items).selectinload(IssueItem.part).selectinload(Part.oem_numbers),
    ]


def _to_list(order: IssueOrder) -> IssueOrderList:
    return IssueOrderList(
        id=order.id,
        work_order_number=order.work_order_number,
        date=order.date,
        notes=order.notes,
        is_confirmed=order.is_confirmed,
        is_cancelled=order.is_cancelled,
        item_count=len(order.items),
        total_qty=sum(i.quantity for i in order.items),
        created_by_name=order.created_by_user.name,
        created_at=order.created_at,
    )


def _to_out(order: IssueOrder, cancelled_by_name: str | None = None) -> IssueOrderOut:
    return IssueOrderOut(
        id=order.id,
        work_order_number=order.work_order_number,
        date=order.date,
        notes=order.notes,
        is_confirmed=order.is_confirmed,
        is_cancelled=order.is_cancelled,
        cancelled_by_name=cancelled_by_name,
        cancelled_at=order.cancelled_at,
        created_by_name=order.created_by_user.name,
        created_at=order.created_at,
        items=[
            IssueItemOut(
                id=i.id,
                part_id=i.part_id,
                part_name=i.part.name if i.part else str(i.part_id),
                quantity=i.quantity,
                notes=i.notes,
                barcode=i.part.barcodes[0].barcode if i.part and i.part.barcodes else None,
                oem_number=i.part.oem_numbers[0].oem_number if i.part and i.part.oem_numbers else None,
            )
            for i in order.items
        ],
    )


@router.get("", response_model=list[IssueOrderList])
async def list_orders(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(IssueOrder).options(*_load_opts()).order_by(IssueOrder.created_at.desc())
    )
    return [_to_list(o) for o in result.scalars().all()]


@router.get("/{order_id}", response_model=IssueOrderOut)
async def get_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(IssueOrder).options(*_load_opts()).where(IssueOrder.id == order_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Списание не найдено")
    return _to_out(order)


@router.post("", response_model=IssueOrderOut, status_code=201)
async def create_order(
    data: IssueOrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = IssueOrder(
        work_order_number=data.work_order_number,
        date=data.date or datetime.utcnow(),
        notes=data.notes,
        created_by=current_user.id,
    )
    db.add(order)
    await db.flush()

    for item_data in data.items:
        result = await db.execute(select(Part).where(Part.id == item_data.part_id))
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"Запчасть {item_data.part_id} не найдена")
        db.add(IssueItem(order_id=order.id, part_id=item_data.part_id, quantity=item_data.quantity, notes=item_data.notes))

    await db.commit()

    result = await db.execute(select(IssueOrder).options(*_load_opts()).where(IssueOrder.id == order.id))
    return _to_out(result.scalar_one())


@router.post("/{order_id}/confirm", response_model=IssueOrderOut)
async def confirm_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(IssueOrder).options(*_load_opts()).where(IssueOrder.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Списание не найдено")
    if order.is_confirmed:
        raise HTTPException(status_code=400, detail="Уже проведено")
    if order.is_cancelled:
        raise HTTPException(status_code=400, detail="Документ отменён")

    for item in order.items:
        stock_result = await db.execute(select(Stock).where(Stock.part_id == item.part_id))
        stock = stock_result.scalar_one_or_none()
        if not stock:
            stock = Stock(part_id=item.part_id, quantity=0)
            db.add(stock)
            await db.flush()

        if stock.quantity < item.quantity:
            part_result = await db.execute(select(Part).where(Part.id == item.part_id))
            part = part_result.scalar_one()
            raise HTTPException(
                status_code=400,
                detail=f"Недостаточно на складе: {part.name} — есть {stock.quantity}, нужно {item.quantity}"
            )

        qty_before = stock.quantity
        stock.quantity -= item.quantity
        stock.updated_at = datetime.utcnow()

        db.add(StockMovement(
            part_id=item.part_id,
            movement_type=MovementType.issue,
            quantity=-item.quantity,
            quantity_before=qty_before,
            quantity_after=stock.quantity,
            reference_type="issue_order",
            reference_id=order.id,
            work_order_number=order.work_order_number,
            notes=item.notes,
            created_by=current_user.id,
        ))

    order.is_confirmed = True
    await db.commit()

    result = await db.execute(select(IssueOrder).options(*_load_opts()).where(IssueOrder.id == order.id))
    return _to_out(result.scalar_one())


@router.post("/{order_id}/cancel", response_model=IssueOrderOut)
async def cancel_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Только администратор")

    result = await db.execute(select(IssueOrder).options(*_load_opts()).where(IssueOrder.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Списание не найдено")
    if not order.is_confirmed:
        raise HTTPException(status_code=400, detail="Можно отменить только проведённый документ")
    if order.is_cancelled:
        raise HTTPException(status_code=400, detail="Уже отменено")

    for item in order.items:
        stock_result = await db.execute(select(Stock).where(Stock.part_id == item.part_id))
        stock = stock_result.scalar_one_or_none()
        if stock:
            qty_before = stock.quantity
            stock.quantity += item.quantity
            stock.updated_at = datetime.utcnow()
            db.add(StockMovement(
                part_id=item.part_id,
                movement_type=MovementType.cancellation,
                quantity=item.quantity,
                quantity_before=qty_before,
                quantity_after=stock.quantity,
                reference_type="issue_order",
                reference_id=order.id,
                notes=None,
                created_by=current_user.id,
            ))

    order.is_confirmed = False
    order.is_cancelled = True
    order.cancelled_by = current_user.id
    order.cancelled_at = datetime.utcnow()
    await db.commit()

    result = await db.execute(select(IssueOrder).options(*_load_opts()).where(IssueOrder.id == order.id))
    return _to_out(result.scalar_one(), cancelled_by_name=current_user.name)


@router.delete("/{order_id}")
async def delete_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in (UserRole.admin, UserRole.warehouse):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    result = await db.execute(select(IssueOrder).where(IssueOrder.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Не найдено")
    if order.is_confirmed:
        if current_user.role != UserRole.admin:
            raise HTTPException(status_code=403, detail="Только администратор может удалить проведённое списание")
    await db.delete(order)
    await db.commit()
    return {"ok": True}
