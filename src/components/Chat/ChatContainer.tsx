import { TimerReset } from "lucide-react";
import { ChatMessage } from "./ChatMessage";
import type { ChatMessage as ChatMessageType } from "../../types";

interface ChatContainerProps {
  messages: ChatMessageType[];
  isThinking: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function ChatContainer({
  messages,
  isThinking,
  messagesEndRef,
}: ChatContainerProps) {
  return (
    <div
      className="flex-1 space-y-4 overflow-y-auto px-6 py-6 custom-scrollbar"
    >
      {messages.map((msg) => (
        <ChatMessage key={msg.id} message={msg} />
      ))}
      {isThinking && (
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <TimerReset className="h-4 w-4 animate-spin" />
          正在思考下一步计划…
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}

