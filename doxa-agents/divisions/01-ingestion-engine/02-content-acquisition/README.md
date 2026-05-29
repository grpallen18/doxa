# 02 Content acquisition

Fetch full article text, normalize it, and optionally re-review pending stories.

| Step | Deploy | Notes |
|------|--------|--------|
| [scrape-story-content](01-scrape-story-content/) | `scrape_story_content` | Dispatch Cloudflare scrape worker |
| [receive-scraped-content](02-receive-scraped-content/) | `receive_scraped_content` | Worker callback (`--no-verify-jwt`) |
| [clean-scraped-content](03-clean-scraped-content/) | `clean_scraped_content` | LLM: raw HTML → `content_clean` |
| [review-pending-stories](04-review-pending-stories/) | `review_pending_stories` | Re-classify `PENDING` stories with clean body |

Upstream: [01-sourcing](../01-sourcing/). Downstream: [02-processing-engine/01-document-processing](../../02-processing-engine/01-document-processing/).
