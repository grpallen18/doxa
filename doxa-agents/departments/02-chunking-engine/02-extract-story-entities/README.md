# extract-story-entities

Per-chunk LLM extraction of **claims**, **evidence**, **positions**, and **events** (plus links between them). Positions are read from the article text here—not invented later in position-intelligence.

| Deploy name | Output |
|-------------|--------|
| `extract_story_entities` | `story_chunks.extraction_json` |

`extraction_json` shape: `claims`, `evidence`, `claim_evidence_links`, `positions`, `position_claim_links`, `position_evidence_links`, `events`, `event_claim_links`, `event_evidence_links`.

Next: [03-review-chunk-extraction](../03-review-chunk-extraction/) → chunk QA → [03-merging-engine](../../03-merging-engine/) → canonicalization under [04-semantic-intelligence-engine](../../04-semantic-intelligence-engine/).
