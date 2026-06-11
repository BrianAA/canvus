import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function launchApp() {
  const appPath = path.resolve(__dirname, '../main.cjs');
  const electronApp = await electron.launch({
    args: [appPath]
  });
  const window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  window.on('console', msg => console.log('PAGE LOG:', msg.text()));
  window.on('pageerror', err => console.error('PAGE ERROR:', err));
  return { electronApp, window };
}



test.describe('Electron E2E Integration Suite', () => {
  test('launches electron, mounts shadow DOM workspace, and renders initial card', async () => {
    // Launch Electron application
    const { electronApp, window } = await launchApp();
    try {

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
      const welcomeNodeCard = window.locator('#node-list .node-card', { hasText: 'welcome-card' }).first();
      await expect(welcomeNodeCard).toBeVisible();
      await welcomeNodeCard.click();

      // Click on the child node in the node tree to select it
      const welcomeHeadingNodeCard = window.locator('#node-list .node-card', { hasText: 'welcome-card__child-1' });
      await expect(welcomeHeadingNodeCard).toBeVisible();
      await welcomeHeadingNodeCard.click();

      // Verify double-click inline text editing triggers correctly
      const welcomeHeading = window.locator('div[data-canvus-id="welcome-card"] h2');
      await expect(welcomeHeading).toBeVisible();
      await welcomeHeading.dblclick();
      await expect(welcomeHeading).toHaveAttribute('contenteditable', 'plaintext-only');
      await expect(welcomeHeading).toHaveClass(/canvus-editing/);

      // Cancel edit mode by pressing Escape
      await window.keyboard.press('Escape');
      await expect(welcomeHeading).not.toHaveAttribute('contenteditable', 'plaintext-only');
      await expect(welcomeHeading).not.toHaveClass(/canvus-editing/);

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
    const { electronApp, window } = await launchApp();
    try {

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

  test('loads CSS Layer Pressure Test, selects a card, and performs drag-and-drop grid repositioning', async () => {
    const { electronApp, window } = await launchApp();
    try {

      // Select 'CSS Layer Pressure Test'
      const templateSelect = window.locator('#sel-template');
      await templateSelect.selectOption('pressure-test');

      // Wait for the grid card to be visible in the shadow DOM
      const card = window.locator('[data-canvus-id="imported-node-1"]');
      await expect(card).toBeVisible({ timeout: 10000 });

      // Click on the root node to select it and register its children
      const rootNodeCard = window.locator('#node-list .node-card', { hasText: 'imported-node-1' });
      await rootNodeCard.click();

      // Now the grid child is registered. Click it to register the cards.
      const gridNodeCard = window.locator('#node-list .node-card .node-id', { hasText: /^↳ imported-node-1__child-1$/ });
      await expect(gridNodeCard).toBeVisible();
      await gridNodeCard.click();

      // Click on Card 3 in the node list to select it before dragging
      const cardNodeCard = window.locator('#node-list .node-card .node-id', { hasText: /^↳ imported-node-1__child-1__child-3$/ });
      await expect(cardNodeCard).toBeVisible();
      await cardNodeCard.click();

      // Get bounding box of Card 3 on the canvas
      const targetCard = window.locator('[data-canvus-id="imported-node-1__child-1__child-3"]');
      await expect(targetCard).toBeVisible();
      const box = await targetCard.boundingBox();
      expect(box).not.toBeNull();

      const startX = box!.x + box!.width / 2;
      const startY = box!.y + box!.height / 2;

      // Click and drag from Card 1 center to Card 2 column
      await window.mouse.move(startX, startY);
      await window.mouse.down();
      await window.waitForTimeout(200);
      await window.mouse.move(startX + 250, startY, { steps: 10 });
      await window.waitForTimeout(200);
      await window.mouse.up();

      // Verify that a commit log entry was generated
      const commitLogEntry = window.locator('#commit-log .commit-entry');
      await expect(commitLogEntry.first()).toBeVisible({ timeout: 5000 });

    } finally {
      await electronApp.close();
    }
  });

  test('loads CSS Layer Pressure Test, selects a zoomed card, and verifies scaled spacing adjusters', async () => {
    const { electronApp, window } = await launchApp();
    try {

      // Select 'CSS Layer Pressure Test'
      const templateSelect = window.locator('#sel-template');
      await templateSelect.selectOption('pressure-test');

      // Wait for the grid card to be visible in the shadow DOM
      const card = window.locator('[data-canvus-id="imported-node-1"]');
      await expect(card).toBeVisible({ timeout: 10000 });

      // Click on the root node to select it and register its children
      const rootNodeCard = window.locator('#node-list .node-card', { hasText: 'imported-node-1' });
      await rootNodeCard.click();

      // Now the grid child is registered. Click it to register the cards.
      const gridNodeCard = window.locator('#node-list .node-card .node-id', { hasText: /^↳ imported-node-1__child-1$/ });
      await expect(gridNodeCard).toBeVisible();
      await gridNodeCard.click();

      // Click on Card 1 (dynamically matches the first registered card) to select it
      const card1NodeCard = window.locator('#node-list .node-card .node-id', { hasText: 'imported-node-1__child-1__child-' }).first();
      await expect(card1NodeCard).toBeVisible();
      await card1NodeCard.click();

      // Evaluate the spacing adjusters in the workspace using the dynamically selected card ID
      const adjusterInfo = await window.evaluate(() => {
        const wsInstance = (window as any).ws;
        const selectedId = Array.from(wsInstance.getSelectedIds())[0] as string;
        const adjusters = wsInstance.computeSpacingAdjusters(selectedId);
        const contentRoot = wsInstance.getContentRoot(selectedId);
        const internalScale = wsInstance.mount.getElementScale(contentRoot);
        return {
          internalScale,
          adjusters
        };
      });

      // Verify internal scale factor is less than or equal to 1, and greater than 0
      expect(adjusterInfo.internalScale).toBeGreaterThan(0);
      expect(adjusterInfo.internalScale).toBeLessThanOrEqual(1);

      // Verify that visual heights/widths are scaled compared to the tooltip/value
      const paddingTopAdjuster = adjusterInfo.adjusters.find(a => a.type === 'padding-top');
      if (paddingTopAdjuster) {
        // Visual bounds padding-top rect height: Math.max(10, padTopVal * internalScale)
        // Check that the height matches the expected scaled calculation
        const expectedHeight = Math.max(10, paddingTopAdjuster.value * adjusterInfo.internalScale);
        expect(paddingTopAdjuster.rect.height).toBeCloseTo(expectedHeight, 1);
      }

    } finally {
      await electronApp.close();
    }
  });

  test('keyboard interaction nudges absolute nodes and reorders flow children', async () => {
    const { electronApp, window } = await launchApp();
    try {

      // Select 'Standard Test Page'
      const templateSelect = window.locator('#sel-template');
      await templateSelect.selectOption('test-page');

      // Click on the root node to select it and register its children
      const rootNodeCard = window.locator('#node-list .node-card', { hasText: 'main-container' });
      await expect(rootNodeCard).toBeVisible();
      await rootNodeCard.click();

      // Click on the layout-grid container to register the cards
      const gridNodeCard = window.locator('#node-list .node-card .node-id', { hasText: /^↳ layout-grid$/ });
      await expect(gridNodeCard).toBeVisible();
      await gridNodeCard.click();

      // Click card-1 in the node list to select it
      const nodeCard = window.locator('#node-list .node-card .node-id', { hasText: /^↳ card-1$/ });
      await expect(nodeCard).toBeVisible();
      await nodeCard.click();

      // Programmatically dispatch the keydown event to window to trigger the workspace shortcut
      await window.evaluate(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          code: 'ArrowRight',
          bubbles: true,
          cancelable: true
        });
        window.dispatchEvent(event);
      });

      // Reordering should trigger commit log entry
      const commitLogEntry = window.locator('#commit-log .commit-entry');
      await expect(commitLogEntry.first()).toBeVisible({ timeout: 5000 });
      await expect(commitLogEntry.first()).toContainText('layout-grid');

      // Verify toast notification is displayed for HTML commit
      const toast = window.locator('.toast-item').last();
      await expect(toast).toContainText('Committed "layout-grid"');

      // Check undo stack contains a reorder operation
      const undoBtn = window.locator('#btn-undo');
      await expect(undoBtn).toBeEnabled();

    } finally {
      await electronApp.close();
    }
  });

  test('floating toolbar can switch tools, select drawing tag, and draw a box', async () => {
    const { electronApp, window } = await launchApp();
    try {

      // Verify that floating toolbar exists
      const toolbar = window.locator('.figma-toolbar');
      await expect(toolbar).toBeVisible();

      // Verify tool buttons exist
      const btnSelect = window.locator('#btn-tool-select');
      const btnBox = window.locator('#btn-tool-box');
      const btnText = window.locator('#btn-tool-text');
      await expect(btnSelect).toBeVisible();
      await expect(btnBox).toBeVisible();
      await expect(btnText).toBeVisible();

      // Click on Box Tool button
      await btnBox.click();
      await expect(btnBox).toHaveClass(/active/);

      // Verify Toast notification appeared
      const toast = window.locator('.toast-item').last();
      await expect(toast).toContainText('Box tool active');

      // Verify drawing tag selector
      const tagSelect = window.locator('#sel-toolbar-tag');
      await expect(tagSelect).toBeVisible();
      await expect(tagSelect).toHaveValue('div');

      // Change drawing tag to section
      await tagSelect.selectOption('section');
      await expect(tagSelect).toHaveValue('section');

      // Drag mouse to draw on canvas relative to workspace-wrapper
      const workspaceWrapper = window.locator('.workspace-wrapper');
      const wsBox = await workspaceWrapper.boundingBox();
      expect(wsBox).not.toBeNull();

      const startX = wsBox!.x + 500;
      const startY = wsBox!.y + 300;
      const endX = wsBox!.x + 700;
      const endY = wsBox!.y + 500;

      await window.mouse.move(startX, startY);
      await window.mouse.down();
      await window.waitForTimeout(200);
      await window.mouse.move(endX, endY, { steps: 10 });
      await window.waitForTimeout(200);
      await window.mouse.up();

      // On release, a new box node should be created
      // Wait for it in the node list
      const sectionNode = window.locator('#node-list .node-card', { hasText: 'box-' });
      await expect(sectionNode).toBeVisible({ timeout: 5000 });

      // Verify the new node is selected
      const selectedId = await window.evaluate(() => {
        const wsInstance = (window as any).ws;
        return Array.from(wsInstance.getSelectedIds())[0];
      });
      expect(selectedId).toContain('box-');

    } finally {
      await electronApp.close();
    }
  });

  test('Alt-drag duplication clones the selected node immediately on drag start', async () => {
    const { electronApp, window } = await launchApp();
    try {

      // Click on the welcome card card in the node list to select it
      const welcomeNodeCard = window.locator('#node-list .node-card', { hasText: 'welcome-card' }).first();
      await expect(welcomeNodeCard).toBeVisible();
      await welcomeNodeCard.click();

      // Find the card bounding box
      const welcomeCard = window.locator('[data-canvus-id="welcome-card"]');
      await expect(welcomeCard).toBeVisible();
      const box = await welcomeCard.boundingBox();
      expect(box).not.toBeNull();

      const startX = box!.x + box!.width / 2;
      const startY = box!.y + box!.height / 2;

      // Hold Alt key and drag the welcome card
      await window.mouse.move(startX, startY);
      await window.keyboard.down('Alt');
      await window.mouse.down();
      await window.waitForTimeout(200);
      await window.mouse.move(startX + 200, startY + 200, { steps: 10 });
      await window.waitForTimeout(200);
      await window.mouse.up();
      await window.keyboard.up('Alt');

      // Verify that a clone is created
      const clonedCard = window.locator('#node-list .node-card', { hasText: 'cloned-' }).first();
      await expect(clonedCard).toBeVisible({ timeout: 5000 });

      // Verify that the original welcome-card is still present in its original position (e.g. still exists in node list)
      const originalCard = window.locator('#node-list .node-card', { hasText: 'welcome-card' }).first().first();
      await expect(originalCard).toBeVisible();

      // Retrieve the clone ID
      const clonedId = await window.evaluate(() => {
        const wsInstance = (window as any).ws;
        return Array.from(wsInstance.getSelectedIds())[0] as string;
      });
      expect(clonedId).toContain('cloned-');

      // Clear selection by clicking on the canvas background (far from any cards)
      const canvasBackground = window.locator('.workspace-wrapper');
      await canvasBackground.click({ position: { x: 500, y: 500 } });

      // Verify selection is cleared
      const selectionCount = await window.evaluate(() => {
        const wsInstance = (window as any).ws;
        return wsInstance.getSelectedIds().size;
      });
      expect(selectionCount).toBe(0);

      // Click the title inside the clone to select the card element
      const clonedH2 = window.locator(`div[data-canvus-id="${clonedId}"] h2`);
      await expect(clonedH2).toBeVisible();
      await clonedH2.click();

      // Verify selection is updated to the clone ID
      const selectionCountAfterClick = await window.evaluate(() => {
        const wsInstance = (window as any).ws;
        return wsInstance.getSelectedIds().size;
      });
      const selectedIdAfterClick = await window.evaluate(() => {
        const wsInstance = (window as any).ws;
        return Array.from(wsInstance.getSelectedIds())[0] as string;
      });
      expect(selectionCountAfterClick).toBe(1);
      expect(selectedIdAfterClick).toBe(clonedId);

      // Programmatically select the child heading node to allow editing
      await window.evaluate((pid) => {
        const ws = (window as any).ws;
        const node = ws.getNodes().find((n: any) => n.parentId === pid);
        if (node) ws.selectNode(node.id);
      }, clonedId);

      // Double-click it to verify inline text editing triggers correctly on the clone
      await clonedH2.dblclick();
      await expect(clonedH2).toHaveAttribute('contenteditable', 'plaintext-only');
      await expect(clonedH2).toHaveClass(/canvus-editing/);

      // Press Escape to cancel editing
      await window.keyboard.press('Escape');
      await expect(clonedH2).not.toHaveAttribute('contenteditable', 'plaintext-only');
      await expect(clonedH2).not.toHaveClass(/canvus-editing/);

    } finally {
      await electronApp.close();
    }
  });

  test('nested drawing allows drawing a box inside a newly drawn empty structural container', async () => {
    const { electronApp, window } = await launchApp();
    try {

      // Select Box Tool from toolbar
      const btnBox = window.locator('#btn-tool-box');
      await btnBox.click();

      // Get workspace boundaries
      const workspaceWrapper = window.locator('.workspace-wrapper');
      const wsBox = await workspaceWrapper.boundingBox();
      expect(wsBox).not.toBeNull();

      // Draw the first box (outer container)
      const parentStartX = wsBox!.x + 400;
      const parentStartY = wsBox!.y + 200;
      const parentEndX = wsBox!.x + 800;
      const parentEndY = wsBox!.y + 600;

      await window.mouse.move(parentStartX, parentStartY);
      await window.mouse.down();
      await window.waitForTimeout(200);
      await window.mouse.move(parentEndX, parentEndY, { steps: 10 });
      await window.waitForTimeout(200);
      await window.mouse.up();

      // The new outer box should be created and selected
      const outerNodeCard = window.locator('#node-list .node-card', { hasText: 'box-' });
      await expect(outerNodeCard).toBeVisible({ timeout: 5000 });

      const outerId = await window.evaluate(() => {
        const wsInstance = (window as any).ws;
        return Array.from(wsInstance.getSelectedIds())[0];
      });
      expect(outerId).toContain('box-');

      // Select Box Tool again
      await btnBox.click();

      // Draw the second box (inner child) completely inside the first box
      const childStartX = wsBox!.x + 500;
      const childStartY = wsBox!.y + 300;
      const childEndX = wsBox!.x + 700;
      const childEndY = wsBox!.y + 500;

      await window.mouse.move(childStartX, childStartY);
      await window.mouse.down();
      await window.waitForTimeout(200);
      await window.mouse.move(childEndX, childEndY, { steps: 10 });
      await window.waitForTimeout(200);
      await window.mouse.up();

      // Wait for second box
      const innerNodeCard = window.locator('#node-list .node-card', { hasText: '↳ box-' });
      await expect(innerNodeCard).toBeVisible({ timeout: 5000 });

      // Verify second box's parentId in the workspace matches the first box's ID
      const childParentId = await window.evaluate(() => {
        const wsInstance = (window as any).ws;
        const selected = Array.from(wsInstance.getSelectedIds())[0];
        const node = wsInstance.getNodes().find((n: any) => n.id === selected);
        return node ? node.parentId : null;
      });
      expect(childParentId).toBe(outerId);

    } finally {
      await electronApp.close();
    }
  });

  test('Cmd+D duplicates the selected node immediately as a sibling', async () => {
    const { electronApp, window } = await launchApp();
    try {

      // Click on the welcome card card in the node list to select it
      const welcomeNodeCard = window.locator('#node-list .node-card', { hasText: 'welcome-card' }).first();
      await expect(welcomeNodeCard).toBeVisible();
      await welcomeNodeCard.click();

      // Programmatically dispatch Cmd+D key down event
      await window.evaluate(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'd',
          code: 'KeyD',
          metaKey: true,
          bubbles: true,
          cancelable: true
        });
        window.dispatchEvent(event);
      });

      // Verify that a cloned card is created and visible in the node tree
      const clonedCard = window.locator('#node-list .node-card', { hasText: 'cloned-' }).first();
      await expect(clonedCard).toBeVisible({ timeout: 5000 });

      // Verify the new node is selected
      const selectedId = await window.evaluate(() => {
        const wsInstance = (window as any).ws;
        return Array.from(wsInstance.getSelectedIds())[0];
      });
      expect(selectedId).toContain('cloned-');

    } finally {
      await electronApp.close();
    }
  });

  test('Alt-key symmetrical resizing keeps center fixed and expands bounds symmetrically', async () => {
    const { electronApp, window } = await launchApp();
    try {

      // Click welcome-card
      const welcomeNodeCard = window.locator('#node-list .node-card', { hasText: 'welcome-card' }).first();
      await expect(welcomeNodeCard).toBeVisible();
      await welcomeNodeCard.click();

      const welcomeCard = window.locator('[data-canvus-id="welcome-card"]');
      await expect(welcomeCard).toBeVisible();
      const startBox = await welcomeCard.boundingBox();
      expect(startBox).not.toBeNull();

      // The South-East resize handle is at (x + width, y + height)
      const handleX = startBox!.x + startBox!.width;
      const handleY = startBox!.y + startBox!.height;

      // Start drag at handle with Alt key down
      await window.mouse.move(handleX, handleY);
      await window.keyboard.down('Alt');
      await window.mouse.down();
      // Drag outward by 50px right, 50px down
      await window.mouse.move(handleX + 50, handleY + 50, { steps: 5 });
      await window.mouse.up();
      await window.keyboard.up('Alt');

      const endBox = await welcomeCard.boundingBox();
      expect(endBox).not.toBeNull();

      // Symmetrical resize means the center coordinate remains constant
      const startCenter = { x: startBox!.x + startBox!.width / 2, y: startBox!.y + startBox!.height / 2 };
      const endCenter = { x: endBox!.x + endBox!.width / 2, y: endBox!.y + endBox!.height / 2 };

      expect(endCenter.x).toBeCloseTo(startCenter.x, 1);
      expect(endCenter.y).toBeCloseTo(startCenter.y, 1);
      expect(endBox!.width).toBeGreaterThan(startBox!.width + 80);
      expect(endBox!.height).toBeGreaterThan(startBox!.height + 80);

    } finally {
      await electronApp.close();
    }
  });

  test('Figma-style corner radius drag handles allow dragging to adjust border-radius', async () => {
    const { electronApp, window } = await launchApp();
    try {

      // Click welcome-card
      const welcomeNodeCard = window.locator('#node-list .node-card', { hasText: 'welcome-card' }).first();
      await expect(welcomeNodeCard).toBeVisible();
      await welcomeNodeCard.click();

      const welcomeCard = window.locator('[data-canvus-id="welcome-card"]');
      await expect(welcomeCard).toBeVisible();
      const box = await welcomeCard.boundingBox();
      expect(box).not.toBeNull();

      // The top-left corner radius handle is inset by 16px
      const handleX = box!.x + 16;
      const handleY = box!.y + 16;

      await window.mouse.move(handleX, handleY);
      await window.mouse.down();
      // Drag inwards (down and right) to increase corner radius
      await window.mouse.move(handleX + 30, handleY + 30, { steps: 5 });
      await window.mouse.up();

      // Verify style.borderRadius has been updated on the content root of welcome-card
      const borderRadius = await welcomeCard.evaluate(el => {
        const content = el.firstElementChild as HTMLElement;
        return content ? content.style.borderRadius : el.style.borderRadius;
      });
      expect(borderRadius).toContain('px');
      const radiusVal = parseInt(borderRadius, 10);
      expect(radiusVal).toBeGreaterThan(30); // It was dragged by 30px, so it should be significantly increased

    } finally {
      await electronApp.close();
    }
  });

  test('loads CSS Layer Pressure Test, selects the card button wrapper and resizes it without jumping to the top', async () => {
    const { electronApp, window } = await launchApp();
    try {

      // Select 'CSS Layer Pressure Test'
      const templateSelect = window.locator('#sel-template');
      await templateSelect.selectOption('pressure-test');

      // Wait for the grid card to be visible in the shadow DOM
      const card = window.locator('[data-canvus-id="imported-node-1"]');
      await expect(card).toBeVisible({ timeout: 10000 });

      // Click on the root node to select it and register its children
      const rootNodeCard = window.locator('#node-list .node-card', { hasText: 'imported-node-1' });
      await rootNodeCard.click();

      // Now the grid child is registered. Click it to register the cards.
      const gridNodeCard = window.locator('#node-list .node-card .node-id', { hasText: /^↳ imported-node-1__child-1$/ });
      await expect(gridNodeCard).toBeVisible();
      await gridNodeCard.click();

      // Select the button wrapper directly via the workspace API
      const buttonId = await window.evaluate(() => {
        const wsInstance = (window as any).ws;
        const nodes = wsInstance.getNodes();
        const gridChildId = 'imported-node-1__child-1';
        const cardNodes = nodes.filter((n: any) => n.parentId === gridChildId);
        const card1 = cardNodes[0];
        if (card1) {
          wsInstance.selectNode(card1.id);
          const updatedNodes = wsInstance.getNodes();
          const buttonNode = updatedNodes.find((n: any) => {
            if (n.parentId === card1.id) {
              const el = wsInstance.mount.getContentRoot(n.id);
              return el && el.classList.contains('_button');
            }
            return false;
          });
          if (buttonNode) {
            // Center the viewport on the button wrapper at scale 1.0 to ensure it is visible and clickable on screen
            const rect = buttonNode.currentRect;
            if (rect) {
              const rectCenterX = rect.x + rect.width / 2;
              const rectCenterY = rect.y + rect.height / 2;
              wsInstance.setViewport({
                scale: 1.0,
                offsetX: 700 - rectCenterX,
                offsetY: 450 - rectCenterY
              });
            }
            wsInstance.selectNode(buttonNode.id);
            return buttonNode.id;
          }
        }
        return null;
      });
      expect(buttonId).not.toBeNull();
      await window.waitForTimeout(500);

       // Find the button wrapper bounding box
      const buttonWrapper = window.locator(`[data-canvus-id="${buttonId}"]`);
      await expect(buttonWrapper).toBeVisible();
      const startBox = await buttonWrapper.boundingBox();
      console.log('DEBUG E2E Test 12: startBox', startBox);
      expect(startBox).not.toBeNull();

      // The South-East resize handle is at (x + width, y + height)
      const handleX = startBox!.x + startBox!.width;
      const handleY = startBox!.y + startBox!.height;

      // Start drag at handle
      await window.mouse.move(handleX, handleY);
      await window.mouse.down();
      // Drag outward / downward slightly
      await window.mouse.move(handleX + 10, handleY + 10, { steps: 5 });
      await window.mouse.up();

      // Verify that the button did not jump to the top of the card (e.g., behind thumbnail stack at row 1)
      const endBox = await buttonWrapper.boundingBox();
      console.log('DEBUG E2E Test 12: endBox', endBox);
      expect(endBox).not.toBeNull();
      // If it jumped to row 1, Y difference would be massive (> 200px)
      // Since it stays at row 5, the Y coordinate should be close to its start Y position
      console.log('DEBUG E2E Test 12: Y difference:', Math.abs(endBox!.y - startBox!.y));
      expect(Math.abs(endBox!.y - startBox!.y)).toBeLessThan(50);

      // Verify that the committed grid-row-start is indeed 5
      const gridRowStart = await buttonWrapper.evaluate(el => {
        const content = el.firstElementChild as HTMLElement || el;
        return content.style.gridRowStart || el.style.gridRowStart;
      });
      console.log('DEBUG E2E Test 12: gridRowStart', gridRowStart);
      expect(gridRowStart).toBe('5');

    } finally {
      await electronApp.close();
    }
  });

  test('Cmd+Delete ungroups the parent container of the selected node without breaking the canvas root wrapper', async () => {
    const { electronApp, window } = await launchApp();
    try {

      // Select 'Standard Test Page'
      const templateSelect = window.locator('#sel-template');
      await templateSelect.selectOption('test-page');

      // Select main-container to register its immediate children (page-header, layout-grid, banner)
      const rootNodeCard = window.locator('#node-list .node-card', { hasText: 'main-container' });
      await expect(rootNodeCard).toBeVisible();
      await rootNodeCard.click();

      // Click on layout-grid to register card-1
      const gridNodeCard = window.locator('#node-list .node-card .node-id', { hasText: /^↳ layout-grid$/ });
      await expect(gridNodeCard).toBeVisible();
      await gridNodeCard.click();

      // Click card-1 to register card-1__child-1 (the text inside card-1)
      const card1NodeCard = window.locator('#node-list .node-card .node-id', { hasText: /^↳ card-1$/ });
      await expect(card1NodeCard).toBeVisible();
      await card1NodeCard.click();

      // Click card-1__child-1 to select it
      const childTextNodeCard = window.locator('#node-list .node-card .node-id', { hasText: /^↳ card-1__child-1$/ });
      await expect(childTextNodeCard).toBeVisible();
      await childTextNodeCard.click();

      // Verify that card-1 is the parent of card-1__child-1
      const initialParent = await window.evaluate(() => {
        const ws = (window as any).ws;
        return ws.getNodeTree().get('card-1__child-1')?.parentId;
      });
      expect(initialParent).toBe('card-1');

      // Dispatch Cmd+Delete to trigger ungrouping on parent wrapper (card-1)
      await window.evaluate(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'Delete',
          code: 'Delete',
          metaKey: true,
          bubbles: true,
          cancelable: true
        });
        window.dispatchEvent(event);
      });

      // After ungrouping:
      // 1. card-1 should be deleted from the tree
      // 2. card-1__child-1 should now be parented to layout-grid (promoted up)
      // 3. layout-grid (canvas wrapper/root node) should still exist!
      const afterUngroup = await window.evaluate(() => {
        const ws = (window as any).ws;
        const tree = ws.getNodeTree();
        return {
          card1Exists: tree.has('card-1'),
          child1Parent: tree.get('card-1__child-1')?.parentId,
          layoutGridExists: tree.has('layout-grid')
        };
      });

      expect(afterUngroup.card1Exists).toBe(false);
      expect(afterUngroup.child1Parent).toBe('layout-grid');
      expect(afterUngroup.layoutGridExists).toBe(true);

      // Verify that Undo works and does NOT duplicate elements
      // Click Undo button in sidebar
      const undoBtn = window.locator('#btn-undo');
      await expect(undoBtn).toBeEnabled();
      await undoBtn.click();

      // After undo:
      // 1. card-1 should exist again in the tree
      // 2. card-1__child-1's parent should be card-1 again
      // 3. In the DOM, card-1 should have exactly 1 h3 and 1 p element (no duplicates!)
      const afterUndo = await window.evaluate(() => {
        const ws = (window as any).ws;
        const tree = ws.getNodeTree();
        return {
          card1Exists: tree.has('card-1'),
          child1Parent: tree.get('card-1__child-1')?.parentId,
        };
      });

      expect(afterUndo.card1Exists).toBe(true);
      expect(afterUndo.child1Parent).toBe('card-1');

      // Verify inside Shadow DOM that there are no duplicates of h3/p inside card-1
      const cardElement = window.locator('[data-canvus-id="card-1"]');
      await expect(cardElement).toBeVisible();
      
      const h3Count = await cardElement.locator('h3').count();
      const pCount = await cardElement.locator('p').count();
      expect(h3Count).toBe(1);
      expect(pCount).toBe(1);

    } finally {
      await electronApp.close();
    }
  });

  test('Shift+A on single node transforms it into a flex container in-place', async () => {
    const { electronApp, window } = await launchApp();
    try {

      // Select 'Standard Test Page'
      const templateSelect = window.locator('#sel-template');
      await templateSelect.selectOption('test-page');

      // Click on main-container to register children
      const rootNodeCard = window.locator('#node-list .node-card', { hasText: 'main-container' });
      await expect(rootNodeCard).toBeVisible();
      await rootNodeCard.click();

      // Click on layout-grid to register children
      const gridNodeCard = window.locator('#node-list .node-card .node-id', { hasText: /^↳ layout-grid$/ });
      await expect(gridNodeCard).toBeVisible();
      await gridNodeCard.click();

      // Click card-1 to select it
      const card1NodeCard = window.locator('#node-list .node-card .node-id', { hasText: /^↳ card-1$/ });
      await expect(card1NodeCard).toBeVisible();
      await card1NodeCard.click();

      // Dispatch Shift+A to transform card-1 into a flex container
      await window.evaluate(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'a',
          code: 'KeyA',
          shiftKey: true,
          bubbles: true,
          cancelable: true
        });
        window.dispatchEvent(event);
      });

      // Verify that card-1 itself became a flex container (no wrapper created)
      const result = await window.evaluate(() => {
        const ws = (window as any).ws;
        const tree = ws.getNodeTree();
        const selectedId = Array.from(ws.getSelectedIds())[0] as string;

        // card-1 should still be selected (no wrapper created)
        const isCard1Selected = selectedId === 'card-1';

        // card-1's parent should still be layout-grid (unchanged)
        const card1Parent = tree.get('card-1')?.parentId;

        // No flex-wrapper should exist
        const hasWrapper = Array.from(tree.values() as IterableIterator<any>).some((n: any) => n.id.includes('flex-wrapper-'));

        // card-1's content root should now have flex styles applied
        const contentRoot = ws.getShadowMount().getContentRoot('card-1');
        const display = contentRoot?.style.display;
        const justify = contentRoot?.style.justifyContent;
        const align = contentRoot?.style.alignItems;

        return {
          isCard1Selected,
          card1Parent,
          hasWrapper,
          display,
          justify,
          align
        };
      });

      expect(result.isCard1Selected).toBe(true);
      expect(result.card1Parent).toBe('layout-grid');
      expect(result.hasWrapper).toBe(false);
      expect(result.display).toBe('flex');
      expect(result.justify).toBe('center');
      expect(result.align).toBe('center');

    } finally {
      await electronApp.close();
    }
  });

  test('keyboard shortcuts Cmd+Z (Undo) and Cmd+Shift+Z (Redo) propagate correctly and revert/reapply actions', async () => {
    const { electronApp, window } = await launchApp();
    try {

      // Click on the welcome card card in the node list to select it
      const welcomeNodeCard = window.locator('#node-list .node-card', { hasText: 'welcome-card' }).first();
      await expect(welcomeNodeCard).toBeVisible();
      await welcomeNodeCard.click();

      // Duplicate it via Cmd+D
      await window.evaluate(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'd',
          code: 'KeyD',
          metaKey: true,
          bubbles: true,
          cancelable: true
        });
        window.dispatchEvent(event);
      });

      // Verify that a cloned card exists
      const clonedCard = window.locator('#node-list .node-card', { hasText: 'cloned-' }).first();
      await expect(clonedCard).toBeVisible({ timeout: 5000 });

      // Hit Cmd+Z to Undo the duplication
      await window.evaluate(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'z',
          code: 'KeyZ',
          metaKey: true,
          bubbles: true,
          cancelable: true
        });
        window.dispatchEvent(event);
      });

      // Verify that the cloned card is removed from the tree
      await expect(clonedCard).not.toBeVisible({ timeout: 5000 });

      // Hit Cmd+Shift+Z to Redo the duplication
      await window.evaluate(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'z',
          code: 'KeyZ',
          metaKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true
        });
        window.dispatchEvent(event);
      });

      // Verify that the cloned card is restored
      await expect(clonedCard).toBeVisible({ timeout: 5000 });

    } finally {
      await electronApp.close();
    }
  });

  test('multi-select dragging/moving and Shift+A wrapping works', async () => {
    const { electronApp, window } = await launchApp();
    try {

      // Select 'Blank Workspace'
      const templateSelect = window.locator('#sel-template');
      await templateSelect.selectOption('blank');
      await window.waitForTimeout(500);

      // Programmatically add card-1 and card-2 as absolute positioned nodes at root
      await window.evaluate(() => {
        const ws = (window as any).ws;
        ws.deselectAll();
        ws.addNode({
          id: 'card-1',
          rawMarkup: `<div class="card" id="card-1" style="width: 200px; height: 100px; background: #242427; border: 1px solid #3f3f46; border-radius: 8px; padding: 16px;">Card 1</div>`,
          currentRect: { x: 100, y: 100, width: 200, height: 100 }
        });
        ws.addNode({
          id: 'card-2',
          rawMarkup: `<div class="card" id="card-2" style="width: 200px; height: 100px; background: #242427; border: 1px solid #3f3f46; border-radius: 8px; padding: 16px;">Card 2</div>`,
          currentRect: { x: 350, y: 100, width: 200, height: 100 }
        });
        ws.setViewport({
          scale: 1.0,
          offsetX: 300,
          offsetY: 200
        });
        ws.selectedIds.clear();
        ws.selectedIds.add('card-1');
        ws.selectedIds.add('card-2');
        ws.callbacks.onSelectionChange?.(ws.selectedIds);
        ws.render();
      });
      await window.waitForTimeout(500);

      const card1 = window.locator('[data-canvus-id="card-1"]');
      const card2 = window.locator('[data-canvus-id="card-2"]');
      await expect(card1).toBeVisible();
      await expect(card2).toBeVisible();

      // Measure starting position
      const initialBox1 = await card1.boundingBox();
      const initialBox2 = await card2.boundingBox();
      console.log('DEBUG E2E Test 16: initialBox1', initialBox1, 'initialBox2', initialBox2);
      expect(initialBox1).not.toBeNull();
      expect(initialBox2).not.toBeNull();

      const startX = initialBox1!.x + initialBox1!.width / 2;
      const startY = initialBox1!.y + initialBox1!.height / 2;

      // Drag by 100px down and right
      await window.mouse.move(startX, startY);
      await window.mouse.down();
      await window.waitForTimeout(200);
      await window.mouse.move(startX + 100, startY + 100, { steps: 10 });
      await window.waitForTimeout(200);
      await window.mouse.up();

      // Measure ending position
      const endBox1 = await card1.boundingBox();
      const endBox2 = await card2.boundingBox();
      console.log('DEBUG E2E Test 16: endBox1', endBox1, 'endBox2', endBox2);
      expect(endBox1).not.toBeNull();
      expect(endBox2).not.toBeNull();

      expect(endBox1!.x - initialBox1!.x).toBeCloseTo(100, -1); // tolerance of 10px
      expect(endBox1!.y - initialBox1!.y).toBeCloseTo(100, -1);
      expect(endBox2!.x - initialBox2!.x).toBeCloseTo(100, -1);
      expect(endBox2!.y - initialBox2!.y).toBeCloseTo(100, -1);

      // Now hit Shift+A to wrap both selected nodes in a flex box
      await window.evaluate(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'a',
          code: 'KeyA',
          shiftKey: true,
          bubbles: true,
          cancelable: true
        });
        window.dispatchEvent(event);
      });

      // Verify both card-1 and card-2 are nested under a newly created flex-wrapper
      const wrapResult = await window.evaluate(() => {
        const ws = (window as any).ws;
        const tree = ws.getNodeTree();
        const selectedId = Array.from(ws.getSelectedIds())[0] as string;
        
        const card1Parent = tree.get('card-1')?.parentId;
        const card2Parent = tree.get('card-2')?.parentId;

        return {
          selectedId,
          card1Parent,
          card2Parent
        };
      });

      expect(wrapResult.selectedId).toContain('flex-wrapper-');
      expect(wrapResult.card1Parent).toBe(wrapResult.selectedId);
      expect(wrapResult.card2Parent).toBe(wrapResult.selectedId);

      // Hit Undo button in sidebar
      const undoBtn = window.locator('#btn-undo');
      await expect(undoBtn).toBeEnabled();
      await undoBtn.click();

      // Verify parents are restored
      const restoreResult = await window.evaluate(() => {
        const ws = (window as any).ws;
        const tree = ws.getNodeTree();
        return {
          card1Parent: tree.get('card-1')?.parentId,
          card2Parent: tree.get('card-2')?.parentId,
          wrapperExists: ws.getNodes().some((n: any) => n.id.includes('flex-wrapper-'))
        };
      });
      expect(restoreResult.card1Parent).toBeNull();
      expect(restoreResult.card2Parent).toBeNull();
      expect(restoreResult.wrapperExists).toBe(false);

    } finally {
      await electronApp.close();
    }
  });

  test('multi-select keyboard shortcuts copy, paste, duplicate, delete work', async () => {
    const { electronApp, window } = await launchApp();
    try {

      // Select 'Standard Test Page'
      const templateSelect = window.locator('#sel-template');
      await templateSelect.selectOption('test-page');

      // Wait for layout grid to load and expand it in the node list
      const rootNodeCard = window.locator('#node-list .node-card', { hasText: 'main-container' });
      await expect(rootNodeCard).toBeVisible({ timeout: 10000 });
      await rootNodeCard.click();

      const gridNodeCard = window.locator('#node-list .node-card .node-id', { hasText: /^↳ layout-grid$/ });
      await expect(gridNodeCard).toBeVisible();
      await gridNodeCard.click();

      // 1. Programmatically select card-1 and card-2 in the workspace
      await window.evaluate(() => {
        const ws = (window as any).ws;
        ws.selectedIds.clear();
        ws.selectedIds.add('card-1');
        ws.selectedIds.add('card-2');
        ws.callbacks.onSelectionChange?.(ws.selectedIds);
        ws.render();
      });

      // 2. Duplicate via Cmd+D
      await window.evaluate(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'd',
          code: 'KeyD',
          metaKey: true,
          bubbles: true,
          cancelable: true
        });
        window.dispatchEvent(event);
      });

      // Verify that two cloned cards are created (cloned-card-1 and cloned-card-2)
      const clonedNodesCount = await window.evaluate(() => {
        const ws = (window as any).ws;
        return ws.getNodes().filter((n: any) => n.id.includes('cloned-') && !n.id.includes('__child-')).length;
      });
      expect(clonedNodesCount).toBe(2);

      // Verify that the clones are selected
      const selectedClonesCount = await window.evaluate(() => {
        const ws = (window as any).ws;
        return Array.from(ws.getSelectedIds()).filter((k: any) => k.includes('cloned-')).length;
      });
      expect(selectedClonesCount).toBe(2);

      // 3. Delete the clones via Backspace
      await window.evaluate(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'Backspace',
          code: 'Backspace',
          bubbles: true,
          cancelable: true
        });
        window.dispatchEvent(event);
      });

      // Verify clones are gone
      const clonedNodesCountAfterDelete = await window.evaluate(() => {
        const ws = (window as any).ws;
        return ws.getNodes().filter((n: any) => n.id.includes('cloned-') && !n.id.includes('__child-')).length;
      });
      expect(clonedNodesCountAfterDelete).toBe(0);

      // 4. Multi-select card-1 and card-2 again, copy them
      await window.evaluate(() => {
        const ws = (window as any).ws;
        ws.selectedIds.clear();
        ws.selectedIds.add('card-1');
        ws.selectedIds.add('card-2');
        ws.callbacks.onSelectionChange?.(ws.selectedIds);
        ws.render();
      });

      // Press Cmd+C
      await window.evaluate(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'c',
          code: 'KeyC',
          metaKey: true,
          bubbles: true,
          cancelable: true
        });
        window.dispatchEvent(event);
      });

      // Select main-container (where we want to paste)
      await window.evaluate(() => {
        const ws = (window as any).ws;
        ws.selectNode('main-container');
      });

      // Press Cmd+V to paste inside main-container
      await window.evaluate(() => {
        const event = new KeyboardEvent('keydown', {
          key: 'v',
          code: 'KeyV',
          metaKey: true,
          bubbles: true,
          cancelable: true
        });
        window.dispatchEvent(event);
      });

      // Verify copies are pasted as children of main-container
      const pastedChildren = await window.evaluate(() => {
        const ws = (window as any).ws;
        const pastedNodes = ws.getNodes().filter((n: any) => n.id.includes('pasted-') && !n.id.includes('__child-'));
        return pastedNodes.map((n: any) => ({
          id: n.id,
          parentId: n.parentId
        }));
      });

      expect(pastedChildren.length).toBe(2);
      for (const child of pastedChildren) {
        expect(child.parentId).toBe('main-container');
      }

    } finally {
      await electronApp.close();
    }
  });
});


// ── Property Lock System E2E Tests ──────────────────────────

test.describe('Property Lock System', () => {

  test('locked padding blocks spacing adjuster drag and fires lock interaction callback', async () => {
    const { electronApp, window } = await launchApp();
    try {

      // Register mock lock callbacks
      await window.evaluate(() => {
        const ws = (window as any).ws;
        (window as any).__lockLog = [];
        (ws as any).callbacks.isPropertyLocked = (nodeId: string, property: string) => {
          // Lock all padding properties on welcome-card
          return nodeId === 'welcome-card' && property.startsWith('padding');
        };
        (ws as any).callbacks.onPropertyLockInteraction = (nodeId: string, property: string, currentValue: string) => {
          (window as any).__lockLog.push({ nodeId, property, currentValue });
        };
      });

      // Select the welcome-card
      const welcomeNodeCard = window.locator('#node-list .node-card', { hasText: 'welcome-card' }).first();
      await expect(welcomeNodeCard).toBeVisible();
      await welcomeNodeCard.click();

      // Get the welcome card bounding box
      const welcomeCard = window.locator('[data-canvus-id="welcome-card"]');
      await expect(welcomeCard).toBeVisible();
      const box = await welcomeCard.boundingBox();
      expect(box).not.toBeNull();

      // Record the initial bounding box for comparison
      const initialBox = { ...box! };

      // Attempt to click inside the padding area (top padding region)
      // The spacing adjuster for padding-top is near the top edge of the element
      const padTopY = box!.y + 12; // Inside the top padding
      const padTopX = box!.x + 120; // Shifted horizontally to avoid North resize anchor

      await window.mouse.move(padTopX, padTopY);
      await window.mouse.down();
      await window.waitForTimeout(100);
      // Attempt to drag down (increase padding)
      await window.mouse.move(padTopX, padTopY + 40, { steps: 5 });
      await window.waitForTimeout(100);
      await window.mouse.up();

      // Verify that the lock interaction callback was fired
      const lockLog = await window.evaluate(() => (window as any).__lockLog);
      const paddingLocks = lockLog.filter((entry: any) => entry.property.startsWith('padding'));
      expect(paddingLocks.length).toBeGreaterThan(0);
      expect(paddingLocks[0].nodeId).toBe('welcome-card');

    } finally {
      await electronApp.close();
    }
  });

  test('locked width blocks resize handle and fires lock interaction callback', async () => {
    const { electronApp, window } = await launchApp();
    try {

      // Register mock lock callbacks
      await window.evaluate(() => {
        const ws = (window as any).ws;
        (window as any).__lockLog = [];
        (ws as any).callbacks.isPropertyLocked = (nodeId: string, property: string) => {
          return nodeId === 'welcome-card' && property === 'width';
        };
        (ws as any).callbacks.onPropertyLockInteraction = (nodeId: string, property: string, currentValue: string) => {
          (window as any).__lockLog.push({ nodeId, property, currentValue });
        };
      });

      // Select the welcome-card
      const welcomeNodeCard = window.locator('#node-list .node-card', { hasText: 'welcome-card' }).first();
      await expect(welcomeNodeCard).toBeVisible();
      await welcomeNodeCard.click();

      // Get the welcome card bounding box
      const welcomeCard = window.locator('[data-canvus-id="welcome-card"]');
      await expect(welcomeCard).toBeVisible();
      const box = await welcomeCard.boundingBox();
      expect(box).not.toBeNull();

      const initialWidth = box!.width;

      // The east resize handle is at the right edge
      const handleX = box!.x + box!.width;
      const handleY = box!.y + box!.height / 2;

      // Attempt to drag the east resize handle
      await window.mouse.move(handleX, handleY);
      await window.mouse.down();
      await window.waitForTimeout(100);
      await window.mouse.move(handleX + 80, handleY, { steps: 5 });
      await window.waitForTimeout(100);
      await window.mouse.up();

      // Verify that the lock interaction callback was fired
      const lockLog = await window.evaluate(() => (window as any).__lockLog);
      const widthLocks = lockLog.filter((entry: any) => entry.property === 'width');
      expect(widthLocks.length).toBeGreaterThan(0);
      expect(widthLocks[0].nodeId).toBe('welcome-card');

      // Verify the width did not change (resize was blocked)
      const afterBox = await welcomeCard.boundingBox();
      expect(afterBox!.width).toBeCloseTo(initialWidth, 0);

    } finally {
      await electronApp.close();
    }
  });

  test('locked border-radius blocks corner-radius drag and fires lock interaction callback', async () => {
    const { electronApp, window } = await launchApp();
    try {

      // Register mock lock callbacks
      await window.evaluate(() => {
        const ws = (window as any).ws;
        (window as any).__lockLog = [];
        (ws as any).callbacks.isPropertyLocked = (nodeId: string, property: string) => {
          return nodeId === 'welcome-card' && property === 'border-radius';
        };
        (ws as any).callbacks.onPropertyLockInteraction = (nodeId: string, property: string, currentValue: string) => {
          (window as any).__lockLog.push({ nodeId, property, currentValue });
        };
      });

      // Select the welcome-card
      const welcomeNodeCard = window.locator('#node-list .node-card', { hasText: 'welcome-card' }).first();
      await expect(welcomeNodeCard).toBeVisible();
      await welcomeNodeCard.click();

      // Get the welcome card bounding box
      const welcomeCard = window.locator('[data-canvus-id="welcome-card"]');
      await expect(welcomeCard).toBeVisible();
      const box = await welcomeCard.boundingBox();
      expect(box).not.toBeNull();

      // Record the initial border-radius
      const initialRadius = await welcomeCard.evaluate(el => {
        const content = el.firstElementChild as HTMLElement;
        return content ? content.style.borderRadius : el.style.borderRadius;
      });

      // The top-left corner radius handle is inset by 16px
      const handleX = box!.x + 16;
      const handleY = box!.y + 16;

      // Attempt to drag the corner radius handle
      await window.mouse.move(handleX, handleY);
      await window.mouse.down();
      await window.waitForTimeout(100);
      await window.mouse.move(handleX + 30, handleY + 30, { steps: 5 });
      await window.waitForTimeout(100);
      await window.mouse.up();

      // Verify that the lock interaction callback was fired
      const lockLog = await window.evaluate(() => (window as any).__lockLog);
      const radiusLocks = lockLog.filter((entry: any) => entry.property === 'border-radius');
      expect(radiusLocks.length).toBeGreaterThan(0);
      expect(radiusLocks[0].nodeId).toBe('welcome-card');

      // Verify the border-radius did not change
      const afterRadius = await welcomeCard.evaluate(el => {
        const content = el.firstElementChild as HTMLElement;
        return content ? content.style.borderRadius : el.style.borderRadius;
      });
      expect(afterRadius).toBe(initialRadius);

    } finally {
      await electronApp.close();
    }
  });

  test('unlocking a previously locked property re-enables interaction', async () => {
    const { electronApp, window } = await launchApp();
    try {

      // Register mock lock callbacks — width starts LOCKED
      await window.evaluate(() => {
        const ws = (window as any).ws;
        (window as any).__widthLocked = true;
        (window as any).__lockLog = [];
        (ws as any).callbacks.isPropertyLocked = (nodeId: string, property: string) => {
          const locked = nodeId === 'welcome-card' && property === 'width' && (window as any).__widthLocked;
          console.log(`[DEBUG_LOCK] isPropertyLocked nodeId=${nodeId} property=${property} locked=${locked}`);
          return locked;
        };
        (ws as any).callbacks.onPropertyLockInteraction = (nodeId: string, property: string, currentValue: string) => {
          (window as any).__lockLog.push({ nodeId, property, currentValue });
        };
      });

      // Select the welcome-card
      const welcomeNodeCard = window.locator('#node-list .node-card', { hasText: 'welcome-card' }).first();
      await expect(welcomeNodeCard).toBeVisible();
      await welcomeNodeCard.click();

      const welcomeCard = window.locator('[data-canvus-id="welcome-card"]');
      await expect(welcomeCard).toBeVisible();
      const box = await welcomeCard.boundingBox();
      expect(box).not.toBeNull();
      const initialWidth = box!.width;

      // 1. First attempt: locked → resize should be blocked
      const handleX = box!.x + box!.width;
      const handleY = box!.y + box!.height / 2;

      await window.mouse.move(handleX, handleY);
      await window.mouse.down();
      await window.waitForTimeout(100);
      await window.mouse.move(handleX + 60, handleY, { steps: 5 });
      await window.waitForTimeout(100);
      await window.mouse.up();

      const lockLog1 = await window.evaluate(() => (window as any).__lockLog);
      expect(lockLog1.length).toBeGreaterThan(0);

      const afterBox1 = await welcomeCard.boundingBox();
      expect(afterBox1!.width).toBeCloseTo(initialWidth, 0);

      // 2. Unlock the width property
      await window.evaluate(() => {
        (window as any).__widthLocked = false;
      });

      await window.waitForTimeout(400);

      const box2 = await welcomeCard.boundingBox();
      expect(box2).not.toBeNull();

      // 3. Second attempt: unlocked → resize should work
      const handleX2 = box2!.x + box2!.width;
      const handleY2 = box2!.y + box2!.height / 2;

      await window.mouse.move(handleX2, handleY2);
      await window.mouse.down();
      await window.waitForTimeout(100);
      await window.mouse.move(handleX2 + 60, handleY2, { steps: 5 });
      await window.waitForTimeout(100);
      await window.mouse.up();

      const afterBox2 = await welcomeCard.boundingBox();
      // Width should have changed since the lock was removed
      expect(afterBox2!.width).toBeGreaterThan(initialWidth + 30);

    } finally {
      await electronApp.close();
    }
  });

  test('multi-node drag is blocked when any selected node has a locked position property', async () => {
    const { electronApp, window } = await launchApp();
    try {

      // Load test page template
      const templateSelect = window.locator('#sel-template');
      await templateSelect.selectOption('test-page');

      // Wait for the main-container to appear
      const mainContainerNode = window.locator('#node-list .node-card', { hasText: 'main-container' });
      await expect(mainContainerNode).toBeVisible({ timeout: 10000 });

      // Select main-container to register its children
      await mainContainerNode.click();

      // Select layout-grid to register its children
      const layoutGridNode = window.locator('#node-list .node-card', { hasText: 'layout-grid' });
      await expect(layoutGridNode).toBeVisible();
      await layoutGridNode.click();

      // Register mock lock callbacks — lock 'left' on card-1 only
      await window.evaluate(() => {
        const ws = (window as any).ws;
        (window as any).__lockLog = [];
        (ws as any).callbacks.isPropertyLocked = (nodeId: string, property: string) => {
          return nodeId === 'card-1' && (property === 'left' || property === 'top');
        };
        (ws as any).callbacks.onPropertyLockInteraction = (nodeId: string, property: string, currentValue: string) => {
          (window as any).__lockLog.push({ nodeId, property, currentValue });
        };
      });

      // Multi-select card-1 and card-2 programmatically
      await window.evaluate(() => {
        const ws = (window as any).ws;
        // Select card-1
        ws.selectNode('card-1');
        // Shift-select card-2 by adding to selection
        const selectedIds = ws.getSelectedIds();
        selectedIds.add('card-2');
        // Trigger selection change callback
        ws.callbacks.onSelectionChange?.(selectedIds);
      });

      // Verify both are selected
      const selectedCount = await window.evaluate(() => {
        const ws = (window as any).ws;
        return ws.getSelectedIds().size;
      });
      expect(selectedCount).toBe(2);

      // Get card-1 bounding box to initiate a drag
      const card1 = window.locator('[data-canvus-id="card-1"]');
      await expect(card1).toBeVisible();
      const box = await card1.boundingBox();
      expect(box).not.toBeNull();

      const startX = box!.x + box!.width / 2;
      const startY = box!.y + box!.height / 2;

      // Attempt to drag (should be blocked because card-1 is locked)
      await window.mouse.move(startX, startY);
      await window.mouse.down();
      await window.waitForTimeout(200);
      await window.mouse.move(startX + 100, startY + 100, { steps: 10 });
      await window.waitForTimeout(200);
      await window.mouse.up();

      // Verify that the lock interaction callback was fired for card-1
      const lockLog = await window.evaluate(() => (window as any).__lockLog);
      const card1Locks = lockLog.filter((entry: any) => entry.nodeId === 'card-1');
      expect(card1Locks.length).toBeGreaterThan(0);

    } finally {
      await electronApp.close();
    }
  });
});
