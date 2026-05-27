import { Bot, ChevronDown, ChevronRight, TerminalSquare } from "lucide-react";
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
  const [isExpanded, setIsExpanded] = useState(false);
  const resultStr =
    typeof toolCall.result === "string"
      ? toolCall.result
      : JSON.stringify(toolCall.result, null, 2);
  const invocation = formatToolInvocation(toolCall);

  return (
    <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 text-left text-xs text-slate-300 hover:text-slate-100"
      >
        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <TerminalSquare className="h-3 w-3 text-cyan-300/80" />
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            toolCall.status === "success"
              ? "bg-emerald-300"
              : toolCall.status === "error"
                ? "bg-rose-300"
                : "bg-amber-300 animate-pulse"
          }`}
        />
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-300">
          {invocation}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] ${
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
        <div className="mt-2 border-t border-white/10 pt-2">
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-300">
            {toolCall.result === null || toolCall.result === undefined ? "等待结果..." : resultStr}
          </pre>
        </div>
      )}
    </div>
  );
}

function formatToolInvocation(toolCall: NonNullable<ChatMessageType["toolCallResults"]>[0]) {
  const args = toolCall.arguments;
  if (typeof args === "string") {
    return `${toolCall.toolName} ${args}`.trim();
  }

  if (args && typeof args === "object" && "command" in args && typeof args.command === "string") {
    return `$ ${args.command}`;
  }

  if (!args || typeof args !== "object" || Object.keys(args).length === 0) {
    return toolCall.toolName;
  }

  return `${toolCall.toolName} ${JSON.stringify(args)}`;
}

export function ChatMessage({ message }: ChatMessageProps) {
  // 不显示 tool 角色的消息
  if (message.role === "tool") {
    return null;
  }

  const hasContent = message.content.trim().length > 0;
  const hasToolResults = !!message.toolCallResults && message.toolCallResults.length > 0;
  if (message.role === "assistant" && !hasContent && !hasToolResults && !message.status) {
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
        {hasContent && <p className="whitespace-pre-wrap break-words">{message.content}</p>}

        {/* 显示工具调用结果 */}
        {message.role === "assistant" && hasToolResults && (
          <div className="mt-3 space-y-2">
            {message.toolCallResults?.map((toolCall) => (
              <ToolCallResult key={toolCall.toolCallId} toolCall={toolCall} />
            ))}
          </div>
        )}
      </div>
      {message.status === "error" && <div className="mt-2 text-xs text-rose-400">错误</div>}
    </article>
  );
}
