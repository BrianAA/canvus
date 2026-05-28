const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('open-file'),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  forcePseudoState: (nodeId, stateName, enabled) => ipcRenderer.invoke('force-pseudo-state', { nodeId, stateName, enabled })
});
