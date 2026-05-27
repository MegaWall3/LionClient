// Tool Registry - local tool metadata, OpenAI function schemas, future MCP bridge.
use async_openai::types::{FunctionObject, FunctionObjectArgs};
use serde_json::{json, Value};

pub struct ToolRegistry;

struct LocalToolSpec {
    name: &'static str,
    description: &'static str,
    category: &'static str,
    risk: &'static str,
    parameters: Value,
}

impl LocalToolSpec {
    fn as_function(&self) -> FunctionObject {
        FunctionObjectArgs::default()
            .name(self.name)
            .description(format!(
                "[category: {}; risk: {}] {}",
                self.category, self.risk, self.description
            ))
            .parameters(self.parameters.clone())
            .build()
            .expect("local tool schema should be valid")
    }
}

impl ToolRegistry {
    pub fn get_tools() -> Vec<FunctionObject> {
        Self::local_specs()
            .into_iter()
            .map(|tool| tool.as_function())
            .collect()
    }

    fn local_specs() -> Vec<LocalToolSpec> {
        vec![
            LocalToolSpec {
                name: "run_command",
                category: "shell",
                risk: "high",
                description: "执行系统命令。适合系统查询、开发环境检查和用户明确要求的自动化；写入、删除、安装、联网下载等高风险命令会由 runtime 弹出结构化确认按钮。",
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "command": {
                            "type": "string",
                            "description": "要执行的命令。macOS/Linux 使用 bash/sh；Windows 使用 PowerShell/CMD。"
                        },
                        "shell": {
                            "type": "string",
                            "description": "指定 shell（可选）：powershell, cmd, bash, sh"
                        },
                        "working_dir": {
                            "type": "string",
                            "description": "工作目录（可选）"
                        }
                    },
                    "required": ["command"]
                }),
            },
            LocalToolSpec {
                name: "list_files",
                category: "filesystem",
                risk: "read",
                description: "列出指定目录下的文件和文件夹，适合先观察工作区状态。",
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "要扫描的目录路径"},
                        "recursive": {"type": "boolean", "description": "是否递归扫描子目录，默认 false"},
                        "pattern": {"type": "string", "description": "文件名或路径包含匹配"},
                        "limit": {"type": "integer", "description": "返回结果最大数量，默认 200"},
                        "include_hidden": {"type": "boolean", "description": "是否包含隐藏文件，默认 false"}
                    },
                    "required": ["path"]
                }),
            },
            LocalToolSpec {
                name: "read_file",
                category: "filesystem",
                risk: "read",
                description: "读取文本文件内容。大文件应先限制大小或用搜索工具定位。",
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "要读取的文件路径"},
                        "max_size": {"type": "integer", "description": "最大读取字节数，默认 10MB"}
                    },
                    "required": ["path"]
                }),
            },
            LocalToolSpec {
                name: "search_in_files",
                category: "filesystem",
                risk: "read",
                description: "在文件中搜索文本模式，适合代码和文档定位。",
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "要搜索的目录路径"},
                        "pattern": {"type": "string", "description": "要搜索的文本模式"},
                        "file_pattern": {"type": "string", "description": "文件名过滤"},
                        "recursive": {"type": "boolean", "description": "是否递归搜索，默认 true"},
                        "case_sensitive": {"type": "boolean", "description": "是否大小写敏感，默认 false"}
                    },
                    "required": ["path", "pattern"]
                }),
            },
            LocalToolSpec {
                name: "write_file",
                category: "filesystem",
                risk: "write",
                description: "创建新文件或覆盖现有文件。覆盖用户文件前必须说明目标路径和影响。",
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "目标文件路径"},
                        "content": {"type": "string", "description": "要写入的完整内容"}
                    },
                    "required": ["path", "content"]
                }),
            },
            LocalToolSpec {
                name: "fetch_webpage",
                category: "network",
                risk: "network-read",
                description: "获取网页内容并提取信息，适合读取公开网页、标题、链接和正文。",
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "url": {"type": "string", "description": "网页 URL"},
                        "extract_text": {"type": "boolean", "description": "是否提取正文文本"},
                        "extract_links": {"type": "boolean", "description": "是否提取链接"}
                    },
                    "required": ["url"]
                }),
            },
        ]
    }
}
