'use client'

import { useEffect, useState } from 'react'
import {
  getNeoKindColor,
  loadNeoKindColors,
  subscribeNeoKindColors,
  type NeoKindColorMap,
} from '@/lib/admin/neo-graph/colors'
import type { NeoNodeKind } from '@/lib/admin/neo-graph/types'

export function useNeoKindColors(): NeoKindColorMap {
  const [colors, setColors] = useState<NeoKindColorMap>(() =>
    typeof window === 'undefined'
      ? loadNeoKindColors()
      : loadNeoKindColors()
  )

  useEffect(() => {
    setColors(loadNeoKindColors())
    return subscribeNeoKindColors(setColors)
  }, [])

  return colors
}

export function useNeoKindColor(kind: NeoNodeKind): string {
  const colors = useNeoKindColors()
  return colors[kind] ?? getNeoKindColor(kind)
}
