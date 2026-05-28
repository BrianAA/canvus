const { _electron: electron } = require('@playwright/test');
const path = require('path');
const { spawn } = require('child_process');

(async () => {
  console.log('Starting Vite dev server...');
  const devServer = spawn('npm', ['run', 'dev'], {
    cwd: path.resolve(__dirname),
    shell: true
  });

  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('Launching Electron...');
  const appPath = path.resolve(__dirname, 'main.cjs');
  const electronApp = await electron.launch({
    args: [appPath]
  });

  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    console.log('Selecting template...');
    await window.selectOption('#sel-template', 'pressure-test');
    await new Promise(resolve => setTimeout(resolve, 2000));

    const result = await window.evaluate(() => {
      const host = document.querySelector('[data-canvus-shadow-host]');
      if (!host) return { error: 'Shadow host not found' };
      const shadow = host.shadowRoot;
      if (!shadow) return { error: 'Shadow root not found' };

      const dumpRules = (rules) => {
        const list = [];
        for (let i = 0; i < rules.length; i++) {
          const rule = rules[i];
          const info = { type: rule.constructor.name };
          if (rule.selectorText !== undefined) {
            info.selectorText = rule.selectorText;
            info.cssText = rule.cssText;
            if (rule.style.maskImage || rule.style.webkitMaskImage) {
              info.hasMask = true;
              info.maskImage = rule.style.maskImage || rule.style.webkitMaskImage;
            }
          }
          if (rule.cssRules) {
            info.cssRules = dumpRules(rule.cssRules);
          }
          list.push(info);
        }
        return list;
      };

      const sheetsInfo = [];
      for (let i = 0; i < shadow.styleSheets.length; i++) {
        const sheet = shadow.styleSheets[i];
        try {
          sheetsInfo.push({
            index: i,
            href: sheet.href,
            rules: dumpRules(sheet.cssRules)
          });
        } catch (e) {
          sheetsInfo.push({ index: i, error: e.message });
        }
      }

      const button = shadow.querySelector('.purchase-button');
      const compButton = window.getComputedStyle(button);
      const compBefore = window.getComputedStyle(button, '::before');

      return {
        buttonMask: compButton.maskImage || compButton.webkitMaskImage || 'none',
        beforeMask: compBefore.maskImage || compBefore.webkitMaskImage || 'none',
        sheets: sheetsInfo
      };
    });

    console.log('CSSOM Rules Details:', JSON.stringify(result, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await electronApp.close();
    devServer.kill('SIGINT');
    process.exit(0);
  }
})();
