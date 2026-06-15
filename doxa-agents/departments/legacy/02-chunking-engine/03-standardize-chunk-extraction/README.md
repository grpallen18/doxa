# standardize-chunk-extraction

Taxonomy and materiality standardizer for per-chunk candidate `extraction_json`. Runs once after extract.

| Deploy name | Output |
|-------------|--------|
| `standardize_chunk_extraction` | `story_chunks.extraction_json`, `extraction_qa_standardization_report`, status `standardized` |

**Model:** defaults to `gpt-5.4-nano-2026-03-17`. Override with `OPENAI_MODEL_CHUNK_QA` (or `OPENAI_MODEL_EXTRACT` / `OPENAI_MODEL` fallback).

Recomputes `span_start`/`span_end` from `source_excerpt` after standardization. Preserves raw extract in `chunk_extract` artifact.

Upstream: [02-extract-story-entities](../02-extract-story-entities/). Next: [05-validate-chunk-extraction](../05-validate-chunk-extraction/) → refine loop when needed.
