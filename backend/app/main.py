from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base
from app.routers import auth, parts, suppliers, receiving, issues, stock, export, work_orders

app = FastAPI(title="Garage Inventory", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(parts.router)
app.include_router(suppliers.router)
app.include_router(receiving.router)
app.include_router(issues.router)
app.include_router(stock.router)
app.include_router(export.router)
app.include_router(work_orders.router)


@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _seed_admin()


async def _seed_admin():
    """Create default admin if no users exist."""
    from sqlalchemy import select
    from app.database import AsyncSessionLocal
    from app.models import User, UserRole
    from app.auth import hash_password

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).limit(1))
        if result.scalar_one_or_none() is None:
            admin = User(
                name="Администратор",
                email="admin@garage.local",
                password_hash=hash_password("admin123"),
                role=UserRole.admin,
            )
            db.add(admin)
            await db.commit()
            print("✅ Default admin created: admin@garage.local / admin123")


@app.get("/health")
async def health():
    return {"status": "ok"}
