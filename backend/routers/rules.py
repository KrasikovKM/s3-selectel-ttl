import logging
import threading
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import boto3
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from database import get_db
from models import TTLRule, JobRun, S3Credential
from schemas import RuleCreate, RuleUpdate, RuleWithMeta, PreviewResult, PreviewFile
from scheduler import scheduler, add_or_update_job, remove_job, run_cleanup_job

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rules", tags=["rules"])


def _get_next_run(rule_id: int) -> Optional[datetime]:
    """Get the next scheduled run time for a rule from APScheduler."""
    job_id = f"rule_{rule_id}"
    job = scheduler.get_job(job_id)
    if job and job.next_run_time:
        return job.next_run_time
    return None


def _get_last_run(rule_id: int, db: Session):
    """Get the most recent JobRun for a rule."""
    return (
        db.query(JobRun)
        .filter(JobRun.rule_id == rule_id)
        .order_by(JobRun.started_at.desc())
        .first()
    )


@router.get("/", response_model=List[RuleWithMeta])
def list_rules(db: Session = Depends(get_db)):
    rules = db.query(TTLRule).order_by(TTLRule.created_at.desc()).all()
    result = []
    for rule in rules:
        last_run_obj = _get_last_run(rule.id, db)
        next_run = _get_next_run(rule.id)
        meta = RuleWithMeta(
            id=rule.id,
            credential_id=rule.credential_id,
            name=rule.name,
            prefix=rule.prefix,
            ttl_days=rule.ttl_days,
            is_active=rule.is_active,
            cron_schedule=rule.cron_schedule,
            created_at=rule.created_at,
            last_run=last_run_obj.started_at if last_run_obj else None,
            last_run_status=last_run_obj.status if last_run_obj else None,
            next_run=next_run,
        )
        result.append(meta)
    return result


@router.post("/", response_model=RuleWithMeta)
def create_rule(data: RuleCreate, db: Session = Depends(get_db)):
    credential = db.query(S3Credential).filter(S3Credential.id == data.credential_id).first()
    if not credential:
        raise HTTPException(status_code=404, detail="Credential not found")

    rule = TTLRule(
        credential_id=data.credential_id,
        name=data.name,
        prefix=data.prefix,
        ttl_days=data.ttl_days,
        is_active=data.is_active,
        cron_schedule=data.cron_schedule,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)

    if rule.is_active:
        try:
            add_or_update_job(rule.id, rule.cron_schedule)
        except Exception as exc:
            logger.error(f"Failed to schedule rule {rule.id}: {exc}")

    next_run = _get_next_run(rule.id)
    return RuleWithMeta(
        **rule.__dict__,
        last_run=None,
        last_run_status=None,
        next_run=next_run,
    )


@router.put("/{rule_id}", response_model=RuleWithMeta)
def update_rule(rule_id: int, data: RuleUpdate, db: Session = Depends(get_db)):
    rule = db.query(TTLRule).filter(TTLRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    if data.credential_id is not None:
        credential = db.query(S3Credential).filter(S3Credential.id == data.credential_id).first()
        if not credential:
            raise HTTPException(status_code=404, detail="Credential not found")
        rule.credential_id = data.credential_id
    if data.name is not None:
        rule.name = data.name
    if data.prefix is not None:
        rule.prefix = data.prefix
    if data.ttl_days is not None:
        rule.ttl_days = data.ttl_days
    if data.cron_schedule is not None:
        rule.cron_schedule = data.cron_schedule

    was_active = rule.is_active
    if data.is_active is not None:
        rule.is_active = data.is_active

    db.commit()
    db.refresh(rule)

    if rule.is_active:
        try:
            add_or_update_job(rule.id, rule.cron_schedule)
        except Exception as exc:
            logger.error(f"Failed to schedule rule {rule.id}: {exc}")
    else:
        remove_job(rule.id)

    last_run_obj = _get_last_run(rule.id, db)
    next_run = _get_next_run(rule.id)
    return RuleWithMeta(
        **{c.key: getattr(rule, c.key) for c in rule.__table__.columns},
        last_run=last_run_obj.started_at if last_run_obj else None,
        last_run_status=last_run_obj.status if last_run_obj else None,
        next_run=next_run,
    )


@router.delete("/{rule_id}", status_code=204)
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(TTLRule).filter(TTLRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    remove_job(rule_id)
    db.delete(rule)
    db.commit()


@router.post("/{rule_id}/run")
def run_rule_now(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(TTLRule).filter(TTLRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    thread = threading.Thread(target=run_cleanup_job, args=(rule_id,), daemon=True)
    thread.start()

    return {"success": True, "message": "Задача запущена в фоне."}


@router.post("/{rule_id}/preview", response_model=PreviewResult)
def preview_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(TTLRule).filter(TTLRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    credential = rule.credential
    if not credential:
        raise HTTPException(status_code=404, detail="Credential not found for this rule")

    try:
        s3 = boto3.client(
            "s3",
            endpoint_url=credential.endpoint_url,
            aws_access_key_id=credential.access_key,
            aws_secret_access_key=credential.secret_key,
        )

        cutoff = datetime.now(timezone.utc) - timedelta(days=rule.ttl_days)
        paginator = s3.get_paginator("list_objects_v2")

        paginate_kwargs = {"Bucket": credential.bucket_name}
        if rule.prefix:
            paginate_kwargs["Prefix"] = rule.prefix

        all_files: List[PreviewFile] = []
        total_bytes = 0
        total_count = 0

        now = datetime.now(timezone.utc)

        for page in paginator.paginate(**paginate_kwargs):
            for obj in page.get("Contents", []):
                last_modified = obj["LastModified"]
                if last_modified.tzinfo is None:
                    last_modified = last_modified.replace(tzinfo=timezone.utc)
                if last_modified < cutoff:
                    total_count += 1
                    total_bytes += obj.get("Size", 0)
                    if len(all_files) < 100:
                        age_days = (now - last_modified).total_seconds() / 86400
                        all_files.append(
                            PreviewFile(
                                key=obj["Key"],
                                size=obj.get("Size", 0),
                                last_modified=last_modified,
                                age_days=round(age_days, 1),
                            )
                        )

        return PreviewResult(
            files_count=total_count,
            total_bytes=total_bytes,
            files=all_files,
        )

    except Exception as exc:
        logger.exception(f"Preview failed for rule {rule_id}: {exc}")
        raise HTTPException(status_code=500, detail=f"Ошибка при получении превью: {str(exc)}")
