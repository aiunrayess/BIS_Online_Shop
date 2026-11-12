"""Small, dependency-free helpers for security and operational audit events."""

from typing import Any

from .models import SecurityAuditLog


def record_audit_event(
    event_type: str,
    *,
    actor=None,
    target_user=None,
    product=None,
    order=None,
    metadata: dict[str, Any] | None = None,
) -> SecurityAuditLog:
    """Persist a safe event record.

    Callers must never pass passwords, JWTs, payment data, or full request bodies
    in ``metadata``.  Keeping the helper here makes that boundary explicit and
    gives every privileged endpoint the same, queryable trail.
    """

    return SecurityAuditLog.objects.create(
        event_type=event_type,
        actor=actor if getattr(actor, 'is_authenticated', False) else None,
        target_user=target_user,
        product=product,
        order=order,
        metadata=metadata or {},
    )
