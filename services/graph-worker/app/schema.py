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
- charStart is inclusive, charEnd is exclusive; document[charStart:charEnd] must be the spoken/written span.
- Prefer shorter, atomic speech acts over long multi-claim spans.
- speechAct must be one of: assertion, allegation, prediction, prescription, judgment, definition, question, concession, other.
- attributionMode must be one of: direct_quote, paraphrase, journalist_voice, reported_speech.
- polarity must be one of: affirms, negates, questions.
- For journalist_voice, speakerName may be null. For all other attribution modes, speakerName is required.
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
