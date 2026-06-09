use async_openai::types::{
    ChatCompletionMessageToolCall, ChatCompletionToolType, FinishReason, FunctionCall,
};
use serde::Serialize;
use serde_json::Value;
use tauri::{Emitter, Window};

pub const DEFAULT_MODEL: &str = "deepseek-ai/DeepSeek-V3.2";
pub const DEFAULT_API_BASE: &str = "https://api.siliconflow.cn/v1";
pub const MAX_REACT_STEPS: usize = 10;

pub struct AgentRunConfig {
    pub api_key: String,
    pub api_base: String,
    pub model: String,
    pub message_id: String,
}

impl AgentRunConfig {
    pub fn siliconflow(model: Option<String>, message_id: String) -> Result<Self, String> {
        let api_key = std::env::var("SILICONFLOW_API_KEY").map_err(|_| {
            "缺少 SILICONFLOW_API_KEY 环境变量，请先配置 SiliconFlow API Key".to_string()
        })?;

        Ok(Self {
            api_key,
            api_base: DEFAULT_API_BASE.to_string(),
            model: model.unwrap_or_else(|| DEFAULT_MODEL.to_string()),
            message_id,
        })
    }
}

#[derive(Debug, Clone)]
pub struct ToolInvocation {
    pub id: String,
    pub name: String,
    pub arguments_json: String,
    pub arguments: Value,
}

impl ToolInvocation {
    pub fn from_value(value: &Value) -> Result<Self, String> {
        let id = value["id"].as_str().ok_or("tool_call 缺少 id")?.to_string();
        let raw_name = value["function"]["name"]
            .as_str()
            .ok_or("tool_call 缺少 function.name")?
            .to_string();
        let arguments_json = value["function"]["arguments"]
            .as_str()
            .ok_or("tool_call 缺少 function.arguments")?
            .to_string();
        let arguments: Value = serde_json::from_str(&arguments_json)
            .map_err(|e| format!("解析工具参数失败: {}", e))?;
        let name = if raw_name.trim().is_empty()
            && arguments
                .get("command")
                .and_then(|value| value.as_str())
                .is_some()
        {
            "run_command".to_string()
        } else {
            raw_name
        };

        Ok(Self {
            id,
            name,
            arguments_json,
            arguments,
        })
    }

    pub fn to_openai_tool_call(&self) -> ChatCompletionMessageToolCall {
        ChatCompletionMessageToolCall {
            id: self.id.clone(),
            r#type: ChatCompletionToolType::Function,
            function: FunctionCall {
                name: self.name.clone(),
                arguments: self.arguments_json.clone(),
            },
        }
    }
}

#[derive(Debug)]
pub struct ModelStep {
    pub finish_reason: Option<FinishReason>,
    pub content: String,
    pub tool_calls: Vec<ToolInvocation>,
}

impl ModelStep {
    pub fn finish_reason_label(&self) -> Option<&'static str> {
        self.finish_reason.as_ref().map(|reason| match reason {
            FinishReason::Stop => "stop",
            FinishReason::Length => "length",
            FinishReason::ToolCalls => "tool_calls",
            FinishReason::ContentFilter => "content_filter",
            FinishReason::FunctionCall => "function_call",
        })
    }

    pub fn wants_tools(&self) -> bool {
        matches!(self.finish_reason, Some(FinishReason::ToolCalls)) && !self.tool_calls.is_empty()
    }
}

#[derive(Clone, Serialize)]
struct AgentStepEvent<'a> {
    message_id: &'a str,
    step: usize,
    phase: &'a str,
}

#[derive(Clone, Serialize)]
struct ToolStartEvent<'a> {
    message_id: &'a str,
    tool_id: &'a str,
    tool_name: &'a str,
    arguments: &'a Value,
}

#[derive(Clone, Serialize)]
struct ToolDoneEvent<'a> {
    message_id: &'a str,
    tool_id: &'a str,
    tool_name: &'a str,
    result: &'a str,
    status: &'a str,
}

pub struct AgentEvents<'a> {
    window: &'a Window,
    message_id: &'a str,
}

impl<'a> AgentEvents<'a> {
    pub fn new(window: &'a Window, message_id: &'a str) -> Self {
        Self { window, message_id }
    }

    pub fn step(&self, step: usize, phase: &'static str) -> Result<(), String> {
        self.window
            .emit(
                "llm-agent-step",
                AgentStepEvent {
                    message_id: self.message_id,
                    step,
                    phase,
                },
            )
            .map_err(|e| format!("Emit error: {}", e))
    }

    pub fn chunk(&self, content: &str, full_content: &str) -> Result<(), String> {
        self.window
            .emit(
                "llm-stream-chunk",
                serde_json::json!({
                    "message_id": self.message_id,
                    "content": content,
                    "full_content": full_content,
                }),
            )
            .map_err(|e| format!("Emit error: {}", e))
    }

    pub fn tool_calls(&self, tool_calls: &[ToolInvocation], content: &str) -> Result<(), String> {
        let payload = tool_calls
            .iter()
            .map(|tool_call| {
                serde_json::json!({
                    "id": tool_call.id,
                    "type": "function",
                    "function": {
                        "name": tool_call.name,
                        "arguments": tool_call.arguments_json,
                    }
                })
            })
            .collect::<Vec<_>>();

        self.window
            .emit(
                "llm-stream-tool-calls",
                serde_json::json!({
                    "message_id": self.message_id,
                    "tool_calls": payload,
                    "content": content
                }),
            )
            .map_err(|e| format!("Emit error: {}", e))
    }

    pub fn tool_start(&self, invocation: &ToolInvocation) -> Result<(), String> {
        self.window
            .emit(
                "llm-tool-start",
                ToolStartEvent {
                    message_id: self.message_id,
                    tool_id: &invocation.id,
                    tool_name: &invocation.name,
                    arguments: &invocation.arguments,
                },
            )
            .map_err(|e| format!("Emit error: {}", e))
    }

    pub fn tool_done(
        &self,
        invocation: &ToolInvocation,
        result: &str,
        status: &'static str,
    ) -> Result<(), String> {
        self.window
            .emit(
                "llm-tool-done",
                ToolDoneEvent {
                    message_id: self.message_id,
                    tool_id: &invocation.id,
                    tool_name: &invocation.name,
                    result,
                    status,
                },
            )
            .map_err(|e| format!("Emit error: {}", e))
    }

    pub fn done(&self) -> Result<(), String> {
        self.window
            .emit("llm-stream-done", self.message_id)
            .map_err(|e| format!("Emit error: {}", e))
    }
}
