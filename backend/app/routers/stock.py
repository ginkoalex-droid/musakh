from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Stock, Part, StockMovement, MovementType, User, UserRole
from app.schemas import StockRow, StockAdjustment, IssueRequest, MovementOut
from app.auth import get_current_user


def _require_can_issue(user: User):
    if user.role == UserRole.readonly:
        raise HTTPException(status_code=403, detail="Недостаточно прав")


def _require_warehouse(user: User):
    if user.role not in (UserRole.admin, UserRole.warehouse):
        raise HTTPException(status_code=403, detail="Недостаточно прав")

router = APIRouter(prefix="/api/stock", tags=["stock"])


@router.get("", response_model=list[StockRow])
async def list_stock(
    low_only: bool = False,
    category: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = (
        select(Stock, Part)
        .join(Part, Stock.part_id == Part.id)
        .order_by(Part.name)
    )
    if category:
        stmt = stmt.where(Part.category == category)

    result = await db.execute(stmt)
    rows = result.all()

    items = [
        StockRow(
            part_id=stock.part_id,
            part_name=part.name,
            brand=part.brand,
            category=part.category,
            unit=part.unit,
            location=part.location,
            quantity=stock.quantity,
            min_stock=part.min_stock,
            is_low=(stock.quantity <= part.min_stock),
        )
        for stock, part in rows
    ]

    if low_only:
        items = [i for i in items if i.is_low]

    return items


@router.post("/adjust", response_model=MovementOut)
async def adjust_stock(
    data: StockAdjustment,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_warehouse(current_user)
    result = await db.execute(select(Stock).where(Stock.part_id == data.part_id))
    stock = result.scalar_one_or_none()

    part_result = await db.execute(select(Part).where(Part.id == data.part_id))
    part = part_result.scalar_one_or_none()
    if not part:
        raise HTTPException(status_code=404, detail="Запчасть не найдена")

    if not stock:
        stock = Stock(part_id=data.part_id, quantity=0)
        db.add(stock)
        await db.flush()

    qty_before = stock.quantity
    new_qty = data.quantity

    if new_qty < 0:
        raise HTTPException(status_code=400, detail="Количество не может быть отрицательным")

    delta = new_qty - qty_before
    stock.quantity = new_qty
    stock.updated_at = datetime.utcnow()

    movement = StockMovement(
        part_id=data.part_id,
        movement_type=MovementType.adjustment,
        quantity=delta,
        quantity_before=qty_before,
        quantity_after=new_qty,
        reference_type="manual",
        notes=data.notes,
        created_by=current_user.id,
    )
    db.add(movement)
    await db.commit()
    await db.refresh(movement)

    return MovementOut(
        id=movement.id,
        part_id=movement.part_id,
        part_name=part.name,
        movement_type=movement.movement_type,
        quantity=movement.quantity,
        quantity_before=movement.quantity_before,
        quantity_after=movement.quantity_after,
        reference_type=movement.reference_type,
        reference_id=movement.reference_id,
        work_order_number=None,
        notes=movement.notes,
        created_by_name=current_user.name,
        created_at=movement.created_at,
    )


@router.post("/issue", response_model=MovementOut)
async def issue_parts(
    data: IssueRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Write off parts to a work order."""
    _require_can_issue(current_user)
    part_result = await db.execute(select(Part).where(Part.id == data.part_id))
    part = part_result.scalar_one_or_none()
    if not part:
        raise HTTPException(status_code=404, detail="Запчасть не найдена")

    result = await db.execute(select(Stock).where(Stock.part_id == data.part_id))
    stock = result.scalar_one_or_none()
    if not stock:
        stock = Stock(part_id=data.part_id, quantity=0)
        db.add(stock)
        await db.flush()

    if stock.quantity < data.quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Недостаточно на складе: есть {stock.quantity}, запрошено {data.quantity}",
        )

    qty_before = stock.quantity
    stock.quantity -= data.quantity
    stock.updated_at = datetime.utcnow()

    movement = StockMovement(
        part_id=data.part_id,
        movement_type=MovementType.issue,
        quantity=-data.quantity,
        quantity_before=qty_before,
        quantity_after=stock.quantity,
        reference_type="work_order",
        work_order_number=data.work_order_number,
        notes=data.notes,
        created_by=current_user.id,
    )
    db.add(movement)
    await db.commit()
    await db.refresh(movement)

    return MovementOut(
        id=movement.id,
        part_id=movement.part_id,
        part_name=part.name,
        movement_type=movement.movement_type,
        quantity=movement.quantity,
        quantity_before=movement.quantity_before,
        quantity_after=movement.quantity_after,
        reference_type=movement.reference_type,
        work_order_number=movement.work_order_number,
        notes=movement.notes,
        created_by_name=current_user.name,
        created_at=movement.created_at,
    )


@router.get("/movements", response_model=list[MovementOut])
async def list_movements(
    part_id: Optional[int] = None,
    user_id: Optional[int] = None,
    from_date: Optional[str] = Query(None, description="ISO date YYYY-MM-DD"),
    to_date: Optional[str] = Query(None, description="ISO date YYYY-MM-DD"),
    movement_type: Optional[str] = None,
    limit: int = Query(200, le=1000),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = (
        select(StockMovement, Part, User)
        .join(Part, StockMovement.part_id == Part.id)
        .join(User, StockMovement.created_by == User.id)
        .order_by(desc(StockMovement.created_at))
        .limit(limit)
        .offset(offset)
    )
    if part_id:
        stmt = stmt.where(StockMovement.part_id == part_id)
    if user_id:
        stmt = stmt.where(StockMovement.created_by == user_id)
    if movement_type:
        stmt = stmt.where(StockMovement.movement_type == movement_type)
    if from_date:
        from datetime import date as ddate
        stmt = stmt.where(StockMovement.created_at >= datetime.strptime(from_date, "%Y-%m-%d"))
    if to_date:
        stmt = stmt.where(StockMovement.created_at < datetime.strptime(to_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59))

    result = await db.execute(stmt)
    rows = result.all()

    return [
        MovementOut(
            id=mv.id,
            part_id=mv.part_id,
            part_name=part.name,
            movement_type=mv.movement_type,
            quantity=mv.quantity,
            quantity_before=mv.quantity_before,
            quantity_after=mv.quantity_after,
            reference_type=mv.reference_type,
            reference_id=mv.reference_id,
            work_order_number=mv.work_order_number,
            notes=mv.notes,
            created_by_name=user.name,
            created_at=mv.created_at,
        )
        for mv, part, user in rows
    ]
