use std::process::Command;
use tauri::async_runtime::spawn_blocking;
use crate::types::{RunCommandOptions, RunCommandResult};

#[tauri::command]
pub async fn run_command(options: RunCommandOptions) -> Result<RunCommandResult, String> {
    let task = spawn_blocking(move || {
        let command_str = options.command.clone();
        let args = options.args.clone().unwrap_or_default();
        let shell = options.shell.clone();
        let working_dir = options.working_dir.clone();
        // 注意：timeout 功能暂未实现，保留参数以便未来扩展
        let _timeout = options.timeout_seconds.unwrap_or(60);

        // 确定使用的 shell
        let (shell_cmd, shell_args) = if cfg!(windows) {
            // Windows: 默认使用 PowerShell，也可以使用 CMD
            match shell.as_deref() {
                Some("cmd") | Some("CMD") => {
                    // 使用 CMD
                    let mut cmd_args = vec!["/C".to_string()];
                    cmd_args.push(command_str);
                    cmd_args.extend(args);
                    ("cmd", cmd_args)
                }
                _ => {
                    // 默认使用 PowerShell
                    let mut ps_args = vec!["-NoProfile".to_string(), "-Command".to_string()];
                    ps_args.push(command_str);
                    if !args.is_empty() {
                        ps_args.extend(args);
                    }
                    ("powershell", ps_args)
                }
            }
        } else {
            // Unix/Linux/Mac: 使用 bash 或 sh
            match shell.as_deref() {
                Some("sh") => {
                    let mut sh_args = vec!["-c".to_string()];
                    let full_cmd = if args.is_empty() {
                        command_str
                    } else {
                        format!("{} {}", command_str, args.join(" "))
                    };
                    sh_args.push(full_cmd);
                    ("sh", sh_args)
                }
                _ => {
                    // 默认使用 bash
                    let mut bash_args = vec!["-c".to_string()];
                    let full_cmd = if args.is_empty() {
                        command_str
                    } else {
                        format!("{} {}", command_str, args.join(" "))
                    };
                    bash_args.push(full_cmd);
                    ("bash", bash_args)
                }
            }
        };

        // 构建命令
        let mut cmd = Command::new(shell_cmd);
        cmd.args(&shell_args);

        // 设置工作目录
        if let Some(ref dir) = working_dir {
            cmd.current_dir(dir);
        }

        // 执行命令
        let output = cmd
            .output()
            .map_err(|e| format!("执行命令失败: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let exit_code = output.status.code().unwrap_or(-1);
        let success = output.status.success();

        Ok(RunCommandResult {
            stdout,
            stderr,
            exit_code,
            success,
        })
    });

    // 注意：这里没有实现真正的超时，因为 spawn_blocking 不支持超时
    // 如果需要超时，可以使用 tokio::time::timeout 包装整个命令
    task.await.map_err(|err| err.to_string())?
}

