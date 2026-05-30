from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import (
    IssueOrder, IssueItem, Part, User, Stock, StockMovement, MovementType, UserRole,
    Barcode, OemNumber, WorkOrder
)
from app.schemas import (
    IssueOrderCreate, IssueOrderOut, IssueOrderList, IssueItemOut, IssueItemCreate
)
from app.auth import get_current_user

router = APIRouter(prefix="/api/issues", tags=["issues"])


def _load_opts():
    from app.models import Mechanic
    return [
        selectinload(IssueOrder.created_by_user),
        selectinload(IssueOrder.work_order).selectinload(WorkOrder.mechanic),
        selectinload(IssueOrder.items).selectinload(IssueItem.part).selectinload(Part.barcodes),
        selectinload(IssueOrder.items).selectinload(IssueItem.part).selectinload(Part.oem_numbers),
    ]


def _mechanic_name(order: IssueOrder) -> str | None:
    if order.work_order and order.work_order.mechanic:
        return order.work_order.mechanic.name
    return None


def _to_list(order: IssueOrder) -> IssueOrderList:
    return IssueOrderList(
        id=order.id,
        work_order_id=order.work_order_id,
        work_order_number=order.work_order_number,
        mechanic_name=_mechanic_name(order),
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
        work_order_id=order.work_order_id,
        work_order_number=order.work_order_number,
        mechanic_name=_mechanic_name(order),
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
    work_order_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = select(IssueOrder).options(*_load_opts()).order_by(IssueOrder.created_at.desc())
    if work_order_id:
        stmt = stmt.where(IssueOrder.work_order_id == work_order_id)
    result = await db.execute(stmt)
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
    wo_number = data.work_order_number
    if data.work_order_id:
        wo_result = await db.execute(select(WorkOrder).where(WorkOrder.id == data.work_order_id))
        linked_wo = wo_result.scalar_one_or_none()
        if linked_wo:
            wo_number = linked_wo.work_order_number

    order = IssueOrder(
        work_order_id=data.work_order_id,
        work_order_number=wo_number,
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


@router.post("/{order_id}/items", response_model=IssueOrderOut)
async def add_item(
    order_id: int,
    item_data: IssueItemCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(IssueOrder).options(*_load_opts()).where(IssueOrder.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Списание не найдено")
    if order.is_confirmed:
        raise HTTPException(status_code=400, detail="Нельзя изменить проведённый документ")

    part_result = await db.execute(select(Part).where(Part.id == item_data.part_id))
    if not part_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Запчасть не найдена")

    db.add(IssueItem(order_id=order.id, part_id=item_data.part_id, quantity=item_data.quantity, notes=item_data.notes))
    await db.commit()

    result = await db.execute(select(IssueOrder).options(*_load_opts()).where(IssueOrder.id == order.id))
    return _to_out(result.scalar_one())


@router.patch("/{order_id}/items/{item_id}", response_model=IssueOrderOut)
async def update_item_qty(
    order_id: int,
    item_id: int,
    quantity: float,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(IssueOrder).options(*_load_opts()).where(IssueOrder.id == order_id))
    order = result.scalar_one_or_none()
    if not order or order.is_confirmed:
        raise HTTPException(status_code=400, detail="Нельзя изменить")

    item_result = await db.execute(select(IssueItem).where(IssueItem.id == item_id, IssueItem.order_id == order_id))
    item = item_result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Позиция не найдена")
    item.quantity = round(quantity, 3)
    await db.commit()

    result = await db.execute(select(IssueOrder).options(*_load_opts()).where(IssueOrder.id == order.id))
    return _to_out(result.scalar_one())


@router.delete("/{order_id}/items/{item_id}", response_model=IssueOrderOut)
async def remove_item(
    order_id: int,
    item_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(IssueOrder).options(*_load_opts()).where(IssueOrder.id == order_id))
    order = result.scalar_one_or_none()
    if not order or order.is_confirmed:
        raise HTTPException(status_code=400, detail="Нельзя изменить")

    item_result = await db.execute(select(IssueItem).where(IssueItem.id == item_id, IssueItem.order_id == order_id))
    item = item_result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Позиция не найдена")

    await db.delete(item)
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

        current_qty = round(float(stock.quantity), 3)
        need_qty = round(float(item.quantity), 3)

        # Negative stock allowed during initial setup phase
        qty_before = current_qty
        stock.quantity = round(current_qty - need_qty, 3)
        stock.updated_at = datetime.utcnow()

        db.add(StockMovement(
            part_id=item.part_id,
            movement_type=MovementType.issue,
            quantity=-need_qty,
            quantity_before=qty_before,
            quantity_after=round(float(stock.quantity), 3),
            reference_type="issue_order",
            reference_id=order.id,
            work_order_number=order.work_order_number,
            work_order_id=order.work_order_id,
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
            qty_before = round(float(stock.quantity), 3)
            stock.quantity = round(qty_before + float(item.quantity), 3)
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
