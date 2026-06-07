# relevance-gate

Qualify newly ingested stories; sets `relevance_status` to **Keep**, **Drop**, or **Pending**.

| Deploy | Notes |
|--------|--------|
| `relevance_gate` | First qualify pass on title/snippet |

If **Pending**, resolve via [review-pending-stories](../06-review-pending-stories/) before [scrape-story-content](../03-scrape-story-content/) (Keep only).
