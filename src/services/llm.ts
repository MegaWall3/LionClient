import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ChatMessage } from "../types";

export interface LLMStreamOptions {
  messages: Array<{
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    tool_calls?: Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }>;
    tool_call_id?: string;
  }>;
  messageId: string;
  onChunk: (content: string, fullContent: string) => void;
  onToolCalls: (toolCalls: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>, content: string) => void;
  onDone: () => void;
  onError: (error: Error) => void;
}

export async function callLLMStream(options: LLMStreamOptions): Promise<UnlistenFn[]> {
  const { messages, messageId, onChunk, onToolCalls, onDone, onError } = options;

  const unlisteners: UnlistenFn[] = [];

  try {
    // 监听流式数据
    const unlistenChunk = await listen<{
      message_id: string;
      content: string;
      full_content: string;
    }>("llm-stream-chunk", (event) => {
      if (event.payload.message_id === messageId) {
        onChunk(event.payload.content, event.payload.full_content);
      }
    });
    unlisteners.push(unlistenChunk);

    // 监听 tool_calls 事件
    const unlistenToolCalls = await listen<{
      message_id: string;
      tool_calls: Array<{
        id: string;
        type: string;
        function: { name: string; arguments: string };
      }>;
      content: string;
    }>("llm-stream-tool-calls", (event) => {
      if (event.payload.message_id === messageId) {
        onToolCalls(event.payload.tool_calls, event.payload.content);
      }
    });
    unlisteners.push(unlistenToolCalls);

    // 监听完成事件
    const unlistenDone = await listen<string>("llm-stream-done", (event) => {
      if (event.payload === messageId) {
        onDone();
      }
    });
    unlisteners.push(unlistenDone);

    // 调用流式命令
    await invoke("call_llm_stream", {
      messages,
      messageId,
    });
  } catch (error) {
    onError(error as Error);
  }

  return unlisteners;
}

