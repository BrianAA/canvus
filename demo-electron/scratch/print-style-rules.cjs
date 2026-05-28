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

    const rules = await window.evaluate(() => {
      const host = document.querySelector('[data-canvus-shadow-host]');
      if (!host) return { error: 'Shadow host not found' };
      const shadow = host.shadowRoot;
      if (!shadow) return { error: 'Shadow root not found' };

      const list = [];
      for (let i = 0; i < shadow.styleSheets.length; i++) {
        const sheet = shadow.styleSheets[i];
        try {
          for (let j = 0; j < sheet.cssRules.length; j++) {
            const rule = sheet.cssRules[j];
            list.push(rule.cssText);
          }
        } catch (e) {
          list.push(`Error: ${e.message}`);
        }
      }
      return list;
    });

    console.log('Shadow DOM CSS rules:\n');
    rules.forEach((r, i) => {
      console.log(`[Rule ${i}]:\n${r}\n`);
    });

  } catch (err) {
    console.error(err);
  } finally {
    await electronApp.close();
    devServer.kill('SIGINT');
    process.exit(0);
  }
})();
