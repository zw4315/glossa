Reader Local — 最小可跑脚手架
--------------------------------

基于 `docs/dev_log.md` 的设计，提供一个最小可跑的 Electron + Vite(React) 工程骨架：

- Electron 主进程 + Preload：暴露 `openFile / getPageView / ensurePageProcessed / getPageState` IPC；
- Renderer：左右分屏 UI，打开文档、翻页、右侧轮询显示（原文/译文/摘要）；
- Service：以内存 Map 做伪 DB，模拟 OCR/LLM 流水线（600ms 完成）。

准备与运行
---------

1) 安装依赖（需要本机 Node 18+）：

   npm i

2) 启动开发：

   npm run dev

3) Electron 将打开并加载 Vite 页面。点击“打开文档”，选择任意 `pdf/png/jpg/jpeg` 文件；
   - 预览是 SVG 占位图；
   - 右侧 0.6s 后显示“伪 OCR/译文/摘要”。

说明与后续替换
-------------

- 目前 `electron/service.mjs` 使用内存 Map 代替 SQLite；你可以按 `docs/dev_log.md` 切换到 `better-sqlite3`。
- `openDocument` 中 `pageCount` 采用固定值（PDF=8，图像=1）；可接入 `pdfjs-dist` 获取真实页数。
- `getPageView` 返回占位图；生产中请用 `pdfjs-dist` 或 `canvas` 渲染真实位图。
- UI 轮询 `getPageState`，可按文档改为事件推送（watch/subscribe）。

项目结构
-------

- `package.json`：脚手架脚本（`npm run dev` 同时启动 Vite 与 Electron）。
- `vite.config.ts`、`src/*`：React 渲染层。
- `electron/main.mjs`：窗口、菜单、IPC 入口。
- `electron/preload.mjs`：将 IPC 安全暴露到 `window.api`。
- `electron/service.mjs`：最小可跑的后台流水线（可替换为 SQLite + OCR + LLM）。

对照文档
-------

与 `docs/dev_log.md` 的片段一一对应，便于逐步替换为真实实现：

- IPC 合约：`openFile / ensurePageProcessed / getPageView / getPageState`。
- SQLite 表结构：可直接迁移到 `better-sqlite3` 实现。
- LLM 提示词：在接入 Ollama/OpenAI 时替换 `service.mjs` 的模拟逻辑。

