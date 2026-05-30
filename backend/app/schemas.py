from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr

from app.models import UserRole, MovementType


# ── Auth ──────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


# ── Users ─────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str = ""
    role: UserRole = UserRole.warehouse


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: UserRole
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Parts ─────────────────────────────────────────────────────────────────────

class BarcodeOut(BaseModel):
    id: int
    barcode: str
    is_primary: bool

    model_config = {"from_attributes": True}


class OemOut(BaseModel):
    id: int
    oem_number: str
    brand: Optional[str] = None

    model_config = {"from_attributes": True}


class CarApplicationOut(BaseModel):
    id: int
    make: str
    model: Optional[str] = None

    model_config = {"from_attributes": True}


class PartBase(BaseModel):
    name: str
    brand: Optional[str] = None
    category: Optional[str] = None
    unit: str = "шт"
    min_stock: int = 0
    track_min_stock: bool = False
    location: Optional[str] = None
    notes: Optional[str] = None


class PartCreate(PartBase):
    barcodes: list[str] = []
    oem_numbers: list[dict] = []


class PartUpdate(PartBase):
    pass


class PartOut(PartBase):
    id: int
    barcodes: list[BarcodeOut] = []
    oem_numbers: list[OemOut] = []
    car_applications: list[CarApplicationOut] = []
    stock_qty: Optional[int] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PartListItem(BaseModel):
    id: int
    name: str
    brand: Optional[str] = None
    category: Optional[str] = None
    unit: str
    location: Optional[str] = None
    min_stock: int
    stock_qty: int = 0
    barcodes: list[BarcodeOut] = []
    oem_numbers: list[OemOut] = []
    car_applications: list[CarApplicationOut] = []

    model_config = {"from_attributes": True}


# ── Suppliers ─────────────────────────────────────────────────────────────────

class SupplierCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    contact_name: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None


class SupplierOut(SupplierCreate):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Receiving ─────────────────────────────────────────────────────────────────

class ReceivingItemCreate(BaseModel):
    part_id: int
    quantity: int
    notes: Optional[str] = None


class ReceivingItemOut(BaseModel):
    id: int
    part_id: int
    part_name: str
    quantity: int
    notes: Optional[str] = None
    barcode: Optional[str] = None
    oem_number: Optional[str] = None

    model_config = {"from_attributes": True}


class ReceivingOrderCreate(BaseModel):
    supplier_id: Optional[int] = None
    date: Optional[datetime] = None
    invoice_number: Optional[str] = None
    notes: Optional[str] = None
    items: list[ReceivingItemCreate] = []


class ReceivingOrderOut(BaseModel):
    id: int
    supplier_id: Optional[int] = None
    supplier_name: Optional[str] = None
    date: datetime
    invoice_number: Optional[str] = None
    notes: Optional[str] = None
    is_confirmed: bool
    is_cancelled: bool = False
    cancelled_by_name: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    created_by_name: str
    created_at: datetime
    items: list[ReceivingItemOut] = []

    model_config = {"from_attributes": True}


class ReceivingOrderList(BaseModel):
    id: int
    supplier_name: Optional[str] = None
    date: datetime
    invoice_number: Optional[str] = None
    is_confirmed: bool
    is_cancelled: bool = False
    item_count: int = 0
    total_qty: int = 0
    created_by_name: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Mechanics ─────────────────────────────────────────────────────────────────

class MechanicCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    notes: Optional[str] = None


class MechanicOut(MechanicCreate):
    id: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Work Orders ────────────────────────────────────────────────────────────────

class WorkOrderCreate(BaseModel):
    work_order_number: str
    mechanic_id: int
    date: Optional[datetime] = None
    car_plate: Optional[str] = None
    car_make: Optional[str] = None
    car_model: Optional[str] = None
    notes: Optional[str] = None


class WorkOrderOut(BaseModel):
    id: int
    work_order_number: str
    mechanic_id: int
    mechanic_name: str
    date: datetime
    car_plate: Optional[str] = None
    car_make: Optional[str] = None
    car_model: Optional[str] = None
    notes: Optional[str] = None
    is_confirmed: bool
    created_by_name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class MechanicSummary(BaseModel):
    mechanic_id: int
    mechanic_name: str
    total: int
    confirmed: int


# ── Issue Orders ──────────────────────────────────────────────────────────────

class IssueItemCreate(BaseModel):
    part_id: int
    quantity: int
    notes: Optional[str] = None


class IssueItemOut(BaseModel):
    id: int
    part_id: int
    part_name: str
    quantity: int
    notes: Optional[str] = None
    barcode: Optional[str] = None
    oem_number: Optional[str] = None

    model_config = {"from_attributes": True}


class IssueOrderCreate(BaseModel):
    work_order_id: Optional[int] = None
    work_order_number: str
    date: Optional[datetime] = None
    notes: Optional[str] = None
    items: list[IssueItemCreate] = []


class IssueOrderOut(BaseModel):
    id: int
    work_order_id: Optional[int] = None
    work_order_number: str
    mechanic_name: Optional[str] = None
    date: datetime
    notes: Optional[str] = None
    is_confirmed: bool
    is_cancelled: bool = False
    cancelled_by_name: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    created_by_name: str
    created_at: datetime
    items: list[IssueItemOut] = []

    model_config = {"from_attributes": True}


class IssueOrderList(BaseModel):
    id: int
    work_order_id: Optional[int] = None
    work_order_number: str
    mechanic_name: Optional[str] = None
    date: datetime
    notes: Optional[str] = None
    is_confirmed: bool
    is_cancelled: bool = False
    item_count: int = 0
    total_qty: int = 0
    created_by_name: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Stock ─────────────────────────────────────────────────────────────────────

class StockRow(BaseModel):
    part_id: int
    part_name: str
    brand: Optional[str] = None
    category: Optional[str] = None
    unit: str
    location: Optional[str] = None
    quantity: int
    min_stock: int
    track_min_stock: bool = False
    is_low: bool
    first_oem: Optional[str] = None
    first_barcode: Optional[str] = None
    car_labels: list[str] = []

    model_config = {"from_attributes": True}


class StockAdjustment(BaseModel):
    part_id: int
    quantity: int
    notes: str


class IssueRequest(BaseModel):
    part_id: int
    quantity: int
    work_order_number: str
    notes: Optional[str] = None


# ── Movements ─────────────────────────────────────────────────────────────────

class MovementOut(BaseModel):
    id: int
    part_id: int
    part_name: str
    movement_type: MovementType
    quantity: int
    quantity_before: int
    quantity_after: int
    reference_type: Optional[str] = None
    reference_id: Optional[int] = None
    work_order_number: Optional[str] = None
    notes: Optional[str] = None
    created_by_name: str
    created_at: datetime

    model_config = {"from_attributes": True}
