"""Supabase job claim / complete helpers."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from supabase import Client, create_client

from app.config import EXTRACTOR_VERSION, GRAPH_SCHEMA_VERSION, Settings


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def make_supabase(settings: Settings) -> Client:
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def claim_jobs(client: Client, worker_id: str, limit: int = 1) -> list[dict[str, Any]]:
    result = client.rpc(
        "claim_graph_processing_jobs",
        {"p_worker_id": worker_id, "p_limit": limit},
    ).execute()
    rows = result.data or []
    return rows if isinstance(rows, list) else []


def load_story_payload(client: Client, story_id: str) -> dict[str, Any] | None:
    story = (
        client.table("stories")
        .select("story_id, title, url, published_at, source_id, sources(name)")
        .eq("story_id", story_id)
        .maybe_single()
        .execute()
    )
    if not story.data:
        return None

    body = (
        client.table("story_bodies")
        .select("content_clean")
        .eq("story_id", story_id)
        .maybe_single()
        .execute()
    )
    content_clean = (body.data or {}).get("content_clean") if body.data else None
    if not content_clean or not str(content_clean).strip():
        return None

    row = dict(story.data)
    sources = row.pop("sources", None)
    source_name = None
    if isinstance(sources, dict):
        source_name = sources.get("name")
    elif isinstance(sources, list) and sources:
        source_name = sources[0].get("name")

    return {
        **row,
        "source_name": source_name,
        "content_clean": str(content_clean).strip(),
    }


def start_attempt(
    client: Client,
    job_id: str,
    attempt_number: int,
    worker_id: str,
    model: str,
) -> str:
    result = (
        client.table("graph_processing_attempts")
        .insert(
            {
                "job_id": job_id,
                "attempt_number": attempt_number,
                "worker_id": worker_id,
                "status": "running",
                "model": model,
            }
        )
        .execute()
    )
    return result.data[0]["id"]


def finish_job_success(
    client: Client,
    *,
    job_id: str,
    story_id: str,
    attempt_id: str,
    neo4j_story_element_id: str | None,
    model: str,
    prompt_tokens: int | None,
    completion_tokens: int | None,
    total_tokens: int | None,
    duration_ms: int,
) -> None:
    now = _now()
    updated = (
        client.table("graph_processing_jobs")
        .update(
            {
                "status": "succeeded",
                "finished_at": now,
                "updated_at": now,
                "error": None,
                "neo4j_story_element_id": neo4j_story_element_id,
                "schema_version": GRAPH_SCHEMA_VERSION,
                "extractor_version": EXTRACTOR_VERSION,
                "model": model,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": total_tokens,
                "locked_at": None,
                "locked_by": None,
            }
        )
        .eq("id", job_id)
        .eq("status", "running")
        .select("id")
        .execute()
    )
    if not updated.data:
        client.table("graph_processing_attempts").update(
            {
                "status": "failed",
                "finished_at": now,
                "duration_ms": duration_ms,
                "error": "Job no longer running when worker finished (superseded)",
            }
        ).eq("id", attempt_id).execute()
        return

    client.table("graph_processing_attempts").update(
        {
            "status": "succeeded",
            "finished_at": now,
            "duration_ms": duration_ms,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
            "model": model,
        }
    ).eq("id", attempt_id).execute()

    client.table("stories").update(
        {
            "graph_status": "succeeded",
            "neo4j_element_id": neo4j_story_element_id,
        }
    ).eq("story_id", story_id).execute()


def finish_job_failure(
    client: Client,
    *,
    job_id: str,
    story_id: str,
    attempt_id: str | None,
    error: str,
    duration_ms: int | None = None,
    quarantine: bool = False,
) -> None:
    now = _now()
    status = "quarantined" if quarantine else "failed"

    updated = (
        client.table("graph_processing_jobs")
        .update(
            {
                "status": status,
                "finished_at": now,
                "updated_at": now,
                "error": error[:4000],
                "locked_at": None,
                "locked_by": None,
            }
        )
        .eq("id", job_id)
        .eq("status", "running")
        .select("id")
        .execute()
    )
    if not updated.data:
        if attempt_id:
            client.table("graph_processing_attempts").update(
                {
                    "status": "failed",
                    "finished_at": now,
                    "duration_ms": duration_ms,
                    "error": f"Superseded job; original error: {error[:2000]}",
                }
            ).eq("id", attempt_id).execute()
        return

    if attempt_id:
        client.table("graph_processing_attempts").update(
            {
                "status": status,
                "finished_at": now,
                "duration_ms": duration_ms,
                "error": error[:4000],
            }
        ).eq("id", attempt_id).execute()

    client.table("stories").update({"graph_status": status}).eq(
        "story_id", story_id
    ).execute()
