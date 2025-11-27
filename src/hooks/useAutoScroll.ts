import { useEffect, useRef } from "react";
import type { ChatMessage } from "../types";

export function useAutoScroll(messages: ChatMessage[], isThinking: boolean) {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const lastUserMessageCount = useRef(0);

  useEffect(() => {
    const userMessageCount = messages.filter((msg) => msg.role === "user").length;
    // 只有当用户消息数量增加时才滚动（即用户发送了新消息）
    if (userMessageCount > lastUserMessageCount.current) {
      lastUserMessageCount.current = userMessageCount;
      // 延迟一下确保 DOM 更新完成
      setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
      }, 100);
    }
  }, [messages]);

  return messagesEndRef;
}

