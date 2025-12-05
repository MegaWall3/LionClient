import { format as formatDate, formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

export function formatSize(size?: number | null): string {
  if (!size) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

/**
 * 格式化时间戳为日期时间字符串
 * @param ms 毫秒时间戳
 * @returns 格式化的日期时间字符串，例如 "01/15 14:30"
 */
export function formatTime(ms?: number | null): string {
  if (!ms) return "—";
  const date = new Date(ms);
  return formatDate(date, "MM/dd HH:mm", { locale: zhCN });
}

/**
 * 格式化当前时间为时间戳字符串（用于消息时间戳）
 * @returns 格式化的时间字符串，例如 "14:30"
 */
export function formatTimestamp(): string {
  return formatDate(new Date(), "HH:mm", { locale: zhCN });
}

/**
 * 格式化相对时间（例如 "2 分钟前"）
 * @param ms 毫秒时间戳
 * @returns 相对时间字符串
 */
export function formatRelativeTime(ms?: number | null): string {
  if (!ms) return "—";
  const date = new Date(ms);
  return formatDistanceToNow(date, { addSuffix: true, locale: zhCN });
}
