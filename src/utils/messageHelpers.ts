import type { ChatMessage, ToolCall, ToolCallResult } from "../types";

/**
 * 更新消息内容
 */
export function updateMessageContent(
  messages: ChatMessage[],
  messageId: string,
  content: string
): ChatMessage[] {
  return messages.map((msg) => (msg.id === messageId ? { ...msg, content } : msg));
}

/**
 * 更新消息的工具调用结果
 */
export function updateMessageToolCallResult(
  messages: ChatMessage[],
  messageId: string,
  toolCallId: string,
  result: unknown,
  status: "pending" | "success" | "error"
): ChatMessage[] {
  return messages.map((msg) => {
    if (msg.id === messageId && msg.toolCallResults) {
      return {
        ...msg,
        toolCallResults: msg.toolCallResults.map((r) =>
          r.toolCallId === toolCallId ? { ...r, result, status } : r
        ),
      };
    }
    return msg;
  });
}

/**
 * 为消息添加工具调用和初始结果
 */
export function addToolCallsToMessage(
  messages: ChatMessage[],
  messageId: string,
  toolCalls: ToolCall[],
  content: string,
  getArgumentsPreview: (args: string) => Record<string, unknown> | string
): ChatMessage[] {
  return messages.map((msg) =>
    msg.id === messageId
      ? {
          ...msg,
          content,
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
            arguments: getArgumentsPreview(tc.function.arguments),
            result: null,
            status: "pending" as const,
          })),
        }
      : msg
  );
}

/**
 * 更新消息的完整工具调用结果
 */
export function updateMessageWithToolCallResult(
  messages: ChatMessage[],
  messageId: string,
  toolCallId: string,
  toolName: string,
  functionArgs: Record<string, unknown>,
  toolResult: unknown,
  toolStatus: "pending" | "success" | "error",
  toolCalls: ToolCall[],
  content: string
): ChatMessage[] {
  return messages.map((msg) => {
    if (msg.id === messageId) {
      const existingResults = msg.toolCallResults || [];
      const resultIndex = existingResults.findIndex((r) => r.toolCallId === toolCallId);
      const newResult: ToolCallResult = {
        toolCallId,
        toolName,
        arguments: functionArgs,
        result: toolResult,
        status: toolStatus,
      };
      const updatedResults =
        resultIndex >= 0
          ? existingResults.map((result, index) => (index === resultIndex ? newResult : result))
          : [...existingResults, newResult];

      return {
        ...msg,
        content,
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
  });
}

/**
 * 为消息添加新的工具调用结果
 */
export function appendToolCallResultToMessage(
  messages: ChatMessage[],
  messageId: string,
  toolCallId: string,
  toolName: string,
  functionArgs: Record<string, unknown>,
  toolResult: unknown,
  status: "pending" | "success" | "error"
): ChatMessage[] {
  return messages.map((msg) => {
    if (msg.id === messageId) {
      const existingResults = msg.toolCallResults || [];
      const newResult: ToolCallResult = {
        toolCallId,
        toolName,
        arguments: functionArgs,
        result: toolResult,
        status,
      };
      return {
        ...msg,
        toolCallResults: [...existingResults, newResult],
      };
    }
    return msg;
  });
}
