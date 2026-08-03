"""Phase 0 controlled vocabularies and OpenAI JSON extract schema."""

from __future__ import annotations

SPEECH_ACTS = frozenset(
    {
        "assertion",
        "allegation",
        "prediction",
        "prescription",
        "judgment",
        "definition",
        "question",
        "concession",
        "other",
    }
)

ATTRIBUTION_MODES = frozenset(
    {
        "direct_quote",
        "paraphrase",
        "journalist_voice",
        "reported_speech",
    }
)

POLARITIES = frozenset({"affirms", "negates", "questions"})

UTTERANCE_EXTRACT_SYSTEM = """You extract source-grounded utterances from political news text for a knowledge graph.

Rules:
- Extract only what the text explicitly communicates. Do not invent speakers or claims.
- Each utterance must be grounded in a segment by segmentOrd and absolute character offsets (charStart, charEnd) into the FULL document text (not segment-local).
- charStart is inclusive, charEnd is exclusive; document[charStart:charEnd] must equal the utterance "text" exactly.
- The "text" field MUST be a verbatim contiguous substring copied from FULL_DOCUMENT. Never paraphrase, summarize, or stitch non-adjacent clauses into "text".
- If a sentence has an interrupting clause, either copy the full contiguous sentence OR copy one contiguous clause that appears as-is — do not drop the middle and keep the ends.
- Prefer shorter, atomic speech acts over long multi-claim spans.
- speechAct must be one of: assertion, allegation, prediction, prescription, judgment, definition, question, concession, other.
- attributionMode must be one of: direct_quote, paraphrase, journalist_voice, reported_speech.
- polarity must be one of: affirms, negates, questions.
- For journalist_voice, speakerName may be null.
- For direct_quote, paraphrase, and reported_speech, speakerName is REQUIRED (named person/org).
- speakerName must refer to one person or org. Prefer a single primary speaker. Never invent a fused label that mixes titles across people (bad: "Mark Warner and Rep. Jim Himes" as one identity). When the text clearly co-attributes the same span to two people, you may emit "Name A and Name B" — each side one person with their own title — and the pipeline will create separate Agents.
- If you cannot identify a speaker, you MUST use attributionMode=journalist_voice with speakerName null — never emit paraphrase/direct_quote/reported_speech without a speaker.
- modality: short note on hedges/necessity (e.g. "may", "will", "allegedly") or empty string.
- confidence: 0.0–1.0 for extraction confidence.
- explicit: true if stated outright; false if lightly implied but still clearly communicated.
- Every utterance object MUST include a non-empty "text" string copied from the document span.
- Return JSON only with this shape:
{
  "utterances": [
    {
      "text": "exact span from the document",
      "speechAct": "assertion",
      "attributionMode": "paraphrase",
      "polarity": "affirms",
      "modality": "",
      "confidence": 0.9,
      "explicit": true,
      "speakerName": "Sen. Example",
      "segmentOrd": 0,
      "charStart": 10,
      "charEnd": 40
    }
  ]
}
"""


def utterance_json_schema_hint() -> dict:
    """Documented shape for prompts and validators (not sent as OpenAI strict schema)."""
    return {
        "type": "object",
        "properties": {
            "utterances": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": [
                        "text",
                        "speechAct",
                        "attributionMode",
                        "polarity",
                        "modality",
                        "confidence",
                        "explicit",
                        "speakerName",
                        "segmentOrd",
                        "charStart",
                        "charEnd",
                    ],
                    "properties": {
                        "text": {"type": "string"},
                        "speechAct": {"type": "string"},
                        "attributionMode": {"type": "string"},
                        "polarity": {"type": "string"},
                        "modality": {"type": "string"},
                        "confidence": {"type": "number"},
                        "explicit": {"type": "boolean"},
                        "speakerName": {"type": ["string", "null"]},
                        "segmentOrd": {"type": "integer"},
                        "charStart": {"type": "integer"},
                        "charEnd": {"type": "integer"},
                    },
                },
            }
        },
        "required": ["utterances"],
    }
