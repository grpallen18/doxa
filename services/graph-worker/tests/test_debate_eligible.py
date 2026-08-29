"""Unit tests for write-time debate eligibility and echo fallback."""

from __future__ import annotations

import unittest

from app.debate_eligible import debate_eligible, is_utterance_echo, should_echo_fallback
from app.validate import ValidatedUtterance


def _utt(text: str, speech_act: str) -> ValidatedUtterance:
    return ValidatedUtterance(
        text=text,
        speech_act=speech_act,
        attribution_mode="journalist_voice",
        polarity="affirms",
        modality="indicative",
        confidence=0.9,
        explicit=True,
        speaker_name=None,
        segment_ord=0,
        char_start=0,
        char_end=len(text),
    )


class DebateEligibleTests(unittest.TestCase):
    def test_question_not_eligible(self) -> None:
        u = _utt("Should ODNI shrink?", "question")
        self.assertFalse(debate_eligible("Should ODNI shrink?", u))
        self.assertFalse(should_echo_fallback("question"))

    def test_definition_not_eligible(self) -> None:
        u = _utt("ODNI is an agency.", "definition")
        self.assertFalse(debate_eligible("ODNI is an agency.", u))

    def test_echo_assertion_not_eligible(self) -> None:
        text = "The office of the director of national intelligence should shrink."
        u = _utt(text, "assertion")
        self.assertTrue(should_echo_fallback("assertion"))
        self.assertTrue(is_utterance_echo(text, text))
        self.assertFalse(debate_eligible(text, u))

    def test_paraphrase_eligible(self) -> None:
        u = _utt(
            "Smith said ODNI should be smaller next year, according to aides.",
            "prescription",
        )
        self.assertTrue(
            debate_eligible("ODNI should shrink next year.", u)
        )
