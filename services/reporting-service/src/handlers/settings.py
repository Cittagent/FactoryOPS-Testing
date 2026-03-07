from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.repositories.settings_repository import SettingsRepository

router = APIRouter(tags=["settings"])


class TariffUpsertRequest(BaseModel):
    rate: Decimal = Field(..., gt=0)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    updated_by: Optional[str] = None


class EmailAddRequest(BaseModel):
    email: EmailStr


@router.get("/tariff")
async def get_tariff(
    db: AsyncSession = Depends(get_db),
):
    repo = SettingsRepository(db)
    row = await repo.get_tariff()
    if not row:
        return {"rate": None, "currency": "INR", "updated_at": None}
    return {
        "rate": float(row.rate),
        "currency": row.currency,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.post("/tariff")
async def upsert_tariff(
    payload: TariffUpsertRequest,
    db: AsyncSession = Depends(get_db),
):
    currency = payload.currency.upper()
    if currency not in {"INR", "USD", "EUR"}:
        raise HTTPException(status_code=400, detail={"error": "VALIDATION_ERROR", "message": "currency must be INR, USD, or EUR"})
    repo = SettingsRepository(db)
    row = await repo.upsert_tariff(
        rate=payload.rate,
        currency=currency,
        updated_by=payload.updated_by,
    )
    return {
        "rate": float(row.rate),
        "currency": row.currency,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.get("/notifications")
async def get_notifications(
    db: AsyncSession = Depends(get_db),
):
    repo = SettingsRepository(db)
    emails = await repo.list_active_channels("email")
    return {
        "email": [
            {"id": row.id, "value": row.value, "is_active": row.is_active}
            for row in emails
        ],
        "whatsapp": [],
        "sms": [],
    }


@router.post("/notifications/email")
async def add_notification_email(
    payload: EmailAddRequest,
    db: AsyncSession = Depends(get_db),
):
    repo = SettingsRepository(db)
    row = await repo.add_email_channel(payload.email)
    return {"id": row.id, "value": row.value, "is_active": row.is_active}


@router.delete("/notifications/email/{channel_id}")
async def delete_notification_email(
    channel_id: int,
    db: AsyncSession = Depends(get_db),
):
    repo = SettingsRepository(db)
    ok = await repo.disable_email_channel(channel_id)
    if not ok:
        raise HTTPException(status_code=404, detail={"error": "NOT_FOUND", "message": "Email channel not found"})
    return {"success": True}
