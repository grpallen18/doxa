# 02 Position intelligence

Operates on **canonical** positions and `position_relationships`—not on raw article text.

| Step | Role |
|------|------|
| `classify-position-pairs` | LLM: how pairs of positions relate |
| `clustering-pipeline` | Orchestrates debate topology + optional summaries/viewpoints |
| `build-debate-topology` | Agreement/controversy structure |
| `generate-agreement-summaries` / `generate-viewpoints` | Narrative layer |

Position **text** is extracted in `02-processing-engine/02-story-extraction` and canonicalized in `01-canonical-knowledge/link-canonical-positions`.
