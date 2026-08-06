# Analysis pipeline workflow

Rebuildable L4 jobs. JWT-off internal chain via `analysis_pipeline`.

| Step | Folder | Deploy | Notes |
|------|--------|--------|-------|
| generate-evidence-check-candidates | [01-generate-evidence-check-candidates](01-generate-evidence-check-candidates/) | `generate_evidence_check_candidates` | Pending Decisions for Prop↔Segment |
| run-evidence-checks | [02-run-evidence-checks](02-run-evidence-checks/) | `run_evidence_checks` | LLM EvidenceCheck + Decision |
| extract-citations | [03-extract-citations](03-extract-citations/) | `extract_citations` | Citation pointers (no verdict) |
| run-controversy-assessments | [04-run-controversy-assessments](04-run-controversy-assessments/) | `run_controversy_assessments` | Assessment + MethodRun |
| update-held-by-tracks | [05-update-held-by-tracks](05-update-held-by-tracks/) | `update_held_by_tracks` | Temporal Agent→Proposition |
| link-derived-media-clips | [06-link-derived-media-clips](06-link-derived-media-clips/) | `link_derived_media_clips` | Clip DERIVED_FROM parent asset |
| project-analysis-summaries | [07-project-analysis-summaries](07-project-analysis-summaries/) | `project_analysis_summaries` | Supabase graph_assessments |
| analysis-pipeline | [08-analysis-pipeline](08-analysis-pipeline/) | `analysis_pipeline` | Orchestrator |

Upstream: Phase 2 Controversies / Propositions. Downstream: Admin graph-controversies Analyzed UI.
