import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureDb, service } from './service.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/** @type {BrowserWindow | null} */
let win = null

async function createWindow(){
  await ensureDb()
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  await win.loadURL('http://localhost:5173')

  win.on('closed', ()=>{ win = null })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

ipcMain.handle('openFile', async () => {
  if(!win) return null
  const r = await dialog.showOpenDialog(win, {
    filters: [{ name: 'Docs', extensions: ['pdf','png','jpg','jpeg'] }],
    properties: ['openFile']
  })
  if (r.canceled || r.filePaths.length===0) return null
  return service.openDocument(r.filePaths[0])
})

ipcMain.handle('ensurePageProcessed', (_e, docId, pageNo) =>
  service.ensurePageProcessed(docId, pageNo))

ipcMain.handle('getPageView', (_e, docId, pageNo) =>
  service.getPageView(docId, pageNo))

ipcMain.handle('getPageState', (_e, docId, pageNo) =>
  service.getPageState(docId, pageNo))
