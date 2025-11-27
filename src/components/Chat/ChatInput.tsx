import { Send, TimerReset, ShieldCheck, TerminalSquare, Square } from "lucide-react";
import { cn } from "../../utils";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  isThinking: boolean;
  disabled?: boolean;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  isThinking,
  disabled,
}: ChatInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && !isThinking && value.trim()) {
        onSend();
      }
    }
  };

  return (
    <div className="border-t border-white/5 p-6">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-inner">
        <div className="flex flex-wrap gap-2 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-1">
            <ShieldCheck className="h-3 w-3" />
            沙箱模式
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-1">
            <TerminalSquare className="h-3 w-3" />
            工具就绪
          </span>
        </div>
        <div className="mt-4 flex gap-3">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的指令..."
            disabled={disabled || isThinking}
            rows={3}
            className={cn(
              "flex-1 resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/20",
              (disabled || isThinking) && "opacity-50 cursor-not-allowed"
            )}
          />
          {isThinking ? (
            <button
              onClick={onStop}
              className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500 text-white shadow-lg shadow-rose-500/30 transition hover:bg-rose-400 hover:shadow-rose-400/40"
              title="停止生成"
            >
              <Square className="h-5 w-5 fill-current" />
            </button>
          ) : (
            <button
              onClick={onSend}
              disabled={disabled || !value.trim()}
              className={cn(
                "inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:shadow-emerald-400/40 disabled:opacity-50 disabled:cursor-not-allowed"
              )}
              title="发送消息"
            >
              <Send className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

