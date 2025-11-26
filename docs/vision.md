## AI-PC-ELF：桌面端 AI Agent 设计文档（草案）

## 一、产品定位

**一句话**：  
AI-PC-ELF 是一款运行在 PC /（未来支持 macOS）上的桌面端 AI Agent，  
通过对话 + 工具调用（toolcall / MCP），帮助用户自动完成各种电脑操作与环境配置。

**目标用户**：
- 日常办公用户：不想记命令行和各种系统设置入口
- 程序员 / 运维：想用自然语言批量处理文件、管理开发环境
- “重度电脑使用者”：希望把重复操作交给智能助手

**核心理念**：
- 大模型负责 **理解意图 + 规划步骤**
- AI-PC-ELF 负责 **安全、可控地执行系统级操作**

---

## 二、典型使用场景（Use Cases）

- **文件与磁盘管理**
  - **批量操作**：重命名、移动、删除、整理目录结构
  - **全文搜索**：在 `.txt` / 代码文件中搜索关键字、正则匹配
  - **磁盘清理**：清理临时文件、下载目录、特定软件缓存（如浏览器、IDE）

- **系统与环境配置**
  - 安装 / 卸载软件（例如通过 `winget` / `choco` / 未来的 `brew` 等）
  - 配置编程环境（安装 Node / Rust / Python / Java、配置 PATH 等）
  - 修改系统设置：如电源模式、代理设置、开机启动项（在安全前提下）

- **自动化和操作宏**
  - 根据提示词执行一系列命令（脚本化自然语言）
  - 将常用操作保存为“配方”（recipes），一键重放
  - 未来：结合截图 + UI 控制，实现“帮我点这里、打开那个面板”

- **安全沙箱 / 审计**
  - 展示即将执行的命令与将修改的文件列表
  - 支持 Dry-run（只展示计划，不实际执行）
  - 保留日志，以便回顾 / 回滚

---

## 三、能力边界与安全策略

- **默认保守**
  - 读操作（列目录、搜索、查看文件）默认允许
  - 写操作（删除、修改、卸载软件、改注册表）必须：
    - 明确展示操作计划
    - 获得用户确认后才能执行

- **权限与范围控制**
  - 支持配置允许操作的目录白名单（例如仅限于 `D:\Work`、`D:\Projects`）
  - 高危区域（如 `C:\Windows`、注册表根键）默认只读或需要二次确认

- **可审计性**
  - 每一次 tool 调用记录：时间、命令、参数、影响的路径 / 键值
  - 支持导出 / 查看操作日志

---

## 四、总体架构（高层）

- **前端（Tauri + React + TypeScript）**
  - **聊天界面**：展示用户消息、Agent 回复、工具调用结果
  - **操作预览面板**：展示将要执行的命令和文件变更
  - **设置面板**：
    - 工具开关与权限范围
    - LLM 配置（API Key、本地模型等）
    - 日志 / 审计查看

- **Tauri 后端（Rust）**
  - **工具层（Tools Layer）**：
    - `run_powershell` / `run_cmd` / 将来的 `run_shell`（macOS）
    - 文件系统操作：`list_files`、`delete_files`、`rename_files`、`search_in_files`
    - 系统操作：软件安装 / 卸载、磁盘信息、系统状态查询
  - **安全层（Guard / Sandbox）**：
    - 对每次工具调用做参数检查
    - 生成“操作计划”给前端确认
  - **日志与审计模块**：
    - 按会话或按时间记录所有系统操作

- **AI 规划层（Agent Orchestrator）**
  - Initial 版本可在前端 TypeScript 实现：
    - 将用户自然语言解析为 “意图 + 工具调用序列”
    - 根据工具执行结果调整后续计划
  - 与外部大模型交互：
    - 支持 OpenAI / Claude / 本地 LLM 等
    - 使用 toolcall / MCP（未来）描述工具

---

## 五、工具（Tools）设计思路（示例）

每个 Tool 都定义为一个清晰的接口（方便 LLM 使用）：

- **文件相关**
  - `list_files({ path, recursive, patterns })`
  - `delete_files({ files, dry_run })`
  - `rename_files({ renames: [{ from, to }], dry_run })`
  - `search_in_files({ root, pattern, file_glob, max_results })`

- **命令执行**
  - `run_powershell({ script, timeout, dry_run })`
  - 将来添加：`run_bash({ script, timeout, dry_run })`（macOS）

- **系统管理**
  - `get_disk_usage({ path })`
  - `manage_software({ action, name, manager })`（如 `action=install|uninstall`, `manager=winget|choco`）

- **安全相关**
  - `preview_changes({ operations })`：生成可视化 diff
  - `log_operation({ tool, params, result })`

---

## 六、阶段性路线图（Roadmap 草案）

- **Phase 1：MVP**
  - 聊天 UI（简单对话 + 工具调用日志）
  - 基础工具：只读类（列目录、搜索文件、查看文件内容）
  - 手动触发的简单写操作（如删除单个文件），带确认弹窗

- **Phase 2：实用工具集**
  - 批量重命名 / 删除 / 移动
  - C 盘清理助手（针对可配置目录）
  - 环境安装脚本助手（Node、Rust、Git 等）

- **Phase 3：自动化与安全增强**
  - 操作配方（recipes）和一键重放
  - 日志 / 审计界面
  - 更细粒度权限与沙箱配置

- **Phase 4：跨平台与 UI 自动化**
  - 支持 macOS（适配工具层）
  - 截图 + 基础 UI 控制（点击、键盘输入）
  - 更智能的“看得见就能点”的桌面 Agent

---

## 七、非目标（当前阶段暂不做）

- 完全替代专业运维工具（如大型集群管理）
- 绕过系统安全机制（UAC、权限隔离等）
- 无确认的高危自动化操作

---

## 八、总结

AI-PC-ELF 的核心不是“再做一个聊天应用”，  
而是 **把大模型变成一位“懂电脑、会动手、又很克制的桌面管理员”**：

- 用自然语言表达任务
- 用工具调用真正“操作电脑”
- 用沙箱和审计保证安全可控


