"""Doxa graph-worker configuration and version constants."""

from __future__ import annotations

import os
from dataclasses import dataclass


# Keep in sync with doxa-agents/docs/architecture/neo4j-graph-architecture.md
# and doxa-agents/lib/graph-jobs.ts
GRAPH_SCHEMA_VERSION = "2.2.1"
EXTRACTOR_VERSION = "2.2.1-debate-eligible"

# Phase 1 auto-link: cosine ≥ this may reuse an existing Proposition/Entity.
PROPOSITION_AUTO_LINK_THRESHOLD = 0.92
ENTITY_AUTO_LINK_THRESHOLD = 0.92
# Near-miss band may create VARIANT_OF instead of merge.
PROPOSITION_VARIANT_MIN = 0.75


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_service_role_key: str
    neo4j_uri: str
    neo4j_username: str
    neo4j_password: str
    neo4j_database: str
    openai_api_key: str
    openai_model: str
    openai_embedding_model: str
    worker_id: str
    poll_interval_sec: float
    graph_worker_secret: str | None
    http_port: int

    @staticmethod
    def from_env() -> "Settings":
        missing = [
            name
            for name in (
                "SUPABASE_URL",
                "SUPABASE_SERVICE_ROLE_KEY",
                "NEO4J_URI",
                "NEO4J_USERNAME",
                "NEO4J_PASSWORD",
                "OPENAI_API_KEY",
            )
            if not os.getenv(name)
        ]
        if missing:
            raise RuntimeError(f"Missing required env vars: {', '.join(missing)}")

        return Settings(
            supabase_url=os.environ["SUPABASE_URL"].rstrip("/"),
            supabase_service_role_key=os.environ["SUPABASE_SERVICE_ROLE_KEY"],
            neo4j_uri=os.environ["NEO4J_URI"],
            neo4j_username=os.environ["NEO4J_USERNAME"],
            neo4j_password=os.environ["NEO4J_PASSWORD"],
            neo4j_database=os.getenv("NEO4J_DATABASE", "neo4j"),
            openai_api_key=os.environ["OPENAI_API_KEY"],
            openai_model=os.getenv("OPENAI_MODEL", "gpt-5.6-luna"),
            openai_embedding_model=os.getenv(
                "OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"
            ),
            worker_id=os.getenv("GRAPH_WORKER_ID", "graph-worker-1"),
            poll_interval_sec=float(os.getenv("GRAPH_WORKER_POLL_INTERVAL_SEC", "5")),
            graph_worker_secret=os.getenv("GRAPH_WORKER_SECRET"),
            http_port=int(os.getenv("PORT", "8080")),
        )
