"""Doxa Neo4j graph-worker: poll Supabase jobs and write utterance-grounded graphs."""

from __future__ import annotations

import logging
import os
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from dotenv import load_dotenv

from app.config import Settings
from app.errors import QuarantineError
from app.jobs import (
    claim_jobs,
    finish_job_failure,
    finish_job_success,
    load_story_payload,
    make_supabase,
    stamp_job_runtime_versions,
    start_attempt,
)
from app.pipeline import process_story

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("graph-worker")

_wake = threading.Event()


def process_one_batch(settings: Settings) -> int:
    client = make_supabase(settings)
    jobs = claim_jobs(client, settings.worker_id, limit=1)
    if not jobs:
        return 0

    for job in jobs:
        job_id = job["id"]
        story_id = job["story_id"]
        attempt_number = int(job.get("attempt_count") or 1)
        attempt_id = None
        started = time.monotonic()

        try:
            client.table("stories").update({"graph_status": "running"}).eq(
                "story_id", story_id
            ).execute()

            attempt_id = start_attempt(
                client,
                job_id,
                attempt_number,
                settings.worker_id,
                settings.openai_model,
            )
            stamp_job_runtime_versions(client, job_id)
            story = load_story_payload(client, story_id)
            if not story:
                raise RuntimeError("Missing story or content_clean")

            result = process_story(settings, story)
            duration_ms = int((time.monotonic() - started) * 1000)
            finish_job_success(
                client,
                job_id=job_id,
                story_id=story_id,
                attempt_id=attempt_id,
                neo4j_story_element_id=result.get("neo4j_story_element_id"),
                model=result.get("model") or settings.openai_model,
                prompt_tokens=result.get("prompt_tokens"),
                completion_tokens=result.get("completion_tokens"),
                total_tokens=result.get("total_tokens"),
                duration_ms=duration_ms,
            )
            logger.info(
                "Job succeeded job_id=%s story_id=%s duration_ms=%s utterances=%s",
                job_id,
                story_id,
                duration_ms,
                result.get("utterance_count"),
            )
        except QuarantineError as exc:
            duration_ms = int((time.monotonic() - started) * 1000)
            logger.warning(
                "Job quarantined job_id=%s story_id=%s error=%s",
                job_id,
                story_id,
                exc,
            )
            finish_job_failure(
                client,
                job_id=job_id,
                story_id=story_id,
                attempt_id=attempt_id,
                error=str(exc),
                duration_ms=duration_ms,
                quarantine=True,
            )
        except Exception as exc:  # noqa: BLE001 — worker must never die on one job
            duration_ms = int((time.monotonic() - started) * 1000)
            logger.exception("Job failed job_id=%s story_id=%s", job_id, story_id)
            finish_job_failure(
                client,
                job_id=job_id,
                story_id=story_id,
                attempt_id=attempt_id,
                error=str(exc),
                duration_ms=duration_ms,
            )

    return len(jobs)


def poll_loop(settings: Settings) -> None:
    logger.info(
        "Graph worker started worker_id=%s poll_interval=%ss",
        settings.worker_id,
        settings.poll_interval_sec,
    )
    while True:
        try:
            n = process_one_batch(settings)
            if n == 0:
                _wake.wait(timeout=settings.poll_interval_sec)
                _wake.clear()
        except Exception:  # noqa: BLE001
            logger.exception("Poll loop error")
            time.sleep(settings.poll_interval_sec)


class Handler(BaseHTTPRequestHandler):
    settings: Settings

    def log_message(self, fmt: str, *args: object) -> None:
        logger.debug("http: " + fmt, *args)

    def _auth_ok(self) -> bool:
        secret = self.settings.graph_worker_secret
        if not secret:
            return True
        auth = self.headers.get("Authorization", "")
        return auth == f"Bearer {secret}"

    def do_GET(self) -> None:  # noqa: N802
        if self.path.rstrip("/") in ("/health", "/healthz"):
            body = b'{"ok":true,"service":"graph-worker"}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self) -> None:  # noqa: N802
        if self.path.rstrip("/") != "/run":
            self.send_response(404)
            self.end_headers()
            return
        if not self._auth_ok():
            self.send_response(401)
            self.end_headers()
            return
        _wake.set()
        body = b'{"ok":true,"woke":true}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    load_dotenv()
    settings = Settings.from_env()
    Handler.settings = settings

    thread = threading.Thread(target=poll_loop, args=(settings,), daemon=True)
    thread.start()

    server = ThreadingHTTPServer(("0.0.0.0", settings.http_port), Handler)
    logger.info(
        "HTTP listening on :%s at %s",
        settings.http_port,
        datetime.now(timezone.utc).isoformat(),
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
