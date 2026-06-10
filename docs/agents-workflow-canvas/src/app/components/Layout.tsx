import React, { useState } from 'react';
import { Toolbar } from './Toolbar';
import { Inspector } from './Inspector';
import { Console } from './Console';
import { WorkflowCanvas } from './WorkflowCanvas';
import { ReactFlowProvider } from '@xyflow/react';

export function Layout() {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-200 overflow-hidden font-sans selection:bg-indigo-500/30">
      <Toolbar />
      <div className="flex flex-1 overflow-hidden relative">
        <main className="flex-1 relative">
          <ReactFlowProvider>
            <WorkflowCanvas onNodeSelect={setSelectedNodeId} />
          </ReactFlowProvider>
        </main>
        <aside className="w-96 border-l border-white/10 bg-zinc-900/50 backdrop-blur-xl flex flex-col z-10 shadow-2xl relative">
          <Inspector selectedNodeId={selectedNodeId} />
        </aside>
      </div>
      <Console />
    </div>
  );
}
