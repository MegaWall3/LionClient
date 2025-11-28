import { useCallback, useEffect, useMemo, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export function useWindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);

  const appWindow = useMemo(() => {
    if (typeof window === "undefined") {
      return null;
    }
    try {
      return WebviewWindow.getCurrent();
    } catch (error) {
      console.warn("[useWindowControls] 无法获取当前窗口实例:", error);
      return null;
    }
  }, []);

  const syncWindowState = useCallback(async () => {
    if (!appWindow) return;
    try {
      const [maximized, fullscreen] = await Promise.all([
        appWindow.isMaximized(),
        appWindow.isFullscreen(),
      ]);
      setIsMaximized(maximized || fullscreen);
    } catch (error) {
      console.error("[useWindowControls] 获取窗口状态失败:", error);
    }
  }, [appWindow]);

  useEffect(() => {
    if (!appWindow) return;

    let unlistenResize: UnlistenFn | undefined;
    let disposed = false;

    void (async () => {
      await syncWindowState();
      unlistenResize = await appWindow.onResized?.(() => {
        if (!disposed) {
          void syncWindowState();
        }
      });
    })();

    return () => {
      disposed = true;
      unlistenResize?.();
    };
  }, [appWindow, syncWindowState]);

  const minimize = useCallback(async () => {
    if (!appWindow) return;
    await appWindow.minimize();
  }, [appWindow]);

  const maximizeToggle = useCallback(async () => {
    if (!appWindow) return;
    if (isMaximized) {
      await appWindow.unmaximize();
    } else {
      await appWindow.maximize();
    }
    await syncWindowState();
  }, [appWindow, isMaximized, syncWindowState]);

  const close = useCallback(async () => {
    if (!appWindow) return;
    await appWindow.close();
  }, [appWindow]);

  return {
    isMaximized,
    minimize,
    maximizeToggle,
    close,
  };
}

