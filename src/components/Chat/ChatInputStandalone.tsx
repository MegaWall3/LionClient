import { Send, Square } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

interface ChatInputStandaloneProps {
  value: string;
  onChange: Dispatch<SetStateAction<string>>;
  onSend: () => void;
  onStop: () => void;
  isThinking: boolean;
}

export function ChatInputStandalone({
  value,
  onChange,
  onSend,
  onStop,
  isThinking,
}: ChatInputStandaloneProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isThinking && value.trim()) {
        onSend();
      }
    }
  };

  return (
    <div className="border-t border-white/5 px-6 py-4">
      <div className="flex gap-3 items-end">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入你的指令..."
          rows={3}
          disabled={isThinking}
          className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50 disabled:opacity-50 resize-none"
        />
        {isThinking ? (
          <button
            type="button"
            onClick={onStop}
            className="flex-shrink-0 rounded-2xl bg-rose-500/90 p-3 text-white transition hover:bg-rose-500"
            title="停止生成"
          >
            <Square className="h-5 w-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={!value.trim()}
            className="flex-shrink-0 rounded-2xl bg-emerald-500/90 p-3 text-white transition hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
            title="发送"
          >
            <Send className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}
