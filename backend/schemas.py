from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, field_validator


# ---- Credentials ----

class CredentialCreate(BaseModel):
    name: str
    endpoint_url: str
    access_key: str
    secret_key: str
    bucket_name: str


class CredentialResponse(BaseModel):
    id: int
    name: str
    endpoint_url: str
    access_key: str
    bucket_name: str
    created_at: datetime
    masked_secret_key: str = "****"

    model_config = {"from_attributes": True}


# ---- TTL Rules ----

class RuleCreate(BaseModel):
    credential_id: int
    name: str
    prefix: str = ""
    ttl_days: int
    is_active: bool = True
    cron_schedule: str = "0 2 * * *"


class RuleUpdate(BaseModel):
    credential_id: Optional[int] = None
    name: Optional[str] = None
    prefix: Optional[str] = None
    ttl_days: Optional[int] = None
    is_active: Optional[bool] = None
    cron_schedule: Optional[str] = None


class RuleResponse(BaseModel):
    id: int
    credential_id: int
    name: str
    prefix: str
    ttl_days: int
    is_active: bool
    cron_schedule: str
    created_at: datetime

    model_config = {"from_attributes": True}


class RuleWithMeta(RuleResponse):
    last_run: Optional[datetime] = None
    last_run_status: Optional[str] = None
    next_run: Optional[datetime] = None


# ---- Job Runs ----

class JobRunResponse(BaseModel):
    id: int
    rule_id: int
    started_at: datetime
    finished_at: Optional[datetime] = None
    status: str
    files_deleted: int
    bytes_deleted: int
    error_message: Optional[str] = None

    model_config = {"from_attributes": True}


# ---- Preview ----

class PreviewFile(BaseModel):
    key: str
    size: int
    last_modified: datetime
    age_days: float


class PreviewResult(BaseModel):
    files_count: int
    total_bytes: int
    files: List[PreviewFile]
