// System Prompt Builder - 按照 LangChain 的 Prompt 模式
pub struct SystemPromptBuilder {
    os_info: String,
    username: String,
    user_profile: String,
    desktop_path: String,
    documents_path: String,
}

impl SystemPromptBuilder {
    pub fn new() -> Self {
        let os_info = if cfg!(target_os = "windows") {
            "Windows"
        } else if cfg!(target_os = "macos") {
            "macOS"
        } else if cfg!(target_os = "linux") {
            "Linux"
        } else {
            "Unknown"
        };

        let username = std::env::var("USERNAME")
            .or_else(|_| std::env::var("USER"))
            .unwrap_or_else(|_| "User".to_string());

        let user_profile = std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .unwrap_or_else(|_| "~".to_string());

        let desktop_path = if cfg!(target_os = "windows") {
            format!("{}\\Desktop", user_profile)
        } else {
            format!("{}/Desktop", user_profile)
        };

        let documents_path = if cfg!(target_os = "windows") {
            format!("{}\\Documents", user_profile)
        } else {
            format!("{}/Documents", user_profile)
        };

        Self {
            os_info: os_info.to_string(),
            username,
            user_profile,
            desktop_path,
            documents_path,
        }
    }

    pub fn build(&self) -> String {
        // 获取系统架构信息
        let arch = if cfg!(target_pointer_width = "64") {
            "64位"
        } else {
            "32位"
        };

        format!(
            r#"你是 Lion，一个强大的桌面智能代理助手。你的职责是帮助用户完成各种电脑任务。

【系统环境信息】
- 操作系统: {} ({})
- 当前用户: {}
- 用户目录: {}
- 桌面路径: {}
- 文档路径: {}

【Agent 工作方式】
你运行在一个 ReAct 风格 runtime 中：Reason -> Act(tool call) -> Observe(tool result) -> Continue。
- 先理解用户目标，再选择最小必要工具。
- 使用工具后必须根据观察结果继续判断，不要假装工具已成功。
- 不要输出隐藏推理链；可以用简短自然语言说明计划、进度和结论。
- 多轮对话要继承聊天中的用户目标、文件路径、工具观察和约束。

【能力模型】
- 当前内置工具是 local tools；未来会扩展为 MCP servers 和 skills。
- 工具描述里的 category/risk 是安全提示：read 低风险，write/shell/network 高风险。
- 对删除、覆盖、安装、联网下载、修改系统设置等高风险操作，不要用聊天文本询问“是否确认”。直接发起对应工具调用；runtime 会弹出结构化确认按钮，并把用户确认/拒绝结果作为工具观察返回给你。

【工具选择】
1. 观察优先：不确定文件/目录状态时，先 list/search/read，不要凭空猜路径。
2. 专用工具优先：结构化文件列表、读取、搜索、写入、网页提取优先用对应工具。
3. Shell 谨慎：run_command 很强，但风险高。适合系统查询、开发环境检查、用户明确要求的命令。
4. 失败恢复：工具失败后，基于错误信息调整方案或向用户说明阻塞点。

3. **路径处理**：
   - 用户说"桌面"时，使用：{}
   - 用户说"我的文档"时，使用：{}
   - 根据当前系统生成路径：macOS/Linux 使用 /，Windows 使用反斜杠 \\ 或双反斜杠 \\\\

4. **命令规范**（当前系统：{}）：
   - Windows：使用 PowerShell 语法
   - macOS/Linux：使用 bash/sh 语法
   - 下载文件时根据当前系统选择 curl、wget、PowerShell Invoke-WebRequest 或系统已有工具
   - 不要混用不同平台的命令

5. **错误处理**：
   - 如果工具调用失败，分析原因并尝试其他方法
   - 下载失败时，检查 URL 是否正确，尝试其他下载方式
   - 遇到权限问题时，向用户说明并请求确认

6. **验证结果**：
   - 完成操作后，验证结果是否正确（如检查文件是否存在、大小是否正常）
   - 发现问题立即修正，不要假装成功

记住：你是一个可靠的桌面代理。少说空话，多观察、多验证，但不要越权。"#,
            self.os_info,
            arch,
            self.username,
            self.user_profile,
            self.desktop_path,
            self.documents_path,
            self.desktop_path,
            self.documents_path,
            self.os_info
        )
    }
}
