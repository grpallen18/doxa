/**
 * Unit checks for Neo graphology adapter / appearance (no Vitest in repo).
 * Run: npx tsx scripts/test-neo-graphology-adapter.ts
 */
import assert from 'node:assert/strict'
import { projectPhase0Document } from '../lib/admin/neo-graph/project-phase0'
import { projectHubGraph } from '../lib/admin/neo-graph/project-hub'
import { projectUnionDocuments } from '../lib/admin/neo-graph/project-union'
import {
  buildGraphologyFromProjection,
  searchProjectionNodes,
} from '../lib/admin/neo-graph/graphology-adapter'
import { resolveNodeAppearance, resolveEdgeColor } from '../lib/admin/neo-graph/appearance'
import {
  DEFAULT_HUB_FILTERS,
  DEFAULT_NEO_FILTERS,
} from '../lib/admin/neo-graph/types'
import type { NeoDocumentGraph } from '../lib/neo4j/queries/phase0'
import type { NeoHubGraph } from '../lib/neo4j/queries/hub'

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
  entities: [],
  referredAs: [],
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
  phase1: { propositionCount: 0, entityCount: 0, expressesCount: 0 },
  phase2: { argumentCount: 0, hasRoleCount: 0 },
}

const hubFixture: NeoHubGraph = {
  rootKind: 'controversy',
  rootUid: 'ctr-1',
  title: 'Fixture Controversy',
  summary: 'Two docs disagree',
  controversy: {
    uid: 'ctr-1',
    title: 'Fixture Controversy',
    summary: 'Two docs disagree',
  },
  viewpoints: [
    { uid: 'vp-a', label: 'Side A', summary: null },
    { uid: 'vp-b', label: 'Side B', summary: null },
  ],
  propositions: [
    {
      uid: 'prop-1',
      text: 'Claim one',
      normalizedText: 'claim one',
      certainty: 'asserted',
    },
  ],
  arguments: [],
  disputes: [],
  entities: [],
  agents: [
    {
      uid: 'agent-a',
      name: 'Alice',
      normalizedName: 'alice',
      documentUid: 'doc-a',
    },
  ],
  documents: [
    { uid: 'doc-a', title: 'Article A', url: null },
    { uid: 'doc-b', title: 'Article B', url: null },
  ],
  utterances: [
    {
      uid: 'utt-a',
      text: 'Said in A',
      speechAct: 'assertion',
      attributionMode: 'paraphrase',
      polarity: 'affirms',
      confidence: 0.9,
      documentUid: 'doc-a',
      segmentUid: null,
      charStart: 0,
      charEnd: 9,
      agentUid: 'agent-a',
      agentName: 'Alice',
    },
    {
      uid: 'utt-b',
      text: 'Said in B',
      speechAct: 'assertion',
      attributionMode: 'paraphrase',
      polarity: 'affirms',
      confidence: 0.8,
      documentUid: 'doc-b',
      segmentUid: null,
      charStart: 0,
      charEnd: 9,
      agentUid: null,
      agentName: null,
    },
  ],
  edges: [
    { type: 'INCLUDES', fromUid: 'ctr-1', toUid: 'vp-a' },
    { type: 'INCLUDES', fromUid: 'ctr-1', toUid: 'vp-b' },
    { type: 'ADVANCES', fromUid: 'vp-a', toUid: 'prop-1' },
    { type: 'ADVANCES', fromUid: 'vp-b', toUid: 'prop-1' },
    { type: 'EXPRESSES', fromUid: 'utt-a', toUid: 'prop-1' },
    { type: 'EXPRESSES', fromUid: 'utt-b', toUid: 'prop-1' },
    { type: 'GROUNDED_IN', fromUid: 'utt-a', toUid: 'doc-a' },
    { type: 'GROUNDED_IN', fromUid: 'utt-b', toUid: 'doc-b' },
    { type: 'ASSERTED_BY', fromUid: 'utt-a', toUid: 'agent-a' },
  ],
  queryTruncated: false,
  caps: { maxDocuments: 25, maxUtterances: 200, maxPropositions: 80 },
}

function main() {
  const projection = projectPhase0Document(fixture)
  assert.equal(projection.projectionId, 'phase0-document')
  assert.equal(projection.storyId, 'story-1')
  assert.equal(projection.rootId, 'story-1')
  assert.equal(projection.rootKind, 'document')
  assert.ok(projection.nodes.some((n) => n.id === 'document:story-1'))
  assert.ok(projection.nodes.some((n) => n.id === 'utterance:utt-1'))
  assert.ok(projection.edges.some((e) => e.type === 'ASSERTED_BY'))
  assert.ok(projection.edges.some((e) => e.type === 'GROUNDED_IN'))
  assert.ok(projection.edges.some((e) => e.type === 'PUBLISHED_BY'))
  assert.ok(projection.edges.some((e) => e.type === 'CONTAINS'))

  const built = buildGraphologyFromProjection(projection, DEFAULT_NEO_FILTERS)
  assert.equal(built.graph.hasNode('document:story-1'), true)
  assert.equal(built.graph.hasNode('utterance:utt-1'), true)
  assert.equal(built.graph.hasNode('segment:seg-1'), false)
  assert.ok(built.edgeCount >= 1)
  assert.equal(built.graph.hasEdge('utterance:utt-1', 'document:story-1'), true)

  const withSegments = buildGraphologyFromProjection(projection, {
    ...DEFAULT_NEO_FILTERS,
    kinds: { ...DEFAULT_NEO_FILTERS.kinds, segment: true },
  })
  assert.equal(withSegments.graph.hasNode('segment:seg-1'), true)

  const noPub = projectPhase0Document({ ...fixture, publication: null })
  assert.equal(
    noPub.nodes.some((n) => n.kind === 'publication'),
    false
  )

  const asserted = projection.edges.find((e) => e.type === 'ASSERTED_BY')
  assert.ok(asserted)
  assert.equal(asserted!.source, 'utterance:utt-1')
  assert.equal(asserted!.target, 'agent:agent-1')

  assert.equal(resolveNodeAppearance({ kind: 'document' }).priority, 100)
  assert.equal(resolveNodeAppearance({ kind: 'document' }).color, '#2d5a4a')
  assert.equal(resolveEdgeColor('ASSERTED_BY'), '#3d5a80')
  assert.equal(resolveNodeAppearance({ kind: 'controversy' }).color, '#c45c5c')
  assert.equal(resolveEdgeColor('INCLUDES'), '#c45c5c')

  const hits = searchProjectionNodes(projection, 'alice')
  assert.ok(hits.some((n) => n.id === 'agent:agent-1'))

  const emptyUtts = projectPhase0Document({
    ...fixture,
    utterances: [],
    agents: [],
  })
  const emptyBuilt = buildGraphologyFromProjection(emptyUtts, DEFAULT_NEO_FILTERS)
  assert.equal(emptyBuilt.graph.order >= 1, true)

  const dupProjection = {
    ...projection,
    edges: [...projection.edges, ...projection.edges],
  }
  const dupBuilt = buildGraphologyFromProjection(dupProjection, {
    ...DEFAULT_NEO_FILTERS,
    kinds: { ...DEFAULT_NEO_FILTERS.kinds, segment: true },
  })
  assert.ok(dupBuilt.droppedEdges >= projection.edges.length)

  const hubProj = projectHubGraph(hubFixture)
  assert.equal(hubProj.projectionId, 'hub-controversy')
  assert.equal(hubProj.rootKind, 'controversy')
  assert.equal(hubProj.rootId, 'ctr-1')
  assert.ok(hubProj.nodes.some((n) => n.id === 'controversy:ctr-1'))
  assert.ok(hubProj.nodes.some((n) => n.id === 'proposition:prop-1'))
  assert.ok(hubProj.nodes.some((n) => n.id === 'document:doc-a'))
  assert.ok(hubProj.nodes.some((n) => n.id === 'document:doc-b'))
  assert.ok(hubProj.edges.some((e) => e.type === 'INCLUDES'))
  assert.ok(hubProj.edges.some((e) => e.type === 'EXPRESSES'))
  assert.equal(hubProj.documents?.length, 2)

  const hubBuilt = buildGraphologyFromProjection(hubProj, DEFAULT_HUB_FILTERS)
  assert.equal(hubBuilt.graph.hasNode('controversy:ctr-1'), true)
  assert.equal(hubBuilt.graph.hasNode('proposition:prop-1'), true)
  assert.equal(hubBuilt.graph.hasNode('document:doc-a'), true)
  assert.equal(hubBuilt.graph.hasNode('document:doc-b'), true)
  assert.equal(hubBuilt.graph.hasEdge('utterance:utt-a', 'proposition:prop-1'), true)
  assert.equal(hubBuilt.graph.hasEdge('utterance:utt-b', 'proposition:prop-1'), true)

  // Manual story union: shared publication collapses; two documents remain
  const story2: NeoDocumentGraph = {
    ...fixture,
    document: {
      ...fixture.document,
      uid: 'story-2',
      title: 'Fixture Story 2',
    },
    agents: [
      { uid: 'story-2:agent:donald-trump', name: 'Donald Trump', normalizedName: 'donald trump' },
      { uid: 'agent-2', name: 'Bob', normalizedName: 'bob' },
    ],
    utterances: [
      {
        ...fixture.utterances[0],
        uid: 'utt-2',
        text: 'Another claim',
        documentUid: 'story-2',
        segmentUid: 'seg-2',
        agentUid: 'story-2:agent:donald-trump',
        agentName: 'Donald Trump',
      },
      {
        ...fixture.utterances[0],
        uid: 'utt-2b',
        text: 'Bob says hi',
        documentUid: 'story-2',
        segmentUid: 'seg-2',
        charStart: 20,
        charEnd: 31,
        agentUid: 'agent-2',
        agentName: 'Bob',
      },
    ],
    segments: [
      {
        uid: 'seg-2',
        ord: 0,
        text: 'Second segment',
        charStart: 0,
        charEnd: 14,
      },
    ],
  }
  // Story 1 also has Donald Trump under a document-scoped agent uid
  const story1WithTrump: NeoDocumentGraph = {
    ...fixture,
    agents: [
      {
        uid: 'story-1:agent:donald-trump',
        name: 'Donald Trump',
        normalizedName: 'donald trump',
      },
    ],
    utterances: [
      {
        ...fixture.utterances[0],
        agentUid: 'story-1:agent:donald-trump',
        agentName: 'Donald Trump',
      },
    ],
  }
  const unionProj = projectUnionDocuments([story1WithTrump, story2])
  assert.equal(unionProj.projectionId, 'union-documents')
  assert.equal(unionProj.rootKind, 'union')
  assert.equal(unionProj.documents?.length, 2)
  assert.ok(unionProj.nodes.some((n) => n.id === 'document:story-1'))
  assert.ok(unionProj.nodes.some((n) => n.id === 'document:story-2'))
  assert.equal(
    unionProj.nodes.filter((n) => n.id === 'publication:pub-1').length,
    1
  )
  // Display-only Agent collapse by normalizedName
  const trumpNodes = unionProj.nodes.filter(
    (n) => n.kind === 'agent' && n.properties.normalizedName === 'donald trump'
  )
  assert.equal(trumpNodes.length, 1)
  assert.equal(trumpNodes[0].id, 'agent:union:donald-trump')
  assert.equal(trumpNodes[0].properties.unionCollapsed, true)
  assert.ok(
    String(trumpNodes[0].properties.sourceAgentUids).includes(
      'story-1:agent:donald-trump'
    )
  )
  assert.ok(
    String(trumpNodes[0].properties.sourceAgentUids).includes(
      'story-2:agent:donald-trump'
    )
  )
  // Distinct people stay separate
  assert.ok(unionProj.nodes.some((n) => n.id === 'agent:union:bob'))
  assert.ok(
    unionProj.edges.some(
      (e) =>
        e.type === 'ASSERTED_BY' &&
        e.source === 'utterance:utt-1' &&
        e.target === 'agent:union:donald-trump'
    )
  )
  assert.ok(
    unionProj.edges.some(
      (e) =>
        e.type === 'ASSERTED_BY' &&
        e.source === 'utterance:utt-2' &&
        e.target === 'agent:union:donald-trump'
    )
  )

  const unionBuilt = buildGraphologyFromProjection(unionProj, DEFAULT_NEO_FILTERS)
  assert.equal(unionBuilt.graph.hasNode('document:story-1'), true)
  assert.equal(unionBuilt.graph.hasNode('document:story-2'), true)
  assert.equal(unionBuilt.graph.hasNode('publication:pub-1'), true)
  assert.equal(unionBuilt.graph.hasNode('agent:union:donald-trump'), true)
  assert.equal(unionBuilt.graph.hasNode('agent:story-1:agent:donald-trump'), false)

  console.log('neo-graphology-adapter: all assertions passed')
}

main()
