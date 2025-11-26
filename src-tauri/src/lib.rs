use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;
use tauri::async_runtime::spawn_blocking;
use tauri::{Emitter, Window};
use walkdir::WalkDir;
use futures_util::StreamExt;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ListFilesOptions {
    pub path: String,
    pub recursive: Option<bool>,
    pub pattern: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileEntry {
    pub path: String,
    pub file_type: String,
    pub size: Option<u64>,
    pub modified_ms: Option<u64>,
}

#[tauri::command]
async fn call_llm_stream(
    window: Window,
    messages: Vec<ChatMessage>,
    model: Option<String>,
    message_id: String,
) -> Result<(), String> {
    // 优先使用环境变量，开发阶段如果没有环境变量则使用硬编码的 API Key
    let api_key = std::env::var("SILICONFLOW_API_KEY")
        .unwrap_or_else(|_| "sk-zlrkdqipalbjrrgygpzvhgcfnebaealwfkfvpkcdrzpfycsi".to_string());

    let model_name = model.unwrap_or_else(|| "Qwen/Qwen2.5-32B-Instruct".to_string());
    let client = Client::new();

    // 验证并过滤 messages，确保只包含有效的 role
    let valid_messages: Vec<_> = messages
        .into_iter()
        .filter(|msg| {
            let role = msg.role.as_str();
            role == "user" || role == "assistant" || role == "system"
        })
        .collect();
    
    if valid_messages.is_empty() {
        return Err("No valid messages provided. Messages must have role: user, assistant, or system".to_string());
    }

    // 构建请求体，启用流式输出
    let body = serde_json::json!({
        "model": model_name,
        "messages": valid_messages,
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
                    window.emit("llm-stream-done", &message_id).map_err(|e| format!("Emit error: {e}"))?;
                    return Ok(());
                }
                
                if let Ok(json) = serde_json::from_str::<Value>(data) {
                    if let Some(delta) = json["choices"].get(0).and_then(|c| c["delta"].get("content")) {
                        if let Some(content) = delta.as_str() {
                            full_content.push_str(content);
                            window.emit("llm-stream-chunk", serde_json::json!({
                                "message_id": message_id,
                                "content": content,
                                "full_content": full_content.clone()
                            })).map_err(|e| format!("Emit error: {e}"))?;
                        }
                    }
                }
            }
        }
    }

    window.emit("llm-stream-done", &message_id).map_err(|e| format!("Emit error: {e}"))?;
    Ok(())
}

#[tauri::command]
async fn call_llm(
    messages: Vec<ChatMessage>,
    model: Option<String>,
) -> Result<String, String> {
    // 优先使用环境变量，开发阶段如果没有环境变量则使用硬编码的 API Key
    let api_key = std::env::var("SILICONFLOW_API_KEY")
        .unwrap_or_else(|_| "sk-zlrkdqipalbjrrgygpzvhgcfnebaealwfkfvpkcdrzpfycsi".to_string());

    let model_name = model.unwrap_or_else(|| "Qwen/Qwen2.5-32B-Instruct".to_string());
    let client = Client::new();

    // 验证并过滤 messages，确保只包含有效的 role
    let valid_messages: Vec<_> = messages
        .into_iter()
        .filter(|msg| {
            let role = msg.role.as_str();
            role == "user" || role == "assistant" || role == "system"
        })
        .collect();
    
    if valid_messages.is_empty() {
        return Err("No valid messages provided. Messages must have role: user, assistant, or system".to_string());
    }

    // 构建请求体，参考 SiliconFlow API 文档
    let body = serde_json::json!({
        "model": model_name,
        "messages": valid_messages,
        "temperature": 0.0,
        "stream": false
    });

    eprintln!("[call_llm] 发送请求到 SiliconFlow, model: {}, messages count: {}", model_name, valid_messages.len());
    eprintln!("[call_llm] 请求体: {}", serde_json::to_string_pretty(&body).unwrap_or_default());
    
    let response = client
        .post("https://api.siliconflow.cn/v1/chat/completions")
        .bearer_auth(&api_key)
        .json(&body)
        .send()
        .await
        .map_err(|err| {
            eprintln!("[call_llm] 网络请求失败: {}", err);
            format!("Request error: {err}")
        })?;

    let status = response.status();
    if !status.is_success() {
        let text = response
            .text()
            .await
            .unwrap_or_else(|_| "Failed to read response body".to_string());
        eprintln!("[call_llm] API 返回错误状态: {} - {}", status, text);
        return Err(format!("API error {status}: {text}"));
    }
    
    eprintln!("[call_llm] API 请求成功，状态码: {}", status);

    let json: Value = response
        .json()
        .await
        .map_err(|err| {
            eprintln!("[call_llm] JSON 解析失败: {}", err);
            format!("Failed to parse response: {err}")
        })?;

    eprintln!("[call_llm] 响应 JSON: {}", serde_json::to_string_pretty(&json).unwrap_or_default());

    if let Some(content) = json["choices"][0]["message"]["content"].as_str() {
        eprintln!("[call_llm] 成功提取 content，长度: {}", content.len());
        Ok(content.to_string())
    } else {
        eprintln!("[call_llm] 警告: 响应中没有找到 content 字段，返回完整 JSON");
        Ok(json.to_string())
    }
}

#[tauri::command]
async fn list_files(options: ListFilesOptions) -> Result<Vec<FileEntry>, String> {
    let task = spawn_blocking(move || {
        let root = PathBuf::from(options.path);
        if !root.exists() {
            return Err("指定的路径不存在".to_string());
        }

        let recursive = options.recursive.unwrap_or(false);
        let limit = options.limit.unwrap_or(200);
        let pattern = options.pattern.map(|p| p.to_lowercase());

        let mut results = Vec::with_capacity(limit.min(256));

        let walker = WalkDir::new(&root).max_depth(if recursive { usize::MAX } else { 1 });

        for entry in walker.into_iter().filter_map(Result::ok) {
            if entry.depth() == 0 {
                continue;
            }

            if results.len() >= limit {
                break;
            }

            let path = entry.path();
            let display_path = path.to_string_lossy().to_string();

            if let Some(ref pat) = pattern {
                if !display_path.to_lowercase().contains(pat) {
                    continue;
                }
            }

            let metadata = match entry.metadata() {
                Ok(meta) => meta,
                Err(_) => continue,
            };

            let file_type = if metadata.is_dir() {
                "directory"
            } else if metadata.is_file() {
                "file"
            } else {
                "other"
            }
            .to_string();

            let size = if metadata.is_file() {
                Some(metadata.len())
            } else {
                None
            };

            let modified_ms = metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_millis() as u64);

            results.push(FileEntry {
                path: display_path,
                file_type,
                size,
                modified_ms,
            });
        }

        Ok(results)
    });

    task.await.map_err(|err| err.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, call_llm, call_llm_stream, list_files])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
