from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from models import JobRun
from schemas import JobRunResponse

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/", response_model=List[JobRunResponse])
def list_jobs(
    rule_id: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    query = db.query(JobRun).order_by(JobRun.started_at.desc())
    if rule_id is not None:
        query = query.filter(JobRun.rule_id == rule_id)
    jobs = query.limit(limit).all()
    return jobs


@router.get("/{job_id}", response_model=JobRunResponse)
def get_job(job_id: int, db: Session = Depends(get_db)):
    from fastapi import HTTPException

    job = db.query(JobRun).filter(JobRun.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job run not found")
    return job
