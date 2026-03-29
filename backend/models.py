from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, Text, BigInteger
)
from sqlalchemy.orm import relationship
from database import Base


class S3Credential(Base):
    __tablename__ = "s3_credentials"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    endpoint_url = Column(String(500), nullable=False)
    access_key = Column(String(255), nullable=False)
    secret_key = Column(String(500), nullable=False)
    bucket_name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    rules = relationship("TTLRule", back_populates="credential", cascade="all, delete-orphan")


class TTLRule(Base):
    __tablename__ = "ttl_rules"

    id = Column(Integer, primary_key=True, index=True)
    credential_id = Column(Integer, ForeignKey("s3_credentials.id"), nullable=False)
    name = Column(String(255), nullable=False)
    prefix = Column(String(500), default="", nullable=False)
    ttl_days = Column(Integer, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    cron_schedule = Column(String(100), default="0 2 * * *", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    credential = relationship("S3Credential", back_populates="rules")
    job_runs = relationship("JobRun", back_populates="rule", cascade="all, delete-orphan")


class JobRun(Base):
    __tablename__ = "job_runs"

    id = Column(Integer, primary_key=True, index=True)
    rule_id = Column(Integer, ForeignKey("ttl_rules.id"), nullable=False)
    started_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    finished_at = Column(DateTime, nullable=True)
    status = Column(String(20), default="running", nullable=False)
    files_deleted = Column(Integer, default=0, nullable=False)
    bytes_deleted = Column(BigInteger, default=0, nullable=False)
    error_message = Column(Text, nullable=True)

    rule = relationship("TTLRule", back_populates="job_runs")
