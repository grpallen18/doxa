import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Network } from 'lucide-react';

export function FanoutNode({ data, selected }: any) {
  const { label } = data;

  return (
    <div className={`w-40 rounded-full border ${selected ? 'border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.3)]' : 'border-white/10'} bg-zinc-900/80 backdrop-blur-md overflow-hidden transition-all shadow-lg flex items-center justify-center p-2 gap-2`}>
      <Handle type="target" position={Position.Left} className="w-2 h-4 rounded-sm bg-zinc-600 border-none -ml-1" />
      
      <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
        <Network className="w-3.5 h-3.5" />
      </div>
      <span className="text-xs font-semibold text-zinc-200 pr-2">{label}</span>

      <Handle type="source" position={Position.Right} id="a" className="w-2 h-4 rounded-sm bg-zinc-600 border-none -mr-1" style={{ top: '25%' }} />
      <Handle type="source" position={Position.Right} id="b" className="w-2 h-4 rounded-sm bg-zinc-600 border-none -mr-1" style={{ top: '40%' }} />
      <Handle type="source" position={Position.Right} id="c" className="w-2 h-4 rounded-sm bg-zinc-600 border-none -mr-1" style={{ top: '60%' }} />
      <Handle type="source" position={Position.Right} id="d" className="w-2 h-4 rounded-sm bg-zinc-600 border-none -mr-1" style={{ top: '75%' }} />
    </div>
  );
}
