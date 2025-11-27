import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { UnlistenFn } from "@tauri-apps/api/event";

export function useWindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    let unlistenResize: UnlistenFn | undefined;

    (async () => {
      const maximized = await appWindow.isMaximized();
      console.log("[useWindowControls] 初始最大化状态:", maximized);
      setIsMaximized(maximized);
      
      unlistenResize = await appWindow.onResized(async () => {
        const newMaximized = await appWindow.isMaximized();
        console.log("[useWindowControls] 窗口大小改变，新状态:", newMaximized);
        setIsMaximized(newMaximized);
      });
    })();

    return () => {
      if (unlistenResize) {
        unlistenResize();
      }
    };
  }, [appWindow]);

  const minimize = async () => {
    console.log("[useWindowControls] 执行最小化");
    try {
      await appWindow.minimize();
      console.log("[useWindowControls] 最小化成功");
    } catch (error) {
      console.error("[useWindowControls] 最小化失败:", error);
    }
  };

  const maximizeToggle = async () => {
    console.log("[useWindowControls] 执行最大化切换，当前状态:", isMaximized);
    try {
      await appWindow.toggleMaximize();
      console.log("[useWindowControls] 最大化切换成功");
      // 切换后更新状态
      const newState = await appWindow.isMaximized();
      setIsMaximized(newState);
      console.log("[useWindowControls] 新状态:", newState);
    } catch (error) {
      console.error("[useWindowControls] 最大化切换失败:", error);
    }
  };

  const close = async () => {
    console.log("[useWindowControls] 执行关闭");
    try {
      await appWindow.close();
      console.log("[useWindowControls] 关闭成功");
    } catch (error) {
      console.error("[useWindowControls] 关闭失败:", error);
    }
  };

  return {
    isMaximized,
    minimize,
    maximizeToggle,
    close,
  };
}

