import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import engine, Base
from routers import credentials, rules, jobs
from scheduler import setup_scheduler, scheduler

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

app.include_router(credentials.router, prefix="/api")
app.include_router(rules.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
