import type { ChatMessage } from "../../types";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";

interface ChatContainerProps {
  messages: ChatMessage[];
  isThinking: boolean;
  onSendMessage: (message: string) => void;
  onStopGeneration: () => void;
}

export function ChatContainer({
  messages,
  isThinking,
  onSendMessage,
  onStopGeneration,
}: ChatContainerProps) {
  return (
    <div className="flex flex-col h-full">
      <MessageList messages={messages} isThinking={isThinking} />
      <ChatInput
        onSend={onSendMessage}
        onStop={onStopGeneration}
        isThinking={isThinking}
      />
    </div>
  );
}
