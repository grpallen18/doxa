import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { GitMerge, Layers } from 'lucide-react';

export function MergeNode({ data, selected }: any) {
  const { label, desc } = data;

  return (
    <div className={`w-64 rounded-xl border ${selected ? 'border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.3)]' : 'border-indigo-500/30'} bg-indigo-950/20 backdrop-blur-md overflow-hidden transition-all shadow-[0_0_15px_rgba(99,102,241,0.05)]`}>
      <Handle type="target" position={Position.Left} className="w-2 h-4 rounded-sm bg-indigo-500 border-none -ml-1" />
      
      <div className="p-4 flex items-center gap-3 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-transparent pointer-events-none" />
        
        <div className="w-10 h-10 rounded-full bg-indigo-500/20 border border-indigo-500/50 flex items-center justify-center shrink-0 text-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.2)]">
          <GitMerge className="w-5 h-5" />
        </div>
        
        <div>
          <h3 className="text-sm font-bold text-indigo-100">{label}</h3>
          <p className="text-[10px] text-indigo-300/70 mt-0.5 leading-tight">{desc}</p>
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="w-2 h-4 rounded-sm bg-indigo-500 border-none -mr-1" />
    </div>
  );
}
