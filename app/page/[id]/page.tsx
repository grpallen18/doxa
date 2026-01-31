import { notFound } from 'next/navigation'
import Link from 'next/link'
import { LandingHeader } from '@/components/LandingHeader'
import { Panel } from '@/components/Panel'
import PerspectiveSection from '@/components/node/PerspectiveSection'
import { NodeWithDetails } from '@/lib/types'
import { createClient } from '@/lib/supabase/server'

async function getNode(id: string): Promise<NodeWithDetails | null> {
  const supabase = await createClient()
  try {
    const { data: node, error: nodeError } = await supabase
      .from('nodes')
      .select('*')
      .eq('id', id)
      .single()

    if (nodeError || !node) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/04f79c5f-4ad7-48be-abb9-5a2114e37662', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'app/page/[id]/page.tsx:getNode', message: 'getNode: no node returned from Supabase', data: { requestedId: id, nodeError: nodeError?.message ?? null, hasNode: !!node }, timestamp: Date.now(), sessionId: 'debug-session', hypothesisId: 'C' }) }).catch(() => {})
      // #endregion
      return null
    }

    const { data: nodePerspectives } = await supabase
      .from('node_perspectives')
      .select(`
        *,
        perspective:perspectives(*)
      `)
      .eq('node_id', id)
      .eq('version', node.version)

    const { data: sources } = await supabase
      .from('sources')
      .select('*')
      .eq('node_id', id)
      .order('created_at', { ascending: false })

    const { data: relationships } = await supabase
      .from('node_relationships')
      .select(`
        *,
        source_node:nodes!source_node_id(*),
        target_node:nodes!target_node_id(*)
      `)
      .or(`source_node_id.eq.${id},target_node_id.eq.${id}`)

    const { data: validations } = await supabase
      .from('validations')
      .select('perspective_id, is_represented')
      .eq('node_id', id)
      .eq('node_version', node.version)

    let validationStats: NodeWithDetails['validation_stats'] = []
    if (validations) {
      const statsMap = new Map<string, { total: number; positive: number }>()
      validations.forEach((v) => {
        const key = v.perspective_id
        if (!statsMap.has(key)) {
          statsMap.set(key, { total: 0, positive: 0 })
        }
        const stats = statsMap.get(key)!
        stats.total++
        if (v.is_represented) stats.positive++
      })
      validationStats = Array.from(statsMap.entries()).map(([perspective_id, stats]) => ({
        perspective_id,
        total_validations: stats.total,
        positive_validations: stats.positive,
        validation_rate: stats.total > 0 ? stats.positive / stats.total : 0,
      }))
    }

    const { data: votes } = await supabase
      .from('perspective_votes')
      .select('perspective_id, vote_value')
      .eq('node_id', id)
      .eq('node_version', node.version)

    let voteStats: NodeWithDetails['vote_stats'] = []
    if (votes) {
      const voteMap = new Map<string, { up: number; down: number }>()
      votes.forEach((v) => {
        const key = v.perspective_id as string
        if (!voteMap.has(key)) voteMap.set(key, { up: 0, down: 0 })
        const stats = voteMap.get(key)!
        if (v.vote_value > 0) stats.up++
        else if (v.vote_value < 0) stats.down++
      })
      voteStats = Array.from(voteMap.entries()).map(([perspective_id, stats]) => ({
        perspective_id,
        upvotes: stats.up,
        downvotes: stats.down,
        net_score: stats.up - stats.down,
      }))
    }

    const nodeWithDetails: NodeWithDetails = {
      ...node,
      perspectives: (nodePerspectives || []).map((np: any) => ({
        ...np,
        perspective: np.perspective,
      })),
      sources: sources || [],
      relationships: relationships || [],
      validation_stats: validationStats,
      vote_stats: voteStats,
    }

    // #region agent log
    const cfLen = typeof node.core_facts === 'string' ? node.core_facts.length : 0
    const sfKeys = node.shared_facts && typeof node.shared_facts === 'object' ? Object.keys(node.shared_facts) : []
    const sfValueLengths = sfKeys.map((k) => (typeof (node.shared_facts as Record<string, unknown>)[k] === 'string' ? ((node.shared_facts as Record<string, string>)[k].length) : 0))
    fetch('http://127.0.0.1:7243/ingest/04f79c5f-4ad7-48be-abb9-5a2114e37662', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'app/page/[id]/page.tsx:getNode', message: 'getNode return: Supabase row payload', data: { nodeId: node.id, core_facts_length: cfLen, core_facts_preview: typeof node.core_facts === 'string' ? node.core_facts.slice(0, 120) : null, shared_facts_keys: sfKeys, shared_facts_value_lengths: sfValueLengths }, timestamp: Date.now(), sessionId: 'debug-session', hypothesisId: 'A' }) }).catch(() => {})
    // #endregion

    return nodeWithDetails
  } catch (error) {
    return null
  }
}

export default async function TopicPage({ params }: { params: { id: string } }) {
  const node = await getNode(params.id)

  if (!node) {
    notFound()
  }

  const validationStatsMap = new Map(
    (node.validation_stats || []).map((stat) => [stat.perspective_id, stat])
  )
  const voteStatsMap = new Map(
    (node.vote_stats || []).map((stat) => [stat.perspective_id, stat])
  )

  const coreFactsParagraphs =
    node.core_facts?.split(/\n\n+/).filter((p) => p.trim()) ?? []

  // #region agent log
  const hasSharedFacts = !!(node.shared_facts && Object.keys(node.shared_facts).length > 0)
  const firstCoreLen = coreFactsParagraphs[0]?.length ?? 0
  const firstSfKey = node.shared_facts && Object.keys(node.shared_facts).length > 0 ? Object.keys(node.shared_facts)[0] : null
  const firstSfVal = firstSfKey && node.shared_facts ? (node.shared_facts as Record<string, unknown>)[firstSfKey] : null
  const firstSfValStr = typeof firstSfVal === 'string' ? firstSfVal : JSON.stringify(firstSfVal)
  const firstSfValPreview = typeof firstSfVal === 'string' ? firstSfVal.slice(0, 200) : null
  const hasLiteralBackslashN = typeof firstSfVal === 'string' && firstSfVal.includes('\\n')
  fetch('http://127.0.0.1:7243/ingest/04f79c5f-4ad7-48be-abb9-5a2114e37662', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'app/page/[id]/page.tsx:TopicPage', message: 'TopicPage derived: paragraphs and shared_facts branch', data: { nodeId: node.id, coreFactsParagraphCount: coreFactsParagraphs.length, firstParagraphLength: firstCoreLen, sharedFactsKeyCount: node.shared_facts ? Object.keys(node.shared_facts).length : 0, willRenderCoreFacts: coreFactsParagraphs.length > 0, willRenderSharedFacts: hasSharedFacts, firstSharedFactsValueLength: firstSfValStr?.length ?? 0, firstSharedFactsValuePreview: firstSfValPreview, hasLiteralBackslashN }, timestamp: Date.now(), sessionId: 'debug-session', hypothesisId: 'B' }) }).catch(() => {})
  // #endregion

  return (
    <main className="min-h-screen px-4 pb-16 pt-6 text-foreground sm:px-6 md:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 md:gap-10">
        <LandingHeader />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="inline-flex items-center rounded-pill border border-subtle bg-surface px-3 py-1 uppercase tracking-[0.18em]">
              {node.status.replace('_', ' ')}
            </span>
            <span>Version {node.version}</span>
          </div>
          <Link href="/graph" className="text-xs text-muted hover:text-foreground">
            ← Back to topics map
          </Link>
        </div>

        {/* Title and main article body (Wikipedia-style) */}
        <Panel as="article" variant="base" className="space-y-6">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {node.question}
          </h1>

          {coreFactsParagraphs.length > 0 && (
            <div className="space-y-4 text-sm text-foreground">
              {coreFactsParagraphs.map((paragraph, i) => (
                <p key={i}>{paragraph.trim()}</p>
              ))}
            </div>
          )}

          {node.shared_facts && Object.keys(node.shared_facts).length > 0 && (
            <div className="space-y-4 border-t border-subtle pt-6">
              {Object.entries(node.shared_facts).map(([key, value]) => {
                const text = typeof value === 'string' ? value : JSON.stringify(value)
                const paragraphs = text.split(/\n\n+/).filter((p) => p.trim())
                return (
                  <div key={key} className="space-y-2">
                    <h2 className="text-base font-semibold tracking-tight text-foreground">
                      {key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </h2>
                    <div className="space-y-2 text-sm text-muted">
                      {paragraphs.map((p, i) => (
                        <p key={i}>{p.trim()}</p>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>

        {(node.coverage_summary || node.missing_perspectives) && (
          <div className="grid gap-4 md:grid-cols-2">
            {node.coverage_summary && (
              <Panel variant="soft" className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  How it was covered
                </p>
                <p className="text-sm text-foreground">{node.coverage_summary}</p>
              </Panel>
            )}
            {node.missing_perspectives && (
              <Panel variant="soft" className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  What&apos;s missing
                </p>
                <p className="text-sm text-foreground">{node.missing_perspectives}</p>
              </Panel>
            )}
          </div>
        )}

        <section aria-labelledby="perspectives-heading" className="space-y-4">
          <h2
            id="perspectives-heading"
            className="text-xl font-semibold tracking-tight sm:text-2xl"
          >
            Perspectives
          </h2>
          {node.perspectives && node.perspectives.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-3">
              {node.perspectives.map((np) => (
                <PerspectiveSection
                  key={np.id}
                  nodeId={node.id}
                  nodeVersion={node.version}
                  nodePerspective={np}
                  validationStats={validationStatsMap.get(np.perspective_id)}
                  voteStats={voteStatsMap.get(np.perspective_id)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No perspectives available yet.</p>
          )}
        </section>

        {node.sources && node.sources.length > 0 && (
          <Panel as="section" variant="soft" className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight">Sources</h2>
            <ul className="space-y-2 text-sm">
              {node.sources.map((source) => (
                <li key={source.id} className="flex items-start gap-2">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground underline-offset-2 hover:underline"
                  >
                    {source.title}
                  </a>
                  <span className="text-xs text-muted capitalize">
                    {source.source_type.replace('_', ' ')}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {node.relationships && node.relationships.length > 0 && (
          <Panel as="section" variant="soft" className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight">Related topics</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {node.relationships.map((rel) => {
                const relatedNode =
                  rel.source_node_id === node.id ? rel.target_node : rel.source_node
                return (
                  <Link
                    key={rel.id}
                    href={`/page/${relatedNode.id}`}
                    className="panel-bevel-soft block rounded-bevel p-4 text-sm transition"
                  >
                    <div className="mb-1 text-xs uppercase tracking-[0.18em] text-muted">
                      {rel.relationship_type.replace('_', ' ')}
                    </div>
                    <div className="font-medium text-foreground">
                      {relatedNode.question}
                    </div>
                  </Link>
                )
              })}
            </div>
          </Panel>
        )}

      </div>
    </main>
  )
}
