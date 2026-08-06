# Phase 2 validation checklist

Steering: [neo4j-graph-architecture.md](neo4j-graph-architecture.md)  
Handoff: [neo4j-overhaul-next.md](neo4j-overhaul-next.md)

**Status:** Runtime validated on Aura (2026-08-06) — Controversies + projections live. Ready for Phase 3.

## Preconditions

1. Apply [`init_constraints.cypher`](../../../services/graph-worker/neo4j/init_constraints.cypher) on Aura (Argument / Viewpoint / Controversy / Dispute).
2. Redeploy Azure `graph-worker` image with schema `2.2.0` / extractor `2.2.0-argument-debate`.
3. Apply migration `194_graph_debate_projections.sql`.
4. Set Edge Function secrets: `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`, `OPENAI_API_KEY`.
5. Deploy JWT-off debate functions (see deploy reminders).

## Checklist

- [x] Argument nodes exist for reprocessed fixture with `HAS_ROLE` → Proposition
- [x] Every `HAS_ROLE` has `Decision {decisionType:'argument_role'}` and Prop→Utterance→Segment path
- [x] Admin Neo document workspace shows Argument counts (props/args projected into Sigma)
- [x] `generate_proposition_pair_candidates` writes pending candidate Decisions (blocked pairs only)
- [x] `classify_proposition_relationships` writes Decision-backed `RELATES_TO`; low-confidence quarantined (no silent merge)
- [x] Multi-sided Controversy (≥2 Viewpoints) with `INCLUDES` when oppose edges exist
- [ ] Dispute nodes + Decision provenance for definitional / talking-past / assumption kinds when present *(none accepted yet — path verified dry; awaits dispute-kind classifications)*
- [x] `graph_controversies` / `graph_viewpoints` / `graph_controversy_evidence` populated by `project_debate_summaries`
- [x] Admin `/admin/graph-controversies` lists projections without browser Neo creds
- [x] Vision/catalog primary path includes Debate (Neo) stage
- [x] Claims extraction route redirects to Neo; Debate nav replaces Agreements as primary
- [ ] Document reprocess deletes document Arguments but does **not** destroy unrelated Controversies *(manual / deferred)*

## Fixture

Story: `1ab913f7-3913-4fd3-be18-6ceafc9f4dd4` (or current Phase 0/1 fixture).

## Runtime snapshot (2026-08-06)

| Signal | Value |
|--------|-------|
| Arguments / HAS_ROLE | 920 / 2522 |
| Propositions | 3716 |
| Accepted `RELATES_TO` | 11 (mostly `oppose`) |
| Viewpoints | 13 (incl. singleton sides for early backlog) |
| Controversies | 2 (both cross-document; 2-doc and 7-doc) |
| Disputes | 0 |
| Supabase projections | 2 controversies, 13 viewpoints, 9 evidence rows |
| Classify accept floor | `AUTO_ACCEPT_MIN_CONFIDENCE = 0.75` |

## Sign-off

| Check | Result |
|-------|--------|
| Schema / extractor versions | `2.2.0` / `2.2.0-argument-debate` (fixture Document) |
| Aura constraints | Applied (`Argument`/`Viewpoint`/`Controversy`/`Dispute`) |
| Debate Edge Functions | Deployed with `--no-verify-jwt` |
| Projection migration | Applied (`194` / history aligned) |
| Azure graph-worker | Live — `doxa-graph-worker:phase2` |
| Fixture Argument reprocess | Validated — 4 HAS_ROLE + Decisions + Segment paths |
| Dry-run orchestrator | Pass (`limit:10`, all 6 steps) |
| Live assembly + project | Pass — controversies + Supabase rows |
| Cron | Enabled in repo — run `07-debate-pipeline/schedule.sql` in SQL Editor (`debate-pipeline-hourly`, `15 * * * *`, body `{"limit":50}`; classify capped at 25) |
| Bugbot | Material debate findings fixed (neoInt, knn seed, limit forward, singleton viewpoints) |

**Code path:** Phase 2 shipped and runtime-green for Arguments + Controversy assembly. Debate Edge deploy already done. Remaining: dispute-kind volume, reprocess-isolation manual check, **user must run schedule.sql** to activate pg_cron. **Next:** Phase 3 — Assessments / EvidenceCheck (implemented).
