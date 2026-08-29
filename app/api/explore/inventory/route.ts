import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TOPIC_HUB_DENSITY_BAR } from '@/lib/explore-routes'
import { DEBATE_REBUILD_MESSAGE, isDebateRebuildMode } from '@/lib/debate-rebuild'

type InventoryPayload = {
  density_bar: number
  controversies: number
  viewpoints: number
  evidence_excerpts: number
  topic_links: number
  hubs: Array<{
    topic_id: string
    slug: string
    title: string
    status: string
    linked_controversies: number
    listed: boolean
  }>
  guidance: string
}

async function loadInventory(): Promise<InventoryPayload> {
  const supabase = await createClient()
  const [
    { count: controversyCount },
    { count: viewpointCount },
    { count: excerptCount },
    { data: links },
    { data: topics },
  ] = await Promise.all([
    supabase.from('graph_controversies').select('*', { count: 'exact', head: true }),
    supabase.from('graph_viewpoints').select('*', { count: 'exact', head: true }),
    supabase.from('graph_evidence_excerpts').select('*', { count: 'exact', head: true }),
    supabase.from('graph_topic_links').select('topic_id, controversy_uid'),
    supabase.from('topics').select('topic_id, slug, title, status'),
  ])

  const counts = new Map<string, number>()
  for (const row of links ?? []) {
    const id = row.topic_id as string
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }

  const hubs = (topics ?? [])
    .map((t) => ({
      topic_id: t.topic_id as string,
      slug: t.slug as string,
      title: t.title as string,
      status: t.status as string,
      linked_controversies: counts.get(t.topic_id as string) ?? 0,
      listed:
        (counts.get(t.topic_id as string) ?? 0) >= TOPIC_HUB_DENSITY_BAR &&
        ['published', 'stable', 'under_review'].includes(t.status as string),
    }))
    .filter((h) => h.linked_controversies > 0)
    .sort((a, b) => b.linked_controversies - a.linked_controversies)

  return {
    density_bar: TOPIC_HUB_DENSITY_BAR,
    controversies: controversyCount ?? 0,
    viewpoints: viewpointCount ?? 0,
    evidence_excerpts: excerptCount ?? 0,
    topic_links: links?.length ?? 0,
    hubs,
    guidance:
      hubs.length === 0
        ? 'Run project_debate_summaries (after migration 200) and/or SELECT link_graph_controversies_to_topics(); publish topics that meet the density bar.'
        : 'Featured hubs on home are those with listed=true.',
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function inventoryHtml(data: InventoryPayload) {
  const rows = [
    ['Controversies', String(data.controversies)],
    ['Viewpoints', String(data.viewpoints)],
    ['Evidence excerpts', String(data.evidence_excerpts)],
    ['Topic links', String(data.topic_links)],
    ['Density bar', String(data.density_bar)],
  ]
    .map(
      ([label, value]) =>
        `<tr><th scope="row">${label}</th><td>${value}</td></tr>`
    )
    .join('')

  const hubRows =
    data.hubs.length === 0
      ? '<p class="muted">No topic hubs with linked controversies yet.</p>'
      : `<ul>${data.hubs
          .map(
            (h) =>
              `<li><strong>${escapeHtml(h.title)}</strong> (${escapeHtml(h.slug)}) — ${h.linked_controversies} linked${h.listed ? ', listed' : ''}</li>`
          )
          .join('')}</ul>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Explore inventory</title>
  <style>
    :root {
      color-scheme: light dark;
      --page-bg: #f5f3f0;
      --page-fg: #1a1712;
      --page-muted: #3f3629;
      --page-line: #d4cfc6;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --page-bg: #151515;
        --page-fg: #f2f2f2;
        --page-muted: #a8a8a8;
        --page-line: #2a2a2a;
      }
    }
    html, body { background: var(--page-bg); color: var(--page-fg); }
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 2rem auto; max-width: 40rem; line-height: 1.5; }
    table { border-collapse: collapse; width: 100%; }
    th, td { text-align: left; padding: 0.4rem 0; border-bottom: 1px solid var(--page-line); }
    th { font-weight: 600; width: 60%; }
    a { color: inherit; }
    .muted { color: var(--page-muted); }
    code { font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>Explore inventory</h1>
  <p class="muted">Readiness of Neo projections for the consumer app.</p>
  <table>${rows}</table>
  <h2>Hubs</h2>
  ${hubRows}
  <p>${data.guidance}</p>
  <p class="muted">JSON: <a href="/api/explore/inventory?format=json"><code>?format=json</code></a></p>
</body>
</html>`
}

export async function GET(request: NextRequest) {
  if (isDebateRebuildMode()) {
    return NextResponse.json({
      maintenance: true,
      guidance: DEBATE_REBUILD_MESSAGE,
      controversies: 0,
      viewpoints: 0,
    })
  }
  try {
    const data = await loadInventory()
    const format = request.nextUrl.searchParams.get('format')
    const accept = request.headers.get('accept') ?? ''
    const wantsJson =
      format === 'json' ||
      (format !== 'html' && accept.includes('application/json') && !accept.includes('text/html'))

    if (wantsJson) {
      return NextResponse.json(data)
    }

    return new NextResponse(inventoryHtml(data), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Inventory failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
