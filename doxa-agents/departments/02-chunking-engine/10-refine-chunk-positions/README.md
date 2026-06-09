# refine-chunk-positions

Patch positions extraction from review findings (max three cycles).

| Deploy name | Queue stage |
|-------------|-------------|
| `refine_chunk_positions` | `refine_positions` (`needs_refinement`) |

Upstream: [09-validate-chunk-positions](../09-validate-chunk-positions/). Re-run validate after refine until chunk `passed`.
