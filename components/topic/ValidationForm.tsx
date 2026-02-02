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
    <form onSubmit={handleSubmit} className="border rounded-lg p-6 bg-white dark:bg-gray-800">
      <h3 className="text-xl font-semibold mb-4">Validate Representation</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Is your viewpoint fairly represented on this topic?
      </p>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">
          Select your viewpoint:
        </label>
        <select
          value={selectedViewpoint}
          onChange={(e) => setSelectedViewpoint(e.target.value)}
          className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
          required
        >
          <option value="">Choose a viewpoint...</option>
          {viewpoints.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
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
          className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
          rows={3}
          placeholder="What's missing or incorrect?"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? 'Submitting...' : 'Submit Validation'}
      </button>
    </form>
  )
}
