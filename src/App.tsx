import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  Activity,
  ArrowUpRight,
  Download,
  FolderSearch2,
  MessageSquare,
  Plus,
  Settings2,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  TimerReset,
} from "lucide-react";
import type { ChatMessage, ToolTrace, FileEntry } from "./types";
import { cn, formatSize, formatTime, formatTimestamp } from "./utils";
import { useWindowControls, useAutoScroll } from "./hooks";
import { WindowControls, ChatContainer, ChatInput } from "./components";

function normalizeToolArgumentString(raw: string): string {
  return raw
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();
}

function parseToolArguments(raw: string): Record<string, any> {
  let current = normalizeToolArgumentString(raw);

  for (let depth = 0; depth < 5; depth += 1) {
    try {
      const parsed = JSON.parse(current);
      if (typeof parsed === "string") {
        current = normalizeToolArgumentString(parsed);
        continue;
      }

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, any>;
      }

      throw new Error("工具参数必须是对象");
    } catch (error) {
      throw new Error(
        `工具参数解析失败: ${(error as Error).message ?? "格式不正确"}`
      );
    }
  }

  throw new Error("工具参数解析失败: 嵌套层级过深");
}

function getToolArgumentsPreview(
  raw: string
): Record<string, any> | string {
  try {
    return parseToolArguments(raw);
  } catch {
    return normalizeToolArgumentString(raw);
  }
}

// 初始消息：只包含一条欢迎消息
const initialMessages: ChatMessage[] = [
  {
    id: "m1",
    role: "assistant",
    content:
      "你好！我是 Lion，你的桌面智能代理助手。我可以帮你完成各种电脑任务，比如搜索文件、管理文件、执行命令等。有什么需要帮助的吗？",
    timestamp: formatTimestamp(),
  },
];

// 初始工具轨迹：空数组，不显示预置数据
const initialTrace: ToolTrace[] = [];

const quickActions = [
  "扫描 Downloads 并按大小排序",
  "批量重命名截图为 2025-11-*.png",
  "拉取 Git 仓库并生成变更摘要",
];

const availableTools = [
  { icon: FolderSearch2, label: "索引/搜索", accent: "from-cyan-400/80" },
  { icon: Download, label: "下载/同步", accent: "from-emerald-400/80" },
  { icon: TerminalSquare, label: "Shell 宏", accent: "from-blue-400/80" },
  { icon: ShieldCheck, label: "沙箱审计", accent: "from-pink-400/80" },
];

const statusBadges: Record<ToolTrace["status"], string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-amber-500/10 text-amber-400",
  done: "bg-emerald-500/10 text-emerald-400",
  error: "bg-rose-500/10 text-rose-400",
};

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [toolTrace] = useState<ToolTrace[]>(initialTrace);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [activeUnlisteners, setActiveUnlisteners] = useState<Map<string, UnlistenFn[]>>(new Map());
  const { isMaximized, minimize, maximizeToggle, close } = useWindowControls();
  const messagesEndRef = useAutoScroll(messages, isThinking);
  const [listPath, setListPath] = useState("D:\\\\Workspace");
  const [listPattern, setListPattern] = useState("");
  const [listRecursive, setListRecursive] = useState(false);
  const [listResults, setListResults] = useState<FileEntry[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const composedMessages = useMemo(
    () =>
      messages
        .filter((msg) => msg.role === "user" || msg.role === "assistant")
        .map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        })),
    [messages],
  );

  // 停止当前流式输出
  function handleStop() {
    // 清理所有活动的监听器
    activeUnlisteners.forEach((unlisteners) => {
      unlisteners.forEach((unlisten) => unlisten());
    });
    setActiveUnlisteners(new Map());
    setIsThinking(false);
    
    // 更新最后一条 assistant 消息，标记为已停止
    setMessages((prev) => {
      const lastAssistant = [...prev].reverse().find((msg) => msg.role === "assistant");
      if (lastAssistant && !lastAssistant.content.trim()) {
        return prev.map((msg) =>
          msg.id === lastAssistant.id
            ? { ...msg, content: "[已停止]", status: "error" as const }
            : msg
        );
      }
      return prev;
    });
  }

  async function handleSend() {
    if (!input.trim()) return;
    
    // 定义类型（在函数顶部，确保所有地方都能访问）
    type ChunkEvent = { message_id: string; content: string; full_content: string };
    type ToolCallsEvent = {
      message_id: string;
      tool_calls: Array<{
        id: string;
        type: string;
        function: { name: string; arguments: string };
      }>;
      content: string;
    };
    
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      timestamp: formatTimestamp(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsThinking(true);

    // 创建 assistant 消息用于流式更新
    const assistantMsgId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: formatTimestamp(),
    };
    setMessages((prev) => [...prev, assistantMsg]);

    // 在 try 块外声明变量，以便在 catch 块中也能访问
    let unlistenChunk: UnlistenFn | undefined;
    let unlistenToolCalls: UnlistenFn | undefined;
    let unlistenDone: UnlistenFn | undefined;
    let messagesToSend: Array<{ role: "user" | "assistant" | "system" | "tool"; content: string; tool_calls?: any; tool_call_id?: string }>;

    try {
      // 构建消息列表，确保格式正确
      messagesToSend = [
        ...composedMessages,
        { role: "user" as const, content: userMsg.content },
      ];
      
      // 监听流式数据
      unlistenChunk = await listen<ChunkEvent>(
        "llm-stream-chunk",
        (event) => {
          if (event.payload.message_id === assistantMsgId) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId
                  ? { ...msg, content: event.payload.full_content }
                  : msg
              )
            );
          }
        }
      );

      // 监听 tool_calls 事件
      unlistenToolCalls = await listen<ToolCallsEvent>("llm-stream-tool-calls", async (event) => {
        if (event.payload.message_id === assistantMsgId) {
          // 取消之前的监听器，避免冲突
          if (unlistenChunk) unlistenChunk();
          if (unlistenToolCalls) unlistenToolCalls();
          const toolCalls = event.payload.tool_calls;
          console.log("[前端] 收到 tool_calls: ", toolCalls);

          // 先更新 assistant 消息，显示正在执行工具调用
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? {
                    ...msg,
                    content: "正在思考下一步计划…",
                    tool_calls: toolCalls.map((tc) => ({
                      id: tc.id,
                      type: tc.type,
                      function: {
                        name: tc.function.name,
                        arguments: tc.function.arguments,
                      },
                    })),
                    toolCallResults: toolCalls.map((tc) => ({
                      toolCallId: tc.id,
                      toolName: tc.function.name,
                      arguments: getToolArgumentsPreview(
                        tc.function.arguments
                      ),
                      result: null,
                      status: "pending" as const,
                    })),
                  }
                : msg
            )
          );

          for (const toolCall of toolCalls) {
            const functionName = toolCall.function.name;
            let functionArgs: Record<string, any>;
            try {
              functionArgs = parseToolArguments(
                toolCall.function.arguments
              );
            } catch (error) {
              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.id === assistantMsgId && msg.toolCallResults) {
                    return {
                      ...msg,
                      toolCallResults: msg.toolCallResults.map((result) =>
                        result.toolCallId === toolCall.id
                          ? {
                              ...result,
                              result:
                                (error as Error).message ??
                                "工具参数解析失败",
                              status: "error" as const,
                            }
                          : result
                      ),
                    };
                  }
                  return msg;
                })
              );
              continue;
            }

            try {
              let toolResult: any;
              let toolStatus: ChatMessage["status"] = "success";

              // 执行工具调用
              if (functionName === "list_files") {
                toolResult = await invoke<FileEntry[]>("list_files", {
                  options: functionArgs,
                });
              } else if (functionName === "read_file") {
                toolResult = await invoke<string>("read_file", {
                  options: functionArgs,
                });
              } else if (functionName === "search_in_files") {
                toolResult = await invoke<any[]>("search_in_files", {
                  options: functionArgs,
                });
              } else if (functionName === "delete_file") {
                toolResult = await invoke<string>("delete_file", {
                  options: functionArgs,
                });
              } else if (functionName === "rename_file") {
                toolResult = await invoke<string>("rename_file", {
                  options: functionArgs,
                });
              } else if (functionName === "copy_file") {
                toolResult = await invoke<string>("copy_file", {
                  options: functionArgs,
                });
              } else if (functionName === "write_file") {
                toolResult = await invoke<string>("write_file", {
                  options: functionArgs,
                });
              } else if (functionName === "append_to_file") {
                toolResult = await invoke<string>("append_to_file", {
                  options: functionArgs,
                });
              } else if (functionName === "replace_in_file") {
                toolResult = await invoke<string>("replace_in_file", {
                  options: functionArgs,
                });
              } else if (functionName === "download_file") {
                try {
                  toolResult = await invoke<string>("download_file", {
                    options: functionArgs,
                  });
                } catch (error) {
                  toolResult = `下载失败: ${error}`;
                  toolStatus = "error";
                }
              } else if (functionName === "fetch_webpage") {
                toolResult = await invoke<any>("fetch_webpage", {
                  options: functionArgs,
                });
              } else if (functionName === "run_command") {
                toolResult = await invoke<any>("run_command", {
                  options: functionArgs,
                });
              } else {
                toolResult = `未知工具: ${functionName}`;
                toolStatus = "error";
              }

              // 更新 assistant 消息，添加 tool_calls 和工具调用结果
              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.id === assistantMsgId) {
                    const existingResults = msg.toolCallResults || [];
                    const resultIndex = existingResults.findIndex(
                      (r) => r.toolCallId === toolCall.id
                    );
                    const newResult = {
                      toolCallId: toolCall.id,
                      toolName: functionName,
                      arguments: functionArgs,
                      result: toolResult,
                      status: toolStatus as "pending" | "success" | "error",
                    };
                    const updatedResults =
                      resultIndex >= 0
                        ? existingResults.map((result, index) =>
                            index === resultIndex ? newResult : result
                          )
                        : [...existingResults, newResult];

                    return {
                      ...msg,
                      content:
                        event.payload.content || "正在思考下一步计划…",
                      tool_calls: toolCalls.map((tc) => ({
                        id: tc.id,
                        type: tc.type,
                        function: {
                          name: tc.function.name,
                          arguments: tc.function.arguments,
                        },
                      })),
                      toolCallResults: updatedResults,
                    };
                  }
                  return msg;
                })
              );

              // 继续对话，将 tool 结果发送给 LLM
              const continueMessages = [
                ...composedMessages,
                { role: "user" as const, content: userMsg.content },
                {
                  role: "assistant" as const,
                  content: event.payload.content,
                  tool_calls: toolCalls.map((tc) => ({
                    id: tc.id,
                    type: tc.type,
                    function: {
                      name: tc.function.name,
                      arguments: tc.function.arguments,
                    },
                  })),
                },
                {
                  role: "tool" as const,
                  content: JSON.stringify(toolResult),
                  tool_call_id: toolCall.id,
                },
              ];

              // 创建新的 assistant 消息用于接收继续对话的流式输出
              const continueMsgId = crypto.randomUUID();
              const continueAssistantMsg: ChatMessage = {
                id: continueMsgId,
                role: "assistant",
                content: "",
                timestamp: formatTimestamp(),
              };
              setMessages((prev) => [...prev, continueAssistantMsg]);

              // 为继续对话设置监听器
              const unlistenContinueChunk = await listen<ChunkEvent>("llm-stream-chunk", (chunkEvent) => {
                if (chunkEvent.payload.message_id === continueMsgId) {
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === continueMsgId
                        ? {
                            ...msg,
                            content: chunkEvent.payload.full_content,
                          }
                        : msg
                    )
                  );
                }
              });

              // 保存继续对话的监听器
              setActiveUnlisteners((prev) => {
                const next = new Map(prev);
                const existing = next.get(continueMsgId) || [];
                next.set(continueMsgId, [...existing, unlistenContinueChunk]);
                return next;
              });

              const unlistenContinueToolCalls = await listen<ToolCallsEvent>("llm-stream-tool-calls", async (toolEvent) => {
                if (toolEvent.payload.message_id === continueMsgId) {
                  // 递归处理 tool_calls（支持多轮 toolcall）
                  const continueToolCalls = toolEvent.payload.tool_calls;
                  console.log("[前端] 继续对话收到 tool_calls: ", continueToolCalls);

                  for (const continueToolCall of continueToolCalls) {
                    const continueFunctionName = continueToolCall.function.name;
                    const continueFunctionArgs = parseToolArguments(
                      continueToolCall.function.arguments
                    );

                    if (continueFunctionName === "list_files") {
                      const continueToolResult = await invoke<FileEntry[]>(
                        "list_files",
                        {
                          options: continueFunctionArgs,
                        }
                      );

                      // 更新 continueMsgId 的 assistant 消息，添加工具调用结果
                      setMessages((prev) =>
                        prev.map((msg) => {
                          if (msg.id === continueMsgId) {
                            const existingResults = msg.toolCallResults || [];
                            const newResult = {
                              toolCallId: continueToolCall.id,
                              toolName: continueFunctionName,
                              arguments: continueFunctionArgs,
                              result: continueToolResult,
                              status: "success" as const,
                            };
                            return {
                              ...msg,
                              toolCallResults: [...existingResults, newResult],
                            };
                          }
                          return msg;
                        })
                      );

                      // 继续下一轮对话
                      const nextMessages = [
                        ...continueMessages,
                        {
                          role: "assistant" as const,
                          content: toolEvent.payload.content,
                          tool_calls: continueToolCalls.map((tc) => ({
                            id: tc.id,
                            type: tc.type,
                            function: {
                              name: tc.function.name,
                              arguments: tc.function.arguments,
                            },
                          })),
                        },
                        {
                          role: "tool" as const,
                          content: JSON.stringify(continueToolResult),
                          tool_call_id: continueToolCall.id,
                        },
                      ];

                      const nextMsgId = crypto.randomUUID();
                      const nextAssistantMsg: ChatMessage = {
                        id: nextMsgId,
                        role: "assistant",
                        content: "",
                        timestamp: formatTimestamp(),
                      };
                      setMessages((prev) => [...prev, nextAssistantMsg]);

                      // 设置下一轮的监听器（简化处理，只支持一轮递归）
                      const unlistenNextChunk = await listen<ChunkEvent>("llm-stream-chunk", (nextChunkEvent) => {
                        if (nextChunkEvent.payload.message_id === nextMsgId) {
                          setMessages((prev) =>
                            prev.map((msg) =>
                              msg.id === nextMsgId
                                ? {
                                    ...msg,
                                    content: nextChunkEvent.payload.full_content,
                                  }
                                : msg
                            )
                          );
                        }
                      });

                      const unlistenNextDone = await listen<string>(
                        "llm-stream-done",
                        (nextDoneEvent) => {
                          if (nextDoneEvent.payload === nextMsgId) {
                            setIsThinking(false);
                            unlistenNextChunk();
                            unlistenNextDone();
                            // 从活动监听器列表中移除
                            setActiveUnlisteners((prev) => {
                              const next = new Map(prev);
                              next.delete(nextMsgId);
                              return next;
                            });
                          }
                        }
                      );

                      // 保存下一轮对话的监听器
                      setActiveUnlisteners((prev) => {
                        const next = new Map(prev);
                        next.set(nextMsgId, [unlistenNextChunk, unlistenNextDone]);
                        return next;
                      });

                      await invoke("call_llm_stream", {
                        messages: nextMessages,
                        messageId: nextMsgId,
                        model: "Qwen/Qwen2.5-72B-Instruct",
                      });
                    }
                  }
                }
              });

              const unlistenContinueDone = await listen<string>(
                "llm-stream-done",
                (continueDoneEvent) => {
                  if (continueDoneEvent.payload === continueMsgId) {
                    setIsThinking(false);
                    unlistenContinueChunk();
                    unlistenContinueToolCalls();
                    unlistenContinueDone();
                    // 从活动监听器列表中移除
                    setActiveUnlisteners((prev) => {
                      const next = new Map(prev);
                      next.delete(continueMsgId);
                      return next;
                    });
                  }
                }
              );

              // 更新继续对话的监听器列表
              setActiveUnlisteners((prev) => {
                const next = new Map(prev);
                const existing = next.get(continueMsgId) || [];
                next.set(continueMsgId, [...existing, unlistenContinueToolCalls, unlistenContinueDone]);
                return next;
              });

              // 继续调用 LLM
              await invoke("call_llm_stream", {
                messages: continueMessages,
                messageId: continueMsgId,
                model: "Qwen/Qwen2.5-72B-Instruct",
              });
            } catch (error) {
              console.error("[ToolCall Error]", error);
            }
          }
        }
      });

      unlistenDone = await listen<string>("llm-stream-done", (event) => {
        if (event.payload === assistantMsgId) {
          setIsThinking(false);
          if (unlistenChunk) unlistenChunk();
          if (unlistenToolCalls) unlistenToolCalls();
          if (unlistenDone) unlistenDone();
          // 从活动监听器列表中移除
          setActiveUnlisteners((prev) => {
            const next = new Map(prev);
            next.delete(assistantMsgId);
            return next;
          });
        }
      });

      // 保存监听器到活动列表
      const unlisteners = [unlistenChunk, unlistenToolCalls, unlistenDone].filter(
        (u): u is UnlistenFn => u !== undefined
      );
      setActiveUnlisteners((prev) => {
        const next = new Map(prev);
        next.set(assistantMsgId, unlisteners);
        return next;
      });

      // 调用流式命令
      await invoke("call_llm_stream", {
        messages: messagesToSend,
        messageId: assistantMsgId,
        model: "Qwen/Qwen2.5-72B-Instruct",
      });
    } catch (error) {
      // 详细错误信息输出到控制台（开发调试用）
      const errorDetails = (error as { message?: string })?.message ?? String(error);
      console.error("[LLM Error] 详细错误信息:", {
        error,
        message: errorDetails,
        stack: (error as Error)?.stack,
      });

      // 更新 assistant 消息为错误状态
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? {
                ...msg,
                content:
                  "无法连接到 LLM 服务，请检查网络或 API Key 配置。你也可以先让我执行本地的工具操作。",
                status: "error",
              }
            : msg
        )
      );
      setIsThinking(false);
    }
  }


  async function handleListFiles() {
    if (!listPath.trim()) {
      setListError("请输入需要扫描的目录路径");
      return;
    }

    setListLoading(true);
    setListError(null);
    try {
      const data = await invoke<FileEntry[]>("list_files", {
        options: {
          path: listPath.trim(),
          recursive: listRecursive,
          pattern: listPattern.trim() || undefined,
          limit: 200,
        },
      });
      setListResults(data);
    } catch (error) {
      const message =
        (error as { message?: string })?.message ??
        "无法列出文件，请检查路径或权限。";
      setListError(message);
    } finally {
      setListLoading(false);
    }
  }


  return (
    <div className="h-screen bg-slate-950 text-slate-100 overflow-hidden flex flex-col">
      <div className="flex-1 flex flex-col gap-3 p-3 sm:gap-4 sm:p-4 min-h-0">
        <WindowControls
          isMaximized={isMaximized}
          onMinimize={minimize}
          onMaximizeToggle={maximizeToggle}
          onClose={close}
        />

        <div className="grid flex-1 min-h-0 gap-4 lg:grid-cols-[280px_1fr] xl:grid-cols-[320px_1fr]">
          <aside className="hidden lg:flex flex-col overflow-y-auto rounded-3xl border border-white/5 bg-white/5/30 p-4 xl:p-5 backdrop-blur-2xl shadow-[0_20px_90px_-60px_rgba(15,23,42,1)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Lion
              </p>
              <p className="text-lg font-semibold">桌面 Agent</p>
            </div>
            <button
              onClick={() => {
                setMessages(initialMessages);
                setActiveUnlisteners(new Map());
                setIsThinking(false);
              }}
              className="rounded-full bg-white/10 p-2 text-xs font-medium text-white/80 hover:bg-white/20 transition"
              title="新建对话"
            >
              New
            </button>
          </div>

          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-white/10 to-transparent p-4">
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <Sparkles className="h-4 w-4 text-emerald-300" />
                <span>当前状态：准备就绪</span>
              </div>
              <p className="mt-3 text-xs text-slate-400">
                已接入系统工具与沙箱，你可以直接下达命令。
              </p>
              <button className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white/90 px-3 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-emerald-500/20 transition hover:bg-white">
                <Plus className="h-4 w-4" />
                新建任务流程
              </button>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">
                快速提示
              </p>
              <div className="mt-3 space-y-2">
                {quickActions.map((action) => (
                  <button
                    key={action}
                    className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-left text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/10"
                  >
                    {action}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">
                可用工具
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {availableTools.map((tool) => (
                  <button
                    key={tool.label}
                    className="group rounded-2xl border border-white/5 bg-slate-900/40 p-4 text-left text-sm text-slate-200 transition hover:border-white/20 hover:bg-slate-900/70"
                  >
                    <tool.icon className="mb-3 h-5 w-5 text-white/80" />
                    <span>{tool.label}</span>
                    <div
                      className={cn(
                        "mt-3 h-1 w-full rounded-full bg-gradient-to-r to-transparent",
                        tool.accent,
                      )}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <section className="flex min-h-0 flex-col rounded-3xl border border-white/5 bg-white/5/20 backdrop-blur-2xl shadow-[0_20px_120px_-80px_rgba(15,23,42,1)]">
          <header className="flex flex-col border-b border-white/5 px-6 py-4 text-sm text-slate-300 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3 text-base text-white">
              <div className="rounded-full bg-white/10 p-2">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm uppercase tracking-wide text-slate-400">
                  当前会话
                </p>
                <p className="text-lg font-semibold">Workspace 调度 · #1027</p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3 text-xs text-slate-400 md:mt-0">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1">
                <Activity className="h-3 w-3 text-emerald-300" />
                Live
              </span>
              <button className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-white/80 hover:border-white/40">
                <Settings2 className="h-3 w-3" />
                控制面板
              </button>
            </div>
          </header>

          <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
            <div className="flex flex-1 min-h-0 flex-col">
              <ChatContainer
                messages={messages}
                isThinking={isThinking}
                messagesEndRef={messagesEndRef}
              />

              <ChatInput
                value={input}
                onChange={setInput}
                onSend={() => void handleSend()}
                onStop={handleStop}
                isThinking={isThinking}
              />
              <div className="px-6 pb-6 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-3">
                  <button className="inline-flex items-center gap-1 rounded-full border border-white/5 px-3 py-1 hover:border-white/30 hover:text-white/80">
                    <Plus className="h-3 w-3" />
                    附加文件
                  </button>
                  <button className="inline-flex items-center gap-1 rounded-full border border-white/5 px-3 py-1 hover:border-white/30 hover:text-white/80">
                    <TerminalSquare className="h-3 w-3" />
                    命令模式
                  </button>
                </div>
                <button className="inline-flex items-center gap-1 text-emerald-300">
                  <ArrowUpRight className="h-3 w-3" />
                  预览执行计划
                </button>
              </div>
            </div>

            <aside className="hidden w-full min-h-0 overflow-y-auto border-t border-white/5 px-6 py-6 lg:block lg:w-80 lg:border-l lg:border-t-0">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
                <span>工具轨迹</span>
                <button className="text-white/70 hover:text-white">查看日志</button>
              </div>
              <div className="mt-4 space-y-4">
                {toolTrace.map((trace) => (
                  <div
                    key={trace.id}
                    className="rounded-2xl border border-white/5 bg-white/5 p-4"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>{trace.startedAt}</span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide",
                          statusBadges[trace.status],
                        )}
                      >
                        {trace.status}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-white">
                      {trace.label}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">{trace.detail}</p>
                  </div>
                ))}
      </div>

              <div className="mt-6 rounded-2xl border border-white/5 bg-white/5 p-4">
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
                  <span>即时工具 · 列目录</span>
                  <button
                    onClick={() => {
                      setListPath("D:\\\\Workspace");
                      setListPattern("");
                      setListRecursive(false);
                      setListResults([]);
                      setListError(null);
                    }}
                    className="text-white/60 hover:text-white"
                  >
                    重置
                  </button>
                </div>
                <div className="mt-3 space-y-2 text-sm text-slate-200">
                  <input
                    value={listPath}
                    onChange={(event) => setListPath(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-transparent px-3 py-2 text-xs text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50"
                    placeholder="例如 D:\\Workspace"
                  />
                  <input
                    value={listPattern}
                    onChange={(event) => setListPattern(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-transparent px-3 py-2 text-xs text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50"
                    placeholder="可选：按文件名过滤 (如 .ts)"
                  />
                  <label className="inline-flex items-center gap-2 text-xs text-slate-400">
        <input
                      type="checkbox"
                      checked={listRecursive}
                      onChange={(event) => setListRecursive(event.target.checked)}
                      className="h-3 w-3 rounded border-white/30 bg-transparent accent-emerald-400"
                    />
                    递归子目录
                  </label>
                  <button
                    onClick={() => void handleListFiles()}
                    disabled={listLoading}
                    className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400/90 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-300 disabled:opacity-60"
                  >
                    <FolderSearch2 className="h-4 w-4" />
                    {listLoading ? "扫描中..." : "执行 list_files"}
                  </button>
                  {listError && (
                    <p className="text-xs text-rose-300">{listError}</p>
                  )}
                </div>
                <div className="mt-4 max-h-48 space-y-2 overflow-y-auto text-xs">
                  {listResults.length === 0 && !listLoading ? (
                    <p className="text-slate-500">
                      结果将展示在这里，你也可以把这些数据写回聊天中。
                    </p>
                  ) : (
                    listResults.map((entry) => (
                      <div
                        key={entry.path}
                        className="rounded-2xl border border-white/5 bg-white/5 p-3"
                      >
                        <p className="truncate text-[13px] font-semibold text-white">
                          {entry.path}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                          <span className="rounded-full border border-white/10 px-2 py-0.5 uppercase tracking-wide">
                            {entry.file_type}
                          </span>
                          <span>{formatSize(entry.size)}</span>
                          <span>{formatTime(entry.modified_ms)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-white/5 bg-gradient-to-br from-slate-200/10 via-transparent to-slate-200/5 p-4 text-xs text-slate-300">
                <div className="flex items-center gap-2 text-sm text-white">
                  <Sparkles className="h-4 w-4 text-emerald-300" />
                  智能操作提示
                </div>
                <ul className="mt-3 space-y-2">
                  <li className="flex items-start gap-2">
                    <TimerReset className="h-3 w-3 text-emerald-200" />
                    <span>支持多步计划，自动拆解复杂操作。</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <ShieldCheck className="h-3 w-3 text-emerald-200" />
                    <span>任何写操作都会先生成沙箱 diff 供你确认。</span>
                  </li>
                </ul>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </div>
  </div>
  );
}

export default App;
