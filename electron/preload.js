const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('versions', {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron,
})

contextBridge.exposeInMainWorld('api', {
  send: (channel, data) => ipcRenderer.send(channel, data),
  on: (channel, callback) => ipcRenderer.on(channel, (_, ...args) => callback(...args)),
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),

  promptTemplates: {
    list: () => ipcRenderer.invoke('promptTemplates:list'),
    read: (name) => ipcRenderer.invoke('promptTemplates:read', name),
    write: (payload) => ipcRenderer.invoke('promptTemplates:write', payload),
    delete: (name) => ipcRenderer.invoke('promptTemplates:delete', name),
  },
})
