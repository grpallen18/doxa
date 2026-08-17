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

JWT-off. Not in `activation.yaml` until scheduled.
