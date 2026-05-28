const { _electron: electron } = require('@playwright/test');
const path = require('path');
const { spawn } = require('child_process');

(async () => {
  const devServer = spawn('npm', ['run', 'dev'], {
    cwd: '/Users/balfaro01/Documents/GitHub/canvus/demo-electron',
    shell: true
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  const appPath = '/Users/balfaro01/Documents/GitHub/canvus/demo-electron/main.cjs';
  const electronApp = await electron.launch({
    args: [appPath]
  });

  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await window.selectOption('#sel-template', 'pressure-test');
    await new Promise(resolve => setTimeout(resolve, 2000));

    const result = await window.evaluate(() => {
      const host = document.querySelector('[data-canvus-shadow-host]');
      if (!host) return { error: 'Shadow host not found' };
      const shadow = host.shadowRoot;
      if (!shadow) return { error: 'Shadow root not found' };

      const button = shadow.querySelector('.purchase-button');
      const compButton = window.getComputedStyle(button);
      const compBefore = window.getComputedStyle(button, '::before');

      return {
        buttonMask: compButton.maskImage || compButton.webkitMaskImage || 'none',
        beforeMask: compBefore.maskImage || compBefore.webkitMaskImage || 'none'
      };
    });

    console.log('Result:', JSON.stringify(result, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await electronApp.close();
    devServer.kill('SIGINT');
    process.exit(0);
  }
})();
