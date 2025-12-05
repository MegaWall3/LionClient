import { FolderSearch2 } from "lucide-react";
import { formatSize, formatTime } from "../utils";
import type { FileEntry } from "../types";

interface InstantToolPanelProps {
  listPath: string;
  listPattern: string;
  listRecursive: boolean;
  listResults: FileEntry[];
  listLoading: boolean;
  listError: string | null;
  onPathChange: (path: string) => void;
  onPatternChange: (pattern: string) => void;
  onRecursiveChange: (recursive: boolean) => void;
  onExecute: () => void;
  onReset: () => void;
}

export function InstantToolPanel({
  listPath,
  listPattern,
  listRecursive,
  listResults,
  listLoading,
  listError,
  onPathChange,
  onPatternChange,
  onRecursiveChange,
  onExecute,
  onReset,
}: InstantToolPanelProps) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
      {/* 标题 */}
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
        <span>即时工具 · 列目录</span>
        <button onClick={onReset} className="text-white/60 hover:text-white">
          重置
        </button>
      </div>

      {/* 输入表单 */}
      <div className="mt-3 space-y-2 text-sm text-slate-200">
        <input
          value={listPath}
          onChange={(e) => onPathChange(e.target.value)}
          className="w-full rounded-2xl border border-white/10 bg-transparent px-3 py-2 text-xs text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50"
          placeholder="例如 D:\\Workspace"
        />
        <input
          value={listPattern}
          onChange={(e) => onPatternChange(e.target.value)}
          className="w-full rounded-2xl border border-white/10 bg-transparent px-3 py-2 text-xs text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50"
          placeholder="可选：按文件名过滤 (如 .ts)"
        />
        <label className="inline-flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={listRecursive}
            onChange={(e) => onRecursiveChange(e.target.checked)}
            className="h-3 w-3 rounded border-white/30 bg-transparent accent-emerald-400"
          />
          递归子目录
        </label>
        <button
          onClick={onExecute}
          disabled={listLoading}
          className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400/90 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-300 disabled:opacity-60"
        >
          <FolderSearch2 className="h-4 w-4" />
          {listLoading ? "扫描中..." : "执行 list_files"}
        </button>
        {listError && <p className="text-xs text-rose-300">{listError}</p>}
      </div>

      {/* 结果列表 */}
      <div className="mt-4 max-h-48 space-y-2 overflow-y-auto text-xs">
        {listResults.length === 0 && !listLoading ? (
          <p className="text-slate-500">
            结果将展示在这里，你也可以把这些数据写回聊天中。
          </p>
        ) : (
          listResults.map((entry) => (
            <div
              key={entry.path}
              className="rounded-2xl border border-white/5 bg-white/5 p-3"
            >
              <p className="truncate text-[13px] font-semibold text-white">
                {entry.path}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                <span className="rounded-full border border-white/10 px-2 py-0.5 uppercase tracking-wide">
                  {entry.file_type}
                </span>
                <span>{formatSize(entry.size)}</span>
                <span>{formatTime(entry.modified_ms)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

