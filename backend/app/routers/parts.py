from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Part, Barcode, OemNumber, CarApplication, Stock, User
from app.schemas import PartCreate, PartUpdate, PartOut, PartListItem
from app.auth import get_current_user

router = APIRouter(prefix="/api/parts", tags=["parts"])


def _build_part_list_item(part: Part) -> PartListItem:
    qty = part.stock.quantity if part.stock else 0
    return PartListItem(
        id=part.id,
        name=part.name,
        brand=part.brand,
        category=part.category,
        unit=part.unit,
        location=part.location,
        min_stock=part.min_stock,
        stock_qty=qty,
        barcodes=part.barcodes,
        oem_numbers=part.oem_numbers,
        car_applications=part.car_applications,
    )


@router.get("", response_model=list[PartListItem])
async def list_parts(
    q: Optional[str] = Query(None),
    category: Optional[str] = None,
    make: Optional[str] = None,
    model: Optional[str] = None,
    low_stock: bool = False,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = (
        select(Part)
        .options(
            selectinload(Part.barcodes),
            selectinload(Part.oem_numbers),
            selectinload(Part.car_applications),
            selectinload(Part.stock),
        )
        .order_by(Part.name)
    )

    if q:
        q_like = f"%{q}%"
        stmt = stmt.where(
            or_(
                Part.name.ilike(q_like),
                Part.brand.ilike(q_like),
                Part.barcodes.any(Barcode.barcode.ilike(q_like)),
                Part.oem_numbers.any(OemNumber.oem_number.ilike(q_like)),
            )
        )

    if category:
        stmt = stmt.where(Part.category == category)

    if make:
        stmt = stmt.where(Part.car_applications.any(CarApplication.make.ilike(make)))

    if model:
        stmt = stmt.where(Part.car_applications.any(CarApplication.model.ilike(model)))

    result = await db.execute(stmt)
    parts = result.scalars().all()

    items = [_build_part_list_item(p) for p in parts]

    if low_stock:
        items = [i for i in items if i.stock_qty <= i.min_stock]

    return items


@router.get("/makes", response_model=list[str])
async def list_makes(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CarApplication.make).distinct().order_by(CarApplication.make)
    )
    return [row[0] for row in result.all()]


@router.get("/makes/{make}/models", response_model=list[str])
async def list_models_for_make(
    make: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CarApplication.model)
        .where(CarApplication.make.ilike(make), CarApplication.model.isnot(None))
        .distinct()
        .order_by(CarApplication.model)
    )
    return [row[0] for row in result.all()]


@router.get("/categories", response_model=list[str])
async def list_categories(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Part.category).where(Part.category.isnot(None)).distinct().order_by(Part.category)
    )
    return [row[0] for row in result.all()]


@router.get("/by-barcode/{barcode}", response_model=PartListItem)
async def get_by_barcode(
    barcode: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Barcode)
        .options(
            selectinload(Barcode.part).options(
                selectinload(Part.barcodes),
                selectinload(Part.oem_numbers),
                selectinload(Part.stock),
            )
        )
        .where(Barcode.barcode == barcode)
    )
    bc = result.scalar_one_or_none()
    if not bc:
        raise HTTPException(status_code=404, detail=f"Штрихкод {barcode} не найден")
    return _build_part_list_item(bc.part)


@router.get("/{part_id}", response_model=PartOut)
async def get_part(
    part_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Part)
        .options(
            selectinload(Part.barcodes),
            selectinload(Part.oem_numbers),
            selectinload(Part.car_applications),
            selectinload(Part.stock),
        )
        .where(Part.id == part_id)
    )
    part = result.scalar_one_or_none()
    if not part:
        raise HTTPException(status_code=404, detail="Запчасть не найдена")
    qty = part.stock.quantity if part.stock else 0
    out = PartOut.model_validate(part)
    out.stock_qty = qty
    return out


@router.post("", response_model=PartOut, status_code=201)
async def create_part(
    data: PartCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models import UserRole
    if current_user.role not in (UserRole.admin, UserRole.warehouse):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    part = Part(
        name=data.name,
        brand=data.brand,
        category=data.category,
        unit=data.unit,
        min_stock=data.min_stock,
        location=data.location,
        notes=data.notes,
    )
    db.add(part)
    await db.flush()

    for i, bc in enumerate(data.barcodes):
        if bc.strip():
            db.add(Barcode(part_id=part.id, barcode=bc.strip(), is_primary=(i == 0)))

    for oem in data.oem_numbers:
        db.add(OemNumber(part_id=part.id, oem_number=oem.get("oem_number", ""), brand=oem.get("brand")))

    stock = Stock(part_id=part.id, quantity=0)
    db.add(stock)

    await db.commit()
    await db.refresh(part)

    result = await db.execute(
        select(Part)
        .options(
            selectinload(Part.barcodes),
            selectinload(Part.oem_numbers),
            selectinload(Part.car_applications),
            selectinload(Part.stock),
        )
        .where(Part.id == part.id)
    )
    part = result.scalar_one()
    qty = part.stock.quantity if part.stock else 0
    out = PartOut.model_validate(part)
    out.stock_qty = qty
    return out


@router.put("/{part_id}", response_model=PartOut)
async def update_part(
    part_id: int,
    data: PartUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models import UserRole
    if current_user.role not in (UserRole.admin, UserRole.warehouse):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    result = await db.execute(select(Part).where(Part.id == part_id))
    part = result.scalar_one_or_none()
    if not part:
        raise HTTPException(status_code=404, detail="Запчасть не найдена")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(part, field, value)

    await db.commit()
    await db.refresh(part)

    result = await db.execute(
        select(Part)
        .options(
            selectinload(Part.barcodes),
            selectinload(Part.oem_numbers),
            selectinload(Part.car_applications),
            selectinload(Part.stock),
        )
        .where(Part.id == part.id)
    )
    part = result.scalar_one()
    qty = part.stock.quantity if part.stock else 0
    out = PartOut.model_validate(part)
    out.stock_qty = qty
    return out


@router.post("/{part_id}/barcodes", response_model=list)
async def add_barcode(
    part_id: int,
    barcode: str,
    is_primary: bool = False,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Barcode).where(Barcode.barcode == barcode))
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail=f"Штрихкод {barcode} уже привязан к другой позиции")
    db.add(Barcode(part_id=part_id, barcode=barcode, is_primary=is_primary))
    await db.commit()
    result = await db.execute(select(Barcode).where(Barcode.part_id == part_id))
    return result.scalars().all()


@router.delete("/{part_id}/barcodes/{barcode_id}")
async def delete_barcode(
    part_id: int,
    barcode_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Barcode).where(Barcode.id == barcode_id, Barcode.part_id == part_id))
    bc = result.scalar_one_or_none()
    if not bc:
        raise HTTPException(status_code=404, detail="Штрихкод не найден")
    await db.delete(bc)
    await db.commit()
    return {"ok": True}


@router.post("/{part_id}/oem", response_model=list)
async def add_oem(
    part_id: int,
    oem_number: str,
    brand: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    db.add(OemNumber(part_id=part_id, oem_number=oem_number, brand=brand))
    await db.commit()
    result = await db.execute(select(OemNumber).where(OemNumber.part_id == part_id))
    return result.scalars().all()


@router.delete("/{part_id}/oem/{oem_id}")
async def delete_oem(
    part_id: int,
    oem_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(OemNumber).where(OemNumber.id == oem_id, OemNumber.part_id == part_id))
    oem = result.scalar_one_or_none()
    if not oem:
        raise HTTPException(status_code=404, detail="OEM номер не найден")
    await db.delete(oem)
    await db.commit()
    return {"ok": True}


@router.post("/{part_id}/cars", response_model=list)
async def add_car_application(
    part_id: int,
    make: str,
    model: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    db.add(CarApplication(part_id=part_id, make=make.strip(), model=model.strip() if model else None))
    await db.commit()
    result = await db.execute(select(CarApplication).where(CarApplication.part_id == part_id))
    return result.scalars().all()


@router.delete("/{part_id}/cars/{car_id}")
async def delete_car_application(
    part_id: int,
    car_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CarApplication).where(CarApplication.id == car_id, CarApplication.part_id == part_id)
    )
    car = result.scalar_one_or_none()
    if not car:
        raise HTTPException(status_code=404, detail="Применимость не найдена")
    await db.delete(car)
    await db.commit()
    return {"ok": True}
