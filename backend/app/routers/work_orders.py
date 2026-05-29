from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Mechanic, WorkOrder, User, UserRole
from app.schemas import (
    MechanicCreate, MechanicOut,
    WorkOrderCreate, WorkOrderOut, MechanicSummary
)
from app.auth import get_current_user

router = APIRouter(tags=["work_orders"])


# ── Mechanics ──────────────────────────────────────────────────────────────────

@router.get("/api/mechanics", response_model=list[MechanicOut])
async def list_mechanics(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Mechanic).order_by(Mechanic.name))
    return result.scalars().all()


@router.post("/api/mechanics", response_model=MechanicOut, status_code=201)
async def create_mechanic(
    data: MechanicCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    m = Mechanic(**data.model_dump())
    db.add(m)
    await db.commit()
    await db.refresh(m)
    return m


@router.put("/api/mechanics/{mechanic_id}", response_model=MechanicOut)
async def update_mechanic(
    mechanic_id: int,
    data: MechanicCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Mechanic).where(Mechanic.id == mechanic_id))
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Механик не найден")
    for k, v in data.model_dump().items():
        setattr(m, k, v)
    await db.commit()
    await db.refresh(m)
    return m


@router.patch("/api/mechanics/{mechanic_id}/toggle", response_model=MechanicOut)
async def toggle_mechanic(
    mechanic_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Mechanic).where(Mechanic.id == mechanic_id))
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Механик не найден")
    m.is_active = not m.is_active
    await db.commit()
    await db.refresh(m)
    return m


# ── Work Orders ────────────────────────────────────────────────────────────────

def _wo_to_out(wo: WorkOrder) -> WorkOrderOut:
    return WorkOrderOut(
        id=wo.id,
        work_order_number=wo.work_order_number,
        mechanic_id=wo.mechanic_id,
        mechanic_name=wo.mechanic.name,
        date=wo.date,
        car_plate=wo.car_plate,
        car_make=wo.car_make,
        car_model=wo.car_model,
        notes=wo.notes,
        is_confirmed=wo.is_confirmed,
        created_by_name=wo.created_by_user.name,
        created_at=wo.created_at,
    )


def _load_opts():
    return [
        selectinload(WorkOrder.mechanic),
        selectinload(WorkOrder.created_by_user),
    ]


@router.get("/api/work-orders", response_model=list[WorkOrderOut])
async def list_work_orders(
    mechanic_id: Optional[int] = None,
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    confirmed_only: bool = False,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = (
        select(WorkOrder)
        .options(*_load_opts())
        .order_by(desc(WorkOrder.date))
    )
    if mechanic_id:
        stmt = stmt.where(WorkOrder.mechanic_id == mechanic_id)
    if from_date:
        stmt = stmt.where(WorkOrder.date >= datetime.strptime(from_date, "%Y-%m-%d"))
    if to_date:
        stmt = stmt.where(WorkOrder.date <= datetime.strptime(to_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59))
    if confirmed_only:
        stmt = stmt.where(WorkOrder.is_confirmed == True)

    result = await db.execute(stmt)
    return [_wo_to_out(wo) for wo in result.scalars().all()]


@router.get("/api/work-orders/summary", response_model=list[MechanicSummary])
async def work_orders_summary(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = (
        select(
            WorkOrder.mechanic_id,
            Mechanic.name,
            func.count(WorkOrder.id).label("total"),
            func.sum(func.cast(WorkOrder.is_confirmed, func.Integer if False else None)).label("confirmed"),
        )
        .join(Mechanic, WorkOrder.mechanic_id == Mechanic.id)
        .group_by(WorkOrder.mechanic_id, Mechanic.name)
        .order_by(Mechanic.name)
    )
    if from_date:
        stmt = stmt.where(WorkOrder.date >= datetime.strptime(from_date, "%Y-%m-%d"))
    if to_date:
        stmt = stmt.where(WorkOrder.date <= datetime.strptime(to_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59))

    result = await db.execute(stmt)
    rows = result.all()
    return [
        MechanicSummary(
            mechanic_id=r[0],
            mechanic_name=r[1],
            total=r[2],
            confirmed=r[3] or 0,
        )
        for r in rows
    ]


@router.get("/api/work-orders/{wo_id}", response_model=WorkOrderOut)
async def get_work_order(
    wo_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(WorkOrder).options(*_load_opts()).where(WorkOrder.id == wo_id))
    wo = result.scalar_one_or_none()
    if not wo:
        raise HTTPException(status_code=404, detail="ЗН не найден")
    return _wo_to_out(wo)


@router.post("/api/work-orders", response_model=WorkOrderOut, status_code=201)
async def create_work_order(
    data: WorkOrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Mechanic).where(Mechanic.id == data.mechanic_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Механик не найден")

    wo = WorkOrder(
        work_order_number=data.work_order_number,
        mechanic_id=data.mechanic_id,
        date=data.date or datetime.utcnow(),
        car_plate=data.car_plate,
        car_make=data.car_make,
        car_model=data.car_model,
        notes=data.notes,
        created_by=current_user.id,
    )
    db.add(wo)
    await db.commit()
    await db.refresh(wo)
    result = await db.execute(select(WorkOrder).options(*_load_opts()).where(WorkOrder.id == wo.id))
    return _wo_to_out(result.scalar_one())


@router.post("/api/work-orders/{wo_id}/confirm", response_model=WorkOrderOut)
async def confirm_work_order(
    wo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(WorkOrder).options(*_load_opts()).where(WorkOrder.id == wo_id))
    wo = result.scalar_one_or_none()
    if not wo:
        raise HTTPException(status_code=404, detail="ЗН не найден")
    if wo.is_confirmed:
        raise HTTPException(status_code=400, detail="Уже проведён")
    wo.is_confirmed = True
    await db.commit()
    result = await db.execute(select(WorkOrder).options(*_load_opts()).where(WorkOrder.id == wo.id))
    return _wo_to_out(result.scalar_one())


@router.put("/api/work-orders/{wo_id}", response_model=WorkOrderOut)
async def update_work_order(
    wo_id: int,
    data: WorkOrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(WorkOrder).options(*_load_opts()).where(WorkOrder.id == wo_id))
    wo = result.scalar_one_or_none()
    if not wo:
        raise HTTPException(status_code=404, detail="ЗН не найден")
    if wo.is_confirmed and current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Только администратор может изменить проведённый ЗН")
    for k, v in data.model_dump().items():
        if v is not None:
            setattr(wo, k, v)
    await db.commit()
    result = await db.execute(select(WorkOrder).options(*_load_opts()).where(WorkOrder.id == wo.id))
    return _wo_to_out(result.scalar_one())


@router.delete("/api/work-orders/{wo_id}")
async def delete_work_order(
    wo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(WorkOrder).where(WorkOrder.id == wo_id))
    wo = result.scalar_one_or_none()
    if not wo:
        raise HTTPException(status_code=404, detail="ЗН не найден")
    if wo.is_confirmed and current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Только администратор")
    await db.delete(wo)
    await db.commit()
    return {"ok": True}
