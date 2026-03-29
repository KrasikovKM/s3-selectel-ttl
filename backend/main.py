import base64
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from database import engine, Base
from routers import credentials, rules, jobs
from scheduler import setup_scheduler, scheduler

APP_PASSWORD = os.environ.get("APP_PASSWORD", "Digital24!")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    logger.info("Setting up scheduler...")
    setup_scheduler()
    yield
    logger.info("Shutting down scheduler...")
    if scheduler.running:
        scheduler.shutdown(wait=False)


app = FastAPI(
    title="S3 TTL Manager",
    description="Управление жизненным циклом файлов в Selectel S3",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if request.url.path in ("/api/health", "/api/login"):
        return await call_next(request)
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Basic "):
        try:
            decoded = base64.b64decode(auth[6:]).decode("utf-8")
            _, password = decoded.split(":", 1)
            if password == APP_PASSWORD:
                return await call_next(request)
        except Exception:
            pass
    return JSONResponse(status_code=401, content={"detail": "Unauthorized"})

app.include_router(credentials.router, prefix="/api")
app.include_router(rules.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


@app.post("/api/login")
async def login(request: Request):
    data = await request.json()
    if data.get("password") == APP_PASSWORD:
        return {"success": True}
    return JSONResponse(status_code=401, content={"success": False, "detail": "Неверный пароль"})
