from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Integer, Numeric, String
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class TariffConfig(Base):
    __tablename__ = "tariff_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    rate = Column(Numeric(10, 4), nullable=False)
    currency = Column(String(10), nullable=False, default="INR")
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by = Column(String(100), nullable=True)


class NotificationChannel(Base):
    __tablename__ = "notification_channels"

    id = Column(Integer, primary_key=True, autoincrement=True)
    channel_type = Column(String(20), nullable=False, index=True)
    value = Column(String(255), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
