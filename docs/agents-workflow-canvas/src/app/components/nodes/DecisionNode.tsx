import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Split, Check, X, ShieldAlert } from 'lucide-react';

export function DecisionNode({ data, selected }: any) {
  const { label, result, score, reason, retries, maxRetries } = data;

  const isPass = result === 'Pass';
  const isFail = result === 'Fail' || result === 'Needs Refinement';
  const isHuman = result === 'Human Review';

  let ringColor = 'border-white/10';
  let glow = '';
  if (isPass) {
    ringColor = 'border-emerald-500/50';
    glow = 'shadow-[0_0_15px_rgba(16,185,129,0.2)]';
  } else if (isHuman) {
    ringColor = 'border-orange-500/50';
    glow = 'shadow-[0_0_15px_rgba(249,115,22,0.2)]';
  } else if (isFail) {
    ringColor = 'border-amber-500/50';
    glow = 'shadow-[0_0_15px_rgba(245,158,11,0.2)]';
  }

  return (
    <div className={`relative w-48 rounded-xl border ${selected ? 'border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.3)]' : ringColor} bg-zinc-950 backdrop-blur-md overflow-hidden transition-all ${glow}`}>
      <Handle type="target" position={Position.Left} className="w-2 h-4 rounded-sm bg-zinc-600 border-none -ml-1" />
      
      {/* Top Handle - Alternate entry */}
      <Handle type="target" position={Position.Top} id="top" className="w-4 h-2 rounded-sm bg-zinc-600 border-none -mt-1 opacity-0" />

      <div className="p-3 text-center bg-zinc-900/80 border-b border-white/5 relative">
        <div className="mx-auto w-8 h-8 rounded-lg bg-zinc-800 border border-white/10 flex items-center justify-center mb-2 rotate-45">
          <div className="-rotate-45">
            <Split className="w-4 h-4 text-indigo-400" />
          </div>
        </div>
        <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">{label}</h3>
        {score && <div className="text-[10px] text-zinc-500 mt-1">Score: {score}</div>}
      </div>

      <div className="p-3 text-[10px] text-center space-y-2">
        {result && (
          <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${isPass ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : isHuman ? 'border-orange-500/30 text-orange-400 bg-orange-500/10' : 'border-amber-500/30 text-amber-400 bg-amber-500/10'}`}>
            {isPass && <Check className="w-3 h-3" />}
            {isHuman && <ShieldAlert className="w-3 h-3" />}
            {isFail && <X className="w-3 h-3" />}
            <span className="font-semibold uppercase tracking-wider">{result}</span>
          </div>
        )}
        
        {reason && (
          <div className="text-zinc-400 leading-tight">
            {reason}
          </div>
        )}

        {retries !== undefined && (
          <div className="text-zinc-600 mt-1">
            Retries: {retries} / {maxRetries || 3}
          </div>
        )}
      </div>

      {/* Right Handle: Pass -> Continue */}
      <Handle 
        type="source" 
        position={Position.Right} 
        id="pass"
        className="w-2 h-4 rounded-sm bg-emerald-500 border-none -mr-1" 
      />

      {/* Bottom Handle: Fail -> Refine */}
      <Handle 
        type="source" 
        position={Position.Bottom} 
        id="fail"
        className="w-4 h-2 rounded-sm bg-amber-500 border-none -mb-1" 
      />
    </div>
  );
}
