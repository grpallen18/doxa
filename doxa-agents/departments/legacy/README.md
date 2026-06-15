# legacy

Archived pipeline agents. **Not in the admin runnable catalog** and **not in `activation.yaml`**. Edge function stubs still point here so deployed functions and historical data remain addressable.

Re-enable a step by moving its folder back under the active department, adding it to [ops/pipeline-admin-catalog.yaml](../../ops/pipeline-admin-catalog.yaml), setting `maturity: 'live'` in the vision-flow layout, and running `npm run agents:refresh`.

## Directory layout

| Tree | Former department | Contents |
|------|-------------------|----------|
| [02-chunking-engine/](02-chunking-engine/) | Chunking | Post-review refine, positions lane, multi-atom chunk steps |
| [03-merging-engine/](03-merging-engine/) | Merging | Merge to `story_*`, merge QA loop |
| [04-semantic-intelligence-engine/](04-semantic-intelligence-engine/) | Semantic intelligence | Canonical linkers, stance backfill, debate topology |
| (flat) | Legacy claim-cluster | Pre-topology position clustering agents |

Flat agents at this level (pre-topology claim-cluster engine):

- [extract-story-entities](extract-story-entities/) → `extract_story_entities`
- [merge-story-entities](merge-story-entities/) → `merge_story_entities`

## Agents (deprecated)

<!-- AGENTS:BEGIN -->

### legacy (generated)

| Step | Deploy | Status |
|------|--------|--------|
| aggregate-position-pair-scores | aggregate_position_pair_scores | deprecated |
| standardize-chunk-extraction | standardize_chunk_extraction | deprecated |
| refine-chunk-claims | refine_chunk_claims | deprecated |
| refine-chunk-extraction | refine_chunk_extraction | deprecated |
| validate-chunk-extraction | validate_chunk_extraction | deprecated |
| link-chunk-entities | link_chunk_entities | deprecated |
| extract-story-positions | extract_story_positions | deprecated |
| validate-chunk-positions | validate_chunk_positions | deprecated |
| refine-chunk-positions | refine_chunk_positions | deprecated |
| build-position-clusters | build_position_clusters | deprecated |
| merge-story-claims | merge_story_claims | deprecated |
| merge-story-positions | merge_story_positions | deprecated |
| review-merged-extraction | review_merged_extraction | deprecated |
| refine-merged-extraction | refine_merged_extraction | deprecated |
| validate-merged-extraction | validate_merged_extraction | deprecated |
| classify-claim-pairs | classify_claim_pairs | deprecated |
| generate-position-summaries | generate_position_summaries | deprecated |
| label-thesis | label_thesis | deprecated |
| extract-story-entities | extract_story_entities | deprecated |
| merge-story-entities | merge_story_entities | deprecated |

<!-- AGENTS:END -->
