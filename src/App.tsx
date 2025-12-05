import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  Activity,
  ArrowUpRight,
  MessageSquare,
  Plus,
  Settings2,
  TerminalSquare,
} from "lucide-react";
import type { ChatMessage, ToolTrace } from "./types";
import { formatTimestamp } from "./utils";
import { parseToolArguments, getToolArgumentsPreview } from "./utils/toolParser";
import { executeToolCall } from "./services/toolExecutor";
import { DEFAULT_MODEL } from "./constants";
import { useWindowControls, useAutoScroll, useFileList } from "./hooks";
import {
  WindowControls,
  Sidebar,
  ToolTracePanel,
  InstantToolPanel,
} from "./components";
import { ChatContainerOriginal, ChatInputStandalone } from "./components/Chat";

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

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [toolTrace] = useState<ToolTrace[]>(initialTrace);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [activeUnlisteners, setActiveUnlisteners] = useState<
    Map<string, UnlistenFn[]>
  >(new Map());
  const { isMaximized, minimize, maximizeToggle, close } = useWindowControls();
  const messagesEndRef = useAutoScroll(messages, isThinking);

  // 使用 useFileList Hook 管理即时工具状态
  const {
    listPath,
    listPattern,
    listRecursive,
    listResults,
    listLoading,
    listError,
    setListPath,
    setListPattern,
    setListRecursive,
    handleListFiles,
    resetFileList,
  } = useFileList();

  const composedMessages = useMemo(
    () =>
      messages
        .filter((msg) => msg.role === "user" || msg.role === "assistant")
        .map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        })),
    [messages]
  );

  // 新建对话
  function handleNewChat() {
    setMessages(initialMessages);
    setActiveUnlisteners(new Map());
    setIsThinking(false);
  }

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
      const lastAssistant = [...prev]
        .reverse()
        .find((msg) => msg.role === "assistant");
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
    type ChunkEvent = {
      message_id: string;
      content: string;
      full_content: string;
    };
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
    let messagesToSend: Array<{
      role: "user" | "assistant" | "system" | "tool";
      content: string;
      tool_calls?: any;
      tool_call_id?: string;
    }>;

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
      unlistenToolCalls = await listen<ToolCallsEvent>(
        "llm-stream-tool-calls",
        async (event) => {
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
                functionArgs = parseToolArguments(toolCall.function.arguments);
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
                // 使用 toolExecutor 执行工具调用
                const { result: toolResult, status: toolStatus } =
                  await executeToolCall(functionName, functionArgs);

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
                const unlistenContinueChunk = await listen<ChunkEvent>(
                  "llm-stream-chunk",
                  (chunkEvent) => {
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
                  }
                );

                // 保存继续对话的监听器
                setActiveUnlisteners((prev) => {
                  const next = new Map(prev);
                  const existing = next.get(continueMsgId) || [];
                  next.set(continueMsgId, [
                    ...existing,
                    unlistenContinueChunk,
                  ]);
                  return next;
                });

                const unlistenContinueToolCalls = await listen<ToolCallsEvent>(
                  "llm-stream-tool-calls",
                  async (toolEvent) => {
                    if (toolEvent.payload.message_id === continueMsgId) {
                      // 递归处理 tool_calls（支持多轮 toolcall）
                      const continueToolCalls = toolEvent.payload.tool_calls;
                      console.log(
                        "[前端] 继续对话收到 tool_calls: ",
                        continueToolCalls
                      );

                      for (const continueToolCall of continueToolCalls) {
                        const continueFunctionName =
                          continueToolCall.function.name;
                        const continueFunctionArgs = parseToolArguments(
                          continueToolCall.function.arguments
                        );

                        // 使用 toolExecutor 执行工具调用
                        const { result: continueToolResult } =
                          await executeToolCall(
                            continueFunctionName,
                            continueFunctionArgs
                          );

                        // 更新 continueMsgId 的 assistant 消息，添加工具调用结果
                        setMessages((prev) =>
                          prev.map((msg) => {
                            if (msg.id === continueMsgId) {
                              const existingResults =
                                msg.toolCallResults || [];
                              const newResult = {
                                toolCallId: continueToolCall.id,
                                toolName: continueFunctionName,
                                arguments: continueFunctionArgs,
                                result: continueToolResult,
                                status: "success" as const,
                              };
                              return {
                                ...msg,
                                toolCallResults: [
                                  ...existingResults,
                                  newResult,
                                ],
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
                        const unlistenNextChunk = await listen<ChunkEvent>(
                          "llm-stream-chunk",
                          (nextChunkEvent) => {
                            if (
                              nextChunkEvent.payload.message_id === nextMsgId
                            ) {
                              setMessages((prev) =>
                                prev.map((msg) =>
                                  msg.id === nextMsgId
                                    ? {
                                        ...msg,
                                        content:
                                          nextChunkEvent.payload.full_content,
                                      }
                                    : msg
                                )
                              );
                            }
                          }
                        );

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
                          next.set(nextMsgId, [
                            unlistenNextChunk,
                            unlistenNextDone,
                          ]);
                          return next;
                        });

                        await invoke("call_llm_stream", {
                          messages: nextMessages,
                          messageId: nextMsgId,
                          model: DEFAULT_MODEL,
                        });
                      }
                    }
                  }
                );

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
                  next.set(continueMsgId, [
                    ...existing,
                    unlistenContinueToolCalls,
                    unlistenContinueDone,
                  ]);
                  return next;
                });

                // 继续调用 LLM
                await invoke("call_llm_stream", {
                  messages: continueMessages,
                  messageId: continueMsgId,
                  model: DEFAULT_MODEL,
                });
              } catch (error) {
                console.error("[ToolCall Error]", error);
              }
            }
          }
        }
      );

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
      const unlisteners = [
        unlistenChunk,
        unlistenToolCalls,
        unlistenDone,
      ].filter((u): u is UnlistenFn => u !== undefined);
      setActiveUnlisteners((prev) => {
        const next = new Map(prev);
        next.set(assistantMsgId, unlisteners);
        return next;
      });

      // 调用流式命令
      await invoke("call_llm_stream", {
        messages: messagesToSend,
        messageId: assistantMsgId,
        model: DEFAULT_MODEL,
      });
    } catch (error) {
      // 详细错误信息输出到控制台（开发调试用）
      const errorDetails =
        (error as { message?: string })?.message ?? String(error);
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
          {/* 侧边栏 */}
          <Sidebar onNewChat={handleNewChat} />

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
                  <p className="text-lg font-semibold">
                    Workspace 调度 · #1027
                  </p>
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
                <ChatContainerOriginal
                  messages={messages}
                  isThinking={isThinking}
                  messagesEndRef={messagesEndRef}
                />

                <ChatInputStandalone
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

              {/* 右侧面板 */}
              <aside className="hidden w-full min-h-0 overflow-y-auto border-t border-white/5 px-6 py-6 lg:block lg:w-80 lg:border-l lg:border-t-0">
                {/* 工具轨迹面板 */}
                <ToolTracePanel toolTrace={toolTrace} />

                {/* 即时工具面板 */}
                <div className="mt-6">
                  <InstantToolPanel
                    listPath={listPath}
                    listPattern={listPattern}
                    listRecursive={listRecursive}
                    listResults={listResults}
                    listLoading={listLoading}
                    listError={listError}
                    onPathChange={setListPath}
                    onPatternChange={setListPattern}
                    onRecursiveChange={setListRecursive}
                    onExecute={() => void handleListFiles()}
                    onReset={resetFileList}
                  />
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
