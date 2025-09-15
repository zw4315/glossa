# 目标

做一个**离线优先**的本地阅读 App（Electron），支持：

* 左右分屏：左侧=原文页（PDF/图片/EPUB），右侧=「原文 + 译文 + 摘要」。
* 翻页联动：每翻到第 N 页，自动执行 OCR→分段→调用 LLM 翻译与摘要→缓存到本地。
* markitdown 也许可以做到 pdf -> md
* 可切换引擎：OCR（Tesseract/PaddleOCR）与 LLM（Ollama/API）。
* 断点续处理、可重试、可刷新当前页。
* 需要把 右边做成 youglish 这种可以联想的， 最好带联网的功能
* 有阅读的化整为零的功能，做到手机的 app 里

---

# 架构（进程与模块）

```
┌───────────────────────────┐
│  Electron Main Process    │  负责窗口、菜单、文件打开、全局热键
└──────────────┬────────────┘
               │ IPC (contextBridge)
┌──────────────▼────────────┐
│ Renderer (React/TS)       │  UI：分屏、翻页、进度、设置
│  - pdf.js / epub.js       │
│  - SplitView, Pager       │
└──────────────┬────────────┘
               │ 任务提交/查询（IPC）
┌──────────────▼────────────┐
│ Worker/Service (Node)     │  后台流水线
│  - OCR Engine (Tesseract) │
│  - Segmenter (layout)     │
│  - LLM Client (Ollama/API)│
│  - Cache (SQLite)         │
└──────────────┬────────────┘
               │ better-sqlite3
┌──────────────▼────────────┐
│ SQLite Cache              │  documents/pages/config/indexes
└───────────────────────────┘
```

---

# 数据流（单页）

1. UI 发出 `ensurePageProcessed(docId, pageNo)`。
2. Service 查询 SQLite：若命中缓存（状态=done && hash 相同）→ 直接返回。
3. 未命中→ pdf.js 渲染该页位图 → OCR → 段落/行合并 → LLM：翻译 + 摘要 → 写入 SQLite。
4. Renderer 订阅状态，右侧面板实时刷新。

---

# 技术选型（离线优先）

* **渲染**：`pdfjs-dist`、图片直接 `<img>`；EPUB 可用 `epubjs`（后续）。
* **OCR**：

  * 轻量：`tesseract.js`（CPU，可打包语言数据；中英混排建议 `eng+chi_sim`）。
  * 更强：`PaddleOCR`（可选：Python 子进程/本地服务）。
* **LLM**：

  * 本地：`Ollama`（如 `qwen2.5`, `llama3.1`, `gemma2`），走 `http://localhost:11434`。
  * 远程：OpenAI/DeepSeek等，可在设置里切换。
* **DB**：`better-sqlite3`（同步 API、简单稳定），文件放用户数据目录。
* **任务队列**：轻量自实现（FIFO + 并发=1\~2）。
* **样式/UI**：React + Tailwind（或简 CSS）。

---

# 表结构（SQLite）

```sql
-- 文档表
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  kind TEXT CHECK(kind IN ('pdf','image','epub')),
  page_count INTEGER,
  source_hash TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

-- 单页缓存
CREATE TABLE IF NOT EXISTS pages (
  doc_id TEXT,
  page_no INTEGER,
  image_hash TEXT,        -- 渲染位图/原图的 hash，用于判断是否需重跑
  ocr_json TEXT,          -- 低级别 OCR 结果（bbox, text）
  text_plain TEXT,        -- 合并后的可读文本
  translation TEXT,
  summary TEXT,
  status TEXT CHECK(status IN ('pending','processing','done','error')),
  error_msg TEXT,
  updated_at INTEGER,
  PRIMARY KEY (doc_id, page_no)
);

CREATE INDEX IF NOT EXISTS idx_pages_status ON pages(status);
```

---

# IPC 合约（示例）

```ts
// preload.ts 暴露到 window.api
interface Api {
  openFile(): Promise<{docId: string, pageCount: number}>;
  getPageView(docId: string, pageNo: number): Promise<{canvasDataUrl: string}>; // 左侧显示
  ensurePageProcessed(docId: string, pageNo: number): Promise<void>;
  watchPage(docId: string, pageNo: number, cb: (state) => void): Unsubscribe;  // 状态/内容推送
  reprocessPage(docId: string, pageNo: number): Promise<void>;
  settings: {
    get(): Promise<Settings>;
    save(p: Partial<Settings>): Promise<void>;
  }
}
```

---

# LLM 提示词模板（翻译 + 摘要）

```text
你是专业双语译者与编辑。请：
1) 忠实逐段翻译以下文本为【中文】，尽量保留术语与结构；
2) 给出 3-5 条要点式摘要；
3) 保持段落编号，输出 JSON：
{
  "translation": [ {"para": 1, "cn": "..."}, ...],
  "summary": ["...", "..."]
}
文本：
{{text}}
```

---

# 关键交互

* `J/K` 或 `PgUp/PgDn` 翻页；`R` 仅重处理当前页；`Shift+R` 重处理全书。
* 右侧可切换视图：`原文` / `译文` / `摘要` / `对照`。
* 处理进度条与队列可视化（页号+状态）。

---

# 性能策略

* 单页串行处理，预取「当前页±1」放入队列。
* OCR 结果与 LLM 输出强缓存；同一 `image_hash` 不重跑。
* 失败退避重试（1s/3s/10s）。
* 大文档首次仅按需处理（用户翻到哪里，处理到哪里）。

---

# MVP 里程碑

1. 打开 PDF/图片 → 左侧显示 → 翻页。
2. 单页 OCR → 文本合并 → LLM 翻译&摘要 → 右侧展示。
3. SQLite 缓存、重试与重处理按钮。
4. 设置页：OCR 语言、Ollama/OPENAI 选择与参数。

---

# 脚手架代码（最小可跑示例）

> 下列片段演示核心骨架；实际项目建议用 Vite + Electron Builder。

## package.json（要点）

```json
{
  "name": "reader-local",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "concurrently \"vite\" \"electron .\"",
    "build": "vite build && electron-builder"
  },
  "devDependencies": {
    "electron": "^31",
    "vite": "^5",
    "concurrently": "^8",
    "@types/node": "^20",
    "tailwindcss": "^3"
  },
  "dependencies": {
    "pdfjs-dist": "^4",
    "tesseract.js": "^5",
    "better-sqlite3": "^11",
    "axios": "^1",
    "react": "^18",
    "react-dom": "^18"
  }
}
```

## electron/main.ts（精简）

```ts
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import { ensureDb, service } from './service.js'

let win: BrowserWindow

app.whenReady().then(async () => {
  await ensureDb()
  win = new BrowserWindow({
    width: 1400, height: 900,
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.cjs')
    }
  })
  await win.loadURL('http://localhost:5173')
})

ipcMain.handle('openFile', async () => {
  const r = await dialog.showOpenDialog(win, { filters: [
    { name: 'Docs', extensions: ['pdf','png','jpg','jpeg'] }
  ], properties: ['openFile'] })
  if (r.canceled || r.filePaths.length===0) return null
  return service.openDocument(r.filePaths[0])
})

ipcMain.handle('ensurePageProcessed', (_e, docId: string, pageNo: number) =>
  service.ensurePageProcessed(docId, pageNo))

ipcMain.handle('getPageView', (_e, docId: string, pageNo: number) =>
  service.getPageView(docId, pageNo))
```

## electron/preload.ts

```ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  openFile: () => ipcRenderer.invoke('openFile'),
  ensurePageProcessed: (d: string, p: number) => ipcRenderer.invoke('ensurePageProcessed', d, p),
  getPageView: (d: string, p: number) => ipcRenderer.invoke('getPageView', d, p),
})
```

## electron/service.ts（核心流水线示例）

```ts
import Database from 'better-sqlite3'
import { createCanvas } from 'canvas'
import * as pdfjs from 'pdfjs-dist'
import Tesseract from 'tesseract.js'
import crypto from 'node:crypto'
import axios from 'axios'

const db = new Database('cache.db')
export async function ensureDb(){
  db.exec(`CREATE TABLE IF NOT EXISTS pages(
    doc_id TEXT, page_no INTEGER, image_hash TEXT, text_plain TEXT,
    translation TEXT, summary TEXT, status TEXT, updated_at INTEGER,
    PRIMARY KEY(doc_id,page_no)
  )`)
}

export const service = {
  async openDocument(filePath: string){
    // 仅返回 docId/pageCount；细节略
    const docId = crypto.createHash('md5').update(filePath).digest('hex')
    const loadingTask = pdfjs.getDocument(filePath)
    const pdf = await loadingTask.promise
    return { docId, pageCount: pdf.numPages }
  },
  async getPageView(docId: string, pageNo: number){
    // 渲染该页到 dataURL（供左侧显示）
    // 注意：生产中建议使用 web worker & 缓存
    return { canvasDataUrl: 'data:image/png;base64,...' }
  },
  async ensurePageProcessed(docId: string, pageNo: number){
    const row = db.prepare('SELECT * FROM pages WHERE doc_id=? AND page_no=?').get(docId,pageNo)
    if (row && row.status==='done') return
    db.prepare('INSERT OR REPLACE INTO pages(doc_id,page_no,status,updated_at) VALUES (?,?,?,?)')
      .run(docId,pageNo,'processing',Date.now())
    try{
      const text = await ocrPageToText(/* render bitmap */)
      const {translation, summary} = await llmTranslateAndSummarize(text)
      db.prepare('UPDATE pages SET text_plain=?, translation=?, summary=?, status=?, updated_at=? WHERE doc_id=? AND page_no=?')
        .run(text, translation, summary, 'done', Date.now(), docId, pageNo)
    }catch(e){
      db.prepare('UPDATE pages SET status=?, updated_at=? WHERE doc_id=? AND page_no=?')
        .run('error', Date.now(), docId, pageNo)
      throw e
    }
  }
}

async function ocrPageToText(){
  const r = await Tesseract.recognize(/* image bitmap */, 'eng+chi_sim')
  return r.data.text
}

async function llmTranslateAndSummarize(text: string){
  // Ollama 示例：
  const prompt = `请把以下文本翻译成中文并做要点摘要，JSON 输出：{\"translation\":[...],\"summary\":[...]}; 文本：\n${text}`
  const r = await axios.post('http://localhost:11434/api/generate', {
    model: 'qwen2.5:7b', prompt, stream: false
  })
  const json = tryParse(r.data.response)
  return { translation: JSON.stringify(json.translation), summary: JSON.stringify(json.summary) }
}

function tryParse(s:string){ try{ return JSON.parse(s) }catch{ return {translation:[],summary:[]} } }
```

## src/App.tsx（左右分屏 + 翻页）

```tsx
import React, { useEffect, useState } from 'react'

export default function App(){
  const [doc, setDoc] = useState<{docId:string,pageCount:number}|null>(null)
  const [page, setPage] = useState(1)
  const [left, setLeft] = useState<string>('')
  const [right, setRight] = useState<{text?:string,translation?:string,summary?:string}>({})

  async function open(){ const r = await (window as any).api.openFile(); if(r) setDoc(r) }

  useEffect(()=>{ if(!doc) return; (async()=>{
    const v = await (window as any).api.getPageView(doc.docId, page)
    setLeft(v.canvasDataUrl)
    await (window as any).api.ensurePageProcessed(doc.docId, page)
    // 简化：轮询查询；生产可改为事件推送
    const t = setInterval(async()=>{
      // 这里应有 getPageState 接口返回 text/translation/summary
    }, 800)
    return ()=> clearInterval(t)
  })() }, [doc, page])

  if(!doc) return <button onClick={open}>打开文档</button>

  return (
    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', height:'100vh'}}>
      <div style={{borderRight:'1px solid #ddd', overflow:'auto'}}>
        {left && <img src={left} style={{width:'100%'}}/>}
        <div style={{position:'fixed',bottom:16,left:16}}>
          <button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>上一页</button>
          <span style={{margin:'0 8px'}}>{page} / {doc.pageCount}</span>
          <button disabled={page>=doc.pageCount} onClick={()=>setPage(p=>p+1)}>下一页</button>
        </div>
      </div>
      <div style={{padding:16, overflow:'auto'}}>
        <h3>原文</h3>
        <pre>{right.text}</pre>
        <h3>译文</h3>
        <pre>{right.translation}</pre>
        <h3>摘要</h3>
        <ul>
          {(right.summary? JSON.parse(right.summary):[]).map((s:string,i:number)=>(<li key={i}>{s}</li>))}
        </ul>
      </div>
    </div>
  )
}
```

---

# 可选增强

* 版面分析：段落/列/表格识别（如 `pdfjs` 文字层 + 简单几何聚类，或 `layout-parser`）。
* 术语表：跨页抽取术语→右栏悬浮提示。
* 对齐视图：右侧在每个段落旁展示对应译文（锚点/高亮）。
* 导出：Markdown/HTML（原文+译文+摘要）。
* 热更新 Prompt 与温度/最大 tokens 等参数。

---

# 下一步

1. 你现在的运行环境是：完全本地（Ollama）还是要走云端 API？
2. 优先支持哪两种文档格式？（建议：PDF + PNG/JPG）
3. 我可以把上面脚手架拆成完整 Vite + Electron 项目结构，直接可 `npm run dev` 启动。

太赞了，这个想法非常适合做成离线优先的 Electron 小而美工具。我先把**技术方案 + 最小脚手架**放到右侧画布里了（包含架构、SQLite 结构、IPC 合约、提示词、以及 Electron/React/队列的关键代码片段）。你可以直接参考那份文档开始搭。

想快速推进的话，给我两点偏好就行：

1. 你更想**本地跑 LLM**（Ollama）还是先用**云端 API**？
2. 起步先支持哪两种格式？我建议 **PDF + PNG/JPG**。

如果你点头，我就把画布里的脚手架再整理成一个可 `npm run dev` 启动的 Vite + Electron 项目结构，并补上：

* pdf.js 的实际渲染成像逻辑（生成 dataURL）；
* 轮询改为**事件推送**（watchPage）；
* Tesseract 语言包打包与设置页；
* Ollama / OpenAI 的切换面板与限速重试。

