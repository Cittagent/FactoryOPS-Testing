from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.settings import NotificationChannel, TariffConfig


class SettingsRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_tariff(self) -> Optional[TariffConfig]:
        result = await self.db.execute(
            select(TariffConfig).order_by(TariffConfig.id.asc()).limit(1)
        )
        return result.scalar_one_or_none()

    async def upsert_tariff(
        self,
        rate: Decimal,
        currency: str,
        updated_by: Optional[str] = None,
    ) -> TariffConfig:
        current = await self.get_tariff()
        if current:
            current.rate = rate
            current.currency = currency
            current.updated_by = updated_by
            current.updated_at = datetime.utcnow()
            await self.db.commit()
            await self.db.refresh(current)
            return current

        row = TariffConfig(
            rate=rate,
            currency=currency,
            updated_by=updated_by,
            updated_at=datetime.utcnow(),
        )
        self.db.add(row)
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def list_active_channels(self, channel_type: str) -> list[NotificationChannel]:
        result = await self.db.execute(
            select(NotificationChannel).where(
                NotificationChannel.channel_type == channel_type,
                NotificationChannel.is_active.is_(True),
            ).order_by(NotificationChannel.id.asc())
        )
        return list(result.scalars().all())

    async def add_email_channel(self, email: str) -> NotificationChannel:
        normalized = email.strip().lower()
        result = await self.db.execute(
            select(NotificationChannel).where(
                NotificationChannel.channel_type == "email",
                NotificationChannel.value == normalized,
            ).order_by(NotificationChannel.id.desc()).limit(1)
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.is_active = True
            await self.db.commit()
            await self.db.refresh(existing)
            return existing

        row = NotificationChannel(
            channel_type="email",
            value=normalized,
            is_active=True,
            created_at=datetime.utcnow(),
        )
        self.db.add(row)
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def disable_email_channel(self, channel_id: int) -> bool:
        result = await self.db.execute(
            select(NotificationChannel).where(
                NotificationChannel.id == channel_id,
                NotificationChannel.channel_type == "email",
            )
        )
        row = result.scalar_one_or_none()
        if not row:
            return False
        row.is_active = False
        await self.db.commit()
        return True
