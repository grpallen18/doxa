"""LLM utterance extraction via OpenAI JSON object responses."""

from __future__ import annotations

import json
import logging
from typing import Any

from openai import OpenAI

from app.openai_compat import chat_completion_kwargs
from app.schema import UTTERANCE_EXTRACT_SYSTEM
from app.segmenter import TextSegment

logger = logging.getLogger(__name__)


def _build_user_prompt(
    *,
    title: str | None,
    document_text: str,
    segments: list[TextSegment],
) -> str:
    segment_lines = []
    for seg in segments:
        preview = seg.text if len(seg.text) <= 500 else seg.text[:500] + "…"
        segment_lines.append(
            f"- ord={seg.ord} charStart={seg.char_start} charEnd={seg.char_end}\n"
            f"  text: {preview}"
        )
    segments_block = "\n".join(segment_lines)
    return (
        f"TITLE: {title or ''}\n\n"
        f"SEGMENTS (use these ord values and absolute offsets into FULL_DOCUMENT):\n"
        f"{segments_block}\n\n"
        f"FULL_DOCUMENT:\n{document_text}\n\n"
        "Return JSON: {\"utterances\": [ ... ]}"
    )


def extract_utterances(
    *,
    api_key: str,
    model: str,
    title: str | None,
    document_text: str,
    segments: list[TextSegment],
) -> tuple[list[dict[str, Any]], dict[str, int | None]]:
    """Return (raw utterance dicts, token usage)."""
    client = OpenAI(api_key=api_key)
    user_prompt = _build_user_prompt(
        title=title, document_text=document_text, segments=segments
    )

    response = client.chat.completions.create(
        **chat_completion_kwargs(
            model,
            temperature=0,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": UTTERANCE_EXTRACT_SYSTEM},
                {"role": "user", "content": user_prompt},
            ],
        )
    )

    usage = response.usage
    token_usage: dict[str, int | None] = {
        "prompt_tokens": getattr(usage, "prompt_tokens", None) if usage else None,
        "completion_tokens": getattr(usage, "completion_tokens", None) if usage else None,
        "total_tokens": getattr(usage, "total_tokens", None) if usage else None,
    }

    content = response.choices[0].message.content or "{}"
    try:
        payload = json.loads(content)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Extractor returned invalid JSON: {exc}") from exc

    utterances = payload.get("utterances")
    if utterances is None:
        raise ValueError("Extractor JSON missing 'utterances' array")
    if not isinstance(utterances, list):
        raise ValueError("'utterances' must be an array")

    logger.info("Extracted %s raw utterances", len(utterances))
    if utterances:
        sample = utterances[0]
        if isinstance(sample, dict):
            logger.info("Sample utterance keys=%s", sorted(sample.keys()))
        else:
            logger.info("Sample utterance type=%s", type(sample).__name__)
    return utterances, token_usage
