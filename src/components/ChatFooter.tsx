import { ArrowUpRight, Plus, TerminalSquare } from "lucide-react";

export function ChatFooter() {
  return (
    <div className="px-6 pb-6 flex items-center justify-between text-xs text-slate-500">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-white/5 px-3 py-1 hover:border-white/30 hover:text-white/80"
        >
          <Plus className="h-3 w-3" />
          附加文件
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-white/5 px-3 py-1 hover:border-white/30 hover:text-white/80"
        >
          <TerminalSquare className="h-3 w-3" />
          命令模式
        </button>
      </div>
      <button
        type="button"
        className="inline-flex items-center gap-1 text-emerald-300"
      >
        <ArrowUpRight className="h-3 w-3" />
        预览执行计划
      </button>
    </div>
  );
}

