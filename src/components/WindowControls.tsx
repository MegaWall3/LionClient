import { Minus, Sparkles, Square, X } from "lucide-react";
import { cn } from "../utils";

type WindowControlHandler = () => void | Promise<void>;

interface WindowControlsProps {
  isMaximized: boolean;
  onMinimize: WindowControlHandler;
  onMaximizeToggle: WindowControlHandler;
  onClose: WindowControlHandler;
}

export function WindowControls({
  isMaximized,
  onMinimize,
  onMaximizeToggle,
  onClose,
}: WindowControlsProps) {
  const handleMinimize = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    void onMinimize();
  };

  const handleMaximize = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    void onMaximizeToggle();
  };

  const handleClose = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    void onClose();
  };

  return (
    <div
      data-tauri-drag-region
      className="flex items-center justify-between rounded-3xl border border-white/5 bg-white/5/30 px-5 py-3 text-sm text-slate-300 backdrop-blur-2xl shadow-[0_30px_90px_-70px_rgba(15,23,42,1)] flex-shrink-0 select-none"
    >
      {/* 左侧标题区域 - 可拖动 */}
      <div className="flex items-center gap-3 text-white cursor-move">
        <div className="rounded-2xl bg-white/10 p-2">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-white/50">Lion</p>
          <p className="text-base font-semibold">桌面智能代理控制中心</p>
        </div>
      </div>

      {/* 右侧按钮区域 - 禁止拖动 */}
      <div data-tauri-drag-region="false" className="flex items-center gap-2 cursor-default">
        <button
          onClick={handleMinimize}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-white/70 transition hover:border-white/30 hover:text-white cursor-pointer"
          title="最小化"
          type="button"
        >
          <Minus className="h-3.5 w-3.5 pointer-events-none" />
        </button>
        <button
          onClick={handleMaximize}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-white/70 transition hover:border-white/30 hover:text-white cursor-pointer"
          title={isMaximized ? "还原" : "最大化"}
          type="button"
        >
          <Square
            className={cn("h-3.5 w-3.5 pointer-events-none", isMaximized ? "scale-90" : undefined)}
          />
        </button>
        <button
          onClick={handleClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-white/70 transition hover:border-white/30 hover:text-white hover:bg-rose-500/20 cursor-pointer"
          title="关闭"
          type="button"
        >
          <X className="h-3.5 w-3.5 pointer-events-none" />
        </button>
      </div>
    </div>
  );
}
