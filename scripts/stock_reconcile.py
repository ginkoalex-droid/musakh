#!/usr/bin/env python3
"""
Nightly stock reconciliation: recalculates stock from movements and
reports any discrepancies. Writes a log to /var/log/stock_reconcile.log.
"""
import asyncio
import logging
import os
from datetime import datetime
from decimal import Decimal

logging.basicConfig(
    filename='/var/log/stock_reconcile.log',
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
)

DATABASE_URL = os.environ.get(
    'DATABASE_URL',
    'postgresql+asyncpg://postgres:286214b90e1e2ee8653498df0aece002@db:5432/garage_inventory',
)


async def run():
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy import select, func, text

    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        # Compute expected quantities from movements
        result = await db.execute(
            text("""
                SELECT part_id, SUM(quantity) AS expected
                FROM stock_movements
                GROUP BY part_id
            """)
        )
        expected = {row.part_id: Decimal(str(row.expected)) for row in result}

        # Get current stock
        result2 = await db.execute(
            text("SELECT part_id, quantity FROM stock")
        )
        current = {row.part_id: Decimal(str(row.quantity)) for row in result2}

        all_parts = set(expected) | set(current)
        discrepancies = []
        fixed = 0

        for part_id in all_parts:
            exp = expected.get(part_id, Decimal('0'))
            cur = current.get(part_id, Decimal('0'))
            diff = abs(exp - cur)
            if diff > Decimal('0.001'):
                discrepancies.append((part_id, float(cur), float(exp)))
                # Auto-fix: update stock to match movements
                if part_id in current:
                    await db.execute(
                        text("UPDATE stock SET quantity = :q WHERE part_id = :pid"),
                        {'q': float(exp), 'pid': part_id}
                    )
                else:
                    await db.execute(
                        text("INSERT INTO stock (part_id, quantity) VALUES (:pid, :q)"),
                        {'pid': part_id, 'q': float(exp)}
                    )
                fixed += 1

        await db.commit()

    if discrepancies:
        logging.warning(
            f"Reconciliation found {len(discrepancies)} discrepancies, fixed {fixed}:"
        )
        for part_id, cur, exp in discrepancies:
            logging.warning(f"  part_id={part_id}: stock={cur:.3f}, movements_sum={exp:.3f}")
    else:
        logging.info("Reconciliation OK — no discrepancies found.")

    await engine.dispose()


if __name__ == '__main__':
    logging.info("=== Stock reconciliation started ===")
    asyncio.run(run())
    logging.info("=== Stock reconciliation finished ===")
