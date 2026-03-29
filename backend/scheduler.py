import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import boto3
from botocore.config import Config
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.jobstores.base import JobLookupError

from database import SessionLocal
from models import TTLRule, JobRun

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler(timezone="UTC")


def _parse_cron_to_trigger(cron_string: str) -> CronTrigger:
    """Parse a cron string in 'minute hour day month day_of_week' format."""
    parts = cron_string.strip().split()
    if len(parts) != 5:
        raise ValueError(f"Invalid cron string: {cron_string}. Expected 5 fields.")
    minute, hour, day, month, day_of_week = parts
    return CronTrigger(
        minute=minute,
        hour=hour,
        day=day,
        month=month,
        day_of_week=day_of_week,
        timezone="UTC",
    )


def run_cleanup_job(rule_id: int) -> None:
    """Execute the cleanup job for the given rule_id."""
    db = SessionLocal()
    job_run: Optional[JobRun] = None
    try:
        rule = db.query(TTLRule).filter(TTLRule.id == rule_id).first()
        if not rule:
            logger.warning(f"Rule {rule_id} not found, skipping cleanup job.")
            return

        credential = rule.credential
        if not credential:
            logger.warning(f"No credential found for rule {rule_id}.")
            return

        job_run = JobRun(
            rule_id=rule_id,
            started_at=datetime.utcnow(),
            status="running",
            files_deleted=0,
            bytes_deleted=0,
        )
        db.add(job_run)
        db.commit()
        db.refresh(job_run)

        s3 = boto3.client(
            "s3",
            endpoint_url=credential.endpoint_url,
            aws_access_key_id=credential.access_key,
            aws_secret_access_key=credential.secret_key,
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "path"},
            ),
        )

        cutoff = datetime.now(timezone.utc) - timedelta(days=rule.ttl_days)
        paginator = s3.get_paginator("list_objects_v2")

        paginate_kwargs = {"Bucket": credential.bucket_name}
        if rule.prefix:
            paginate_kwargs["Prefix"] = rule.prefix

        files_deleted = 0
        bytes_deleted = 0
        objects_to_delete = []

        for page in paginator.paginate(**paginate_kwargs):
            for obj in page.get("Contents", []):
                last_modified = obj["LastModified"]
                if last_modified.tzinfo is None:
                    last_modified = last_modified.replace(tzinfo=timezone.utc)
                if last_modified < cutoff:
                    objects_to_delete.append({"Key": obj["Key"]})
                    bytes_deleted += obj.get("Size", 0)

                    if len(objects_to_delete) >= 1000:
                        response = s3.delete_objects(
                            Bucket=credential.bucket_name,
                            Delete={"Objects": objects_to_delete, "Quiet": True},
                        )
                        deleted_count = len(objects_to_delete) - len(response.get("Errors", []))
                        files_deleted += deleted_count
                        objects_to_delete = []

        if objects_to_delete:
            response = s3.delete_objects(
                Bucket=credential.bucket_name,
                Delete={"Objects": objects_to_delete, "Quiet": True},
            )
            deleted_count = len(objects_to_delete) - len(response.get("Errors", []))
            files_deleted += deleted_count

        job_run.status = "success"
        job_run.files_deleted = files_deleted
        job_run.bytes_deleted = bytes_deleted
        job_run.finished_at = datetime.utcnow()
        db.commit()

        logger.info(
            f"Cleanup job for rule {rule_id} completed: "
            f"{files_deleted} files deleted, {bytes_deleted} bytes freed."
        )

    except Exception as exc:
        logger.exception(f"Cleanup job for rule {rule_id} failed: {exc}")
        if job_run and job_run.id:
            try:
                job_run.status = "failed"
                job_run.error_message = str(exc)
                job_run.finished_at = datetime.utcnow()
                db.commit()
            except Exception:
                db.rollback()
    finally:
        db.close()


def add_or_update_job(rule_id: int, cron_schedule: str) -> None:
    """Add or update a scheduled job for the given rule."""
    trigger = _parse_cron_to_trigger(cron_schedule)
    job_id = f"rule_{rule_id}"
    try:
        scheduler.reschedule_job(job_id, trigger=trigger)
        logger.info(f"Updated scheduler job {job_id} with schedule '{cron_schedule}'.")
    except JobLookupError:
        scheduler.add_job(
            run_cleanup_job,
            trigger=trigger,
            id=job_id,
            args=[rule_id],
            max_instances=1,
            replace_existing=True,
        )
        logger.info(f"Added scheduler job {job_id} with schedule '{cron_schedule}'.")


def remove_job(rule_id: int) -> None:
    """Remove a scheduled job for the given rule."""
    job_id = f"rule_{rule_id}"
    try:
        scheduler.remove_job(job_id)
        logger.info(f"Removed scheduler job {job_id}.")
    except JobLookupError:
        logger.debug(f"Scheduler job {job_id} not found, nothing to remove.")


def setup_scheduler() -> None:
    """Load all active rules from DB and schedule them."""
    db = SessionLocal()
    try:
        active_rules = db.query(TTLRule).filter(TTLRule.is_active == True).all()
        for rule in active_rules:
            try:
                add_or_update_job(rule.id, rule.cron_schedule)
            except Exception as exc:
                logger.error(f"Failed to schedule rule {rule.id}: {exc}")
        logger.info(f"Scheduler setup complete. {len(active_rules)} active rule(s) scheduled.")
    finally:
        db.close()

    if not scheduler.running:
        scheduler.start()
        logger.info("APScheduler started.")
