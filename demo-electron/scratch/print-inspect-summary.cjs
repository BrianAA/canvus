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

      const getDetails = (selector) => {
        const el = shadow.querySelector(selector);
        if (!el) return { selector, found: false };
        const computed = window.getComputedStyle(el);
        return {
          selector,
          found: true,
          display: computed.display,
          width: computed.width,
          height: computed.height,
          gridRow: computed.gridRow
        };
      };

      const getWrapperDetails = (idOrWrapper) => {
        let wrapper = null;
        let id = '';
        if (typeof idOrWrapper === 'string') {
          id = idOrWrapper;
          wrapper = shadow.querySelector(`.canvus-node-wrapper[data-canvus-id="${id}"]`);
        } else if (idOrWrapper) {
          wrapper = idOrWrapper;
          id = wrapper.getAttribute('data-canvus-id') || '';
        }
        if (!wrapper) return { id, found: false };
        const computed = window.getComputedStyle(wrapper);
        return {
          id,
          found: true,
          display: computed.display,
          width: computed.width,
          height: computed.height,
          gridRow: computed.gridRow
        };
      };

      const cardList = shadow.querySelector('._card-list');
      const card = shadow.querySelector('._card');

      return {
        cardList: getDetails('._card-list'),
        cardListWrapper: getWrapperDetails(cardList ? cardList.parentElement : null),
        card: getDetails('._card'),
        cardWrapper: getWrapperDetails(card ? card.parentElement : null),
        purchaseButton: getDetails('.purchase-button'),
        purchaseButtonBefore: (() => {
          const el = shadow.querySelector('.purchase-button');
          if (!el) return { found: false };
          const computed = window.getComputedStyle(el, '::before');
          return {
            found: true,
            display: computed.display,
            width: computed.width,
            height: computed.height,
            content: computed.content,
            maskImage: computed.maskImage || computed.webkitMaskImage || 'none'
          };
        })()
      };
    });

    console.log('Result:\n', JSON.stringify(result, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await electronApp.close();
    devServer.kill('SIGINT');
    process.exit(0);
  }
})();
