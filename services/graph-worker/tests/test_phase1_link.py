"""Phase 1 linking / ER unit tests (no Neo4j/OpenAI)."""

from __future__ import annotations

import unittest

from app.entity_er import (
    EntityMention,
    classify_mention,
    collect_mentions,
    link_entities,
    never_merge_kinds,
    parse_speaker_name,
    parse_speaker_names,
    split_conjoined_speaker_names,
)
from app.proposition_extract import ExtractedProposition
from app.proposition_link import (
    ExistingProposition,
    link_propositions,
    normalize_proposition_text,
    proposition_uid_from_text,
)
from app.validate import ValidatedUtterance


def _emb(seed: float) -> list[float]:
    # Simple 4-d vector for cosine tests
    return [seed, 1.0 - seed, seed * 0.5, 0.25]


class PropositionLinkTests(unittest.TestCase):
    def test_auto_link_high_similarity(self) -> None:
        existing = [
            ExistingProposition(
                uid="prop:existing",
                normalized_text="odni should shrink",
                certainty="asserted",
                timeframe="present",
                scope="general",
                embedding=_emb(0.9),
            )
        ]
        extracted = [
            ExtractedProposition(
                utterance_index=0,
                text="ODNI should shrink",
                certainty="asserted",
                timeframe="present",
                scope="general",
            )
        ]
        linked = link_propositions(extracted, [_emb(0.9)], existing)
        self.assertEqual(len(linked), 1)
        self.assertTrue(linked[0].matched_existing)
        self.assertEqual(linked[0].proposition_uid, "prop:existing")
        self.assertEqual(linked[0].decision_status, "accepted")

    def test_under_merge_on_low_similarity(self) -> None:
        existing = [
            ExistingProposition(
                uid="prop:other",
                normalized_text="unrelated claim",
                certainty="asserted",
                timeframe="past",
                scope="general",
                embedding=_emb(0.1),
            )
        ]
        extracted = [
            ExtractedProposition(
                utterance_index=0,
                text="Brand new meaning",
                certainty="asserted",
                timeframe="future",
                scope="general",
            )
        ]
        linked = link_propositions(extracted, [_emb(0.95)], existing)
        self.assertFalse(linked[0].matched_existing)
        self.assertNotEqual(linked[0].proposition_uid, "prop:other")
        self.assertEqual(linked[0].decision_status, "accepted")

    def test_high_similarity_scope_diff_uses_variant(self) -> None:
        existing = [
            ExistingProposition(
                uid="prop:existing",
                normalized_text="odni should shrink",
                certainty="asserted",
                timeframe="present",
                scope="general",
                embedding=_emb(0.9),
            )
        ]
        extracted = [
            ExtractedProposition(
                utterance_index=0,
                text="ODNI should shrink next year",
                certainty="hedged",
                timeframe="future",
                scope="conditional",
            )
        ]
        linked = link_propositions(extracted, [_emb(0.9)], existing)
        self.assertFalse(linked[0].matched_existing)
        self.assertEqual(linked[0].variant_of_uid, "prop:existing")
        self.assertEqual(linked[0].decision_status, "accepted")
        parent_like = proposition_uid_from_text("odni should shrink next year")
        self.assertNotEqual(linked[0].proposition_uid, "prop:existing")
        self.assertNotEqual(linked[0].proposition_uid, parent_like)
        self.assertEqual(
            linked[0].proposition_uid,
            proposition_uid_from_text(
                normalize_proposition_text(extracted[0].text),
                certainty="hedged",
                timeframe="future",
                scope="conditional",
            ),
        )

    def test_unspecified_parent_with_concrete_uses_variant(self) -> None:
        existing = [
            ExistingProposition(
                uid="prop:vague",
                normalized_text="odni should shrink",
                certainty="unspecified",
                timeframe="unspecified",
                scope="unspecified",
                embedding=_emb(0.9),
            )
        ]
        extracted = [
            ExtractedProposition(
                utterance_index=0,
                text="ODNI should shrink",
                certainty="asserted",
                timeframe="present",
                scope="general",
            )
        ]
        linked = link_propositions(extracted, [_emb(0.9)], existing)
        self.assertFalse(linked[0].matched_existing)
        self.assertEqual(linked[0].variant_of_uid, "prop:vague")
        self.assertNotEqual(linked[0].proposition_uid, "prop:vague")


class EntityErTests(unittest.TestCase):
    def test_never_merge_office_person(self) -> None:
        self.assertTrue(never_merge_kinds("office", "person"))
        self.assertFalse(never_merge_kinds("person", "person"))

    def test_classify_office(self) -> None:
        self.assertEqual(classify_mention("the ODNI"), "office")
        self.assertEqual(classify_mention("Department of Education"), "office")
        self.assertEqual(classify_mention("Donald Trump"), "person")
        self.assertEqual(classify_mention("President Donald Trump"), "person")

    def test_parse_strips_title_to_person_and_office(self) -> None:
        parsed = parse_speaker_name("President Donald Trump")
        self.assertEqual(parsed.name, "Donald Trump")
        self.assertEqual(parsed.normalized_name, "donald trump")
        self.assertEqual(parsed.kind_hint, "person")
        self.assertEqual(parsed.title, "President")
        self.assertEqual(parsed.office_name, "President")
        self.assertEqual(parsed.office_normalized, "president")
        self.assertEqual(parsed.surface_form, "President Donald Trump")

    def test_parse_party_prefixed_senator(self) -> None:
        parsed = parse_speaker_name("Republican Sen. Tom Cotton")
        self.assertEqual(parsed.name, "Tom Cotton")
        self.assertEqual(parsed.kind_hint, "person")
        self.assertEqual(parsed.office_normalized, "senator")
        self.assertEqual(parsed.title, "Senator")

    def test_parse_senate_majority_leader(self) -> None:
        parsed = parse_speaker_name("Senate Majority Leader John Thune")
        self.assertEqual(parsed.name, "John Thune")
        self.assertEqual(parsed.kind_hint, "person")
        self.assertEqual(parsed.office_normalized, "senate leader")

    def test_parse_the_president_office_only(self) -> None:
        parsed = parse_speaker_name("The President")
        self.assertEqual(parsed.kind_hint, "office")
        self.assertEqual(parsed.name, "President")
        self.assertEqual(parsed.normalized_name, "president")
        self.assertIsNone(parsed.office_name)

    def test_parse_single_surname_with_title(self) -> None:
        parsed = parse_speaker_name("President Biden")
        self.assertEqual(parsed.name, "Biden")
        self.assertEqual(parsed.kind_hint, "person")
        self.assertEqual(parsed.office_normalized, "president")
        self.assertEqual(parsed.title, "President")

    def test_parse_strips_honorific_without_office(self) -> None:
        parsed = parse_speaker_name("Mr. Tom Cotton")
        self.assertEqual(parsed.name, "Tom Cotton")
        self.assertIsNone(parsed.title)
        self.assertIsNone(parsed.office_name)
        self.assertEqual(parsed.kind_hint, "person")

    def test_parse_senator_abbrev(self) -> None:
        parsed = parse_speaker_name("Sen. Maria Chen")
        self.assertEqual(parsed.name, "Maria Chen")
        self.assertEqual(parsed.office_normalized, "senator")
        self.assertEqual(parsed.title, "Senator")

    def test_split_conjoined_speakers(self) -> None:
        parts = split_conjoined_speaker_names("Mark Warner and Rep. Jim Himes")
        self.assertEqual(parts, ["Mark Warner", "Rep. Jim Himes"])
        parsed = parse_speaker_names("Mark Warner and Rep. Jim Himes")
        self.assertEqual(len(parsed), 2)
        self.assertEqual(parsed[0].name, "Mark Warner")
        self.assertIsNone(parsed[0].title)
        self.assertEqual(parsed[1].name, "Jim Himes")
        self.assertEqual(parsed[1].title, "Representative")
        self.assertEqual(parsed[1].office_normalized, "representative")

    def test_split_oxford_list(self) -> None:
        parts = split_conjoined_speaker_names(
            "Sen. Mark Warner, Rep. Jim Himes, and Sen. Maria Chen"
        )
        self.assertEqual(
            parts,
            ["Sen. Mark Warner", "Rep. Jim Himes", "Sen. Maria Chen"],
        )

    def test_split_keeps_org_with_and(self) -> None:
        surface = "Moms and Dads for Liberty"
        self.assertEqual(split_conjoined_speaker_names(surface), [surface])

    def test_collect_mentions_uses_canonical_name(self) -> None:
        utts = [
            ValidatedUtterance(
                text="hello",
                speech_act="claim",
                attribution_mode="direct_quote",
                polarity="neutral",
                modality="assertive",
                confidence=0.9,
                explicit=True,
                speaker_name="President Donald Trump",
                segment_ord=0,
                char_start=0,
                char_end=5,
            )
        ]
        mentions = collect_mentions(utts)
        self.assertEqual(len(mentions), 1)
        self.assertEqual(mentions[0][1].name, "Donald Trump")
        self.assertEqual(mentions[0][1].normalized_name, "donald trump")
        self.assertEqual(mentions[0][1].office_normalized, "president")

    def test_collect_mentions_splits_conjoined_speakers(self) -> None:
        utts = [
            ValidatedUtterance(
                text="hello",
                speech_act="claim",
                attribution_mode="paraphrase",
                polarity="neutral",
                modality="assertive",
                confidence=0.9,
                explicit=True,
                speaker_name="Mark Warner and Rep. Jim Himes",
                segment_ord=0,
                char_start=0,
                char_end=5,
            )
        ]
        mentions = collect_mentions(utts)
        self.assertEqual(len(mentions), 2)
        names = {m.name for _, m in mentions}
        self.assertEqual(names, {"Mark Warner", "Jim Himes"})
        by_name = {m.name: m for _, m in mentions}
        self.assertEqual(by_name["Jim Himes"].office_normalized, "representative")
        self.assertIsNone(by_name["Mark Warner"].office_normalized)

    def test_link_exact_name(self) -> None:
        mentions = [
            (
                0,
                EntityMention(
                    surface_form="Tom Cotton",
                    name="Tom Cotton",
                    normalized_name="tom cotton",
                    kind_hint="person",
                    title=None,
                    office_name=None,
                    office_normalized=None,
                    source="speaker",
                ),
            )
        ]
        linked = link_entities(mentions, [_emb(0.5)], [])
        self.assertEqual(len(linked), 1)
        self.assertEqual(linked[0].normalized_name, "tom cotton")
        self.assertEqual(linked[0].decision_status, "accepted")

    def test_link_titled_and_bare_name_group(self) -> None:
        mentions = [
            (
                0,
                EntityMention(
                    surface_form="President Donald Trump",
                    name="Donald Trump",
                    normalized_name="donald trump",
                    kind_hint="person",
                    title="President",
                    office_name="President",
                    office_normalized="president",
                    source="speaker",
                ),
            ),
            (
                1,
                EntityMention(
                    surface_form="Donald Trump",
                    name="Donald Trump",
                    normalized_name="donald trump",
                    kind_hint="person",
                    title=None,
                    office_name=None,
                    office_normalized=None,
                    source="speaker",
                ),
            ),
        ]
        linked = link_entities(mentions, [_emb(0.5), _emb(0.5)], [])
        self.assertEqual(len(linked), 1)
        self.assertEqual(linked[0].name, "Donald Trump")
        self.assertEqual(len(linked[0].mentions), 2)
        titles = {m.title for m in linked[0].mentions}
        self.assertEqual(titles, {"President", None})


if __name__ == "__main__":
    unittest.main()
