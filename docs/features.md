# AI-PC-ELF 功能文档

## 当前已实现的 Toolcall 功能

### 1. `list_files` - 文件列表工具

**功能描述：** 扫描并列出指定目录下的文件和文件夹。

**参数：**
- `path` (必需): 要扫描的目录路径，例如 `"D:\\Workspace"` 或 `"C:\\Users\\Username\\Documents"`
- `recursive` (可选): 是否递归扫描子目录，默认为 `false`
- `pattern` (可选): 文件名模式匹配（不区分大小写），例如 `"*.ts"` 或 `"test"`
- `limit` (可选): 返回结果的最大数量，默认为 200

**返回数据：**
```typescript
interface FileEntry {
  path: string;           // 文件/文件夹的完整路径
  file_type: string;      // "file" | "directory" | "other"
  size?: number;          // 文件大小（字节），仅文件有值
  modified_ms?: number;   // 最后修改时间（毫秒时间戳）
}
```

**使用示例：**
- "列出 D 盘 Workspace 目录下的所有文件"
- "扫描 C 盘 Users 目录，查找所有 .ts 文件，递归搜索"
- "查看 Downloads 文件夹中最近修改的文件，限制返回 50 个结果"

**前端调用方式：**
- 可以通过左侧边栏的"索引/搜索"工具手动调用
- 也可以通过对话让 AI 自动调用（需要 AI 理解并生成 toolcall）

## 对话功能

### 当前支持的操作

1. **基础对话**
   - 与 AI 进行自然语言对话
   - 流式输出响应，实时显示 AI 回复

2. **文件系统操作**
   - 通过 `list_files` 工具扫描和搜索文件
   - 支持路径、递归、模式匹配等参数

### 如何与 AI 对话进行文件操作

目前，AI 可以通过以下方式理解你的需求并调用工具：

**示例对话：**
- "帮我看看 D 盘 workspace 目录里有哪些最近修改的 TypeScript 文件"
- "扫描一下我的 Downloads 文件夹，找出所有图片文件"
- "列出 C 盘 Program Files 目录下的所有文件夹"

**注意：** 当前版本中，AI 的 toolcall 功能还在开发中。目前你可以：
1. 通过左侧边栏的"索引/搜索"工具手动执行文件列表操作
2. 在对话中描述需求，但需要手动触发工具调用（或等待 AI toolcall 功能完善）

## 计划中的功能

根据项目愿景，未来将支持以下功能：

1. **文件操作**
   - 批量删除文件
   - 批量重命名文件
   - 移动/复制文件

2. **文件内容操作**
   - 在文件中搜索关键词
   - 读取文件内容
   - 修改文件内容

3. **系统操作**
   - 清理 C 盘空间
   - 更新/安装/卸载软件
   - 修改系统设置

4. **高级功能**
   - 沙箱机制（展示修改了哪些文件、注册表等）
   - 截图和点击操作
   - 自动化操作流程

## 技术栈

- **前端**: React + TypeScript + TailwindCSS + shadcn/ui
- **后端**: Rust + Tauri
- **LLM**: SiliconFlow API (Qwen/Qwen2.5-32B-Instruct)
- **通信**: Tauri Commands + Events (流式输出)

