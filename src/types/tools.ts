export interface FileEntry {
  path: string;
  file_type: string;
  size?: number | null;
  modified_ms?: number | null;
}

export interface ListFilesOptions {
  path: string;
  recursive?: boolean;
  pattern?: string;
  limit?: number;
  include_hidden?: boolean;
}

export interface ReadFileOptions {
  path: string;
  encoding?: string;
  max_size?: number;
}

export interface SearchInFilesOptions {
  path: string;
  pattern: string;
  file_pattern?: string;
  recursive?: boolean;
  case_sensitive?: boolean;
}

export interface SearchResult {
  file_path: string;
  line_number: number;
  line_content: string;
  match_index: number;
}

export interface DeleteFileOptions {
  path: string;
  recursive?: boolean;
  permanent?: boolean; // 是否永久删除（不移动到回收站），默认为 false
}

export interface RenameFileOptions {
  old_path: string;
  new_path: string;
}

export interface CopyFileOptions {
  source: string;
  destination: string;
  overwrite?: boolean;
}

export interface WriteFileOptions {
  path: string;
  content: string;
  encoding?: string;
}

export interface AppendToFileOptions {
  path: string;
  content: string;
}

export interface ReplaceInFileOptions {
  path: string;
  search: string;
  replace: string;
  regex?: boolean;
}

export interface DownloadFileOptions {
  url: string;
  destination: string;
  filename?: string;
}

export interface RunCommandOptions {
  command: string;
  args?: string[];
  shell?: string; // "powershell", "cmd", "bash", "sh" 等，默认自动检测
  working_dir?: string; // 工作目录
  timeout_seconds?: number; // 超时时间（秒），默认 60
}

export interface RunCommandResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  success: boolean;
}

export interface FetchWebpageOptions {
  url: string;
  extract_text?: boolean; // 是否提取纯文本（去除 HTML 标签），默认为 true
  extract_links?: boolean; // 是否提取所有链接，默认为 false
  extract_meta?: boolean; // 是否提取 meta 标签信息，默认为 true
  max_length?: number; // 提取文本的最大长度，默认为 100000 字符
  timeout_seconds?: number; // 请求超时时间（秒），默认为 30
}

export interface LinkInfo {
  href: string;
  text: string;
}

export interface MetaInfo {
  description?: string;
  keywords?: string;
  author?: string;
  og_title?: string;
  og_description?: string;
  og_image?: string;
}

export interface WebpageContent {
  url: string;
  title?: string;
  text_content?: string; // 提取的纯文本内容
  html_content?: string; // 原始 HTML（如果 extract_text=false）
  links: LinkInfo[]; // 提取的链接列表
  meta: MetaInfo; // Meta 信息
  status_code: number;
}

