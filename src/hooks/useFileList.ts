import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FileEntry } from "../types";

/**
 * 管理即时文件列表工具的状态和操作
 */
export function useFileList() {
  const [listPath, setListPath] = useState("D:\\\\Workspace");
  const [listPattern, setListPattern] = useState("");
  const [listRecursive, setListRecursive] = useState(false);
  const [listResults, setListResults] = useState<FileEntry[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  /**
   * 执行文件列表查询
   */
  async function handleListFiles() {
    if (!listPath.trim()) {
      setListError("请输入需要扫描的目录路径");
      return;
    }

    setListLoading(true);
    setListError(null);
    try {
      const data = await invoke<FileEntry[]>("list_files", {
        options: {
          path: listPath.trim(),
          recursive: listRecursive,
          pattern: listPattern.trim() || undefined,
          limit: 200,
        },
      });
      setListResults(data);
    } catch (error) {
      const message =
        (error as { message?: string })?.message ??
        "无法列出文件，请检查路径或权限。";
      setListError(message);
    } finally {
      setListLoading(false);
    }
  }

  /**
   * 重置文件列表状态
   */
  function resetFileList() {
    setListPath("D:\\\\Workspace");
    setListPattern("");
    setListRecursive(false);
    setListResults([]);
    setListError(null);
  }

  return {
    // 状态
    listPath,
    listPattern,
    listRecursive,
    listResults,
    listLoading,
    listError,
    // 操作
    setListPath,
    setListPattern,
    setListRecursive,
    handleListFiles,
    resetFileList,
  };
}

