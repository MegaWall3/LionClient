# AI-PC-ELF 功能文档

## ✅ 已实现的工具（10个）

### 📁 文件列表和搜索

1. **`list_files`** - 列出文件和文件夹
2. **`read_file`** - 读取文件内容（默认最大 10MB）
3. **`search_in_files`** - 在多个文件中搜索文本模式

### 🗑️ 文件操作

4. **`delete_file`** - 删除文件或目录（支持递归）
5. **`rename_file`** - 重命名/移动文件
6. **`copy_file`** - 复制文件或目录（支持覆盖）

### ✏️ 文件内容操作

7. **`write_file`** - 创建新文件或覆盖现有文件
8. **`append_to_file`** - 在文件末尾追加内容
9. **`replace_in_file`** - 在文件中查找并替换文本

### 🌐 网络操作

10. **`download_file`** - 从 URL 下载文件到指定位置

### 💻 系统命令

11. **`run_command`** - 执行系统命令（PowerShell/CMD on Windows, Bash/Sh on Mac/Linux）

## 📖 详细文档

- [工具功能总结](./tools-summary.md) - 所有工具的详细说明和使用示例
- [工具开发路线图](./tools-roadmap.md) - 未来计划添加的工具

## 💬 对话功能

### 当前支持的操作

1. **基础对话**
   - 与 AI 进行自然语言对话
   - 流式输出响应，实时显示 AI 回复

2. **自动工具调用**
   - AI 可以理解用户需求并自动调用工具
   - 支持多轮工具调用（toolcall 循环）
   - 工具执行结果会自动反馈给 AI，继续对话

### 使用示例

**文件操作：**
- "列出 D 盘 Workspace 目录下的所有 TypeScript 文件"（默认不包含隐藏文件）
- "列出 D 盘 Workspace 目录下的所有文件，包括隐藏文件"
- "读取 `D:\Workspace\package.json` 的内容"
- "在 `D:\Workspace` 中搜索 `useState`，只搜索 `.tsx` 文件"

**文件管理：**
- "将 `D:\Workspace\old.txt` 重命名为 `new.txt`"
- "复制 `D:\Workspace\src` 目录到 `D:\Backup\src`"
- "删除 `D:\Workspace\temp` 目录及其所有内容"

**文件内容编辑：**
- "在 `D:\Workspace\config.json` 中将 `localhost` 替换为 `production.com`"
- "在 `D:\Workspace\log.txt` 末尾追加一行 '操作完成'"

**网络下载：**
- "下载 `https://example.com/file.zip` 到桌面"
- "从 `https://example.com/data.json` 下载文件，保存为 `C:\Users\Username\Desktop\data.json`"

**系统命令：**
- "执行 PowerShell 命令：`Get-Process | Select-Object -First 5`"
- "在 CMD 中执行 `dir` 命令，工作目录设为桌面"
- "使用 Bash 执行 `ls -la` 命令"
- "安装 Node.js（使用包管理器命令）"

## 🔒 安全注意事项

1. **删除操作**: `delete_file` 默认移动到回收站（可恢复），设置 `permanent=true` 可永久删除
2. **覆盖操作**: `write_file` 会完全覆盖现有文件
3. **网络下载**: `download_file` 会下载任意 URL 的文件，注意来源可信度
4. **文件大小**: `read_file` 限制 10MB，避免读取过大文件
5. **系统命令**: `run_command` 可以执行任意系统命令，请谨慎使用，确保命令来源可信

## 🚀 计划中的功能

参考 [工具开发路线图](./tools-roadmap.md) 了解未来计划。

## 技术栈

- **前端**: React + TypeScript + TailwindCSS + shadcn/ui
- **后端**: Rust + Tauri
- **LLM**: SiliconFlow API (Qwen/Qwen2.5-32B-Instruct)
- **通信**: Tauri Commands + Events (流式输出)

