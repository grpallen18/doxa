"""Phase 1: cautious Entity ER from speakers / proposition text mentions."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

from app.config import ENTITY_AUTO_LINK_THRESHOLD
from app.embeddings import cosine_similarity
from app.validate import ValidatedUtterance

# Courtesy honorifics — strip only; never promote to Office nodes.
_HONORIFICS = re.compile(
    r"^(?:mr|mrs|ms|miss|dr|prof|professor|sir|madam|dame)\.?\s+",
    re.I,
)
_LEADING_PARTY = re.compile(
    r"^(?:(?:republican|democratic|democrat|gop|independent)\s+)+",
    re.I,
)

# Office-like titles → canonical Office Entity display name.
# Longer phrases first so "attorney general" wins over "general".
_TITLE_OFFICE_MAP: tuple[tuple[re.Pattern[str], str, str], ...] = (
    (re.compile(r"^attorney\s+general\b\.?\s*", re.I), "Attorney General", "attorney general"),
    (re.compile(r"^secretary\s+of\s+state\b\.?\s*", re.I), "Secretary of State", "secretary of state"),
    (
        re.compile(r"^(?:senate\s+)?(?:majority|minority)\s+leader\b\.?\s*", re.I),
        "Senate Leader",
        "senate leader",
    ),
    (re.compile(r"^vice\s+president\b\.?\s*", re.I), "Vice President", "vice president"),
    (re.compile(r"^president\b\.?\s*", re.I), "President", "president"),
    (re.compile(r"^governor\b\.?\s*", re.I), "Governor", "governor"),
    (re.compile(r"^senator\b\.?\s*", re.I), "Senator", "senator"),
    (re.compile(r"^sen\.?\s+", re.I), "Senator", "senator"),
    (re.compile(r"^representative\b\.?\s*", re.I), "Representative", "representative"),
    (re.compile(r"^rep\.?\s+", re.I), "Representative", "representative"),
    (re.compile(r"^congressman\b\.?\s*", re.I), "Representative", "representative"),
    (re.compile(r"^congresswoman\b\.?\s*", re.I), "Representative", "representative"),
    (re.compile(r"^secretary\b\.?\s*", re.I), "Secretary", "secretary"),
    (re.compile(r"^director\b\.?\s*", re.I), "Director", "director"),
    (re.compile(r"^mayor\b\.?\s*", re.I), "Mayor", "mayor"),
    (re.compile(r"^ambassador\b\.?\s*", re.I), "Ambassador", "ambassador"),
    (re.compile(r"^speaker\b\.?\s*", re.I), "Speaker", "speaker"),
)

# Org / institution cues (no person name).
_OFFICE_ORG_PATTERNS = re.compile(
    r"\b(office|department|agency|odni|dni)\b",
    re.I,
)
_PERSON_HINT = re.compile(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b")
_SINGLE_NAME = re.compile(r"^[A-Z][a-z]+(?:['’-][A-Z]?[a-z]+)*$")
# Joint attribution: "Mark Warner and Rep. Jim Himes", "A, B, and C".
_SPEAKER_LIST_SPLIT = re.compile(
    r"\s*,\s*(?:and\s+|&\s+)?|\s+and\s+|\s+&\s+",
    re.I,
)


def normalize_entity_name(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip().lower())


def entity_uid_from_name(normalized: str, *, kind: str = "person") -> str:
    digest = hashlib.sha256(f"{kind}|{normalized}".encode("utf-8")).hexdigest()[:20]
    return f"ent:{digest}"


def office_uid_from_normalized(normalized: str) -> str:
    return entity_uid_from_name(normalized, kind="office")


@dataclass(frozen=True)
class ParsedSpeakerName:
    surface_form: str
    name: str
    normalized_name: str
    kind_hint: str  # person | office | org | unknown
    title: str | None
    office_name: str | None
    office_normalized: str | None


@dataclass(frozen=True)
class EntityMention:
    surface_form: str
    name: str
    normalized_name: str
    kind_hint: str
    title: str | None
    office_name: str | None
    office_normalized: str | None
    source: str  # speaker | text


@dataclass(frozen=True)
class UtteranceMentionRef:
    utterance_index: int
    surface_form: str
    title: str | None
    office_name: str | None
    office_normalized: str | None


@dataclass(frozen=True)
class LinkedEntity:
    uid: str
    name: str
    normalized_name: str
    kind_hint: str
    embedding: list[float]
    decision_status: str
    matched_existing: bool
    link_score: float | None
    mentions: tuple[UtteranceMentionRef, ...]


@dataclass(frozen=True)
class ExistingEntity:
    uid: str
    normalized_name: str
    kind_hint: str
    embedding: list[float]


def _looks_like_person_clause(clause: str) -> bool:
    """True when a list segment is a titled/untitled person (not an org with 'and')."""
    surface = re.sub(r"\s+", " ", clause.strip())
    if not surface:
        return False
    working = _HONORIFICS.sub("", surface).strip()
    working = re.sub(r"^(?:the\s+)", "", working, flags=re.I).strip()
    working = _LEADING_PARTY.sub("", working).strip()
    remainder = working
    for pattern, _canon, _norm in _TITLE_OFFICE_MAP:
        match = pattern.match(working)
        if match:
            remainder = working[match.end() :].strip(" ,")
            break
    remainder_clean = remainder.strip()
    if not remainder_clean:
        return False
    if _OFFICE_ORG_PATTERNS.search(remainder_clean) or classify_orgish(remainder_clean):
        return False
    return bool(
        _PERSON_HINT.search(remainder_clean) or _SINGLE_NAME.match(remainder_clean)
    )


def split_conjoined_speaker_names(raw: str) -> list[str]:
    """Split joint attribution into one surface form per person.

    Only splits when every clause looks person-like, so org names that contain
    'and' (e.g. committee titles) stay intact.
    """
    surface = re.sub(r"\s+", " ", raw.strip())
    if not surface:
        return []
    parts = [p.strip(" ,") for p in _SPEAKER_LIST_SPLIT.split(surface) if p.strip(" ,")]
    if len(parts) <= 1:
        return [surface]
    if all(_looks_like_person_clause(p) for p in parts):
        return parts
    return [surface]


def parse_speaker_name(raw: str) -> ParsedSpeakerName:
    """Split surface form into canonical person/office name + optional Office title."""
    surface = re.sub(r"\s+", " ", raw.strip())
    if not surface:
        return ParsedSpeakerName(
            surface_form="",
            name="",
            normalized_name="",
            kind_hint="unknown",
            title=None,
            office_name=None,
            office_normalized=None,
        )

    working = _HONORIFICS.sub("", surface).strip()
    working = re.sub(r"^(?:the\s+)", "", working, flags=re.I).strip()
    working = _LEADING_PARTY.sub("", working).strip()
    title: str | None = None
    office_name: str | None = None
    office_normalized: str | None = None
    remainder = working

    for pattern, canon_office, office_norm in _TITLE_OFFICE_MAP:
        match = pattern.match(working)
        if not match:
            continue
        title = canon_office
        office_name = canon_office
        office_normalized = office_norm
        remainder = working[match.end() :].strip(" ,")
        break

    remainder_clean = remainder.strip()

    looks_like_person = bool(
        remainder_clean
        and (
            _PERSON_HINT.search(remainder_clean)
            or _SINGLE_NAME.match(remainder_clean)
        )
    )
    if looks_like_person:
        name = remainder_clean
        return ParsedSpeakerName(
            surface_form=surface,
            name=name,
            normalized_name=normalize_entity_name(name),
            kind_hint="person",
            title=title,
            office_name=office_name,
            office_normalized=office_normalized,
        )

    # Title with no person remainder → office node only
    if office_name and not remainder_clean:
        return ParsedSpeakerName(
            surface_form=surface,
            name=office_name,
            normalized_name=office_normalized or normalize_entity_name(office_name),
            kind_hint="office",
            title=None,
            office_name=None,
            office_normalized=None,
        )

    # Org / institution phrase
    probe = remainder_clean or working
    if _OFFICE_ORG_PATTERNS.search(probe) or (
        office_name is None and classify_orgish(probe)
    ):
        name = probe
        return ParsedSpeakerName(
            surface_form=surface,
            name=name,
            normalized_name=normalize_entity_name(name),
            kind_hint="office",
            title=None,
            office_name=None,
            office_normalized=None,
        )

    name = probe or surface
    return ParsedSpeakerName(
        surface_form=surface,
        name=name,
        normalized_name=normalize_entity_name(name),
        kind_hint="unknown",
        title=title,
        office_name=office_name,
        office_normalized=office_normalized,
    )


def parse_speaker_names(raw: str) -> list[ParsedSpeakerName]:
    """Parse one or more speakers from a possibly conjoined speakerName."""
    return [
        parse_speaker_name(part)
        for part in split_conjoined_speaker_names(raw)
        if part.strip()
    ]


def classify_orgish(name: str) -> bool:
    return bool(
        re.search(
            r"\b(department|office|agency|ministry|commission|committee|house|senate)\b",
            name,
            re.I,
        )
    )


def classify_mention(name: str) -> str:
    """Backward-compatible classifier used by tests / callers."""
    return parse_speaker_name(name).kind_hint


def never_merge_kinds(a: str, b: str) -> bool:
    pair = {a, b}
    if "office" in pair and "person" in pair:
        return True
    if "org" in pair and "person" in pair:
        return True
    return False


def collect_mentions(utterances: list[ValidatedUtterance]) -> list[tuple[int, EntityMention]]:
    out: list[tuple[int, EntityMention]] = []
    for i, u in enumerate(utterances):
        if not u.speaker_name or not u.speaker_name.strip():
            continue
        for parsed in parse_speaker_names(u.speaker_name):
            if not parsed.normalized_name:
                continue
            out.append(
                (
                    i,
                    EntityMention(
                        surface_form=parsed.surface_form,
                        name=parsed.name,
                        normalized_name=parsed.normalized_name,
                        kind_hint=parsed.kind_hint,
                        title=parsed.title,
                        office_name=parsed.office_name,
                        office_normalized=parsed.office_normalized,
                        source="speaker",
                    ),
                )
            )
    return out


def link_entities(
    mentions: list[tuple[int, EntityMention]],
    embeddings: list[list[float]],
    existing: list[ExistingEntity],
) -> list[LinkedEntity]:
    if len(mentions) != len(embeddings):
        raise ValueError("entity embeddings length mismatch")

    # Group by kind + normalized canonical name within batch
    by_key: dict[tuple[str, str], list[int]] = {}
    for idx, (_utt_i, mention) in enumerate(mentions):
        by_key.setdefault((mention.kind_hint, mention.normalized_name), []).append(idx)

    linked: list[LinkedEntity] = []
    batch: list[ExistingEntity] = []
    seen: set[tuple[str, str]] = set()

    for key, idxs in by_key.items():
        if key in seen:
            continue
        seen.add(key)
        kind_hint, norm = key
        first = idxs[0]
        mention = mentions[first][1]
        emb = embeddings[first]
        refs = tuple(
            UtteranceMentionRef(
                utterance_index=mentions[i][0],
                surface_form=mentions[i][1].surface_form,
                title=mentions[i][1].title,
                office_name=mentions[i][1].office_name,
                office_normalized=mentions[i][1].office_normalized,
            )
            for i in idxs
        )

        best: ExistingEntity | None = None
        best_score = 0.0
        for cand in list(existing) + batch:
            if never_merge_kinds(kind_hint, cand.kind_hint):
                continue
            score = cosine_similarity(emb, cand.embedding)
            if cand.normalized_name == norm and cand.kind_hint == kind_hint:
                score = max(score, 0.99)
            elif cand.normalized_name == norm:
                score = max(score, 0.95)
            if score > best_score:
                best_score = score
                best = cand

        matched = False
        status = "accepted"
        uid = entity_uid_from_name(norm, kind=kind_hint if kind_hint != "unknown" else "person")
        if best and best_score >= ENTITY_AUTO_LINK_THRESHOLD:
            uid = best.uid
            matched = True
            status = "accepted"
        elif best and best_score >= 0.75:
            matched = False
            status = "quarantined"
        else:
            matched = False
            status = "accepted"

        linked.append(
            LinkedEntity(
                uid=uid,
                name=mention.name,
                normalized_name=norm,
                kind_hint=kind_hint,
                embedding=emb,
                decision_status=status,
                matched_existing=matched,
                link_score=best_score if best else None,
                mentions=refs,
            )
        )
        if not matched:
            batch.append(
                ExistingEntity(
                    uid=uid,
                    normalized_name=norm,
                    kind_hint=kind_hint,
                    embedding=emb,
                )
            )
    return linked
