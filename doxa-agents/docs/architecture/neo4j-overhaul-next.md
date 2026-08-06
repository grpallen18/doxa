# Neo4j discourse graph — next phases (handoff)

**Completed:** Phase 0 — utterance-grounded foundation. Phase 1 — Proposition + cautious Entity ER. Phase 2 — Argument + Viewpoint/Controversy/Dispute + projections. Cross-story Neo hubs (Controversy / Proposition / Entity).  
**Phase 0 validation:** [phase0-validation.md](phase0-validation.md)  
**Phase 1 validation:** [phase1-validation.md](phase1-validation.md)  
**Phase 2 validation:** [phase2-validation.md](phase2-validation.md)  
**Cross-story Neo:** [cross-story-neo-validation.md](cross-story-neo-validation.md)  
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

### Checklist

- [x] Architecture Phase 3 schema tables documented
- [x] Aura constraints for Assessment / EvidenceCheck / Citation / MethodRun
- [x] Edge `analysis_pipeline` (evidence checks, citations, assessments, HELD_BY, clip DERIVED_FROM)
- [x] Supabase `graph_assessments` projection + Admin Analyzed UI
- [x] Runtime validation — see [phase3-validation.md](phase3-validation.md)

---

## Cleanup — retire legacy claims / SQL topology

### Status

**Done** (agents/stubs/UI cutover + DROP migrations `197`/`198`).

### Checklist

- [x] Delete `02-chunking-engine`, `03-merging-engine`, `departments/legacy`, `lib/extraction-qa`
- [x] Delete matching Edge stubs; JWT-off list trimmed; `npm run agents:refresh`
- [x] Strip Admin claims extraction UI; Positions/Controversies → Neo Debate
- [x] Product topics + health report use `graph_*` projections
- [x] DROP legacy claim/topology tables (`198_drop_legacy_claims_topology.sql`)
- [x] Rewrite [topology-pipeline.md](../topology-pipeline.md) for Neo path
- [x] Generated deploy catalog has no deleted deploy names

---

## User ops reminder (any phase)

- Aura credentials and Railway worker secrets
- Re-run `services/graph-worker/neo4j/init_constraints.cypher` on Aura after schema changes
- Apply new Supabase migrations in SQL Editor when added
- `supabase functions deploy <name> --no-verify-jwt` when listed in deploy.md
- Do not hand-edit `manifest.yaml` or `docs/generated/*`
