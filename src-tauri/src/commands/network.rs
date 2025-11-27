use std::fs;
use std::io::Write;
use std::path::PathBuf;
use tauri::async_runtime::spawn_blocking;
use tauri::{Emitter, Window};
use reqwest::{Client, header};
use percent_encoding::percent_decode_str;
use scraper::{Html, Selector};
use serde::Serialize;
use futures_util::StreamExt;

#[derive(Debug, serde::Deserialize)]
pub struct DownloadFileOptions {
    pub url: String,
    pub destination: String,
    pub filename: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DownloadProgress {
    pub downloaded: u64,
    pub total: Option<u64>,
    pub percentage: Option<f64>,
}

#[tauri::command]
pub async fn download_file(
    window: Window,
    options: DownloadFileOptions,
) -> Result<String, String> {
    let client = Client::new();
    let url = options.url.clone();
    let destination = options.destination.clone();
    let filename = options.filename.clone();

    // 下载文件
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("下载失败: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "下载失败，HTTP 状态码: {}",
            response.status()
        ));
    }

    // 获取文件总大小（如果可用）
    let total_size = response.content_length();

    // 确定保存路径
    let content_disposition = response
        .headers()
        .get(header::CONTENT_DISPOSITION)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let dest_path = PathBuf::from(&destination);
    let final_path = if dest_path.is_dir() || !dest_path.exists() {
        let file_name = derive_file_name(
            &url,
            filename,
            content_disposition.as_deref(),
            content_type.as_deref(),
        );
        dest_path.join(file_name)
    } else {
        dest_path
    };

    // 确保目录存在
    if let Some(parent) = final_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("无法创建目录: {}", e))?;
    }

    // 使用临时文件避免下载过程中被占用
    let temp_path = final_path.with_extension("tmp");
    let file_path = temp_path.clone();
    
    eprintln!("[download_file] 开始下载到临时文件: {}", temp_path.display());
    
    spawn_blocking({
        let file_path = file_path.clone();
        move || {
            fs::File::create(&file_path)
                .map_err(|e| format!("无法创建临时文件: {}", e))
        }
    })
    .await
    .map_err(|e| format!("文件操作失败: {}", e))??;

    // 流式下载并写入文件
    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut buffer = Vec::with_capacity(1024 * 1024); // 1MB 缓冲区

    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| format!("读取数据失败: {}", e))?;
        downloaded += chunk.len() as u64;

        buffer.extend_from_slice(&chunk);

        // 每 1MB 写入一次，并发送进度事件
        if buffer.len() >= 1024 * 1024 {
            let bytes_to_write = buffer.clone();
            let file_path_clone = file_path.clone();
            
            spawn_blocking(move || {
                let mut f = fs::OpenOptions::new()
                    .write(true)
                    .append(true)
                    .open(&file_path_clone)
                    .map_err(|e| format!("无法打开文件: {}", e))?;
                f.write_all(&bytes_to_write)
                    .map_err(|e| format!("写入失败: {}", e))?;
                Ok::<(), String>(())
            })
            .await
            .map_err(|e| format!("文件写入失败: {}", e))??;

            buffer.clear();

            // 发送进度事件
            let progress = DownloadProgress {
                downloaded,
                total: total_size,
                percentage: total_size.map(|total| (downloaded as f64 / total as f64) * 100.0),
            };
            let _ = window.emit("download-progress", &progress);
        }
    }

    // 写入剩余数据
    if !buffer.is_empty() {
        let bytes_to_write = buffer;
        spawn_blocking(move || {
            let mut f = fs::OpenOptions::new()
                .write(true)
                .append(true)
                .open(&file_path)
                .map_err(|e| format!("无法打开文件: {}", e))?;
            f.write_all(&bytes_to_write)
                .map_err(|e| format!("写入失败: {}", e))?;
            Ok::<(), String>(())
        })
        .await
        .map_err(|e| format!("文件写入失败: {}", e))??;
    }

    // 发送最终进度事件
    let final_progress = DownloadProgress {
        downloaded,
        total: total_size,
        percentage: total_size.map(|total| (downloaded as f64 / total as f64) * 100.0),
    };
    let _ = window.emit("download-progress", &final_progress);

    // 将临时文件重命名为最终文件名
    let final_path_display = final_path.display().to_string();
    let temp_path_display = temp_path.display().to_string();
    
    eprintln!("[download_file] 下载完成，重命名临时文件: {} -> {}", 
        temp_path_display, final_path_display);
    
    let final_path_clone = final_path.clone();
    spawn_blocking(move || {
        // 如果目标文件已存在，先删除
        if final_path_clone.exists() {
            fs::remove_file(&final_path_clone)
                .map_err(|e| format!("无法删除已存在的文件: {}", e))?;
        }
        fs::rename(&temp_path, &final_path_clone)
            .map_err(|e| format!("无法重命名文件: {}", e))?;
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| format!("文件重命名失败: {}", e))??;

    let file_size = fs::metadata(&final_path)
        .map(|m| m.len())
        .unwrap_or(0);

    eprintln!("[download_file] 文件已保存: {} ({})", 
        final_path_display, format_file_size(file_size));

    Ok(format!(
        "文件已下载到: {}\n文件大小: {}",
        final_path.to_string_lossy(),
        format_file_size(file_size)
    ))
}

fn format_file_size(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{} B", bytes)
    } else if bytes < 1024 * 1024 {
        format!("{:.2} KB", bytes as f64 / 1024.0)
    } else if bytes < 1024 * 1024 * 1024 {
        format!("{:.2} MB", bytes as f64 / (1024.0 * 1024.0))
    } else {
        format!("{:.2} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    }
}

fn derive_file_name(
    url: &str,
    preferred: Option<String>,
    content_disposition: Option<&str>,
    content_type: Option<&str>,
) -> String {
    if let Some(name) = preferred {
        let sanitized = sanitize_file_name(&name);
        if !sanitized.is_empty() {
            return ensure_extension(sanitized, content_type);
        }
    }

    if let Some(header) = content_disposition {
        if let Some(name) = parse_content_disposition_filename(header) {
            let sanitized = sanitize_file_name(&name);
            if !sanitized.is_empty() {
                return ensure_extension(sanitized, content_type);
            }
        }
    }

    if let Some(name) = filename_from_url(url) {
        let sanitized = sanitize_file_name(&name);
        if !sanitized.is_empty() {
            return ensure_extension(sanitized, content_type);
        }
    }

    if let Some(ext) = extension_from_content_type(content_type) {
        format!("downloaded_file{}", ext)
    } else {
        "downloaded_file.bin".to_string()
    }
}

fn parse_content_disposition_filename(header: &str) -> Option<String> {
    for segment in header.split(';') {
        let trimmed = segment.trim();
        if let Some(value) = trimmed.strip_prefix("filename*=") {
            if let Some((_, encoded)) = value.split_once("''") {
                return percent_decode(encoded);
            }
        } else if let Some(value) = trimmed.strip_prefix("filename=") {
            return Some(value.trim_matches('"').to_string());
        }
    }
    None
}

fn percent_decode(input: &str) -> Option<String> {
    percent_decode_str(input)
        .decode_utf8()
        .map(|cow| cow.to_string())
        .ok()
}

fn filename_from_url(url: &str) -> Option<String> {
    let mut candidate = url.split('/').last()?.to_string();
    if let Some((before, _)) = candidate.split_once('?') {
        if !before.is_empty() {
            candidate = before.to_string();
        }
    }

    if candidate.trim().is_empty() {
        None
    } else {
        Some(candidate)
    }
}

fn sanitize_file_name(name: &str) -> String {
    let invalid_chars = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
    let sanitized: String = name
        .chars()
        .map(|c| if invalid_chars.contains(&c) { '_' } else { c })
        .collect();

    let trimmed = sanitized.trim_matches(|c: char| c == '.' || c.is_whitespace());
    if trimmed.is_empty() {
        "downloaded_file".to_string()
    } else {
        trimmed.to_string()
    }
}

fn ensure_extension(name: String, content_type: Option<&str>) -> String {
    if name.contains('.') {
        return name;
    }

    if let Some(ext) = extension_from_content_type(content_type) {
        return format!("{}{}", name, ext);
    }

    format!("{}.bin", name)
}

fn extension_from_content_type(content_type: Option<&str>) -> Option<&'static str> {
    let ct = content_type.unwrap_or("").to_lowercase();
    match ct.as_str() {
        "application/pdf" => Some(".pdf"),
        "application/zip" | "application/x-zip-compressed" => Some(".zip"),
        "application/x-msdownload"
        | "application/x-msdos-program"
        | "application/octet-stream"
        | "application/vnd.microsoft.portable-executable" => Some(".exe"),
        "application/x-ms-installer" | "application/x-msi" => Some(".msi"),
        "application/x-rar-compressed" => Some(".rar"),
        "application/gzip" => Some(".gz"),
        "text/plain" => Some(".txt"),
        _ => None,
    }
}

#[derive(Debug, serde::Deserialize)]
pub struct FetchWebpageOptions {
    pub url: String,
    pub extract_text: Option<bool>, // 是否提取纯文本（去除 HTML 标签），默认为 true
    pub extract_links: Option<bool>, // 是否提取所有链接，默认为 false
    pub extract_meta: Option<bool>, // 是否提取 meta 标签信息，默认为 true
    pub max_length: Option<usize>, // 提取文本的最大长度，默认为 100000 字符
    pub timeout_seconds: Option<u64>, // 请求超时时间（秒），默认为 30
}

#[derive(Debug, Serialize)]
pub struct WebpageContent {
    pub url: String,
    pub title: Option<String>,
    pub text_content: Option<String>, // 提取的纯文本内容
    pub html_content: Option<String>, // 原始 HTML（如果 extract_text=false）
    pub links: Vec<LinkInfo>, // 提取的链接列表
    pub meta: MetaInfo, // Meta 信息
    pub status_code: u16,
}

#[derive(Debug, Serialize)]
pub struct LinkInfo {
    pub href: String,
    pub text: String,
}

#[derive(Debug, Serialize)]
pub struct MetaInfo {
    pub description: Option<String>,
    pub keywords: Option<String>,
    pub author: Option<String>,
    pub og_title: Option<String>,
    pub og_description: Option<String>,
    pub og_image: Option<String>,
}

#[tauri::command]
pub async fn fetch_webpage(options: FetchWebpageOptions) -> Result<WebpageContent, String> {
    let extract_text = options.extract_text.unwrap_or(true);
    let extract_links = options.extract_links.unwrap_or(false);
    let extract_meta = options.extract_meta.unwrap_or(true);
    let max_length = options.max_length.unwrap_or(100_000);
    let timeout = std::time::Duration::from_secs(options.timeout_seconds.unwrap_or(30));

    // 创建 HTTP 客户端，设置超时和 User-Agent
    let client = Client::builder()
        .timeout(timeout)
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| format!("无法创建 HTTP 客户端: {}", e))?;

    // 发送请求
    let response = client
        .get(&options.url)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    let status_code = response.status().as_u16();
    
    if !response.status().is_success() {
        return Err(format!(
            "HTTP 请求失败，状态码: {}",
            status_code
        ));
    }

    // 获取响应内容
    let html = response
        .text()
        .await
        .map_err(|e| format!("读取响应内容失败: {}", e))?;

    // 在后台线程中解析 HTML
    let result = spawn_blocking(move || -> Result<WebpageContent, String> {
        let document = Html::parse_document(&html);
        
        // 提取标题
        let title_selector = Selector::parse("title").unwrap();
        let title = document
            .select(&title_selector)
            .next()
            .map(|e| e.text().collect::<String>().trim().to_string());

        // 提取文本内容
        let text_content = if extract_text {
            // 提取 body 中的文本（scraper 会自动忽略 script 和 style 标签）
            let body_selector = Selector::parse("body").unwrap();
            let text = if let Some(body) = document.select(&body_selector).next() {
                body.text().collect::<String>()
            } else {
                // 如果没有 body，提取整个文档的文本
                document.root_element().text().collect::<String>()
            };
            
            // 清理文本：去除多余空白
            let cleaned = regex::Regex::new(r"\s+")
                .unwrap()
                .replace_all(&text, " ")
                .trim()
                .to_string();
            
            // 限制长度
            if cleaned.len() > max_length {
                Some(cleaned.chars().take(max_length).collect::<String>() + "...")
            } else {
                Some(cleaned)
            }
        } else {
            None
        };

        // 提取链接
        let links = if extract_links {
            let link_selector = Selector::parse("a[href]").unwrap();
            document
                .select(&link_selector)
                .filter_map(|element| {
                    let href = element.value().attr("href")?.to_string();
                    let text = element.text().collect::<String>().trim().to_string();
                    Some(LinkInfo { href, text })
                })
                .collect()
        } else {
            Vec::new()
        };

        // 提取 meta 信息
        let meta = if extract_meta {
            let meta_selector = Selector::parse("meta").unwrap();
            let mut description = None;
            let mut keywords = None;
            let mut author = None;
            let mut og_title = None;
            let mut og_description = None;
            let mut og_image = None;

            for meta in document.select(&meta_selector) {
                let name = meta.value().attr("name");
                let property = meta.value().attr("property");
                let content = meta.value().attr("content");

                if let Some(content) = content {
                    match name {
                        Some("description") => description = Some(content.to_string()),
                        Some("keywords") => keywords = Some(content.to_string()),
                        Some("author") => author = Some(content.to_string()),
                        _ => {}
                    }

                    match property {
                        Some("og:title") => og_title = Some(content.to_string()),
                        Some("og:description") => og_description = Some(content.to_string()),
                        Some("og:image") => og_image = Some(content.to_string()),
                        _ => {}
                    }
                }
            }

            MetaInfo {
                description,
                keywords,
                author,
                og_title,
                og_description,
                og_image,
            }
        } else {
            MetaInfo {
                description: None,
                keywords: None,
                author: None,
                og_title: None,
                og_description: None,
                og_image: None,
            }
        };

        Ok(WebpageContent {
            url: options.url,
            title,
            text_content,
            html_content: if !extract_text { Some(html) } else { None },
            links,
            meta,
            status_code,
        })
    })
    .await
    .map_err(|e| format!("HTML 解析失败: {}", e))?
    .map_err(|e| format!("HTML 解析错误: {}", e))?;

    Ok(result)
}

