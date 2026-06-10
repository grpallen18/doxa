'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { WorkflowCanvasEdgeAttachments } from '@/lib/admin/workflow-canvas/edge-attachments'
import type { WorkflowCanvasEdgeMetaMap } from '@/lib/admin/workflow-canvas/edge-meta'
import type { WorkflowCanvasPositions } from '@/lib/admin/workflow-canvas/layout'

const LAYOUT_API = '/api/admin/workflow-canvas/layout'
const LAYOUT_CHANNEL = 'doxa-workflow-canvas-layout'
const SAVE_DEBOUNCE_MS = 200

export function useWorkflowCanvasLayout(isDraggingRef: RefObject<boolean>) {
  const [savedPositions, setSavedPositions] = useState<WorkflowCanvasPositions>({})
  const [savedEdgeAttachments, setSavedEdgeAttachments] =
    useState<WorkflowCanvasEdgeAttachments>({})
  const [savedEdgeMeta, setSavedEdgeMeta] = useState<WorkflowCanvasEdgeMetaMap>({})
  const [loaded, setLoaded] = useState(false)
  const [remoteSyncEpoch, setRemoteSyncEpoch] = useState(0)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPositionsRef = useRef<WorkflowCanvasPositions>({})
  const pendingEdgeAttachmentsRef = useRef<WorkflowCanvasEdgeAttachments>({})
  const pendingEdgeMetaRef = useRef<WorkflowCanvasEdgeMetaMap>({})
  const channelRef = useRef<BroadcastChannel | null>(null)
  const lastLocalSaveAtRef = useRef(0)

  const applyLayoutPayload = useCallback(
    (json: {
      data?: {
        positions?: unknown
        edgeAttachments?: unknown
        edgeMeta?: unknown
      }
    }) => {
      setSavedPositions(
        json.data?.positions && typeof json.data.positions === 'object'
          ? (json.data.positions as WorkflowCanvasPositions)
          : {}
      )
      setSavedEdgeAttachments(
        json.data?.edgeAttachments && typeof json.data.edgeAttachments === 'object'
          ? (json.data.edgeAttachments as WorkflowCanvasEdgeAttachments)
          : {}
      )
      setSavedEdgeMeta(
        json.data?.edgeMeta && typeof json.data.edgeMeta === 'object'
          ? (json.data.edgeMeta as WorkflowCanvasEdgeMetaMap)
          : {}
      )
    },
    []
  )

  const reloadFromServer = useCallback(async () => {
    if (isDraggingRef.current) return
    if (Date.now() - lastLocalSaveAtRef.current < 3000) return
    try {
      const res = await fetch(LAYOUT_API, { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json()
      applyLayoutPayload(json)
      setRemoteSyncEpoch((epoch) => epoch + 1)
    } catch {
      // Ignore transient reload failures; next tab message will retry.
    }
  }, [applyLayoutPayload, isDraggingRef])

  useEffect(() => {
    let cancelled = false
    void fetch(LAYOUT_API, { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return
        applyLayoutPayload(json)
      })
      .catch(() => {
        if (!cancelled) {
          setSavedPositions({})
          setSavedEdgeAttachments({})
          setSavedEdgeMeta({})
        }
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [applyLayoutPayload])

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(LAYOUT_CHANNEL)
    channelRef.current = channel
    channel.onmessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === 'updated') void reloadFromServer()
    }
    return () => {
      channel.close()
      channelRef.current = null
    }
  }, [reloadFromServer])

  const flushSave = useCallback(async () => {
    const positions = pendingPositionsRef.current
    const edgeAttachments = pendingEdgeAttachmentsRef.current
    const edgeMeta = pendingEdgeMetaRef.current
    const hasPositions = Object.keys(positions).length > 0
    const hasEdgeAttachments = Object.keys(edgeAttachments).length > 0
    const hasEdgeMeta = Object.keys(edgeMeta).length > 0
    if (!hasPositions && !hasEdgeAttachments && !hasEdgeMeta) return

    pendingPositionsRef.current = {}
    pendingEdgeAttachmentsRef.current = {}
    pendingEdgeMetaRef.current = {}

    try {
      const res = await fetch(LAYOUT_API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(hasPositions ? { positions } : {}),
          ...(hasEdgeAttachments ? { edgeAttachments } : {}),
          ...(hasEdgeMeta ? { edgeMeta } : {}),
        }),
        keepalive: true,
      })
      if (res.ok) {
        const json = await res.json()
        lastLocalSaveAtRef.current = Date.now()
        applyLayoutPayload(json)
        channelRef.current?.postMessage({ type: 'updated' })
      }
    } catch {
      if (hasPositions) {
        pendingPositionsRef.current = { ...positions, ...pendingPositionsRef.current }
      }
      if (hasEdgeAttachments) {
        pendingEdgeAttachmentsRef.current = {
          ...edgeAttachments,
          ...pendingEdgeAttachmentsRef.current,
        }
      }
      if (hasEdgeMeta) {
        pendingEdgeMetaRef.current = { ...edgeMeta, ...pendingEdgeMetaRef.current }
      }
    }
  }, [applyLayoutPayload])

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void flushSave()
    }, SAVE_DEBOUNCE_MS)
  }, [flushSave])

  const scheduleSaveDelta = useCallback(
    (delta: WorkflowCanvasPositions) => {
      if (Object.keys(delta).length === 0) return
      pendingPositionsRef.current = { ...pendingPositionsRef.current, ...delta }
      scheduleSave()
    },
    [scheduleSave]
  )

  const scheduleSaveEdgeAttachment = useCallback(
    (edgeId: string, attachment: WorkflowCanvasEdgeAttachments[string]) => {
      pendingEdgeAttachmentsRef.current = {
        ...pendingEdgeAttachmentsRef.current,
        [edgeId]: attachment,
      }
      setSavedEdgeAttachments((current) => ({
        ...current,
        [edgeId]: attachment,
      }))
      scheduleSave()
    },
    [scheduleSave]
  )

  const scheduleSaveEdgeMeta = useCallback(
    (edgeId: string, meta: WorkflowCanvasEdgeMetaMap[string]) => {
      pendingEdgeMetaRef.current = {
        ...pendingEdgeMetaRef.current,
        [edgeId]: meta,
      }
      setSavedEdgeMeta((current) => ({
        ...current,
        [edgeId]: meta,
      }))
      scheduleSave()
    },
    [scheduleSave]
  )

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      void flushSave()
    }
  }, [flushSave])

  return {
    savedPositions,
    savedEdgeAttachments,
    savedEdgeMeta,
    loaded,
    remoteSyncEpoch,
    scheduleSaveDelta,
    scheduleSaveEdgeAttachment,
    scheduleSaveEdgeMeta,
  }
}
