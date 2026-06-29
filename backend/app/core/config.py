"""
Project Z - Application Configuration
Centralized settings management using Pydantic Settings.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ──────────────────────────────────────────
    APP_NAME: str = "Project Z"
    APP_VERSION: str = "1.0.0"
    APP_ENV: str = "development"
    DEBUG: bool = True

    # ── Database ─────────────────────────────────────────────
    DATABASE_URL: str
    DATABASE_URL_SYNC: str
    DB_ECHO: bool = False
    DB_POOL_SIZE: int = 30
    DB_MAX_OVERFLOW: int = 20

    # ── Redis ────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── Security ─────────────────────────────────────────────
    SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── Organization ─────────────────────────────────────────
    ORG_NAME: str = "Freetown International Airport"
    ORG_COUNTRY: str = "Sierra Leone"
    TIMEZONE: str = "Africa/Freetown"

    # ── Attendance Engine ────────────────────────────────────
    DUPLICATE_SCAN_WINDOW_SECONDS: int = 60
    DEFAULT_GRACE_PERIOD_MINUTES: int = 15
    AUTO_CHECKOUT_HOURS: int = 16

    # ── System Alerts ────────────────────────────────────────
    ALERT_RETENTION_DAYS: int = 30
    ALERT_DEVICE_OFFLINE_THRESHOLD_MINUTES: int = 10
    ALERT_FAILURE_RATE_THRESHOLD: int = 5

    # ── Backup ───────────────────────────────────────────────
    BACKUP_ENABLED: bool = True
    BACKUP_SCHEDULE_HOUR: int = 2  # 2 AM
    BACKUP_SCHEDULE_MINUTE: int = 0
    BACKUP_RETENTION_DAYS: int = 30
    BACKUP_DIR: str = "backups"
    BACKUP_MAX_FILE_SIZE_MB: int = 5000  # 5 GB warning threshold
    PG_DUMP_PATH: str = "pg_dump"  # Path to pg_dump binary

    # ── Admin Defaults ───────────────────────────────────────
    DEFAULT_ADMIN_USERNAME: str = "admin"
    DEFAULT_ADMIN_PASSWORD: str
    DEFAULT_ADMIN_EMAIL: str = "admin@projectz.local"

    # ── CORS ─────────────────────────────────────────────────
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:80",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://172.16.40.19:3000",
        "http://172.16.40.19:5173",
        "http://172.16.40.19:80",
        "http://172.16.40.19:8081",
    ]

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"


@lru_cache()
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
