use std::fs;
use std::io::{self, Read, Write};
use std::path::PathBuf;
use std::time::UNIX_EPOCH;
use tauri::async_runtime::spawn_blocking;
use walkdir::WalkDir;
use trash;
use crate::types::{ListFilesOptions, FileEntry, SearchResult};

#[tauri::command]
pub async fn list_files(options: ListFilesOptions) -> Result<Vec<FileEntry>, String> {
    let task = spawn_blocking(move || {
        let root = PathBuf::from(options.path);
        if !root.exists() {
            return Err("指定的路径不存在".to_string());
        }

        let recursive = options.recursive.unwrap_or(false);
        let limit = options.limit.unwrap_or(200);
        let pattern = options.pattern.map(|p| p.to_lowercase());
        let include_hidden = options.include_hidden.unwrap_or(false);

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
            
            // 检查是否为隐藏文件（默认不包含）
            if !include_hidden {
                let file_name = entry.file_name().to_string_lossy();
                // Unix/Mac: 以 . 开头的文件为隐藏文件
                // Windows: 也检查以 . 开头的文件（如 .gitignore）
                if file_name.starts_with('.') {
                    continue;
                }
                
                // Windows: 检查文件属性中的隐藏标志
                #[cfg(windows)]
                {
                    use std::os::windows::fs::MetadataExt;
                    if let Ok(metadata) = entry.metadata() {
                        let attributes = metadata.file_attributes();
                        // FILE_ATTRIBUTE_HIDDEN = 0x2
                        if (attributes & 0x2) != 0 {
                            continue;
                        }
                    }
                }
            }
            
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

#[derive(Debug, serde::Deserialize)]
pub struct ReadFileOptions {
    pub path: String,
    pub encoding: Option<String>,
    pub max_size: Option<usize>,
}

#[tauri::command]
pub async fn read_file(options: ReadFileOptions) -> Result<String, String> {
    let task = spawn_blocking(move || {
        let path = PathBuf::from(&options.path);
        
        if !path.exists() {
            return Err(format!("文件不存在: {}", options.path));
        }

        if !path.is_file() {
            return Err(format!("路径不是文件: {}", options.path));
        }

        // 检查文件大小
        let metadata = fs::metadata(&path)
            .map_err(|e| format!("无法读取文件元数据: {}", e))?;
        
        let max_size = options.max_size.unwrap_or(10 * 1024 * 1024); // 默认 10MB
        if metadata.len() > max_size as u64 {
            return Err(format!(
                "文件太大 ({} bytes)，超过限制 ({} bytes)",
                metadata.len(),
                max_size
            ));
        }

        // 读取文件内容
        let mut file = fs::File::open(&path)
            .map_err(|e| format!("无法打开文件: {}", e))?;
        
        let mut contents = String::new();
        file.read_to_string(&mut contents)
            .map_err(|e| format!("无法读取文件内容: {}", e))?;

        Ok(contents)
    });

    task.await.map_err(|err| err.to_string())?
}

#[derive(Debug, serde::Deserialize)]
pub struct SearchInFilesOptions {
    pub path: String,
    pub pattern: String,
    pub file_pattern: Option<String>,
    pub recursive: Option<bool>,
    pub case_sensitive: Option<bool>,
}

#[tauri::command]
pub async fn search_in_files(options: SearchInFilesOptions) -> Result<Vec<SearchResult>, String> {
    let task = spawn_blocking(move || {
        let root = PathBuf::from(&options.path);
        if !root.exists() {
            return Err("指定的路径不存在".to_string());
        }

        let recursive = options.recursive.unwrap_or(true);
        let case_sensitive = options.case_sensitive.unwrap_or(false);
        let file_pattern = options.file_pattern.clone();
        
        let mut results = Vec::new();
        let search_pattern = if case_sensitive {
            options.pattern.clone()
        } else {
            options.pattern.to_lowercase()
        };

        let walker = WalkDir::new(&root).max_depth(if recursive { usize::MAX } else { 1 });

        for entry in walker.into_iter().filter_map(Result::ok) {
            let path = entry.path();
            
            // 跳过目录
            if !path.is_file() {
                continue;
            }

            // 文件类型过滤
            if let Some(ref pat) = file_pattern {
                let file_name = path.to_string_lossy().to_lowercase();
                if !file_name.contains(&pat.to_lowercase()) {
                    continue;
                }
            }

            // 读取文件并搜索
            if let Ok(contents) = fs::read_to_string(path) {
                for (line_num, line) in contents.lines().enumerate() {
                    let search_line = if case_sensitive {
                        line.to_string()
                    } else {
                        line.to_lowercase()
                    };

                    if let Some(index) = search_line.find(&search_pattern) {
                        results.push(SearchResult {
                            file_path: path.to_string_lossy().to_string(),
                            line_number: line_num + 1,
                            line_content: line.to_string(),
                            match_index: index,
                        });
                    }
                }
            }
        }

        Ok(results)
    });

    task.await.map_err(|err| err.to_string())?
}

#[derive(Debug, serde::Deserialize)]
pub struct DeleteFileOptions {
    pub path: String,
    pub recursive: Option<bool>,
    pub permanent: Option<bool>, // 是否永久删除（不移动到回收站），默认为 false
}

#[tauri::command]
pub async fn delete_file(options: DeleteFileOptions) -> Result<String, String> {
    let task = spawn_blocking(move || {
        let path = PathBuf::from(&options.path);
        
        if !path.exists() {
            return Err(format!("路径不存在: {}", options.path));
        }

        let permanent = options.permanent.unwrap_or(false);
        
        if permanent {
            // 永久删除（不移动到回收站）
            if path.is_file() {
                fs::remove_file(&path)
                    .map_err(|e| format!("无法永久删除文件: {}", e))?;
                Ok(format!("已永久删除文件: {}", options.path))
            } else if path.is_dir() {
                let recursive = options.recursive.unwrap_or(false);
                if recursive {
                    fs::remove_dir_all(&path)
                        .map_err(|e| format!("无法永久删除目录: {}", e))?;
                    Ok(format!("已永久删除目录（递归）: {}", options.path))
                } else {
                    fs::remove_dir(&path)
                        .map_err(|e| format!("无法永久删除目录（目录不为空或需要递归删除）: {}", e))?;
                    Ok(format!("已永久删除目录: {}", options.path))
                }
            } else {
                Err(format!("未知的路径类型: {}", options.path))
            }
        } else {
            // 移动到回收站（默认行为）
            trash::delete(&path)
                .map_err(|e| format!("无法移动到回收站: {}", e))?;
            let item_type = if path.is_file() { "文件" } else { "目录" };
            Ok(format!("已将{}移动到回收站: {}", item_type, options.path))
        }
    });

    task.await.map_err(|err| err.to_string())?
}

#[derive(Debug, serde::Deserialize)]
pub struct RenameFileOptions {
    pub old_path: String,
    pub new_path: String,
}

#[tauri::command]
pub async fn rename_file(options: RenameFileOptions) -> Result<String, String> {
    let task = spawn_blocking(move || {
        let old_path = PathBuf::from(&options.old_path);
        let new_path = PathBuf::from(&options.new_path);
        
        if !old_path.exists() {
            return Err(format!("源文件不存在: {}", options.old_path));
        }

        // 确保目标目录存在
        if let Some(parent) = new_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("无法创建目标目录: {}", e))?;
        }

        fs::rename(&old_path, &new_path)
            .map_err(|e| format!("无法重命名/移动文件: {}", e))?;

        Ok(format!("已成功将 '{}' 重命名为/移动到 '{}'", options.old_path, options.new_path))
    });

    task.await.map_err(|err| err.to_string())?
}

#[derive(Debug, serde::Deserialize)]
pub struct CopyFileOptions {
    pub source: String,
    pub destination: String,
    pub overwrite: Option<bool>,
}

#[tauri::command]
pub async fn copy_file(options: CopyFileOptions) -> Result<String, String> {
    let task = spawn_blocking(move || {
        let source = PathBuf::from(&options.source);
        let destination = PathBuf::from(&options.destination);
        
        if !source.exists() {
            return Err(format!("源文件不存在: {}", options.source));
        }

        // 如果目标已存在且不允许覆盖
        if destination.exists() && !options.overwrite.unwrap_or(false) {
            return Err(format!("目标文件已存在: {}", options.destination));
        }

        // 确保目标目录存在
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("无法创建目标目录: {}", e))?;
        }

        if source.is_file() {
            fs::copy(&source, &destination)
                .map_err(|e| format!("无法复制文件: {}", e))?;
        } else if source.is_dir() {
            copy_dir_all(&source, &destination)
                .map_err(|e| format!("无法复制目录: {}", e))?;
        } else {
            return Err(format!("未知的源路径类型: {}", options.source));
        }

        Ok(format!("已成功复制 '{}' 到 '{}'", options.source, options.destination))
    });

    task.await.map_err(|err| err.to_string())?
}

fn copy_dir_all(src: &PathBuf, dst: &PathBuf) -> io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let dst_path = dst.join(entry.file_name());
        
        if path.is_dir() {
            copy_dir_all(&path, &dst_path)?;
        } else {
            fs::copy(&path, &dst_path)?;
        }
    }
    Ok(())
}

#[derive(Debug, serde::Deserialize)]
pub struct WriteFileOptions {
    pub path: String,
    pub content: String,
    pub encoding: Option<String>,
}

#[tauri::command]
pub async fn write_file(options: WriteFileOptions) -> Result<String, String> {
    let task = spawn_blocking(move || {
        let path = PathBuf::from(&options.path);
        
        // 确保目录存在
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("无法创建目录: {}", e))?;
        }

        // 写入文件
        fs::write(&path, &options.content)
            .map_err(|e| format!("无法写入文件: {}", e))?;

        Ok(format!("已成功写入文件: {}", options.path))
    });

    task.await.map_err(|err| err.to_string())?
}

#[derive(Debug, serde::Deserialize)]
pub struct AppendToFileOptions {
    pub path: String,
    pub content: String,
}

#[tauri::command]
pub async fn append_to_file(options: AppendToFileOptions) -> Result<String, String> {
    let task = spawn_blocking(move || {
        let path = PathBuf::from(&options.path);
        
        if !path.exists() {
            return Err(format!("文件不存在: {}", options.path));
        }

        // 追加内容到文件
        let mut file = fs::OpenOptions::new()
            .append(true)
            .open(&path)
            .map_err(|e| format!("无法打开文件: {}", e))?;
        
        file.write_all(options.content.as_bytes())
            .map_err(|e| format!("无法追加内容: {}", e))?;

        Ok(format!("已成功追加内容到文件: {}", options.path))
    });

    task.await.map_err(|err| err.to_string())?
}

#[derive(Debug, serde::Deserialize)]
pub struct ReplaceInFileOptions {
    pub path: String,
    pub search: String,
    pub replace: String,
    pub regex: Option<bool>,
}

#[tauri::command]
pub async fn replace_in_file(options: ReplaceInFileOptions) -> Result<String, String> {
    let task = spawn_blocking(move || {
        let path = PathBuf::from(&options.path);
        
        if !path.exists() {
            return Err(format!("文件不存在: {}", options.path));
        }

        // 读取文件内容
        let contents = fs::read_to_string(&path)
            .map_err(|e| format!("无法读取文件: {}", e))?;

        // 替换内容
        let use_regex = options.regex.unwrap_or(false);
        let (new_contents, count) = if use_regex {
            // 使用正则表达式（需要添加 regex crate）
            // 暂时不支持，返回错误
            return Err("正则表达式替换暂未实现，请使用普通文本替换".to_string());
        } else {
            // 普通文本替换
            let count = contents.matches(&options.search).count();
            let new_contents = contents.replace(&options.search, &options.replace);
            (new_contents, count)
        };

        // 写回文件
        fs::write(&path, &new_contents)
            .map_err(|e| format!("无法写入文件: {}", e))?;

        Ok(format!("已在文件 '{}' 中替换 {} 处匹配", options.path, count))
    });

    task.await.map_err(|err| err.to_string())?
}
