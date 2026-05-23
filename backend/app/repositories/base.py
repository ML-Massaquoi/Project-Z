"""
Project Z - Base Repository
Generic async CRUD repository pattern.
"""

from typing import Any, Generic, Optional, Sequence, Type, TypeVar
from uuid import UUID

from sqlalchemy import func, select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.base import BaseModel

ModelType = TypeVar("ModelType", bound=BaseModel)


class BaseRepository(Generic[ModelType]):
    """Generic async CRUD repository."""

    def __init__(self, model: Type[ModelType], session: AsyncSession):
        self.model = model
        self.session = session

    async def get_by_id(self, id: UUID) -> Optional[ModelType]:
        """Get a single record by ID."""
        result = await self.session.execute(
            select(self.model).where(self.model.id == id)
        )
        return result.scalar_one_or_none()

    async def get_all(
        self,
        skip: int = 0,
        limit: int = 100,
        filters: Optional[list] = None,
        order_by: Optional[Any] = None,
    ) -> Sequence[ModelType]:
        """Get all records with optional filtering and pagination."""
        query = select(self.model)
        if filters:
            for f in filters:
                query = query.where(f)
        if order_by is not None:
            query = query.order_by(order_by)
        else:
            query = query.order_by(self.model.created_at.desc())
        query = query.offset(skip).limit(limit)
        result = await self.session.execute(query)
        return result.scalars().all()

    async def count(self, filters: Optional[list] = None) -> int:
        """Count records with optional filtering."""
        query = select(func.count()).select_from(self.model)
        if filters:
            for f in filters:
                query = query.where(f)
        result = await self.session.execute(query)
        return result.scalar_one()

    async def create(self, obj_in: dict[str, Any]) -> ModelType:
        """Create a new record."""
        db_obj = self.model(**obj_in)
        self.session.add(db_obj)
        await self.session.flush()
        await self.session.refresh(db_obj)
        return db_obj

    async def update(self, id: UUID, obj_in: dict[str, Any]) -> Optional[ModelType]:
        """Update an existing record. Explicitly passed None values are preserved
        so callers can clear optional fields (e.g. unassign a department)."""
        if not obj_in:
            return await self.get_by_id(id)

        await self.session.execute(
            update(self.model).where(self.model.id == id).values(**obj_in)
        )
        await self.session.flush()
        return await self.get_by_id(id)

    async def delete(self, id: UUID) -> bool:
        """Delete a record by ID."""
        result = await self.session.execute(
            delete(self.model).where(self.model.id == id)
        )
        await self.session.flush()
        return result.rowcount > 0

    async def get_by_field(self, field_name: str, value: Any) -> Optional[ModelType]:
        """Get a single record by an arbitrary field."""
        field = getattr(self.model, field_name)
        result = await self.session.execute(
            select(self.model).where(field == value)
        )
        return result.scalar_one_or_none()
