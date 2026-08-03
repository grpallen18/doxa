"""OpenAI embeddings helper for Phase 1 candidate generation."""

from __future__ import annotations

import math
from typing import Sequence

from openai import OpenAI


def embed_texts(
    *,
    api_key: str,
    model: str,
    texts: Sequence[str],
) -> list[list[float]]:
    if not texts:
        return []
    client = OpenAI(api_key=api_key)
    # OpenAI rejects empty strings
    cleaned = [t if t.strip() else " " for t in texts]
    response = client.embeddings.create(model=model, input=list(cleaned))
    by_index = {item.index: item.embedding for item in response.data}
    return [list(by_index[i]) for i in range(len(cleaned))]


def cosine_similarity(a: Sequence[float], b: Sequence[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na <= 0.0 or nb <= 0.0:
        return 0.0
    return dot / (math.sqrt(na) * math.sqrt(nb))
