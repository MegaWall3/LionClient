import { Bot, ChevronDown, ChevronRight, Hourglass, TerminalSquare } from "lucide-react";
import { useState } from "react";
import type { ChatMessage as ChatMessageType } from "../../types";

interface ChatMessageProps {
  message: ChatMessageType;
}

function ToolCallResult({
  toolCall,
}: {
  toolCall: NonNullable<ChatMessageType["toolCallResults"]>[0];
}) {
  const [isExpanded, setIsExpanded] = useState(toolCall.status === "pending");
  const resultStr =
    typeof toolCall.result === "string"
      ? toolCall.result
      : JSON.stringify(toolCall.result, null, 2);

  return (
    <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 text-left text-xs text-cyan-200 hover:text-cyan-100"
      >
        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <TerminalSquare className="h-3 w-3" />
        <span className="font-medium">执行工具调用: {toolCall.toolName}</span>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[10px] ${
            toolCall.status === "success"
              ? "bg-emerald-500/20 text-emerald-300"
              : toolCall.status === "error"
                ? "bg-rose-500/20 text-rose-300"
                : "bg-amber-500/20 text-amber-300"
          }`}
        >
          {toolCall.status === "success" ? "成功" : toolCall.status === "error" ? "错误" : "执行中"}
        </span>
      </button>
      {isExpanded && (
        <div className="mt-2 rounded-lg bg-black/20 p-3">
          <div className="mb-2 text-xs text-slate-400">参数:</div>
          <pre className="mb-3 max-h-32 overflow-auto rounded bg-black/30 p-2 text-[10px] text-slate-300">
            {JSON.stringify(toolCall.arguments, null, 2)}
          </pre>
          <div className="mb-2 text-xs text-slate-400">结果:</div>
          <pre className="max-h-64 overflow-auto rounded bg-black/30 p-2 text-[10px] text-slate-300">
            {resultStr}
          </pre>
        </div>
      )}
    </div>
  );
}

export function ChatMessage({ message }: ChatMessageProps) {
  // 不显示 tool 角色的消息
  if (message.role === "tool") {
    return null;
  }

  return (
    <article
      className={`max-w-3xl rounded-3xl border px-5 py-4 shadow-sm transition ${
        message.role === "user"
          ? "ml-auto border-emerald-500/10 bg-emerald-500/5 text-emerald-50"
          : "border-white/5 bg-white/5 text-slate-100"
      }`}
    >
      <div className="mb-2 flex items-center gap-3 text-xs uppercase tracking-wide">
        {message.role === "user" && (
          <>
            <span className="text-emerald-300">User</span>
            <span className="text-white/40">/ {message.timestamp}</span>
          </>
        )}
        {message.role === "assistant" && (
          <>
            <Bot className="h-4 w-4 text-white/60" />
            <span className="text-white/70">Lion</span>
          </>
        )}
      </div>
      <div className="prose prose-invert max-w-none text-sm">
        <p className="whitespace-pre-wrap break-words">
          {message.content || "正在思考下一步计划…"}
        </p>

        {message.role === "assistant" &&
          message.toolCallResults?.some((toolCall) => toolCall.status === "pending") && (
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
              <Hourglass className="h-3 w-3 animate-pulse" />
              正在执行{" "}
              {message.toolCallResults
                .filter((toolCall) => toolCall.status === "pending")
                .map((toolCall) => toolCall.toolName)
                .join("，")}
              …
            </div>
          )}

        {/* 显示工具调用结果 */}
        {message.role === "assistant" &&
          message.toolCallResults &&
          message.toolCallResults.length > 0 && (
            <div className="mt-3 space-y-2">
              {message.toolCallResults.map((toolCall) => (
                <ToolCallResult key={toolCall.toolCallId} toolCall={toolCall} />
              ))}
            </div>
          )}
      </div>
      {message.status === "error" && <div className="mt-2 text-xs text-rose-400">错误</div>}
    </article>
  );
}
