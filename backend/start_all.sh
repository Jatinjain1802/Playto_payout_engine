#!/usr/bin/env bash

# Start Celery Worker in background
celery -A config worker -l info &

# Start Celery Beat in background
celery -A config beat -l info &

# Start Gunicorn (Main Web Process)
gunicorn config.wsgi:application --bind 0.0.0.0:$PORT
