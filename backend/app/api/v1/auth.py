"""
Project Z - Auth API Routes
"""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.database.session import get_db
from app.schemas.auth import LoginRequest, RefreshRequest, TokenResponse, UserInfo
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
async def login(request: Request, login_request: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate user and return JWT tokens."""
    service = AuthService(db)
    ip_address = request.client.host if request.client else None
    return await service.login(login_request.username, login_request.password, ip_address=ip_address)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(request: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Refresh access token using refresh token."""
    service = AuthService(db)
    return await service.refresh(request.refresh_token)


@router.get("/me", response_model=UserInfo)
async def get_me(current_user=Depends(get_current_user)):
    """Return the currently authenticated user's profile with permissions."""
    permissions = []
    if current_user.role and current_user.role.permissions:
        permissions = current_user.role.permissions.get("granted", [])
    return UserInfo(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role.name if current_user.role else None,
        role_type=current_user.role.role_type.value if current_user.role else None,
        permissions=permissions,
        avatar_url=current_user.avatar_url,
    )
