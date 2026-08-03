"""Phase 1: map validated utterances to proposition texts via LLM."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from openai import OpenAI

from app.openai_compat import chat_completion_kwargs
from app.validate import ValidatedUtterance

SYSTEM = """You extract normalized Propositions from political discourse Utterances.
Return ONLY valid JSON:
{"propositions":[{"utterance_index":0,"text":"...","certainty":"asserted|hedged|unknown","timeframe":"past|present|future|unspecified","scope":"general|conditional|unspecified"}]}

Rules:
- One primary proposition per utterance (utterance_index matches input order).
- text is the meaning in plain English, not a quote copy; keep speaker intent.
- Prefer under-merge: do not invent facts absent from the utterance.
- certainty/timeframe/scope help VARIANT_OF decisions later.
"""


@dataclass(frozen=True)
class ExtractedProposition:
    utterance_index: int
    text: str
    certainty: str
    timeframe: str
    scope: str


def _parse_json_object(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


def extract_propositions(
    *,
    api_key: str,
    model: str,
    utterances: list[ValidatedUtterance],
) -> tuple[list[ExtractedProposition], dict[str, int | None]]:
    if not utterances:
        return [], {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
        }

    payload = {
        "utterances": [
            {
                "index": i,
                "text": u.text,
                "speech_act": u.speech_act,
                "attribution_mode": u.attribution_mode,
                "speaker": u.speaker_name,
            }
            for i, u in enumerate(utterances)
        ]
    }
    client = OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        **chat_completion_kwargs(
            model,
            temperature=0,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": json.dumps(payload)},
            ],
        )
    )
    usage = response.usage
    token_usage = {
        "prompt_tokens": getattr(usage, "prompt_tokens", None) if usage else None,
        "completion_tokens": getattr(usage, "completion_tokens", None) if usage else None,
        "total_tokens": getattr(usage, "total_tokens", None) if usage else None,
    }
    content = response.choices[0].message.content or "{}"
    data = _parse_json_object(content)
    raw_list = data.get("propositions") or []
    out: list[ExtractedProposition] = []
    for item in raw_list:
        if not isinstance(item, dict):
            continue
        try:
            idx = int(item.get("utterance_index"))
        except (TypeError, ValueError):
            continue
        text = str(item.get("text") or "").strip()
        if not text or idx < 0 or idx >= len(utterances):
            continue
        out.append(
            ExtractedProposition(
                utterance_index=idx,
                text=text,
                certainty=str(item.get("certainty") or "unspecified"),
                timeframe=str(item.get("timeframe") or "unspecified"),
                scope=str(item.get("scope") or "unspecified"),
            )
        )

    # Ensure every utterance has at least one proposition (under-merge fallback).
    covered = {p.utterance_index for p in out}
    for i, u in enumerate(utterances):
        if i not in covered:
            out.append(
                ExtractedProposition(
                    utterance_index=i,
                    text=u.text.strip(),
                    certainty="unspecified",
                    timeframe="unspecified",
                    scope="unspecified",
                )
            )
    out.sort(key=lambda p: (p.utterance_index, p.text))
    return out, token_usage
