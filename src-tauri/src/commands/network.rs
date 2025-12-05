// Network 模块 - 简化的网络操作
use std::fs;
use std::path::PathBuf;
use tauri::{Emitter, Window};
use reqwest::Client;
use scraper::{Html, Selector};
use serde::Serialize;
use futures_util::StreamExt;

#[derive(Debug, serde::Deserialize)]
pub struct DownloadFileOptions {
    pub url: String,
    pub destination: String,
    pub filename: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct DownloadProgress {
    pub downloaded: u64,
    pub total: Option<u64>,
    pub percentage: Option<f64>,
}

#[derive(Debug, serde::Deserialize)]
pub struct FetchWebpageOptions {
    pub url: String,
    pub extract_text: Option<bool>,
    pub extract_links: Option<bool>,
    pub extract_meta: Option<bool>,
    pub max_length: Option<usize>,
    pub timeout_seconds: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct WebpageContent {
    pub url: String,
    pub title: Option<String>,
    pub text_content: Option<String>,
    pub html_content: Option<String>,
    pub links: Vec<LinkInfo>,
    pub meta: MetaInfo,
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

/// 下载文件（流式，带进度）
#[tauri::command]
pub async fn download_file(
    window: Window,
    options: DownloadFileOptions,
) -> Result<String, String> {
    let client = Client::new();
    let response = client.get(&options.url).send().await
        .map_err(|e| format!("下载失败: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP 错误: {}", response.status()));
    }

    let total_size = response.content_length();
    
    // 确定文件名和路径
    let dest_path = PathBuf::from(&options.destination);
    let final_path = if dest_path.is_dir() || !dest_path.exists() {
        let filename = options.filename
            .or_else(|| extract_filename(&options.url))
            .unwrap_or_else(|| "downloaded_file".to_string());
        dest_path.join(filename)
    } else {
        dest_path
    };

    // 确保目录存在
    if let Some(parent) = final_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建目录失败: {}", e))?;
    }

    // 流式下载
    let mut stream = response.bytes_stream();
    let mut file = fs::File::create(&final_path)
        .map_err(|e| format!("创建文件失败: {}", e))?;
    let mut downloaded: u64 = 0;

    use std::io::Write;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("读取数据失败: {}", e))?;
        file.write_all(&chunk)
            .map_err(|e| format!("写入文件失败: {}", e))?;
        
        downloaded += chunk.len() as u64;
        
        // 定期发送进度
        if downloaded % (1024 * 1024) < chunk.len() as u64 {
            let _ = window.emit("download-progress", DownloadProgress {
                downloaded,
                total: total_size,
                percentage: total_size.map(|t| (downloaded as f64 / t as f64) * 100.0),
            });
        }
    }
    
    // 确保所有数据写入磁盘
    file.flush().map_err(|e| format!("刷新文件缓冲失败: {}", e))?;
    drop(file); // 显式关闭文件
    
    // 验证文件大小
    let file_size = fs::metadata(&final_path)
        .map_err(|e| format!("读取文件信息失败: {}", e))?
        .len();
    
    eprintln!("[Network] 文件下载完成: {} (大小: {} 字节)", final_path.display(), file_size);

    Ok(format!("文件已下载: {} (大小: {} 字节)", final_path.display(), file_size))
}

/// 获取网页内容
#[tauri::command]
pub async fn fetch_webpage(options: FetchWebpageOptions) -> Result<WebpageContent, String> {
    let extract_text = options.extract_text.unwrap_or(true);
    let extract_links = options.extract_links.unwrap_or(false);
    let extract_meta = options.extract_meta.unwrap_or(true);
    let max_length = options.max_length.unwrap_or(100_000);
    let timeout = std::time::Duration::from_secs(options.timeout_seconds.unwrap_or(30));

    let client = Client::builder()
        .timeout(timeout)
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .build()
        .map_err(|e| format!("创建客户端失败: {}", e))?;

    let response = client.get(&options.url).send().await
        .map_err(|e| format!("请求失败: {}", e))?;

    let status_code = response.status().as_u16();
    if !response.status().is_success() {
        return Err(format!("HTTP 错误: {}", status_code));
    }

    let html = response.text().await
        .map_err(|e| format!("读取响应失败: {}", e))?;

    // 解析 HTML
    let document = Html::parse_document(&html);
    
    // 提取标题
    let title = document.select(&Selector::parse("title").unwrap())
        .next()
        .map(|e| e.text().collect::<String>().trim().to_string());

    // 提取文本
    let text_content = if extract_text {
        let body_text: String = document
            .select(&Selector::parse("body").unwrap())
            .next()
            .map(|body| body.text().collect::<String>())
            .unwrap_or_default();
        
        let cleaned = regex::Regex::new(r"\s+").unwrap()
            .replace_all(&body_text, " ")
            .trim()
            .to_string();
        
        Some(if cleaned.len() > max_length {
            format!("{}...", &cleaned[..max_length])
        } else {
            cleaned
        })
    } else {
        None
    };

    // 提取链接
    let links = if extract_links {
        document.select(&Selector::parse("a[href]").unwrap())
            .filter_map(|e| {
                Some(LinkInfo {
                    href: e.value().attr("href")?.to_string(),
                    text: e.text().collect::<String>().trim().to_string(),
                })
            })
            .collect()
    } else {
        Vec::new()
    };

    // 提取 meta 信息
    let meta = if extract_meta {
        let mut description = None;
        let mut keywords = None;
        let mut author = None;
        let mut og_title = None;
        let mut og_description = None;
        let mut og_image = None;

        for meta_elem in document.select(&Selector::parse("meta").unwrap()) {
            if let Some(content) = meta_elem.value().attr("content") {
                match meta_elem.value().attr("name") {
                    Some("description") => description = Some(content.to_string()),
                    Some("keywords") => keywords = Some(content.to_string()),
                    Some("author") => author = Some(content.to_string()),
                    _ => {}
                }
                match meta_elem.value().attr("property") {
                    Some("og:title") => og_title = Some(content.to_string()),
                    Some("og:description") => og_description = Some(content.to_string()),
                    Some("og:image") => og_image = Some(content.to_string()),
                    _ => {}
                }
            }
        }

        MetaInfo { description, keywords, author, og_title, og_description, og_image }
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
}

/// 从 URL 提取文件名
fn extract_filename(url: &str) -> Option<String> {
    url.split('/')
        .last()
        .and_then(|s| {
            let name = s.split('?').next()?;
            if name.is_empty() { None } else { Some(name.to_string()) }
        })
}
