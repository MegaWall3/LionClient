export type ChatRole = "user" | "assistant" | "tool";

export interface ToolCallResult {
  toolCallId: string;
  toolName: string;
  arguments: Record<string, any> | string;
  result: any;
  status: "pending" | "success" | "error";
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  tool?: string;
  toolCallId?: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
  toolCallResults?: ToolCallResult[]; // 工具调用结果列表
  timestamp: string;
  status?: "pending" | "success" | "error";
}

export interface ToolTrace {
  id: string;
  label: string;
  status: "queued" | "running" | "done" | "error";
  detail: string;
  startedAt: string;
}
