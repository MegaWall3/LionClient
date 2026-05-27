// LLM 模块 - Agent 架构，使用 async-openai
mod agent;
mod approval;
mod executor;
mod prompts;
mod runtime;
mod tools;

use crate::types::ChatMessage;
use agent::Agent;
pub use approval::resolve_llm_approval;
use runtime::AgentRunConfig;
use tauri::Window;

/// LLM Agent 入口 - 自动执行工具调用循环
#[tauri::command]
pub async fn call_llm_stream(
    window: Window,
    messages: Vec<ChatMessage>,
    model: Option<String>,
    message_id: String,
) -> Result<(), String> {
    let config = AgentRunConfig::siliconflow(model, message_id)?;

    eprintln!("[LLM] 启动 Agent, model: {}", config.model);

    // 创建 Agent 实例
    let agent = Agent::new(config, window);

    // 运行 Agent 循环
    agent.run_stream(messages).await
}
