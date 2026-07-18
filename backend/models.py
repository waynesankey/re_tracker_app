from datetime import datetime
from typing import Optional, List
from sqlalchemy import Boolean, Column, Float, Integer, String, Numeric, DateTime, ForeignKey
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
    listing_id = Column(String, nullable=True)
    class_id = Column(String, nullable=True)
    proposed_category = Column(String, nullable=True)
    proposed_by = Column(String, nullable=True)
    proposed_at = Column(DateTime, nullable=True)
    rank = Column(Integer, nullable=True)
    listing_status = Column(String, nullable=True)
    waterfront = Column(Boolean, nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
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
    changed_by = Column(String, nullable=True)


class StatusHistoryResponse(BaseModel):
    id: int
    listing_id: int
    from_category: Optional[str] = None
    to_category: str
    changed_at: datetime
    changed_by: Optional[str] = None

    model_config = {"from_attributes": True}


class ProposalLogDB(Base):
    __tablename__ = "proposal_log"

    id = Column(Integer, primary_key=True, index=True)
    listing_id = Column(Integer, ForeignKey("listings.id", ondelete="CASCADE"), nullable=False, index=True)
    from_category = Column(String, nullable=False)
    to_category = Column(String, nullable=False)
    proposed_by = Column(String, nullable=False)
    proposed_at = Column(DateTime, nullable=False)
    action = Column(String, nullable=False)   # proposed | agreed | withdrawn | rejected
    action_by = Column(String, nullable=False)
    action_at = Column(DateTime, nullable=False)
    note = Column(String, nullable=True)


class ProposalLogResponse(BaseModel):
    id: int
    listing_id: int
    from_category: str
    to_category: str
    proposed_by: str
    proposed_at: datetime
    action: str
    action_by: str
    action_at: datetime
    note: Optional[str] = None

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
    listing_id: Optional[str] = None
    class_id: Optional[str] = None
    proposed_category: Optional[str] = None
    proposed_by: Optional[str] = None
    proposed_at: Optional[datetime] = None
    rank: Optional[int] = None
    listing_status: Optional[str] = None
    waterfront: Optional[bool] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    notes: Optional[str] = None
    date_added: datetime
    date_updated: datetime

    model_config = {"from_attributes": True}


class IngestLogDB(Base):
    __tablename__ = "ingest_log"

    id = Column(Integer, primary_key=True, index=True)
    run_at = Column(DateTime, nullable=False)
    run_by = Column(String, nullable=True)
    viewpoint_total = Column(Integer, nullable=True)   # before price/lot filter
    price_lot_filtered = Column(Integer, nullable=True) # after price+lot filter
    already_tracked = Column(Integer, nullable=True)   # skipped — in DB
    waterfront_skipped = Column(Integer, nullable=True) # skipped — not waterfront
    resurrected = Column(Integer, nullable=True)
    added = Column(Integer, nullable=True)


class IngestLogResponse(BaseModel):
    id: int
    run_at: datetime
    run_by: Optional[str] = None
    viewpoint_total: Optional[int] = None
    price_lot_filtered: Optional[int] = None
    already_tracked: Optional[int] = None
    waterfront_skipped: Optional[int] = None
    resurrected: Optional[int] = None
    added: Optional[int] = None

    model_config = {"from_attributes": True}


class IngestRequest(BaseModel):
    run_by: Optional[str] = None


class RankItem(BaseModel):
    id: int
    rank: int


class ReorderRequest(BaseModel):
    items: List[RankItem]


class ProposeRequest(BaseModel):
    new_category: str
    proposed_by: str


class AgreeRequest(BaseModel):
    agreed_by: str


class WithdrawRequest(BaseModel):
    withdrawn_by: str


class RejectRequest(BaseModel):
    rejected_by: str
    note: str


class MarkViewedRequest(BaseModel):
    user: str
