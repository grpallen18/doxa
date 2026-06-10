import React, { useCallback, useMemo } from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  MiniMap,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  ConnectionMode,
  MarkerType,
  Node,
  Edge
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { AgentNode } from './nodes/AgentNode';
import { DecisionNode } from './nodes/DecisionNode';
import { MergeNode } from './nodes/MergeNode';
import { FanoutNode } from './nodes/FanoutNode';

const nodeTypes = {
  agent: AgentNode,
  decision: DecisionNode,
  merge: MergeNode,
  fanout: FanoutNode,
};

// Colors for edge paths
const edgeOpts = {
  type: 'smoothstep',
  markerEnd: { type: MarkerType.ArrowClosed, color: '#52525b' },
  style: { stroke: '#52525b', strokeWidth: 2 },
};
const edgePass = {
  type: 'smoothstep',
  markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' },
  style: { stroke: '#10b981', strokeWidth: 2 },
  animated: true,
};
const edgeFail = {
  type: 'smoothstep',
  markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' },
  style: { stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '5 5' },
};
const edgeReturn = {
  type: 'smoothstep',
  markerEnd: { type: MarkerType.ArrowClosed, color: '#8b5cf6' },
  style: { stroke: '#8b5cf6', strokeWidth: 2 },
};

const initialNodes: Node[] = [
  // Main Pipeline
  { id: 'gate-relevance', type: 'decision', position: { x: 50, y: 400 }, data: { label: 'Relevance Gate', result: 'Pass', score: '0.98' } },
  { id: 'agent-chunk', type: 'agent', position: { x: 300, y: 365 }, data: { label: 'Chunk Story', desc: 'Split text into logical segments', status: 'Approved', success: '100%', retries: 0 } },
  { id: 'fanout', type: 'fanout', position: { x: 650, y: 410 }, data: { label: 'Fanout' } },

  // --- CLAIMS BRANCH (Y: 50) ---
  { id: 'agent-ext-claims', type: 'agent', position: { x: 900, y: 50 }, data: { label: 'Extract Claims', desc: 'Identify forward-looking statements', status: 'Approved', cost: '$0.005' } },
  { id: 'agent-rev-claims', type: 'agent', position: { x: 1250, y: 50 }, data: { label: 'Review Claims', desc: 'Verify citations and confidence', status: 'Failed', success: '85%' } },
  { id: 'gate-claims', type: 'decision', position: { x: 1600, y: 40 }, data: { label: 'Decision', result: 'Fail', reason: 'Missing citations', retries: 1 } },
  { id: 'agent-ref-claims', type: 'agent', position: { x: 1400, y: 220 }, data: { label: 'Refine Claims', desc: 'Fix missing citations', status: 'Refining', retries: 1 } },
  { id: 'merge-claims', type: 'merge', position: { x: 1900, y: 50 }, data: { label: 'Canonicalize Claims', desc: 'Deduplicate and normalize' } },

  // --- POSITIONS BRANCH (Y: 280) ---
  { id: 'agent-ext-pos', type: 'agent', position: { x: 900, y: 280 }, data: { label: 'Extract Positions', desc: 'Identify entities & roles', status: 'Approved' } },
  { id: 'agent-rev-pos', type: 'agent', position: { x: 1250, y: 280 }, data: { label: 'Review Positions', desc: 'Verify entity resolution', status: 'Approved' } },
  { id: 'gate-pos', type: 'decision', position: { x: 1600, y: 270 }, data: { label: 'Decision', result: 'Pass', score: '0.99', retries: 0 } },
  { id: 'merge-pos', type: 'merge', position: { x: 1900, y: 280 }, data: { label: 'Canonicalize Positions', desc: 'Link to entity graph' } },

  // --- EVENTS BRANCH (Y: 510) ---
  { id: 'agent-ext-evt', type: 'agent', position: { x: 900, y: 510 }, data: { label: 'Extract Events', desc: 'Identify temporal occurrences', status: 'Approved' } },
  { id: 'agent-rev-evt', type: 'agent', position: { x: 1250, y: 510 }, data: { label: 'Review Events', desc: 'Verify chronological order', status: 'Approved' } },
  { id: 'gate-evt', type: 'decision', position: { x: 1600, y: 500 }, data: { label: 'Decision', result: 'Pass', score: '0.95', retries: 0 } },
  { id: 'merge-evt', type: 'merge', position: { x: 1900, y: 510 }, data: { label: 'Canonicalize Events', desc: 'Map to timeline' } },

  // --- EVIDENCE BRANCH (Y: 740) ---
  { id: 'agent-ext-evd', type: 'agent', position: { x: 900, y: 740 }, data: { label: 'Extract Evidence', desc: 'Gather supporting facts', status: 'Ready' } },
  { id: 'agent-rev-evd', type: 'agent', position: { x: 1250, y: 740 }, data: { label: 'Review Evidence', desc: 'Verify source alignment', status: 'Ready' } },
  { id: 'gate-evd', type: 'decision', position: { x: 1600, y: 730 }, data: { label: 'Decision', result: '', retries: 0 } },
  { id: 'merge-evd', type: 'merge', position: { x: 1900, y: 740 }, data: { label: 'Canonicalize Evidence', desc: 'Attach to assertions' } },

  // FINAL MERGE
  { id: 'final-merge', type: 'merge', position: { x: 2300, y: 410 }, data: { label: 'Canonical Graph Update', desc: 'Commit all approved branches to master graph' } },
];

const initialEdges: Edge[] = [
  // Main
  { id: 'e-rel-chk', source: 'gate-relevance', target: 'agent-chunk', sourceHandle: 'pass', ...edgePass },
  { id: 'e-chk-fan', source: 'agent-chunk', target: 'fanout', ...edgePass },

  // Fanout to Extractors
  { id: 'e-fan-c', source: 'fanout', target: 'agent-ext-claims', sourceHandle: 'a', ...edgePass },
  { id: 'e-fan-p', source: 'fanout', target: 'agent-ext-pos', sourceHandle: 'b', ...edgePass },
  { id: 'e-fan-ev', source: 'fanout', target: 'agent-ext-evt', sourceHandle: 'c', ...edgePass },
  { id: 'e-fan-evd', source: 'fanout', target: 'agent-ext-evd', sourceHandle: 'd', ...edgeOpts },

  // Claims
  { id: 'e-ec-rc', source: 'agent-ext-claims', target: 'agent-rev-claims', ...edgePass },
  { id: 'e-rc-gc', source: 'agent-rev-claims', target: 'gate-claims', ...edgeOpts },
  { id: 'e-gc-mc', source: 'gate-claims', target: 'merge-claims', sourceHandle: 'pass', ...edgePass },
  { id: 'e-gc-refc', source: 'gate-claims', target: 'agent-ref-claims', sourceHandle: 'fail', ...edgeFail },
  { id: 'e-refc-rc', source: 'agent-ref-claims', target: 'agent-rev-claims', ...edgeReturn },
  { id: 'e-mc-final', source: 'merge-claims', target: 'final-merge', ...edgePass },

  // Positions
  { id: 'e-ep-rp', source: 'agent-ext-pos', target: 'agent-rev-pos', ...edgePass },
  { id: 'e-rp-gp', source: 'agent-rev-pos', target: 'gate-pos', ...edgeOpts },
  { id: 'e-gp-mp', source: 'gate-pos', target: 'merge-pos', sourceHandle: 'pass', ...edgePass },
  { id: 'e-mp-final', source: 'merge-pos', target: 'final-merge', ...edgePass },

  // Events
  { id: 'e-ee-re', source: 'agent-ext-evt', target: 'agent-rev-evt', ...edgePass },
  { id: 'e-re-ge', source: 'agent-rev-evt', target: 'gate-evt', ...edgeOpts },
  { id: 'e-ge-me', source: 'gate-evt', target: 'merge-evt', sourceHandle: 'pass', ...edgePass },
  { id: 'e-me-final', source: 'merge-evt', target: 'final-merge', ...edgePass },

  // Evidence
  { id: 'e-evd-rvd', source: 'agent-ext-evd', target: 'agent-rev-evd', ...edgeOpts },
  { id: 'e-rvd-gvd', source: 'agent-rev-evd', target: 'gate-evd', ...edgeOpts },
  { id: 'e-gvd-mvd', source: 'gate-evd', target: 'merge-evd', sourceHandle: 'pass', ...edgeOpts },
  { id: 'e-mvd-final', source: 'merge-evd', target: 'final-merge', ...edgeOpts },
];

interface WorkflowCanvasProps {
  onNodeSelect: (id: string | null) => void;
}

export function WorkflowCanvas({ onNodeSelect }: WorkflowCanvasProps) {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const onSelectionChange = useCallback(({ nodes }: { nodes: Node[] }) => {
    if (nodes.length > 0) {
      onNodeSelect(nodes[0].id);
    } else {
      onNodeSelect(null);
    }
  }, [onNodeSelect]);

  return (
    <div className="w-full h-full bg-[#09090b]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#27272a" gap={32} size={1} variant={BackgroundVariant.Lines} />
        <Controls className="bg-zinc-900 border-white/10 fill-zinc-400" showInteractive={false} />
        <MiniMap 
          nodeColor={(n: Node) => {
            if (n.type === 'decision') return '#f59e0b';
            if (n.type === 'merge') return '#6366f1';
            return '#52525b';
          }}
          maskColor="rgba(9, 9, 11, 0.8)"
          className="bg-zinc-950 border border-white/10 rounded-lg overflow-hidden"
        />
      </ReactFlow>
    </div>
  );
}
