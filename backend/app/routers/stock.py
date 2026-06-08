from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, or_
from sqlalchemy.orm import selectinload, outerjoin
from app.database import get_db
from app.models import Stock, Part, StockMovement, MovementType, User, UserRole, Barcode, OemNumber, CarApplication
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
    car_model: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    from app.models import CarApplication
    stmt = (
        select(Part)
        .options(
            selectinload(Part.stock),
            selectinload(Part.barcodes),
            selectinload(Part.oem_numbers),
            selectinload(Part.car_applications),
        )
        .join(Stock, Part.id == Stock.part_id)
        .order_by(Part.name)
    )
    if category:
        stmt = stmt.where(Part.category == category)
    if car_model:
        stmt = stmt.where(
            Part.car_applications.any(CarApplication.model.ilike(f"%{car_model}%"))
        )

    result = await db.execute(stmt)
    parts = result.scalars().all()

    items = []
    for part in parts:
        stock = part.stock
        if not stock:
            continue
        qty = stock.quantity
        is_low = part.track_min_stock and qty <= part.min_stock
        items.append(StockRow(
            part_id=part.id,
            part_name=part.name,
            part_brand=part.brand,
            part_unit=part.unit,
            brand=part.brand,
            category=part.category,
            unit=part.unit,
            location=part.location,
            quantity=qty,
            min_stock=part.min_stock,
            track_min_stock=part.track_min_stock,
            is_low=bool(is_low),
            first_oem=part.oem_numbers[0].oem_number if part.oem_numbers else None,
            first_barcode=part.barcodes[0].barcode if part.barcodes else None,
            car_labels=[
                f"{c.make}{' ' + c.model if c.model else ''}"
                for c in part.car_applications
            ],
            in_catalog_only=False,
        ))

    if low_only:
        items = [i for i in items if i.is_low]

    return items


@router.get("/search", response_model=list[StockRow])
async def unified_search(
    q: str = Query("", min_length=0),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Search parts across both stock and catalog. Parts without stock entries are included."""
    if not q.strip():
        return []
    qlike = f"%{q.strip().lower()}%"

    # Search in parts + their barcodes/OEM numbers/car applications
    stmt = (
        select(Part)
        .outerjoin(Part.barcodes)
        .outerjoin(Part.oem_numbers)
        .outerjoin(Part.car_applications)
        .options(
            selectinload(Part.stock),
            selectinload(Part.barcodes),
            selectinload(Part.oem_numbers),
            selectinload(Part.car_applications),
        )
        .where(
            or_(
                Part.name.ilike(qlike),
                Part.brand.ilike(qlike),
                Part.category.ilike(qlike),
                Barcode.barcode.ilike(qlike),
                OemNumber.oem_number.ilike(qlike),
                CarApplication.model.ilike(qlike),  # search by car model applicability
            )
        )
        .distinct()
        .order_by(Part.name)
    )
    result = await db.execute(stmt)
    parts = result.scalars().all()

    items = []
    for part in parts:
        stock = part.stock
        qty = float(stock.quantity) if stock else 0.0
        is_low = part.track_min_stock and qty <= part.min_stock
        items.append(StockRow(
            part_id=part.id,
            part_name=part.name,
            part_brand=part.brand,
            part_unit=part.unit,
            brand=part.brand,
            category=part.category,
            unit=part.unit,
            location=part.location,
            quantity=qty,
            min_stock=part.min_stock,
            track_min_stock=part.track_min_stock,
            is_low=bool(is_low),
            first_oem=part.oem_numbers[0].oem_number if part.oem_numbers else None,
            first_barcode=part.barcodes[0].barcode if part.barcodes else None,
            car_labels=[
                f"{c.make}{' ' + c.model if c.model else ''}"
                for c in part.car_applications
            ],
            in_catalog_only=(stock is None),
        ))
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

    qty_before = round(float(stock.quantity), 3)
    new_qty = round(float(data.quantity), 3)

    if new_qty < 0:
        raise HTTPException(status_code=400, detail="Количество не может быть отрицательным")

    delta = round(new_qty - qty_before, 3)
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
            part_brand=part.brand,
            part_unit=part.unit,
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

    current_qty = round(float(stock.quantity), 3)
    issue_qty = round(float(data.quantity), 3)

    # Negative stock allowed during initial setup phase
    qty_before = current_qty
    stock.quantity = round(current_qty - issue_qty, 3)
    stock.updated_at = datetime.utcnow()

    movement = StockMovement(
        part_id=data.part_id,
        movement_type=MovementType.issue,
        quantity=-data.quantity,
        quantity_before=qty_before,
        quantity_after=round(float(stock.quantity), 3),
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
            part_brand=part.brand,
            part_unit=part.unit,
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
    limit: int = Query(500, le=5000),
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
            part_brand=part.brand,
            part_category=part.category,
            part_unit=part.unit,
            movement_type=mv.movement_type,
            quantity=mv.quantity,
            quantity_before=mv.quantity_before,
            quantity_after=mv.quantity_after,
            reference_type=mv.reference_type,
            reference_id=mv.reference_id,
            work_order_number=mv.work_order_number,
            work_order_id=getattr(mv, 'work_order_id', None),
            notes=mv.notes,
            created_by_name=user.name,
            created_at=mv.created_at,
        )
        for mv, part, user in rows
    ]
