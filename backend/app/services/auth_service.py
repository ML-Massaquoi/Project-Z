"""
Project Z - Auth Service
JWT authentication and user management.
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
)
from app.repositories.user import UserRepository, RoleRepository
from app.schemas.auth import TokenResponse, UserInfo

logger = logging.getLogger(__name__)


class AuthService:
    """Authentication and user management service."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.user_repo = UserRepository(session)
        self.role_repo = RoleRepository(session)

    async def login(self, username: str, password: str) -> TokenResponse:
        """Authenticate user and return JWT tokens."""
        user = await self.user_repo.get_by_username(username)
        if not user:
            raise UnauthorizedException("Invalid username or password")

        if not verify_password(password, user.hashed_password):
            raise UnauthorizedException("Invalid username or password")

        if not user.is_active:
            raise UnauthorizedException("Account is deactivated")

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
            avatar_url=user.avatar_url,
        )

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
        """Create a new system user."""
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
