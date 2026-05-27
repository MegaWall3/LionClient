use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
pub struct RunCommandOptions {
    pub command: String,
    pub args: Option<Vec<String>>,
    pub shell: Option<String>, // "powershell", "cmd", "bash", "sh" 等，默认自动检测
    pub working_dir: Option<String>, // 工作目录
    pub timeout_seconds: Option<u64>, // 超时时间（秒），默认 60
}

#[derive(Debug, Clone, Serialize)]
pub struct RunCommandResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub success: bool,
}
