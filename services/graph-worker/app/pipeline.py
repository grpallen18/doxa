"""Phase 0+1+2a pipeline: utterances, propositions/entities, then Arguments."""

from __future__ import annotations

import logging
from typing import Any

from neo4j import GraphDatabase

from app.argument_extract import extract_arguments
from app.config import Settings
from app.embeddings import embed_texts
from app.entity_er import (
    ExistingEntity,
    collect_mentions,
    link_entities,
)
from app.errors import QuarantineError
from app.proposition_extract import extract_propositions
from app.proposition_link import (
    ExistingProposition,
    link_propositions,
)
from app.segmenter import segment_text
from app.utterance_extract import extract_utterances
from app.validate import validate_utterances
from app.write_graph import (
    audit_document_provenance,
    audit_phase1_provenance,
    audit_phase2_provenance,
    delete_document_subgraph,
    fetch_existing_entities,
    fetch_existing_propositions,
    new_run_uid,
    upsert_document_anchors,
    utterance_uids_for_validated,
    write_arguments,
    write_entities,
    write_extraction_run,
    write_propositions,
    write_segments,
    write_utterances,
)

logger = logging.getLogger(__name__)


def _merge_tokens(
    a: dict[str, int | None], b: dict[str, int | None]
) -> dict[str, int | None]:
    def add(x: int | None, y: int | None) -> int | None:
        if x is None and y is None:
            return None
        return (x or 0) + (y or 0)

    return {
        "prompt_tokens": add(a.get("prompt_tokens"), b.get("prompt_tokens")),
        "completion_tokens": add(a.get("completion_tokens"), b.get("completion_tokens")),
        "total_tokens": add(a.get("total_tokens"), b.get("total_tokens")),
    }


def process_story(settings: Settings, story: dict[str, Any]) -> dict[str, Any]:
    document_uid = story["story_id"]
    text = story["content_clean"]
    driver = GraphDatabase.driver(
        settings.neo4j_uri,
        auth=(settings.neo4j_username, settings.neo4j_password),
    )

    try:
        driver.verify_connectivity()
        delete_document_subgraph(driver, settings.neo4j_database, document_uid)

        element_id = upsert_document_anchors(
            driver,
            settings.neo4j_database,
            document_uid=document_uid,
            title=story.get("title"),
            published_at=str(story.get("published_at"))
            if story.get("published_at")
            else None,
            url=story.get("url"),
            source_id=story.get("source_id"),
            source_name=story.get("source_name"),
            content_clean=text,
        )

        segments = segment_text(text)
        if not segments:
            raise QuarantineError("No segments produced from content_clean")

        write_segments(
            driver,
            settings.neo4j_database,
            document_uid=document_uid,
            segments=segments,
        )

        try:
            raw_utterances, token_usage = extract_utterances(
                api_key=settings.openai_api_key,
                model=settings.openai_model,
                title=story.get("title"),
                document_text=text,
                segments=segments,
            )
            validated = validate_utterances(
                raw_utterances,
                document_text=text,
                segments=segments,
            )
        except ValueError as exc:
            raise QuarantineError(f"Utterance validation failed: {exc}") from exc

        run_uid = new_run_uid(document_uid)
        write_extraction_run(
            driver,
            settings.neo4j_database,
            run_uid=run_uid,
            model=settings.openai_model,
        )
        write_utterances(
            driver,
            settings.neo4j_database,
            document_uid=document_uid,
            run_uid=run_uid,
            model=settings.openai_model,
            utterances=validated,
        )

        problems = audit_document_provenance(
            driver, settings.neo4j_database, document_uid
        )
        if problems:
            raise QuarantineError(
                "Provenance audit failed: " + "; ".join(problems[:20])
            )

        # --- Phase 1: propositions ---
        extracted_props, prop_tokens = extract_propositions(
            api_key=settings.openai_api_key,
            model=settings.openai_model,
            utterances=validated,
        )
        token_usage = _merge_tokens(token_usage, prop_tokens)

        prop_embeddings = embed_texts(
            api_key=settings.openai_api_key,
            model=settings.openai_embedding_model,
            texts=[p.text for p in extracted_props],
        )
        existing_props_raw = fetch_existing_propositions(
            driver, settings.neo4j_database
        )
        existing_props = [
            ExistingProposition(
                uid=r["uid"],
                normalized_text=r["normalizedText"] or "",
                certainty=r["certainty"],
                timeframe=r["timeframe"],
                scope=r["scope"],
                embedding=list(r["embedding"] or []),
            )
            for r in existing_props_raw
            if r.get("embedding")
        ]
        linked_props = link_propositions(
            extracted_props, prop_embeddings, existing_props
        )
        utt_uids = utterance_uids_for_validated(document_uid, validated)
        write_propositions(
            driver,
            settings.neo4j_database,
            document_uid=document_uid,
            utterance_uids=utt_uids,
            linked=linked_props,
        )

        # --- Phase 1: entity ER (speakers) ---
        mentions = collect_mentions(validated)
        entity_count = 0
        if mentions:
            mention_embeddings = embed_texts(
                api_key=settings.openai_api_key,
                model=settings.openai_embedding_model,
                texts=[m.name for _, m in mentions],
            )
            existing_ents_raw = fetch_existing_entities(
                driver, settings.neo4j_database
            )
            existing_ents = [
                ExistingEntity(
                    uid=r["uid"],
                    normalized_name=r["normalizedName"] or "",
                    kind_hint=r["kindHint"],
                    embedding=list(r["embedding"] or []),
                )
                for r in existing_ents_raw
                if r.get("embedding")
            ]
            linked_ents = link_entities(mentions, mention_embeddings, existing_ents)
            write_entities(
                driver,
                settings.neo4j_database,
                document_uid=document_uid,
                utterance_uids=utt_uids,
                linked=linked_ents,
            )
            entity_count = len(linked_ents)

        p1_problems = audit_phase1_provenance(
            driver, settings.neo4j_database, document_uid
        )
        if p1_problems:
            raise QuarantineError(
                "Phase 1 provenance audit failed: " + "; ".join(p1_problems[:20])
            )

        # --- Phase 2a: Arguments ---
        arguments, arg_tokens = extract_arguments(
            api_key=settings.openai_api_key,
            model=settings.openai_model,
            document_uid=document_uid,
            utterances=validated,
            linked_props=linked_props,
        )
        token_usage = _merge_tokens(token_usage, arg_tokens)
        write_arguments(
            driver,
            settings.neo4j_database,
            document_uid=document_uid,
            arguments=arguments,
        )
        p2_problems = audit_phase2_provenance(
            driver, settings.neo4j_database, document_uid
        )
        if p2_problems:
            raise QuarantineError(
                "Phase 2 provenance audit failed: " + "; ".join(p2_problems[:20])
            )

        logger.info(
            "Phase 0+1+2a graph write complete document_uid=%s utterances=%s props=%s entities=%s args=%s",
            document_uid,
            len(validated),
            len(linked_props),
            entity_count,
            len(arguments),
        )

        return {
            "neo4j_story_element_id": element_id,
            "model": settings.openai_model,
            "prompt_tokens": token_usage.get("prompt_tokens"),
            "completion_tokens": token_usage.get("completion_tokens"),
            "total_tokens": token_usage.get("total_tokens"),
            "utterance_count": len(validated),
            "segment_count": len(segments),
            "proposition_count": len(linked_props),
            "entity_count": entity_count,
            "argument_count": len(arguments),
            "extraction_run_uid": run_uid,
        }
    finally:
        driver.close()
