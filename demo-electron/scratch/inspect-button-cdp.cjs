const { _electron: electron } = require('@playwright/test');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

(async () => {
  console.log('Starting Vite dev server...');
  const devServer = spawn('npm', ['run', 'dev'], {
    cwd: '/Users/balfaro01/Documents/GitHub/canvus/demo-electron',
    shell: true
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('Launching Electron...');
  const appPath = '/Users/balfaro01/Documents/GitHub/canvus/demo-electron/main.cjs';
  const electronApp = await electron.launch({
    args: [appPath]
  });

  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    console.log('Selecting template...');
    await window.selectOption('#sel-template', 'pressure-test');

    console.log('Waiting for elements...');
    let loaded = false;
    for (let i = 0; i < 20; i++) {
      loaded = await window.evaluate(() => {
        const host = document.querySelector('[data-canvus-shadow-host]');
        if (!host || !host.shadowRoot) return false;
        return host.shadowRoot.querySelector('.purchase-button') !== null;
      });
      if (loaded) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (!loaded) {
      console.error('Elements not loaded');
      return;
    }

    const client = await window.context().newCDPSession(window);
    await client.send('DOM.enable');
    await client.send('CSS.enable');

    const { root } = await client.send('DOM.getDocument');
    const { nodeId: hostNodeId } = await client.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: '[data-canvus-shadow-host]'
    });

    const { node } = await client.send('DOM.describeNode', { nodeId: hostNodeId });
    const shadowRootNode = node.shadowRoots[0];
    
    const { nodeId: btnNodeId } = await client.send('DOM.querySelector', {
      nodeId: shadowRootNode.nodeId,
      selector: '.purchase-button'
    });

    console.log('Retrieving matched styles for button node...');
    const matchedStyles = await client.send('CSS.getMatchedStylesForNode', {
      nodeId: btnNodeId
    });

    const outputPath = '/Users/balfaro01/.gemini/antigravity-ide/brain/fa6fbd3b-56b7-45f2-ba3f-2dbdd1a45bfb/scratch/button-matched-styles.json';
    fs.writeFileSync(outputPath, JSON.stringify(matchedStyles, null, 2), 'utf-8');
    console.log('Saved button CDP matched styles to:', outputPath);

  } catch (err) {
    console.error(err);
  } finally {
    console.log('Closing app...');
    await electronApp.close();
    devServer.kill('SIGINT');
    process.exit(0);
  }
})();
