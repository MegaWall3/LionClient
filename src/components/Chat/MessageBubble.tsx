import { XCircle } from "lucide-react";
import type { ChatMessage } from "../../types";
import { ToolCallResultItem } from "./ToolCallResult";

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isError = message.status === "error";

  return (
    <div
      className={`group flex gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors ${isUser ? "bg-blue-50/30" : ""}`}
    >
      {/* 头像 */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
          isUser
            ? "bg-blue-500 text-white"
            : "bg-gradient-to-br from-purple-500 to-pink-500 text-white"
        }`}
      >
        {isUser ? "U" : "L"}
      </div>

      {/* 消息内容 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-gray-900">{isUser ? "You" : "Lion"}</span>
          <span className="text-xs text-gray-500">{message.timestamp}</span>
          {isError && (
            <span className="text-xs text-red-500 flex items-center gap-1">
              <XCircle className="w-3 h-3" />
              错误
            </span>
          )}
        </div>

        {/* 消息文本 */}
        <div
          className={`text-sm text-gray-800 whitespace-pre-wrap break-words ${isError ? "text-red-600" : ""}`}
        >
          {message.content}
        </div>

        {/* 工具调用结果 */}
        {message.toolCallResults && message.toolCallResults.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.toolCallResults.map((result) => (
              <ToolCallResultItem key={result.toolCallId} result={result} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
