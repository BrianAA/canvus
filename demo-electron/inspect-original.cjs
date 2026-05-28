const { chromium } = require('@playwright/test');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const filePath = 'file://' + path.resolve(__dirname, '../demo/pressure-test.html');
  console.log('Loading original file:', filePath);
  
  await page.goto(filePath);
  await page.waitForLoadState('domcontentloaded');
  
  const result = await page.evaluate(() => {
    const getDetails = (selector) => {
      const el = document.querySelector(selector);
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
        maskImage: computed.maskImage || computed.webkitMaskImage || 'none'
      };
    };

    const getBeforeDetails = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return { selector, found: false };
      const computed = window.getComputedStyle(el, '::before');
      return {
        selector: selector + '::before',
        found: true,
        display: computed.display,
        width: computed.width,
        height: computed.height,
        position: computed.position,
        flex: computed.flex,
        maskImage: computed.maskImage || computed.webkitMaskImage || 'none'
      };
    };

    return {
      cardList: getDetails('._card-list'),
      card: getDetails('._card'),
      heading: getDetails('._heading'),
      thumbnailStack: getDetails('._thumbnail-stack'),
      price: getDetails('._price'),
      description: getDetails('._description'),
      tagList: getDetails('._tag-list'),
      button: getDetails('._button'),
      purchaseButton: getDetails('.purchase-button'),
      purchaseButtonBefore: getBeforeDetails('.purchase-button')
    };
  });

  console.log('Original Page Style Result:', JSON.stringify(result, null, 2));
  await browser.close();
})();
