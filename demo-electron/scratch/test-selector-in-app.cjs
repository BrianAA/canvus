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
      const wrapper = card.parentElement;
      const cardList = shadow.querySelector('._card-list');

      return {
        cardTagName: card.tagName,
        cardId: card.id,
        wrapperTagName: wrapper.tagName,
        wrapperClasses: wrapper.className,
        cardListTagName: cardList.tagName,
        cardListId: cardList.id,
        cardListClasses: cardList.className,
        
        // Match tests
        matchesDirectWrapper: card.matches('.canvus-node-wrapper > *'),
        matchesCardListDirect: card.matches('._card-list > *'),
        matchesCardListWrapper: card.matches('._card-list > .canvus-node-wrapper > *'),
        matchesCardListDescendant: card.matches('._card-list *'),
        
        // Hierarchy query
        querySelectorCardListWrapper: shadow.querySelectorAll('._card-list > .canvus-node-wrapper > *').length,
        cardListChildrenCount: cardList.children.length,
        wrapperParentMatchesCardList: wrapper.parentElement === cardList
      };
    });

    console.log('MATCH_TEST_RESULT:');
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
