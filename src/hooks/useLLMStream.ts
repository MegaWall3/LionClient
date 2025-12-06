import { useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ChatMessage } from "../types";
import { formatTimestamp } from "../utils";
import { parseToolArguments, getToolArgumentsPreview } from "../utils/toolParser";
import { executeToolCall } from "../services/toolExecutor";
import { DEFAULT_MODEL } from "../constants";

// 事件类型定义
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

// 初始消息
const initialMessages: ChatMessage[] = [
  {
    id: "m1",
    role: "assistant",
    content:
      "你好！我是 Lion，你的桌面智能代理助手。我可以帮你完成各种电脑任务，比如搜索文件、管理文件、执行命令等。有什么需要帮助的吗？",
    timestamp: formatTimestamp(),
  },
];

export function useLLMStream() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isThinking, setIsThinking] = useState(false);
  const [activeUnlisteners, setActiveUnlisteners] = useState<
    Map<string, UnlistenFn[]>
  >(new Map());

  // 组合消息（只保留 user 和 assistant）
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
  function startNewChat() {
    setMessages(initialMessages);
    setActiveUnlisteners(new Map());
    setIsThinking(false);
  }

  // 停止当前流式输出
  function stopThinking() {
    // 清理所有活动的监听器
    activeUnlisteners.forEach((unlisteners) => {
      for (const unlisten of unlisteners) {
        unlisten();
      }
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

  // 发送消息
  async function sendMessage(userInput: string) {
    if (!userInput.trim()) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: userInput.trim(),
      timestamp: formatTimestamp(),
    };

    setMessages((prev) => [...prev, userMsg]);
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
      // 构建消息列表
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

                // 更新 assistant 消息，添加工具调用结果
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

                        // 设置下一轮的监听器
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

  return {
    messages,
    isThinking,
    sendMessage,
    stopThinking,
    startNewChat,
  };
}

