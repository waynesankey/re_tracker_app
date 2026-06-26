from datetime import datetime
from typing import Optional, List
from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey
from pydantic import BaseModel
from database import Base


class ListingDB(Base):
    __tablename__ = "listings"

    id = Column(Integer, primary_key=True, index=True)
    url = Column(String, nullable=False)
    source_domain = Column(String)
    image_url = Column(String)
    title = Column(String)
    price = Column(Numeric(precision=12, scale=2))
    address = Column(String)
    category = Column(String, default="New")
    property_type = Column(String, nullable=True)
    notes = Column(String)
    date_added = Column(DateTime, default=datetime.utcnow)
    date_updated = Column(DateTime, default=datetime.utcnow)


class StatusHistoryDB(Base):
    __tablename__ = "status_history"

    id = Column(Integer, primary_key=True, index=True)
    listing_id = Column(Integer, ForeignKey("listings.id", ondelete="CASCADE"), nullable=False, index=True)
    from_category = Column(String, nullable=True)
    to_category = Column(String, nullable=False)
    changed_at = Column(DateTime, nullable=False)


class StatusHistoryResponse(BaseModel):
    id: int
    listing_id: int
    from_category: Optional[str] = None
    to_category: str
    changed_at: datetime

    model_config = {"from_attributes": True}


class PriceHistoryDB(Base):
    __tablename__ = "price_history"

    id = Column(Integer, primary_key=True, index=True)
    listing_id = Column(Integer, ForeignKey("listings.id", ondelete="CASCADE"), nullable=False, index=True)
    old_price = Column(Numeric(precision=12, scale=2), nullable=True)
    new_price = Column(Numeric(precision=12, scale=2), nullable=True)
    recorded_at = Column(DateTime, nullable=False)


class PriceHistoryResponse(BaseModel):
    id: int
    listing_id: int
    old_price: Optional[float] = None
    new_price: Optional[float] = None
    recorded_at: datetime

    model_config = {"from_attributes": True}


class ListingCreate(BaseModel):
    url: str


class ListingUpdate(BaseModel):
    url: Optional[str] = None
    image_url: Optional[str] = None
    title: Optional[str] = None
    price: Optional[float] = None
    address: Optional[str] = None
    category: Optional[str] = None
    property_type: Optional[str] = None
    notes: Optional[str] = None


class ListingResponse(BaseModel):
    id: int
    url: str
    source_domain: Optional[str] = None
    image_url: Optional[str] = None
    title: Optional[str] = None
    price: Optional[float] = None
    address: Optional[str] = None
    category: str
    property_type: Optional[str] = None
    notes: Optional[str] = None
    date_added: datetime
    date_updated: datetime

    model_config = {"from_attributes": True}
