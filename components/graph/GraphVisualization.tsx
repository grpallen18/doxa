'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/Button'

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })

interface GraphNode {
  id: string
  question: string
  status: string
}

interface GraphLink {
  id: string
  source: string | GraphNode
  target: string | GraphNode
  type: string
}

interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

type GraphColors = {
  stable: string
  underReview: string
  draft: string
  default: string
  link: string
}

const defaultGraphColors: GraphColors = {
  stable: '#c9a55d',
  underReview: '#7eb8b3',
  draft: '#6a6053',
  default: '#4a4539',
  link: 'rgba(74, 69, 57, 0.25)',
}

function getGraphColorsFromCSS(): GraphColors {
  if (typeof document === 'undefined') return defaultGraphColors
  const root = document.documentElement
  const style = getComputedStyle(root)
  return {
    stable: style.getPropertyValue('--graph-node-stable').trim() || defaultGraphColors.stable,
    underReview:
      style.getPropertyValue('--graph-node-under-review').trim() || defaultGraphColors.underReview,
    draft: style.getPropertyValue('--graph-node-draft').trim() || defaultGraphColors.draft,
    default:
      style.getPropertyValue('--graph-node-default').trim() || defaultGraphColors.default,
    link: style.getPropertyValue('--graph-link').trim() || defaultGraphColors.link,
  }
}

export default function GraphVisualization() {
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [graphColors, setGraphColors] = useState<GraphColors>(defaultGraphColors)
  const router = useRouter()
  const graphRef = useRef<any>()

  useEffect(() => {
    setGraphColors(getGraphColorsFromCSS())
  }, [])

  useEffect(() => {
    fetch('/api/graph')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error.message)
        } else {
          setGraphData(data.data)
        }
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Panel variant="soft" className="flex flex-col items-center gap-4 p-8">
          <div
            className="h-12 w-12 animate-spin rounded-full border-2 border-muted border-t-accent-primary"
            aria-hidden
          />
          <p className="text-sm text-muted">Loading graph…</p>
        </Panel>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Panel variant="soft" className="flex flex-col items-center gap-4 p-8 text-center">
          <p className="text-sm text-foreground">Error: {error}</p>
          <Button onClick={() => window.location.reload()} variant="primary">
            Retry
          </Button>
        </Panel>
      </div>
    )
  }

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Panel variant="soft" className="flex flex-col items-center gap-4 p-8 text-center">
          <p className="text-sm text-muted">No nodes found in the graph.</p>
          <a
            href="/"
            className="btn-primary inline-flex items-center justify-center rounded-md px-6 py-3 text-sm font-medium"
          >
            ← Home
          </a>
        </Panel>
      </div>
    )
  }

  const getNodeColor = (status: string) => {
    switch (status) {
      case 'stable':
        return graphColors.stable
      case 'under_review':
        return graphColors.underReview
      case 'draft':
        return graphColors.draft
      default:
        return graphColors.default
    }
  }

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
      <Panel variant="soft" className="flex shrink-0 flex-col gap-4 p-5 md:w-56">
        <div className="flex flex-wrap items-center justify-between gap-2 md:flex-col md:items-stretch">
          <a
            href="/"
            className="btn-primary w-fit md:w-full inline-flex items-center justify-center rounded-md px-6 py-3 text-sm font-medium"
          >
            ← Home
          </a>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Node Map</h2>
        </div>
        <p className="text-sm text-muted">
          {graphData.nodes.length} nodes, {graphData.links.length} relationships
        </p>
        <div className="flex flex-wrap gap-4 text-xs text-muted md:flex-col">
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: graphColors.stable }}
              aria-hidden
            />
            <span>Stable</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: graphColors.underReview }}
              aria-hidden
            />
            <span>Under Review</span>
          </div>
        </div>
      </Panel>

      <div className="h-[60vh] min-h-[400px] flex-1 overflow-hidden rounded-bevel bg-surface shadow-panel-soft">
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          nodeLabel={(node: any) => node.question}
          nodeColor={(node: any) => getNodeColor(node.status)}
          nodeVal={() => 10}
          linkColor={() => graphColors.link}
          linkWidth={2}
          onNodeClick={(node: any) => {
            router.push(`/page/${node.id}`)
          }}
          onNodeHover={(node: any) => {
            document.body.style.cursor = node ? 'pointer' : 'default'
          }}
          cooldownTicks={100}
          onEngineStop={() => {
            if (graphRef.current) {
              graphRef.current.zoomToFit(400, 20)
            }
          }}
        />
      </div>
    </div>
  )
}
