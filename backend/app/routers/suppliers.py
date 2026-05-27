from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import Supplier, User
from app.schemas import SupplierCreate, SupplierOut
from app.auth import get_current_user

router = APIRouter(prefix="/api/suppliers", tags=["suppliers"])


@router.get("", response_model=list[SupplierOut])
async def list_suppliers(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Supplier).order_by(Supplier.name))
    return result.scalars().all()


@router.get("/{supplier_id}", response_model=SupplierOut)
async def get_supplier(
    supplier_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Supplier).where(Supplier.id == supplier_id))
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Поставщик не найден")
    return s


@router.post("", response_model=SupplierOut, status_code=201)
async def create_supplier(
    data: SupplierCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    s = Supplier(**data.model_dump())
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return s


@router.put("/{supplier_id}", response_model=SupplierOut)
async def update_supplier(
    supplier_id: int,
    data: SupplierCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Supplier).where(Supplier.id == supplier_id))
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Поставщик не найден")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(s, field, value)
    await db.commit()
    await db.refresh(s)
    return s


@router.delete("/{supplier_id}")
async def delete_supplier(
    supplier_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Supplier).where(Supplier.id == supplier_id))
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Поставщик не найден")
    await db.delete(s)
    await db.commit()
    return {"ok": True}
