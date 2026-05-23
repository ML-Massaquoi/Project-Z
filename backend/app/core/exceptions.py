"""
Project Z - Custom Exceptions
Application-specific exception classes with HTTP status codes.
"""

from typing import Any, Optional


class ProjectZException(Exception):
    """Base exception for Project Z."""

    def __init__(
        self,
        message: str = "An error occurred",
        status_code: int = 500,
        detail: Optional[Any] = None,
    ):
        self.message = message
        self.status_code = status_code
        self.detail = detail
        super().__init__(self.message)


class NotFoundException(ProjectZException):
    """Resource not found."""

    def __init__(self, resource: str = "Resource", resource_id: Any = None):
        msg = f"{resource} not found"
        if resource_id:
            msg = f"{resource} with id '{resource_id}' not found"
        super().__init__(message=msg, status_code=404)


class DuplicateException(ProjectZException):
    """Duplicate resource."""

    def __init__(self, resource: str = "Resource", field: str = ""):
        msg = f"{resource} already exists"
        if field:
            msg = f"{resource} with this {field} already exists"
        super().__init__(message=msg, status_code=409)


class UnauthorizedException(ProjectZException):
    """Authentication failed."""

    def __init__(self, message: str = "Invalid credentials"):
        super().__init__(message=message, status_code=401)


class ForbiddenException(ProjectZException):
    """Insufficient permissions."""

    def __init__(self, message: str = "Insufficient permissions"):
        super().__init__(message=message, status_code=403)


class ValidationException(ProjectZException):
    """Validation error."""

    def __init__(self, message: str = "Validation error", detail: Any = None):
        super().__init__(message=message, status_code=422, detail=detail)


class DeviceException(ProjectZException):
    """Device communication error."""

    def __init__(self, message: str = "Device error"):
        super().__init__(message=message, status_code=502)


class DuplicateScanException(ProjectZException):
    """Duplicate attendance scan within the configured window."""

    def __init__(self, employee_id: str, window_seconds: int):
        super().__init__(
            message=f"Duplicate scan for employee {employee_id} within {window_seconds}s window",
            status_code=200,  # Not an error - just skipped
        )
