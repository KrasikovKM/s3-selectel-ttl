import logging
from typing import List

import boto3
import urllib3
from botocore.config import Config
from botocore.exceptions import ClientError, EndpointResolutionError, NoCredentialsError
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

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
            verify=False,
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "path"},
            ),
        )

        # Пробуем получить список всех бакетов
        available_buckets = []
        try:
            response = s3.list_buckets()
            available_buckets = [b["Name"] for b in response.get("Buckets", [])]
        except ClientError:
            pass

        # Проверяем конкретный бакет через head_bucket
        try:
            s3.head_bucket(Bucket=credential.bucket_name)
            return {
                "success": True,
                "message": f"Подключение успешно. Бакет «{credential.bucket_name}» доступен.",
                "available_buckets": available_buckets,
            }
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code in ("404", "NoSuchBucket"):
                # Fallback: пробуем list_objects_v2 — вдруг endpoint уже скопирован в бакет
                try:
                    s3.list_objects_v2(Bucket=credential.bucket_name, MaxKeys=1)
                    return {
                        "success": True,
                        "message": f"Подключение успешно (list_objects). Бакет «{credential.bucket_name}» доступен.",
                        "available_buckets": available_buckets,
                    }
                except ClientError:
                    pass

                hint = ""
                if available_buckets:
                    hint = f" Доступные бакеты: {', '.join(available_buckets)}."
                else:
                    hint = (
                        " Список бакетов недоступен. "
                        "Возможно, указан CDN-URL вместо S3 API endpoint. "
                        "Для Selectel используйте https://s3.selcdn.ru"
                    )
                return {
                    "success": False,
                    "message": f"Бакет «{credential.bucket_name}» не найден (404).{hint}",
                    "available_buckets": available_buckets,
                }
            elif error_code == "403":
                return {
                    "success": False,
                    "message": f"Доступ к бакету «{credential.bucket_name}» запрещён (403). Проверьте права ключа.",
                    "available_buckets": available_buckets,
                }
            else:
                return {
                    "success": False,
                    "message": f"Ошибка S3 ({error_code}): {e.response.get('Error', {}).get('Message', str(e))}",
                    "available_buckets": available_buckets,
                }

    except NoCredentialsError:
        return {"success": False, "message": "Неверные учётные данные (access key / secret key)."}
    except Exception as e:
        logger.exception(f"Test connection error for credential {credential_id}: {e}")
        return {"success": False, "message": f"Ошибка подключения: {str(e)}"}
