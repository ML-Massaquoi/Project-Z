"""
Project Z - Users & Roles API Routes
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.dependencies import get_current_user, require_admin, require_super_admin, PermissionChecker
from app.core.security import hash_password
from app.database.session import get_db
from app.models.user import User, Role
from app.repositories.base import BaseRepository
from app.repositories.user import UserRepository, RoleRepository
from app.services.auth_service import AuthService
from app.services.audit_service import log_audit

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
@router.get("", dependencies=[Depends(PermissionChecker("user:view"))])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_admin),
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


@router.post("", status_code=201, dependencies=[Depends(PermissionChecker("user:create"))])
async def create_user(
    data: UserCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    service = AuthService(db)
    user = await service.create_user(
        username=data.username,
        email=data.email,
        password=data.password,
        full_name=data.full_name,
        role_id=data.role_id,
    )
    from app.utils.audit_context import get_audit_context
    audit_ctx = get_audit_context(request, current_user)
    await log_audit(
        session=db, action="create", entity_type="user",
        entity_id=str(user.id),
        details={"username": data.username, "email": data.email},
        new_value=user, **audit_ctx,
    )
    return {"id": str(user.id), "username": user.username, "email": user.email}


@router.put("/{user_id}", dependencies=[Depends(PermissionChecker("user:update"))])
async def update_user(
    user_id: UUID,
    data: UserUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    repo = UserRepository(db)
    user = await repo.get_by_id(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    old_user = user
    update_data = data.model_dump(exclude_unset=True)
    await repo.update(user_id, update_data)
    updated_user = await repo.get_by_id(user_id)
    from app.utils.audit_context import get_audit_context
    audit_ctx = get_audit_context(request, current_user)
    await log_audit(
        session=db, action="update", entity_type="user",
        entity_id=str(user_id),
        details={"changed_fields": list(update_data.keys())},
        previous_value=old_user, new_value=updated_user, **audit_ctx,
    )
    return {"message": "User updated"}


@router.delete("/{user_id}", dependencies=[Depends(PermissionChecker("user:delete"))])
async def delete_user(
    user_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_super_admin),
):
    if str(current_user.id) == str(user_id):
        raise HTTPException(400, "Cannot delete your own account")
    repo = UserRepository(db)
    user = await repo.get_by_id(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    old_user = user
    await repo.delete(user_id)
    from app.utils.audit_context import get_audit_context
    audit_ctx = get_audit_context(request, current_user)
    await log_audit(
        session=db, action="delete", entity_type="user",
        entity_id=str(user_id),
        details={"username": old_user.username},
        previous_value=old_user, **audit_ctx,
    )
    return {"message": "User deleted"}


@router.post("/change-password", dependencies=[Depends(PermissionChecker("user:update"))])
async def change_password(
    data: PasswordChange,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from app.core.security import verify_password
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(400, "Current password is incorrect")
    repo = UserRepository(db)
    await repo.update(current_user.id, {"hashed_password": hash_password(data.new_password)})
    from app.utils.audit_context import get_audit_context
    audit_ctx = get_audit_context(request, current_user)
    await log_audit(
        session=db, action="change_password", entity_type="user",
        entity_id=str(current_user.id),
        details={"username": current_user.username},
        **audit_ctx,
    )
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
