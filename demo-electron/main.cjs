const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow = win;

  win.on('closed', () => {
    mainWindow = null;
  });

  // Attach debugger for communication with Chrome DevTools Protocol (CDP)
  try {
    win.webContents.debugger.attach('1.3');
  } catch (err) {
    console.error('[main.cjs] Debugger attach failed:', err);
  }

  win.webContents.on('did-finish-load', async () => {
    try {
      await win.webContents.debugger.sendCommand('DOM.enable');
      await win.webContents.debugger.sendCommand('CSS.enable');
      // Initialize the DOM agent's tracking cache
      await win.webContents.debugger.sendCommand('DOM.getDocument', { depth: -1, pierce: true });
    } catch (err) {
      console.error('[main.cjs] CDP initialization failed:', err);
    }
  });

  // In development load the local dev server.
  win.loadURL('http://localhost:5174');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handler to open HTML files from disk
ipcMain.handle('open-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'HTML Files', extensions: ['html', 'htm'] }]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const fileContent = fs.readFileSync(filePath, 'utf8');

  return {
    filePath,
    fileContent
  };
});

// IPC Handler to read any file (such as CSS link tags) from disk
ipcMain.handle('read-file', async (event, fileUrlOrPath) => {
  try {
    let filePath = fileUrlOrPath;
    if (filePath.startsWith('file://')) {
      filePath = filePath.substring(7);
      if (process.platform === 'win32' && filePath.startsWith('/')) {
        filePath = filePath.substring(1);
      }
      filePath = decodeURIComponent(filePath);
    } else {
      // Map local dev server URLs back to local workspace paths
      const match = filePath.match(/^https?:\/\/(?:localhost|127\.0\.0\.1):\d+\/(.*)$/);
      if (match) {
        filePath = path.join(__dirname, '..', decodeURIComponent(match[1]));
      }
    }
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    console.error(`[main.cjs] Error reading file ${fileUrlOrPath}:`, err);
    return null;
  }
});

const forcedStatesMap = new Map();

ipcMain.handle('force-pseudo-state', async (event, { nodeId, stateName, enabled }) => {
  if (!mainWindow) return false;
  try {
    const dbg = mainWindow.webContents.debugger;

    // 1. Retrieve the element objectId inside Shadow DOM
    const expr = `window.ws ? window.ws.getContentRoot('${nodeId}') : null`;
    const evalResult = await dbg.sendCommand('Runtime.evaluate', {
      expression: expr,
      returnByValue: false
    });

    if (!evalResult || !evalResult.result || !evalResult.result.objectId) {
      // Node might be untracked (e.g. lazy children after selection change). Silence warning.
      return false;
    }

    const objectId = evalResult.result.objectId;

    // 2. Request the CDP nodeId for this object, with self-healing retry on cache miss
    let cdpNodeId;
    try {
      const res = await dbg.sendCommand('DOM.requestNode', { objectId });
      cdpNodeId = res.nodeId;
    } catch (err) {
      try {
        // If it failed, the DOM agent cache might be stale. Refresh document and retry once.
        await dbg.sendCommand('DOM.getDocument', { depth: -1, pierce: true });
        const res = await dbg.sendCommand('DOM.requestNode', { objectId });
        cdpNodeId = res.nodeId;
      } catch (retryErr) {
        console.warn(`[main.cjs] Failed to request node for ${nodeId} after retry:`, retryErr);
        return false;
      }
    }

    // 3. Keep track of active forced states for this node
    if (!forcedStatesMap.has(nodeId)) {
      forcedStatesMap.set(nodeId, new Set());
    }
    const activeStates = forcedStatesMap.get(nodeId);
    if (enabled) {
      activeStates.add(stateName);
    } else {
      activeStates.delete(stateName);
    }

    // 4. Force the pseudo classes
    await dbg.sendCommand('CSS.forcePseudoState', {
      nodeId: cdpNodeId,
      forcedPseudoClasses: Array.from(activeStates)
    });

    return true;
  } catch (err) {
    console.error(`[main.cjs] Failed to force pseudo state ${stateName} on ${nodeId}:`, err);
    return false;
  }
});

