# relevance-gate

Qualify newly ingested stories; sets `relevance_status` to **Keep**, **Drop**, or **Pending**.

Batch runs claim the **oldest** unclassified stories first (FIFO), with no lookback window unless `lookback_days` is passed.

| Deploy | Notes |
|--------|--------|
| `relevance_gate` | First qualify pass on title/snippet |

If **Pending**, resolve via [review-pending-stories](../06-review-pending-stories/) before [scrape-story-content](../03-scrape-story-content/) (Keep only).

| Deploy | Notes |
|--------|--------|
| `relevance_gate` | First qualify pass on title/snippet |

If **Pending**, resolve via [review-pending-stories](../06-review-pending-stories/) before [scrape-story-content](../03-scrape-story-content/) (Keep only).
