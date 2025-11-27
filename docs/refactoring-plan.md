# 项目重构计划

## 当前问题

1. **前端代码**：`src/App.tsx` 超过 1000 行，包含所有逻辑
2. **后端代码**：`src-tauri/src/lib.rs` 包含所有 Rust 逻辑
3. **缺乏模块化**：没有分离关注点
4. **难以维护**：代码耦合度高

## 目标结构

```
src/
├── types/              # TypeScript 类型定义
│   ├── chat.ts
│   ├── tools.ts
│   └── index.ts
├── components/         # React 组件
│   ├── Chat/
│   │   ├── ChatMessage.tsx
│   │   ├── ChatInput.tsx
│   │   └── ChatContainer.tsx
│   ├── Sidebar/
│   │   ├── Sidebar.tsx
│   │   └── ToolList.tsx
│   ├── WindowControls.tsx
│   └── index.ts
├── services/          # 业务逻辑服务
│   ├── llm.ts         # LLM 调用服务
│   ├── tools.ts       # Tool 执行服务
│   └── index.ts
├── hooks/             # 自定义 React Hooks
│   ├── useLLM.ts
│   ├── useWindowControls.ts
│   └── index.ts
├── utils/             # 工具函数
│   ├── cn.ts
│   ├── format.ts
│   └── index.ts
├── App.tsx            # 主应用组件（简化后）
└── main.tsx

src-tauri/src/
├── commands/          # Tauri 命令模块
│   ├── llm.rs
│   ├── files.rs
│   └── mod.rs
├── types/             # Rust 类型定义
│   ├── chat.rs
│   └── mod.rs
├── lib.rs             # 主库文件（简化）
└── main.rs
```

## 重构步骤

### 阶段 1：类型定义分离
- [x] 创建 `src/types/` 目录
- [ ] 提取所有类型定义
- [ ] 统一导出

### 阶段 2：工具函数分离
- [ ] 创建 `src/utils/` 目录
- [ ] 提取 `cn` 等工具函数
- [ ] 提取格式化函数

### 阶段 3：组件分离
- [ ] 创建 `src/components/` 目录
- [ ] 分离聊天相关组件
- [ ] 分离侧边栏组件
- [ ] 分离窗口控制组件

### 阶段 4：服务层分离
- [ ] 创建 `src/services/` 目录
- [ ] 分离 LLM 调用逻辑
- [ ] 分离 Tool 执行逻辑

### 阶段 5：自定义 Hooks
- [ ] 创建 `src/hooks/` 目录
- [ ] 提取 `useLLM` hook
- [ ] 提取 `useWindowControls` hook

### 阶段 6：Rust 模块化
- [ ] 创建 `src-tauri/src/commands/` 目录
- [ ] 分离 LLM 相关命令
- [ ] 分离文件操作命令
- [ ] 创建类型模块

## 重构原则

1. **单一职责**：每个模块/组件只负责一个功能
2. **依赖注入**：通过参数传递依赖，便于测试
3. **类型安全**：充分利用 TypeScript 类型系统
4. **可测试性**：分离业务逻辑，便于单元测试
5. **可维护性**：清晰的目录结构和命名规范

