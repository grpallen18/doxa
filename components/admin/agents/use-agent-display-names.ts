'use client'

import { useEffect, useState } from 'react'
import type { AgentDisplayNameMap } from '@/lib/admin/agent-display-names'

export function useAgentDisplayNames() {
  const [displayNames, setDisplayNames] = useState<AgentDisplayNameMap>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/agents/display-names', { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return
        setDisplayNames((json.data?.displayNames as AgentDisplayNameMap | undefined) ?? {})
      })
      .catch(() => {
        if (!cancelled) setDisplayNames({})
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { displayNames, loaded }
}
