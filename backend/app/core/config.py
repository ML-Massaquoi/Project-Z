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
    DATABASE_URL: str = "postgresql+asyncpg://projectz:projectz_secret@localhost:5432/projectz"
    DATABASE_URL_SYNC: str = "postgresql://projectz:projectz_secret@localhost:5432/projectz"
    DB_ECHO: bool = False
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10

    # ── Redis ────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── Security ─────────────────────────────────────────────
    SECRET_KEY: str = "projectz-super-secret-key-change-in-production-2024"
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

    # ── Admin Defaults ───────────────────────────────────────
    DEFAULT_ADMIN_USERNAME: str = "admin"
    DEFAULT_ADMIN_PASSWORD: str = "@linux@kali@DYDY21"
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
