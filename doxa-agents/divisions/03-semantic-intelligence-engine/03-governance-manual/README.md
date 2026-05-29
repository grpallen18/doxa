# 03 Governance (manual)

Admin and app-triggered steps—not part of the automated story pipeline cron chain.

| Step | Deploy | Trigger |
|------|--------|---------|
| [seed-subtopic-embeddings](01-seed-subtopic-embeddings/) | `seed_subtopic_embeddings` | Manual |
| [assign-ranked-subtopics](02-assign-ranked-subtopics/) | `assign_ranked_subtopics` | Invoked by `link-canonical-positions` |
| [process-topic](03-process-topic/) | `process_topic` | App |
| [review-link-suggestion](04-review-link-suggestion/) | `review_link_suggestion` | App |

Automated canonicalization and clustering live under [01-canonical-knowledge](../01-canonical-knowledge/) and [02-position-intelligence](../02-position-intelligence/).
