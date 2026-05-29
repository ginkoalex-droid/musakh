from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import (
    ReceivingOrder, ReceivingItem, Part, Supplier, User, Stock, StockMovement, MovementType, UserRole,
    Barcode, OemNumber
)
from app.schemas import (
    ReceivingOrderCreate, ReceivingOrderOut, ReceivingOrderList, ReceivingItemOut, ReceivingItemCreate
)
from app.auth import get_current_user

router = APIRouter(prefix="/api/receiving", tags=["receiving"])


def _order_to_list(order: ReceivingOrder) -> ReceivingOrderList:
    total_qty = sum(i.quantity for i in order.items)
    return ReceivingOrderList(
        id=order.id,
        supplier_name=order.supplier.name if order.supplier else None,
        date=order.date,
        invoice_number=order.invoice_number,
        is_confirmed=order.is_confirmed,
        is_cancelled=order.is_cancelled,
        item_count=len(order.items),
        total_qty=total_qty,
        created_by_name=order.created_by_user.name,
        created_at=order.created_at,
    )


def _order_to_out(order: ReceivingOrder) -> ReceivingOrderOut:
    items = [
        ReceivingItemOut(
            id=i.id,
            part_id=i.part_id,
            part_name=i.part.name if i.part else str(i.part_id),
            quantity=i.quantity,
            notes=i.notes,
            barcode=i.part.barcodes[0].barcode if i.part and i.part.barcodes else None,
            oem_number=i.part.oem_numbers[0].oem_number if i.part and i.part.oem_numbers else None,
        )
        for i in order.items
    ]
    # Resolve cancelled_by name
    cancelled_by_name = None
    if hasattr(order, '_cancelled_by_user') and order._cancelled_by_user:
        cancelled_by_name = order._cancelled_by_user.name
    return ReceivingOrderOut(
        id=order.id,
        supplier_id=order.supplier_id,
        supplier_name=order.supplier.name if order.supplier else None,
        date=order.date,
        invoice_number=order.invoice_number,
        notes=order.notes,
        is_confirmed=order.is_confirmed,
        is_cancelled=order.is_cancelled,
        cancelled_by_name=cancelled_by_name,
        cancelled_at=order.cancelled_at,
        created_by_name=order.created_by_user.name,
        created_at=order.created_at,
        items=items,
    )


@router.get("", response_model=list[ReceivingOrderList])
async def list_orders(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ReceivingOrder)
        .options(
            selectinload(ReceivingOrder.supplier),
            selectinload(ReceivingOrder.created_by_user),
            selectinload(ReceivingOrder.items),
        )
        .order_by(ReceivingOrder.created_at.desc())
    )
    orders = result.scalars().all()
    return [_order_to_list(o) for o in orders]


@router.get("/{order_id}", response_model=ReceivingOrderOut)
async def get_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ReceivingOrder)
        .options(
            selectinload(ReceivingOrder.supplier),
            selectinload(ReceivingOrder.created_by_user),
            selectinload(ReceivingOrder.items).selectinload(ReceivingItem.part).selectinload(Part.barcodes), selectinload(ReceivingOrder.items).selectinload(ReceivingItem.part).selectinload(Part.oem_numbers),
        )
        .where(ReceivingOrder.id == order_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Приемка не найдена")
    return _order_to_out(order)


@router.post("", response_model=ReceivingOrderOut, status_code=201)
async def create_order(
    data: ReceivingOrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = ReceivingOrder(
        supplier_id=data.supplier_id,
        date=data.date or datetime.utcnow(),
        invoice_number=data.invoice_number,
        notes=data.notes,
        created_by=current_user.id,
    )
    db.add(order)
    await db.flush()

    for item_data in data.items:
        result = await db.execute(select(Part).where(Part.id == item_data.part_id))
        part = result.scalar_one_or_none()
        if not part:
            raise HTTPException(status_code=400, detail=f"Запчасть {item_data.part_id} не найдена")
        item = ReceivingItem(
            order_id=order.id,
            part_id=item_data.part_id,
            quantity=item_data.quantity,
            notes=item_data.notes,
        )
        db.add(item)

    await db.commit()
    await db.refresh(order)

    result = await db.execute(
        select(ReceivingOrder)
        .options(
            selectinload(ReceivingOrder.supplier),
            selectinload(ReceivingOrder.created_by_user),
            selectinload(ReceivingOrder.items).selectinload(ReceivingItem.part).selectinload(Part.barcodes), selectinload(ReceivingOrder.items).selectinload(ReceivingItem.part).selectinload(Part.oem_numbers),
        )
        .where(ReceivingOrder.id == order.id)
    )
    order = result.scalar_one()
    return _order_to_out(order)


@router.post("/{order_id}/confirm", response_model=ReceivingOrderOut)
async def confirm_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Confirm receiving order: apply stock changes and create movements."""
    result = await db.execute(
        select(ReceivingOrder)
        .options(
            selectinload(ReceivingOrder.supplier),
            selectinload(ReceivingOrder.created_by_user),
            selectinload(ReceivingOrder.items).selectinload(ReceivingItem.part).selectinload(Part.barcodes), selectinload(ReceivingOrder.items).selectinload(ReceivingItem.part).selectinload(Part.oem_numbers),
        )
        .where(ReceivingOrder.id == order_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Приемка не найдена")
    if order.is_confirmed:
        raise HTTPException(status_code=400, detail="Приемка уже подтверждена")

    for item in order.items:
        stock_result = await db.execute(select(Stock).where(Stock.part_id == item.part_id))
        stock = stock_result.scalar_one_or_none()
        if not stock:
            stock = Stock(part_id=item.part_id, quantity=0)
            db.add(stock)
            await db.flush()

        qty_before = stock.quantity
        stock.quantity += item.quantity
        stock.updated_at = datetime.utcnow()

        movement = StockMovement(
            part_id=item.part_id,
            movement_type=MovementType.receiving,
            quantity=item.quantity,
            quantity_before=qty_before,
            quantity_after=stock.quantity,
            reference_type="receiving_order",
            reference_id=order.id,
            notes=order.invoice_number or None,
            created_by=current_user.id,
        )
        db.add(movement)

    order.is_confirmed = True
    await db.commit()

    result = await db.execute(
        select(ReceivingOrder)
        .options(
            selectinload(ReceivingOrder.supplier),
            selectinload(ReceivingOrder.created_by_user),
            selectinload(ReceivingOrder.items).selectinload(ReceivingItem.part).selectinload(Part.barcodes), selectinload(ReceivingOrder.items).selectinload(ReceivingItem.part).selectinload(Part.oem_numbers),
        )
        .where(ReceivingOrder.id == order.id)
    )
    order = result.scalar_one()
    return _order_to_out(order)


@router.post("/{order_id}/cancel", response_model=ReceivingOrderOut)
async def cancel_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin: cancel a confirmed order, reverse stock, log cancellation movements."""
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Только администратор может отменить проведённую приёмку")

    result = await db.execute(
        select(ReceivingOrder)
        .options(
            selectinload(ReceivingOrder.supplier),
            selectinload(ReceivingOrder.created_by_user),
            selectinload(ReceivingOrder.items).selectinload(ReceivingItem.part).selectinload(Part.barcodes), selectinload(ReceivingOrder.items).selectinload(ReceivingItem.part).selectinload(Part.oem_numbers),
        )
        .where(ReceivingOrder.id == order_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Приёмка не найдена")
    if not order.is_confirmed:
        raise HTTPException(status_code=400, detail="Можно отменить только проведённый документ")
    if order.is_cancelled:
        raise HTTPException(status_code=400, detail="Документ уже отменён")

    for item in order.items:
        stock_result = await db.execute(select(Stock).where(Stock.part_id == item.part_id))
        stock = stock_result.scalar_one_or_none()
        if stock:
            qty_before = stock.quantity
            stock.quantity = max(0, stock.quantity - item.quantity)
            stock.updated_at = datetime.utcnow()
            mv = StockMovement(
                part_id=item.part_id,
                movement_type=MovementType.cancellation,
                quantity=-item.quantity,
                quantity_before=qty_before,
                quantity_after=stock.quantity,
                reference_type="receiving_order",
                reference_id=order.id,
                notes=None,
                created_by=current_user.id,
            )
            db.add(mv)

    order.is_confirmed = False
    order.is_cancelled = True
    order.cancelled_by = current_user.id
    order.cancelled_at = datetime.utcnow()
    await db.commit()

    result = await db.execute(
        select(ReceivingOrder)
        .options(
            selectinload(ReceivingOrder.supplier),
            selectinload(ReceivingOrder.created_by_user),
            selectinload(ReceivingOrder.items).selectinload(ReceivingItem.part).selectinload(Part.barcodes), selectinload(ReceivingOrder.items).selectinload(ReceivingItem.part).selectinload(Part.oem_numbers),
        )
        .where(ReceivingOrder.id == order.id)
    )
    order = result.scalar_one()
    out = _order_to_out(order)
    return out


@router.post("/{order_id}/reopen", response_model=ReceivingOrderOut)
async def reopen_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin: reopen a cancelled order back to draft for editing."""
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Только администратор")

    result = await db.execute(
        select(ReceivingOrder)
        .options(
            selectinload(ReceivingOrder.supplier),
            selectinload(ReceivingOrder.created_by_user),
            selectinload(ReceivingOrder.items).selectinload(ReceivingItem.part).selectinload(Part.barcodes), selectinload(ReceivingOrder.items).selectinload(ReceivingItem.part).selectinload(Part.oem_numbers),
        )
        .where(ReceivingOrder.id == order_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Приёмка не найдена")
    if not order.is_cancelled:
        raise HTTPException(status_code=400, detail="Документ не отменён")

    order.is_cancelled = False
    order.cancelled_by = None
    order.cancelled_at = None
    await db.commit()

    result = await db.execute(
        select(ReceivingOrder)
        .options(
            selectinload(ReceivingOrder.supplier),
            selectinload(ReceivingOrder.created_by_user),
            selectinload(ReceivingOrder.items).selectinload(ReceivingItem.part).selectinload(Part.barcodes), selectinload(ReceivingOrder.items).selectinload(ReceivingItem.part).selectinload(Part.oem_numbers),
        )
        .where(ReceivingOrder.id == order.id)
    )
    order = result.scalar_one()
    return _order_to_out(order)


@router.put("/{order_id}/items", response_model=ReceivingOrderOut)
async def update_order_items(
    order_id: int,
    items: list[ReceivingItemCreate],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin: replace items on a draft/cancelled order."""
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Только администратор")

    result = await db.execute(
        select(ReceivingOrder)
        .options(
            selectinload(ReceivingOrder.supplier),
            selectinload(ReceivingOrder.created_by_user),
            selectinload(ReceivingOrder.items).selectinload(ReceivingItem.part).selectinload(Part.barcodes), selectinload(ReceivingOrder.items).selectinload(ReceivingItem.part).selectinload(Part.oem_numbers),
        )
        .where(ReceivingOrder.id == order_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Приёмка не найдена")
    if order.is_confirmed:
        raise HTTPException(status_code=400, detail="Сначала отмените проведённый документ")

    # Delete existing items
    for item in order.items:
        await db.delete(item)
    await db.flush()

    # Add new items
    for item_data in items:
        db.add(ReceivingItem(
            order_id=order.id,
            part_id=item_data.part_id,
            quantity=item_data.quantity,
            notes=item_data.notes,
        ))

    await db.commit()

    result = await db.execute(
        select(ReceivingOrder)
        .options(
            selectinload(ReceivingOrder.supplier),
            selectinload(ReceivingOrder.created_by_user),
            selectinload(ReceivingOrder.items).selectinload(ReceivingItem.part).selectinload(Part.barcodes), selectinload(ReceivingOrder.items).selectinload(ReceivingItem.part).selectinload(Part.oem_numbers),
        )
        .where(ReceivingOrder.id == order.id)
    )
    order = result.scalar_one()
    return _order_to_out(order)


@router.delete("/{order_id}")
async def delete_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models import UserRole
    result = await db.execute(select(ReceivingOrder).where(ReceivingOrder.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Приемка не найдена")
    if current_user.role not in (UserRole.admin, UserRole.warehouse):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    if order.is_confirmed:
        if current_user.role != UserRole.admin:
            raise HTTPException(status_code=403, detail="Только администратор может удалить проведённую приемку")
        # Admin reverses stock movements
        movements_result = await db.execute(
            select(StockMovement).where(
                StockMovement.reference_type == "receiving_order",
                StockMovement.reference_id == order_id
            )
        )
        movements = movements_result.scalars().all()
        for mv in movements:
            stock_result = await db.execute(select(Stock).where(Stock.part_id == mv.part_id))
            stock = stock_result.scalar_one_or_none()
            if stock:
                stock.quantity = max(0, stock.quantity - mv.quantity)
            await db.delete(mv)
    await db.delete(order)
    await db.commit()
    return {"ok": True}
