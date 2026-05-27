import { ShieldAlert, X } from "lucide-react";
import type { ApprovalRequest } from "../types";

interface ApprovalBannerProps {
  request: ApprovalRequest | null;
  onResolve: (approved: boolean) => void;
}

export function ApprovalBanner({ request, onResolve }: ApprovalBannerProps) {
  if (!request) return null;

  return (
    <div className="border-t border-amber-300/10 bg-amber-300/10 px-6 py-3">
      <div className="flex flex-col gap-3 rounded-lg border border-amber-300/20 bg-slate-950/60 p-3 text-sm text-amber-50 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" />
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-amber-200/70">
              等待确认 · {request.risk}
            </div>
            <div className="mt-1 break-words font-medium">{request.summary}</div>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onResolve(false)}
            className="inline-flex items-center justify-center rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
          >
            拒绝
          </button>
          <button
            type="button"
            onClick={() => onResolve(true)}
            className="inline-flex items-center justify-center rounded-lg bg-amber-300 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-amber-200"
          >
            确认执行
          </button>
          <button
            type="button"
            onClick={() => onResolve(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white"
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
