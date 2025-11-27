import { Minus, Square, X, Sparkles } from "lucide-react";
import { cn } from "../utils";

interface WindowControlsProps {
  isMaximized: boolean;
  onMinimize: () => void;
  onMaximizeToggle: () => void;
  onClose: () => void;
}

export function WindowControls({
  isMaximized,
  onMinimize,
  onMaximizeToggle,
  onClose,
}: WindowControlsProps) {
  // 阻止按钮点击事件冒泡到拖拽区域
  const handleMinimize = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log("[WindowControls] 最小化按钮被点击");
    onMinimize();
  };

  const handleMaximize = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log("[WindowControls] 最大化/还原按钮被点击");
    onMaximizeToggle();
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log("[WindowControls] 关闭按钮被点击");
    onClose();
  };

  return (
    <div
      data-tauri-drag-region
      className="flex items-center justify-between rounded-3xl border border-white/5 bg-white/5/30 px-5 py-3 text-sm text-slate-300 backdrop-blur-2xl shadow-[0_30px_90px_-70px_rgba(15,23,42,1)] flex-shrink-0"
    >
      {/* 左侧标题区域 - 可拖拽 */}
      <div className="flex items-center gap-3 text-white pointer-events-none">
        <div className="rounded-2xl bg-white/10 p-2">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-white/50">
            AI-PC-ELF
          </p>
          <p className="text-base font-semibold">桌面智能代理控制中心</p>
        </div>
      </div>
      
      {/* 右侧按钮区域 - 不可拖拽，移除 data-tauri-drag-region 属性 */}
      <div className="flex items-center gap-2">
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

