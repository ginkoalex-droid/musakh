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
        work_type=wo.work_type,
        mechanic_id=wo.mechanic_id,
        mechanic_name=wo.mechanic.name,
        mechanic_id_2=wo.mechanic_id_2,
        mechanic2_name=wo.mechanic2.name if wo.mechanic2 else None,
        mechanic_share=wo.mechanic_share,
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
        selectinload(WorkOrder.mechanic2),
        selectinload(WorkOrder.created_by_user),
    ]


@router.get("/api/work-orders", response_model=list[WorkOrderOut])
async def list_work_orders(
    mechanic_id: Optional[int] = None,
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    confirmed_only: bool = False,
    open_only: bool = False,
    work_type: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
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
    if open_only:
        stmt = stmt.where(WorkOrder.is_confirmed == False)
    if work_type:
        stmt = stmt.where(WorkOrder.work_type == work_type)
    if q:
        q_like = f"%{q}%"
        from sqlalchemy import or_
        stmt = stmt.where(or_(
            WorkOrder.work_order_number.ilike(q_like),
            WorkOrder.car_plate.ilike(q_like),
            WorkOrder.car_make.ilike(q_like),
            WorkOrder.car_model.ilike(q_like),
        ))

    result = await db.execute(stmt)
    return [_wo_to_out(wo) for wo in result.scalars().all()]


@router.get("/api/work-orders/summary", response_model=list[MechanicSummary])
async def work_orders_summary(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Compute mechanic summary with fractional shares for split jobs."""
    stmt = select(WorkOrder).options(*_load_opts())
    if from_date:
        stmt = stmt.where(WorkOrder.date >= datetime.strptime(from_date, "%Y-%m-%d"))
    if to_date:
        stmt = stmt.where(WorkOrder.date <= datetime.strptime(to_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59))

    result = await db.execute(stmt)
    orders = result.scalars().all()

    # Aggregate: mechanic_id → {name, total, confirmed}
    totals: dict[int, dict] = {}

    for wo in orders:
        share1 = wo.mechanic_share / 100.0
        share2 = 1.0 - share1

        def add(mech_id: int, name: str, share: float, confirmed: bool):
            if mech_id not in totals:
                totals[mech_id] = {"name": name, "total": 0.0, "confirmed": 0.0}
            totals[mech_id]["total"] += share
            if confirmed:
                totals[mech_id]["confirmed"] += share

        add(wo.mechanic_id, wo.mechanic.name, share1, wo.is_confirmed)
        if wo.mechanic_id_2 and wo.mechanic2:
            add(wo.mechanic_id_2, wo.mechanic2.name, share2, wo.is_confirmed)

    return [
        MechanicSummary(
            mechanic_id=mid,
            mechanic_name=data["name"],
            total=round(data["total"], 2),
            confirmed=round(data["confirmed"], 2),
        )
        for mid, data in sorted(totals.items(), key=lambda x: x[1]["name"])
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
        work_type=data.work_type,
        mechanic_id=data.mechanic_id,
        mechanic_id_2=data.mechanic_id_2,
        mechanic_share=data.mechanic_share,
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

    # Auto-confirm all draft issue orders linked to this WO
    from app.models import IssueOrder, IssueItem, Stock, StockMovement, MovementType
    from sqlalchemy.orm import selectinload as _sl
    issues_result = await db.execute(
        select(IssueOrder)
        .options(_sl(IssueOrder.items).selectinload(IssueItem.part))
        .where(
            IssueOrder.work_order_id == wo_id,
            IssueOrder.is_confirmed == False,
            IssueOrder.is_cancelled == False,
        )
    )
    draft_issues = issues_result.scalars().all()

    for issue in draft_issues:
        for item in issue.items:
            stock_result = await db.execute(select(Stock).where(Stock.part_id == item.part_id))
            stock = stock_result.scalar_one_or_none()
            if not stock:
                stock = Stock(part_id=item.part_id, quantity=0)
                db.add(stock)
                await db.flush()

            qty_before = round(float(stock.quantity), 3)
            need_qty = round(float(item.quantity), 3)
            stock.quantity = round(qty_before - need_qty, 3)
            stock.updated_at = datetime.utcnow()

            db.add(StockMovement(
                part_id=item.part_id,
                movement_type=MovementType.issue,
                quantity=-need_qty,
                quantity_before=qty_before,
                quantity_after=round(float(stock.quantity), 3),
                reference_type="issue_order",
                reference_id=issue.id,
                work_order_number=issue.work_order_number,
                work_order_id=wo_id,
                notes=item.notes,
                created_by=current_user.id,
            ))

        issue.is_confirmed = True

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
    # Allow updating mechanic assignments even on confirmed WOs (warehouse+admin)
    if current_user.role not in (UserRole.admin, UserRole.warehouse):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
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

    # Block deletion if issue orders are linked
    from app.models import IssueOrder
    from sqlalchemy import func
    count_result = await db.execute(
        select(func.count()).where(IssueOrder.work_order_id == wo_id)
    )
    linked_count = count_result.scalar()
    if linked_count:
        raise HTTPException(
            status_code=400,
            detail=f"Нельзя удалить ЗН: к нему привязано {linked_count} списаний. Сначала удалите или отвяжите списания."
        )

    await db.delete(wo)
    await db.commit()
    return {"ok": True}
