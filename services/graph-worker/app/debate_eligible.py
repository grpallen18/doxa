"""Write-time debate eligibility for L2 propositions."""

from __future__ import annotations

import re

from app.validate import ValidatedUtterance

NON_CLAIM_SPEECH = frozenset({"question", "definition", "other"})
ASSERTIVE_SPEECH = frozenset(
    {
        "assertion",
        "allegation",
        "prediction",
        "prescription",
        "judgment",
        "concession",
    }
)


def normalize_compare(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def is_utterance_echo(prop_text: str, utterance_text: str) -> bool:
    a = normalize_compare(prop_text)
    b = normalize_compare(utterance_text)
    if not a or not b:
        return True
    if a == b:
        return True
    shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
    if len(shorter) >= 20 and shorter in longer:
        return (len(shorter) / len(longer)) >= 0.9
    return False


def should_echo_fallback(speech_act: str) -> bool:
    """Verbatim utterance copy is only a last resort for assertive speech acts."""
    return speech_act in ASSERTIVE_SPEECH


def debate_eligible(prop_text: str, utterance: ValidatedUtterance) -> bool:
    if utterance.speech_act in NON_CLAIM_SPEECH:
        return False
    if is_utterance_echo(prop_text, utterance.text):
        return False
    return True
