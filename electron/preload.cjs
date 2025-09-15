const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  openFile: () => ipcRenderer.invoke('openFile'),
  ensurePageProcessed: (d, p) => ipcRenderer.invoke('ensurePageProcessed', d, p),
  getPageView: (d, p) => ipcRenderer.invoke('getPageView', d, p),
  getPageState: (d, p) => ipcRenderer.invoke('getPageState', d, p),
})
