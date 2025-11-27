import { invoke } from "@tauri-apps/api/core";
import type {
  FileEntry,
  ListFilesOptions,
  ReadFileOptions,
  SearchInFilesOptions,
  SearchResult,
  DeleteFileOptions,
  RenameFileOptions,
  CopyFileOptions,
  WriteFileOptions,
  AppendToFileOptions,
  ReplaceInFileOptions,
  DownloadFileOptions,
  FetchWebpageOptions,
  WebpageContent,
  RunCommandOptions,
  RunCommandResult,
} from "../types";

export async function executeListFiles(
  options: ListFilesOptions
): Promise<FileEntry[]> {
  return await invoke<FileEntry[]>("list_files", { options });
}

export async function executeReadFile(
  options: ReadFileOptions
): Promise<string> {
  return await invoke<string>("read_file", { options });
}

export async function executeSearchInFiles(
  options: SearchInFilesOptions
): Promise<SearchResult[]> {
  return await invoke<SearchResult[]>("search_in_files", { options });
}

export async function executeDeleteFile(
  options: DeleteFileOptions
): Promise<string> {
  return await invoke<string>("delete_file", { options });
}

export async function executeRenameFile(
  options: RenameFileOptions
): Promise<string> {
  return await invoke<string>("rename_file", { options });
}

export async function executeCopyFile(
  options: CopyFileOptions
): Promise<string> {
  return await invoke<string>("copy_file", { options });
}

export async function executeWriteFile(
  options: WriteFileOptions
): Promise<string> {
  return await invoke<string>("write_file", { options });
}

export async function executeAppendToFile(
  options: AppendToFileOptions
): Promise<string> {
  return await invoke<string>("append_to_file", { options });
}

export async function executeReplaceInFile(
  options: ReplaceInFileOptions
): Promise<string> {
  return await invoke<string>("replace_in_file", { options });
}

export async function executeDownloadFile(
  options: DownloadFileOptions
): Promise<string> {
  return await invoke<string>("download_file", { options });
}

export async function executeFetchWebpage(
  options: FetchWebpageOptions
): Promise<WebpageContent> {
  return await invoke<WebpageContent>("fetch_webpage", { options });
}

export async function executeRunCommand(
  options: RunCommandOptions
): Promise<RunCommandResult> {
  return await invoke<RunCommandResult>("run_command", { options });
}

export async function executeToolCall(
  toolName: string,
  args: Record<string, any>
): Promise<any> {
  switch (toolName) {
    case "list_files":
      return await executeListFiles(args as ListFilesOptions);
    case "read_file":
      return await executeReadFile(args as ReadFileOptions);
    case "search_in_files":
      return await executeSearchInFiles(args as SearchInFilesOptions);
    case "delete_file":
      return await executeDeleteFile(args as DeleteFileOptions);
    case "rename_file":
      return await executeRenameFile(args as RenameFileOptions);
    case "copy_file":
      return await executeCopyFile(args as CopyFileOptions);
    case "write_file":
      return await executeWriteFile(args as WriteFileOptions);
    case "append_to_file":
      return await executeAppendToFile(args as AppendToFileOptions);
    case "replace_in_file":
      return await executeReplaceInFile(args as ReplaceInFileOptions);
    case "download_file":
      return await executeDownloadFile(args as DownloadFileOptions);
    case "fetch_webpage":
      return await executeFetchWebpage(args as FetchWebpageOptions);
    case "run_command":
      return await executeRunCommand(args as RunCommandOptions);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

