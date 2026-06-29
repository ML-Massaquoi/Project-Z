"""
Project Z - Auth Service
JWT authentication and user management with security hardening.
"""

import logging
from typing import Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import UnauthorizedException, DuplicateException, NotFoundException
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
    verify_refresh_token,
    validate_password_strength,
    is_account_locked,
    calculate_lockout_until,
    MAX_FAILED_LOGIN_ATTEMPTS,
)
from app.repositories.user import UserRepository, RoleRepository
from app.schemas.auth import TokenResponse, UserInfo

logger = logging.getLogger(__name__)


class AuthService:
    """Authentication and user management service with security hardening."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.user_repo = UserRepository(session)
        self.role_repo = RoleRepository(session)

    async def login(self, username: str, password: str, ip_address: Optional[str] = None) -> TokenResponse:
        """Authenticate user with account lockout and audit logging."""
        user = await self.user_repo.get_by_username(username)
        
        # Check if user exists (use constant-time comparison)
        if not user:
            # Still hash to prevent timing attacks
            from app.core.security import pwd_context
            pwd_context.hash("dummy")
            logger.warning(f"[Auth] Failed login attempt for username='{username}' IP={ip_address}")
            
            # Audit failed attempt
            from app.services.audit_service import log_audit
            await log_audit(
                session=self.session,
                action="login_failed",
                entity_type="user",
                details={"username": username, "reason": "user_not_found"},
                ip_address=ip_address,
            )
            raise UnauthorizedException("Invalid username or password")

        # Check account lockout
        if is_account_locked(user.failed_login_attempts, user.locked_until):
            logger.warning(f"[Auth] Login attempt for locked account='{username}' IP={ip_address}")
            raise UnauthorizedException("Account is temporarily locked. Please try again later.")

        # Verify password
        if not verify_password(password, user.hashed_password):
            # Increment failed attempts
            new_attempts = user.failed_login_attempts + 1
            update_data = {"failed_login_attempts": new_attempts}
            
            # Lock account if max attempts reached
            if new_attempts >= MAX_FAILED_LOGIN_ATTEMPTS:
                update_data["locked_until"] = calculate_lockout_until()
                logger.warning(f"[Auth] Account '{username}' locked after {new_attempts} failed attempts IP={ip_address}")
            
            await self.user_repo.update(user.id, update_data)
            
            # Audit failed attempt
            from app.services.audit_service import log_audit
            await log_audit(
                session=self.session,
                action="login_failed",
                entity_type="user",
                entity_id=str(user.id),
                user_id=str(user.id),
                details={"username": username, "reason": "wrong_password", "attempts": new_attempts},
                ip_address=ip_address,
            )
            
            raise UnauthorizedException("Invalid username or password")

        # Check if account is active
        if not user.is_active:
            logger.warning(f"[Auth] Login attempt for deactivated user='{username}' IP={ip_address}")
            raise UnauthorizedException("Account is deactivated")

        # Reset failed attempts on successful login
        if user.failed_login_attempts > 0 or user.locked_until:
            await self.user_repo.update(user.id, {
                "failed_login_attempts": 0,
                "locked_until": None,
            })

        # Build token payload
        token_data = {
            "sub": str(user.id),
            "username": user.username,
            "role": user.role.name if user.role else None,
            "role_type": user.role.role_type.value if user.role else None,
        }

        access_token = create_access_token(token_data)
        refresh_token = create_refresh_token(token_data)

        user_info = UserInfo(
            id=user.id,
            username=user.username,
            email=user.email,
            full_name=user.full_name,
            role=user.role.name if user.role else None,
            role_type=user.role.role_type.value if user.role else None,
            permissions=user.role.permissions.get("granted", []) if user.role and user.role.permissions else [],
            avatar_url=user.avatar_url,
        )

        # Audit successful login
        from app.services.audit_service import log_audit
        await log_audit(
            session=self.session,
            action="login",
            entity_type="user",
            entity_id=str(user.id),
            user_id=str(user.id),
            details={"username": username},
            ip_address=ip_address,
        )

        logger.info(f"[Auth] User '{username}' logged in successfully IP={ip_address}")
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            user=user_info,
        )

    async def refresh(self, refresh_token_str: str) -> TokenResponse:
        """Refresh access token using refresh token."""
        payload = verify_refresh_token(refresh_token_str)
        if not payload:
            raise UnauthorizedException("Invalid or expired refresh token")

        user_id = payload.get("sub")
        user = await self.user_repo.get_by_id(UUID(user_id))
        if not user or not user.is_active:
            raise UnauthorizedException("User not found or inactive")

        # Reload role
        if user.role_id:
            role = await self.role_repo.get_by_id(user.role_id)
        else:
            role = None

        token_data = {
            "sub": str(user.id),
            "username": user.username,
            "role": role.name if role else None,
            "role_type": role.role_type.value if role else None,
        }

        new_access = create_access_token(token_data)
        new_refresh = create_refresh_token(token_data)

        user_info = UserInfo(
            id=user.id,
            username=user.username,
            email=user.email,
            full_name=user.full_name,
            role=role.name if role else None,
            role_type=role.role_type.value if role else None,
        )

        return TokenResponse(
            access_token=new_access,
            refresh_token=new_refresh,
            user=user_info,
        )

    async def create_user(
        self,
        username: str,
        email: str,
        password: str,
        full_name: Optional[str] = None,
        role_id: Optional[UUID] = None,
    ):
        """Create a new system user with password validation."""
        # Validate password strength
        is_valid, error_msg = validate_password_strength(password)
        if not is_valid:
            raise ValueError(error_msg)

        # Check duplicates
        existing = await self.user_repo.get_by_username(username)
        if existing:
            raise DuplicateException("User", "username")

        existing_email = await self.user_repo.get_by_email(email)
        if existing_email:
            raise DuplicateException("User", "email")

        hashed = hash_password(password)
        user = await self.user_repo.create({
            "username": username,
            "email": email,
            "hashed_password": hashed,
            "full_name": full_name,
            "role_id": role_id,
        })
        return user
