/**
 * Unit checks for Neo graphology adapter / appearance (no Vitest in repo).
 * Run: npx tsx scripts/test-neo-graphology-adapter.ts
 */
import assert from 'node:assert/strict'
import { projectPhase0Document } from '../lib/admin/neo-graph/project-phase0'
import {
  buildGraphologyFromProjection,
  searchProjectionNodes,
} from '../lib/admin/neo-graph/graphology-adapter'
import { resolveNodeAppearance, resolveEdgeColor } from '../lib/admin/neo-graph/appearance'
import { DEFAULT_NEO_FILTERS } from '../lib/admin/neo-graph/types'
import type { NeoDocumentGraph } from '../lib/neo4j/queries/phase0'

const fixture: NeoDocumentGraph = {
  document: {
    uid: 'story-1',
    title: 'Fixture Story',
    publishedAt: '2026-01-01',
    url: 'https://example.com',
    schemaVersion: '2.0.0',
    extractorVersion: '2.0.3-utterance',
  },
  publication: { uid: 'pub-1', name: 'Example News' },
  segments: [
    {
      uid: 'seg-1',
      ord: 0,
      text: 'Hello world segment',
      charStart: 0,
      charEnd: 19,
    },
  ],
  agents: [{ uid: 'agent-1', name: 'Alice', normalizedName: 'alice' }],
  utterances: [
    {
      uid: 'utt-1',
      text: 'We should act now',
      speechAct: 'claim',
      attributionMode: 'direct',
      polarity: 'affirm',
      modality: 'assertive',
      confidence: 0.9,
      explicit: true,
      documentUid: 'story-1',
      segmentUid: 'seg-1',
      charStart: 0,
      charEnd: 17,
      agentUid: 'agent-1',
      agentName: 'Alice',
    },
  ],
}

function main() {
  const projection = projectPhase0Document(fixture)
  assert.equal(projection.projectionId, 'phase0-document')
  assert.equal(projection.storyId, 'story-1')
  assert.ok(projection.nodes.some((n) => n.id === 'document:story-1'))
  assert.ok(projection.nodes.some((n) => n.id === 'utterance:utt-1'))
  assert.ok(projection.edges.some((e) => e.type === 'ASSERTED_BY'))
  assert.ok(projection.edges.some((e) => e.type === 'GROUNDED_IN'))
  assert.ok(projection.edges.some((e) => e.type === 'PUBLISHED_BY'))
  assert.ok(projection.edges.some((e) => e.type === 'CONTAINS'))

  // Duplicate projection merge: building twice should not throw / duplicate
  const built = buildGraphologyFromProjection(projection, DEFAULT_NEO_FILTERS)
  assert.equal(built.graph.hasNode('document:story-1'), true)
  assert.equal(built.graph.hasNode('utterance:utt-1'), true)
  // segments filtered off by default
  assert.equal(built.graph.hasNode('segment:seg-1'), false)
  assert.ok(built.edgeCount >= 1)
  // GROUNDED_IN retargets to document when segment hidden
  assert.equal(built.graph.hasEdge('utterance:utt-1', 'document:story-1'), true)

  const withSegments = buildGraphologyFromProjection(projection, {
    ...DEFAULT_NEO_FILTERS,
    kinds: { ...DEFAULT_NEO_FILTERS.kinds, segment: true },
  })
  assert.equal(withSegments.graph.hasNode('segment:seg-1'), true)

  // Missing optional publication
  const noPub = projectPhase0Document({ ...fixture, publication: null })
  assert.equal(
    noPub.nodes.some((n) => n.kind === 'publication'),
    false
  )

  // Directed relationship mapping
  const asserted = projection.edges.find((e) => e.type === 'ASSERTED_BY')
  assert.ok(asserted)
  assert.equal(asserted!.source, 'utterance:utt-1')
  assert.equal(asserted!.target, 'agent:agent-1')

  // Appearance by kind (defaults)
  assert.equal(resolveNodeAppearance({ kind: 'document' }).priority, 100)
  assert.equal(resolveNodeAppearance({ kind: 'document' }).color, '#2d5a4a')
  assert.equal(resolveEdgeColor('ASSERTED_BY'), '#3d5a80')

  // Search
  const hits = searchProjectionNodes(projection, 'alice')
  assert.ok(hits.some((n) => n.id === 'agent:agent-1'))

  // Malformed / empty utterance list still yields document
  const emptyUtts = projectPhase0Document({ ...fixture, utterances: [], agents: [] })
  const emptyBuilt = buildGraphologyFromProjection(emptyUtts, DEFAULT_NEO_FILTERS)
  assert.equal(emptyBuilt.graph.order >= 1, true)

  // Duplicate edge ids ignored
  const dupProjection = {
    ...projection,
    edges: [...projection.edges, ...projection.edges],
  }
  const dupBuilt = buildGraphologyFromProjection(dupProjection, {
    ...DEFAULT_NEO_FILTERS,
    kinds: { ...DEFAULT_NEO_FILTERS.kinds, segment: true },
  })
  assert.ok(dupBuilt.droppedEdges >= projection.edges.length)

  console.log('neo-graphology-adapter: all assertions passed')
}

main()
