"""
Project Z - Data Integrity API
Endpoints for running integrity checks and viewing findings.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, PermissionChecker
from app.database.session import get_db
from app.models.data_integrity_log import CheckCategory, CheckSeverity
from app.schemas.alert import AlertAcknowledgeRequest
from app.services.data_integrity_service import DataIntegrityService
from app.services.audit_service import log_audit
from app.utils.audit_context import get_audit_context

router = APIRouter(prefix="/integrity", tags=["Data Integrity"])


@router.get("/findings", dependencies=[Depends(PermissionChecker("audit:view"))])
async def list_findings(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
    category: CheckCategory | None = None,
    severity: CheckSeverity | None = None,
    resolved: bool | None = None,
    limit: int = Query(100, ge=1, le=500),
):
    """List integrity check findings with optional filters."""
    service = DataIntegrityService(db)
    findings = await service.get_findings(
        category=category, severity=severity, resolved=resolved, limit=limit,
    )
    return {
        "items": [
            {
                "id": str(f.id),
                "check_category": f.check_category.value,
                "severity": f.severity.value,
                "check_name": f.check_name,
                "message": f.message,
                "affected_count": f.affected_count,
                "affected_entity_type": f.affected_entity_type,
                "resolved": f.resolved,
                "resolved_by": f.resolved_by,
                "resolved_at": f.resolved_at.isoformat() if f.resolved_at else None,
                "resolution_note": f.resolution_note,
                "run_by": f.run_by,
                "run_id": f.run_id,
                "created_at": f.created_at.isoformat(),
            }
            for f in findings
        ],
        "total": len(findings),
    }


@router.get("/stats", dependencies=[Depends(PermissionChecker("audit:view"))])
async def get_integrity_stats(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get integrity check statistics."""
    service = DataIntegrityService(db)
    return await service.get_stats()


@router.post("/run", dependencies=[Depends(PermissionChecker("audit:view"))])
async def run_integrity_checks(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Manually trigger a full integrity check run."""
    service = DataIntegrityService(db)
    ctx = get_audit_context(request)

    findings = await service.run_all_checks(run_by=current_user.username)

    await log_audit(
        session=db,
        action="run_integrity_checks",
        entity_type="data_integrity",
        user_id=str(current_user.id),
        username=current_user.username,
        details={"findings_count": len(findings)},
        ip_address=ctx.get("ip_address"),
        endpoint=ctx.get("endpoint"),
        request_method=ctx.get("request_method"),
    )

    return {
        "run_complete": True,
        "findings_count": len(findings),
        "findings": [
            {
                "severity": f.severity.value,
                "check_name": f.check_name,
                "message": f.message,
                "affected_count": f.affected_count,
            }
            for f in findings
        ],
    }


@router.put("/findings/{finding_id}/resolve", dependencies=[Depends(PermissionChecker("audit:view"))])
async def resolve_finding(
    finding_id: UUID,
    body: AlertAcknowledgeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Mark a finding as resolved."""
    service = DataIntegrityService(db)
    ctx = get_audit_context(request)

    finding = await service.resolve_finding(
        finding_id=finding_id,
        username=current_user.username,
        note=body.resolution_note,
    )
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")

    return {
        "id": str(finding.id),
        "resolved": finding.resolved,
        "resolved_by": finding.resolved_by,
        "resolved_at": finding.resolved_at.isoformat() if finding.resolved_at else None,
    }
