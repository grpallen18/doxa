# extract-story-entities

Per-chunk LLM extraction of **claims**, **evidence**, **positions**, and **events** (plus links between them). Positions are read from the article text here—not invented later in position-intelligence.

| Deploy name | Output |
|-------------|--------|
| `extract_story_entities` | `story_chunks.extraction_json` |

`extraction_json` shape: `claims`, `evidence`, `claim_evidence_links`, `positions`, `position_claim_links`, `position_evidence_links`, `events`, `event_claim_links`, `event_evidence_links`.

Next: [merge-story-entities](../03-merge-story-entities/) merges chunks into `story_*` tables, then canonicalization runs under [03-semantic-intelligence-engine](../../03-semantic-intelligence-engine/).
