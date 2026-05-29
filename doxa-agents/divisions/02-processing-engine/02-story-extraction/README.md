# 02 Story extraction

Per-chunk LLM extraction of **claims**, **evidence**, **positions**, and **events** (plus links between them). Positions are read from the article text here—not invented later in position-intelligence.

| Step | Deploy name | Output |
|------|-------------|--------|
| [extract-story-entities](01-extract-story-entities/) | `extract_story_entities` | `story_chunks.extraction_json` |

`extraction_json` shape: `claims`, `evidence`, `links`, `positions`, `position_claim_links`, `position_evidence_links`, `events`, `event_evidence_links`.

Next: [03-story-synthesis/merge-story-entities](../03-story-synthesis/01-merge-story-entities/) merges chunks into `story_*` tables, then canonicalization runs under `03-semantic-intelligence-engine/01-canonical-knowledge/`.
