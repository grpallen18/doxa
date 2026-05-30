# extract-story-entities

Per-chunk LLM extraction of **claims**, **evidence**, **positions**, and **events** with provenance (no semantic links).

| Deploy name | Output |
|-------------|--------|
| `extract_story_entities` | `story_chunks.extraction_json` |

**Model:** defaults to `gpt-5.4-nano-2026-03-17`. Override with `OPENAI_MODEL_EXTRACT` (or `OPENAI_MODEL` fallback).

`extraction_json` phase A: `claims`, `evidence`, `positions`, `events` — each with `source_excerpt`, `span_start`, `span_end` (spans recomputed server-side from `source_excerpt`), `extraction_confidence`, `source_story_id`, `source_chunk_index`.

Next: [03-standardize-chunk-extraction](../03-standardize-chunk-extraction/) → validate/refine loop → [06-link-chunk-entities](../06-link-chunk-entities/) → merge.
