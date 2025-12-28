"""Celery application configuration."""

from celery import Celery
from celery.schedules import crontab

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

    # Use a high-priority queue for user-initiated tasks like scans
    task_routes={
        "app.workers.tasks.scan_library": {"queue": "high_priority"},
        "app.workers.tasks.analyze_track": {"queue": "default"},
    },

    # Default queue
    task_default_queue="default",

    # Workers should consume from high_priority first, then default
    task_queues={
        "high_priority": {"exchange": "high_priority", "routing_key": "high_priority"},
        "default": {"exchange": "default", "routing_key": "default"},
    },

    # Beat schedule for periodic tasks
    beat_schedule={
        # Incremental scan every 6 hours to find new files
        "periodic-library-scan": {
            "task": "app.workers.tasks.scan_library",
            "schedule": crontab(minute=0, hour="*/6"),  # Every 6 hours
            "args": (False,),  # full_scan=False (incremental)
        },
        # Catch up on any unanalyzed tracks every hour
        "analyze-unanalyzed-tracks": {
            "task": "app.workers.tasks.analyze_unanalyzed_tracks",
            "schedule": crontab(minute=30),  # Every hour at :30
            "args": (500,),  # limit=500 tracks per run
        },
    },
)
