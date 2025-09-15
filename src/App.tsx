import React, { useEffect, useState } from 'react'

type DocInfo = { docId: string; pageCount: number }
type PageRight = { text?: string; translation?: string; summary?: string }

declare global {
  interface Window { api?: any }
}

export default function App(){
  const [doc, setDoc] = useState<DocInfo|null>(null)
  const [page, setPage] = useState(1)
  const [left, setLeft] = useState<string>('')
  const [right, setRight] = useState<PageRight>({})

  async function open(){
    const r = await window.api?.openFile();
    if(r) { setDoc(r); setPage(1) }
  }

  useEffect(()=>{
    if(!doc) return
    let stop = false
    ;(async()=>{
      const v = await window.api?.getPageView(doc.docId, page)
      if(!stop) setLeft(v?.canvasDataUrl || '')
      await window.api?.ensurePageProcessed(doc.docId, page)
      const timer = setInterval(async()=>{
        const s = await window.api?.getPageState(doc.docId, page)
        if(s && s.status === 'done'){
          setRight({ text: s.text_plain, translation: s.translation, summary: s.summary })
          clearInterval(timer)
        }
      }, 800)
      return ()=> clearInterval(timer)
    })()
    return ()=> { stop = true }
  }, [doc, page])

  if(!doc) return (
    <div style={{display:'grid', placeItems:'center', height:'100vh'}}>
      <button onClick={open} style={{padding:'8px 16px'}}>打开文档</button>
    </div>
  )

  return (
    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', height:'100vh'}}>
      <div style={{borderRight:'1px solid #ddd', overflow:'auto', position:'relative'}}>
        {left && <img src={left} style={{width:'100%'}}/>}
        <div style={{position:'fixed',bottom:16,left:16,background:'#fff8',backdropFilter:'blur(2px)',padding:'6px 8px',borderRadius:6}}>
          <button disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>上一页</button>
          <span style={{margin:'0 8px'}}>{page} / {doc.pageCount}</span>
          <button disabled={page>=doc.pageCount} onClick={()=>setPage(p=>Math.min(doc.pageCount,p+1))}>下一页</button>
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

