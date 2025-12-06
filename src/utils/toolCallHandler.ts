import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { executeToolCall } from "../services/toolExecutor";
import type { ChatMessage, ToolCall } from "../types";
import { formatTimestamp } from "./format";
import { buildToolCallMessage } from "./llmHelpers";
import {
  appendToolCallResultToMessage,
  updateMessageContent,
  updateMessageToolCallResult,
  updateMessageWithToolCallResult,
} from "./messageHelpers";
import { parseToolArguments } from "./toolParser";

interface ChunkEvent {
  message_id: string;
  content: string;
  full_content: string;
}

interface ToolCallsEvent {
  message_id: string;
  tool_calls: ToolCall[];
  content: string;
}

/**
 * 处理单个工具调用
 */
export async function handleSingleToolCall(
  toolCall: ToolCall,
  assistantMsgId: string,
  toolCalls: ToolCall[],
  eventContent: string,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
): Promise<{
  functionArgs: Record<string, unknown>;
  toolResult: unknown;
  success: boolean;
}> {
  const functionName = toolCall.function.name;
  let functionArgs: Record<string, unknown>;

  try {
    functionArgs = parseToolArguments(toolCall.function.arguments);
  } catch (error) {
    setMessages((prev) =>
      updateMessageToolCallResult(
        prev,
        assistantMsgId,
        toolCall.id,
        (error as Error).message ?? "工具参数解析失败",
        "error"
      )
    );
    throw error;
  }

  const { result: toolResult, status: toolStatus } = await executeToolCall(
    functionName,
    functionArgs
  );

  // 更新 assistant 消息，添加 tool_calls 和工具调用结果
  setMessages((prev) =>
    updateMessageWithToolCallResult(
      prev,
      assistantMsgId,
      toolCall.id,
      functionName,
      functionArgs,
      toolResult,
      toolStatus as "pending" | "success" | "error",
      toolCalls,
      eventContent || "正在思考下一步计划…"
    )
  );

  return {
    functionArgs,
    toolResult,
    success: toolStatus === "success",
  };
}

/**
 * 设置继续对话的监听器
 */
export async function setupContinueListeners(
  continueMsgId: string,
  continueMessages: Array<{
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
  }>,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setIsThinking: React.Dispatch<React.SetStateAction<boolean>>,
  setActiveUnlisteners: React.Dispatch<React.SetStateAction<Map<string, UnlistenFn[]>>>,
  defaultModel: string
): Promise<void> {
  // 监听继续对话的流式输出
  const unlistenContinueChunk = await listen<ChunkEvent>("llm-stream-chunk", (chunkEvent) => {
    if (chunkEvent.payload.message_id === continueMsgId) {
      setMessages((prev) =>
        updateMessageContent(prev, continueMsgId, chunkEvent.payload.full_content)
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

  // 监听继续对话的工具调用
  const unlistenContinueToolCalls = await listen<ToolCallsEvent>(
    "llm-stream-tool-calls",
    async (event) => {
      if (event.payload.message_id === continueMsgId) {
        const continueToolCalls = event.payload.tool_calls;
        console.log("[前端] 继续对话收到 tool_calls: ", continueToolCalls);

        for (const continueToolCall of continueToolCalls) {
          const continueFunctionName = continueToolCall.function.name;
          const continueFunctionArgs = parseToolArguments(continueToolCall.function.arguments);

          const { result: continueToolResult } = await executeToolCall(
            continueFunctionName,
            continueFunctionArgs
          );

          setMessages((prev) =>
            appendToolCallResultToMessage(
              prev,
              continueMsgId,
              continueToolCall.id,
              continueFunctionName,
              continueFunctionArgs,
              continueToolResult,
              "success"
            )
          );

          // 继续下一轮对话
          await handleNextRoundConversation(
            continueMessages,
            event.payload.content,
            continueToolCalls,
            continueToolCall.id,
            continueToolResult,
            setMessages,
            setIsThinking,
            setActiveUnlisteners,
            defaultModel
          );
        }
      }
    }
  );

  const unlistenContinueDone = await listen<string>("llm-stream-done", (event) => {
    if (event.payload === continueMsgId) {
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
  });

  // 更新继续对话的监听器列表
  setActiveUnlisteners((prev) => {
    const next = new Map(prev);
    const existing = next.get(continueMsgId) || [];
    next.set(continueMsgId, [...existing, unlistenContinueToolCalls, unlistenContinueDone]);
    return next;
  });

  // 调用 LLM 继续对话
  await invoke("call_llm_stream", {
    messages: continueMessages,
    messageId: continueMsgId,
    model: defaultModel,
  });
}

/**
 * 处理下一轮对话
 */
async function handleNextRoundConversation(
  continueMessages: Array<{
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
  }>,
  eventContent: string,
  continueToolCalls: ToolCall[],
  toolCallId: string,
  toolResult: unknown,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setIsThinking: React.Dispatch<React.SetStateAction<boolean>>,
  setActiveUnlisteners: React.Dispatch<React.SetStateAction<Map<string, UnlistenFn[]>>>,
  defaultModel: string
): Promise<void> {
  const nextMessages = [
    ...continueMessages,
    {
      role: "assistant" as const,
      content: eventContent,
      tool_calls: continueToolCalls.map((tc) => ({
        id: tc.id,
        type: tc.type,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      })),
    },
    buildToolCallMessage(toolCallId, toolResult),
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
  const unlistenNextChunk = await listen<ChunkEvent>("llm-stream-chunk", (event) => {
    if (event.payload.message_id === nextMsgId) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === nextMsgId
            ? {
                ...msg,
                content: event.payload.full_content,
              }
            : msg
        )
      );
    }
  });

  const unlistenNextDone = await listen<string>("llm-stream-done", (event) => {
    if (event.payload === nextMsgId) {
      setIsThinking(false);
      unlistenNextChunk();
      unlistenNextDone();
      setActiveUnlisteners((prev) => {
        const next = new Map(prev);
        next.delete(nextMsgId);
        return next;
      });
    }
  });

  // 保存下一轮对话的监听器
  setActiveUnlisteners((prev) => {
    const next = new Map(prev);
    next.set(nextMsgId, [unlistenNextChunk, unlistenNextDone]);
    return next;
  });

  await invoke("call_llm_stream", {
    messages: nextMessages,
    messageId: nextMsgId,
    model: defaultModel,
  });
}
