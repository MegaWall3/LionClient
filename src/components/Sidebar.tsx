import { Plus, Sparkles } from "lucide-react";
import { availableTools, quickActions } from "../constants";

interface SidebarProps {
  onNewChat: () => void;
}

export function Sidebar({ onNewChat }: SidebarProps) {
  return (
    <aside className="hidden lg:flex flex-col overflow-y-auto rounded-3xl border border-white/5 bg-white/5/30 p-4 xl:p-5 backdrop-blur-2xl shadow-[0_20px_90px_-60px_rgba(15,23,42,1)]">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Lion</p>
          <p className="text-lg font-semibold">桌面 Agent</p>
        </div>
        <button
          type="button"
          onClick={onNewChat}
          className="rounded-full bg-white/10 p-2 text-xs font-medium text-white/80 hover:bg-white/20 transition"
          title="新建对话"
        >
          New
        </button>
      </div>

      <div className="mt-6 space-y-4">
        {/* 状态卡片 */}
        <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-white/10 to-transparent p-4">
          <div className="flex items-center gap-3 text-sm text-slate-300">
            <Sparkles className="h-4 w-4 text-emerald-300" />
            <span>当前状态：准备就绪</span>
          </div>
          <p className="mt-3 text-xs text-slate-400">已接入系统工具与沙箱，你可以直接下达命令。</p>
          <button
            type="button"
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white/90 px-3 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-emerald-500/20 transition hover:bg-white"
          >
            <Plus className="h-4 w-4" />
            新建任务流程
          </button>
        </div>

        {/* 快速提示 */}
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">快速提示</p>
          <div className="mt-3 space-y-2">
            {quickActions.map((action) => (
              <button
                type="button"
                key={action}
                className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-left text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/10"
              >
                {action}
              </button>
            ))}
          </div>
        </div>

        {/* 可用工具 */}
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">可用工具</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {availableTools.map((tool) => (
              <button
                type="button"
                key={tool.label}
                className="group rounded-2xl border border-white/5 bg-slate-900/40 p-4 text-left text-sm text-slate-200 transition hover:border-white/20 hover:bg-slate-900/70"
              >
                <tool.icon className="mb-3 h-5 w-5 text-white/80" />
                <span>{tool.label}</span>
                <div
                  className={`mt-3 h-1 w-full rounded-full bg-gradient-to-r to-transparent ${tool.accent}`}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
