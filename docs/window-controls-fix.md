# 窗口控制按钮修复方案

## 问题诊断

根据 Tauri 官方文档，窗口控制按钮不工作的常见原因：

1. **未使用 `toggleMaximize()` API**：应该使用 `appWindow.toggleMaximize()` 而不是分开的 `maximize()` 和 `unmaximize()`
2. **拖拽区域配置错误**：按钮区域不应该设置 `data-tauri-drag-region` 属性
3. **异步处理不当**：窗口操作需要正确处理 Promise

## 已实施的修复

### 1. 更新 `useWindowControls.ts`

```typescript
// ✅ 使用 toggleMaximize() API（官方推荐）
const maximizeToggle = async () => {
  console.log("[useWindowControls] 执行最大化切换，当前状态:", isMaximized);
  try {
    await appWindow.toggleMaximize();
    console.log("[useWindowControls] 最大化切换成功");
    // 切换后更新状态
    const newState = await appWindow.isMaximized();
    setIsMaximized(newState);
  } catch (error) {
    console.error("[useWindowControls] 最大化切换失败:", error);
  }
};

// ✅ 所有操作都改为 async/await 并添加错误处理
const minimize = async () => {
  console.log("[useWindowControls] 执行最小化");
  try {
    await appWindow.minimize();
    console.log("[useWindowControls] 最小化成功");
  } catch (error) {
    console.error("[useWindowControls] 最小化失败:", error);
  }
};
```

### 2. 更新 `WindowControls.tsx`

```typescript
// ✅ 按钮区域不设置 data-tauri-drag-region
<div className="flex items-center gap-2">
  <button onClick={handleMinimize} type="button" title="最小化">
    <Minus className="h-3.5 w-3.5 pointer-events-none" />
  </button>
  {/* ... 其他按钮 */}
</div>

// ✅ 事件处理函数阻止冒泡
const handleMinimize = (e: React.MouseEvent) => {
  e.stopPropagation();
  console.log("[WindowControls] 最小化按钮被点击");
  onMinimize();
};
```

### 3. 配置 `tauri.conf.json`

```json
{
  "app": {
    "windows": [
      {
        "decorations": false,  // ✅ 移除默认标题栏
        "resizable": true,     // ✅ 允许调整大小
        "fullscreen": false
      }
    ]
  }
}
```

## 调试建议

1. **打开浏览器控制台**：查看是否有 `[useWindowControls]` 和 `[WindowControls]` 开头的日志
2. **检查点击事件**：点击按钮时应该看到日志输出
3. **检查 Tauri API**：确认 `getCurrentWindow()` 返回的对象有效

## 参考文档

- [Tauri v2 窗口自定义](https://v2.tauri.app/learn/window-customization/)
- [Tauri Window API](https://v2.tauri.app/reference/javascript/api/namespacewindow/)
- [Tauri 官方示例](https://github.com/tauri-apps/tauri/tree/dev/examples)

## 模型更新

模型已从 `deepseek-ai/DeepSeek-V3` 更改为 `Qwen/Qwen3-Omni-30B-A3B-Instruct`。


