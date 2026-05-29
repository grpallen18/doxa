# generate-position-pair-candidates

Deterministic queue of canonical position pairs worth LLM classification.

| Deploy | Output |
|--------|--------|
| `generate_position_pair_candidates` | `position_pair_candidates` |

Signals: subtopic overlap, embedding similarity, claim/story/source overlap. Upstream: [assign-ranked-subtopics](../01-assign-ranked-subtopics/). Downstream: [classify-position-relationships](../03-classify-position-relationships/).
