import {
  Download,
  FolderSearch2,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import type { ToolTrace } from "../types";

/**
 * 快速操作提示
 */
export const quickActions = [
  "扫描 Downloads 并按大小排序",
  "批量重命名截图为 2025-11-*.png",
  "拉取 Git 仓库并生成变更摘要",
];

/**
 * 可用工具列表
 */
export const availableTools = [
  { icon: FolderSearch2, label: "索引/搜索", accent: "from-cyan-400/80" },
  { icon: Download, label: "下载/同步", accent: "from-emerald-400/80" },
  { icon: TerminalSquare, label: "Shell 宏", accent: "from-blue-400/80" },
  { icon: ShieldCheck, label: "沙箱审计", accent: "from-pink-400/80" },
];

/**
 * 工具轨迹状态徽章样式
 */
export const statusBadges: Record<ToolTrace["status"], string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-amber-500/10 text-amber-400",
  done: "bg-emerald-500/10 text-emerald-400",
  error: "bg-rose-500/10 text-rose-400",
};

/**
 * 默认 LLM 模型
 */
export const DEFAULT_MODEL = "Qwen/Qwen2.5-72B-Instruct";

