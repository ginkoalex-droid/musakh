from datetime import datetime
from sqlalchemy import (
    Integer, String, Text, DateTime, ForeignKey,
    Numeric, Boolean, Enum as SAEnum
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    warehouse = "warehouse"
    mechanic = "mechanic"
    readonly = "readonly"


class MovementType(str, enum.Enum):
    receiving = "receiving"
    issue = "issue"
    adjustment = "adjustment"
    return_ = "return"
    cancellation = "cancellation"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole), default=UserRole.warehouse)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    receiving_orders: Mapped[list["ReceivingOrder"]] = relationship(back_populates="created_by_user", foreign_keys="ReceivingOrder.created_by")
    issue_orders: Mapped[list["IssueOrder"]] = relationship(back_populates="created_by_user", foreign_keys="IssueOrder.created_by")
    movements: Mapped[list["StockMovement"]] = relationship(back_populates="created_by_user")


class Part(Base):
    __tablename__ = "parts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(300), index=True)
    brand: Mapped[str | None] = mapped_column(String(100))
    category: Mapped[str | None] = mapped_column(String(100), index=True)
    unit: Mapped[str] = mapped_column(String(20), default="шт")
    min_stock: Mapped[int] = mapped_column(Integer, default=0)
    track_min_stock: Mapped[bool] = mapped_column(Boolean, default=False)
    default_issue_qty: Mapped[float] = mapped_column(Numeric(10, 3), default=1)
    location: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    barcodes: Mapped[list["Barcode"]] = relationship(back_populates="part", cascade="all, delete-orphan")
    oem_numbers: Mapped[list["OemNumber"]] = relationship(back_populates="part", cascade="all, delete-orphan")
    car_applications: Mapped[list["CarApplication"]] = relationship(back_populates="part", cascade="all, delete-orphan")
    stock: Mapped["Stock | None"] = relationship(back_populates="part", uselist=False)
    receiving_items: Mapped[list["ReceivingItem"]] = relationship(back_populates="part")
    movements: Mapped[list["StockMovement"]] = relationship(back_populates="part")


class CarApplication(Base):
    __tablename__ = "car_applications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    part_id: Mapped[int] = mapped_column(ForeignKey("parts.id"), index=True)
    make: Mapped[str] = mapped_column(String(100), index=True)
    model: Mapped[str | None] = mapped_column(String(100), index=True)

    part: Mapped["Part"] = relationship(back_populates="car_applications")


class Barcode(Base):
    __tablename__ = "barcodes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    part_id: Mapped[int] = mapped_column(ForeignKey("parts.id"), index=True)
    barcode: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)

    part: Mapped["Part"] = relationship(back_populates="barcodes")


class OemNumber(Base):
    __tablename__ = "oem_numbers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    part_id: Mapped[int] = mapped_column(ForeignKey("parts.id"), index=True)
    oem_number: Mapped[str] = mapped_column(String(100), index=True)
    brand: Mapped[str | None] = mapped_column(String(100))

    part: Mapped["Part"] = relationship(back_populates="oem_numbers")


class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    phone: Mapped[str | None] = mapped_column(String(50))
    contact_name: Mapped[str | None] = mapped_column(String(100))
    email: Mapped[str | None] = mapped_column(String(200))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    receiving_orders: Mapped[list["ReceivingOrder"]] = relationship(back_populates="supplier")


class ReceivingOrder(Base):
    __tablename__ = "receiving_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id"))
    date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    invoice_number: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)
    is_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    is_cancelled: Mapped[bool] = mapped_column(Boolean, default=False)
    cancelled_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    supplier: Mapped["Supplier | None"] = relationship(back_populates="receiving_orders")
    created_by_user: Mapped["User"] = relationship(back_populates="receiving_orders", foreign_keys=[created_by])
    items: Mapped[list["ReceivingItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")


class ReceivingItem(Base):
    __tablename__ = "receiving_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("receiving_orders.id"))
    part_id: Mapped[int] = mapped_column(ForeignKey("parts.id"))
    quantity: Mapped[float] = mapped_column(Numeric(10, 3))
    notes: Mapped[str | None] = mapped_column(String(300))

    order: Mapped["ReceivingOrder"] = relationship(back_populates="items")
    part: Mapped["Part"] = relationship(back_populates="receiving_items")


class Mechanic(Base):
    __tablename__ = "mechanics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), index=True)
    phone: Mapped[str | None] = mapped_column(String(50))
    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    work_orders: Mapped[list["WorkOrder"]] = relationship(back_populates="mechanic")


class WorkOrder(Base):
    __tablename__ = "work_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    work_order_number: Mapped[str] = mapped_column(String(100), index=True)
    work_type: Mapped[str | None] = mapped_column(String(50), index=True)
    mechanic_id: Mapped[int] = mapped_column(ForeignKey("mechanics.id"), index=True)
    mechanic_id_2: Mapped[int | None] = mapped_column(ForeignKey("mechanics.id"), nullable=True)
    mechanic_share: Mapped[int] = mapped_column(Integer, default=100)  # % for mechanic_id_1
    date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    car_plate: Mapped[str | None] = mapped_column(String(20))
    car_make: Mapped[str | None] = mapped_column(String(100))
    car_model: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)
    is_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    mechanic: Mapped["Mechanic"] = relationship(back_populates="work_orders", foreign_keys=[mechanic_id])
    mechanic2: Mapped["Mechanic | None"] = relationship("Mechanic", foreign_keys=[mechanic_id_2])
    created_by_user: Mapped["User"] = relationship("User", foreign_keys=[created_by])


class IssueOrder(Base):
    __tablename__ = "issue_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    work_order_id: Mapped[int | None] = mapped_column(ForeignKey("work_orders.id"), nullable=True, index=True)
    work_order_number: Mapped[str] = mapped_column(String(100), index=True)
    date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    notes: Mapped[str | None] = mapped_column(Text)
    is_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    is_cancelled: Mapped[bool] = mapped_column(Boolean, default=False)
    cancelled_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    work_order: Mapped["WorkOrder | None"] = relationship("WorkOrder", foreign_keys=[work_order_id])
    created_by_user: Mapped["User"] = relationship("User", back_populates="issue_orders", foreign_keys=[created_by])
    items: Mapped[list["IssueItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")


class IssueItem(Base):
    __tablename__ = "issue_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("issue_orders.id"))
    part_id: Mapped[int] = mapped_column(ForeignKey("parts.id"))
    quantity: Mapped[float] = mapped_column(Numeric(10, 3))
    notes: Mapped[str | None] = mapped_column(String(300))

    order: Mapped["IssueOrder"] = relationship(back_populates="items")
    part: Mapped["Part"] = relationship()


class Stock(Base):
    __tablename__ = "stock"

    part_id: Mapped[int] = mapped_column(ForeignKey("parts.id"), primary_key=True)
    quantity: Mapped[float] = mapped_column(Numeric(10, 3), default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    part: Mapped["Part"] = relationship(back_populates="stock")


class StockMovement(Base):
    __tablename__ = "stock_movements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    part_id: Mapped[int] = mapped_column(ForeignKey("parts.id"), index=True)
    movement_type: Mapped[MovementType] = mapped_column(SAEnum(MovementType))
    quantity: Mapped[float] = mapped_column(Numeric(10, 3))
    quantity_before: Mapped[float] = mapped_column(Numeric(10, 3))
    quantity_after: Mapped[float] = mapped_column(Numeric(10, 3))
    reference_type: Mapped[str | None] = mapped_column(String(50))
    reference_id: Mapped[int | None] = mapped_column(Integer)
    work_order_number: Mapped[str | None] = mapped_column(String(100), index=True)
    work_order_id: Mapped[int | None] = mapped_column(ForeignKey("work_orders.id"), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    part: Mapped["Part"] = relationship(back_populates="movements")
    created_by_user: Mapped["User"] = relationship(back_populates="movements")
