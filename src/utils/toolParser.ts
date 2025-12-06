/**
 * 工具参数解析工具函数
 */

/**
 * 规范化工具参数字符串，移除 markdown 代码块标记
 */
export function normalizeToolArgumentString(raw: string): string {
  return raw
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();
}

/**
 * 解析工具参数，支持多层嵌套的 JSON 字符串
 * @throws {Error} 如果解析失败
 */
export function parseToolArguments(raw: string): Record<string, unknown> {
  let current = normalizeToolArgumentString(raw);

  for (let depth = 0; depth < 5; depth += 1) {
    try {
      const parsed = JSON.parse(current);
      if (typeof parsed === "string") {
        current = normalizeToolArgumentString(parsed);
        continue;
      }

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }

      throw new Error("工具参数必须是对象");
    } catch (error) {
      throw new Error(`工具参数解析失败: ${(error as Error).message ?? "格式不正确"}`);
    }
  }

  throw new Error("工具参数解析失败: 嵌套层级过深");
}

/**
 * 获取工具参数预览，解析失败时返回原始字符串
 */
export function getToolArgumentsPreview(raw: string): Record<string, unknown> | string {
  try {
    return parseToolArguments(raw);
  } catch {
    return normalizeToolArgumentString(raw);
  }
}
