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
});
