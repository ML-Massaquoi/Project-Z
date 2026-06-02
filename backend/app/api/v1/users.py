"""
Project Z - Users & Roles API Routes
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.dependencies import get_current_user
from app.core.security import hash_password
from app.database.session import get_db
from app.models.user import User, Role
from app.repositories.base import BaseRepository
from app.repositories.user import UserRepository, RoleRepository
from app.services.auth_service import AuthService

router = APIRouter(prefix="/users", tags=["Users"])
roles_router = APIRouter(prefix="/roles", tags=["Roles"])


# ── Schemas ──────────────────────────────────────────────
class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    role_id: Optional[UUID] = None

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role_id: Optional[UUID] = None
    is_active: Optional[bool] = None

class PasswordChange(BaseModel):
    current_password: str
    new_password: str


# ── Users ────────────────────────────────────────────────
@router.get("")
async def list_users(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(User).options(joinedload(User.role)).order_by(User.created_at.desc())
    )
    users = result.unique().scalars().all()
    return [
        {
            "id": str(u.id),
            "username": u.username,
            "email": u.email,
            "full_name": u.full_name,
            "is_active": u.is_active,
            "role_id": str(u.role_id) if u.role_id else None,
            "role_name": u.role.display_name if u.role else None,
            "role_type": u.role.role_type.value if u.role else None,
            "created_at": u.created_at,
        }
        for u in users
    ]


@router.post("", status_code=201)
async def create_user(
    data: UserCreate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    service = AuthService(db)
    user = await service.create_user(
        username=data.username,
        email=data.email,
        password=data.password,
        full_name=data.full_name,
        role_id=data.role_id,
    )
    return {"id": str(user.id), "username": user.username, "email": user.email}


@router.put("/{user_id}")
async def update_user(
    user_id: UUID,
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    repo = UserRepository(db)
    user = await repo.get_by_id(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    update_data = data.model_dump(exclude_unset=True)
    await repo.update(user_id, update_data)
    return {"message": "User updated"}


@router.delete("/{user_id}")
async def delete_user(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if str(current_user.id) == str(user_id):
        raise HTTPException(400, "Cannot delete your own account")
    repo = UserRepository(db)
    await repo.delete(user_id)
    return {"message": "User deleted"}


@router.post("/change-password")
async def change_password(
    data: PasswordChange,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from app.core.security import verify_password
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(400, "Current password is incorrect")
    repo = UserRepository(db)
    await repo.update(current_user.id, {"hashed_password": hash_password(data.new_password)})
    return {"message": "Password changed successfully"}


# ── Roles ────────────────────────────────────────────────
@roles_router.get("")
async def list_roles(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(select(Role).order_by(Role.display_name))
    roles = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "name": r.name,
            "display_name": r.display_name,
            "description": r.description,
            "role_type": r.role_type.value if hasattr(r.role_type, 'value') else str(r.role_type),
            "is_active": r.is_active,
        }
        for r in roles
    ]
