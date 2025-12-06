// LLM 模块 - Agent 架构，使用 async-openai
mod prompts;
mod tools;
mod agent;
mod executor;

use tauri::Window;
use crate::types::ChatMessage;
use agent::Agent;

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
        .unwrap_or_else(|_| "sk-zlrkdqipalbjrrgygpzvhgcfnebaealwfkfvpkcdrzpfycsi".to_string());

    let model_name = model.unwrap_or_else(|| "Qwen/Qwen2.5-72B-Instruct".to_string());
    
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
