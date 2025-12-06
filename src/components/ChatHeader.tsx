import { Activity, MessageSquare, Settings2 } from "lucide-react";

export function ChatHeader() {
  return (
    <header className="flex flex-col border-b border-white/5 px-6 py-4 text-sm text-slate-300 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3 text-base text-white">
        <div className="rounded-full bg-white/10 p-2">
          <MessageSquare className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-400">
            当前会话
          </p>
          <p className="text-lg font-semibold">
            Workspace 调度 · #1027
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3 text-xs text-slate-400 md:mt-0">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1">
          <Activity className="h-3 w-3 text-emerald-300" />
          Live
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-white/80 hover:border-white/40"
        >
          <Settings2 className="h-3 w-3" />
          控制面板
        </button>
      </div>
    </header>
  );
}

