"""Unit tests for Phase 0 segmenter and utterance validator (no Neo4j required)."""

from __future__ import annotations

import unittest
from pathlib import Path

from app.segmenter import segment_text
from app.validate import validate_utterances


FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "sample_article.txt"


class SegmenterTests(unittest.TestCase):
    def test_offsets_round_trip_to_body(self) -> None:
        body = FIXTURE.read_text(encoding="utf-8").strip() + "\n"
        segments = segment_text(body)
        self.assertGreaterEqual(len(segments), 1)
        for seg in segments:
            self.assertEqual(body[seg.char_start : seg.char_end], seg.text)
            self.assertEqual(seg.char_end - seg.char_start, len(seg.text))

    def test_stable_ords(self) -> None:
        body = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph."
        segments = segment_text(body, min_chars=1)
        self.assertEqual([s.ord for s in segments], list(range(len(segments))))
        for seg in segments:
            self.assertEqual(body[seg.char_start : seg.char_end], seg.text)

    def test_empty_body(self) -> None:
        self.assertEqual(segment_text(""), [])
        self.assertEqual(segment_text("   \n\n  "), [])


class ValidatorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.body = (
            "Sen. Maria Chen said the border bill would have cut crossings in half.\n\n"
            "The White House disputed that estimate."
        )
        self.segments = segment_text(self.body, min_chars=1)

    def test_accepts_grounded_quote(self) -> None:
        seg0 = self.segments[0]
        quote = "the border bill would have cut crossings in half"
        start = self.body.find(quote)
        self.assertGreaterEqual(start, 0)
        raw = [
            {
                "text": quote,
                "speechAct": "prediction",
                "attributionMode": "paraphrase",
                "polarity": "affirms",
                "modality": "would have",
                "confidence": 0.9,
                "explicit": True,
                "speakerName": "Sen. Maria Chen",
                "segmentOrd": seg0.ord,
                "charStart": start,
                "charEnd": start + len(quote),
            }
        ]
        validated = validate_utterances(
            raw, document_text=self.body, segments=self.segments
        )
        self.assertEqual(len(validated), 1)
        self.assertEqual(validated[0].speaker_name, "Sen. Maria Chen")

    def test_rejects_bad_offsets(self) -> None:
        raw = [
            {
                "text": "invented",
                "speechAct": "assertion",
                "attributionMode": "journalist_voice",
                "polarity": "affirms",
                "modality": "",
                "confidence": 0.5,
                "explicit": True,
                "speakerName": None,
                "segmentOrd": 0,
                "charStart": 0,
                "charEnd": 3,
            }
        ]
        with self.assertRaises(ValueError):
            validate_utterances(raw, document_text=self.body, segments=self.segments)

    def test_requires_speaker_unless_journalist(self) -> None:
        seg0 = self.segments[0]
        span = seg0.text[:20]
        raw = [
            {
                "text": span,
                "speechAct": "assertion",
                "attributionMode": "direct_quote",
                "polarity": "affirms",
                "modality": "",
                "confidence": 0.8,
                "explicit": True,
                "speakerName": None,
                "segmentOrd": seg0.ord,
                "charStart": seg0.char_start,
                "charEnd": seg0.char_start + len(span),
            }
        ]
        with self.assertRaises(ValueError):
            validate_utterances(raw, document_text=self.body, segments=self.segments)

    def test_locates_truncated_quote(self) -> None:
        from app.validate import validate_utterances

        body = (
            'President said, \u201cI\u2019d like to see it smaller. I think there are a lot '
            'of people in there that shouldn\u2019t be there,\u201d he added.'
        )
        segments = segment_text(body, min_chars=1)
        raw = [
            {
                "text": "I\u2019d like to see it smaller. I think there are a lot of people in there that shou",
                "speechAct": "assertion",
                "attributionMode": "direct_quote",
                "polarity": "affirms",
                "modality": "",
                "confidence": 0.9,
                "explicit": True,
                "speakerName": "President",
                "segmentOrd": 0,
                "charStart": 10,
                "charEnd": 20,
            }
        ]
        validated = validate_utterances(raw, document_text=body, segments=segments)
        self.assertEqual(len(validated), 1)
        self.assertIn("smaller", validated[0].text)
        self.assertEqual(body[validated[0].char_start : validated[0].char_end], validated[0].text)

        seg1 = self.segments[-1]
        span = seg1.text
        raw = [
            {
                "text": span,
                "speechAct": "assertion",
                "attributionMode": "journalist_voice",
                "polarity": "affirms",
                "modality": "",
                "confidence": 0.7,
                "explicit": True,
                "speakerName": None,
                "segmentOrd": seg1.ord,
                "charStart": seg1.char_start,
                "charEnd": seg1.char_end,
            }
        ]
        validated = validate_utterances(
            raw, document_text=self.body, segments=self.segments
        )
        self.assertEqual(validated[0].attribution_mode, "journalist_voice")


if __name__ == "__main__":
    unittest.main()
