'use client'

import { useEffect, useState } from 'react'
import {
  fetchNeoKindColors,
  getNeoKindColor,
  loadNeoKindColors,
  subscribeNeoKindColors,
  type NeoKindColorMap,
} from '@/lib/admin/neo-graph/colors'
import type { NeoNodeKind } from '@/lib/admin/neo-graph/types'

export function useNeoKindColors(): NeoKindColorMap {
  const [colors, setColors] = useState<NeoKindColorMap>(() =>
    loadNeoKindColors()
  )

  useEffect(() => {
    setColors(loadNeoKindColors())
    const unsub = subscribeNeoKindColors(setColors)
    void fetchNeoKindColors()
      .then(setColors)
      .catch(() => {
        /* keep cache / defaults */
      })
    return unsub
  }, [])

  return colors
}

export function useNeoKindColor(kind: NeoNodeKind): string {
  const colors = useNeoKindColors()
  return colors[kind] ?? getNeoKindColor(kind)
}
