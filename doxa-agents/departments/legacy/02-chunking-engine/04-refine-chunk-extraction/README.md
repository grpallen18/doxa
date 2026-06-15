# refine-chunk-extraction

Applies validator patches to chunk `extraction_json` (max three repair cycles per chunk). Recomputes provenance spans from `source_excerpt` after patches are applied.

| Deploy name | Output |
|-------------|--------|
| `refine_chunk_extraction` | Updated `extraction_json`, refinement artifacts |

**Model:** defaults to `gpt-5.4-nano-2026-03-17`. Override with `OPENAI_MODEL_CHUNK_QA` (or `OPENAI_MODEL_EXTRACT` / `OPENAI_MODEL` fallback).

Upstream: [05-validate-chunk-extraction](../05-validate-chunk-extraction/) when status is `needs_refinement`. Next: re-validate.
