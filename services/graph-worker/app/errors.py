"""Errors that should mark a graph job as quarantined rather than failed."""

from __future__ import annotations


class QuarantineError(Exception):
    """Span/attribution/provenance failure — do not treat as a transient failure."""
