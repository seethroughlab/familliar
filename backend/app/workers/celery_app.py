"""Celery application configuration."""

from celery import Celery

from app.config import settings

celery_app = Celery(
    "familiar",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.workers.tasks"],
)

# Celery configuration
celery_app.conf.update(
    # Task settings
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,

    # Worker settings
    worker_prefetch_multiplier=1,  # One task at a time for GPU work
    task_acks_late=True,  # Acknowledge after completion

    # Result settings
    result_expires=3600,  # Results expire after 1 hour

    # Task routing (for future GPU vs CPU separation)
    task_routes={
        "app.workers.tasks.analyze_track": {"queue": "analysis"},
        "app.workers.tasks.extract_artwork": {"queue": "default"},
    },

    # Default queue
    task_default_queue="default",
)
