"""Phase 2a Argument extract unit tests (no Neo4j/OpenAI)."""

from __future__ import annotations

import unittest

from app.argument_extract import (
    ARGUMENT_ROLES,
    ArgumentRoleLink,
    argument_uid,
    validate_argument_roles,
)


class ArgumentExtractTests(unittest.TestCase):
    def test_role_vocabulary(self) -> None:
        expected = {
            "premise",
            "conclusion",
            "assumption",
            "objection",
            "rebuttal",
            "qualifier",
            "value",
            "prediction",
        }
        self.assertEqual(ARGUMENT_ROLES, expected)

    def test_validate_roles_requires_two(self) -> None:
        one = (
            ArgumentRoleLink(
                role="conclusion",
                proposition_uid="prop:a",
                utterance_index=0,
            ),
        )
        self.assertFalse(validate_argument_roles(one))
        two = (
            ArgumentRoleLink(
                role="premise",
                proposition_uid="prop:a",
                utterance_index=0,
            ),
            ArgumentRoleLink(
                role="conclusion",
                proposition_uid="prop:b",
                utterance_index=1,
            ),
        )
        self.assertTrue(validate_argument_roles(two))

    def test_argument_uid_stable(self) -> None:
        a = argument_uid("doc-1", "summary", "premise:prop:a|conclusion:prop:b")
        b = argument_uid("doc-1", "summary", "premise:prop:a|conclusion:prop:b")
        self.assertEqual(a, b)
        self.assertTrue(a.startswith("doc-1:arg:"))


if __name__ == "__main__":
    unittest.main()
