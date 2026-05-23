"""
Project Z - Time Utilities
Timezone and time calculation helpers.
"""

from datetime import datetime, timezone

from app.core.config import get_settings

settings = get_settings()


def now_utc() -> datetime:
    """Get current UTC datetime."""
    return datetime.now(timezone.utc)


def today_date():
    """Get today's date in UTC."""
    return now_utc().date()
