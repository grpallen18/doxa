"""OpenAI chat.completions helpers for graph-worker extractors."""

from __future__ import annotations

from typing import Any


def model_omits_temperature(model: str) -> bool:
    """GPT-5+ / o-series reject non-default temperature (omit the param)."""
    m = (model or "").strip().lower()
    return (
        m.startswith("gpt-5")
        or m.startswith("o1")
        or m.startswith("o3")
        or m.startswith("o4")
    )


def chat_completion_kwargs(model: str, **extra: Any) -> dict[str, Any]:
    """Build create() kwargs; skip temperature when the model forbids it."""
    kwargs: dict[str, Any] = {"model": model, **extra}
    if model_omits_temperature(model):
        kwargs.pop("temperature", None)
    elif "temperature" not in kwargs:
        kwargs["temperature"] = 0
    return kwargs
