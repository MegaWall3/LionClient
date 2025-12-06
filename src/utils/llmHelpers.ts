import type { ToolCall } from "../types";

/**
 * 构建消息格式，用于发送给 LLM
 */
export function buildLLMMessage(
  role: "user" | "assistant" | "system" | "tool",
  content: string,
  options?: {
    tool_calls?: ToolCall[];
    tool_call_id?: string;
  }
): {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
} {
  return {
    role,
    content,
    ...options,
  };
}

/**
 * 构建工具调用消息
 */
export function buildToolCallMessage(
  toolCallId: string,
  toolResult: unknown
): {
  role: "tool";
  content: string;
  tool_call_id: string;
} {
  return {
    role: "tool",
    content: JSON.stringify(toolResult),
    tool_call_id: toolCallId,
  };
}
