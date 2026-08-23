# relevance-gate

Qualify newly ingested stories; sets `relevance_status` to **Keep**, **Drop**, or **Pending**.

Batch runs claim the **oldest** unclassified stories first (FIFO) via RPC `claim_stories_for_relevance` (migration `210_relevance_gate_fifo_claim.sql`). There is no lookback window unless `lookback_days` is passed.

| Deploy | Notes |
|--------|--------|
| `relevance_gate` | First qualify pass on title/snippet |

If **Pending**, resolve via [review-pending-stories](../06-review-pending-stories/) before [scrape-story-content](../03-scrape-story-content/) (Keep only). Admin dashboards count pending separately from KEEP/DROP (`/api/admin/dashboard-metrics`, Observability funnel).
