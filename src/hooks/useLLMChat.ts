import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useState } from "react";
import { DEFAULT_MODEL } from "../constants";
import type { ChatMessage, ToolCall } from "../types";
import {
  addToolCallsToMessage,
  buildToolCallMessage,
  formatTimestamp,
  getToolArgumentsPreview,
  handleSingleToolCall,
  setupContinueListeners,
  updateMessageContent,
} from "../utils";

interface ChunkEventPayload {
  message_id: string;
  content: string;
  full_content: string;
}

interface ToolCallsEventPayload {
  message_id: string;
  tool_calls: ToolCall[];
  content: string;
}

const initialMessages: ChatMessage[] = [
  {
    id: "m1",
    role: "assistant",
    content:
      "你好！我是 Lion，你的桌面智能代理助手。我可以帮你完成各种电脑任务，比如搜索文件、管理文件、执行命令等。有什么需要帮助的吗？",
    timestamp: formatTimestamp(),
  },
];

export function useLLMChat() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isThinking, setIsThinking] = useState(false);
  const [activeUnlisteners, setActiveUnlisteners] = useState<Map<string, UnlistenFn[]>>(new Map());

  /**
   * 发送消息给 LLM
   */
  const sendMessage = async (content: string) => {
    if (!content.trim() || isThinking) return;

    setIsThinking(true);

    // 添加用户消息
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: formatTimestamp(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // 创建 assistant 消息占位符
    const assistantMsgId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: formatTimestamp(),
    };
    setMessages((prev) => [...prev, assistantMsg]);

    // 构建要发送的消息列表（排除占位符）
    const composedMessages = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      ...(msg.tool_calls && { tool_calls: msg.tool_calls }),
      ...(msg.tool_call_id && { tool_call_id: msg.tool_call_id }),
    }));

    let unlistenChunk: UnlistenFn | undefined;
    let unlistenToolCalls: UnlistenFn | undefined;
    let unlistenDone: UnlistenFn | undefined;
    let messagesToSend: Array<{
      role: "user" | "assistant" | "system" | "tool";
      content: string;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: { name: string; arguments: string };
      }>;
      tool_call_id?: string;
    }>;

    try {
      // 构建消息列表，确保格式正确
      messagesToSend = [...composedMessages, { role: "user" as const, content: userMsg.content }];

      // 监听流式数据
      unlistenChunk = await listen<ChunkEventPayload>("llm-stream-chunk", (event) => {
        if (event.payload.message_id === assistantMsgId) {
          setMessages((prev) =>
            updateMessageContent(prev, assistantMsgId, event.payload.full_content)
          );
        }
      });

      // 监听 tool_calls 事件
      unlistenToolCalls = await listen<ToolCallsEventPayload>(
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
              addToolCallsToMessage(
                prev,
                assistantMsgId,
                toolCalls,
                "正在思考下一步计划…",
                getToolArgumentsPreview
              )
            );

            for (const toolCall of toolCalls) {
              try {
                // 使用 handleSingleToolCall 执行工具调用
                const { toolResult } = await handleSingleToolCall(
                  toolCall,
                  assistantMsgId,
                  toolCalls,
                  event.payload.content || "正在思考下一步计划…",
                  setMessages
                );

                // 继续对话，将 tool 结果发送给 LLM
                const continueMessages = [
                  ...composedMessages,
                  { role: "user" as const, content: userMsg.content },
                  {
                    role: "assistant" as const,
                    content: event.payload.content,
                    tool_calls: toolCalls.map((tc: ToolCall) => ({
                      id: tc.id,
                      type: tc.type,
                      function: {
                        name: tc.function.name,
                        arguments: tc.function.arguments,
                      },
                    })),
                  },
                  buildToolCallMessage(toolCall.id, toolResult),
                ];

                // 创建新的 assistant 消息并设置继续对话的监听器
                const continueMsgId = crypto.randomUUID();
                const continueAssistantMsg: ChatMessage = {
                  id: continueMsgId,
                  role: "assistant",
                  content: "",
                  timestamp: formatTimestamp(),
                };
                setMessages((prev) => [...prev, continueAssistantMsg]);

                // 使用 setupContinueListeners 设置继续对话的所有监听器
                await setupContinueListeners(
                  continueMsgId,
                  continueMessages,
                  setMessages,
                  setIsThinking,
                  setActiveUnlisteners,
                  DEFAULT_MODEL
                );
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

      // 保存监听器
      setActiveUnlisteners((prev) => {
        const next = new Map(prev);
        next.set(
          assistantMsgId,
          [unlistenChunk, unlistenToolCalls, unlistenDone].filter(Boolean) as UnlistenFn[]
        );
        return next;
      });

      // 调用后端
      await invoke("call_llm_stream", {
        messages: messagesToSend,
        messageId: assistantMsgId,
        model: DEFAULT_MODEL,
      });
    } catch (error) {
      const errorDetails =
        error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
      console.error("[LLM Error]", error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? {
                ...msg,
                content: `无法连接到 LLM 服务：${errorDetails}\n\n你也可以先让我执行本地的工具操作。`,
                status: "error" as const,
              }
            : msg
        )
      );
      setIsThinking(false);

      // 清理监听器
      if (unlistenChunk) unlistenChunk();
      if (unlistenToolCalls) unlistenToolCalls();
      if (unlistenDone) unlistenDone();
    }
  };

  /**
   * 停止当前的 LLM 推理
   */
  const stopThinking = () => {
    setIsThinking(false);
    // 清理所有活动的监听器
    activeUnlisteners.forEach((unlisteners) => {
      unlisteners.forEach((unlisten) => {
        unlisten();
      });
    });
    setActiveUnlisteners(new Map());
  };

  /**
   * 开始新对话
   */
  const startNewChat = () => {
    stopThinking();
    setMessages(initialMessages);
  };

  return {
    messages,
    isThinking,
    sendMessage,
    stopThinking,
    startNewChat,
  };
}
