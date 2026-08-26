# Graph hygiene

Neo4j + projection maintenance: integrity audit, orphan prune, entity alias quarantine, projection reconcile.

Does not silently merge Entities/Propositions. Alias candidates stay `pending` until a Decision-backed merge.

| Step | Folder | Deploy | Notes |
|------|--------|--------|-------|
| graph-integrity-audit | [01-graph-integrity-audit](01-graph-integrity-audit/) | `graph_integrity_audit` | Counts + invariant failures |
| prune-orphans | [02-prune-orphans](02-prune-orphans/) | `prune_orphans` | Orphan Assessments/Decisions, stale SQL |
| entity-alias-candidates | [03-entity-alias-candidates](03-entity-alias-candidates/) | `entity_alias_candidates` | Near-duplicate Entity queue |
| projection-reconcile | [04-projection-reconcile](04-projection-reconcile/) | `projection_reconcile` | Neo vs `graph_*` |
| graph-hygiene | [05-graph-hygiene](05-graph-hygiene/) | `graph_hygiene` | Orchestrator |
| wipe-l3-analytical | [06-wipe-l3-analytical](06-wipe-l3-analytical/) | `wipe_l3_analytical` | One-shot L3 wipe (keep L0–L2); body `{ "confirm": "WIPE_L3" }` |
| label-cq-gold-batch | [07-label-cq-gold-batch](07-label-cq-gold-batch/) | `label_cq_gold_batch` | Draft-label gold worksheet rows (ops); body `{ "rows": [...] }` |
| seed-question-registry | [08-seed-question-registry](08-seed-question-registry/) | `seed_question_registry` | Optional Edge upsert; prefer `npx tsx scripts/seed-question-registry.ts` locally |
| prune-oldest-documents | [09-prune-oldest-documents](09-prune-oldest-documents/) | `prune_oldest_documents` | Older-first Document subgraph prune for Aura Free; default `dry_run: true`; local: `npx tsx scripts/prune-oldest-documents.ts` |

JWT-off. Not in `activation.yaml` until scheduled.
