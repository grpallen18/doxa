import React, { useState } from 'react';
import { Settings, FileJson, History, ArrowRight, Play, RotateCcw, ShieldCheck, UserCog } from 'lucide-react';

interface InspectorProps {
  selectedNodeId: string | null;
}

export function Inspector({ selectedNodeId }: InspectorProps) {
  const [activeTab, setActiveTab] = useState<'prompt' | 'json' | 'history'>('prompt');

  if (!selectedNodeId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 p-8 text-center">
        <Settings className="w-12 h-12 mb-4 opacity-20" />
        <p>Select a node on the canvas to inspect its configuration and state.</p>
      </div>
    );
  }

  // Mock data for the selected node
  const nodeName = selectedNodeId.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
  const isAgent = !selectedNodeId.includes('gate');

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-white/10 shrink-0">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
              {nodeName}
            </h2>
            <p className="text-sm text-zinc-400 mt-1">GPT-4.5 Turbo • Temperature: 0.1</p>
          </div>
          <div className="px-2 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-medium rounded border border-emerald-500/20">
            Approved
          </div>
        </div>
      </div>

      <div className="flex border-b border-white/10 shrink-0">
        <button 
          onClick={() => setActiveTab('prompt')}
          className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'prompt' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
        >
          Configuration
        </button>
        <button 
          onClick={() => setActiveTab('json')}
          className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-1.5 ${activeTab === 'json' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
        >
          <FileJson className="w-4 h-4" /> JSON
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-1.5 ${activeTab === 'history' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
        >
          <History className="w-4 h-4" /> History
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/20">
        {activeTab === 'prompt' && (
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">System Prompt</label>
              <div className="bg-zinc-950/50 border border-white/5 rounded-md p-3 text-sm text-zinc-300 font-mono leading-relaxed">
                You are an expert financial analyst. Extract all forward-looking claims from the provided text chunk. Ensure every claim is cited with the exact source sentence...
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Output Schema</label>
              <div className="bg-zinc-950/50 border border-white/5 rounded-md p-3 text-xs text-indigo-300 font-mono overflow-x-auto">
                <pre>{`{
  "claims": [
    {
      "statement": "string",
      "confidence": "number",
      "source_quote": "string"
    }
  ]
}`}</pre>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'json' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Last Output Payload</label>
              <span className="text-xs text-zinc-500">23ms ago</span>
            </div>
            <div className="bg-zinc-950/80 border border-white/10 rounded-md p-3 text-xs text-emerald-300 font-mono overflow-x-auto shadow-inner">
              <pre>{`{
  "claims": [
    {
      "statement": "Revenue will grow 15% YoY",
      "confidence": 0.95,
      "source_quote": "We expect to see 15% year-over-year revenue growth in Q4."
    }
  ]
}`}</pre>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-white/10 before:to-transparent">
            {/* Loop History Timeline */}
            <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white/10 bg-zinc-900 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-[0_0_10px_rgba(16,185,129,0.2)] text-emerald-500">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-white/10 bg-zinc-900/50">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-zinc-200 text-sm">Review Passed</h3>
                  <time className="text-xs text-zinc-500">14:32:18</time>
                </div>
                <p className="text-xs text-zinc-400">All validations successful. 0 errors found.</p>
              </div>
            </div>

            <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white/10 bg-zinc-900 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 text-amber-500">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-white/10 bg-zinc-900/50">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-zinc-200 text-sm">Refined Output</h3>
                  <time className="text-xs text-zinc-500">14:32:15</time>
                </div>
                <p className="text-xs text-zinc-400">Added missing source citations.</p>
              </div>
            </div>

            <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white/10 bg-zinc-900 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 text-rose-500">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-rose-500/10 bg-rose-500/5">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-zinc-200 text-sm">Review Failed</h3>
                  <time className="text-xs text-zinc-500">14:32:12</time>
                </div>
                <p className="text-xs text-rose-400/80">Missing source_quote for claim index 0.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-white/10 bg-zinc-950/50 shrink-0 grid grid-cols-2 gap-2">
        <button className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 py-2 rounded-md text-sm transition-all">
          <Play className="w-4 h-4" /> Run Test
        </button>
        <button className="flex items-center justify-center gap-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 py-2 rounded-md text-sm transition-all">
          Save Prompt
        </button>
        <button className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 py-2 rounded-md text-sm transition-all">
          <RotateCcw className="w-4 h-4" /> Roll Back
        </button>
        <button className="flex items-center justify-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 py-2 rounded-md text-sm transition-all">
          <ShieldCheck className="w-4 h-4" /> Force Approve
        </button>
        <button className="col-span-2 flex items-center justify-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-500 py-2 rounded-md text-sm transition-all mt-1">
          <UserCog className="w-4 h-4" /> Send to Human Review
        </button>
      </div>
    </div>
  );
}
