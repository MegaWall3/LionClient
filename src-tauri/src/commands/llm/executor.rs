// Tool Executor - 统一执行所有工具调用
use crate::commands::{files, network, shell};
use crate::types::{ListFilesOptions, RunCommandOptions};
use serde_json::Value;
use tauri::Window;

use super::approval::{request_tool_approval, requires_approval};
use super::runtime::ToolInvocation;

// 直接从 files 模块导入 Options 结构体
// 注意：这些结构体在 files.rs 中定义，但没有通过 mod.rs 重新导出
// 我们需要在这里重新定义或者修改 files.rs 的可见性

// 临时方案：自定义结构体并转换
// 或者更好的方案：将这些结构体移到 types 模块

/// Tool Executor - 根据工具名称和参数执行对应的 Tauri command
pub struct ToolExecutor;

impl ToolExecutor {
    /// 执行单个工具调用
    pub async fn execute(
        window: &Window,
        message_id: &str,
        invocation: &ToolInvocation,
    ) -> Result<String, String> {
        eprintln!(
            "[ToolExecutor] 执行工具: {} with args: {}",
            invocation.name, invocation.arguments
        );

        if requires_approval(invocation) {
            let approved = request_tool_approval(window, message_id, invocation).await?;
            if !approved {
                return Err("用户拒绝了这个工具调用".to_string());
            }
        }

        match invocation.name.as_str() {
            // 核心工具
            "run_command" => Self::exec_run_command(invocation.arguments.clone()).await,

            // 文件系统工具
            "list_files" => Self::exec_list_files(invocation.arguments.clone()).await,
            "read_file" => Self::exec_read_file(invocation.arguments.clone()).await,
            "search_in_files" => Self::exec_search_in_files(invocation.arguments.clone()).await,
            "write_file" => Self::exec_write_file(invocation.arguments.clone()).await,

            // 网络工具
            "fetch_webpage" => Self::exec_fetch_webpage(invocation.arguments.clone()).await,

            _ => Err(format!(
                "未知工具: {}。提示：文件下载请根据当前系统使用 curl、wget 或平台原生命令",
                invocation.name
            )),
        }
    }

    async fn exec_list_files(args: Value) -> Result<String, String> {
        let options: ListFilesOptions =
            serde_json::from_value(args).map_err(|e| format!("解析参数失败: {}", e))?;
        let result = files::list_files(options).await?;
        serde_json::to_string_pretty(&result).map_err(|e| format!("序列化结果失败: {}", e))
    }

    async fn exec_read_file(args: Value) -> Result<String, String> {
        // 直接使用 JSON Value 构造，绕过类型定义
        let path = args
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or("缺少 path 参数")?
            .to_string();
        let max_size = args
            .get("max_size")
            .and_then(|v| v.as_u64())
            .map(|n| n as usize);

        let options = serde_json::json!({
            "path": path,
            "max_size": max_size
        });
        let options =
            serde_json::from_value(options).map_err(|e| format!("构造参数失败: {}", e))?;
        files::read_file(options).await
    }

    async fn exec_search_in_files(args: Value) -> Result<String, String> {
        let options = serde_json::from_value(args).map_err(|e| format!("解析参数失败: {}", e))?;
        let result = files::search_in_files(options).await?;
        serde_json::to_string_pretty(&result).map_err(|e| format!("序列化结果失败: {}", e))
    }

    async fn exec_write_file(args: Value) -> Result<String, String> {
        let options = serde_json::from_value(args).map_err(|e| format!("解析参数失败: {}", e))?;
        files::write_file(options).await
    }

    async fn exec_fetch_webpage(args: Value) -> Result<String, String> {
        let options: network::FetchWebpageOptions =
            serde_json::from_value(args).map_err(|e| format!("解析参数失败: {}", e))?;
        let result = network::fetch_webpage(options).await?;
        serde_json::to_string_pretty(&result).map_err(|e| format!("序列化结果失败: {}", e))
    }

    async fn exec_run_command(args: Value) -> Result<String, String> {
        let options: RunCommandOptions =
            serde_json::from_value(args.clone()).map_err(|e| format!("解析参数失败: {}", e))?;

        // 检查是否是下载命令
        let command = options.command.to_lowercase();
        let is_download = command.contains("invoke-webrequest")
            || command.contains("curl")
            || command.contains("wget");

        // 提取文件路径（如果存在）
        let file_path = if is_download {
            Self::extract_download_path(&options.command)
        } else {
            None
        };

        // 执行命令
        let result = shell::run_command(options).await?;
        let result_str =
            serde_json::to_string_pretty(&result).map_err(|e| format!("序列化结果失败: {}", e))?;

        // 如果是下载命令，验证文件
        if is_download {
            if let Some(path) = file_path {
                Self::verify_download_file(&path);
            }
        }

        Ok(result_str)
    }

    /// 从命令中提取下载文件路径
    fn extract_download_path(command: &str) -> Option<String> {
        // 查找 -OutFile 参数（PowerShell）
        if let Some(outfile_pos) = command.find("-OutFile") {
            let after_outfile = &command[outfile_pos + 8..];
            // 查找引号或空格后的路径
            let path_start =
                after_outfile.find(|c: char| c == '"' || c == '\'' || !c.is_whitespace())?;
            let path = &after_outfile[path_start..];
            let path_end = path
                .find(|c: char| c == '"' || c == '\'' || c == ' ' || c == '\n' || c == '\r')
                .unwrap_or(path.len());
            let file_path = path[..path_end]
                .trim_matches(|c| c == '"' || c == '\'')
                .trim();
            if !file_path.is_empty() {
                return Some(file_path.to_string());
            }
        }

        // 查找 -o 参数（curl）
        if let Some(o_pos) = command.find("-o ") {
            let after_o = &command[o_pos + 3..];
            let path = after_o.split_whitespace().next()?;
            if !path.is_empty() {
                return Some(path.to_string());
            }
        }

        None
    }

    /// 验证下载文件是否存在且大小正常
    fn verify_download_file(file_path: &str) {
        match std::fs::metadata(file_path) {
            Ok(metadata) => {
                let size = metadata.len();
                if size > 0 {
                    eprintln!(
                        "[ToolExecutor] ✅ 下载验证成功: {} (大小: {} 字节)",
                        file_path, size
                    );
                } else {
                    eprintln!(
                        "[ToolExecutor] ⚠️ 警告: 文件存在但大小为 0 字节: {}",
                        file_path
                    );
                }
            }
            Err(e) => {
                eprintln!(
                    "[ToolExecutor] ⚠️ 警告: 无法验证文件是否存在: {} (错误: {})",
                    file_path, e
                );
            }
        }
    }
}
