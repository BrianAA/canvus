const { _electron: electron } = require('@playwright/test');
const path = require('path');
const { spawn } = require('child_process');

(async () => {
  console.log('Starting Vite dev server...');
  const devServer = spawn('npm', ['run', 'dev'], {
    cwd: path.resolve(__dirname),
    shell: true
  });

  // Wait 3 seconds for server to start
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('Launching Electron...');
  const appPath = path.resolve(__dirname, 'main.cjs');
  const electronApp = await electron.launch({
    args: [appPath]
  });

  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    console.log('Selecting pressure-test template...');
    await window.selectOption('#sel-template', 'pressure-test');

    // Wait for the workspace to load nodes
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('Inspecting styles inside Shadow DOM...');
    const result = await window.evaluate(() => {
      // Find the shadow root
      const host = document.querySelector('[data-canvus-shadow-host]');
      if (!host) return { error: 'Shadow host not found' };
      const shadow = host.shadowRoot;
      if (!shadow) return { error: 'Shadow root not found' };

      // Helper to get element details
      const getDetails = (selector) => {
        const el = shadow.querySelector(selector);
        if (!el) return { selector, found: false };
        const computed = window.getComputedStyle(el);
        return {
          selector,
          found: true,
          tagName: el.tagName,
          classes: el.className,
          display: computed.display,
          width: computed.width,
          height: computed.height,
          position: computed.position,
          backgroundColor: computed.backgroundColor,
          color: computed.color,
          fontSize: computed.fontSize,
          maskImage: computed.maskImage || computed.webkitMaskImage || 'none',
          gridTemplateColumns: computed.gridTemplateColumns,
          gridTemplateRows: computed.gridTemplateRows,
          gridColumn: computed.gridColumn,
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
          position: computed.position,
          left: computed.left,
          top: computed.top,
          width: computed.width,
          height: computed.height,
          gridColumn: computed.gridColumn,
          gridRow: computed.gridRow
        };
      };

      const cardList = shadow.querySelector('._card-list');
      const card = shadow.querySelector('._card');

      return {
        host: {
          display: window.getComputedStyle(host).display,
          width: window.getComputedStyle(host).width,
          height: window.getComputedStyle(host).height
        },
        cardList: getDetails('._card-list'),
        cardListWrapper: getWrapperDetails(cardList ? cardList.parentElement : null),
        card: getDetails('._card'),
        cardWrapper: getWrapperDetails(card ? card.parentElement : null),
        heading: getDetails('._heading'),
        thumbnailStack: getDetails('._thumbnail-stack'),
        category: getDetails('._category'),
        price: getDetails('._price'),
        description: getDetails('._description'),
        tagList: getDetails('._tag-list'),
        button: getDetails('._button'),
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
            position: computed.position,
            flex: computed.flex,
            fontSize: computed.fontSize,
            maskImage: computed.maskImage || computed.webkitMaskImage || 'none'
          };
        })(),
        cssRules: (() => {
          const rulesList = [];
          for (let i = 0; i < shadow.styleSheets.length; i++) {
            const sheet = shadow.styleSheets[i];
            try {
              for (let j = 0; j < sheet.cssRules.length; j++) {
                const rule = sheet.cssRules[j];
                rulesList.push(rule.cssText);
              }
            } catch (e) {
              rulesList.push(`Error accessing sheet ${i}: ${e.message}`);
            }
          }
          return rulesList;
        })()
      };
    });

    console.log('Style Inspection Result:', JSON.stringify(result, null, 2));

  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    console.log('Cleaning up...');
    await electronApp.close();
    devServer.kill('SIGINT');
    process.exit(0);
  }
})();
