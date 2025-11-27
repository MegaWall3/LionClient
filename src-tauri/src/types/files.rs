use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
pub struct ListFilesOptions {
    pub path: String,
    pub recursive: Option<bool>,
    pub pattern: Option<String>,
    pub limit: Option<usize>,
    pub include_hidden: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileEntry {
    pub path: String,
    pub file_type: String,
    pub size: Option<u64>,
    pub modified_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    pub file_path: String,
    pub line_number: usize,
    pub line_content: String,
    pub match_index: usize,
}

