// Agent - ReAct runtime: reason -> act with tools -> observe -> continue.
use async_openai::{
    config::OpenAIConfig,
    types::{
        ChatCompletionRequestAssistantMessageArgs, ChatCompletionRequestMessage,
        ChatCompletionRequestSystemMessageArgs, ChatCompletionRequestToolMessageArgs,
        ChatCompletionRequestUserMessageArgs, ChatCompletionTool, ChatCompletionToolType,
        CreateChatCompletionRequestArgs, FinishReason,
    },
    Client,
};
use futures_util::StreamExt;
use serde_json::Value;
use tauri::Window;

use super::executor::ToolExecutor;
use super::prompts::SystemPromptBuilder;
use super::runtime::{AgentEvents, AgentRunConfig, ModelStep, ToolInvocation, MAX_REACT_STEPS};
use super::tools::ToolRegistry;
use crate::types::ChatMessage;

/// Agent 执行器
pub struct Agent {
    client: Client<OpenAIConfig>,
    model: String,
    window: Window,
    message_id: String,
}

impl Agent {
    pub fn new(config: AgentRunConfig, window: Window) -> Self {
        let client_config = OpenAIConfig::new()
            .with_api_key(config.api_key)
            .with_api_base(config.api_base);

        Self {
            client: Client::with_config(client_config),
            model: config.model,
            window,
            message_id: config.message_id,
        }
    }

    /// 执行 Agent 推理循环（流式输出）
    pub async fn run_stream(&self, user_messages: Vec<ChatMessage>) -> Result<(), String> {
        let events = AgentEvents::new(&self.window, &self.message_id);
        let mut messages = self.initial_messages(user_messages)?;

        for step_number in 1..=MAX_REACT_STEPS {
            eprintln!("[Agent] 第 {} 次 ReAct 推理", step_number);
            events.step(step_number, "reasoning")?;

            let step = self.call_model_step(&messages, &events).await?;
            let mut assistant_msg = ChatCompletionRequestAssistantMessageArgs::default();

            if !step.content.is_empty() {
                assistant_msg.content(step.content.clone());
            }

            if !step.wants_tools() {
                let reason = step.finish_reason_label().unwrap_or("unknown");
                eprintln!("[Agent] 推理完成 ({})", reason);
                events.done()?;
                return Ok(());
            }

            events.step(step_number, "acting")?;
            assistant_msg.tool_calls(
                step.tool_calls
                    .iter()
                    .map(ToolInvocation::to_openai_tool_call)
                    .collect::<Vec<_>>(),
            );
            messages.push(
                assistant_msg
                    .build()
                    .map_err(|e| format!("构建助手消息失败: {}", e))?
                    .into(),
            );

            for invocation in &step.tool_calls {
                let observation = self.execute_tool(invocation, &events).await?;
                messages.push(
                    ChatCompletionRequestToolMessageArgs::default()
                        .content(observation)
                        .tool_call_id(invocation.id.clone())
                        .build()
                        .map_err(|e| format!("构建工具消息失败: {}", e))?
                        .into(),
                );
            }

            events.step(step_number, "observing")?;
        }

        let warning = format!(
            "\n\n⚠️ 已达到最大 ReAct 步数 ({}), 停止执行",
            MAX_REACT_STEPS
        );
        events.chunk(&warning, &warning)?;
        events.done()?;
        Ok(())
    }

    fn initial_messages(
        &self,
        user_messages: Vec<ChatMessage>,
    ) -> Result<Vec<ChatCompletionRequestMessage>, String> {
        let mut messages: Vec<ChatCompletionRequestMessage> =
            vec![ChatCompletionRequestSystemMessageArgs::default()
                .content(SystemPromptBuilder::new().build())
                .build()
                .map_err(|e| format!("构建系统消息失败: {}", e))?
                .into()];

        for msg in user_messages {
            match msg.role.as_str() {
                "user" => eprintln!("[User] {}", msg.content),
                "assistant" => eprintln!("[Assistant] {}", msg.content),
                "tool" => eprintln!("[Tool] {}", msg.content),
                _ => eprintln!("[{}] {}", msg.role, msg.content),
            }
            messages.push(self.convert_message(msg)?);
        }

        Ok(messages)
    }

    async fn call_model_step(
        &self,
        messages: &[ChatCompletionRequestMessage],
        events: &AgentEvents<'_>,
    ) -> Result<ModelStep, String> {
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
        let mut raw_tool_calls: Vec<Value> = Vec::new();
        let mut finish_reason: Option<FinishReason> = None;

        while let Some(result) = stream.next().await {
            let response = result.map_err(|e| {
                eprintln!("[Agent] 流式错误: {}", e);
                format!("流式错误: {}", e)
            })?;

            for choice in response.choices {
                if let Some(content) = &choice.delta.content {
                    full_content.push_str(content);
                    events.chunk(content, &full_content)?;
                }

                if let Some(delta_tool_calls) = &choice.delta.tool_calls {
                    Self::merge_tool_call_chunks(&mut raw_tool_calls, delta_tool_calls);
                }

                if let Some(reason) = &choice.finish_reason {
                    finish_reason = Some(reason.clone());
                }
            }
        }

        let tool_calls = raw_tool_calls
            .iter()
            .map(ToolInvocation::from_value)
            .collect::<Result<Vec<_>, _>>()?;

        if !tool_calls.is_empty() {
            events.tool_calls(&tool_calls, &full_content)?;
        }

        if !full_content.is_empty() {
            eprintln!("[Assistant] {}", full_content);
        }

        Ok(ModelStep {
            finish_reason,
            content: full_content,
            tool_calls,
        })
    }

    fn merge_tool_call_chunks(
        tool_calls: &mut Vec<Value>,
        chunks: &[async_openai::types::ChatCompletionMessageToolCallChunk],
    ) {
        for chunk in chunks {
            let index = chunk.index as usize;

            while tool_calls.len() <= index {
                tool_calls.push(serde_json::json!({
                    "id": "",
                    "type": "function",
                    "function": {"name": "", "arguments": ""}
                }));
            }

            if let Some(id) = &chunk.id {
                tool_calls[index]["id"] = Value::String(id.clone());
            }

            if let Some(function) = &chunk.function {
                if let Some(name) = &function.name {
                    tool_calls[index]["function"]["name"] = Value::String(name.clone());
                }
                if let Some(args) = &function.arguments {
                    let current_args = tool_calls[index]["function"]["arguments"]
                        .as_str()
                        .unwrap_or("");
                    tool_calls[index]["function"]["arguments"] =
                        Value::String(format!("{}{}", current_args, args));
                }
            }
        }
    }

    async fn execute_tool(
        &self,
        invocation: &ToolInvocation,
        events: &AgentEvents<'_>,
    ) -> Result<String, String> {
        eprintln!("[Agent] 🔧 开始执行工具: {}", invocation.name);
        eprintln!(
            "[Agent]    参数: {}",
            serde_json::to_string_pretty(&invocation.arguments)
                .unwrap_or_else(|_| invocation.arguments_json.clone())
        );

        events.tool_start(invocation)?;

        let (tool_result, tool_status) =
            match ToolExecutor::execute(&self.window, &self.message_id, invocation).await {
                Ok(result) => {
                    eprintln!("[Agent] ✅ 工具 {} 执行成功", invocation.name);
                    (result, "success")
                }
                Err(e) => {
                    eprintln!("[Agent] ❌ 工具 {} 执行失败: {}", invocation.name, e);
                    (format!("工具执行错误: {}", e), "error")
                }
            };

        events.tool_done(invocation, &tool_result, tool_status)?;
        let result_preview = tool_result.chars().take(200).collect::<String>();
        eprintln!("[Agent]    结果预览: {}", result_preview);

        Ok(tool_result)
    }

    /// 转换 ChatMessage 到 OpenAI 格式
    fn convert_message(&self, msg: ChatMessage) -> Result<ChatCompletionRequestMessage, String> {
        match msg.role.as_str() {
            "user" => Ok(ChatCompletionRequestUserMessageArgs::default()
                .content(msg.content)
                .build()
                .map_err(|e| format!("构建用户消息失败: {}", e))?
                .into()),
            "assistant" => self.convert_assistant_message(msg),
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

    fn convert_assistant_message(
        &self,
        msg: ChatMessage,
    ) -> Result<ChatCompletionRequestMessage, String> {
        let mut assistant_msg = ChatCompletionRequestAssistantMessageArgs::default();
        assistant_msg.content(msg.content);

        if let Some(tool_calls) = msg.tool_calls {
            let converted = tool_calls
                .into_iter()
                .map(|tool_call| ToolInvocation {
                    id: tool_call.id,
                    name: tool_call.function.name,
                    arguments_json: tool_call.function.arguments.clone(),
                    arguments: serde_json::from_str(&tool_call.function.arguments)
                        .unwrap_or(Value::Null),
                })
                .map(|invocation| invocation.to_openai_tool_call())
                .collect::<Vec<_>>();

            if !converted.is_empty() {
                assistant_msg.tool_calls(converted);
            }
        }

        Ok(assistant_msg
            .build()
            .map_err(|e| format!("构建助手消息失败: {}", e))?
            .into())
    }
}
