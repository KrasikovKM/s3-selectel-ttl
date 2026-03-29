import logging
from typing import List

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError, EndpointResolutionError, NoCredentialsError
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import S3Credential
from schemas import CredentialCreate, CredentialResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/credentials", tags=["credentials"])


@router.get("/", response_model=List[CredentialResponse])
def list_credentials(db: Session = Depends(get_db)):
    credentials = db.query(S3Credential).order_by(S3Credential.created_at.desc()).all()
    return credentials


@router.post("/", response_model=CredentialResponse)
def create_credential(data: CredentialCreate, db: Session = Depends(get_db)):
    credential = S3Credential(
        name=data.name,
        endpoint_url=data.endpoint_url,
        access_key=data.access_key,
        secret_key=data.secret_key,
        bucket_name=data.bucket_name,
    )
    db.add(credential)
    db.commit()
    db.refresh(credential)
    return credential


@router.delete("/{credential_id}", status_code=204)
def delete_credential(credential_id: int, db: Session = Depends(get_db)):
    credential = db.query(S3Credential).filter(S3Credential.id == credential_id).first()
    if not credential:
        raise HTTPException(status_code=404, detail="Credential not found")
    db.delete(credential)
    db.commit()


@router.post("/{credential_id}/test")
def test_credential(credential_id: int, db: Session = Depends(get_db)):
    credential = db.query(S3Credential).filter(S3Credential.id == credential_id).first()
    if not credential:
        raise HTTPException(status_code=404, detail="Credential not found")

    try:
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
        s3.head_bucket(Bucket=credential.bucket_name)
        return {"success": True, "message": "Подключение успешно. Бакет доступен."}
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "")
        error_msg = e.response.get("Error", {}).get("Message", str(e))
        if error_code == "403":
            return {
                "success": False,
                "message": f"Доступ запрещён (403): {error_msg}",
            }
        elif error_code == "404":
            return {
                "success": False,
                "message": f"Бакет не найден (404): {credential.bucket_name}",
            }
        else:
            return {
                "success": False,
                "message": f"Ошибка S3 ({error_code}): {error_msg}",
            }
    except NoCredentialsError:
        return {"success": False, "message": "Неверные учётные данные."}
    except Exception as e:
        logger.exception(f"Test connection error for credential {credential_id}: {e}")
        return {"success": False, "message": f"Ошибка подключения: {str(e)}"}
