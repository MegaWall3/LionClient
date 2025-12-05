import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import type { ChatMessage } from "../../types";
import { cn } from "../../utils";

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isError = message.status === "error";

  return (
    <div
      className={cn(
        "group flex gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors",
        isUser && "bg-blue-50/30"
      )}
    >
      {/* 头像 */}
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
          isUser
            ? "bg-blue-500 text-white"
            : "bg-gradient-to-br from-purple-500 to-pink-500 text-white"
        )}
      >
        {isUser ? "U" : "L"}
      </div>

      {/* 消息内容 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-gray-900">
            {isUser ? "You" : "Lion"}
          </span>
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
          className={cn(
            "text-sm text-gray-800 whitespace-pre-wrap break-words",
            isError && "text-red-600"
          )}
        >
          {message.content}
        </div>

        {/* 工具调用结果 */}
        {message.toolCallResults && message.toolCallResults.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.toolCallResults.map((result) => (
              <div
                key={result.toolCallId}
                className="bg-gray-50 rounded-lg p-3 border border-gray-200"
              >
                <div className="flex items-center gap-2 mb-2">
                  {result.status === "pending" && (
                    <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                  )}
                  {result.status === "success" && (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  )}
                  {result.status === "error" && (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                  <span className="text-xs font-medium text-gray-700">
                    执行工具调用: {result.toolName}
                  </span>
                  <span
                    className={cn(
                      "text-xs px-2 py-0.5 rounded-full",
                      result.status === "pending" &&
                        "bg-blue-100 text-blue-700",
                      result.status === "success" &&
                        "bg-green-100 text-green-700",
                      result.status === "error" && "bg-red-100 text-red-700"
                    )}
                  >
                    {result.status === "pending"
                      ? "执行中"
                      : result.status === "success"
                      ? "成功"
                      : "失败"}
                  </span>
                </div>

                {/* 参数 */}
                {typeof result.arguments === "object" && (
                  <div className="text-xs text-gray-600 mb-2">
                    <span className="font-medium">参数:</span>
                    <pre className="mt-1 bg-white p-2 rounded border border-gray-200 overflow-x-auto">
                      {JSON.stringify(result.arguments, null, 2)}
                    </pre>
                  </div>
                )}

                {/* 结果 */}
                {result.result && (
                  <div className="text-xs text-gray-600">
                    <span className="font-medium">结果:</span>
                    <pre className="mt-1 bg-white p-2 rounded border border-gray-200 overflow-x-auto max-h-40">
                      {typeof result.result === "string"
                        ? result.result
                        : JSON.stringify(result.result, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

