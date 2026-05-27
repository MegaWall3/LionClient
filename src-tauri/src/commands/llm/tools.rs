// Tool Registry - 按照 LangChain 的 Tools 模式
use async_openai::types::{FunctionObject, FunctionObjectArgs};
use serde_json::json;

pub struct ToolRegistry;

impl ToolRegistry {
    pub fn get_tools() -> Vec<FunctionObject> {
        vec![
            // 核心工具：命令行优先
            Self::run_command_tool(),
            // 文件系统工具（仅保留命令行不便的）
            Self::list_files_tool(),
            Self::read_file_tool(),
            Self::search_in_files_tool(),
            Self::write_file_tool(),
            // 网络工具（仅保留结构化数据提取）
            Self::fetch_webpage_tool(),
        ]
    }

    fn list_files_tool() -> FunctionObject {
        FunctionObjectArgs::default()
            .name("list_files")
            .description("列出指定目录下的文件和文件夹")
            .parameters(json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "要扫描的目录路径"
                    },
                    "recursive": {
                        "type": "boolean",
                        "description": "是否递归扫描子目录，默认为 false"
                    },
                    "pattern": {
                        "type": "string",
                        "description": "文件名模式匹配"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "返回结果的最大数量，默认为 200"
                    }
                },
                "required": ["path"]
            }))
            .build()
            .unwrap()
    }

    fn read_file_tool() -> FunctionObject {
        FunctionObjectArgs::default()
            .name("read_file")
            .description("读取文件内容")
            .parameters(json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "要读取的文件路径"},
                    "encoding": {"type": "string", "description": "文件编码，默认为 utf-8"}
                },
                "required": ["path"]
            }))
            .build()
            .unwrap()
    }

    fn search_in_files_tool() -> FunctionObject {
        FunctionObjectArgs::default()
            .name("search_in_files")
            .description("在多个文件中搜索文本模式")
            .parameters(json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "要搜索的目录路径"},
                    "pattern": {"type": "string", "description": "要搜索的文本模式"}
                },
                "required": ["path", "pattern"]
            }))
            .build()
            .unwrap()
    }

    fn write_file_tool() -> FunctionObject {
        FunctionObjectArgs::default()
            .name("write_file")
            .description("创建新文件或覆盖现有文件")
            .parameters(json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"}
                },
                "required": ["path", "content"]
            }))
            .build()
            .unwrap()
    }

    fn fetch_webpage_tool() -> FunctionObject {
        FunctionObjectArgs::default()
            .name("fetch_webpage")
            .description("获取网页内容并提取信息")
            .parameters(json!({
                "type": "object",
                "properties": {
                    "url": {"type": "string"},
                    "extract_text": {"type": "boolean"},
                    "extract_links": {"type": "boolean"}
                },
                "required": ["url"]
            }))
            .build()
            .unwrap()
    }

    fn run_command_tool() -> FunctionObject {
        FunctionObjectArgs::default()
            .name("run_command")
            .description("执行系统命令（PowerShell/Bash）。这是最强大的工具，可以完成几乎所有任务，包括：文件下载（Invoke-WebRequest）、文件操作（copy/move/del）、系统查询等。")
            .parameters(json!({
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string", 
                        "description": "要执行的命令。Windows 使用 PowerShell 语法，如：Invoke-WebRequest -Uri 'URL' -OutFile '路径'"
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
            }))
            .build()
            .unwrap()
    }
}
