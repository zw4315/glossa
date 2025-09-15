import crypto from 'node:crypto'

// In-memory stub DB for minimal runnable example
// Key: `${docId}:${pageNo}` -> { status, text_plain, translation, summary, updated_at }
const pages = new Map()

export async function ensureDb(){
  // No-op for stub; real project would init better-sqlite3 here
}

export const service = {
  async openDocument(filePath){
    const docId = crypto.createHash('md5').update(filePath).digest('hex')
    const lower = filePath.toLowerCase()
    const isPdf = lower.endsWith('.pdf')
    const isImg = ['.png','.jpg','.jpeg'].some(ext=>lower.endsWith(ext))
    // Stub pageCount: PDF pretend 8 pages, image 1
    const pageCount = isPdf ? 8 : (isImg ? 1 : 1)
    return { docId, pageCount }
  },

  async getPageView(_docId, pageNo){
    // Return a simple SVG as data URL placeholder showing the page number
    const svg = `<?xml version="1.0"?><svg xmlns='http://www.w3.org/2000/svg' width='1200' height='1600'>
      <rect width='100%' height='100%' fill='white'/>
      <text x='50%' y='45%' dominant-baseline='middle' text-anchor='middle' font-size='96' fill='#333'>Page ${pageNo}</text>
      <text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' font-size='28' fill='#777'>Preview placeholder</text>
    </svg>`
    const dataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
    return { canvasDataUrl: dataUrl }
  },

  async ensurePageProcessed(docId, pageNo){
    const key = `${docId}:${pageNo}`
    const row = pages.get(key)
    if (row && row.status === 'done') return

    pages.set(key, { status: 'processing', updated_at: Date.now() })

    // Simulate background processing pipeline
    setTimeout(() => {
      const text = `OCR text for doc ${docId.slice(0,6)} page ${pageNo}`
      const translation = `译文示例：这是文档 ${docId.slice(0,6)} 第 ${pageNo} 页的翻译。`
      const summary = JSON.stringify([`要点：第 ${pageNo} 页`,`这是最小可跑示例`,`可替换为真实 OCR/LLM 输出`])
      pages.set(key, {
        status: 'done',
        text_plain: text,
        translation,
        summary,
        updated_at: Date.now()
      })
    }, 600)
  },

  async getPageState(docId, pageNo){
    const key = `${docId}:${pageNo}`
    const row = pages.get(key)
    return row || { status: 'pending' }
  }
}

