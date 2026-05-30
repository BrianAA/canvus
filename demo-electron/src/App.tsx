import { useEffect, useRef, useState } from 'react';
import { Workspace, type CanvusTool } from '../../dist/index.js';
import { importHTMLDocument, ImportResultLog } from './importer.ts';
import './index.css';

// Declare type for Electron IPC bridge
declare global {
  interface Window {
    electronAPI?: {
      openFile: () => Promise<{ filePath: string; fileContent: string } | null>;
      readFile: (filePath: string) => Promise<string | null>;
      forcePseudoState: (nodeId: string, stateName: 'hover' | 'active' | 'focus', enabled: boolean) => Promise<boolean>;
    };
  }
}

interface ViewportState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

interface CommitLogEntry {
  id: string;
  timestamp: string;
  html: string;
}

interface SimplifiedNode {
  id: string;
  parentId: string | null;
  depth: number;
  rectString: string;
}

export default function App() {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [ws, setWs] = useState<Workspace | null>(null);
  const [activeTool, setActiveTool] = useState<CanvusTool>(null);
  const [drawingTag, setDrawingTag] = useState<string>('div');

  // Readouts state
  const [viewport, setViewport] = useState<ViewportState>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [interactionMode, setInteractionMode] = useState<string | null>('idle');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [nodes, setNodes] = useState<SimplifiedNode[]>([]);
  const [commitLogs, setCommitLogs] = useState<CommitLogEntry[]>([]);
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const [undoStack, setUndoStack] = useState<any[][]>([]);
  const [importLog, setImportLog] = useState<ImportResultLog | null>(null);

  // Style input state
  const [display, setDisplay] = useState('');
  const [direction, setDirection] = useState('');
  const [gridColumns, setGridColumns] = useState('');
  const [gridRows, setGridRows] = useState('');
  const [gap, setGap] = useState('');
  const [bg, setBg] = useState('');
  const [forceHover, setForceHover] = useState(false);
  const [forceActive, setForceActive] = useState(false);
  const [forceFocus, setForceFocus] = useState(false);

  // Create Toast Helper
  const addToast = (msg: string) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, msg }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 2500);
  };

  // Sync workspace and callbacks
  useEffect(() => {
    if (!workspaceRef.current) return;

    let localUndoStack: any[][] = [];

    const workspaceInstance = new Workspace(workspaceRef.current, {
      onHTMLCommit(id, html) {
        setCommitLogs(prev => [
          {
            id,
            timestamp: new Date().toLocaleTimeString(),
            html
          },
          ...prev
        ]);
        addToast(`Committed "${id}" → ${html.length} chars`);
      },

      onViewportChange(vp) {
        setViewport({
          scale: vp.scale,
          offsetX: vp.offsetX,
          offsetY: vp.offsetY
        });
      },

      onNodeRectChange() {
        triggerNodeRefresh(workspaceInstance);
      },

      onSelectionChange(ids) {
        const arr = Array.from(ids);
        setSelectedIds(arr);

        // Sync local styling panel inputs when exactly one node is selected
        if (arr.length === 1) {
          const selectedId = arr[0]!;
          const wrapper = workspaceInstance.getWrapper(selectedId);
          const contentRoot = workspaceInstance.getContentRoot(selectedId);
          if (wrapper && contentRoot) {
            setDisplay(contentRoot.style.display || '');
            setDirection(contentRoot.style.flexDirection || '');
            setGridColumns(contentRoot.style.gridTemplateColumns || '');
            setGridRows(contentRoot.style.gridTemplateRows || '');
            setGap(contentRoot.style.gap || '');
            setBg(contentRoot.style.background || '');

            setForceHover(wrapper.classList.contains('canvus-state-hover'));
            setForceActive(wrapper.classList.contains('canvus-state-active'));
            setForceFocus(wrapper.classList.contains('canvus-state-focus'));
          }
        }
        triggerNodeRefresh(workspaceInstance);
      },

      onInteractionChange(mode) {
        setInteractionMode(mode);
        setActiveTool(workspaceInstance.getActiveTool());
      },

      onOperationsGenerated(ops) {
        console.log('⚡ Operations Generated:', ops);
        localUndoStack.push(ops);
        setUndoStack([...localUndoStack]);
      },

      onForcePseudoState(nodeId, state, enabled) {
        if (window.electronAPI && window.electronAPI.forcePseudoState) {
          window.electronAPI.forcePseudoState(nodeId, state, enabled).catch(err => {
            console.error('[App.tsx] Failed to force pseudo state via Electron CDP:', err);
          });
        }
      }
    });

    (window as any).ws = workspaceInstance;

    // Injected outline styles for visual class swapping test
    workspaceInstance.injectCSS(`
      .demo-highlight {
        outline: 3px dashed #f43f5e !important;
        outline-offset: -3px;
      }
    `);

    // Seed initial visual elements
    workspaceInstance.addNode({
      id: 'welcome-card',
      rawMarkup: `<div style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);border-radius:16px;padding:32px;color:#fff;box-shadow:0 12px 40px rgba(79,70,229,0.3);font-family:sans-serif"><h2 style="margin:0 0 10px;font-size:22px;font-weight:700">Canvus React + Electron Demo</h2><p style="margin:0;font-size:14px;opacity:0.9;line-height:1.6">Decoupled template imports, scoped JS execution, styles control, and E2E automation sandbox.</p></div>`,
      currentRect: { x: 80, y: 80, width: 340, height: 0 }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.composedPath()[0] as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (e.key === 'r' || e.key === 'R') {
        workspaceInstance.setActiveTool('box');
        setActiveTool(workspaceInstance.getActiveTool());
        addToast('Box tool active (▢)');
      } else if (e.key === 't' || e.key === 'T') {
        workspaceInstance.setActiveTool('text');
        setActiveTool(workspaceInstance.getActiveTool());
        addToast('Text tool active (T)');
      } else if (e.key === 'v' || e.key === 'V') {
        workspaceInstance.setActiveTool(null);
        setActiveTool(workspaceInstance.getActiveTool());
        addToast('Move tool active');
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    setWs(workspaceInstance);
    triggerNodeRefresh(workspaceInstance);

    return () => {
      workspaceInstance.dispose();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const triggerNodeRefresh = (workspaceInstance: Workspace) => {
    if (!workspaceInstance) return;
    const resolved = workspaceInstance.getNodes().map(n => {
      const r = n.currentRect;
      return {
        id: n.id,
        parentId: n.parentId,
        depth: n.depth,
        rectString: r ? `x:${r.x.toFixed(0)} y:${r.y.toFixed(0)} w:${r.width.toFixed(0)} h:${r.height.toFixed(0)}` : 'unmeasured'
      };
    });
    setNodes(resolved);
  };

  const loadHTMLContent = async (html: string, filePath?: string) => {
    if (!ws) return;
    try {
      const log = await importHTMLDocument(ws, html, {
        clearWorkspace: true,
        baseUrl: filePath
      });
      setImportLog(log);
      triggerNodeRefresh(ws);
      if (filePath) {
        addToast(`Imported ${pathBasename(filePath)} successfully!`);
      } else {
        addToast('Content loaded successfully!');
      }
    } catch (err: any) {
      addToast(`Import Error: ${err.message}`);
    }
  };

  const handleImportFile = async () => {
    if (!ws) return;
    if (!window.electronAPI) {
      addToast('Electron API not detected. Mocking import with sample markup...');
      // Sample mock markup for standard browser fallback testing
      const mockHTML = `
        <div id="flex-row" style="display:flex;gap:12px;background:#1e1e2f;padding:16px;border-radius:12px;">
          <div id="btn-mock" style="background:#6366f1;color:#fff;padding:8px 16px;border-radius:6px;">Mock Button</div>
        </div>
        <script>
          const btn = document.querySelector('#btn-mock');
          btn.addEventListener('click', () => alert('Clicked mock button!'));
        </script>
      `;
      await loadHTMLContent(mockHTML);
      return;
    }

    try {
      const res = await window.electronAPI.openFile();
      if (!res) {
        addToast('File selection canceled');
        return;
      }
      await loadHTMLContent(res.fileContent, res.filePath);
    } catch (err: any) {
      addToast(`Import Error: ${err.message}`);
    }
  };

  const handleLoadTemplate = async (templateName: string) => {
    if (!ws) return;
    setImportLog(null);
    if (templateName === 'welcome') {
      ws.deselectAll();
      const roots = ws.getNodeTree().getRoots();
      for (const root of roots) {
        ws.removeNode(root.id);
      }
      ws.addNode({
        id: 'welcome-card',
        rawMarkup: `<div style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);border-radius:16px;padding:32px;color:#fff;box-shadow:0 12px 40px rgba(79,70,229,0.3);font-family:sans-serif"><h2 style="margin:0 0 10px;font-size:22px;font-weight:700">Canvus React + Electron Demo</h2><p style="margin:0;font-size:14px;opacity:0.9;line-height:1.6">Decoupled template imports, scoped JS execution, styles control, and E2E automation sandbox.</p></div>`,
        currentRect: { x: 80, y: 80, width: 340, height: 0 }
      });
      triggerNodeRefresh(ws);
      addToast('Welcome Card loaded');
      return;
    }

    if (templateName === 'blank') {
      ws.deselectAll();
      const roots = ws.getNodeTree().getRoots();
      for (const root of roots) {
        ws.removeNode(root.id);
      }
      triggerNodeRefresh(ws);
      addToast('Workspace cleared');
      return;
    }

    let url = '';
    let label = '';
    if (templateName === 'test-page') {
      url = '../demo/test-page.html';
      label = 'Standard Test Page';
    } else if (templateName === 'pressure-test') {
      url = '../demo/pressure-test.html';
      label = 'CSS Layer Pressure Test';
    }

    try {
      let html = '';
      if (window.electronAPI) {
        const content = await window.electronAPI.readFile(url);
        if (content) {
          html = content;
        }
      }

      if (!html) {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        html = await response.text();
      }

      const resolvedBaseUrl = `${window.location.origin}/${templateName === 'test-page' ? 'demo/test-page.html' : 'demo/pressure-test.html'}`;
      await loadHTMLContent(html, resolvedBaseUrl);
      addToast(`Loaded ${label}`);
    } catch (err: any) {
      addToast(`Failed to load template: ${err.message}`);
    }
  };

  const pathBasename = (filePath: string) => {
    return filePath.split(/[\\/]/).pop() || filePath;
  };

  const selectTool = (tool: CanvusTool) => {
    if (!ws) return;
    ws.setActiveTool(tool);
    setActiveTool(tool);
    if (tool === 'box') {
      addToast('Box tool active (▢)');
    } else if (tool === 'text') {
      addToast('Text tool active (T)');
    } else if (tool === null) {
      addToast('Move tool active');
    }
  };

  const selectTag = (tag: string) => {
    if (!ws) return;
    ws.setDrawingTag(tag);
    setDrawingTag(tag);
    addToast(`Drawing tag set to <${tag}>`);
  };

  const handleUndo = () => {
    if (!ws || undoStack.length === 0) return;
    const stack = [...undoStack];
    const ops = stack.pop()!;
    // Apply operations in reverse sequence with reverse payloads
    for (let i = ops.length - 1; i >= 0; i--) {
      const op = ops[i];
      ws.applyOperation({
        type: op.type,
        nodeId: op.nodeId,
        payload: op.undoPayload,
        undoPayload: op.payload
      });
    }
    setUndoStack(stack);
    triggerNodeRefresh(ws);
    addToast(`Undid ${ops.length} operation(s)`);
  };

  // Node style change emitter
  const updateStyle = (property: string, value: string) => {
    if (!ws || selectedIds.length !== 1) return;
    const id = selectedIds[0]!;
    ws.setNodeStyle(id, property, value || null);
    triggerNodeRefresh(ws);
  };

  const toggleClass = () => {
    if (!ws || selectedIds.length !== 1) return;
    const id = selectedIds[0]!;
    ws.toggleClass(id, 'demo-highlight');
    triggerNodeRefresh(ws);
  };

  const toggleForcedState = (stateName: 'hover' | 'active' | 'focus', val: boolean) => {
    if (!ws || selectedIds.length !== 1) return;
    const id = selectedIds[0]!;
    ws.forceNodeState(id, stateName, val);
    if (stateName === 'hover') setForceHover(val);
    if (stateName === 'active') setForceActive(val);
    if (stateName === 'focus') setForceFocus(val);

    triggerNodeRefresh(ws);
  };

  const simulateEvent = (eventType: string) => {
    if (!ws || selectedIds.length !== 1) return;
    const id = selectedIds[0]!;
    ws.dispatchInteractionEvent(id, eventType);
    addToast(`Simulated '${eventType}' on ${id}`);
  };

  return (
    <div className="app-container">
      {/* Viewport Surface and Shadow DOM Workspace */}
      <div className="workspace-wrapper">
        <div className="grid-overlay" style={{
          backgroundSize: `${24 * viewport.scale}px ${24 * viewport.scale}px`,
          backgroundPosition: `${viewport.offsetX}px ${viewport.offsetY}px`,
          opacity: Math.min(0.2, viewport.scale * 0.15)
        }}></div>
        <div ref={workspaceRef} style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}></div>

        {/* Figma Floating Toolbar */}
        <div className="figma-toolbar">
          {/* Move Tool (V) */}
          <button
            id="btn-tool-select"
            className={`toolbar-btn ${activeTool === null ? 'active' : ''}`}
            onClick={() => selectTool(null)}
            title="Move Tool (V)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="3 3 3 16 8 13 13 21 16 19 11 12 17 12 3 3" />
            </svg>
          </button>

          {/* Box Tool (R) */}
          <button
            id="btn-tool-box"
            className={`toolbar-btn ${activeTool === 'box' ? 'active' : ''}`}
            onClick={() => selectTool('box')}
            title="Box Tool (R)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
            </svg>
          </button>

          {/* Text Tool (T) */}
          <button
            id="btn-tool-text"
            className={`toolbar-btn ${activeTool === 'text' ? 'active' : ''}`}
            onClick={() => selectTool('text')}
            title="Text Tool (T)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 7 4 4 20 4 20 7" />
              <line x1="9" y1="20" x2="15" y2="20" />
              <line x1="12" y1="4" x2="12" y2="20" />
            </svg>
          </button>

          <div className="toolbar-divider"></div>

          {/* Drawing Tag Selector */}
          <div className="toolbar-select-container">
            <select
              id="sel-toolbar-tag"
              className="toolbar-select"
              value={drawingTag}
              onChange={(e) => selectTag(e.target.value)}
              title="Drawing Tag"
            >
              <option value="div">div</option>
              <option value="section">section</option>
              <option value="header">header</option>
              <option value="footer">footer</option>
              <option value="p">p (paragraph)</option>
              <option value="h1">h1</option>
              <option value="h2">h2</option>
              <option value="h3">h3</option>
              <option value="span">span</option>
            </select>
          </div>

          <div className="toolbar-divider"></div>

          {/* Undo Action */}
          <button
            id="btn-toolbar-undo"
            className="toolbar-btn"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            title="Undo (Cmd+Z / Ctrl+Z)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7v6h6" />
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
            </svg>
          </button>

          {/* Reset Viewport */}
          <button
            id="btn-toolbar-reset"
            className="toolbar-btn"
            onClick={() => { ws?.resetViewport(); addToast('Viewport reset to 1:1'); }}
            title="Reset Viewport"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Control Sidebar Panel */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="header-title-container">
            <div className="dot"></div>
            <h2>Canvus Host Shell</h2>
          </div>
          <button id="btn-import" className="btn primary" style={{ padding: '6px 12px', fontSize: '11px' }} onClick={handleImportFile}>
            📁 Import
          </button>
        </div>

        <div className="sidebar-scroll">
          {/* Quick-Load Templates */}
          <div className="section">
            <div className="section-title">Load Templates</div>
            <div className="metric-row">
              <span className="metric-label">Choose Page</span>
              <select
                id="sel-template"
                className="select-input"
                style={{ width: '180px' }}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    handleLoadTemplate(e.target.value);
                  }
                }}
              >
                <option value="" disabled>-- Select Template --</option>
                <option value="welcome">Welcome Card (Default)</option>
                <option value="test-page">Standard Test Page</option>
                <option value="pressure-test">CSS Layer Pressure Test</option>
                <option value="blank">Blank Workspace</option>
              </select>
            </div>
          </div>

          {/* Viewport Readout */}
          <div className="section">
            <div className="section-title">Viewport</div>
            <div className="metric-row"><span className="metric-label">zoom</span><span className="metric-value" id="vp-scale">{viewport.scale.toFixed(3)}</span></div>
            <div className="metric-row"><span className="metric-label">pan offsetX</span><span className="metric-value">{viewport.offsetX.toFixed(1)}</span></div>
            <div className="metric-row"><span className="metric-label">pan offsetY</span><span className="metric-value">{viewport.offsetY.toFixed(1)}</span></div>
          </div>

          {/* Interaction Readout */}
          <div className="section">
            <div className="section-title">Interaction</div>
            <div className="metric-row"><span className="metric-label">mode</span><span className="metric-value warn" id="int-mode">{interactionMode ?? 'idle'}</span></div>
            <div className="metric-row"><span className="metric-label">selection</span><span className="metric-value" id="int-selected">{selectedIds.length > 0 ? selectedIds.join(', ') : '—'}</span></div>
          </div>

          {/* Style Controls Sidebar Panel */}
          {selectedIds.length === 1 && (
            <div className="section" id="sidebar-style-panel">
              <div className="section-title">Styles Panel</div>
              <div className="metric-row">
                <span className="metric-label">Display</span>
                <select id="sel-display" className="select-input" value={display} onChange={e => { setDisplay(e.target.value); updateStyle('display', e.target.value); }}>
                  <option value="">default</option>
                  <option value="block">block</option>
                  <option value="flex">flex</option>
                  <option value="grid">grid</option>
                </select>
              </div>

              {(display === 'flex' || display === 'inline-flex') && (
                <div className="metric-row">
                  <span className="metric-label">Direction</span>
                  <select id="sel-direction" className="select-input" value={direction} onChange={e => { setDirection(e.target.value); updateStyle('flex-direction', e.target.value); }}>
                    <option value="">default</option>
                    <option value="row">row</option>
                    <option value="column">column</option>
                  </select>
                </div>
              )}

              {(display === 'grid' || display === 'inline-grid') && (
                <>
                  <div className="metric-row">
                    <span className="metric-label">Columns</span>
                    <input id="input-cols" type="text" className="text-input" value={gridColumns} placeholder="e.g. 1fr 1fr" onChange={e => { setGridColumns(e.target.value); updateStyle('grid-template-columns', e.target.value); }} />
                  </div>
                  <div className="metric-row">
                    <span className="metric-label">Rows</span>
                    <input id="input-rows" type="text" className="text-input" value={gridRows} placeholder="e.g. auto" onChange={e => { setGridRows(e.target.value); updateStyle('grid-template-rows', e.target.value); }} />
                  </div>
                </>
              )}

              <div className="metric-row">
                <span className="metric-label">Gap</span>
                <input id="input-gap" type="text" className="text-input" value={gap} placeholder="e.g. 12px" onChange={e => { setGap(e.target.value); updateStyle('gap', e.target.value); }} />
              </div>

              <div className="metric-row">
                <span className="metric-label">Background</span>
                <input id="input-bg" type="text" className="text-input" value={bg} placeholder="color or gradient" onChange={e => { setBg(e.target.value); updateStyle('background', e.target.value); }} />
              </div>

              <div className="metric-row" style={{ marginTop: '12px' }}>
                <span className="metric-label">Outline Class</span>
                <button id="btn-toggle-class" className="btn primary" style={{ padding: '4px 10px', fontSize: '11px' }} onClick={toggleClass}>Toggle</button>
              </div>

              {/* CSS Forced State Selectors (Issue #10) */}
              <div style={{ marginTop: '14px', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
                <span className="metric-label" style={{ fontWeight: 700, display: 'block', marginBottom: '8px' }}>Force CSS States</span>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <label id="lbl-hover" className="checkbox-group">
                    <input id="chk-hover" type="checkbox" checked={forceHover} onChange={e => toggleForcedState('hover', e.target.checked)} /> Hover
                  </label>
                  <label id="lbl-active" className="checkbox-group">
                    <input id="chk-active" type="checkbox" checked={forceActive} onChange={e => toggleForcedState('active', e.target.checked)} /> Active
                  </label>
                  <label id="lbl-focus" className="checkbox-group">
                    <input id="chk-focus" type="checkbox" checked={forceFocus} onChange={e => toggleForcedState('focus', e.target.checked)} /> Focus
                  </label>
                </div>
              </div>

              {/* Event Simulators */}
              <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
                <span className="metric-label" style={{ fontWeight: 700, display: 'block', marginBottom: '8px' }}>Simulate Events</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button id="btn-sim-hover" className="btn" style={{ flex: 1, padding: '4px', fontSize: '11px' }} onClick={() => simulateEvent('mouseenter')}>Hover</button>
                  <button id="btn-sim-click" className="btn" style={{ flex: 1, padding: '4px', fontSize: '11px' }} onClick={() => simulateEvent('click')}>Click</button>
                </div>
              </div>
            </div>
          )}

          {/* Node Tree View */}
          <div className="section">
            <div className="section-title">Document Node Tree</div>
            <div className="node-list-container" id="node-list">
              {nodes.map(node => (
                <div
                  key={node.id}
                  className={`node-card ${selectedIds.includes(node.id) ? 'selected' : ''}`}
                  onClick={() => ws?.selectNode(node.id)}
                >
                  <div className="node-card-header">
                    <span className="node-id" style={{ paddingLeft: `${node.depth * 12}px` }}>
                      {node.parentId ? '↳ ' : ''}{node.id}
                    </span>
                    <span className={`node-badge ${node.parentId ? 'child' : 'root'}`}>
                      {node.parentId ? 'child' : 'root'}
                    </span>
                  </div>
                  <div className="node-rect">{node.rectString}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Import Debugger / Resource Log */}
          {importLog && (
            <div className="section" id="import-debugger">
              <div className="section-title">Import Resource Log</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
                {importLog.filePath && (
                  <div className="metric-row" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px', marginBottom: '2px' }}>
                    <span className="metric-label">Source Path</span>
                    <span className="metric-value" style={{ wordBreak: 'break-all', textAlign: 'right', maxWidth: '200px', fontSize: '10px' }} id="import-log-filepath">
                      {pathBasename(importLog.filePath)}
                    </span>
                  </div>
                )}
                
                <div className="metric-row">
                  <span className="metric-label">Style Blocks</span>
                  <span className="metric-value" id="import-log-styles">{importLog.styleTagsCount}</span>
                </div>

                <div style={{ marginTop: '4px' }}>
                  <span className="metric-label" style={{ fontWeight: 600, display: 'block', marginBottom: '4px' }}>External Stylesheets:</span>
                  {importLog.externalStylesheets.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', paddingLeft: '8px' }}>None</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '8px', maxHeight: '80px', overflowY: 'auto' }} id="import-log-links">
                      {importLog.externalStylesheets.map((sheet: any, idx: number) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: 'var(--text-secondary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '160px' }} title={sheet.url}>
                            {pathBasename(sheet.url)}
                          </span>
                          <span className={`node-badge ${sheet.status === 'preprocessed' ? 'child' : 'root'}`} style={{ fontSize: '8px' }}>
                            {sheet.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ marginTop: '6px', borderTop: '1px solid var(--border-subtle)', paddingTop: '6px' }}>
                  <span className="metric-label" style={{ fontWeight: 600, display: 'block', marginBottom: '4px' }}>Executed Scripts:</span>
                  {importLog.scriptsExecuted.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', paddingLeft: '8px' }}>None</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '8px', maxHeight: '80px', overflowY: 'auto' }} id="import-log-scripts">
                      {importLog.scriptsExecuted.map((script: any, idx: number) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>
                            {script.src ? `Src: ${pathBasename(script.src)}` : `Inline (${script.codeLength} chars)`}
                          </span>
                          <span className="node-badge child" style={{ fontSize: '8px', background: 'rgba(245, 158, 11, 0.15)', color: 'var(--warning)' }}>
                            {script.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Commit Log readout */}
          <div className="section">
            <div className="section-title">Commit Log (Flat String Bridge)</div>
            <div className="commit-log" id="commit-log">
              {commitLogs.length === 0 ? (
                <span style={{ color: 'var(--text-muted)' }}>Visual gesture changes yield exported HTML here.</span>
              ) : (
                commitLogs.map((entry, index) => (
                  <div key={index} className="commit-entry">
                    <div className="commit-header">
                      <span className="commit-id">#{commitLogs.length - index} {entry.id}</span>
                      <span className="commit-time">{entry.timestamp}</span>
                    </div>
                    <div className="commit-html">{entry.html}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Global actions */}
        <div className="sidebar-actions">
          <button id="btn-undo" className="btn" disabled={undoStack.length === 0} onClick={handleUndo}>
            ↶ Undo
          </button>
          <button id="btn-reset" className="btn" onClick={() => { ws?.resetViewport(); addToast('Viewport reset to 1:1'); }}>
            ↺ Reset Viewport
          </button>
        </div>
      </div>

      {/* Floating Toast Notification Container */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className="toast-item">{t.msg}</div>
        ))}
      </div>
    </div>
  );
}
