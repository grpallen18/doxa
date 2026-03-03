import type { ScopeResponse } from './types'

export type ScopeType = 'topic' | 'controversy' | 'viewpoint' | 'source' | 'agreement' | 'position'

export interface ScopeLayer {
  scopeType: ScopeType
  fetchScope: (id: string) => Promise<ScopeResponse>
  outerEntityType: 'viewpoint' | 'source' | 'controversy' | 'claim' | 'position'
  isDrillable: boolean
  parentScopeType?: ScopeType
}

async function fetchScopeFromApi(type: string, id: string): Promise<ScopeResponse> {
  const res = await fetch(`/api/atlas/scope/${type}/${id}`)
  const json = await res.json()
  if (!res.ok || json.error) {
    throw new Error(json?.error?.message ?? 'Failed to load scope')
  }
  return json.data as ScopeResponse
}

export const SCOPE_LAYERS: Record<ScopeType, ScopeLayer> = {
  topic: {
    scopeType: 'topic',
    fetchScope: (id) => fetchScopeFromApi('topic', id),
    outerEntityType: 'controversy',
    isDrillable: true,
    parentScopeType: undefined,
  },
  controversy: {
    scopeType: 'controversy',
    fetchScope: (id) => fetchScopeFromApi('controversy', id),
    outerEntityType: 'viewpoint',
    isDrillable: true,
    parentScopeType: 'topic',
  },
  viewpoint: {
    scopeType: 'viewpoint',
    fetchScope: (id) => fetchScopeFromApi('viewpoint', id),
    outerEntityType: 'source',
    isDrillable: true,
    parentScopeType: 'controversy',
  },
  source: {
    scopeType: 'source',
    fetchScope: async () => {
      throw new Error('Source is a leaf scope; cannot fetch')
    },
    outerEntityType: 'source',
    isDrillable: false,
    parentScopeType: 'viewpoint',
  },
  agreement: {
    scopeType: 'agreement',
    fetchScope: (id) => fetchScopeFromApi('agreement', id),
    outerEntityType: 'position',
    isDrillable: true,
    parentScopeType: undefined,
  },
  position: {
    scopeType: 'position',
    fetchScope: (id) => fetchScopeFromApi('position', id),
    outerEntityType: 'claim',
    isDrillable: false,
    parentScopeType: 'agreement',
  },
}
