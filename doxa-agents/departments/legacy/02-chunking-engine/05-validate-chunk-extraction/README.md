# validate-chunk-extraction

Production judge for standardized chunk atoms; sets `atoms_passed` or routes to refine/human review (max three validation attempts). Recomputes provenance spans from `source_excerpt` before validation.

| Deploy name | Output |
|-------------|--------|
| `validate_chunk_extraction` | `extraction_qa_status` atoms_passed / needs_refinement / needs_human_review |

**Model:** defaults to `gpt-5.4-nano-2026-03-17`. Override with `OPENAI_MODEL_CHUNK_QA` (or `OPENAI_MODEL_EXTRACT` / `OPENAI_MODEL` fallback).

Upstream: [03-standardize-chunk-extraction](../03-standardize-chunk-extraction/) or [04-refine-chunk-extraction](../04-refine-chunk-extraction/). Next: [06-link-chunk-entities](../06-link-chunk-entities/).
