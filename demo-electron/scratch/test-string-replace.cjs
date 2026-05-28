const { _electron: electron } = require('@playwright/test');
const { spawn } = require('child_process');

(async () => {
  console.log('Starting Vite dev server...');
  const devServer = spawn('npm', ['run', 'dev'], {
    cwd: '/Users/balfaro01/Documents/GitHub/canvus/demo-electron',
    shell: true
  });

  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('Launching Electron...');
  const appPath = '/Users/balfaro01/Documents/GitHub/canvus/demo-electron/main.cjs';
  const electronApp = await electron.launch({
    args: [appPath]
  });

  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // We will override workspace.injectCSS in the window to perform the string replacement first!
    await window.evaluate(() => {
      const originalInject = window.ws.injectCSS.bind(window.ws);
      window.ws.injectCSS = (css) => {
        // Apply the regex replacement to rewrite & > selectors on the string level
        const rewritten = css.replace(/&\s*>\s*([^{,]+)/g, (match, p1) => {
          return `& > ${p1.trim()}, & > .canvus-node-wrapper > ${p1.trim()}`;
        });
        return originalInject(rewritten);
      };
    });

    console.log('Selecting template...');
    await window.selectOption('#sel-template', 'pressure-test');

    console.log('Waiting for elements...');
    for (let i = 0; i < 20; i++) {
      const loaded = await window.evaluate(() => {
        const host = document.querySelector('[data-canvus-shadow-host]');
        if (!host || !host.shadowRoot) return false;
        return host.shadowRoot.querySelector('.purchase-button') !== null;
      });
      if (loaded) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const result = await window.evaluate(() => {
      const host = document.querySelector('[data-canvus-shadow-host]');
      const shadow = host.shadowRoot;
      const card = shadow.querySelector('._card');
      const cardComputed = window.getComputedStyle(card);
      const cardList = shadow.querySelector('._card-list');
      const cardListComputed = window.getComputedStyle(cardList);

      return {
        card: {
          display: cardComputed.display,
          gridTemplateRows: cardComputed.gridTemplateRows,
          gridRow: cardComputed.gridRow,
          height: cardComputed.height
        },
        cardList: {
          display: cardListComputed.display,
          gridTemplateRows: cardListComputed.gridTemplateRows,
          height: cardListComputed.height
        }
      };
    });

    console.log('STRING_REPLACE_RESULT:');
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
