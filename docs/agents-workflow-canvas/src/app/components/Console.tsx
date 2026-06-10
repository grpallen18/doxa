import React, { useState } from 'react';
import { Terminal, X, ChevronUp, ChevronDown, CheckCircle2, XCircle, AlertCircle, RefreshCw } from 'lucide-react';

const LOGS = [
  { id: 1, time: '14:32:01', type: 'info', message: 'Pipeline execution started for Story #8249' },
  { id: 2, time: '14:32:02', type: 'success', message: 'Relevance Gate: Passed (Score: 0.98)' },
  { id: 3, time: '14:32:04', type: 'info', message: 'Chunk Story: Split into 12 segments' },
  { id: 4, time: '14:32:05', type: 'info', message: 'Extraction Fanout: Initiated 4 branches (Claims, Positions, Events, Evidence)' },
  { id: 5, time: '14:32:12', type: 'error', message: 'Review Claims: Failed validation (Missing source citations)' },
  { id: 6, time: '14:32:13', type: 'warning', message: 'Refine Claims: Attempt 1/3 started' },
  { id: 7, time: '14:32:18', type: 'success', message: 'Review Events: Passed validation' },
  { id: 8, time: '14:32:19', type: 'success', message: 'Canonicalize Events: Complete. Awaiting merge.' },
];

export function Console() {
  const [isOpen, setIsOpen] = useState(true);

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="absolute bottom-4 right-[400px] bg-zinc-900 border border-white/10 px-4 py-2 rounded-full flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 shadow-xl z-50 transition-colors"
      >
        <Terminal className="w-4 h-4" />
        Show Console
        <ChevronUp className="w-4 h-4 ml-1" />
      </button>
    );
  }

  return (
    <div className="h-64 border-t border-white/10 bg-zinc-950 flex flex-col shrink-0 z-20 relative">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-zinc-900/50">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
          <Terminal className="w-4 h-4 text-zinc-500" />
          Execution Logs
        </div>
        <div className="flex items-center gap-2">
          <button className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setIsOpen(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/20">
        {LOGS.map(log => (
          <div key={log.id} className="flex items-start gap-3 hover:bg-white/[0.02] p-1 rounded transition-colors group">
            <span className="text-zinc-600 shrink-0 select-none">[{log.time}]</span>
            <div className="shrink-0 mt-0.5">
              {log.type === 'info' && <span className="w-2 h-2 rounded-full bg-blue-500/50 block mt-0.5" />}
              {log.type === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
              {log.type === 'error' && <XCircle className="w-3.5 h-3.5 text-rose-500" />}
              {log.type === 'warning' && <AlertCircle className="w-3.5 h-3.5 text-amber-500" />}
            </div>
            <span className={`
              ${log.type === 'error' ? 'text-rose-400' : ''}
              ${log.type === 'warning' ? 'text-amber-400' : ''}
              ${log.type === 'success' ? 'text-emerald-400' : ''}
              ${log.type === 'info' ? 'text-zinc-300' : ''}
            `}>
              {log.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
