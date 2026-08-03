# Phase 2 validation checklist

Steering: [neo4j-graph-architecture.md](neo4j-graph-architecture.md)  
Handoff: [neo4j-overhaul-next.md](neo4j-overhaul-next.md)

**Status:** Implemented — validate on Aura after worker redeploy + constraints + debate secrets.

## Preconditions

1. Apply [`init_constraints.cypher`](../../../services/graph-worker/neo4j/init_constraints.cypher) on Aura (Argument / Viewpoint / Controversy / Dispute).
2. Redeploy Azure `graph-worker` image with schema `2.2.0` / extractor `2.2.0-argument-debate`.
3. Apply migration `194_graph_debate_projections.sql`.
4. Set Edge Function secrets: `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`, `OPENAI_API_KEY`.
5. Deploy JWT-off debate functions (see deploy reminders).

## Checklist

- [ ] Argument nodes exist for reprocessed fixture with `HAS_ROLE` → Proposition
- [ ] Every `HAS_ROLE` has `Decision {decisionType:'argument_role'}` and Prop→Utterance→Segment path
- [ ] Admin Neo document workspace shows Argument counts
- [ ] `generate_proposition_pair_candidates` writes pending candidate Decisions (blocked pairs only)
- [ ] `classify_proposition_relationships` writes Decision-backed `RELATES_TO`; low-confidence quarantined (no silent merge)
- [ ] Multi-sided Controversy (≥2 Viewpoints) with `INCLUDES` when oppose edges exist
- [ ] Dispute nodes + Decision provenance for definitional / talking-past / assumption kinds when present
- [ ] `graph_controversies` / `graph_viewpoints` / `graph_controversy_evidence` populated by `project_debate_summaries`
- [ ] Admin `/admin/graph-controversies` lists projections without browser Neo creds
- [ ] Vision/catalog primary path: Ingest → Clean → Graph → Proposition → Debate → Complete
- [ ] Claims extraction route redirects to Neo; Debate nav replaces Agreements as primary
- [ ] Document reprocess deletes document Arguments but does **not** destroy unrelated Controversies

## Fixture

Story: `1ab913f7-3913-4fd3-be18-6ceafc9f4dd4` (or current Phase 0/1 fixture).

## Sign-off

| Check | Result |
|-------|--------|
| Schema / extractor versions | `2.2.0` / `2.2.0-argument-debate` |
| Aura constraints | Applied (`Argument`/`Viewpoint`/`Controversy`/`Dispute`) |
| Debate Edge Functions | Deployed with `--no-verify-jwt` |
| Projection migration | Applied (`194_graph_debate_projections`) |
| Azure graph-worker | Live — `doxa-graph-worker:phase2` revision `0000017` |
| Fixture Argument reprocess | User: re-enqueue fixture after worker image is live |
| Bugbot | 3 rounds; material findings fixed (audit WHERE, rebuild cleanup, dispute Decision separation, oppose undirected match) |

**Code path:** Phase 2 shipped. Runtime green for Arguments requires Azure worker image live + fixture reprocess; debate assembly requires Edge secrets `NEO4J_*` + `OPENAI_API_KEY`.

