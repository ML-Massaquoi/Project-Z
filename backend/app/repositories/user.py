"""
Project Z - User Repository
"""

from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.user import User, Role
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    def __init__(self, session: AsyncSession):
        super().__init__(User, session)

    async def get_by_id(self, id: UUID) -> Optional[User]:
        """Get user by ID with role loaded (avoids lazy-load in async context)."""
        result = await self.session.execute(
            select(User)
            .options(joinedload(User.role))
            .where(User.id == id)
        )
        return result.unique().scalar_one_or_none()

    async def get_by_username(self, username: str) -> Optional[User]:
        """Find user by username with role loaded."""
        result = await self.session.execute(
            select(User)
            .options(joinedload(User.role))
            .where(User.username == username)
        )
        return result.unique().scalar_one_or_none()

    async def get_by_email(self, email: str) -> Optional[User]:
        """Find user by email."""
        result = await self.session.execute(
            select(User).where(User.email == email)
        )
        return result.scalar_one_or_none()


class RoleRepository(BaseRepository[Role]):
    def __init__(self, session: AsyncSession):
        super().__init__(Role, session)

    async def get_by_name(self, name: str) -> Optional[Role]:
        """Find role by name."""
        result = await self.session.execute(
            select(Role).where(Role.name == name)
        )
        return result.scalar_one_or_none()
