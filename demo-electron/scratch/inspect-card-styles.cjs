const { _electron: electron } = require('@playwright/test');

(async () => {
  console.log('Starting Vite dev server...');
  const { spawn } = require('child_process');
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
          backgroundColor: cardComputed.backgroundColor,
          borderRadius: cardComputed.borderRadius,
          boxShadow: cardComputed.boxShadow,
          color: cardComputed.color,
          height: cardComputed.height
        },
        cardList: {
          display: cardListComputed.display,
          gridTemplateRows: cardListComputed.gridTemplateRows,
          height: cardListComputed.height
        }
      };
    });

    console.log('CARD_STYLES_RESULT:');
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
