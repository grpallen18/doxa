import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Bot, Play, FileJson, Edit3, TerminalSquare, RotateCcw, Activity } from 'lucide-react';

export function AgentNode({ data, selected }: any) {
  const { label, desc, status, model, cost, success, retries } = data;

  const statusColors: any = {
    'Ready': 'text-zinc-400 border-zinc-700 bg-zinc-800/50',
    'Running': 'text-blue-400 border-blue-500/30 bg-blue-500/10',
    'Approved': 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    'Failed': 'text-rose-400 border-rose-500/30 bg-rose-500/10',
    'Needs Review': 'text-amber-400 border-amber-500/30 bg-amber-500/10',
    'Refining': 'text-violet-400 border-violet-500/30 bg-violet-500/10',
    'Human Review': 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  };

  const statusColor = statusColors[status] || statusColors['Ready'];

  return (
    <div className={`w-72 rounded-xl border ${selected ? 'border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.2)]' : 'border-white/10 shadow-lg'} bg-zinc-900/80 backdrop-blur-md overflow-hidden transition-all group`}>
      <Handle type="target" position={Position.Left} className="w-2 h-4 rounded-sm bg-zinc-600 border-none -ml-1" />
      
      {/* Header */}
      <div className="p-3 border-b border-white/5 flex items-start justify-between bg-zinc-950/30">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-white/5 border border-white/10 text-indigo-400">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 leading-tight">{label}</h3>
            <p className="text-[10px] text-zinc-500 leading-tight mt-0.5">{desc}</p>
          </div>
        </div>
        <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border ${statusColor}`}>
          {status}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="px-3 py-2 grid grid-cols-2 gap-2 text-[10px] border-b border-white/5 bg-zinc-900/50">
        <div className="flex flex-col">
          <span className="text-zinc-500">Model</span>
          <span className="text-zinc-300 font-mono">{model || 'GPT-4o'}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-zinc-500">Cost</span>
          <span className="text-zinc-300 font-mono">{cost || '$0.002'}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-zinc-500">Success Rate</span>
          <span className="text-emerald-400">{success || '98%'}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-zinc-500">Retries</span>
          <span className={retries > 0 ? 'text-amber-400' : 'text-zinc-300'}>{retries || '0'}/3</span>
        </div>
      </div>

      {/* Progress Bar (if running or refining) */}
      {(status === 'Running' || status === 'Refining') && (
        <div className="h-0.5 w-full bg-zinc-800">
          <div className="h-full bg-blue-500 w-2/3 animate-pulse"></div>
        </div>
      )}

      {/* Actions (visible on hover or always dim) */}
      <div className="px-2 py-1.5 flex items-center justify-between bg-zinc-950/50">
        <div className="flex items-center gap-1">
          <button className="p-1 rounded hover:bg-white/10 text-zinc-500 hover:text-zinc-300 transition-colors" title="Run Agent">
            <Play className="w-3.5 h-3.5" />
          </button>
          <button className="p-1 rounded hover:bg-white/10 text-zinc-500 hover:text-indigo-400 transition-colors" title="Inspect JSON">
            <FileJson className="w-3.5 h-3.5" />
          </button>
          <button className="p-1 rounded hover:bg-white/10 text-zinc-500 hover:text-zinc-300 transition-colors" title="Edit Prompt">
            <Edit3 className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1 rounded hover:bg-white/10 text-zinc-500 hover:text-zinc-300 transition-colors" title="View Logs">
            <TerminalSquare className="w-3.5 h-3.5" />
          </button>
          <button className="p-1 rounded hover:bg-white/10 text-zinc-500 hover:text-amber-400 transition-colors" title="Retry">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="w-2 h-4 rounded-sm bg-zinc-600 border-none -mr-1" />
    </div>
  );
}
