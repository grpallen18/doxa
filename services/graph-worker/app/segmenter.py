"""Deterministic paragraph-aware segmentation with absolute char offsets."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TextSegment:
    ord: int
    text: str
    char_start: int
    char_end: int  # exclusive

    @property
    def uid_suffix(self) -> str:
        return f"seg:{self.ord}"


def segment_uid(document_uid: str, ord_: int) -> str:
    return f"{document_uid}:seg:{ord_}"


def segment_text(
    body: str,
    *,
    max_chars: int = 1500,
    min_chars: int = 80,
) -> list[TextSegment]:
    """Split body into segments; offsets refer to the original `body` string."""
    if not body or not body.strip():
        return []

    # Split on blank lines while preserving positions in the original string.
    blocks: list[tuple[int, int, str]] = []
    i = 0
    n = len(body)
    while i < n:
        while i < n and body[i] in "\r\n":
            i += 1
        if i >= n:
            break
        start = i
        while i < n:
            if body[i] == "\n" and (i + 1 >= n or body[i + 1] == "\n"):
                break
            if body[i] == "\r" and i + 1 < n and body[i + 1] == "\n":
                if i + 2 >= n or body[i + 2] == "\n" or body[i + 2] == "\r":
                    break
            i += 1
        end = i
        text = body[start:end].strip("\r\n")
        # Recompute start/end for stripped edges within [start, end)
        if text:
            rel = body[start:end].find(text)
            abs_start = start + rel
            abs_end = abs_start + len(text)
            blocks.append((abs_start, abs_end, text))
        i = max(i + 1, end + 1) if end < n else n

    if not blocks:
        stripped = body.strip()
        if not stripped:
            return []
        rel = body.find(stripped)
        return [
            TextSegment(
                ord=0,
                text=stripped,
                char_start=rel,
                char_end=rel + len(stripped),
            )
        ]

    # Merge tiny blocks into the previous segment when possible.
    merged: list[tuple[int, int, str]] = []
    for start, end, text in blocks:
        if merged and len(text) < min_chars and (end - merged[-1][0]) <= max_chars:
            prev_start, _, prev_text = merged[-1]
            combined = body[prev_start:end]
            merged[-1] = (prev_start, end, combined)
        else:
            merged.append((start, end, text))

    # Split oversized segments on sentence-ish boundaries.
    final: list[tuple[int, int, str]] = []
    for start, end, text in merged:
        if end - start <= max_chars:
            final.append((start, end, body[start:end]))
            continue
        cursor = start
        while cursor < end:
            window_end = min(cursor + max_chars, end)
            if window_end < end:
                slice_ = body[cursor:window_end]
                # Prefer break after sentence end near the window end.
                break_at = max(
                    slice_.rfind(". "),
                    slice_.rfind("? "),
                    slice_.rfind("! "),
                    slice_.rfind("\n"),
                )
                if break_at >= max_chars // 3:
                    window_end = cursor + break_at + 1
            final.append((cursor, window_end, body[cursor:window_end]))
            cursor = window_end

    return [
        TextSegment(ord=i, text=text, char_start=start, char_end=end)
        for i, (start, end, text) in enumerate(final)
    ]
