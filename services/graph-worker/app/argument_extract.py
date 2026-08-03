"""Phase 2a: extract Argument hyperedges (roles over Propositions) via LLM."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from typing import Any

from app.openai_compat import chat_completion_kwargs
from app.proposition_link import LinkedProposition
from app.validate import ValidatedUtterance

ARGUMENT_ROLES = frozenset(
    {
        "premise",
        "conclusion",
        "assumption",
        "objection",
        "rebuttal",
        "qualifier",
        "value",
        "prediction",
    }
)

SYSTEM = """You extract Arguments from political discourse.
An Argument is a small inferential structure linking Propositions via roles.

Return ONLY valid JSON:
{"arguments":[{"summary":"...","roles":[{"role":"premise|conclusion|assumption|objection|rebuttal|qualifier|value|prediction","proposition_index":0}]}]}

Rules:
- proposition_index refers to the input propositions list (0-based).
- Prefer 1–4 arguments per document; under-merge.
- Every argument needs at least one conclusion OR prediction OR value, plus at least one other role when possible.
- Do not invent propositions; only use provided indices.
- Prefer under-merge: skip weak or single-proposition "arguments".
"""


@dataclass(frozen=True)
class ArgumentRoleLink:
    role: str
    proposition_uid: str
    utterance_index: int


@dataclass(frozen=True)
class ExtractedArgument:
    uid: str
    summary: str
    roles: tuple[ArgumentRoleLink, ...]


def argument_uid(document_uid: str, summary: str, role_key: str) -> str:
    digest = hashlib.sha256(
        f"{document_uid}|{summary}|{role_key}".encode("utf-8")
    ).hexdigest()[:20]
    return f"{document_uid}:arg:{digest}"


def _parse_json_object(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


def extract_arguments(
    *,
    api_key: str,
    model: str,
    document_uid: str,
    utterances: list[ValidatedUtterance],
    linked_props: list[LinkedProposition],
) -> tuple[list[ExtractedArgument], dict[str, int | None]]:
    empty_tokens = {
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
    }
    if not linked_props:
        return [], empty_tokens

    # One prop entry per linked row (may share utterance_index).
    prop_payload = []
    for i, p in enumerate(linked_props):
        prop_payload.append(
            {
                "index": i,
                "utterance_index": p.utterance_index,
                "text": p.text,
                "proposition_uid": p.proposition_uid,
            }
        )

    payload = {
        "utterances": [
            {
                "index": i,
                "text": u.text,
                "speaker": u.speaker_name,
            }
            for i, u in enumerate(utterances)
        ],
        "propositions": prop_payload,
    }

    client = __import__("openai", fromlist=["OpenAI"]).OpenAI(api_key=api_key)
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
    raw_list = data.get("arguments") or []

    out: list[ExtractedArgument] = []
    for item in raw_list:
        if not isinstance(item, dict):
            continue
        summary = str(item.get("summary") or "").strip()
        raw_roles = item.get("roles") or []
        if not summary or not isinstance(raw_roles, list):
            continue
        roles: list[ArgumentRoleLink] = []
        for rr in raw_roles:
            if not isinstance(rr, dict):
                continue
            role = str(rr.get("role") or "").strip().lower()
            if role not in ARGUMENT_ROLES:
                continue
            try:
                pidx = int(rr.get("proposition_index"))
            except (TypeError, ValueError):
                continue
            if pidx < 0 or pidx >= len(linked_props):
                continue
            prop = linked_props[pidx]
            roles.append(
                ArgumentRoleLink(
                    role=role,
                    proposition_uid=prop.proposition_uid,
                    utterance_index=prop.utterance_index,
                )
            )
        # Prefer under-merge: need ≥2 roles or a single strong conclusion-like role with ≥1 other.
        if len(roles) < 2:
            continue
        role_key = "|".join(sorted(f"{r.role}:{r.proposition_uid}" for r in roles))
        out.append(
            ExtractedArgument(
                uid=argument_uid(document_uid, summary, role_key),
                summary=summary,
                roles=tuple(roles),
            )
        )
    return out, token_usage


def validate_argument_roles(roles: list[ArgumentRoleLink] | tuple[ArgumentRoleLink, ...]) -> bool:
    if len(roles) < 2:
        return False
    return all(r.role in ARGUMENT_ROLES for r in roles)
