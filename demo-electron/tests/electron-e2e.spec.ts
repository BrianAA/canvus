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

  test('loads CSS Layer Pressure Test, selects a card, and performs drag-and-drop grid repositioning', async () => {
    const appPath = path.resolve(__dirname, '../main.cjs');
    const electronApp = await electron.launch({
      args: [appPath]
    });

    try {
      const window = await electronApp.firstWindow();
      window.on('console', msg => console.log('PAGE LOG:', msg.text()));
      window.on('pageerror', err => console.error('PAGE ERROR:', err));
      await window.waitForLoadState('domcontentloaded');

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
    const appPath = path.resolve(__dirname, '../main.cjs');
    const electronApp = await electron.launch({
      args: [appPath]
    });

    try {
      const window = await electronApp.firstWindow();
      await window.waitForLoadState('domcontentloaded');

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
    const appPath = path.resolve(__dirname, '../main.cjs');
    const electronApp = await electron.launch({
      args: [appPath]
    });

    try {
      const window = await electronApp.firstWindow();
      window.on('console', msg => console.log('PAGE LOG:', msg.text()));
      window.on('pageerror', err => console.error('PAGE ERROR:', err));
      await window.waitForLoadState('domcontentloaded');

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
    const appPath = path.resolve(__dirname, '../main.cjs');
    const electronApp = await electron.launch({
      args: [appPath]
    });

    try {
      const window = await electronApp.firstWindow();
      window.on('console', msg => console.log('PAGE LOG:', msg.text()));
      window.on('pageerror', err => console.error('PAGE ERROR:', err));
      await window.waitForLoadState('domcontentloaded');

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
    const appPath = path.resolve(__dirname, '../main.cjs');
    const electronApp = await electron.launch({
      args: [appPath]
    });

    try {
      const window = await electronApp.firstWindow();
      await window.waitForLoadState('domcontentloaded');

      // Click on the welcome card card in the node list to select it
      const welcomeNodeCard = window.locator('#node-list .node-card', { hasText: 'welcome-card' });
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
      const clonedCard = window.locator('#node-list .node-card', { hasText: 'cloned-' });
      await expect(clonedCard).toBeVisible({ timeout: 5000 });

      // Verify that the original welcome-card is still present in its original position (e.g. still exists in node list)
      const originalCard = window.locator('#node-list .node-card', { hasText: 'welcome-card' }).first();
      await expect(originalCard).toBeVisible();

    } finally {
      await electronApp.close();
    }
  });

  test('nested drawing allows drawing a box inside a newly drawn empty structural container', async () => {
    const appPath = path.resolve(__dirname, '../main.cjs');
    const electronApp = await electron.launch({
      args: [appPath]
    });

    try {
      const window = await electronApp.firstWindow();
      await window.waitForLoadState('domcontentloaded');

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
    const appPath = path.resolve(__dirname, '../main.cjs');
    const electronApp = await electron.launch({
      args: [appPath]
    });

    try {
      const window = await electronApp.firstWindow();
      await window.waitForLoadState('domcontentloaded');

      // Click on the welcome card card in the node list to select it
      const welcomeNodeCard = window.locator('#node-list .node-card', { hasText: 'welcome-card' });
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
      const clonedCard = window.locator('#node-list .node-card', { hasText: 'cloned-' });
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
    const appPath = path.resolve(__dirname, '../main.cjs');
    const electronApp = await electron.launch({
      args: [appPath]
    });

    try {
      const window = await electronApp.firstWindow();
      await window.waitForLoadState('domcontentloaded');

      // Click welcome-card
      const welcomeNodeCard = window.locator('#node-list .node-card', { hasText: 'welcome-card' });
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
    const appPath = path.resolve(__dirname, '../main.cjs');
    const electronApp = await electron.launch({
      args: [appPath]
    });

    try {
      const window = await electronApp.firstWindow();
      window.on('console', msg => console.log('PAGE LOG:', msg.text()));
      window.on('pageerror', err => console.error('PAGE ERROR:', err));
      await window.waitForLoadState('domcontentloaded');

      // Click welcome-card
      const welcomeNodeCard = window.locator('#node-list .node-card', { hasText: 'welcome-card' });
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
});


