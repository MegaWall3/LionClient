// LLM 模块 - Agent 架构，使用 async-openai
mod agent;
mod executor;
mod prompts;
mod tools;

use crate::types::ChatMessage;
use agent::Agent;
use tauri::Window;

/// LLM Agent 入口 - 自动执行工具调用循环
#[tauri::command]
pub async fn call_llm_stream(
    window: Window,
    messages: Vec<ChatMessage>,
    model: Option<String>,
    message_id: String,
) -> Result<(), String> {
    // 获取 API 配置
    let api_key = std::env::var("SILICONFLOW_API_KEY")
        .map_err(|_| "缺少 SILICONFLOW_API_KEY 环境变量，请先配置 SiliconFlow API Key".to_string())?;

    let model_name = model.unwrap_or_else(|| "deepseek-ai/DeepSeek-V3.2".to_string());

    eprintln!("[LLM] 启动 Agent, model: {}", model_name);

    // 创建 Agent 实例
    let agent = Agent::new(
        api_key,
        "https://api.siliconflow.cn/v1".to_string(),
        model_name,
        window,
        message_id,
    );

    // 运行 Agent 循环
    agent.run_stream(messages).await
}
