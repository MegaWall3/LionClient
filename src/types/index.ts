// 聊天消息类型
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  toolCallResults?: ToolCallResult[];
  status?: "success" | "error" | "pending";
}

// 工具调用类型
export interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

// 工具调用结果
export interface ToolCallResult {
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown> | string;
  result: unknown;
  status: "pending" | "waiting_approval" | "success" | "error";
}

export interface ApprovalRequest {
  request_id: string;
  message_id: string;
  tool_id: string;
  tool_name: string;
  risk: string;
  summary: string;
  arguments: Record<string, unknown>;
}

// 工具轨迹
export interface ToolTrace {
  id: string;
  name?: string;
  label: string;
  detail: string;
  args?: Record<string, unknown>;
  result?: unknown;
  timestamp?: string;
  startedAt: string;
  status: "queued" | "running" | "done" | "error";
}

// 文件条目
export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  file_type: string;
  size: number;
  modified: number;
  modified_ms: number;
}

// 快捷操作
export interface QuickAction {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  prompt: string;
}

// LLM 流式事件
export interface LLMStreamChunkEvent {
  message_id: string;
  content: string;
  full_content: string;
}

export interface LLMStreamToolCallsEvent {
  message_id: string;
  tool_calls: ToolCall[];
  content: string;
}

export interface LLMToolStartEvent {
  message_id: string;
  tool_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
}

export interface LLMToolDoneEvent {
  message_id: string;
  tool_id: string;
  result: unknown;
  success: boolean;
}
