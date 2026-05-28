const { _electron: electron } = require('@playwright/test');
const path = require('path');
const { spawn } = require('child_process');

(async () => {
  console.log('Starting Vite dev server...');
  const devServer = spawn('npm', ['run', 'dev'], {
    cwd: path.resolve(__dirname, '..'),
    shell: true
  });

  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('Launching Electron...');
  const appPath = path.resolve(__dirname, '../main.cjs');
  const electronApp = await electron.launch({
    args: [appPath]
  });

  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    console.log('Selecting pressure-test template...');
    await window.selectOption('#sel-template', 'pressure-test');
    await new Promise(resolve => setTimeout(resolve, 2000));

    const result = await window.evaluate(async () => {
      const ws = window.ws;
      if (!ws) return 'No workspace instance found on window.ws';

      // Let's select the root element first
      ws.selectNode('imported-node-1');
      
      // The child is registered. Let's find its ID.
      const rootChildren = ws.getNodeTree().getChildren('imported-node-1');
      const gridId = rootChildren[0]?.id;
      if (gridId) {
        ws.selectNode(gridId);
      }

      // Now the grid's children (cards) should be registered.
      const gridChildren = gridId ? ws.getNodeTree().getChildren(gridId) : [];
      const cardId = gridChildren[0]?.id;
      if (cardId) {
        ws.selectNode(cardId);
      }

      // Now the card's children (heading, tags, button, etc.) should be registered.
      const cardChildren = cardId ? ws.getNodeTree().getChildren(cardId) : [];
      const buttonNode = cardChildren.find(c => {
        const wrapper = ws.getWrapper(c.id);
        const el = wrapper?.firstElementChild || wrapper;
        return el?.classList.contains('purchase-button');
      });

      const host = document.querySelector('[data-canvus-shadow-host]');
      if (!host || !host.shadowRoot) return 'Shadow host/root not found';
      
      const grid = host.shadowRoot.querySelector('._card-list');
      const card = host.shadowRoot.querySelector('._card');
      const button = host.shadowRoot.querySelector('.purchase-button');

      const info = {
        grid: {
          tag: grid ? grid.tagName : 'null',
          computedDisplay: grid ? window.getComputedStyle(grid).display : 'null',
          detectedLayoutMode: gridId ? ws.getNodeTree().get(gridId)?.layoutMode : 'null'
        },
        card: {
          tag: card ? card.tagName : 'null',
          computedDisplay: card ? window.getComputedStyle(card).display : 'null',
          detectedLayoutMode: cardId ? ws.getNodeTree().get(cardId)?.layoutMode : 'null'
        },
        button: {
          tag: button ? button.tagName : 'null',
          computedDisplay: button ? window.getComputedStyle(button).display : 'null',
          detectedLayoutMode: buttonNode ? ws.getNodeTree().get(buttonNode.id)?.layoutMode : 'null'
        }
      };

      // Let's also list all nodes in the tree and their layoutModes
      const allNodes = ws.getNodes().map(n => ({
        id: n.id,
        parentId: n.parentId,
        layoutMode: n.layoutMode
      }));

      return { info, allNodes };
    });

    console.log('DISPLAY CHECK RESULTS:');
    console.log(JSON.stringify(result, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    console.log('Closing app...');
    await electronApp.close();
    devServer.kill('SIGINT');
    process.exit(0);
  }
})();
