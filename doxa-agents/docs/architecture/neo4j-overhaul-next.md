# Neo4j discourse graph — next phases (handoff)

**Completed:** Phase 0 — utterance-grounded foundation. Phase 1 — Proposition + cautious Entity ER (signed off 2026-08-03; Agent/office title split in extractor `2.1.2`).  
**Phase 0 validation:** [phase0-validation.md](phase0-validation.md)  
**Phase 1 validation:** [phase1-validation.md](phase1-validation.md)  
**Steering:** [neo4j-graph-architecture.md](neo4j-graph-architecture.md)  

Use the copy-paste prompts below to start the next Cursor plan+execute cycle. Do not re-litigate locked decisions in the steering doc (Utterance ≠ Proposition; Decision-backed canonicalization; vectors never auto-merge).

---

## Phase 1 — Proposition layer + cautious ER

### Status

**Done.** Checklist below remains for historical reference.

```text
Implement Neo4j discourse graph Phase 1 per doxa-agents/docs/architecture/neo4j-graph-architecture.md and neo4j-overhaul-next.md.

Scope:
1. Add Proposition nodes and EXPRESSES edges from Utterance → Proposition with Decision provenance (decisionType proposition_link).
2. Candidate generation via embeddings/blocking only; auto-link only at high precision; else quarantine. Never silent merge. Support VARIANT_OF when scope/certainty/timeframe differ.
3. Mention → candidate → canonical Entity resolution with quarantine (job status quarantined / node flags). Do NOT recreate review/refine/approve UI. Never-merge: office vs officeholder, org vs leader, same-name different people.
4. Provenance audit: every EXPRESSES edge has Decision; every Proposition reachable from an Utterance with Segment path.
5. Optional Neo4j vector index on Proposition embeddings for candidates only (not SoT).
6. Extend phase0-validation.md / add phase1-validation.md with merge precision/recall and under-merge preference.
7. Admin: graph job list + failure/quarantine detail if not already present.

Out of scope: Argument / Viewpoint / Controversy (Phase 2), deleting 02/03/legacy handlers.
Do not edit the plan file if one is attached; mark todos as you go.
```

### Checklist

- [x] Proposition + EXPRESSES + Decision written by worker or follow-on job
- [x] No auto-merge without Decision; quarantine path works
- [x] VARIANT_OF used instead of destructive merge for scoped differences
- [x] Entity ER quarantine (no silent GraphRAG merges)
- [x] Provenance completeness for proposition links
- [x] Validation doc for merge precision / under-merge preference — [phase1-validation.md](phase1-validation.md)

### Key paths

- `services/graph-worker/app/` (or new proposition job module)
- `services/graph-worker/neo4j/init_constraints.cypher`
- `doxa-agents/docs/architecture/`

---

## Phase 2 — Argumentation + controversy

### Cursor plan prompt (copy-paste)

```text
Implement Neo4j discourse graph Phase 2 per neo4j-graph-architecture.md and neo4j-overhaul-next.md.

Scope:
1. Argument hyperedge nodes with HAS_ROLE (premise|conclusion|assumption|objection|rebuttal|qualifier|value|prediction) pointing at Propositions.
2. Viewpoint and Controversy nodes; multi-sided (not forced binary). Port useful taxonomy ideas from doxa-agents/lib/topology/relationship-taxonomy.ts and controversy-assembly.ts — re-ground on Proposition/Argument, not legacy SQL positions.
3. Dispute nodes for competing definitions / talking-past / incompatible assumptions.
4. Project summary rows to Supabase for UI; server-side Neo4j read API (never Aura creds in browser).
5. Update vision-flow-layout / pipeline-admin-catalog primary path: Ingest → Clean → Graph → Proposition → Debate → Complete.
6. Redirect or remove claims review UI from primary nav.

Out of scope: wholesale deletion of obsolete handlers/tables (Phase 2 cleanup / later), L4 Assessments as product defaults.
```

### Checklist

- [x] Argument HAS_ROLE edges with utterance provenance paths
- [x] Controversy + Viewpoint multi-sided assembly
- [x] Supabase projections + authenticated Neo4j read API
- [x] Vision canvas primary path updated
- [x] Claims review UI redirected or removed from primary nav

See [phase2-validation.md](phase2-validation.md) for Aura/runtime sign-off.

### Key paths

- `doxa-agents/lib/topology/*` (ideas only)
- `lib/admin/workflow-canvas/vision-flow-layout.ts`
- `doxa-agents/ops/pipeline-admin-catalog.yaml`
- `services/graph-worker/` and/or new debate job Edge Functions

---

## Phase 3 — Analysis, evidence checks, time

### Cursor plan prompt (copy-paste)

```text
Implement Phase 3 per neo4j-graph-architecture.md: EvidenceCheck vs Citation dual tracks, Assessment/MethodRun, HELD_BY temporal position tracks, clip DERIVED_FROM for multimodal excerpts. UI must label extracted vs analyzed. Do not present Assessments as objective facts.
```

---

## Cleanup — after Phase 2 product path

### Cursor plan prompt (copy-paste)

```text
Delete obsolete claims/legacy pipeline once Phase 2 debate path is the product path:
1. Delete doxa-agents/departments/02-chunking-engine claims agents, 03-merging-engine, and departments/legacy extraction/merge/canonical/topology when superseded.
2. Delete matching supabase/functions stubs; update config.toml JWT-off list; run npm run agents:refresh.
3. Delete doxa-agents/lib/extraction-qa/ when unused; obsolete admin extraction-review routes/components.
4. Migration to DROP unused story_* atom tables and old SQL topology tables after UI no longer reads them. Preserve stories, story_bodies, sources, auth, pipeline_runs, graph_processing_*.
5. Rewrite stale docs; rewrite or replace topology-pipeline.md for Neo4j.
6. Run validation checklists; confirm zero dead deploy names in generated docs.
```

### Delete inventory (verify before dropping)

- `doxa-agents/departments/02-chunking-engine/` (claims path)
- `doxa-agents/departments/03-merging-engine/`
- `doxa-agents/departments/legacy/` (when debate replaced)
- `doxa-agents/lib/extraction-qa/`
- Matching `supabase/functions/*` stubs for extract/validate/refine/approve/merge/canonical/topology
- UI: claims-review-report, extraction-review APIs
- Tables: `story_claims`, `story_positions`, `chunk_claim_versions`, agreement/controversy SQL tables if fully moved to Neo4j+projections

---

## User ops reminder (any phase)

- Aura credentials and Railway worker secrets
- Re-run `services/graph-worker/neo4j/init_constraints.cypher` on Aura after schema changes
- Apply new Supabase migrations in SQL Editor when added
- `supabase functions deploy <name> --no-verify-jwt` when listed in deploy.md
- Do not hand-edit `manifest.yaml` or `docs/generated/*`
