const { chromium } = require('@playwright/test');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Set up the page with a clean host and Shadow DOM, inject the same CSS and see what happens!
  await page.setContent(`
    <div id="host"></div>
  `);

  const result = await page.evaluate(() => {
    const host = document.getElementById('host');
    const shadow = host.attachShadow({ mode: 'open' });
    
    // Add elements first
    shadow.innerHTML = `
      <div class="_card-list">
        <div class="canvus-node-wrapper">
          <section class="_card">Card Content</section>
        </div>
      </div>
    `;

    // Injected CSS using the new rewriting logic
    const style = document.createElement('style');
    style.textContent = `
      ._card-list {
        :is(&, & > .canvus-node-wrapper) > * {
          grid-row: span 5;
        }
      }
    `;
    shadow.appendChild(style);

    const card = shadow.querySelector('._card');
    const wrapper = shadow.querySelector('.canvus-node-wrapper');
    const compCard = window.getComputedStyle(card);
    const compWrapper = window.getComputedStyle(wrapper);

    return {
      cardGridRow: compCard.gridRow || 'none',
      wrapperGridRow: compWrapper.gridRow || 'none'
    };
  });

  console.log('Result:', JSON.stringify(result, null, 2));
  await browser.close();
})();
