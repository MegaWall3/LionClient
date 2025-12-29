import { Send, Square } from "lucide-react";
import { useRef, useState } from "react";

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop: () => void;
  isThinking: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  onStop,
  isThinking,
  placeholder = "输入消息... (Shift+Enter 换行，Enter 发送)",
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动调整高度
  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    adjustHeight();
  };

  const handleSend = () => {
    if (!input.trim() || isThinking) return;
    onSend(input);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-gray-200 bg-white p-4">
      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 resize-none rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent max-h-32"
          rows={1}
          disabled={isThinking}
        />

        {isThinking ? (
          <button
            type="button"
            onClick={onStop}
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
            title="停止生成"
          >
            <Square className="w-5 h-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim()}
            className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
              input.trim()
                ? "bg-blue-500 text-white hover:bg-blue-600"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
            title="发送消息"
          >
            <Send className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}
