"""Cypher helpers for Phase 0 discourse graph writes."""

from __future__ import annotations

import hashlib
import re
import uuid
from typing import Any

from app.config import EXTRACTOR_VERSION, GRAPH_SCHEMA_VERSION
from app.entity_er import office_uid_from_normalized, parse_speaker_names
from app.segmenter import TextSegment, segment_uid
from app.validate import ValidatedUtterance


def normalize_agent_name(name: str) -> str:
    collapsed = re.sub(r"\s+", " ", name.strip().lower())
    return collapsed


def agent_uid(document_uid: str, normalized_name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", normalized_name).strip("-")[:80] or "unknown"
    return f"{document_uid}:agent:{slug}"


def utterance_uid(document_uid: str, char_start: int, char_end: int, text: str) -> str:
    digest = hashlib.sha256(
        f"{document_uid}|{char_start}|{char_end}|{text}".encode("utf-8")
    ).hexdigest()[:16]
    return f"{document_uid}:utt:{digest}"


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def delete_document_subgraph(driver: Any, database: str, document_uid: str) -> None:
    """Remove Phase 0/1/2a nodes for this document; keep shared Publication + L3 debate nodes.

    Propositions/Entities are deleted only when no remaining Utterance links exist.
    Controversies / Viewpoints / Disputes are shared cross-document and are not deleted here.
    """
    # Collect local proposition/entity uids before deleting utterances.
    collect = """
    MATCH (u:Utterance {documentUid: $document_uid})
    OPTIONAL MATCH (u)-[:EXPRESSES]->(prop:Proposition)
    OPTIONAL MATCH (u)-[:MENTIONS]->(ent:Entity)
    OPTIONAL MATCH (ent)-[ra:REFERRED_AS {documentUid: $document_uid}]->(office:Entity)
    OPTIONAL MATCH (u)-[:ASSERTED_BY]->(agent:Agent)
    OPTIONAL MATCH (agent)-[ara:REFERRED_AS {documentUid: $document_uid}]->(aoffice:Entity)
    RETURN collect(DISTINCT prop.uid) AS prop_uids,
           collect(DISTINCT ent.uid) + collect(DISTINCT office.uid)
             + collect(DISTINCT aoffice.uid) AS ent_uids
    """
    delete_arguments = """
    MATCH (arg:Argument {documentUid: $document_uid})
    OPTIONAL MATCH (arg)-[:DECIDED_BY]->(adec:Decision)
    DETACH DELETE adec, arg
    """
    delete_arg_decisions = """
    MATCH (dec:Decision)
    WHERE dec.uid STARTS WITH $adec_prefix
    DETACH DELETE dec
    """
    delete_local = """
    MATCH (d:Document {uid: $document_uid})
    OPTIONAL MATCH (d)-[:CONTAINS]->(seg:Segment)
    OPTIONAL MATCH (d)-[:HAS_ASSET]->(asset:MediaAsset)
    OPTIONAL MATCH (u:Utterance {documentUid: $document_uid})
    OPTIONAL MATCH (u)-[:PRODUCED_BY]->(run:ExtractionRun)
    OPTIONAL MATCH (u)-[:DECIDED_BY]->(dec:Decision)
    OPTIONAL MATCH (agent:Agent)
    WHERE agent.uid STARTS WITH $agent_prefix
    WITH d,
         collect(DISTINCT seg) AS segs,
         collect(DISTINCT asset) AS assets,
         collect(DISTINCT u) AS utts,
         collect(DISTINCT run) AS runs,
         collect(DISTINCT dec) AS decs,
         collect(DISTINCT agent) AS agents
    FOREACH (n IN [x IN segs + assets + utts + runs + decs + agents WHERE x IS NOT NULL] |
      DETACH DELETE n)
    DETACH DELETE d
    """
    delete_referred_as = """
    MATCH ()-[r:REFERRED_AS {documentUid: $document_uid}]->()
    DELETE r
    """
    delete_orphan_props = """
    UNWIND $prop_uids AS puid
    MATCH (p:Proposition {uid: puid})
    WHERE NOT EXISTS { MATCH (:Utterance)-[:EXPRESSES]->(p) }
    OPTIONAL MATCH (p)<-[:DECIDED_BY]-(d:Decision)
    DETACH DELETE d, p
    """
    # Decision for EXPRESSES is attached via Decision node linked from write; clean by prefix.
    delete_prop_decisions = """
    MATCH (dec:Decision)
    WHERE dec.uid STARTS WITH $pdec_prefix
    DETACH DELETE dec
    """
    delete_orphan_ents = """
    UNWIND $ent_uids AS euid
    MATCH (e:Entity {uid: euid})
    WHERE NOT EXISTS { MATCH (:Utterance)-[:MENTIONS]->(e) }
      AND NOT EXISTS { MATCH (e)-[:REFERRED_AS]-() }
      AND NOT EXISTS { MATCH ()-[:REFERRED_AS]->(e) }
    DETACH DELETE e
    """
    delete_ent_decisions = """
    MATCH (dec:Decision)
    WHERE dec.uid STARTS WITH $edec_prefix
    DETACH DELETE dec
    """
    legacy = """
    MATCH (s:Story {story_id: $document_uid})
    OPTIONAL MATCH (s)-[*0..3]-(n)
    WHERE n:Chunk OR n:Assertion OR n:Event
       OR (n:Entity AND n.story_id = $document_uid)
       OR (n:Actor AND n.story_id = $document_uid)
    DETACH DELETE s, n
    """
    with driver.session(database=database) as session:
        rec = session.run(collect, document_uid=document_uid).single()
        prop_uids = [u for u in (rec["prop_uids"] if rec else []) if u]
        all_ent_uids = list({u for u in (rec["ent_uids"] if rec else []) if u})
        session.run(
            delete_arg_decisions,
            adec_prefix=f"{document_uid}:adec:",
        )
        session.run(delete_arguments, document_uid=document_uid)
        session.run(
            delete_prop_decisions,
            pdec_prefix=f"{document_uid}:pdec:",
        )
        session.run(
            delete_ent_decisions,
            edec_prefix=f"{document_uid}:edec:",
        )
        session.run(delete_referred_as, document_uid=document_uid)
        session.run(
            delete_local,
            document_uid=document_uid,
            agent_prefix=f"{document_uid}:agent:",
        )
        if prop_uids:
            session.run(delete_orphan_props, prop_uids=prop_uids)
        if all_ent_uids:
            session.run(delete_orphan_ents, ent_uids=all_ent_uids)
        session.run(legacy, document_uid=document_uid)


def upsert_document_anchors(
    driver: Any,
    database: str,
    *,
    document_uid: str,
    title: str | None,
    published_at: str | None,
    url: str | None,
    source_id: str | None,
    source_name: str | None,
    content_clean: str,
) -> str | None:
    asset_uid = f"{document_uid}:asset:article_text"
    cypher = """
    MERGE (d:Document {uid: $document_uid})
    SET d.title = $title,
        d.publishedAt = $published_at,
        d.url = $url,
        d.schemaVersion = $schema_version,
        d.extractorVersion = $extractor_version,
        d.updatedAt = datetime()
    WITH d
    MERGE (m:MediaAsset {uid: $asset_uid})
    SET m.kind = 'article_text',
        m.contentHash = $content_hash,
        m.byteLength = $byte_length
    MERGE (d)-[:HAS_ASSET]->(m)
    WITH d
    FOREACH (_ IN CASE WHEN $source_id IS NULL THEN [] ELSE [1] END |
      MERGE (p:Publication {uid: $source_id})
      SET p.name = coalesce($source_name, p.name)
      MERGE (d)-[:PUBLISHED_BY]->(p)
    )
    RETURN elementId(d) AS element_id
    """
    with driver.session(database=database) as session:
        result = session.run(
            cypher,
            document_uid=document_uid,
            title=title,
            published_at=published_at,
            url=url,
            source_id=source_id,
            source_name=source_name,
            asset_uid=asset_uid,
            content_hash=content_hash(content_clean),
            byte_length=len(content_clean.encode("utf-8")),
            schema_version=GRAPH_SCHEMA_VERSION,
            extractor_version=EXTRACTOR_VERSION,
        )
        record = result.single()
        return record["element_id"] if record else None


def write_segments(
    driver: Any,
    database: str,
    *,
    document_uid: str,
    segments: list[TextSegment],
) -> None:
    cypher = """
    MATCH (d:Document {uid: $document_uid})
    UNWIND $segments AS seg
    MERGE (s:Segment {uid: seg.uid})
    SET s.ord = seg.ord,
        s.text = seg.text,
        s.charStart = seg.charStart,
        s.charEnd = seg.charEnd
    MERGE (d)-[:CONTAINS]->(s)
    """
    payload = [
        {
            "uid": segment_uid(document_uid, seg.ord),
            "ord": seg.ord,
            "text": seg.text,
            "charStart": seg.char_start,
            "charEnd": seg.char_end,
        }
        for seg in segments
    ]
    with driver.session(database=database) as session:
        session.run(cypher, document_uid=document_uid, segments=payload)


def write_extraction_run(
    driver: Any,
    database: str,
    *,
    run_uid: str,
    model: str,
) -> None:
    cypher = """
    MERGE (r:ExtractionRun {uid: $run_uid})
    SET r.model = $model,
        r.schemaVersion = $schema_version,
        r.extractorVersion = $extractor_version,
        r.ranAt = datetime()
    """
    with driver.session(database=database) as session:
        session.run(
            cypher,
            run_uid=run_uid,
            model=model,
            schema_version=GRAPH_SCHEMA_VERSION,
            extractor_version=EXTRACTOR_VERSION,
        )


def write_utterances(
    driver: Any,
    database: str,
    *,
    document_uid: str,
    run_uid: str,
    model: str,
    utterances: list[ValidatedUtterance],
) -> None:
    rows = []
    for utt in utterances:
        u_uid = utterance_uid(document_uid, utt.char_start, utt.char_end, utt.text)
        d_uid = f"{document_uid}:dec:{u_uid.split(':')[-1]}"
        speakers: list[dict[str, Any]] = []
        if utt.speaker_name:
            for parsed in parse_speaker_names(utt.speaker_name):
                if not parsed.normalized_name:
                    continue
                # Canonical identity only — titles live on Office via REFERRED_AS.
                sp: dict[str, Any] = {
                    "speakerUid": agent_uid(document_uid, parsed.normalized_name),
                    "speakerName": parsed.name,
                    "speakerNorm": parsed.normalized_name,
                    "speakerSurface": parsed.surface_form,
                    "officeUid": None,
                    "officeName": None,
                    "officeNorm": None,
                    "title": None,
                }
                if parsed.office_name and parsed.office_normalized:
                    sp["officeName"] = parsed.office_name
                    sp["officeNorm"] = parsed.office_normalized
                    sp["officeUid"] = office_uid_from_normalized(
                        parsed.office_normalized
                    )
                    sp["title"] = parsed.title
                speakers.append(sp)
        rows.append(
            {
                "uid": u_uid,
                "text": utt.text,
                "speechAct": utt.speech_act,
                "attributionMode": utt.attribution_mode,
                "polarity": utt.polarity,
                "modality": utt.modality,
                "confidence": utt.confidence,
                "explicit": utt.explicit,
                "charStart": utt.char_start,
                "charEnd": utt.char_end,
                "segmentUid": segment_uid(document_uid, utt.segment_ord),
                "decisionUid": d_uid,
                "speakers": speakers,
            }
        )

    cypher = """
    UNWIND $rows AS row
    MATCH (seg:Segment {uid: row.segmentUid})
    MATCH (run:ExtractionRun {uid: $run_uid})
    MERGE (u:Utterance {uid: row.uid})
    SET u.text = row.text,
        u.speechAct = row.speechAct,
        u.attributionMode = row.attributionMode,
        u.polarity = row.polarity,
        u.modality = row.modality,
        u.confidence = row.confidence,
        u.explicit = row.explicit,
        u.documentUid = $document_uid,
        u.schemaVersion = $schema_version,
        u.extractorVersion = $extractor_version,
        u.model = $model,
        u.createdAt = coalesce(u.createdAt, datetime())
    MERGE (u)-[:GROUNDED_IN {charStart: row.charStart, charEnd: row.charEnd}]->(seg)
    MERGE (u)-[:PRODUCED_BY]->(run)
    MERGE (dec:Decision {uid: row.decisionUid})
    SET dec.decisionType = 'utterance_accept',
        dec.confidence = row.confidence,
        dec.actor = 'model',
        dec.status = 'accepted',
        dec.createdAt = datetime()
    MERGE (u)-[:DECIDED_BY]->(dec)
    FOREACH (sp IN row.speakers |
      MERGE (a:Agent {uid: sp.speakerUid})
      SET a.name = sp.speakerName,
          a.normalizedName = sp.speakerNorm
      MERGE (u)-[ab:ASSERTED_BY]->(a)
      SET ab.surfaceForm = sp.speakerSurface
    )
    FOREACH (sp IN [x IN row.speakers WHERE x.officeUid IS NOT NULL] |
      MERGE (a:Agent {uid: sp.speakerUid})
      MERGE (office:Entity {uid: sp.officeUid})
      ON CREATE SET
        office.name = sp.officeName,
        office.normalizedName = sp.officeNorm,
        office.kindHint = 'office',
        office.schemaVersion = $schema_version,
        office.createdAt = datetime(),
        office.updatedAt = datetime()
      ON MATCH SET
        office.schemaVersion = coalesce(office.schemaVersion, $schema_version),
        office.updatedAt = datetime()
      MERGE (a)-[r:REFERRED_AS {documentUid: $document_uid}]->(office)
      SET r.title = sp.title,
          r.source = 'mention_title',
          r.updatedAt = datetime()
    )
    """
    with driver.session(database=database) as session:
        session.run(
            cypher,
            rows=rows,
            document_uid=document_uid,
            run_uid=run_uid,
            model=model,
            schema_version=GRAPH_SCHEMA_VERSION,
            extractor_version=EXTRACTOR_VERSION,
        )


def audit_document_provenance(
    driver: Any, database: str, document_uid: str
) -> list[str]:
    """Return list of provenance problems (empty = ok)."""
    cypher = """
    MATCH (u:Utterance {documentUid: $document_uid})
    OPTIONAL MATCH (u)-[:GROUNDED_IN]->(seg:Segment)
    OPTIONAL MATCH (u)-[:PRODUCED_BY]->(run:ExtractionRun)
    OPTIONAL MATCH (u)-[:ASSERTED_BY]->(agent:Agent)
    RETURN u.uid AS uid,
           u.attributionMode AS attributionMode,
           seg IS NOT NULL AS hasSegment,
           run IS NOT NULL AS hasRun,
           agent IS NOT NULL AS hasAgent
    """
    problems: list[str] = []
    with driver.session(database=database) as session:
        result = session.run(cypher, document_uid=document_uid)
        for record in result:
            uid = record["uid"]
            if not record["hasSegment"]:
                problems.append(f"{uid}: missing GROUNDED_IN Segment")
            if not record["hasRun"]:
                problems.append(f"{uid}: missing PRODUCED_BY ExtractionRun")
            mode = record["attributionMode"]
            if mode != "journalist_voice" and not record["hasAgent"]:
                problems.append(f"{uid}: missing ASSERTED_BY Agent for {mode}")
    return problems


def fetch_existing_propositions(driver: Any, database: str) -> list[dict[str, Any]]:
    # Cap is intentional under-merge: missing candidates create new nodes rather than silent merges.
    cypher = """
    MATCH (p:Proposition)
    WHERE p.embedding IS NOT NULL
    RETURN p.uid AS uid,
           p.normalizedText AS normalizedText,
           coalesce(p.certainty, 'unspecified') AS certainty,
           coalesce(p.timeframe, 'unspecified') AS timeframe,
           coalesce(p.scope, 'unspecified') AS scope,
           p.embedding AS embedding
    ORDER BY coalesce(p.updatedAt, p.createdAt) DESC
    LIMIT 2000
    """
    with driver.session(database=database) as session:
        return [dict(r) for r in session.run(cypher)]


def fetch_existing_entities(driver: Any, database: str) -> list[dict[str, Any]]:
    # Cap is intentional under-merge: missing candidates create new nodes rather than silent merges.
    cypher = """
    MATCH (e:Entity)
    WHERE e.embedding IS NOT NULL
    RETURN e.uid AS uid,
           e.normalizedName AS normalizedName,
           coalesce(e.kindHint, 'unknown') AS kindHint,
           e.embedding AS embedding
    ORDER BY coalesce(e.updatedAt, e.createdAt) DESC
    LIMIT 2000
    """
    with driver.session(database=database) as session:
        return [dict(r) for r in session.run(cypher)]


def write_propositions(
    driver: Any,
    database: str,
    *,
    document_uid: str,
    utterance_uids: list[str],
    linked: list[Any],
) -> None:
    """Write Proposition nodes + EXPRESSES + Decision(proposition_link)."""
    rows = []
    for item in linked:
        utt_uid = utterance_uids[item.utterance_index]
        dec_uid = f"{document_uid}:pdec:{hashlib.sha256(f'{utt_uid}|{item.proposition_uid}'.encode()).hexdigest()[:16]}"
        rows.append(
            {
                "uttUid": utt_uid,
                "propUid": item.proposition_uid,
                "text": item.text,
                "normalizedText": item.normalized_text,
                "certainty": item.certainty,
                "timeframe": item.timeframe,
                "scope": item.scope,
                "embedding": item.embedding,
                "decisionUid": dec_uid,
                "decisionStatus": item.decision_status,
                "linkScore": item.link_score,
                "variantOfUid": item.variant_of_uid,
            }
        )

    cypher = """
    UNWIND $rows AS row
    MATCH (u:Utterance {uid: row.uttUid})
    MERGE (p:Proposition {uid: row.propUid})
    ON CREATE SET
      p.text = row.text,
      p.normalizedText = row.normalizedText,
      p.certainty = row.certainty,
      p.timeframe = row.timeframe,
      p.scope = row.scope,
      p.embedding = row.embedding,
      p.schemaVersion = $schema_version,
      p.createdAt = datetime(),
      p.updatedAt = datetime()
    ON MATCH SET
      p.embedding = coalesce(p.embedding, row.embedding),
      p.schemaVersion = coalesce(p.schemaVersion, $schema_version),
      p.updatedAt = datetime()
    MERGE (u)-[ex:EXPRESSES]->(p)
    SET ex.linkScore = row.linkScore
    MERGE (dec:Decision {uid: row.decisionUid})
    SET dec.decisionType = 'proposition_link',
        dec.confidence = coalesce(row.linkScore, 1.0),
        dec.actor = 'model',
        dec.status = row.decisionStatus,
        dec.createdAt = datetime()
    MERGE (u)-[:DECIDED_BY]->(dec)
    MERGE (dec)-[:ABOUT]->(p)
    WITH row, p
    FOREACH (_ IN CASE WHEN row.variantOfUid IS NULL THEN [] ELSE [1] END |
      MERGE (parent:Proposition {uid: row.variantOfUid})
      MERGE (p)-[:VARIANT_OF]->(parent)
    )
    """
    with driver.session(database=database) as session:
        session.run(
            cypher,
            rows=rows,
            schema_version=GRAPH_SCHEMA_VERSION,
        )


def write_entities(
    driver: Any,
    database: str,
    *,
    document_uid: str,
    utterance_uids: list[str],
    linked: list[Any],
) -> None:
    rows = []
    office_rows = []
    for item in linked:
        for ref in item.mentions:
            utt_uid = utterance_uids[ref.utterance_index]
            dec_uid = (
                f"{document_uid}:edec:"
                f"{hashlib.sha256(f'{utt_uid}|{item.uid}'.encode()).hexdigest()[:16]}"
            )
            rows.append(
                {
                    "uttUid": utt_uid,
                    "entUid": item.uid,
                    "name": item.name,
                    "normalizedName": item.normalized_name,
                    "kindHint": item.kind_hint,
                    "embedding": item.embedding,
                    "decisionUid": dec_uid,
                    "decisionStatus": item.decision_status,
                    "linkScore": item.link_score,
                    "surfaceForm": ref.surface_form,
                    "title": ref.title,
                }
            )
            if (
                item.kind_hint == "person"
                and ref.office_name
                and ref.office_normalized
            ):
                office_uid = office_uid_from_normalized(ref.office_normalized)
                office_rows.append(
                    {
                        "personUid": item.uid,
                        "officeUid": office_uid,
                        "officeName": ref.office_name,
                        "officeNormalized": ref.office_normalized,
                        "title": ref.title,
                        "documentUid": document_uid,
                        "uttUid": utt_uid,
                    }
                )

    cypher = """
    UNWIND $rows AS row
    MATCH (u:Utterance {uid: row.uttUid})
    MERGE (e:Entity {uid: row.entUid})
    ON CREATE SET
      e.name = row.name,
      e.normalizedName = row.normalizedName,
      e.kindHint = row.kindHint,
      e.embedding = row.embedding,
      e.schemaVersion = $schema_version,
      e.createdAt = datetime(),
      e.updatedAt = datetime()
    ON MATCH SET
      e.name = row.name,
      e.normalizedName = row.normalizedName,
      e.kindHint = coalesce(e.kindHint, row.kindHint),
      e.embedding = coalesce(row.embedding, e.embedding),
      e.schemaVersion = coalesce(e.schemaVersion, $schema_version),
      e.updatedAt = datetime()
    MERGE (u)-[m:MENTIONS]->(e)
    SET m.linkScore = row.linkScore,
        m.surfaceForm = row.surfaceForm,
        m.title = row.title
    MERGE (dec:Decision {uid: row.decisionUid})
    SET dec.decisionType = 'entity_link',
        dec.confidence = coalesce(row.linkScore, 1.0),
        dec.actor = 'model',
        dec.status = row.decisionStatus,
        dec.createdAt = datetime()
    MERGE (u)-[:DECIDED_BY]->(dec)
    MERGE (dec)-[:ABOUT]->(e)
    """
    office_cypher = """
    UNWIND $rows AS row
    MATCH (person:Entity {uid: row.personUid})
    MERGE (office:Entity {uid: row.officeUid})
    ON CREATE SET
      office.name = row.officeName,
      office.normalizedName = row.officeNormalized,
      office.kindHint = 'office',
      office.schemaVersion = $schema_version,
      office.createdAt = datetime(),
      office.updatedAt = datetime()
    ON MATCH SET
      office.schemaVersion = coalesce(office.schemaVersion, $schema_version),
      office.updatedAt = datetime()
    MERGE (person)-[r:REFERRED_AS {documentUid: row.documentUid}]->(office)
    SET r.title = row.title,
        r.source = 'mention_title',
        r.updatedAt = datetime()
    """
    with driver.session(database=database) as session:
        if rows:
            session.run(
                cypher,
                rows=rows,
                schema_version=GRAPH_SCHEMA_VERSION,
            )
        if office_rows:
            session.run(
                office_cypher,
                rows=office_rows,
                schema_version=GRAPH_SCHEMA_VERSION,
            )


def audit_phase1_provenance(
    driver: Any, database: str, document_uid: str
) -> list[str]:
    """Every EXPRESSES/MENTIONS edge must have a typed Decision ABOUT that target."""
    prop_cypher = """
    MATCH (u:Utterance {documentUid: $document_uid})-[:EXPRESSES]->(p:Proposition)
    OPTIONAL MATCH (u)-[:DECIDED_BY]->(dec:Decision {decisionType: 'proposition_link'})-[:ABOUT]->(p)
    OPTIONAL MATCH (u)-[:GROUNDED_IN]->(seg:Segment)
    RETURN u.uid AS uid,
           p.uid AS targetUid,
           dec IS NOT NULL AS hasDecision,
           seg IS NOT NULL AS hasSegment
    """
    ent_cypher = """
    MATCH (u:Utterance {documentUid: $document_uid})-[:MENTIONS]->(e:Entity)
    OPTIONAL MATCH (u)-[:DECIDED_BY]->(dec:Decision {decisionType: 'entity_link'})-[:ABOUT]->(e)
    RETURN u.uid AS uid,
           e.uid AS targetUid,
           dec IS NOT NULL AS hasDecision
    """
    problems: list[str] = []
    with driver.session(database=database) as session:
        for record in session.run(prop_cypher, document_uid=document_uid):
            if not record["hasDecision"]:
                problems.append(
                    f"{record['uid']}: EXPRESSES {record['targetUid']} missing proposition_link Decision"
                )
            if not record["hasSegment"]:
                problems.append(f"{record['uid']}: Proposition path missing Segment")
        for record in session.run(ent_cypher, document_uid=document_uid):
            if not record["hasDecision"]:
                problems.append(
                    f"{record['uid']}: MENTIONS {record['targetUid']} missing entity_link Decision"
                )
    return problems


def write_arguments(
    driver: Any,
    database: str,
    *,
    document_uid: str,
    arguments: list[Any],
) -> None:
    """MERGE Argument nodes, HAS_ROLE edges, and argument_role Decisions."""
    rows = []
    for arg in arguments:
        role_rows = []
        for role in arg.roles:
            dec_uid = (
                f"{document_uid}:adec:"
                f"{hashlib.sha256(f'{arg.uid}|{role.role}|{role.proposition_uid}'.encode()).hexdigest()[:16]}"
            )
            role_rows.append(
                {
                    "role": role.role,
                    "propositionUid": role.proposition_uid,
                    "decisionUid": dec_uid,
                }
            )
        rows.append(
            {
                "uid": arg.uid,
                "summary": arg.summary,
                "roles": role_rows,
            }
        )

    cypher = """
    UNWIND $rows AS row
    MERGE (a:Argument {uid: row.uid})
    SET a.summary = row.summary,
        a.documentUid = $document_uid,
        a.schemaVersion = $schema_version,
        a.updatedAt = datetime(),
        a.createdAt = coalesce(a.createdAt, datetime())
    WITH a, row
    UNWIND row.roles AS role
    MATCH (p:Proposition {uid: role.propositionUid})
    MERGE (a)-[hr:HAS_ROLE]->(p)
    SET hr.role = role.role,
        hr.updatedAt = datetime()
    MERGE (dec:Decision {uid: role.decisionUid})
    SET dec.decisionType = 'argument_role',
        dec.confidence = 1.0,
        dec.actor = 'model',
        dec.status = 'accepted',
        dec.role = role.role,
        dec.createdAt = coalesce(dec.createdAt, datetime())
    MERGE (a)-[:DECIDED_BY]->(dec)
    MERGE (dec)-[:ABOUT]->(p)
    """
    if not rows:
        return
    with driver.session(database=database) as session:
        session.run(
            cypher,
            rows=rows,
            document_uid=document_uid,
            schema_version=GRAPH_SCHEMA_VERSION,
        )


def audit_phase2_provenance(
    driver: Any, database: str, document_uid: str
) -> list[str]:
    """Every HAS_ROLE must have argument_role Decision and Prop→Utterance→Segment path."""
    cypher = """
    MATCH (a:Argument {documentUid: $document_uid})-[hr:HAS_ROLE]->(p:Proposition)
    OPTIONAL MATCH (a)-[:DECIDED_BY]->(dec:Decision {decisionType: 'argument_role'})-[:ABOUT]->(p)
    OPTIONAL MATCH (u:Utterance {documentUid: $document_uid})-[:EXPRESSES]->(p)
    OPTIONAL MATCH (u)-[:GROUNDED_IN]->(seg:Segment)
    RETURN a.uid AS argUid,
           p.uid AS propUid,
           hr.role AS role,
           dec IS NOT NULL AS hasDecision,
           u IS NOT NULL AS hasUtterance,
           seg IS NOT NULL AS hasSegment
    """
    problems: list[str] = []
    with driver.session(database=database) as session:
        for record in session.run(cypher, document_uid=document_uid):
            label = f"{record['argUid']} HAS_ROLE({record['role']})->{record['propUid']}"
            if not record["hasDecision"]:
                problems.append(f"{label}: missing argument_role Decision")
            if not record["hasUtterance"]:
                problems.append(f"{label}: no Utterance EXPRESSES path in document")
            elif not record["hasSegment"]:
                problems.append(f"{label}: Utterance missing GROUNDED_IN Segment")
    return problems


def new_run_uid(document_uid: str) -> str:
    return f"{document_uid}:run:{uuid.uuid4().hex[:12]}"


def utterance_uids_for_validated(
    document_uid: str, utterances: list[ValidatedUtterance]
) -> list[str]:
    return [
        utterance_uid(document_uid, u.char_start, u.char_end, u.text) for u in utterances
    ]