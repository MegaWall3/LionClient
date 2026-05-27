import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useMemo, useState } from "react";
import { DEFAULT_MODEL } from "../constants";
import type { ChatMessage } from "../types";
import { formatTimestamp } from "../utils";
import { getToolArgumentsPreview } from "../utils/toolParser";

type StreamMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

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

type ToolStartEvent = {
  message_id: string;
  tool_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
};

type ToolDoneEvent = {
  message_id: string;
  tool_id: string;
  tool_name: string;
  result: unknown;
  status?: "success" | "error";
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
  const [activeUnlisteners, setActiveUnlisteners] = useState<Map<string, UnlistenFn[]>>(new Map());

  function clearActiveStreams(markInterrupted = false) {
    activeUnlisteners.forEach((unlisteners) => {
      for (const unlisten of unlisteners) {
        unlisten();
      }
    });
    const activeIds = new Set(activeUnlisteners.keys());
    setActiveUnlisteners(new Map());
    setIsThinking(false);

    if (markInterrupted && activeIds.size > 0) {
      setMessages((prev) =>
        prev.map((msg) =>
          activeIds.has(msg.id) && msg.role === "assistant" && !msg.content.trim()
            ? { ...msg, content: "[已打断]", status: "error" as const }
            : msg
        )
      );
    }
  }

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
    clearActiveStreams();
    setMessages(initialMessages);
  }

  // 停止当前流式输出
  function stopThinking() {
    clearActiveStreams(true);
  }

  // 发送消息
  async function sendMessage(userInput: string) {
    if (!userInput.trim()) return;
    if (isThinking || activeUnlisteners.size > 0) {
      clearActiveStreams(true);
    }

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
    let unlistenToolStart: UnlistenFn | undefined;
    let unlistenToolDone: UnlistenFn | undefined;
    let unlistenDone: UnlistenFn | undefined;
    let messagesToSend: StreamMessage[];

    try {
      // 构建消息列表
      messagesToSend = [...composedMessages, { role: "user" as const, content: userMsg.content }];

      // 监听流式数据
      unlistenChunk = await listen<ChunkEvent>("llm-stream-chunk", (event) => {
        if (event.payload.message_id === assistantMsgId) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId ? { ...msg, content: event.payload.full_content } : msg
            )
          );
        }
      });

      // 监听工具调用计划。工具由 Rust Agent 执行，前端只负责展示状态。
      unlistenToolCalls = await listen<ToolCallsEvent>("llm-stream-tool-calls", (event) => {
        if (event.payload.message_id === assistantMsgId) {
          const toolCalls = event.payload.tool_calls;
          console.log("[前端] 收到 tool_calls: ", toolCalls);

          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? {
                    ...msg,
                    content: event.payload.content || msg.content,
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
                      arguments: getToolArgumentsPreview(tc.function.arguments),
                      result: null,
                      status: "pending" as const,
                    })),
                  }
                : msg
            )
          );
        }
      });

      unlistenToolStart = await listen<ToolStartEvent>("llm-tool-start", (event) => {
        if (event.payload.message_id === assistantMsgId) {
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id !== assistantMsgId) return msg;

              const existingResults = msg.toolCallResults || [];
              const resultIndex = existingResults.findIndex(
                (result) => result.toolCallId === event.payload.tool_id
              );
              const newResult = {
                toolCallId: event.payload.tool_id,
                toolName: event.payload.tool_name,
                arguments: event.payload.arguments,
                result: null,
                status: "pending" as const,
              };
              const toolCallResults =
                resultIndex >= 0
                  ? existingResults.map((result, index) =>
                      index === resultIndex ? { ...result, ...newResult } : result
                    )
                  : [...existingResults, newResult];

              return {
                ...msg,
                toolCallResults,
              };
            })
          );
        }
      });

      unlistenToolDone = await listen<ToolDoneEvent>("llm-tool-done", (event) => {
        if (event.payload.message_id === assistantMsgId) {
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id !== assistantMsgId) return msg;

              const existingResults = msg.toolCallResults || [];
              const resultIndex = existingResults.findIndex(
                (result) => result.toolCallId === event.payload.tool_id
              );
              const newResult = {
                toolCallId: event.payload.tool_id,
                toolName: event.payload.tool_name,
                arguments: resultIndex >= 0 ? existingResults[resultIndex].arguments : {},
                result: event.payload.result,
                status: event.payload.status ?? "success",
              };
              const toolCallResults =
                resultIndex >= 0
                  ? existingResults.map((result, index) =>
                      index === resultIndex ? { ...result, ...newResult } : result
                    )
                  : [...existingResults, newResult];

              return { ...msg, toolCallResults };
            })
          );
        }
      });

      unlistenDone = await listen<string>("llm-stream-done", (event) => {
        if (event.payload === assistantMsgId) {
          setIsThinking(false);
          if (unlistenChunk) unlistenChunk();
          if (unlistenToolCalls) unlistenToolCalls();
          if (unlistenToolStart) unlistenToolStart();
          if (unlistenToolDone) unlistenToolDone();
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
        unlistenToolStart,
        unlistenToolDone,
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
        error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
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
                content: `无法连接到 LLM 服务：${errorDetails}\n\n你也可以先让我执行本地的工具操作。`,
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
