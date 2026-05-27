use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex, OnceLock},
};
use tauri::{Emitter, Window};
use tokio::sync::oneshot;

use super::runtime::ToolInvocation;

#[derive(Clone, Serialize)]
struct ApprovalRequiredEvent {
    request_id: String,
    message_id: String,
    tool_id: String,
    tool_name: String,
    risk: String,
    summary: String,
    arguments: Value,
}

#[derive(Debug, Deserialize)]
pub struct ApprovalDecision {
    pub request_id: String,
    pub approved: bool,
}

type ApprovalSender = oneshot::Sender<bool>;
type ApprovalWaiters = Mutex<HashMap<String, ApprovalSender>>;

static APPROVAL_WAITERS: OnceLock<Arc<ApprovalWaiters>> = OnceLock::new();

fn waiters() -> &'static Arc<ApprovalWaiters> {
    APPROVAL_WAITERS.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

pub fn requires_approval(invocation: &ToolInvocation) -> bool {
    match invocation.name.as_str() {
        "write_file" => true,
        "run_command" => {
            let command = invocation
                .arguments
                .get("command")
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .to_lowercase();

            let risky_tokens = [
                "rm ",
                "rm -",
                "trash",
                "mv ",
                "cp ",
                "chmod",
                "chown",
                "curl",
                "wget",
                "install",
                "brew ",
                "npm ",
                "pnpm ",
                "cargo ",
                "git push",
                "git commit",
                "git reset",
                "git checkout",
                "sudo",
                "osascript",
            ];

            risky_tokens.iter().any(|token| command.contains(token))
        }
        _ => false,
    }
}

pub async fn request_tool_approval(
    window: &Window,
    message_id: &str,
    invocation: &ToolInvocation,
) -> Result<bool, String> {
    let request_id = format!("{}:{}", message_id, invocation.id);
    let (sender, receiver) = oneshot::channel();

    waiters()
        .lock()
        .map_err(|_| "确认队列已损坏".to_string())?
        .insert(request_id.clone(), sender);

    let event = ApprovalRequiredEvent {
        request_id: request_id.clone(),
        message_id: message_id.to_string(),
        tool_id: invocation.id.clone(),
        tool_name: invocation.name.clone(),
        risk: approval_risk(invocation).to_string(),
        summary: approval_summary(invocation),
        arguments: invocation.arguments.clone(),
    };

    if let Err(err) = window.emit("llm-approval-required", event) {
        let _ = waiters()
            .lock()
            .map_err(|_| "确认队列已损坏".to_string())?
            .remove(&request_id);
        return Err(format!("Emit error: {}", err));
    }

    receiver
        .await
        .map_err(|_| "确认请求已取消，工具未执行".to_string())
}

#[tauri::command]
pub async fn resolve_llm_approval(decision: ApprovalDecision) -> Result<(), String> {
    let sender = waiters()
        .lock()
        .map_err(|_| "确认队列已损坏".to_string())?
        .remove(&decision.request_id)
        .ok_or_else(|| "确认请求不存在或已过期".to_string())?;

    sender
        .send(decision.approved)
        .map_err(|_| "确认请求已结束".to_string())
}

fn approval_risk(invocation: &ToolInvocation) -> &'static str {
    match invocation.name.as_str() {
        "write_file" => "write",
        "run_command" => "shell",
        _ => "tool",
    }
}

fn approval_summary(invocation: &ToolInvocation) -> String {
    match invocation.name.as_str() {
        "write_file" => invocation
            .arguments
            .get("path")
            .and_then(|value| value.as_str())
            .map(|path| format!("写入或覆盖文件：{}", path))
            .unwrap_or_else(|| "写入文件".to_string()),
        "run_command" => invocation
            .arguments
            .get("command")
            .and_then(|value| value.as_str())
            .map(|command| format!("执行命令：{}", command))
            .unwrap_or_else(|| "执行系统命令".to_string()),
        _ => format!("执行工具：{}", invocation.name),
    }
}
