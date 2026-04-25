#!/usr/bin/env bash

# Start Celery Worker with only 1 concurrency (saves RAM)
celery -A config worker --concurrency=1 --loglevel=info &

# Start Celery Beat
celery -A config beat --loglevel=info &

# Start Gunicorn with only 1 worker process (saves RAM)
gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 1 --threads 2
