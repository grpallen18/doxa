"""Unit tests for OpenAI chat.completions param compatibility."""

from __future__ import annotations

import unittest

from app.openai_compat import chat_completion_kwargs, model_omits_temperature


class OpenAICompatTests(unittest.TestCase):
    def test_luna_omits_temperature(self) -> None:
        self.assertTrue(model_omits_temperature("gpt-5.6-luna"))
        kwargs = chat_completion_kwargs(
            "gpt-5.6-luna",
            temperature=0,
            messages=[{"role": "user", "content": "hi"}],
        )
        self.assertNotIn("temperature", kwargs)
        self.assertEqual(kwargs["model"], "gpt-5.6-luna")

    def test_4o_mini_keeps_temperature(self) -> None:
        self.assertFalse(model_omits_temperature("gpt-4o-mini"))
        kwargs = chat_completion_kwargs("gpt-4o-mini", temperature=0)
        self.assertEqual(kwargs["temperature"], 0)


if __name__ == "__main__":
    unittest.main()
