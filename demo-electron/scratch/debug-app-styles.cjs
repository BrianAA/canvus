const { _electron: electron } = require('@playwright/test');
const path = require('path');
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
      const cardWrapper = card.parentElement;

      // Helper to recurse rules
      const rules = [];
      const inspectRules = (cssRules, depth = 0) => {
        if (!cssRules) return;
        for (let i = 0; i < cssRules.length; i++) {
          const rule = cssRules[i];
          const info = {
            type: rule.constructor.name,
            cssText: rule.cssText,
            selectorText: rule.selectorText || null,
            depth
          };
          if (rule.selectorText) {
            info.cardMatches = card.matches(rule.selectorText);
            info.wrapperMatches = cardWrapper.matches(rule.selectorText);
          }
          rules.push(info);
          if (rule.cssRules) {
            inspectRules(rule.cssRules, depth + 1);
          }
        }
      };

      for (let i = 0; i < shadow.styleSheets.length; i++) {
        try {
          inspectRules(shadow.styleSheets[i].cssRules);
        } catch(e) {
          rules.push({ error: e.message });
        }
      }

      return {
        cardTagName: card.tagName,
        cardId: card.id,
        cardClasses: card.className,
        cardWrapperClasses: cardWrapper.className,
        cardComputedGridRow: window.getComputedStyle(card).gridRow,
        rules: rules.filter(r => r.cssText.includes('span 5') || r.cssText.includes('_card-list'))
      };
    });

    console.log('DEBUG_RESULT_START');
    console.log(JSON.stringify(result, null, 2));
    console.log('DEBUG_RESULT_END');

  } catch (err) {
    console.error(err);
  } finally {
    console.log('Closing app...');
    await electronApp.close();
    devServer.kill('SIGINT');
    process.exit(0);
  }
})();
