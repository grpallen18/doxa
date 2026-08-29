# Neo4j constraints and indexes for Doxa discourse graph (Phase 0–3).
# Run once against AuraDB after creating the instance or after schema upgrades
# (Neo4j Browser or cypher-shell).
#
# Legacy Story/Assertion/Chunk constraints from schema 1.x may remain until
# manually dropped; they do not conflict with Phase 0–3 labels.

CREATE CONSTRAINT document_uid IF NOT EXISTS
FOR (d:Document) REQUIRE d.uid IS UNIQUE;

CREATE CONSTRAINT segment_uid IF NOT EXISTS
FOR (s:Segment) REQUIRE s.uid IS UNIQUE;

CREATE CONSTRAINT utterance_uid IF NOT EXISTS
FOR (u:Utterance) REQUIRE u.uid IS UNIQUE;

CREATE CONSTRAINT publication_uid IF NOT EXISTS
FOR (p:Publication) REQUIRE p.uid IS UNIQUE;

CREATE CONSTRAINT agent_uid IF NOT EXISTS
FOR (a:Agent) REQUIRE a.uid IS UNIQUE;

CREATE CONSTRAINT extraction_run_uid IF NOT EXISTS
FOR (r:ExtractionRun) REQUIRE r.uid IS UNIQUE;

CREATE CONSTRAINT decision_uid IF NOT EXISTS
FOR (d:Decision) REQUIRE d.uid IS UNIQUE;

CREATE CONSTRAINT media_asset_uid IF NOT EXISTS
FOR (m:MediaAsset) REQUIRE m.uid IS UNIQUE;

CREATE CONSTRAINT proposition_uid IF NOT EXISTS
FOR (p:Proposition) REQUIRE p.uid IS UNIQUE;

CREATE CONSTRAINT entity_uid IF NOT EXISTS
FOR (e:Entity) REQUIRE e.uid IS UNIQUE;

CREATE CONSTRAINT argument_uid IF NOT EXISTS
FOR (a:Argument) REQUIRE a.uid IS UNIQUE;

CREATE CONSTRAINT viewpoint_uid IF NOT EXISTS
FOR (v:Viewpoint) REQUIRE v.uid IS UNIQUE;

CREATE CONSTRAINT controversy_uid IF NOT EXISTS
FOR (c:Controversy) REQUIRE c.uid IS UNIQUE;

CREATE CONSTRAINT issue_uid IF NOT EXISTS
FOR (i:Issue) REQUIRE i.uid IS UNIQUE;

CREATE CONSTRAINT dispute_uid IF NOT EXISTS
FOR (d:Dispute) REQUIRE d.uid IS UNIQUE;

# L3 Question-first (Session 2) — contested question registry (not Arena :Issue)
CREATE CONSTRAINT question_uid IF NOT EXISTS
FOR (q:Question) REQUIRE q.uid IS UNIQUE;

# Phase 3 — L4 Analytical
CREATE CONSTRAINT assessment_uid IF NOT EXISTS
FOR (a:Assessment) REQUIRE a.uid IS UNIQUE;

CREATE CONSTRAINT evidence_check_uid IF NOT EXISTS
FOR (e:EvidenceCheck) REQUIRE e.uid IS UNIQUE;

CREATE CONSTRAINT citation_uid IF NOT EXISTS
FOR (c:Citation) REQUIRE c.uid IS UNIQUE;

CREATE CONSTRAINT method_run_uid IF NOT EXISTS
FOR (m:MethodRun) REQUIRE m.uid IS UNIQUE;

CREATE INDEX utterance_document_uid IF NOT EXISTS
FOR (u:Utterance) ON (u.documentUid);

CREATE INDEX agent_normalized_name IF NOT EXISTS
FOR (a:Agent) ON (a.normalizedName);

CREATE INDEX proposition_normalized_text IF NOT EXISTS
FOR (p:Proposition) ON (p.normalizedText);

CREATE INDEX entity_normalized_name IF NOT EXISTS
FOR (e:Entity) ON (e.normalizedName);

CREATE INDEX argument_document_uid IF NOT EXISTS
FOR (a:Argument) ON (a.documentUid);

CREATE INDEX viewpoint_document_uid IF NOT EXISTS
FOR (v:Viewpoint) ON (v.documentUid);

CREATE INDEX controversy_issue_uid IF NOT EXISTS
FOR (c:Controversy) ON (c.issueUid);

CREATE INDEX controversy_chapter_of IF NOT EXISTS
FOR (c:Controversy) ON (c.chapterOf);

CREATE INDEX controversy_status IF NOT EXISTS
FOR (c:Controversy) ON (c.status);

CREATE INDEX issue_topic_key IF NOT EXISTS
FOR (i:Issue) ON (i.topicKey);

CREATE INDEX issue_dirty IF NOT EXISTS
FOR (i:Issue) ON (i.dirty);

CREATE INDEX question_status IF NOT EXISTS
FOR (q:Question) ON (q.status);

CREATE INDEX question_type IF NOT EXISTS
FOR (q:Question) ON (q.questionType);

CREATE INDEX question_blocking_key IF NOT EXISTS
FOR (q:Question) ON (q.blockingKey);

CREATE INDEX assessment_target_uid IF NOT EXISTS
FOR (a:Assessment) ON (a.targetUid);

CREATE INDEX evidence_check_proposition_uid IF NOT EXISTS
FOR (e:EvidenceCheck) ON (e.propositionUid);

CREATE INDEX method_run_method_id IF NOT EXISTS
FOR (m:MethodRun) ON (m.methodId);