'use client'

import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { Line, OrbitControls, Stars } from '@react-three/drei'

export interface VizNode {
  map_id: string
  entity_type: 'thesis' | 'claim' | 'story_claim'
  entity_id: string
  x: number
  y: number
  layer: number
  size: number
  drift_seed?: number
}

export interface VizEdge {
  id: string
  map_id: string
  source_type: string
  source_id: string
  target_type: string
  target_id: string
  edge_type: string
  weight: number
  similarity_score?: number | null
}

interface AtlasMapProps {
  nodes: VizNode[]
  edges: VizEdge[]
  onNodeClick?: (node: VizNode) => void
  onBackgroundClick?: () => void
  selectedNodeId?: string | null
  zoomLevel?: number
}

function CameraFocus({
  selectedNode,
  controlsRef,
}: {
  selectedNode: VizNode | null
  controlsRef: React.RefObject<unknown>
}) {
  useEffect(() => {
    if (selectedNode && controlsRef.current) {
      const controls = controlsRef.current as { target: { set: (x: number, y: number, z: number) => void } }
      controls.target.set(selectedNode.x, selectedNode.y, 0)
    }
  }, [selectedNode, controlsRef])
  return null
}

function NodeSphere({
  node,
  selected,
  onClick,
}: {
  node: VizNode
  selected: boolean
  onClick: () => void
}) {
  const meshRef = useRef(null)
  const scale = selected ? node.size * 1.2 : node.size

  return (
    <mesh
      ref={meshRef}
      position={[node.x, node.y, 0]}
      scale={scale}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default'
      }}
    >
      <sphereGeometry args={[1, 32, 32]} />
      <meshStandardMaterial
        color={node.entity_type === 'thesis' ? '#7c9eb2' : '#9db4c8'}
        emissive={selected ? '#4a6fa5' : '#2a3f5f'}
        emissiveIntensity={selected ? 0.4 : 0.2}
        metalness={0.1}
        roughness={0.6}
      />
    </mesh>
  )
}

function EdgeLine({
  edge,
  nodesById,
  highlighted,
}: {
  edge: VizEdge
  nodesById: Map<string, VizNode>
  highlighted: boolean
}) {
  const source = nodesById.get(`${edge.source_type}:${edge.source_id}`)
  const target = nodesById.get(`${edge.target_type}:${edge.target_id}`)
  if (!source || !target) return null

  const points = useMemo(
    () => [[source.x, source.y, 0] as [number, number, number], [target.x, target.y, 0] as [number, number, number]],
    [source, target]
  )

  return (
    <Line
      points={points}
      color={highlighted ? '#7c9eb2' : '#4a6fa5'}
      lineWidth={highlighted ? 1.5 : 0.5}
    />
  )
}

function SceneContent({
  nodes,
  edges,
  selectedNodeId,
  selectedNode,
  zoomLevel,
  onNodeClick,
  onBackgroundClick,
}: {
  nodes: VizNode[]
  edges: VizEdge[]
  selectedNodeId?: string | null
  selectedNode?: VizNode | null
  zoomLevel: number
  onNodeClick?: (node: VizNode) => void
  onBackgroundClick?: () => void
}) {
  const controlsRef = useRef(null)

  const nodesById = useMemo(() => {
    const m = new Map<string, VizNode>()
    for (const n of nodes) {
      m.set(`${n.entity_type}:${n.entity_id}`, n)
    }
    return m
  }, [nodes])

  const visibleNodes = useMemo(() => {
    return nodes.filter((n) => n.layer <= zoomLevel)
  }, [nodes, zoomLevel])

  const highlightedEdges = useMemo(() => {
    if (!selectedNodeId) return new Set<string>()
    const sel = selectedNodeId
    const s = new Set<string>()
    for (const e of edges) {
      const src = `${e.source_type}:${e.source_id}`
      const tgt = `${e.target_type}:${e.target_id}`
      if (src === sel || tgt === sel) s.add(e.id)
    }
    return s
  }, [edges, selectedNodeId])

  return (
    <>
      <mesh
        position={[0, 0, -1]}
        onClick={(e) => {
          e.stopPropagation()
          onBackgroundClick?.()
        }}
      >
        <planeGeometry args={[1000, 1000]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} intensity={0.8} />
      <pointLight position={[-10, -10, 5]} intensity={0.3} color="#4a6fa5" />

      <Stars radius={100} depth={50} count={2000} factor={2} saturation={0.3} fade speed={0.5} />

      {visibleNodes.map((node) => (
        <NodeSphere
          key={`${node.entity_type}:${node.entity_id}`}
          node={node}
          selected={selectedNodeId === `${node.entity_type}:${node.entity_id}`}
          onClick={() => onNodeClick?.(node)}
        />
      ))}

      {edges.map((edge) => (
        <EdgeLine
          key={edge.id}
          edge={edge}
          nodesById={nodesById}
          highlighted={highlightedEdges.has(edge.id)}
        />
      ))}

      <CameraFocus selectedNode={selectedNode ?? null} controlsRef={controlsRef} />

      <OrbitControls
        ref={controlsRef}
        enablePan
        enableZoom
        enableRotate
        minDistance={2}
        maxDistance={50}
        maxPolarAngle={Math.PI / 2}
        minPolarAngle={-Math.PI / 2}
      />
    </>
  )
}

export default function AtlasMap({
  nodes,
  edges,
  onNodeClick,
  onBackgroundClick,
  selectedNodeId,
  zoomLevel = 2,
}: AtlasMapProps) {
  return (
    <div className="h-full w-full min-h-[400px] rounded-bevel bg-[#0f1729]">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 50 }}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
      >
        <color attach="background" args={['#0f1729']} />
        <fog attach="fog" args={['#0f1729', 20, 80]} />
        <Suspense
          fallback={
            <mesh>
              <sphereGeometry args={[1, 16, 16]} />
              <meshBasicMaterial color="#2a3f5f" wireframe />
            </mesh>
          }
        >
          <SceneContent
            nodes={nodes}
            edges={edges}
            selectedNodeId={selectedNodeId}
            selectedNode={nodes.find((n) => `${n.entity_type}:${n.entity_id}` === selectedNodeId) ?? null}
            zoomLevel={zoomLevel}
            onNodeClick={onNodeClick}
            onBackgroundClick={onBackgroundClick}
          />
        </Suspense>
      </Canvas>
    </div>
  )
}
