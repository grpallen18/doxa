'use client'

import { useEffect, useState } from 'react'

export function useRecordHub<T>(apiPath: string) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(apiPath, { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (!json.data) {
          setError(json.error?.message ?? 'Failed to load record')
          setData(null)
          return
        }
        setData(json.data as T)
      })
      .catch(() => setError('Failed to load record'))
      .finally(() => setLoading(false))
  }, [apiPath])

  return { data, loading, error }
}
