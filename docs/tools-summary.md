# 工具功能总结

## ✅ 已实现的工具（11个）

### 📁 文件列表和搜索（3个）

#### 1. `list_files` - 列出文件和文件夹
- **功能**: 扫描并列出指定目录下的文件和文件夹
- **参数**: `path` (必需), `recursive`, `pattern`, `limit`, `include_hidden` (默认 false)
- **返回**: `FileEntry[]`
- **特性**: 默认不包含隐藏文件（以 `.` 开头的文件或系统隐藏文件），可通过 `include_hidden: true` 包含

#### 2. `read_file` - 读取文件内容
- **功能**: 读取文本文件内容
- **参数**: `path` (必需), `encoding` (可选), `max_size` (可选，默认 10MB)
- **返回**: 文件内容字符串
- **限制**: 默认最大 10MB

#### 3. `search_in_files` - 在文件中搜索
- **功能**: 在多个文件中搜索文本模式
- **参数**: `path` (必需), `pattern` (必需), `file_pattern`, `recursive`, `case_sensitive`
- **返回**: `SearchResult[]` (文件路径、行号、匹配内容)

### 🗑️ 文件操作（3个）

#### 4. `delete_file` - 删除文件或目录
- **功能**: 删除文件或目录（默认移动到回收站，可恢复；支持递归删除）
- **参数**: `path` (必需), `recursive` (可选), `permanent` (可选，默认 false)
- **返回**: 操作结果消息
- **特性**: 
  - 默认移动到回收站（可恢复）
  - 设置 `permanent=true` 可永久删除（不可恢复）
  - **⚠️ 警告**: 永久删除操作请谨慎使用！

#### 5. `rename_file` - 重命名/移动文件
- **功能**: 重命名文件或移动到新位置
- **参数**: `old_path` (必需), `new_path` (必需)
- **返回**: 操作结果消息

#### 6. `copy_file` - 复制文件或目录
- **功能**: 复制文件或目录到新位置
- **参数**: `source` (必需), `destination` (必需), `overwrite` (可选)
- **返回**: 操作结果消息
- **特性**: 支持递归复制目录

### ✏️ 文件内容操作（3个）

#### 7. `write_file` - 写入文件
- **功能**: 创建新文件或覆盖现有文件
- **参数**: `path` (必需), `content` (必需), `encoding` (可选)
- **返回**: 操作结果消息
- **⚠️ 警告**: 会完全覆盖现有文件！

#### 8. `append_to_file` - 追加内容
- **功能**: 在文件末尾追加内容
- **参数**: `path` (必需), `content` (必需)
- **返回**: 操作结果消息

#### 9. `replace_in_file` - 替换文本
- **功能**: 在文件中查找并替换文本
- **参数**: `path` (必需), `search` (必需), `replace` (必需), `regex` (可选，暂不支持)
- **返回**: 替换次数和结果消息

### 🌐 网络操作（1个）

#### 10. `download_file` - 下载文件
- **功能**: 从 URL 下载文件到指定位置
- **参数**: `url` (必需), `destination` (必需), `filename` (可选)
- **返回**: 下载文件路径
- **特性**: 
  - 如果 `destination` 是目录，会使用 `filename` 或从 URL 提取文件名
  - 自动创建目标目录

### 💻 系统命令（1个）

#### 11. `run_command` - 执行系统命令
- **功能**: 执行系统命令（PowerShell/CMD on Windows, Bash/Sh on Mac/Linux）
- **参数**: `command` (必需), `args` (可选), `shell` (可选), `working_dir` (可选), `timeout_seconds` (可选，默认 60)
- **返回**: `RunCommandResult` (stdout, stderr, exit_code, success)
- **特性**: 
  - Windows 默认使用 PowerShell，可指定 `cmd` 使用 CMD
  - Mac/Linux 默认使用 Bash，可指定 `sh` 使用 Sh
  - 支持设置工作目录和超时时间
  - 用于执行工具没有覆盖到的操作（如安装软件、修改系统设置等）

## 📝 使用示例

### 文件操作示例

```javascript
// 列出文件（默认不包含隐藏文件）
await invoke("list_files", {
  options: { path: "D:\\Workspace", recursive: true, pattern: "*.ts" }
});

// 包含隐藏文件
await invoke("list_files", {
  options: { path: "D:\\Workspace", recursive: true, include_hidden: true }
});

// 读取文件
await invoke("read_file", {
  options: { path: "D:\\Workspace\\package.json" }
});

// 搜索文件内容
await invoke("search_in_files", {
  options: {
    path: "D:\\Workspace",
    pattern: "useState",
    file_pattern: "*.tsx",
    recursive: true
  }
});

// 写入文件
await invoke("write_file", {
  options: {
    path: "D:\\Workspace\\new-file.txt",
    content: "Hello, World!"
  }
});

// 重命名文件
await invoke("rename_file", {
  options: {
    old_path: "D:\\Workspace\\old-name.txt",
    new_path: "D:\\Workspace\\new-name.txt"
  }
});

// 复制文件
await invoke("copy_file", {
  options: {
    source: "D:\\Workspace\\file.txt",
    destination: "D:\\Backup\\file.txt",
    overwrite: true
  }
});

// 下载文件
await invoke("download_file", {
  options: {
    url: "https://example.com/file.zip",
    destination: "C:\\Users\\Username\\Desktop",
    filename: "downloaded-file.zip"
  }
});

// 执行系统命令（Windows PowerShell）
await invoke("run_command", {
  options: {
    command: "Get-Process | Select-Object -First 5",
    shell: "powershell"
  }
});

// 执行系统命令（Windows CMD）
await invoke("run_command", {
  options: {
    command: "dir",
    shell: "cmd",
    working_dir: "C:\\Users\\Username\\Desktop"
  }
});

// 执行系统命令（Mac/Linux Bash）
await invoke("run_command", {
  options: {
    command: "ls -la",
    shell: "bash",
    working_dir: "/home/username"
  }
});
```

### AI 对话示例

用户可以说：
- "读取 `D:\Workspace\package.json` 的内容"
- "在 `D:\Workspace` 中搜索 `useState`，只搜索 `.tsx` 文件"
- "将 `D:\Workspace\old.txt` 重命名为 `new.txt`"
- "复制 `D:\Workspace\src` 目录到 `D:\Backup\src`"
- "在 `D:\Workspace\config.json` 中将 `localhost` 替换为 `production.com`"
- "下载 `https://example.com/file.zip` 到桌面"
- "删除 `D:\Workspace\temp` 目录及其所有内容"

## 🔒 安全注意事项

1. **删除操作**: `delete_file` 会永久删除文件，无法恢复
2. **覆盖操作**: `write_file` 会完全覆盖现有文件
3. **网络下载**: `download_file` 会下载任意 URL 的文件，注意来源可信度
4. **文件大小**: `read_file` 限制 10MB，避免读取过大文件导致内存问题

## 🚀 下一步计划

参考 `docs/tools-roadmap.md` 了解未来计划添加的工具。

