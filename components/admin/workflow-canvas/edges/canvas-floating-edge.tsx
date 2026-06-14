'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useReactFlow,
  useStore,
  useStoreApi,
  type EdgeProps,
} from '@xyflow/react'
import {
  positionFromSide,
  sideFromPosition,
  type EdgeEndpointSide,
} from '@/lib/admin/workflow-canvas/edge-attachments'
import {
  DEFAULT_EDGE_COLOR,
  EDGE_COLOR_STYLES,
  type EdgeColor,
} from '@/lib/admin/workflow-canvas/edge-meta'
import {
  buildFloatingLayoutVersion,
  clearFloatingEdgeLayoutCache,
  getDistributedFloatingEdgeLayout,
} from '@/lib/admin/workflow-canvas/floating-edge-layout'
import {
  getFloatingEdgeParams,
  getNearestSide,
  projectFlowPointToSide,
} from '@/lib/admin/workflow-canvas/floating-edge-utils'
import type { WorkflowCanvasEdgeData } from '@/lib/admin/workflow-canvas/merge-edge-meta'
import { useWorkflowCanvasLayoutContext } from '@/components/admin/workflow-canvas/workflow-canvas-layout-context'
import { cn } from '@/lib/utils'

type DragRole = 'source' | 'target'

type DragPreview = {
  role: DragRole
  x: number
  y: number
  side: EdgeEndpointSide
  fraction: number
}

const HANDLE_HIT_SIZE = 44

function sideLabel(side: EdgeEndpointSide): string {
  return side.charAt(0).toUpperCase() + side.slice(1)
}

function EdgeDragHandle({
  x,
  y,
  onMouseDown,
}: {
  x: number
  y: number
  onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void
}) {
  return (
    <div
      className="nodrag nopan pointer-events-auto absolute z-[1000] flex cursor-grab items-center justify-center active:cursor-grabbing"
      style={{
        width: HANDLE_HIT_SIZE,
        height: HANDLE_HIT_SIZE,
        transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
      }}
      onMouseDown={onMouseDown}
    >
      <div className="h-3.5 w-3.5 rounded-full border-2 border-zinc-950 bg-white shadow-sm" />
    </div>
  )
}

export function CanvasFloatingEdge({
  id,
  data,
  source,
  target,
  markerEnd,
  style,
  selected,
}: EdgeProps) {
  const edgeData = (data ?? {}) as WorkflowCanvasEdgeData
  const label = edgeData.label
  const color = (edgeData.color as EdgeColor | undefined) ?? DEFAULT_EDGE_COLOR
  const colorStyles = EDGE_COLOR_STYLES[color]

  const {
    edgeAttachments,
    editingEdgeId,
    setEdgeEndpointOverride,
    setEdgeLabel,
    setEditingEdgeId,
  } = useWorkflowCanvasLayoutContext()
  const { screenToFlowPosition } = useReactFlow()
  const layoutVersion = useStore((state) =>
    buildFloatingLayoutVersion(state.edges, edgeAttachments, state.nodeLookup)
  )
  const store = useStoreApi()
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null)
  const [draftLabel, setDraftLabel] = useState('')
  const dragPreviewRef = useRef<DragPreview | null>(null)
  const dragCleanupRef = useRef<(() => void) | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const isEditing = editingEdgeId === id

  useEffect(() => {
    if (!isEditing) return
    setDraftLabel(label ?? '')
    const t = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [isEditing, label])

  const params = useMemo(() => {
    const { edges: storeEdges, nodeLookup } = store.getState()
    const layouts = getDistributedFloatingEdgeLayout(
      storeEdges,
      edgeAttachments,
      (nodeId) => nodeLookup.get(nodeId)
    )
    const distributed = layouts.get(id)
    if (distributed) return distributed

    const sourceInternal = nodeLookup.get(source)
    const targetInternal = nodeLookup.get(target)
    if (!sourceInternal || !targetInternal) return null
    return getFloatingEdgeParams(sourceInternal, targetInternal)
  }, [id, layoutVersion, edgeAttachments, source, target, store])

  const finishDrag = useCallback(
    (preview: DragPreview) => {
      setEdgeEndpointOverride(id, preview.role, {
        side: preview.side,
        fraction: preview.fraction,
      })
      clearFloatingEdgeLayoutCache()
      setDragPreview(null)
      dragPreviewRef.current = null
    },
    [id, setEdgeEndpointOverride]
  )

  const beginDrag = useCallback(
    (role: DragRole, event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()

      dragCleanupRef.current?.()

      const onMove = (moveEvent: MouseEvent) => {
        const { nodeLookup } = store.getState()
        const node =
          role === 'source' ? nodeLookup.get(source) : nodeLookup.get(target)
        if (!node) return
        const flowPoint = screenToFlowPosition({
          x: moveEvent.clientX,
          y: moveEvent.clientY,
        })
        const side = sideFromPosition(getNearestSide(node, flowPoint))
        const projected = projectFlowPointToSide(node, positionFromSide(side), flowPoint)
        const preview: DragPreview = {
          role,
          x: projected.x,
          y: projected.y,
          side,
          fraction: projected.fraction,
        }
        dragPreviewRef.current = preview
        setDragPreview(preview)
      }

      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        dragCleanupRef.current = null
        const preview = dragPreviewRef.current
        if (preview) finishDrag(preview)
        else {
          setDragPreview(null)
          dragPreviewRef.current = null
        }
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
      dragCleanupRef.current = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }

      onMove(event.nativeEvent)
    },
    [finishDrag, screenToFlowPosition, source, target, store]
  )

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.()
    }
  }, [])

  const commitLabel = useCallback(() => {
    setEdgeLabel(id, draftLabel.trim())
    setEditingEdgeId(null)
  }, [draftLabel, id, setEdgeLabel, setEditingEdgeId])

  const cancelLabelEdit = useCallback(() => {
    setEditingEdgeId(null)
    setDraftLabel(label ?? '')
  }, [label, setEditingEdgeId])

  const onLabelKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        commitLabel()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        cancelLabelEdit()
      }
    },
    [cancelLabelEdit, commitLabel]
  )

  const renderParams = useMemo(() => {
    if (!params) return null
    if (!dragPreview) return params
    if (dragPreview.role === 'source') {
      return {
        ...params,
        sx: dragPreview.x,
        sy: dragPreview.y,
        sourcePos: positionFromSide(dragPreview.side),
      }
    }
    return {
      ...params,
      tx: dragPreview.x,
      ty: dragPreview.y,
      targetPos: positionFromSide(dragPreview.side),
    }
  }, [params, dragPreview])

  if (!params || !renderParams) return null

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: renderParams.sx,
    sourceY: renderParams.sy,
    sourcePosition: renderParams.sourcePos,
    targetX: renderParams.tx,
    targetY: renderParams.ty,
    targetPosition: renderParams.targetPos,
  })

  const dragHintX =
    dragPreview?.role === 'source' ? renderParams.sx : renderParams.tx
  const dragHintY =
    dragPreview?.role === 'source' ? renderParams.sy : renderParams.ty

  const edgeStrokeStyle = {
    ...style,
    stroke: colorStyles.stroke,
    strokeWidth: 2,
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={edgeStrokeStyle}
        interactionWidth={20}
      />
      <EdgeLabelRenderer>
        {label || isEditing ? (
          <div
            className="nodrag nopan pointer-events-auto absolute z-[900]"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            onDoubleClick={(event) => {
              event.stopPropagation()
              setEditingEdgeId(id)
            }}
          >
            {isEditing ? (
              <input
                ref={inputRef}
                value={draftLabel}
                onChange={(event) => setDraftLabel(event.target.value)}
                onBlur={commitLabel}
                onKeyDown={onLabelKeyDown}
                className={cn(
                  'w-28 rounded px-2 py-0.5 text-center text-[10px] font-bold uppercase tracking-wider',
                  'border border-white/20 bg-zinc-950/90 outline-none',
                  colorStyles.text
                )}
                onMouseDown={(event) => event.stopPropagation()}
              />
            ) : (
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-zinc-950/80',
                  colorStyles.text
                )}
              >
                {label}
              </span>
            )}
          </div>
        ) : null}
        {selected ? (
          <>
            <EdgeDragHandle
              x={renderParams.sx}
              y={renderParams.sy}
              onMouseDown={(event) => beginDrag('source', event)}
            />
            <EdgeDragHandle
              x={renderParams.tx}
              y={renderParams.ty}
              onMouseDown={(event) => beginDrag('target', event)}
            />
            {dragPreview ? (
              <div
                className="nodrag nopan pointer-events-none absolute z-[1000] text-[10px] font-semibold text-white"
                style={{
                  transform: `translate(-50%, calc(-100% - 8px)) translate(${dragHintX}px, ${dragHintY}px)`,
                }}
              >
                {sideLabel(dragPreview.side)}
              </div>
            ) : null}
          </>
        ) : null}
      </EdgeLabelRenderer>
    </>
  )
}
