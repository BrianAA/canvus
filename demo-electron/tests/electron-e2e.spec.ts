import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Electron E2E Integration Suite', () => {
  test('launches electron, mounts shadow DOM workspace, and renders initial card', async () => {
    // Launch Electron application
    const appPath = path.resolve(__dirname, '../main.cjs');
    const electronApp = await electron.launch({
      args: [appPath]
    });

    try {
      // Retrieve the first BrowserWindow instance
      const window = await electronApp.firstWindow();
      await window.waitForLoadState('domcontentloaded');

      // Verify the window title matches
      expect(await window.title()).toBe('Canvus — Electron Demo');

      // Verify that the workspace wrapper exists
      const workspaceWrapper = window.locator('.workspace-wrapper');
      await expect(workspaceWrapper).toBeVisible();

      // Check if the Canvus Workspace instance is registered on window object
      const isWsMounted = await window.evaluate(() => !!(window as any).ws);
      expect(isWsMounted).toBe(true);

      // Verify the seed welcome-card is mounted
      const welcomeCard = window.locator('div[data-canvus-id="welcome-card"]');
      await expect(welcomeCard).toBeVisible({ timeout: 5000 });

      // Click on the welcome card card in the node list to select it
      const welcomeNodeCard = window.locator('#node-list .node-card', { hasText: 'welcome-card' });
      await expect(welcomeNodeCard).toBeVisible();
      await welcomeNodeCard.click();

      // Verify that selecting the card opens the Styles Panel in the React sidebar
      const stylesPanel = window.locator('#sidebar-style-panel');
      await expect(stylesPanel).toBeVisible();

      // Verify display dropdown select is functional
      const displaySelect = window.locator('#sel-display');
      await expect(displaySelect).toHaveValue(''); // default display
      await displaySelect.selectOption('flex');
      await expect(displaySelect).toHaveValue('flex');

      // Verify direction select becomes visible for flex layout
      const directionSelect = window.locator('#sel-direction');
      await expect(directionSelect).toBeVisible();
      await directionSelect.selectOption('column');
      await expect(directionSelect).toHaveValue('column');

      // Verify CSS forced-states checkboxes can be clicked
      const hoverCheckbox = window.locator('#chk-hover');
      await expect(hoverCheckbox).not.toBeChecked();
      await hoverCheckbox.click();
      await expect(hoverCheckbox).toBeChecked();

      // Verify simulated events can be clicked
      const simClickButton = window.locator('#btn-sim-click');
      await expect(simClickButton).toBeVisible();
      await simClickButton.click();

      // Verify that clicking Reset Viewport shows a toast notification
      const resetViewportButton = window.locator('#btn-reset');
      await resetViewportButton.click();
      const toast = window.locator('.toast-item').last();
      await expect(toast).toContainText('Viewport reset to 1:1');

    } finally {
      // Terminate Electron process
      await electronApp.close();
    }
  });

  test('loads Standard Test Page template, verifies native CSS forced states via CDP, and guest script execution', async () => {
    const appPath = path.resolve(__dirname, '../main.cjs');
    const electronApp = await electron.launch({
      args: [appPath]
    });

    try {
      const window = await electronApp.firstWindow();
      await window.waitForLoadState('domcontentloaded');

      // Locate template select dropdown
      const templateSelect = window.locator('#sel-template');
      await expect(templateSelect).toBeVisible();

      // Select 'Standard Test Page'
      await templateSelect.selectOption('test-page');

      // Verify that the test-page is imported by checking the node list
      const mainContainerNode = window.locator('#node-list .node-card', { hasText: 'main-container' });
      await expect(mainContainerNode).toBeVisible({ timeout: 10000 });

      // Verify that the Import Resource Log panel is visible
      const importDebugger = window.locator('#import-debugger');
      await expect(importDebugger).toBeVisible();

      // Verify style tags count and external sheets log are visible
      const styleTagsCount = window.locator('#import-log-styles');
      await expect(styleTagsCount).toHaveText('1');

      // Select main-container to register its immediate children (page-header, layout-grid, banner)
      await mainContainerNode.click();

      // Select layout-grid to register its children (card-1, card-2)
      const layoutGridNode = window.locator('#node-list .node-card', { hasText: 'layout-grid' });
      await expect(layoutGridNode).toBeVisible();
      await layoutGridNode.click();

      // Click on card-1 in the node tree to select it
      const card1Node = window.locator('#node-list .node-card', { hasText: 'card-1' });
      await expect(card1Node).toBeVisible();
      await card1Node.click();

      // Verify Styles Panel opens
      const stylesPanel = window.locator('#sidebar-style-panel');
      await expect(stylesPanel).toBeVisible();

      // Verify that the card element inside Shadow DOM is visible
      const cardElement = window.locator('#card-1');
      await expect(cardElement).toBeVisible();

      // Check hover forced state
      const hoverCheckbox = window.locator('#chk-hover');
      await expect(hoverCheckbox).not.toBeChecked();
      await hoverCheckbox.click();
      await expect(hoverCheckbox).toBeChecked();

      // Check if .canvus-state-hover class is applied to the card-1 element
      const trackedElement = window.locator('[data-canvus-id="card-1"]');
      await expect(trackedElement).toHaveClass(/canvus-state-hover/);

      // Verify guest script node has JS mark and visual badge
      const isMarkedJS = await window.evaluate(() => (window as any).ws.hasJSMark('banner'));
      expect(isMarkedJS).toBe(true);

      // Select the banner node
      const bannerNode = window.locator('#node-list .node-card', { hasText: 'banner' });
      await expect(bannerNode).toBeVisible();
      await bannerNode.click();

      // Click the simulated click button in sidebar to simulate event on banner node
      const simClickButton = window.locator('#btn-sim-click');
      await expect(simClickButton).toBeVisible();
      await simClickButton.click();

      // Verify toast notification is displayed for synthetic event dispatch
      const toast = window.locator('.toast-item').last();
      await expect(toast).toContainText("Simulated 'click' on banner");

    } finally {
      await electronApp.close();
    }
  });
});

