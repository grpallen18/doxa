'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  ReactFlow,
  SelectionMode,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useStoreApi,
  ReactFlowProvider,
  type Edge,
  type Node,
  type OnNodeDrag,
} from '@xyflow/react'
import {
  mergeWorkflowCanvasEdgeAttachments,
  type EdgeEndpointOverride,
  type WorkflowCanvasEdgeAttachments,
} from '@/lib/admin/workflow-canvas/edge-attachments'
import {
  mergeWorkflowCanvasEdgeMeta,
  type EdgeColor,
  type WorkflowCanvasEdgeMetaMap,
} from '@/lib/admin/workflow-canvas/edge-meta'
import { clearFloatingEdgeLayoutCache } from '@/lib/admin/workflow-canvas/floating-edge-layout'
import '@xyflow/react/dist/style.css'

import type { PipelineChecklist } from '@/lib/admin/story-pipeline-checklist'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import { buildVisionGraph } from '@/lib/admin/workflow-canvas/build-vision-graph'
import { buildChunkVisionGraph } from '@/lib/admin/workflow-canvas/build-chunk-vision-graph'
import type { WorkflowCanvasPositions } from '@/lib/admin/workflow-canvas/layout'
import { applyEdgeMetaToEdges } from '@/lib/admin/workflow-canvas/merge-edge-meta'
import {
  applySavedPositionsToNodes,
  mergeGraphIntoNodes,
} from '@/lib/admin/workflow-canvas/merge-graph-nodes'
import { CanvasAgentNode } from '@/components/admin/workflow-canvas/nodes/canvas-agent-node'
import { CanvasDecisionNode } from '@/components/admin/workflow-canvas/nodes/canvas-decision-node'
import { CanvasFanoutNode } from '@/components/admin/workflow-canvas/nodes/canvas-fanout-node'
import { CanvasMergeNode } from '@/components/admin/workflow-canvas/nodes/canvas-merge-node'
import { CanvasPlaceholderNode } from '@/components/admin/workflow-canvas/nodes/canvas-placeholder-node'
import { CanvasTerminalNode } from '@/components/admin/workflow-canvas/nodes/canvas-terminal-node'
import { WorkflowCanvasControls } from '@/components/admin/workflow-canvas/workflow-canvas-controls'
import { WorkflowCanvasCurrentSteps } from '@/components/admin/workflow-canvas/workflow-canvas-current-steps'
import { WorkflowCanvasEdgeContextMenu } from '@/components/admin/workflow-canvas/workflow-canvas-edge-context-menu'
import { useWorkflowCanvasLayout } from '@/components/admin/workflow-canvas/use-workflow-canvas-layout'
import { useAgentDisplayNames } from '@/components/admin/agents/use-agent-display-names'
import { WorkflowCanvasLayoutProvider } from '@/components/admin/workflow-canvas/workflow-canvas-layout-context'
import { CanvasFloatingEdge } from '@/components/admin/workflow-canvas/edges/canvas-floating-edge'
import { FIT_VIEW_OPTIONS } from '@/components/admin/workflow-canvas/workflow-canvas-constants'

const nodeTypes = {
  agent: CanvasAgentNode,
  decision: CanvasDecisionNode,
  merge: CanvasMergeNode,
  fanout: CanvasFanoutNode,
  placeholder: CanvasPlaceholderNode,
  terminal: CanvasTerminalNode,
}

const edgeTypes = {
  floating: CanvasFloatingEdge,
}

function WorkflowCanvasInner({
  checklist,
  payload,
  isStepRunning,
  selectedNodeId,
  onSelectNode,
  focusNodeId,
  onRegisterDismissInspector,
  graphMode = 'story',
}: {
  checklist: PipelineChecklist
  payload: StoryExtractionReviewPayload
  isStepRunning: (stepId: PipelineStepId) => boolean
  selectedNodeId: string | null
  onSelectNode: (id: string | null) => void
  focusNodeId: string | null
  onRegisterDismissInspector?: (dismiss: (() => void) | null) => void
  graphMode?: 'story' | 'chunk'
}) {
  const { setCenter, fitView } = useReactFlow()
  const store = useStoreApi()
  const isDraggingRef = useRef(false)
  const clearingSelectionRef = useRef(false)
  const suppressSelectionSyncUntilRef = useRef(0)
  const blockInspectorOpenRef = useRef(false)
  const prevSelectedIdsRef = useRef<string[]>([])
  const dragStartPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const {
    savedPositions,
    savedEdgeAttachments,
    savedEdgeMeta,
    loaded,
    remoteSyncEpoch,
    scheduleSaveDelta,
    scheduleSaveEdgeAttachment,
    scheduleSaveEdgeMeta,
  } = useWorkflowCanvasLayout(isDraggingRef)
  const { displayNames } = useAgentDisplayNames()
  const [edgeAttachments, setEdgeAttachments] = useState<WorkflowCanvasEdgeAttachments>({})
  const [edgeMeta, setEdgeMeta] = useState<WorkflowCanvasEdgeMetaMap>({})
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null)
  const [edgeMenu, setEdgeMenu] = useState<{
    edgeId: string
    x: number
    y: number
  } | null>(null)
  const layoutHydratedRef = useRef(false)
  const [layoutHydrated, setLayoutHydrated] = useState(false)
  const initialFitDoneRef = useRef(false)
  const lastRemoteSyncEpochRef = useRef(0)

  const baseGraph = useMemo(
    () =>
      graphMode === 'chunk'
        ? buildChunkVisionGraph({
            checklist,
            isStepRunning,
            payload,
            displayNameOverrides: displayNames,
          })
        : buildVisionGraph({
            checklist,
            isStepRunning,
            payload,
            displayNameOverrides: displayNames,
            canvasScope: 'story',
          }),
    [checklist, isStepRunning, payload, displayNames, graphMode]
  )

  const graphWithSaved = useMemo(
    () => ({
      nodes: applySavedPositionsToNodes(baseGraph.nodes, savedPositions),
      edges: applyEdgeMetaToEdges(baseGraph.edges, edgeMeta),
    }),
    [baseGraph, savedPositions, edgeMeta]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(baseGraph.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(baseGraph.edges)

  useEffect(() => {
    if (!loaded) return
    setEdgeAttachments(savedEdgeAttachments)
    setEdgeMeta(savedEdgeMeta)
  }, [loaded, savedEdgeAttachments, savedEdgeMeta])

  useEffect(() => {
    if (!loaded || layoutHydratedRef.current) return
    layoutHydratedRef.current = true
    const hydrated = applySavedPositionsToNodes(baseGraph.nodes, savedPositions)
    setNodes(hydrated)
    setEdges(applyEdgeMetaToEdges(baseGraph.edges, savedEdgeMeta))
    setEdgeAttachments(savedEdgeAttachments)
    setEdgeMeta(savedEdgeMeta)
    setLayoutHydrated(true)
  }, [
    loaded,
    savedPositions,
    savedEdgeAttachments,
    savedEdgeMeta,
    baseGraph.nodes,
    baseGraph.edges,
    setNodes,
    setEdges,
  ])

  useEffect(() => {
    if (!layoutHydratedRef.current) return
    if (remoteSyncEpoch > lastRemoteSyncEpochRef.current) {
      lastRemoteSyncEpochRef.current = remoteSyncEpoch
      setNodes(graphWithSaved.nodes)
      setEdges(graphWithSaved.edges)
      setEdgeAttachments(savedEdgeAttachments)
      setEdgeMeta(savedEdgeMeta)
      clearFloatingEdgeLayoutCache()
      return
    }
    setEdges(graphWithSaved.edges)
    setNodes((current) => {
      const merged = mergeGraphIntoNodes(current, graphWithSaved.nodes)
      if (clearingSelectionRef.current || Date.now() < suppressSelectionSyncUntilRef.current) {
        return merged.map((n) => ({ ...n, selected: false }))
      }
      const currentSelectedCount = current.filter((n) => n.selected).length
      if (currentSelectedCount === 0) {
        return merged.map((n) => ({ ...n, selected: false }))
      }
      return merged
    })
  }, [
    graphWithSaved.nodes,
    graphWithSaved.edges,
    remoteSyncEpoch,
    savedPositions,
    savedEdgeAttachments,
    savedEdgeMeta,
    setNodes,
    setEdges,
  ])

  useEffect(() => {
    if (!layoutHydrated || initialFitDoneRef.current || focusNodeId) return
    initialFitDoneRef.current = true
    const t = window.setTimeout(() => {
      void fitView(FIT_VIEW_OPTIONS)
    }, 100)
    return () => window.clearTimeout(t)
  }, [layoutHydrated, focusNodeId, fitView])

  const lastFocusedNodeIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!focusNodeId) return
    const node = nodes.find((n) => n.id === focusNodeId)
    if (!node) return
    if (lastFocusedNodeIdRef.current === focusNodeId) {
      const t = window.setTimeout(() => {
        setCenter(node.position.x + 140, node.position.y + 60, { zoom: 0.85, duration: 400 })
      }, 100)
      return () => window.clearTimeout(t)
    }
    lastFocusedNodeIdRef.current = focusNodeId
    blockInspectorOpenRef.current = false
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        selected: n.id === focusNodeId,
      }))
    )
    onSelectNode(focusNodeId)
    const t = window.setTimeout(() => {
      setCenter(node.position.x + 140, node.position.y + 60, { zoom: 0.85, duration: 400 })
    }, 100)
    return () => window.clearTimeout(t)
  }, [focusNodeId, nodes, setCenter, onSelectNode, setNodes])

  const clearNodeSelection = useCallback(
    (_source: string) => {
      clearingSelectionRef.current = true
      blockInspectorOpenRef.current = true
      suppressSelectionSyncUntilRef.current = Date.now() + 800
      onSelectNode(null)
      setNodes((nds) => nds.map((n) => ({ ...n, selected: false })))
      store.getState().unselectNodesAndEdges()
    },
    [onSelectNode, store, selectedNodeId, setNodes]
  )

  useEffect(() => {
    onRegisterDismissInspector?.(() => clearNodeSelection('inspector-close'))
    return () => onRegisterDismissInspector?.(null)
  }, [onRegisterDismissInspector, clearNodeSelection])

  const onNodeClick = useCallback(
    (event: MouseEvent, node: Node) => {
      blockInspectorOpenRef.current = false
      setEditingEdgeId(null)
      setEdges((current) => current.map((edge) => ({ ...edge, selected: false })))

      if (event.shiftKey) return

      if (node.selected && node.id === selectedNodeId) {
        clearNodeSelection('node-click-toggle')
        return
      }

      onSelectNode(node.id)
    },
    [clearNodeSelection, onSelectNode, selectedNodeId, setEdges]
  )

  const onEdgeClick = useCallback(
    (_event: MouseEvent, edge: Edge) => {
      clearNodeSelection('edge-click')
      setEdges((current) =>
        current.map((item) => ({ ...item, selected: item.id === edge.id }))
      )
    },
    [clearNodeSelection, setEdges]
  )

  const onEdgeDoubleClick = useCallback((_event: MouseEvent, edge: Edge) => {
    setEditingEdgeId(edge.id)
  }, [])

  const onEdgeContextMenu = useCallback((event: MouseEvent, edge: Edge) => {
    event.preventDefault()
    setEdgeMenu({ edgeId: edge.id, x: event.clientX, y: event.clientY })
  }, [])

  const onPaneClick = useCallback(() => {
    clearNodeSelection('pane-click')
    setEditingEdgeId(null)
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })))
  }, [clearNodeSelection, setEdges, selectedNodeId])

  const setEdgeEndpointOverride = useCallback(
    (edgeId: string, role: 'source' | 'target', override: EdgeEndpointOverride) => {
      setEdgeAttachments((current) => {
        const next = mergeWorkflowCanvasEdgeAttachments(current, {
          [edgeId]: {
            ...current[edgeId],
            [role]: override,
          },
        })
        scheduleSaveEdgeAttachment(edgeId, next[edgeId])
        clearFloatingEdgeLayoutCache()
        return next
      })
    },
    [scheduleSaveEdgeAttachment]
  )

  const setEdgeLabel = useCallback(
    (edgeId: string, label: string) => {
      setEdgeMeta((current) => {
        const next = mergeWorkflowCanvasEdgeMeta(current, {
          [edgeId]: { ...current[edgeId], label },
        })
        scheduleSaveEdgeMeta(edgeId, next[edgeId])
        return next
      })
    },
    [scheduleSaveEdgeMeta]
  )

  const setEdgeColor = useCallback(
    (edgeId: string, color: EdgeColor) => {
      setEdgeMeta((current) => {
        const next = mergeWorkflowCanvasEdgeMeta(current, {
          [edgeId]: { ...current[edgeId], color },
        })
        scheduleSaveEdgeMeta(edgeId, next[edgeId])
        return next
      })
    },
    [scheduleSaveEdgeMeta]
  )

  const layoutContextValue = useMemo(
    () => ({
      edgeAttachments,
      edgeMeta,
      editingEdgeId,
      setEdgeEndpointOverride,
      setEdgeLabel,
      setEdgeColor,
      setEditingEdgeId,
    }),
    [
      edgeAttachments,
      edgeMeta,
      editingEdgeId,
      setEdgeEndpointOverride,
      setEdgeLabel,
      setEdgeColor,
    ]
  )

  const onSelectionStart = useCallback(() => {
    blockInspectorOpenRef.current = false
  }, [])

  const onSelectionChange = useCallback(
    ({ nodes: selected }: { nodes: Node[] }) => {
      const selectedIds = selected.map((n) => n.id)
      const prevSelectedIds = prevSelectedIdsRef.current
      const suppressingClear =
        clearingSelectionRef.current ||
        Date.now() < suppressSelectionSyncUntilRef.current
      if (suppressingClear) {
        if (selected.length > 0) {
          setNodes((nds) => nds.map((n) => ({ ...n, selected: false })))
          store.getState().unselectNodesAndEdges()
        } else {
          onSelectNode(null)
          prevSelectedIdsRef.current = []
          blockInspectorOpenRef.current = false
        }
        if (Date.now() >= suppressSelectionSyncUntilRef.current) {
          clearingSelectionRef.current = false
        }
        return
      }
      if (selected.length === 0 || selected.length >= 2) {
        prevSelectedIdsRef.current = selectedIds
        onSelectNode(null)
        if (selected.length >= 2) {
          blockInspectorOpenRef.current = false
        }
        return
      }
      const selectionChanged =
        prevSelectedIds.length !== 1 || prevSelectedIds[0] !== selectedIds[0]
      prevSelectedIdsRef.current = selectedIds
      if (selectionChanged && !blockInspectorOpenRef.current) {
        onSelectNode(selectedIds[0])
      }
    },
    [onSelectNode, selectedNodeId, setNodes, store]
  )

  const onNodeDragStart = useCallback<OnNodeDrag>((_event, _node, dragNodes) => {
    isDraggingRef.current = true
    dragStartPositionsRef.current = new Map(
      dragNodes.map((n) => [n.id, { x: n.position.x, y: n.position.y }])
    )
  }, [])

  const onNodeDragStop = useCallback<OnNodeDrag>(
    (_event, _node, dragNodes) => {
      isDraggingRef.current = false
      const delta: WorkflowCanvasPositions = {}
      for (const n of dragNodes) {
        const start = dragStartPositionsRef.current.get(n.id)
        if (
          !start ||
          start.x !== n.position.x ||
          start.y !== n.position.y
        ) {
          delta[n.id] = { x: n.position.x, y: n.position.y }
        }
      }
      scheduleSaveDelta(delta)
    },
    [scheduleSaveDelta]
  )

  return (
    <WorkflowCanvasLayoutProvider value={layoutContextValue}>
      <div className="h-full w-full bg-[#09090b]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onEdgeDoubleClick={onEdgeDoubleClick}
          onEdgeContextMenu={onEdgeContextMenu}
          onPaneClick={onPaneClick}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          onSelectionStart={onSelectionStart}
          onSelectionChange={onSelectionChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesDraggable
          nodesConnectable={false}
          edgesReconnectable={false}
          elementsSelectable
          selectionOnDrag
          selectionMode={SelectionMode.Partial}
          panOnDrag={[1, 2]}
          elevateEdgesOnSelect
          connectionMode={ConnectionMode.Loose}
          minZoom={0.05}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            color="rgba(161, 161, 170, 0.80)"
            gap={24}
            size={1}
            variant={BackgroundVariant.Dots}
          />
          <WorkflowCanvasCurrentSteps checklist={checklist} />
          <WorkflowCanvasControls />
        </ReactFlow>
        <WorkflowCanvasEdgeContextMenu
          edgeId={edgeMenu?.edgeId ?? null}
          x={edgeMenu?.x ?? 0}
          y={edgeMenu?.y ?? 0}
          open={edgeMenu != null}
          onOpenChange={(open) => {
            if (!open) setEdgeMenu(null)
          }}
          onSelectColor={setEdgeColor}
        />
      </div>
    </WorkflowCanvasLayoutProvider>
  )
}

export function WorkflowCanvas(props: {
  checklist: PipelineChecklist
  payload: StoryExtractionReviewPayload
  isStepRunning: (stepId: PipelineStepId) => boolean
  selectedNodeId: string | null
  onSelectNode: (id: string | null) => void
  focusNodeId: string | null
  onRegisterDismissInspector?: (dismiss: (() => void) | null) => void
  graphMode?: 'story' | 'chunk'
}) {
  return <WorkflowCanvasInner {...props} />
}

export { ReactFlowProvider }
