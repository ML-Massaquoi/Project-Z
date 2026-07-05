FROM python:3.12-slim

# Create non-root user
RUN groupadd -r -g 1001 appgroup && \
    useradd -r -g appgroup -u 1001 -m -s /bin/bash appuser

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code
COPY . .

# Create backups directory and make writable
RUN mkdir -p /app/backups && chown -R appuser:appgroup /app

# Port
EXPOSE 8000

# Switch to non-root user
USER appuser

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
