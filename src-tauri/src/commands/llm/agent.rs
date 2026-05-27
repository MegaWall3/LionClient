// Agent - 实现真正的 Agent 推理循环
use async_openai::{
    config::OpenAIConfig,
    types::{
        ChatCompletionMessageToolCall, ChatCompletionRequestAssistantMessageArgs,
        ChatCompletionRequestMessage, ChatCompletionRequestSystemMessageArgs,
        ChatCompletionRequestToolMessageArgs, ChatCompletionRequestUserMessageArgs,
        ChatCompletionTool, ChatCompletionToolType, CreateChatCompletionRequestArgs, FinishReason,
        FunctionCall,
    },
    Client,
};
use futures_util::StreamExt;
use serde_json::Value;
use tauri::{Emitter, Window};

use super::executor::ToolExecutor;
use super::prompts::SystemPromptBuilder;
use super::tools::ToolRegistry;
use crate::types::ChatMessage;

const MAX_ITERATIONS: usize = 10; // 最大推理循环次数，防止无限循环

/// Agent 执行器
pub struct Agent {
    client: Client<OpenAIConfig>,
    model: String,
    window: Window,
    message_id: String,
}

impl Agent {
    pub fn new(
        api_key: String,
        api_base: String,
        model: String,
        window: Window,
        message_id: String,
    ) -> Self {
        let config = OpenAIConfig::new()
            .with_api_key(api_key)
            .with_api_base(api_base);

        let client = Client::with_config(config);

        Self {
            client,
            model,
            window,
            message_id,
        }
    }

    /// 执行 Agent 推理循环（流式输出）
    pub async fn run_stream(&self, user_messages: Vec<ChatMessage>) -> Result<(), String> {
        // 构建初始消息列表
        let system_prompt = SystemPromptBuilder::new().build();
        let mut messages: Vec<ChatCompletionRequestMessage> =
            vec![ChatCompletionRequestSystemMessageArgs::default()
                .content(system_prompt)
                .build()
                .map_err(|e| format!("构建系统消息失败: {}", e))?
                .into()];

        // 添加用户消息并输出到终端（正确区分 role）
        for msg in &user_messages {
            match msg.role.as_str() {
                "user" => eprintln!("[User] {}", msg.content),
                "assistant" => eprintln!("[Assistant] {}", msg.content),
                "tool" => eprintln!("[Tool] {}", msg.content),
                _ => eprintln!("[{}] {}", msg.role, msg.content),
            }
            messages.push(self.convert_message(msg.clone())?);
        }

        // Agent 循环
        let mut iteration = 0;
        loop {
            iteration += 1;
            if iteration > MAX_ITERATIONS {
                let warning = format!("\n\n⚠️ 已达到最大推理次数 ({}), 停止执行", MAX_ITERATIONS);
                self.emit_chunk(&warning, &warning).await?;
                self.window
                    .emit("llm-stream-done", &self.message_id)
                    .map_err(|e| format!("Emit error: {}", e))?;
                break;
            }

            eprintln!("[Agent] 第 {} 次推理", iteration);

            // 调用 LLM (流式)
            let (finish_reason, content, tool_calls) = self.call_llm_stream(&messages).await?;

            // 构建 assistant 消息
            let mut assistant_msg = ChatCompletionRequestAssistantMessageArgs::default();
            if !content.is_empty() {
                assistant_msg.content(content.clone());
            }

            // 根据完成原因决定下一步
            match finish_reason.as_deref() {
                Some("tool_calls") if !tool_calls.is_empty() => {
                    eprintln!("[Agent] LLM 请求调用工具: {:?}", tool_calls);

                    let assistant_tool_calls = Self::parse_tool_calls(&tool_calls)?;
                    assistant_msg.tool_calls(assistant_tool_calls);

                    // 添加 assistant 消息（必须带 tool_calls，后续 tool 消息才能合法关联）
                    messages.push(
                        assistant_msg
                            .build()
                            .map_err(|e| format!("构建助手消息失败: {}", e))?
                            .into(),
                    );

                    // 执行所有工具调用
                    for tool_call in &tool_calls {
                        let tool_id = tool_call["id"].as_str().ok_or("tool_call 缺少 id")?;
                        let function_name = tool_call["function"]["name"]
                            .as_str()
                            .ok_or("tool_call 缺少 function.name")?;
                        let arguments_str = tool_call["function"]["arguments"]
                            .as_str()
                            .ok_or("tool_call 缺少 function.arguments")?;

                        // 解析参数（反转义日志输出）
                        let arguments: Value = serde_json::from_str(arguments_str)
                            .map_err(|e| format!("解析工具参数失败: {}", e))?;

                        // 美化输出工具调用信息
                        eprintln!("[Agent] 🔧 开始执行工具: {}", function_name);
                        eprintln!(
                            "[Agent]    参数: {}",
                            serde_json::to_string_pretty(&arguments)
                                .unwrap_or_else(|_| arguments_str.to_string())
                        );

                        // 发送工具执行开始事件
                        self.window
                            .emit(
                                "llm-tool-start",
                                serde_json::json!({
                                    "message_id": self.message_id,
                                    "tool_id": tool_id,
                                    "tool_name": function_name,
                                    "arguments": arguments
                                }),
                            )
                            .map_err(|e| format!("Emit error: {}", e))?;

                        // 执行工具（异步，可能耗时）
                        let (tool_result, tool_status) = match ToolExecutor::execute(
                            &self.window,
                            function_name,
                            arguments.clone(),
                        )
                        .await
                        {
                            Ok(result) => {
                                eprintln!("[Agent] ✅ 工具 {} 执行成功", function_name);
                                (result, "success")
                            }
                            Err(e) => {
                                eprintln!("[Agent] ❌ 工具 {} 执行失败: {}", function_name, e);
                                (format!("工具执行错误: {}", e), "error")
                            }
                        };

                        // 发送工具执行完成事件
                        self.window
                            .emit(
                                "llm-tool-done",
                                serde_json::json!({
                                    "message_id": self.message_id,
                                    "tool_id": tool_id,
                                    "tool_name": function_name,
                                    "result": tool_result,
                                    "status": tool_status
                                }),
                            )
                            .map_err(|e| format!("Emit error: {}", e))?;

                        eprintln!(
                            "[Agent]    结果预览: {}",
                            &tool_result[..tool_result.len().min(200)]
                        );

                        // 添加工具结果消息
                        let tool_msg = ChatCompletionRequestToolMessageArgs::default()
                            .content(tool_result)
                            .tool_call_id(tool_id.to_string())
                            .build()
                            .map_err(|e| format!("构建工具消息失败: {}", e))?
                            .into();

                        messages.push(tool_msg);
                    }

                    // 继续循环，让 LLM 根据工具结果继续推理
                    continue;
                }
                Some(reason) if reason.to_lowercase() == "stop" => {
                    // 正常结束
                    eprintln!("[Agent] 推理完成 (stop)");
                    self.window
                        .emit("llm-stream-done", &self.message_id)
                        .map_err(|e| format!("Emit error: {}", e))?;
                    break;
                }
                None => {
                    // 流式响应结束但没有 finish_reason，视为正常结束
                    // 这通常发生在流式响应正常结束时
                    eprintln!("[Agent] 推理完成 (无 finish_reason，视为正常结束)");
                    self.window
                        .emit("llm-stream-done", &self.message_id)
                        .map_err(|e| format!("Emit error: {}", e))?;
                    break;
                }
                other => {
                    eprintln!("[Agent] 未知的 finish_reason: {:?}，视为正常结束", other);
                    self.window
                        .emit("llm-stream-done", &self.message_id)
                        .map_err(|e| format!("Emit error: {}", e))?;
                    break;
                }
            }
        }

        Ok(())
    }

    /// 调用 LLM 进行流式推理
    async fn call_llm_stream(
        &self,
        messages: &[ChatCompletionRequestMessage],
    ) -> Result<(Option<String>, String, Vec<Value>), String> {
        let tools = ToolRegistry::get_tools();
        let chat_tools: Vec<ChatCompletionTool> = tools
            .into_iter()
            .map(|tool| ChatCompletionTool {
                r#type: ChatCompletionToolType::Function,
                function: tool,
            })
            .collect();

        let request = CreateChatCompletionRequestArgs::default()
            .model(&self.model)
            .messages(messages.to_vec())
            .tools(chat_tools)
            .temperature(0.0)
            .stream(true)
            .build()
            .map_err(|e| format!("构建请求失败: {}", e))?;

        let mut stream = self
            .client
            .chat()
            .create_stream(request)
            .await
            .map_err(|e| format!("请求失败: {}", e))?;

        let mut full_content = String::new();
        let mut tool_calls: Vec<Value> = Vec::new();
        let mut finish_reason: Option<String> = None;

        while let Some(result) = stream.next().await {
            match result {
                Ok(response) => {
                    for choice in response.choices {
                        // 处理内容增量
                        if let Some(content) = &choice.delta.content {
                            full_content.push_str(content);
                            // 只发送增量给前端，不打印到终端（避免重复）
                            self.emit_chunk(content, &full_content).await?;
                        }

                        // 处理工具调用
                        if let Some(delta_tool_calls) = &choice.delta.tool_calls {
                            for delta_tc in delta_tool_calls {
                                let index = delta_tc.index as usize;

                                while tool_calls.len() <= index {
                                    tool_calls.push(serde_json::json!({
                                        "id": "",
                                        "type": "function",
                                        "function": {"name": "", "arguments": ""}
                                    }));
                                }

                                if let Some(id) = &delta_tc.id {
                                    tool_calls[index]["id"] = Value::String(id.clone());
                                }
                                if let Some(function) = &delta_tc.function {
                                    if let Some(name) = &function.name {
                                        tool_calls[index]["function"]["name"] =
                                            Value::String(name.clone());
                                    }
                                    if let Some(args) = &function.arguments {
                                        let current_args = tool_calls[index]["function"]
                                            ["arguments"]
                                            .as_str()
                                            .unwrap_or("");
                                        tool_calls[index]["function"]["arguments"] =
                                            Value::String(format!("{}{}", current_args, args));
                                    }
                                }
                            }
                        }

                        // 记录完成原因（只在最后一个 chunk 中设置）
                        if let Some(reason) = &choice.finish_reason {
                            // FinishReason 是枚举，我们需要转换为字符串
                            let reason_str = match reason {
                                FinishReason::Stop => "stop",
                                FinishReason::Length => "length",
                                FinishReason::ToolCalls => "tool_calls",
                                FinishReason::ContentFilter => "content_filter",
                                FinishReason::FunctionCall => "function_call",
                            };
                            finish_reason = Some(reason_str.to_string());
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[Agent] 流式错误: {}", e);
                    return Err(format!("流式错误: {}", e));
                }
            }
        }

        // 如果有工具调用，发送事件
        if !tool_calls.is_empty() {
            self.window
                .emit(
                    "llm-stream-tool-calls",
                    serde_json::json!({
                        "message_id": self.message_id,
                        "tool_calls": tool_calls.clone(),
                        "content": full_content.clone()
                    }),
                )
                .map_err(|e| format!("Emit error: {}", e))?;
        }

        // 流式输出完成后，打印完整内容到终端（仅一次，避免重复）
        if !full_content.is_empty() {
            eprintln!("[Assistant] {}", full_content);
        }

        Ok((finish_reason, full_content, tool_calls))
    }

    /// 发送流式内容块
    async fn emit_chunk(&self, content: &str, full_content: &str) -> Result<(), String> {
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

    /// 转换 ChatMessage 到 OpenAI 格式
    fn convert_message(&self, msg: ChatMessage) -> Result<ChatCompletionRequestMessage, String> {
        match msg.role.as_str() {
            "user" => Ok(ChatCompletionRequestUserMessageArgs::default()
                .content(msg.content)
                .build()
                .map_err(|e| format!("构建用户消息失败: {}", e))?
                .into()),
            "assistant" => {
                let mut assistant_msg = ChatCompletionRequestAssistantMessageArgs::default();
                assistant_msg.content(msg.content);

                if let Some(tool_calls) = msg.tool_calls {
                    if !tool_calls.is_empty() {
                        let converted: Vec<ChatCompletionMessageToolCall> = tool_calls
                            .into_iter()
                            .map(|tool_call| ChatCompletionMessageToolCall {
                                id: tool_call.id,
                                r#type: ChatCompletionToolType::Function,
                                function: FunctionCall {
                                    name: tool_call.function.name,
                                    arguments: tool_call.function.arguments,
                                },
                            })
                            .collect();
                        assistant_msg.tool_calls(converted);
                    }
                }

                Ok(assistant_msg
                    .build()
                    .map_err(|e| format!("构建助手消息失败: {}", e))?
                    .into())
            }
            "tool" => {
                if let Some(tool_call_id) = msg.tool_call_id {
                    Ok(ChatCompletionRequestToolMessageArgs::default()
                        .content(msg.content)
                        .tool_call_id(tool_call_id)
                        .build()
                        .map_err(|e| format!("构建工具消息失败: {}", e))?
                        .into())
                } else {
                    Err("Tool 消息缺少 tool_call_id".to_string())
                }
            }
            _ => Ok(ChatCompletionRequestUserMessageArgs::default()
                .content(msg.content)
                .build()
                .map_err(|e| format!("构建消息失败: {}", e))?
                .into()),
        }
    }

    fn parse_tool_calls(
        tool_calls: &[Value],
    ) -> Result<Vec<ChatCompletionMessageToolCall>, String> {
        tool_calls
            .iter()
            .map(|tool_call| {
                let id = tool_call["id"]
                    .as_str()
                    .ok_or("tool_call 缺少 id")?
                    .to_string();
                let name = tool_call["function"]["name"]
                    .as_str()
                    .ok_or("tool_call 缺少 function.name")?
                    .to_string();
                let arguments = tool_call["function"]["arguments"]
                    .as_str()
                    .ok_or("tool_call 缺少 function.arguments")?
                    .to_string();

                Ok(ChatCompletionMessageToolCall {
                    id,
                    r#type: ChatCompletionToolType::Function,
                    function: FunctionCall { name, arguments },
                })
            })
            .collect()
    }
}
