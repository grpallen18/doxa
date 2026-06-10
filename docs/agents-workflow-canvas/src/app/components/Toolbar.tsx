import React from 'react';
import { Search, Play, Download, Activity, ZoomIn, ZoomOut, Map, LayoutDashboard, ChevronDown } from 'lucide-react';

export function Toolbar() {
  return (
    <header className="h-14 border-b border-white/10 bg-zinc-950/80 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-20">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-indigo-400 font-semibold text-lg tracking-tight">
          <Activity className="w-5 h-5" />
          DOXA
        </div>
        
        <div className="h-4 w-px bg-white/10 mx-2" />

        <div className="flex items-center gap-2 bg-white/5 rounded-md px-3 py-1.5 border border-white/5 text-sm hover:bg-white/10 transition-colors cursor-pointer">
          <span className="text-zinc-400">Story:</span>
          <span className="text-zinc-200">#8249 - Q3 Earnings Call</span>
          <ChevronDown className="w-4 h-4 text-zinc-500" />
        </div>

        <div className="flex items-center gap-2 bg-white/5 rounded-md px-3 py-1.5 border border-white/5 text-sm hover:bg-white/10 transition-colors cursor-pointer">
          <span className="text-zinc-400">Env:</span>
          <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
          <span className="text-zinc-200">Production</span>
          <ChevronDown className="w-4 h-4 text-zinc-500" />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative group mr-2">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder="Search agents, nodes..." 
            className="bg-white/5 border border-white/10 rounded-md pl-9 pr-4 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 w-64 transition-all"
          />
        </div>

        <button className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 px-3 py-1.5 rounded-md text-sm font-medium transition-all">
          <Download className="w-4 h-4" />
          <span className="hidden xl:inline">Export JSON</span>
        </button>
        <button className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 px-3 py-1.5 rounded-md text-sm font-medium transition-all">
          <LayoutDashboard className="w-4 h-4" />
          <span className="hidden xl:inline">Audit Log</span>
        </button>
        <div className="flex items-center gap-1 bg-white/5 rounded-md border border-white/10 p-1">
          <button className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-white/10 rounded transition-colors" title="Zoom Out">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-white/10 rounded transition-colors" title="Zoom In">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-white/10 rounded transition-colors" title="Toggle Minimap">
            <Map className="w-4 h-4" />
          </button>
        </div>
        <button className="flex items-center gap-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 px-3 py-1.5 rounded-md text-sm font-medium transition-all shadow-[0_0_15px_rgba(99,102,241,0.1)]">
          <Play className="w-4 h-4" />
          Run Full Pipeline
        </button>
      </div>
    </header>
  );
}
