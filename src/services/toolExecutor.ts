import { invoke } from "@tauri-apps/api/core";
import type { FileEntry } from "../types";

/**
 * 工具执行结果
 */
export interface ToolExecutionResult {
  result: any;
  status: "success" | "error";
}

/**
 * 执行单个工具调用
 */
export async function executeToolCall(
  functionName: string,
  functionArgs: Record<string, any>
): Promise<ToolExecutionResult> {
  try {
    let toolResult: any;

    switch (functionName) {
      case "list_files":
        toolResult = await invoke<FileEntry[]>("list_files", {
          options: functionArgs,
        });
        break;

      case "read_file":
        toolResult = await invoke<string>("read_file", {
          options: functionArgs,
        });
        break;

      case "search_in_files":
        toolResult = await invoke<any[]>("search_in_files", {
          options: functionArgs,
        });
        break;

      case "delete_file":
        toolResult = await invoke<string>("delete_file", {
          options: functionArgs,
        });
        break;

      case "rename_file":
        toolResult = await invoke<string>("rename_file", {
          options: functionArgs,
        });
        break;

      case "copy_file":
        toolResult = await invoke<string>("copy_file", {
          options: functionArgs,
        });
        break;

      case "write_file":
        toolResult = await invoke<string>("write_file", {
          options: functionArgs,
        });
        break;

      case "append_to_file":
        toolResult = await invoke<string>("append_to_file", {
          options: functionArgs,
        });
        break;

      case "replace_in_file":
        toolResult = await invoke<string>("replace_in_file", {
          options: functionArgs,
        });
        break;

      case "download_file":
        try {
          toolResult = await invoke<string>("download_file", {
            options: functionArgs,
          });
        } catch (error) {
          return {
            result: `下载失败: ${error}`,
            status: "error",
          };
        }
        break;

      case "fetch_webpage":
        toolResult = await invoke<any>("fetch_webpage", {
          options: functionArgs,
        });
        break;

      case "run_command":
        toolResult = await invoke<any>("run_command", {
          options: functionArgs,
        });
        break;

      default:
        return {
          result: `未知工具: ${functionName}`,
          status: "error",
        };
    }

    return {
      result: toolResult,
      status: "success",
    };
  } catch (error) {
    console.error(`[ToolExecutor] ${functionName} 执行失败:`, error);
    return {
      result: `执行失败: ${error}`,
      status: "error",
    };
  }
}

