"""Phase 1: link extracted propositions with high-precision matching."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

from app.config import (
    PROPOSITION_AUTO_LINK_THRESHOLD,
    PROPOSITION_VARIANT_MIN,
)
from app.embeddings import cosine_similarity
from app.proposition_extract import ExtractedProposition


def normalize_proposition_text(text: str) -> str:
    collapsed = re.sub(r"\s+", " ", text.strip().lower())
    return collapsed


def proposition_uid_from_text(
    normalized: str,
    *,
    certainty: str = "",
    timeframe: str = "",
    scope: str = "",
) -> str:
    material = f"{normalized}|{certainty}|{timeframe}|{scope}"
    digest = hashlib.sha256(material.encode("utf-8")).hexdigest()[:20]
    return f"prop:{digest}"


@dataclass(frozen=True)
class LinkedProposition:
    utterance_index: int
    proposition_uid: str
    text: str
    normalized_text: str
    certainty: str
    timeframe: str
    scope: str
    embedding: list[float]
    decision_status: str  # accepted | quarantined
    link_score: float | None
    matched_existing: bool
    variant_of_uid: str | None
    debate_eligible: bool


@dataclass(frozen=True)
class ExistingProposition:
    uid: str
    normalized_text: str
    certainty: str
    timeframe: str
    scope: str
    embedding: list[float]


def _scope_differs(a: ExtractedProposition, b: ExistingProposition) -> bool:
    """True when certainty/timeframe/scope conflict enough to prefer VARIANT_OF.

    Prefer under-merge: concrete vs unspecified also counts as a difference so we
    do not silently reuse a vague parent and drop richer metadata.
    """
    fields = (
        (a.certainty, b.certainty),
        (a.timeframe, b.timeframe),
        (a.scope, b.scope),
    )
    for left, right in fields:
        left_n = (left or "").strip().lower() or "unspecified"
        right_n = (right or "").strip().lower() or "unspecified"
        if left_n != right_n:
            return True
    return False


def link_propositions(
    extracted: list[ExtractedProposition],
    embeddings: list[list[float]],
    existing: list[ExistingProposition],
) -> list[LinkedProposition]:
    if len(extracted) != len(embeddings):
        raise ValueError("proposition embeddings length mismatch")

    linked: list[LinkedProposition] = []
    # Track newly created props within this batch for under-merge within-document.
    batch: list[ExistingProposition] = []

    for prop, emb in zip(extracted, embeddings):
        norm = normalize_proposition_text(prop.text)
        uid = proposition_uid_from_text(
            norm,
            certainty=prop.certainty,
            timeframe=prop.timeframe,
            scope=prop.scope,
        )

        best: ExistingProposition | None = None
        best_score = 0.0
        for cand in list(existing) + batch:
            score = cosine_similarity(emb, cand.embedding)
            if score > best_score:
                best_score = score
                best = cand

        variant_of = None
        matched = False
        status = "accepted"

        if best and best_score >= PROPOSITION_AUTO_LINK_THRESHOLD:
            if _scope_differs(prop, best):
                # Prefer VARIANT_OF over destructive merge even at high similarity.
                variant_of = best.uid
                matched = False
                status = "accepted"
            else:
                uid = best.uid
                matched = True
                status = "accepted"
        elif best and best_score >= PROPOSITION_VARIANT_MIN and _scope_differs(prop, best):
            # Prefer VARIANT_OF over destructive merge.
            variant_of = best.uid
            matched = False
            status = "accepted"
        elif best and best_score >= PROPOSITION_VARIANT_MIN:
            # Near-miss without clear scope diff — under-merge as new node, quarantine decision.
            matched = False
            status = "quarantined"
        else:
            # No strong candidate — create new proposition (under-merge).
            matched = False
            status = "accepted"

        row = LinkedProposition(
            utterance_index=prop.utterance_index,
            proposition_uid=uid,
            text=prop.text,
            normalized_text=norm,
            certainty=prop.certainty,
            timeframe=prop.timeframe,
            scope=prop.scope,
            embedding=emb,
            decision_status=status,
            link_score=best_score if best else None,
            matched_existing=matched,
            variant_of_uid=variant_of,
            debate_eligible=prop.debate_eligible,
        )
        linked.append(row)
        if not matched:
            batch.append(
                ExistingProposition(
                    uid=uid,
                    normalized_text=norm,
                    certainty=prop.certainty,
                    timeframe=prop.timeframe,
                    scope=prop.scope,
                    embedding=emb,
                )
            )
    return linked
