use reqwest::Client;
use serde_json::Value;
use tauri::{Emitter, Window};
use futures_util::StreamExt;
use crate::types::ChatMessage;

#[tauri::command]

pub async fn call_llm_stream(
    window: Window,
    messages: Vec<ChatMessage>,
    model: Option<String>,
    message_id: String,
) -> Result<(), String> {
    // 优先使用环境变量，开发阶段如果没有环境变量则使用硬编码的 API Key
    let api_key = std::env::var("SILICONFLOW_API_KEY")
        .unwrap_or_else(|_| "sk-zlrkdqipalbjrrgygpzvhgcfnebaealwfkfvpkcdrzpfycsi".to_string());

    let model_name = model.unwrap_or_else(|| "Qwen/Qwen2.5-72B-Instruct".to_string());
    let client = Client::new();

    // 检测操作系统环境和用户信息
    let os_info = if cfg!(target_os = "windows") {
        "Windows"
    } else if cfg!(target_os = "macos") {
        "macOS"
    } else if cfg!(target_os = "linux") {
        "Linux"
    } else {
        "Unknown"
    };
    
    // 获取用户名和常用路径
    let username = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "User".to_string());
    
    let user_profile = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| "~".to_string());
    
    let desktop_path = if cfg!(target_os = "windows") {
        format!("{}\\Desktop", user_profile)
    } else {
        format!("{}/Desktop", user_profile)
    };
    
    let documents_path = if cfg!(target_os = "windows") {
        format!("{}\\Documents", user_profile)
    } else {
        format!("{}/Documents", user_profile)
    };

    // 添加 system prompt 说明可用的 tools
    let system_prompt = format!(r#"你是一个桌面智能代理助手，可以帮助用户完成各种电脑任务。

【系统环境信息】
- 操作系统: {}
- 当前用户: {}
- 用户目录: {}
- 桌面路径: {}
- 文档路径: {}

【重要规则】
1. **路径处理**：
   - 在执行任何文件操作前，务必确认路径是否正确
   - 用户说"桌面"时，使用上面提供的准确桌面路径：{}
   - 用户说"我的文档"时，使用文档路径：{}
   - 不要使用占位符路径（如 C:\\Users\\YourUsername）

2. **命令选择**（当前系统：{}）：
   - Windows 系统：使用 PowerShell（Get-ChildItem, Get-Process, [Environment]::GetFolderPath）
   - macOS/Linux：使用 Bash/Sh（ls, du, ps, whoami）
   - 不要混用不同平台的命令

3. **下载文件最佳实践**：
   - 下载到目录时，务必提供有意义的 filename（如 "firefox_setup.exe"）
   - 避免使用 URL 中的参数作为文件名
   - 为大文件下载提供合理的文件名和扩展名

4. **工具调用建议**：
   - 先用 list_files 了解目录结构
   - 再用 read_file 读取需要的文件
   - 使用 run_command 查询系统信息（如获取环境变量）
   - 危险操作前先向用户确认

你可以使用以下工具：

【文件列表和搜索】
1. list_files - 列出指定目录下的文件和文件夹
2. read_file - 读取文件内容（默认最大 10MB）
3. search_in_files - 在多个文件中搜索文本模式

【文件操作】
4. delete_file - 删除文件或目录（默认移动到回收站，可恢复；支持递归删除）
5. rename_file - 重命名或移动文件/目录
6. copy_file - 复制文件或目录（支持覆盖）

【文件内容操作】
7. write_file - 创建新文件或覆盖现有文件
8. append_to_file - 在文件末尾追加内容
9. replace_in_file - 在文件中查找并替换文本

【网络操作】
10. download_file - 从 URL 下载文件到指定位置
11. fetch_webpage - 获取网页内容并提取文本、链接和元数据信息

【系统命令】
12. run_command - 执行系统命令（PowerShell/CMD on Windows, Bash/Sh on Mac/Linux）。用于执行工具没有覆盖到的操作。

当用户提出需求时，你应该：
1. 先使用 list_files 了解文件结构
2. 使用 read_file 读取需要分析的文件内容
3. 使用 search_in_files 在多个文件中搜索关键词
4. 使用 write_file、append_to_file、replace_in_file 修改文件内容
5. 使用 rename_file、copy_file 管理文件
6. 使用 delete_file 删除不需要的文件（默认移动到回收站，可恢复；设置 permanent=true 可永久删除，谨慎使用！）
7. 使用 download_file 下载网络文件
8. 使用 fetch_webpage 获取网页内容，提取文本、链接和元数据，用于信息检索和分析
9. 使用 run_command 执行系统命令，处理工具没有覆盖到的操作（如安装软件、修改系统设置等）

请始终使用工具来完成用户请求的实际操作，而不是只提供建议。对于危险操作（如删除文件、执行系统命令），请先确认用户意图。"#, 
        os_info, username, user_profile, desktop_path, documents_path,
        desktop_path, documents_path, os_info);

    // 构建消息列表，确保包含 system prompt
    let mut valid_messages: Vec<serde_json::Value> = vec![serde_json::json!({
        "role": "system",
        "content": system_prompt
    })];

    // 转换用户消息
    for msg in messages {
        let role = msg.role.as_str();
        if role == "user" || role == "assistant" || role == "system" || role == "tool" {
            let mut message = serde_json::json!({
                "role": role,
                "content": msg.content
            });
            
            // 如果有 tool_calls，添加到消息中
            if let Some(tool_calls) = msg.tool_calls {
                message["tool_calls"] = serde_json::to_value(tool_calls).unwrap();
            }
            
            // 如果有 tool_call_id，添加到消息中
            if let Some(tool_call_id) = msg.tool_call_id {
                message["tool_call_id"] = serde_json::Value::String(tool_call_id);
            }
            
            valid_messages.push(message);
        }
    }
    
    if valid_messages.len() <= 1 {
        return Err("No valid messages provided".to_string());
    }

    // 定义可用的 tools
    let tools = vec![
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "list_files",
                "description": "列出指定目录下的文件和文件夹。支持递归扫描、模式匹配和结果限制。默认不包含隐藏文件。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "要扫描的目录路径，例如 'D:\\' 或 'C:\\Users\\Username\\Documents'"
                        },
                        "recursive": {
                            "type": "boolean",
                            "description": "是否递归扫描子目录，默认为 false"
                        },
                        "pattern": {
                            "type": "string",
                            "description": "文件名模式匹配（不区分大小写），例如 '*.ts' 或 'test'"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "返回结果的最大数量，默认为 200"
                        },
                        "include_hidden": {
                            "type": "boolean",
                            "description": "是否包含隐藏文件（以 . 开头的文件或系统隐藏文件），默认为 false"
                        }
                    },
                    "required": ["path"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "读取文件内容。支持文本文件，默认最大 10MB。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "要读取的文件路径"
                        },
                        "encoding": {
                            "type": "string",
                            "description": "文件编码，默认为 utf-8"
                        },
                        "max_size": {
                            "type": "integer",
                            "description": "最大读取大小（字节），默认为 10485760 (10MB)"
                        }
                    },
                    "required": ["path"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "search_in_files",
                "description": "在多个文件中搜索文本模式。支持文件类型过滤和大小写敏感选项。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "要搜索的目录路径"
                        },
                        "pattern": {
                            "type": "string",
                            "description": "要搜索的文本模式"
                        },
                        "file_pattern": {
                            "type": "string",
                            "description": "文件类型过滤，例如 '*.ts' 或 '*.js'，可选"
                        },
                        "recursive": {
                            "type": "boolean",
                            "description": "是否递归搜索子目录，默认为 true"
                        },
                        "case_sensitive": {
                            "type": "boolean",
                            "description": "是否区分大小写，默认为 false"
                        }
                    },
                    "required": ["path", "pattern"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "delete_file",
                "description": "删除文件或目录（默认移动到回收站，可恢复）。删除目录时需要设置 recursive=true。设置 permanent=true 可永久删除（不可恢复）。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "要删除的文件或目录路径"
                        },
                        "recursive": {
                            "type": "boolean",
                            "description": "删除目录时是否递归删除所有内容，默认为 false"
                        },
                        "permanent": {
                            "type": "boolean",
                            "description": "是否永久删除（不移动到回收站），默认为 false（移动到回收站）"
                        }
                    },
                    "required": ["path"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "rename_file",
                "description": "重命名或移动文件/目录。如果目标路径在不同目录，则执行移动操作。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "old_path": {
                            "type": "string",
                            "description": "源文件或目录路径"
                        },
                        "new_path": {
                            "type": "string",
                            "description": "目标文件或目录路径"
                        }
                    },
                    "required": ["old_path", "new_path"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "copy_file",
                "description": "复制文件或目录到新位置。支持覆盖已存在的文件。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "source": {
                            "type": "string",
                            "description": "源文件或目录路径"
                        },
                        "destination": {
                            "type": "string",
                            "description": "目标文件或目录路径"
                        },
                        "overwrite": {
                            "type": "boolean",
                            "description": "如果目标已存在，是否覆盖，默认为 false"
                        }
                    },
                    "required": ["source", "destination"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "write_file",
                "description": "创建新文件或覆盖现有文件。如果文件已存在，会被完全覆盖。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "文件路径"
                        },
                        "content": {
                            "type": "string",
                            "description": "要写入的文件内容"
                        },
                        "encoding": {
                            "type": "string",
                            "description": "文件编码，默认为 utf-8"
                        }
                    },
                    "required": ["path", "content"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "append_to_file",
                "description": "在文件末尾追加内容。如果文件不存在会返回错误。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "文件路径"
                        },
                        "content": {
                            "type": "string",
                            "description": "要追加的内容"
                        }
                    },
                    "required": ["path", "content"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "replace_in_file",
                "description": "在文件中查找并替换文本。支持普通文本替换，暂不支持正则表达式。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "文件路径"
                        },
                        "search": {
                            "type": "string",
                            "description": "要查找的文本"
                        },
                        "replace": {
                            "type": "string",
                            "description": "替换为的文本"
                        },
                        "regex": {
                            "type": "boolean",
                            "description": "是否使用正则表达式，默认为 false（暂不支持）"
                        }
                    },
                    "required": ["path", "search", "replace"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "download_file",
                "description": "从 URL 下载文件到指定位置。如果 destination 是目录，会使用 filename 或从 URL 提取文件名。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": {
                            "type": "string",
                            "description": "要下载的文件 URL"
                        },
                        "destination": {
                            "type": "string",
                            "description": "保存位置（文件路径或目录路径）"
                        },
                        "filename": {
                            "type": "string",
                            "description": "文件名（当 destination 是目录时使用），可选"
                        }
                    },
                    "required": ["url", "destination"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "fetch_webpage",
                "description": "获取网页内容并提取文本、链接和元数据信息。用于从网页中检索信息、分析内容、提取链接等。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": {
                            "type": "string",
                            "description": "要获取的网页 URL，例如 'https://example.com'"
                        },
                        "extract_text": {
                            "type": "boolean",
                            "description": "是否提取纯文本（去除 HTML 标签），默认为 true"
                        },
                        "extract_links": {
                            "type": "boolean",
                            "description": "是否提取所有链接，默认为 false"
                        },
                        "extract_meta": {
                            "type": "boolean",
                            "description": "是否提取 meta 标签信息（描述、关键词、作者、Open Graph 等），默认为 true"
                        },
                        "max_length": {
                            "type": "integer",
                            "description": "提取文本的最大长度（字符数），默认为 100000"
                        },
                        "timeout_seconds": {
                            "type": "integer",
                            "description": "请求超时时间（秒），默认为 30"
                        }
                    },
                    "required": ["url"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "run_command",
                "description": "执行系统命令。Windows 默认使用 PowerShell，Mac/Linux 默认使用 Bash。用于执行工具没有覆盖到的操作，如安装软件、修改系统设置、运行脚本等。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": {
                            "type": "string",
                            "description": "要执行的命令，例如 'Get-Process' (PowerShell) 或 'ls -la' (Bash)"
                        },
                        "args": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "命令参数列表（可选）"
                        },
                        "shell": {
                            "type": "string",
                            "description": "指定使用的 shell：Windows 支持 'powershell' 或 'cmd'，Mac/Linux 支持 'bash' 或 'sh'。默认自动检测。"
                        },
                        "working_dir": {
                            "type": "string",
                            "description": "命令执行的工作目录（可选）"
                        },
                        "timeout_seconds": {
                            "type": "integer",
                            "description": "命令超时时间（秒），默认为 60"
                        }
                    },
                    "required": ["command"]
                }
            }
        })
    ];

    // 构建请求体，启用流式输出和 tools
    let body = serde_json::json!({
        "model": model_name,
        "messages": valid_messages,
        "tools": tools,
        "temperature": 0.0,
        "stream": true
    });

    eprintln!("[call_llm_stream] 发送流式请求到 SiliconFlow, model: {}, messages count: {}", model_name, valid_messages.len());
    
    let mut stream = client
        .post("https://api.siliconflow.cn/v1/chat/completions")
        .bearer_auth(&api_key)
        .json(&body)
        .send()
        .await
        .map_err(|err| {
            eprintln!("[call_llm_stream] 网络请求失败: {}", err);
            format!("Request error: {err}")
        })?
        .bytes_stream();

    let mut full_content = String::new();
    let mut buffer = String::new();
    let mut tool_calls: Vec<Value> = Vec::new();

    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|err| {
            eprintln!("[call_llm_stream] 读取流数据失败: {}", err);
            format!("Stream error: {err}")
        })?;
        
        let text = String::from_utf8_lossy(&chunk);
        buffer.push_str(&text);
        
        // 处理完整的行
        while let Some(newline_pos) = buffer.find('\n') {
            let line = buffer[..newline_pos].trim().to_string();
            buffer = buffer[newline_pos + 1..].to_string();
            
            if line.starts_with("data: ") {
                let data = line[6..].trim();
                if data == "[DONE]" {
                    // 检查是否有 tool_calls 需要执行
                    if !tool_calls.is_empty() {
                        eprintln!("[call_llm_stream] 检测到 tool_calls，需要执行: {:?}", tool_calls);
                        window.emit("llm-stream-tool-calls", serde_json::json!({
                            "message_id": message_id,
                            "tool_calls": tool_calls,
                            "content": full_content
                        })).map_err(|e| format!("Emit error: {e}"))?;
                    } else {
                        window.emit("llm-stream-done", &message_id).map_err(|e| format!("Emit error: {e}"))?;
                    }
                    return Ok(());
                }
                
                if let Ok(json) = serde_json::from_str::<Value>(data) {
                    let choice = json["choices"].get(0);
                    
                    // 处理 content delta
                    if let Some(delta) = choice.and_then(|c| c["delta"].get("content")) {
                        if let Some(content) = delta.as_str() {
                            full_content.push_str(content);
                            eprint!("{}", content); // 实时输出到终端
                            window.emit("llm-stream-chunk", serde_json::json!({
                                "message_id": message_id,
                                "content": content,
                                "full_content": full_content.clone()
                            })).map_err(|e| format!("Emit error: {e}"))?;
                        }
                    }
                    
                    // 处理 tool_calls delta - 累积 tool_calls
                    if let Some(tool_calls_delta) = choice.and_then(|c| c["delta"].get("tool_calls")) {
                        if tool_calls_delta.is_array() {
                            for tc_delta in tool_calls_delta.as_array().unwrap() {
                                if let Some(index) = tc_delta.get("index").and_then(|i| i.as_u64()) {
                                    let index = index as usize;
                                    
                                    // 确保 tool_calls 数组足够大
                                    while tool_calls.len() <= index {
                                        tool_calls.push(serde_json::json!({
                                            "id": "",
                                            "type": "function",
                                            "function": {"name": "", "arguments": ""}
                                        }));
                                    }
                                    
                                    // 更新 tool_call
                                    if let Some(id) = tc_delta.get("id").and_then(|i| i.as_str()) {
                                        tool_calls[index]["id"] = serde_json::Value::String(id.to_string());
                                        eprintln!("[call_llm_stream] Tool call #{} ID: {}", index, id);
                                    }
                                    if let Some(function) = tc_delta.get("function") {
                                        if let Some(name) = function.get("name").and_then(|n| n.as_str()) {
                                            tool_calls[index]["function"]["name"] = serde_json::Value::String(name.to_string());
                                            eprintln!("[call_llm_stream] Tool call #{} 函数: {}", index, name);
                                        }
                                        if let Some(args) = function.get("arguments").and_then(|a| a.as_str()) {
                                            let current_args = tool_calls[index]["function"]["arguments"].as_str().unwrap_or("");
                                            tool_calls[index]["function"]["arguments"] = serde_json::Value::String(format!("{}{}", current_args, args));
                                            eprint!("{}", args); // 实时输出参数
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 流结束，检查是否有 tool_calls
    if !tool_calls.is_empty() {
        eprintln!("[call_llm_stream] 流结束，检测到 tool_calls: {:?}", tool_calls);
        window.emit("llm-stream-tool-calls", serde_json::json!({
            "message_id": message_id,
            "tool_calls": tool_calls,
            "content": full_content
        })).map_err(|e| format!("Emit error: {e}"))?;
    } else {
        window.emit("llm-stream-done", &message_id).map_err(|e| format!("Emit error: {e}"))?;
    }
    Ok(())
}

