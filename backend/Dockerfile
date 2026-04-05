FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN pip install --no-cache-dir --upgrade pip

# Use the slim API-only dependency set by default.
COPY requirements.api.txt /app/requirements.api.txt
RUN pip install --no-cache-dir -r /app/requirements.api.txt

COPY app /app/app

# Copy migration scripts and init_db.py
COPY init_db.py /app/init_db.py
COPY migrate_*.py /app/
COPY railway_migrations.sql /app/railway_migrations.sql

EXPOSE 8000

CMD ["sh", "-c", "python init_db.py && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]


