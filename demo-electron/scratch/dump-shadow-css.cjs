const { _electron: electron } = require('@playwright/test');
const path = require('path');
const { spawn } = require('child_process');

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

    const cssList = await window.evaluate(() => {
      const host = document.querySelector('[data-canvus-shadow-host]');
      const shadow = host.shadowRoot;
      const styles = shadow.querySelectorAll('style');
      return Array.from(styles).map(s => s.textContent);
    });

    console.log('Shadow DOM Stylesheets:\n');
    cssList.forEach((css, idx) => {
      console.log(`--- Style Tag ${idx} ---`);
      console.log(css);
      console.log('------------------------\n');
    });

  } catch (err) {
    console.error(err);
  } finally {
    console.log('Closing app...');
    await electronApp.close();
    devServer.kill('SIGINT');
    process.exit(0);
  }
})();
