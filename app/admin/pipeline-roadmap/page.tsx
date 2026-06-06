import { Panel } from '@/components/Panel'

const phases = [
  {
    id: '0',
    title: 'Phase 0 — Catalog foundation',
    status: 'Done',
    summary:
      'Generated pipeline catalog from manifest + overlay. Stage-grouped story checklist (ingestion → extraction → canonical). Ingestion run-step support.',
  },
  {
    id: '1',
    title: 'Phase 1 — Story pipeline complete',
    status: 'Done',
    summary:
      'Story hub + /ingestion, /extraction, /canonical subpages. reset_story_canonical_links RPC. Unified Admin Center search. Shared pipeline components.',
  },
  {
    id: '2',
    title: 'Phase 2 — Canonical record hubs',
    status: 'Planned',
    summary:
      'Claim and position hubs. Topology read view. Generic POST /api/admin/pipeline/run-step. Trace APIs for story and position.',
  },
  {
    id: '3',
    title: 'Phase 3 — Cluster and controversy ops',
    status: 'Planned',
    summary:
      'Agreement and controversy hubs with lineage. Cluster-scoped run-step. Topology revert RPCs with shared-entity warnings.',
  },
  {
    id: '4',
    title: 'Phase 4 — Operator polish',
    status: 'Planned',
    summary:
      'pipeline_runs history per record. Batch maintenance actions. Stage health dashboards. Prompt version tagging on reruns.',
  },
]

export default function AdminPipelineRoadmapPage() {
  return (
    <>
      <section className="space-y-2">
        <h1 className="text-xl font-semibold">Pipeline operations roadmap</h1>
        <p className="text-sm text-muted">
          Salesforce-style admin ops: search records, inspect pipeline stages, trace lineage, rerun
          and revert steps. Full spec:{' '}
          <code className="text-xs">docs/admin-pipeline-ops-roadmap.md</code> in the repo.
        </p>
      </section>

      <ul className="space-y-3">
        {phases.map((phase) => (
          <li key={phase.id}>
            <Panel variant="soft" className="p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-medium">{phase.title}</h2>
                <span
                  className={`text-xs font-medium ${
                    phase.status === 'Done' ? 'text-green-600' : 'text-muted'
                  }`}
                >
                  {phase.status}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted">{phase.summary}</p>
            </Panel>
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted">
        Catalog source: <code>doxa-agents/ops/pipeline-admin-catalog.yaml</code> · Generated:{' '}
        <code>lib/admin/generated/pipeline-catalog.ts</code>
      </p>
    </>
  )
}
