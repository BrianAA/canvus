import { chromium } from 'playwright';

(async () => {
  let browser;
  try {
    console.log("Launching browser...");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    console.log("Navigating to Canvus demo page...");
    await page.goto('http://localhost:3001/demo/index.html');

    // Wait a moment for assets to load
    await page.waitForTimeout(500);

    console.log("Configuring Workspace with scaleViewportUnits: true and size 1000x500...");
    await page.evaluate(() => {
      if (!window.ws) {
        throw new Error("window.ws is not defined! Check if Workspace loaded successfully.");
      }
      window.ws.updateViewportConfig({
        width: 1000,
        height: 500,
        scaleViewportUnits: true
      });
    });

    await page.waitForTimeout(100);

    console.log("Adding a root frame node...");
    await page.evaluate(() => {
      window.ws.addNode({
        id: 'viewport-frame-node',
        rawMarkup: `<div id="v-frame" style="width: 1000px; height: 500px; background: #222; position: relative;"></div>`,
        currentRect: { x: 100, y: 100, width: 1000, height: 500 }
      });
    });

    console.log("Adding a child component with nested vh/vw units inside the frame...");
    await page.evaluate(() => {
      window.ws.addNode({
        id: 'viewport-test-node',
        rawMarkup: `<div id="v-container" style="background: #333;"><div id="v-test" style="width: 50vw; height: 10vh; padding: 2.5vw; background: red;">Viewport Test</div></div>`,
        currentRect: { x: 50, y: 50, width: 500, height: 50 }
      }, 'viewport-frame-node');
    });

    // Wait for layout to settle
    await page.waitForTimeout(300);

    console.log("Verifying translated style values in the DOM...");
    const styles = await page.evaluate(() => {
      const el = window.ws.getWrapper('viewport-test-node').querySelector('#v-test');
      return {
        width: el.style.width,
        height: el.style.height,
        padding: el.style.padding
      };
    });

    console.log("DOM Inline Styles:", styles);
    if (!styles.width.includes('calc(50 * var(--canvus-vw') || 
        !styles.height.includes('calc(10 * var(--canvus-vh') || 
        !styles.padding.includes('calc(2.5 * var(--canvus-vw')) {
      console.error("FAIL: Inline styles were not translated correctly!");
      process.exit(1);
    }

    console.log("Verifying actual computed pixel sizes...");
    const computedStyles = await page.evaluate(() => {
      const el = window.ws.getWrapper('viewport-test-node').querySelector('#v-test');
      const cs = window.getComputedStyle(el);
      return {
        width: cs.width,
        height: cs.height,
        padding: cs.padding
      };
    });

    console.log("Computed Styles (Expected width: 500px, height: 50px, padding: 25px):", computedStyles);
    if (computedStyles.width !== '500px' || computedStyles.height !== '50px' || computedStyles.padding !== '25px') {
      console.error("FAIL: Computed pixel dimensions do not match viewport scaling!");
      process.exit(1);
    }

    console.log("Verifying extracted HTML reverts viewport units...");
    const extractedHTML = await page.evaluate(() => {
      return window.ws.extractHTML('viewport-frame-node');
    });

    console.log("Extracted HTML:", extractedHTML);
    if (!extractedHTML.includes('width: 50vw') || 
        !extractedHTML.includes('height: 10vh') || 
        !extractedHTML.includes('padding: 2.5vw')) {
      console.error("FAIL: Extracted HTML did not revert viewport units correctly!");
      process.exit(1);
    }

    console.log("Updating viewport size dynamically to 2000x1000...");
    await page.evaluate(() => {
      window.ws.updateViewportSize(2000, 1000);
    });

    // Wait for style update to propagate
    await page.waitForTimeout(300);

    console.log("Verifying new computed pixel sizes after updateViewportSize...");
    const computedStylesAfterResize = await page.evaluate(() => {
      const el = window.ws.getWrapper('viewport-test-node').querySelector('#v-test');
      const cs = window.getComputedStyle(el);
      return {
        width: cs.width,
        height: cs.height,
        padding: cs.padding
      };
    });

    console.log("Computed Styles after resize (Expected width: 1000px, height: 100px, padding: 50px):", computedStylesAfterResize);
    if (computedStylesAfterResize.width !== '1000px' || 
        computedStylesAfterResize.height !== '100px' || 
        computedStylesAfterResize.padding !== '50px') {
      console.error("FAIL: Computed dimensions after resize do not match updated viewport!");
      process.exit(1);
    }

    console.log("Simulating workspace visual resize of root frame node to 1200x800...");
    await page.evaluate(() => {
      // Set root node style and trigger measurement to simulate resize
      window.ws.setNodeStyles('viewport-frame-node', {
        width: '1200px',
        height: '800px'
      });
    });

    // Wait for ResizeObserver reflow loop to run
    await page.waitForTimeout(300);

    console.log("Verifying new computed pixel sizes after root node resize...");
    const computedStylesAfterRootResize = await page.evaluate(() => {
      const el = window.ws.getWrapper('viewport-test-node').querySelector('#v-test');
      const cs = window.getComputedStyle(el);
      return {
        width: cs.width,
        height: cs.height,
        padding: cs.padding
      };
    });

    console.log("Computed Styles after root node resize (Expected width: 600px, height: 80px, padding: 30px):", computedStylesAfterRootResize);
    // width: 50% of 1200 = 600px
    // height: 10% of 800 = 80px
    // padding: 2.5% of 1200 = 30px
    if (computedStylesAfterRootResize.width !== '600px' || 
        computedStylesAfterRootResize.height !== '80px' || 
        computedStylesAfterRootResize.padding !== '30px') {
      console.error("FAIL: Dynamic ResizeObserver variable scaling failed!");
      process.exit(1);
    }

    console.log("SUCCESS: Viewport translation, reversion, and scaling verified successfully!");
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error("ERROR:", err);
    if (browser) await browser.close();
    process.exit(1);
  }
})();
