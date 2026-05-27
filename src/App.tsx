import { useState } from "react";
import { ChatFooter, ChatHeader, RightPanel, Sidebar, WindowControls } from "./components";
import { ChatContainerOriginal, ChatInputStandalone } from "./components/Chat";
import { useAutoScroll, useFileList, useLLMStream, useWindowControls } from "./hooks";
import type { ToolTrace } from "./types";

// 初始工具轨迹：空数组，不显示预置数据
const initialTrace: ToolTrace[] = [];

function App() {
  const [input, setInput] = useState("");
  const [toolTrace] = useState<ToolTrace[]>(initialTrace);

  // 窗口控制
  const { isMaximized, minimize, maximizeToggle, close } = useWindowControls();

  // LLM 流式对话
  const { messages, isThinking, sendMessage, stopThinking, startNewChat } = useLLMStream();

  // 自动滚动
  const messagesEndRef = useAutoScroll(messages, isThinking);

  // 即时工具状态
  const {
    listPath,
    listPattern,
    listRecursive,
    listResults,
    listLoading,
    listError,
    setListPath,
    setListPattern,
    setListRecursive,
    handleListFiles,
    resetFileList,
  } = useFileList();

  // 发送消息
  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(input);
    setInput("");
  };

  // 停止推理
  const handleStop = () => {
    stopThinking();
  };

  // 新建对话
  const handleNewChat = () => {
    startNewChat();
    setInput("");
    resetFileList();
  };

  return (
    <div className="h-screen bg-slate-950 text-slate-100 overflow-hidden flex flex-col">
      <div className="flex-1 flex flex-col gap-3 p-3 sm:gap-4 sm:p-4 min-h-0">
        <WindowControls
          isMaximized={isMaximized}
          onMinimize={minimize}
          onMaximizeToggle={maximizeToggle}
          onClose={close}
        />

        <div className="grid flex-1 min-h-0 gap-4 lg:grid-cols-[280px_1fr] xl:grid-cols-[320px_1fr]">
          {/* 侧边栏 */}
          <Sidebar onNewChat={handleNewChat} />

          <section className="flex min-h-0 flex-col rounded-3xl border border-white/5 bg-white/5/20 backdrop-blur-2xl shadow-[0_20px_120px_-80px_rgba(15,23,42,1)]">
            {/* 聊天头部 */}
            <ChatHeader />

            <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
              <div className="flex flex-1 min-h-0 flex-col">
                {/* 聊天消息容器 */}
                <ChatContainerOriginal
                  messages={messages}
                  isThinking={isThinking}
                  messagesEndRef={messagesEndRef}
                />

                {/* 聊天输入框 */}
                <ChatInputStandalone
                  value={input}
                  onChange={setInput}
                  onSend={handleSend}
                  onStop={handleStop}
                  isThinking={isThinking}
                />

                {/* 聊天底部工具栏 */}
                <ChatFooter />
              </div>

              {/* 右侧面板 */}
              <RightPanel
                toolTrace={toolTrace}
                listPath={listPath}
                listPattern={listPattern}
                listRecursive={listRecursive}
                listResults={listResults}
                listLoading={listLoading}
                listError={listError}
                onPathChange={setListPath}
                onPatternChange={setListPattern}
                onRecursiveChange={setListRecursive}
                onExecute={() => void handleListFiles()}
                onReset={resetFileList}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default App;
