import { ShieldCheck, Sparkles, TimerReset } from "lucide-react";
import { statusBadges } from "../constants";
import type { ToolTrace } from "../types";

interface ToolTracePanelProps {
  toolTrace: ToolTrace[];
}

export function ToolTracePanel({ toolTrace }: ToolTracePanelProps) {
  return (
    <div className="space-y-6">
      {/* 工具轨迹标题 */}
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
        <span>工具轨迹</span>
        <button type="button" className="text-white/70 hover:text-white">
          查看日志
        </button>
      </div>

      {/* 工具轨迹列表 */}
      <div className="space-y-4">
        {toolTrace.map((trace) => (
          <div key={trace.id} className="rounded-2xl border border-white/5 bg-white/5 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{trace.startedAt}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusBadges[trace.status]}`}
              >
                {trace.status}
              </span>
            </div>
            <p className="mt-2 text-sm font-semibold text-white">{trace.label}</p>
            <p className="mt-1 text-xs text-slate-400">{trace.detail}</p>
          </div>
        ))}
      </div>

      {/* 智能操作提示 */}
      <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-slate-200/10 via-transparent to-slate-200/5 p-4 text-xs text-slate-300">
        <div className="flex items-center gap-2 text-sm text-white">
          <Sparkles className="h-4 w-4 text-emerald-300" />
          智能操作提示
        </div>
        <ul className="mt-3 space-y-2">
          <li className="flex items-start gap-2">
            <TimerReset className="h-3 w-3 text-emerald-200" />
            <span>支持多步计划，自动拆解复杂操作。</span>
          </li>
          <li className="flex items-start gap-2">
            <ShieldCheck className="h-3 w-3 text-emerald-200" />
            <span>任何写操作都会先生成沙箱 diff 供你确认。</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
