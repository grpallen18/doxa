'use client'

import { useState } from 'react'
import { Viewpoint } from '@/lib/types'

interface ValidationFormProps {
  topicId: string
  viewpoints: Viewpoint[]
  onSuccess?: () => void
}

export default function ValidationForm({ topicId, viewpoints, onSuccess }: ValidationFormProps) {
  const [selectedViewpoint, setSelectedViewpoint] = useState<string>('')
  const [isRepresented, setIsRepresented] = useState<boolean | null>(null)
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedViewpoint || isRepresented === null) {
      alert('Please select a viewpoint and indicate if it is represented')
      return
    }

    setSubmitting(true)

    try {
      const response = await fetch('/api/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic_id: topicId,
          viewpoint_id: selectedViewpoint,
          is_represented: isRepresented,
          feedback: feedback || null,
        }),
      })

      const data = await response.json()

      if (data.error) {
        alert(`Error: ${data.error.message}`)
      } else {
        setSubmitted(true)
        if (onSuccess) {
          onSuccess()
        }
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="border rounded-lg p-6 bg-green-50 dark:bg-green-900/20">
        <p className="text-green-800 dark:text-green-200">
          ✅ Thank you! Your validation has been recorded.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-6">
      <h3 className="text-xl font-semibold mb-4">Validate Representation</h3>
      <p className="mb-4 text-sm text-muted">
        Is your viewpoint fairly represented on this topic?
      </p>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">
          Select your viewpoint:
        </label>
        <select
          value={selectedViewpoint}
          onChange={(e) => setSelectedViewpoint(e.target.value)}
          className="w-full rounded border border-input bg-background p-2"
          required
        >
          <option value="">Choose a viewpoint...</option>
          {viewpoints.map((v) => (
            <option key={v.viewpoint_id} value={v.viewpoint_id}>
              {v.title}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">
          Is your viewpoint fairly represented?
        </label>
        <div className="flex gap-4">
          <label className="flex items-center">
            <input
              type="radio"
              name="represented"
              value="yes"
              checked={isRepresented === true}
              onChange={() => setIsRepresented(true)}
              className="mr-2"
              required
            />
            Yes
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              name="represented"
              value="no"
              checked={isRepresented === false}
              onChange={() => setIsRepresented(false)}
              className="mr-2"
              required
            />
            No
          </label>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">
          Feedback (optional):
        </label>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          className="w-full rounded border border-input bg-background p-2"
          rows={3}
          placeholder="What's missing or incorrect?"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded bg-primary px-4 py-2 text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? 'Submitting...' : 'Submit Validation'}
      </button>
    </form>
  )
}
