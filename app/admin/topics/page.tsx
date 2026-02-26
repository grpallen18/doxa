'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Info } from 'lucide-react'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const CONFIRM_THRESHOLD = 2

type TopicRow = {
  topic_id: string
  slug: string
  title: string
  status: string
  summary: string | null
  created_at: string
}

type SimilarTopic = {
  topic_id: string
  title: string
  slug: string
  similarity: number
}

export default function AdminTopicsPage() {
  const [allTopics, setAllTopics] = useState<TopicRow[]>([])
  const [topicsLoading, setTopicsLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [processTargetId, setProcessTargetId] = useState<string | null>(null)
  const [processLoading, setProcessLoading] = useState(false)
  const [processError, setProcessError] = useState<string | null>(null)
  const [processResult, setProcessResult] = useState<{
    topic_id: string
    controversies_linked: number
    summary_generated: boolean
  } | null>(null)
  const [preCreateDialog, setPreCreateDialog] = useState<{
    controversiesCount: number
    similarTopics: SimilarTopic[]
    pendingTitle: string
  } | null>(null)
  const [fewControversiesDialog, setFewControversiesDialog] = useState<{
    controversiesCount: number
    topicId: string
  } | null>(null)
  const [countsModal, setCountsModal] = useState<{ topicId: string; title: string } | null>(null)
  const [countsData, setCountsData] = useState<{
    controversy_count: number
    position_count: number
    viewpoint_count: number
  } | null>(null)
  const [countsLoading, setCountsLoading] = useState(false)
  const [cancelMessage, setCancelMessage] = useState<string | null>(null)

  const fetchTopics = useCallback(async () => {
    setTopicsLoading(true)
    try {
      const res = await fetch('/api/admin/topics')
      const json = await res.json()
      if (res.ok && json?.data) {
        setAllTopics(json.data)
      }
    } catch {
      // ignore
    } finally {
      setTopicsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTopics()
  }, [fetchTopics])

  useEffect(() => {
    if (!preCreateDialog && !fewControversiesDialog && !countsModal) return
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (countsModal) setCountsModal(null)
        else if (fewControversiesDialog) handleFewControversiesNo()
        else setPreCreateDialog(null)
      }
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [preCreateDialog, fewControversiesDialog, countsModal])

  async function doCreate(pendingTitle: string) {
    setCreateLoading(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: pendingTitle }),
      })
      const json = await res.json()
      if (!res.ok) {
        setCreateError(json?.error?.message ?? 'Failed to create topic')
        return
      }
      setTitle('')
      setPreCreateDialog(null)
      await fetchTopics()
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setCreateLoading(false)
    }
  }

  async function handleCreate() {
    const trimmed = title.trim()
    if (!trimmed) return
    setCreateLoading(true)
    setCreateError(null)
    setPreCreateDialog(null)
    try {
      const res = await fetch('/api/topics/check-similar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      })
      const json = await res.json()
      if (!res.ok) {
        setCreateError(json?.error?.message ?? 'Failed to check similar topics')
        return
      }
      const data = json?.data ?? {}
      const controversiesCount = data.controversies_count ?? 0
      const similarTopics: SimilarTopic[] = data.similar_topics ?? []
      const needsConfirm = similarTopics.length > 0 || controversiesCount <= CONFIRM_THRESHOLD
      if (needsConfirm) {
        setPreCreateDialog({ controversiesCount, similarTopics, pendingTitle: trimmed })
      } else {
        await doCreate(trimmed)
      }
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setCreateLoading(false)
    }
  }

  async function handlePreCreateConfirm() {
    if (!preCreateDialog) return
    await doCreate(preCreateDialog.pendingTitle)
  }

  async function runProcess(topicId: string) {
    const res = await fetch(`/api/topics/${topicId}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    })
    const json = await res.json()
    if (!res.ok) {
      setProcessError(json?.error?.message ?? 'Failed to process topic')
      return
    }
    setProcessResult({ topic_id: topicId, ...json.data })
    setProcessTargetId(null)
    setFewControversiesDialog(null)
    await fetchTopics()
  }

  async function handleProcess(topicId: string) {
    setProcessTargetId(topicId)
    setProcessLoading(true)
    setProcessError(null)
    setProcessResult(null)
    setFewControversiesDialog(null)
    setCancelMessage(null)
    try {
      const res = await fetch(`/api/topics/${topicId}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preview: true }),
      })
      const json = await res.json()
      if (!res.ok) {
        setProcessError(json?.error?.message ?? 'Failed to process topic')
        return
      }
      const controversiesCount = json?.data?.controversies_count ?? 0
      if (controversiesCount > CONFIRM_THRESHOLD) {
        await runProcess(topicId)
      } else {
        setFewControversiesDialog({ controversiesCount, topicId })
      }
    } catch (e) {
      setProcessError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setProcessLoading(false)
    }
  }

  async function handleFewControversiesYes() {
    if (!fewControversiesDialog) return
    setProcessLoading(true)
    setFewControversiesDialog(null)
    setProcessError(null)
    try {
      await runProcess(fewControversiesDialog.topicId)
    } catch (e) {
      setProcessError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setProcessLoading(false)
    }
  }

  async function handleFewControversiesNo() {
    if (!fewControversiesDialog) return
    setProcessLoading(true)
    setFewControversiesDialog(null)
    try {
      const res = await fetch(`/api/topics/${fewControversiesDialog.topicId}`, { method: 'DELETE' })
      if (res.ok) {
        setCancelMessage('Topic deleted.')
        await fetchTopics()
      } else {
        const json = await res.json()
        setProcessError(json?.error?.message ?? 'Failed to delete topic')
      }
    } catch (e) {
      setProcessError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setProcessLoading(false)
    }
  }

  async function handleShowCounts(topicId: string, topicTitle: string) {
    setCountsModal({ topicId, title: topicTitle })
    setCountsData(null)
    setCountsLoading(true)
    try {
      const res = await fetch(`/api/admin/topics/${topicId}/counts`)
      const json = await res.json()
      if (res.ok && json?.data) {
        setCountsData(json.data)
      }
    } catch {
      setCountsData(null)
    } finally {
      setCountsLoading(false)
    }
  }

  async function handleDelete(topicId: string) {
    try {
      const res = await fetch(`/api/topics/${topicId}`, { method: 'DELETE' })
      if (res.ok) {
        setCancelMessage('Topic deleted.')
        await fetchTopics()
      } else {
        const json = await res.json()
        setProcessError(json?.error?.message ?? 'Failed to delete topic')
      }
    } catch (e) {
      setProcessError(e instanceof Error ? e.message : 'Network error')
    }
  }

  return (
    <main className="min-h-screen px-4 pb-16 pt-6 text-foreground sm:px-6 md:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            Home
          </Link>
          <span className="text-muted">/</span>
          <Link href="/admin" className="text-sm text-muted hover:text-foreground">
            Admin
          </Link>
          <span className="text-muted">/</span>
          <span className="text-sm font-medium">Topics</span>
        </div>

        <Panel variant="soft" interactive={false} className="p-6">
          <h2 className="mb-4 text-lg font-semibold">Create new topic</h2>
          <p className="mb-4 text-sm text-muted">
            Enter a topic title (e.g. NATO, Russian-Ukrainian War). After creating, click Process to run the pipeline:
            link controversies, generate summary, and build topic-to-topic relationships.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="topic-title">Topic title</Label>
              <Input
                id="topic-title"
                placeholder="e.g. NATO"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                maxLength={200}
                disabled={createLoading}
              />
            </div>
            <Button onClick={handleCreate} disabled={createLoading || !title.trim()}>
              {createLoading ? 'Checking…' : 'Create topic'}
            </Button>
          </div>
          {createError && (
            <p className="mt-3 text-sm text-destructive">{createError}</p>
          )}
        </Panel>

        {cancelMessage && (
          <p className="text-sm text-muted">{cancelMessage}</p>
        )}
        {processError && (
          <p className="text-sm text-destructive">{processError}</p>
        )}
        {processResult && (
          <div className="rounded-md border border-subtle bg-muted/30 p-3 text-sm">
            <p>Processed: {processResult.controversies_linked} controversies linked, summary {processResult.summary_generated ? 'generated' : 'not generated'}.</p>
          </div>
        )}

        <section aria-labelledby="existing-topics-heading" className="space-y-4">
          <h2 id="existing-topics-heading" className="text-lg font-semibold">
            Existing topics
          </h2>
          {topicsLoading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : allTopics.length === 0 ? (
            <p className="text-sm text-muted">No topics yet.</p>
          ) : (
            <ul className="space-y-3">
              {allTopics.map((topic) => (
                <li key={topic.topic_id}>
                  <Panel variant="soft" interactive={false} className="p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground">{topic.title}</p>
                          <button
                            type="button"
                            onClick={() => handleShowCounts(topic.topic_id, topic.title)}
                            className="rounded p-0.5 text-muted hover:bg-muted hover:text-foreground"
                            aria-label="View topic counts"
                          >
                            <Info className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleProcess(topic.topic_id)}
                          disabled={processLoading || processTargetId === topic.topic_id}
                        >
                          {processLoading && processTargetId === topic.topic_id ? 'Processing…' : 'Process'}
                        </Button>
                        <Link href={`/page/${topic.topic_id}`}>
                          <Button size="sm" variant="outline">
                            View
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(topic.topic_id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </Panel>
                </li>
              ))}
            </ul>
          )}
        </section>

        {preCreateDialog && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pre-create-dialog-title"
            onClick={() => setPreCreateDialog(null)}
          >
            <Panel
              variant="base"
              className="max-w-md p-6 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="pre-create-dialog-title" className="mb-3 text-lg font-semibold">
                Create topic anyway?
              </h2>
              <div className="mb-4 space-y-2 text-sm text-muted">
                {preCreateDialog.similarTopics.length > 0 && (
                  <p>
                    Similar topic(s) already exist:{' '}
                    {preCreateDialog.similarTopics.map((t, i) => (
                      <span key={t.topic_id}>
                        {i > 0 && ', '}
                        <Link
                          href={`/page/${t.topic_id}`}
                          className="text-accent-primary hover:underline"
                        >
                          {t.title}
                        </Link>
                      </span>
                    ))}
                  </p>
                )}
                {preCreateDialog.controversiesCount <= CONFIRM_THRESHOLD && (
                  <p>
                    Only {preCreateDialog.controversiesCount} related controversies would be linked.
                  </p>
                )}
                <p>Create &quot;{preCreateDialog.pendingTitle}&quot; anyway?</p>
              </div>
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => setPreCreateDialog(null)}
                  disabled={createLoading}
                >
                  No, cancel
                </Button>
                <Button onClick={handlePreCreateConfirm} disabled={createLoading}>
                  {createLoading ? 'Creating…' : 'Yes, create topic'}
                </Button>
              </div>
            </Panel>
          </div>
        )}

        {countsModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="counts-dialog-title"
            onClick={() => setCountsModal(null)}
          >
            <Panel
              variant="base"
              className="max-w-md p-6 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="counts-dialog-title" className="mb-3 text-lg font-semibold">
                {countsModal.title}
              </h2>
              <div className="mb-4 text-sm text-muted">
                {countsLoading ? (
                  <p>Loading…</p>
                ) : countsData ? (
                  <p>
                    {countsData.controversy_count} controversies · {countsData.position_count} positions ·{' '}
                    {countsData.viewpoint_count} viewpoints
                  </p>
                ) : (
                  <p>Failed to load counts.</p>
                )}
              </div>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setCountsModal(null)}>
                  Close
                </Button>
              </div>
            </Panel>
          </div>
        )}

        {fewControversiesDialog && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="few-controversies-dialog-title"
            onClick={handleFewControversiesNo}
          >
            <Panel
              variant="base"
              className="max-w-md p-6 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="few-controversies-dialog-title" className="mb-3 text-lg font-semibold">
                Few controversies found
              </h2>
              <p className="mb-4 text-sm text-muted">
                {fewControversiesDialog.controversiesCount === 0
                  ? 'There are no related controversies found for this topic.'
                  : fewControversiesDialog.controversiesCount === 1
                    ? 'There is only 1 related controversy found for this topic.'
                    : `There are only ${fewControversiesDialog.controversiesCount} related controversies found for this topic.`}
                {' '}Are you sure you want to keep it?
              </p>
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={handleFewControversiesNo}
                  disabled={processLoading}
                >
                  No, delete topic
                </Button>
                <Button onClick={handleFewControversiesYes} disabled={processLoading}>
                  {processLoading ? 'Processing…' : 'Yes, process topic'}
                </Button>
              </div>
            </Panel>
          </div>
        )}
      </div>
    </main>
  )
}
