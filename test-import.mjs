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

    // Check if nodes are mounted
    console.log("Verifying layer list contains pre-seeded nodes...");
    const layersListText = await page.textContent('#layers-list');

    if (!layersListText.includes('hero-section') || !layersListText.includes('hero-heading') || !layersListText.includes('features-grid')) {
      console.error("FAIL: Pre-seeded nodes not found in the list!");
      process.exit(1);
    }

    // Toggle to Preview Mode and back to Edit Mode to get fresh state
    console.log("Switching to Preview Mode...");
    await page.click('#btn-preview');
    await page.waitForTimeout(300);
    console.log("Switching back to Edit Mode...");
    await page.click('#btn-preview');
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

    // Locate H1 element inside Shadow DOM
    const heading = page.locator('h1:has-text("Build stunning visual editors")');
    await getSelectionState("Initial");

    // Double-click multiple times to drill down to H1 element
    console.log("Double-clicking H1 to drill down to hero-section...");
    await heading.dblclick({ force: true });
    await page.waitForTimeout(400);
    await getSelectionState("DblClick 1");

    console.log("Double-clicking H1 to drill down to hero-heading...");
    await heading.dblclick({ force: true });
    await page.waitForTimeout(400);
    await getSelectionState("DblClick 2");

    console.log("Double-clicking H1 to enter text editing mode...");
    await heading.dblclick({ force: true });
    await page.waitForTimeout(400);
    await getSelectionState("DblClick 3");

    // Check if the contenteditable attribute is set
    const contentEditableVal = await heading.getAttribute('contenteditable');
    console.log("H1 contenteditable attribute value:", contentEditableVal);

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
