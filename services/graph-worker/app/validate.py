"""Validate extracted utterances against segments and controlled vocabularies."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.schema import ATTRIBUTION_MODES, POLARITIES, SPEECH_ACTS
from app.segmenter import TextSegment


@dataclass(frozen=True)
class ValidatedUtterance:
    text: str
    speech_act: str
    attribution_mode: str
    polarity: str
    modality: str
    confidence: float
    explicit: bool
    speaker_name: str | None
    segment_ord: int
    char_start: int
    char_end: int


def _as_int(value: Any, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field} must be an integer")
    return int(value)


def _first_str(raw: dict[str, Any], *keys: str) -> str:
    for key in keys:
        if key in raw and raw[key] is not None:
            value = str(raw[key]).strip()
            if value:
                return value
    return ""


def _first_present(raw: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in raw and raw[key] is not None:
            return raw[key]
    return None


def normalize_raw_utterance(raw: Any) -> dict[str, Any]:
    """Accept camelCase / snake_case / alternate keys from the LLM."""
    if not isinstance(raw, dict):
        raise ValueError(f"utterance must be an object, got {type(raw).__name__}")

    text = _first_str(
        raw, "text", "utterance", "utteranceText", "quote", "content", "spanText"
    )
    speech_act = _first_str(raw, "speechAct", "speech_act", "kind")
    attribution_mode = _first_str(
        raw, "attributionMode", "attribution_mode", "assertion_kind", "attribution"
    )
    legacy_attr = {
        "quoted": "direct_quote",
        "attributed": "paraphrase",
        "journalist": "journalist_voice",
        "inferred": "journalist_voice",
    }
    if attribution_mode in legacy_attr:
        attribution_mode = legacy_attr[attribution_mode]

    polarity = _first_str(raw, "polarity") or "affirms"
    modality = _first_str(raw, "modality")
    speaker = _first_present(raw, "speakerName", "speaker_name", "speaker", "actor")
    segment_ord = _first_present(
        raw, "segmentOrd", "segment_ord", "segmentIndex", "chunk_index"
    )
    char_start = _first_present(raw, "charStart", "char_start", "start", "span_start")
    char_end = _first_present(raw, "charEnd", "char_end", "end", "span_end")
    confidence = _first_present(raw, "confidence")
    explicit = _first_present(raw, "explicit")

    return {
        "text": text,
        "speechAct": speech_act,
        "attributionMode": attribution_mode,
        "polarity": polarity,
        "modality": modality,
        "confidence": 0.5 if confidence is None else confidence,
        "explicit": True if explicit is None else explicit,
        "speakerName": None if speaker is None else str(speaker).strip() or None,
        "segmentOrd": segment_ord,
        "charStart": char_start,
        "charEnd": char_end,
        "_raw_keys": sorted(str(k) for k in raw.keys()),
    }


def _normalize_for_search(value: str) -> str:
    collapsed = (
        value.replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u2014", "-")
        .replace("\u2013", "-")
        .replace("\xa0", " ")
    )
    # Preserve length for ASCII casefold mapping back to original offsets.
    return "".join(ch.lower() if ("A" <= ch <= "Z") else ch for ch in collapsed)


def _find_in_regions(
    haystack: str,
    needle: str,
    regions: list[tuple[int, int]],
) -> int | None:
    if not needle:
        return None
    for start, end in regions:
        idx = haystack[start:end].find(needle)
        if idx >= 0:
            return start + idx
    return None


def _token_overlap_ratio(a: str, b: str) -> float:
    ta = {w for w in _normalize_for_search(a).split() if len(w) > 2}
    tb = {w for w in _normalize_for_search(b).split() if len(w) > 2}
    if not ta:
        return 0.0
    return len(ta & tb) / len(ta)


def _expand_span(document_text: str, start: int, min_end: int) -> tuple[int, int]:
    """Grow a located prefix to a quote/sentence boundary when the model truncated."""
    end = max(min_end, start + 1)
    # Prefer closing curly/straight quote after start.
    for closer in ("\u201d", '"', "\u2019"):
        close_at = document_text.find(closer, end)
        if close_at != -1 and close_at - start <= 400:
            return start, close_at + 1
    # Else sentence end.
    for closer in (".", "!", "?"):
        close_at = document_text.find(closer, end)
        if close_at != -1 and close_at - start <= 400:
            return start, close_at + 1
    return start, min(len(document_text), start + max(40, min_end - start))


def _locate_span(
    *,
    document_text: str,
    text: str,
    preferred_start: int | None,
    preferred_end: int | None,
    segment: TextSegment,
) -> tuple[int, int, str]:
    """Resolve utterance text to absolute document offsets, correcting LLM drift."""
    needle = " ".join(text.strip().split())
    if not needle:
        raise ValueError("text is empty")

    search_regions: list[tuple[int, int]] = []
    preferred_ok = (
        preferred_start is not None
        and preferred_end is not None
        and 0 <= preferred_start < preferred_end <= len(document_text)
    )
    if preferred_ok:
        pad = 160
        search_regions.append(
            (
                max(0, preferred_start - pad),
                min(len(document_text), preferred_end + pad),
            )
        )
    search_regions.append((segment.char_start, segment.char_end))
    search_regions.append((0, len(document_text)))

    # 0) Prefer model offsets when the window overlaps the claimed text well.
    if preferred_ok:
        preferred_text = document_text[preferred_start:preferred_end].strip()
        if preferred_text and _token_overlap_ratio(needle, preferred_text) >= 0.55:
            return preferred_start, preferred_end, preferred_text

    # 1) Exact / whitespace-collapsed exact in original text.
    for start, end in search_regions:
        window = document_text[start:end]
        idx = window.find(text.strip())
        if idx >= 0:
            abs_start = start + idx
            abs_end = abs_start + len(text.strip())
            return abs_start, abs_end, document_text[abs_start:abs_end]

    # 2) Quote-/case-normalized full string (ASCII casefold keeps offsets aligned).
    norm_doc = _normalize_for_search(document_text)
    norm_needle = _normalize_for_search(needle)
    abs_start = _find_in_regions(norm_doc, norm_needle, search_regions)
    if abs_start is not None:
        abs_end = abs_start + len(norm_needle)
        return abs_start, abs_end, document_text[abs_start:abs_end]

    words = norm_needle.split()

    # 3) Longest contiguous word n-gram (not only prefixes) — recovers mid-sentence
    # skips like "Bill Pulte, …, was looking at cutting…".
    min_gram = 4 if len(words) >= 4 else max(2, len(words))
    max_gram = min(len(words), 28)
    for length in range(max_gram, min_gram - 1, -1):
        for i in range(0, len(words) - length + 1):
            phrase = " ".join(words[i : i + length])
            abs_start = _find_in_regions(norm_doc, phrase, search_regions)
            if abs_start is None:
                continue
            min_end = abs_start + len(phrase)
            abs_start, abs_end = _expand_span(document_text, abs_start, min_end)
            grounded = document_text[abs_start:abs_end].strip()
            if grounded and _token_overlap_ratio(needle, grounded) >= 0.4:
                return abs_start, abs_end, grounded

    # 4) Short prefix anchors when the model truncates mid-quote.
    for n in range(min(len(words), 16), 3, -1):
        prefix = " ".join(words[:n])
        abs_start = _find_in_regions(norm_doc, prefix, search_regions)
        if abs_start is None:
            continue
        min_end = abs_start + len(prefix)
        abs_start, abs_end = _expand_span(document_text, abs_start, min_end)
        grounded = document_text[abs_start:abs_end].strip()
        if grounded:
            return abs_start, abs_end, grounded

    raise ValueError(f"could not locate utterance text in document: {needle[:80]!r}")


def validate_utterances(
    raw_utterances: list[dict[str, Any]],
    *,
    document_text: str,
    segments: list[TextSegment],
) -> list[ValidatedUtterance]:
    """Validate all utterances or raise ValueError with aggregated reasons."""
    by_ord = {s.ord: s for s in segments}
    errors: list[str] = []
    validated: list[ValidatedUtterance] = []

    for i, original in enumerate(raw_utterances):
        prefix = f"utterance[{i}]"
        try:
            raw = normalize_raw_utterance(original)
            text = str(raw.get("text") or "").strip()

            speech_act = str(raw.get("speechAct") or "").strip()
            if speech_act not in SPEECH_ACTS:
                raise ValueError(
                    f"invalid speechAct {speech_act!r} (keys={raw.get('_raw_keys')})"
                )

            attribution_mode = str(raw.get("attributionMode") or "").strip()
            if attribution_mode not in ATTRIBUTION_MODES:
                raise ValueError(
                    f"invalid attributionMode {attribution_mode!r} "
                    f"(keys={raw.get('_raw_keys')})"
                )

            polarity = str(raw.get("polarity") or "").strip()
            if polarity not in POLARITIES:
                raise ValueError(f"invalid polarity {polarity!r}")

            modality = str(raw.get("modality") or "").strip()
            confidence = float(raw.get("confidence", 0.0))
            if not 0.0 <= confidence <= 1.0:
                raise ValueError(f"confidence out of range: {confidence}")

            explicit = bool(raw.get("explicit", True))
            speaker_name = raw.get("speakerName")
            if isinstance(speaker_name, str):
                speaker_name = speaker_name.strip() or None
            # Under-merge: LLM often tags paraphrase without a speaker. Prefer
            # journalist_voice over quarantining the whole document.
            if attribution_mode != "journalist_voice" and not speaker_name:
                attribution_mode = "journalist_voice"
                confidence = min(confidence, 0.55)

            segment_ord = _as_int(raw.get("segmentOrd"), "segmentOrd")
            if segment_ord not in by_ord:
                raise ValueError(f"unknown segmentOrd {segment_ord}")
            seg = by_ord[segment_ord]

            preferred_start = raw.get("charStart")
            preferred_end = raw.get("charEnd")
            try:
                preferred_start_i = (
                    _as_int(preferred_start, "charStart")
                    if preferred_start is not None
                    else None
                )
                preferred_end_i = (
                    _as_int(preferred_end, "charEnd")
                    if preferred_end is not None
                    else None
                )
            except ValueError:
                preferred_start_i = None
                preferred_end_i = None

            if not text and preferred_start_i is not None and preferred_end_i is not None:
                if 0 <= preferred_start_i < preferred_end_i <= len(document_text):
                    text = document_text[preferred_start_i:preferred_end_i].strip()

            char_start, char_end, grounded_text = _locate_span(
                document_text=document_text,
                text=text,
                preferred_start=preferred_start_i,
                preferred_end=preferred_end_i,
                segment=seg,
            )

            # Keep utterance associated with the segment that actually contains it.
            if not (seg.char_start <= char_start < char_end <= seg.char_end):
                for candidate in segments:
                    if candidate.char_start <= char_start < char_end <= candidate.char_end:
                        segment_ord = candidate.ord
                        seg = candidate
                        break
                else:
                    raise ValueError(
                        f"resolved span [{char_start},{char_end}) is not inside any segment"
                    )

            validated.append(
                ValidatedUtterance(
                    text=grounded_text,
                    speech_act=speech_act,
                    attribution_mode=attribution_mode,
                    polarity=polarity,
                    modality=modality,
                    confidence=confidence,
                    explicit=explicit,
                    speaker_name=speaker_name,
                    segment_ord=segment_ord,
                    char_start=char_start,
                    char_end=char_end,
                )
            )
        except (TypeError, ValueError) as exc:
            errors.append(f"{prefix}: {exc}")

    if errors:
        raise ValueError("; ".join(errors[:20]))

    return validated
