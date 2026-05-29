# topology-pipeline

Orchestrates agreement/controversy topology build; optionally summaries and viewpoints.

| Deploy | Chain |
|--------|-------|
| `topology_pipeline` | `build_agreement_clusters` → `generate_agreement_cluster_candidates` → `classify_agreement_cluster_relationships` → `build_controversy_clusters` |

Body: `{ dry_run?, skip_summaries_viewpoints? }`. Deploy with `--no-verify-jwt`.
