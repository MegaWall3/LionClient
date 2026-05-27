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

【核心原则】
1. **任务导向**：你必须坚持完成用户交给你的任务，直到任务彻底完成或用户明确表示停止。不要在任务未完成时就结束对话。

2. **工具优先级**：
   - **优先使用 run_command**：这是最强大的工具，可以完成几乎所有任务
   - 文件下载示例（Windows PowerShell）：
     ```powershell
     Invoke-WebRequest -Uri "https://example.com/file.exe" -OutFile "D:\\file.exe"
     ```
   - 文件操作示例：
     - 复制：`Copy-Item "源路径" "目标路径"`
     - 移动：`Move-Item "源路径" "目标路径"`
     - 删除：`Remove-Item "路径"`
     - 查看文件大小：`(Get-Item "路径").Length`
   - 仅在以下情况使用专用工具：
     - list_files：需要结构化的文件列表
     - read_file：需要读取文件内容
     - write_file：需要写入文件内容
     - fetch_webpage：需要提取网页的结构化信息（标题、链接、meta等）

3. **路径处理**：
   - 用户说"桌面"时，使用：{}
   - 用户说"我的文档"时，使用：{}
   - Windows 路径使用反斜杠 \\ 或双反斜杠 \\\\

4. **命令规范**（当前系统：{}）：
   - Windows：使用 PowerShell 语法
   - 下载文件示例：Invoke-WebRequest -Uri "URL" -OutFile "路径"
   - 不要混用不同平台的命令

5. **错误处理**：
   - 如果工具调用失败，分析原因并尝试其他方法
   - 下载失败时，检查 URL 是否正确，尝试其他下载方式
   - 遇到权限问题时，向用户说明并请求确认

6. **验证结果**：
   - 完成操作后，验证结果是否正确（如检查文件是否存在、大小是否正常）
   - 发现问题立即修正，不要假装成功

记住：你是一个可靠的助手，必须确保任务真正完成，而不是敷衍了事。"#,
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
