# Architecture roadmap

**Current overhaul:** [neo4j-graph-architecture.md](neo4j-graph-architecture.md) · [neo4j-overhaul-next.md](neo4j-overhaul-next.md)

Claims extract/merge and legacy canonical/topology SQL paths are being replaced by Neo4j AuraDB + Python `neo4j-graphrag` + Doxa debate jobs.

## Deferred product areas (post–Build 3)

### Quality assurance

- Graph integrity validation
- Regression testing on the validation corpus
- Confidence scoring
- Source reliability review
- Exception / quarantine queues (not full extract QA)

### Knowledge governance

- Topic taxonomy management
- Entity resolution and alias management (canonical merge/split review)
- Ontology governance
- Historical context / relevance decay

When each area gains automation, add a department folder under `doxa-agents/departments/` and register steps via `npm run agents:refresh` (do not hand-edit `manifest.yaml`).
