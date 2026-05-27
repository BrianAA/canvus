import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

(async () => {
  let browser;
  try {
    console.log("Launching browser...");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Log console messages from the page
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    console.log("Navigating to Canvus demo page...");
    await page.goto('http://localhost:3000/demo/index.html');

    // Read the test-page.html file
    const testPagePath = path.resolve('demo/test-page.html');
    const testPageHTML = fs.readFileSync(testPagePath, 'utf8');

    console.log("Setting HTML content in textarea...");
    await page.fill('#import-html-text', testPageHTML);

    console.log("Clicking Import...");
    await page.click('#btn-import-html');

    // Wait a bit for layout reflow and rendering
    await page.waitForTimeout(1000);

    // Check if nodes are mounted
    console.log("Verifying node list contains imported nodes...");
    const nodeListText = await page.textContent('#node-list');

    if (!nodeListText.includes('main-container') || !nodeListText.includes('card-1') || !nodeListText.includes('banner')) {
      console.error("FAIL: Imported nodes not found in the list!");
      process.exit(1);
    }

    // Toggle to Preview Mode and back to Edit Mode to get fresh state
    console.log("Switching to Preview Mode...");
    await page.click('#btn-preview-mode');
    await page.waitForTimeout(300);
    console.log("Switching back to Edit Mode...");
    await page.click('#btn-preview-mode');
    await page.waitForTimeout(300);

    const getSelectionState = async (stepName) => {
      const state = await page.evaluate(() => {
        return {
          selected: Array.from(window.ws.selectedIds),
          entered: window.ws.enteredContainerId,
          editAllowed: window.ws.editAllowedOnDblClick
        };
      });
      console.log(`State after ${stepName}:`, JSON.stringify(state));
    };

    // Locate H3 element inside Shadow DOM
    const heading = page.locator('h3:has-text("Feature Analysis")');
    await getSelectionState("Initial");

    // Double-click multiple times to drill down to H3 element
    console.log("Double-clicking H3 to drill down from main-container to layout-grid...");
    await heading.dblclick({ force: true });
    await page.waitForTimeout(400);
    await getSelectionState("DblClick 1");

    console.log("Double-clicking H3 to drill down from layout-grid to card-1...");
    await heading.dblclick({ force: true });
    await page.waitForTimeout(400);
    await getSelectionState("DblClick 2");

    console.log("Double-clicking H3 to drill down from card-1 to H3 wrapper node...");
    await heading.dblclick({ force: true });
    await page.waitForTimeout(400);
    await getSelectionState("DblClick 3");

    console.log("Double-clicking H3 to enter text editing mode on H3 wrapper node...");
    await heading.dblclick({ force: true });
    await page.waitForTimeout(400);
    await getSelectionState("DblClick 4");

    // Check if the contenteditable attribute is set
    const contentEditableVal = await heading.getAttribute('contenteditable');
    console.log("H3 contenteditable attribute value:", contentEditableVal);

    if (contentEditableVal !== 'plaintext-only') {
      console.error("FAIL: contenteditable attribute is not set to 'plaintext-only'!");
      process.exit(1);
    }

    console.log("SUCCESS: Nested text editing is fully functional!");
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error("ERROR running verification script:", err);
    if (browser) await browser.close();
    process.exit(1);
  }
})();
