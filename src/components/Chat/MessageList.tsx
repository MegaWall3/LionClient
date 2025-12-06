import { Bot, User } from "lucide-react";
import type { RefObject } from "react";
import ReactMarkdown from "react-markdown";
import type { ChatMessage } from "../../types";

interface MessageListProps {
  messages: ChatMessage[];
  isThinking: boolean;
  messagesEndRef?: RefObject<HTMLDivElement | null>;
}

export function MessageList({ messages, isThinking, messagesEndRef }: MessageListProps) {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex gap-4 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
        >
          {msg.role === "assistant" && (
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
          )}
          <div
            className={`max-w-[70%] rounded-2xl px-4 py-3 ${
              msg.role === "user"
                ? "bg-gradient-to-br from-emerald-500 to-cyan-500 text-white"
                : "bg-white/10 text-slate-100"
            }`}
          >
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
            {msg.toolCallResults && msg.toolCallResults.length > 0 && (
              <div className="mt-3 space-y-2">
                {msg.toolCallResults.map((result) => (
                  <div
                    key={result.toolCallId}
                    className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-emerald-300">{result.toolName}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] ${
                          result.status === "success"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : result.status === "error"
                              ? "bg-rose-500/20 text-rose-300"
                              : "bg-amber-500/20 text-amber-300"
                        }`}
                      >
                        {result.status}
                      </span>
                    </div>
                    {result.result !== null && result.result !== undefined && (
                      <pre className="text-[11px] text-slate-400 whitespace-pre-wrap break-all">
                        {typeof result.result === "string"
                          ? result.result
                          : JSON.stringify(result.result, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 text-[10px] text-slate-400">{msg.timestamp}</div>
          </div>
          {msg.role === "user" && (
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
          )}
        </div>
      ))}
      {isThinking && (
        <div className="flex gap-4 justify-start">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div className="max-w-[70%] rounded-2xl px-4 py-3 bg-white/10 text-slate-100">
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" />
              <div
                className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce"
                style={{ animationDelay: "0.1s" }}
              />
              <div
                className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce"
                style={{ animationDelay: "0.2s" }}
              />
            </div>
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
