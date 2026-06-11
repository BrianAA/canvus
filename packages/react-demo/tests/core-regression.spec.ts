import { test, expect } from '@playwright/test';
import { setupDemoPage, getWorkspaceState, dragOnCanvas, getNodeBox, clickSidebarButton } from './helpers';

test.describe('Tier 1: Core Regression Tests via React Wrapper', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('DEBUG') || text.includes('Error') || msg.type() === 'error') {
        console.log(`[BROWSER LOG] [${msg.type()}] ${text}`);
      }
    });
    await setupDemoPage(page);
  });

  test('Workspace mounts successfully', async ({ page }) => {
    // Check if the Canvus Workspace instance is registered on the window object
    const isWsMounted = await page.evaluate(() => !!(window as any).ws);
    expect(isWsMounted).toBe(true);

    const state = await getWorkspaceState(page);
    expect(state.nodeCount).toBe(0);
    expect(state.selectedIds.length).toBe(0);
  });

  test('Add HTML node via sidebar button', async ({ page }) => {
    await clickSidebarButton(page, 'Add HTML Node');

    const state = await getWorkspaceState(page);
    expect(state.nodeCount).toBe(1);
    expect(state.nodes[0].id).toBe('html-node-1');

    const nodeElement = page.locator('[data-canvus-id="html-node-1"]');
    await expect(nodeElement).toBeVisible();
  });

  test('Single-select by clicking a node', async ({ page }) => {
    await clickSidebarButton(page, 'Add HTML Node');

    const box = await getNodeBox(page, 'html-node-1');
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    // Click the node
    await page.mouse.click(centerX, centerY);
    await page.waitForTimeout(100);

    const state = await getWorkspaceState(page);
    expect(state.selectedIds).toContain('html-node-1');

    // Sidebar list item should show selected class
    const selectedItem = page.locator('.node-item.selected', { hasText: 'html-node-1' });
    await expect(selectedItem).toBeVisible();
  });

  test('Drag single HTML node', async ({ page }) => {
    await clickSidebarButton(page, 'Add HTML Node');

    const boxBefore = await getNodeBox(page, 'html-node-1');
    const startX = boxBefore.x + boxBefore.width / 2;
    const startY = boxBefore.y + boxBefore.height / 2;

    // Drag by 150px right, 100px down
    await dragOnCanvas(page, { x: startX, y: startY }, { x: startX + 150, y: startY + 100 });

    const boxAfter = await getNodeBox(page, 'html-node-1');
    expect(Math.abs(boxAfter.x - boxBefore.x - 150)).toBeLessThan(15);
    expect(Math.abs(boxAfter.y - boxBefore.y - 100)).toBeLessThan(15);
  });

  test('Resize single HTML node', async ({ page }) => {
    await clickSidebarButton(page, 'Add HTML Node');

    // Select the node first to show the resize handles
    const boxBefore = await getNodeBox(page, 'html-node-1');
    await page.mouse.click(boxBefore.x + boxBefore.width / 2, boxBefore.y + boxBefore.height / 2);
    await page.waitForTimeout(500); // Wait to avoid double click detection

    // Bounding box of the node
    const activeBox = await getNodeBox(page, 'html-node-1');

    // The South-East resize handle is centered at (x + width, y + height)
    const handleX = activeBox.x + activeBox.width;
    const handleY = activeBox.y + activeBox.height;

    await dragOnCanvas(page, { x: handleX, y: handleY }, { x: handleX + 50, y: handleY + 30 });

    const boxAfter = await getNodeBox(page, 'html-node-1');
    expect(boxAfter.width).toBeGreaterThan(activeBox.width + 30);
    expect(boxAfter.height).toBeGreaterThan(activeBox.height + 15);
  });

  test('Copy after drag position sync behavior', async ({ page }) => {
    // 1. Add node
    await clickSidebarButton(page, 'Add HTML Node');

    // 2. Select it
    const box1 = await getNodeBox(page, 'html-node-1');
    await page.mouse.click(box1.x + box1.width / 2, box1.y + box1.height / 2);
    await page.waitForTimeout(100);

    // 3. Copy via Cmd+C or programmatically dispatching event
    await page.evaluate(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'c',
        code: 'KeyC',
        metaKey: true,
        bubbles: true,
        cancelable: true
      });
      window.dispatchEvent(event);
    });
    await page.waitForTimeout(200);

    // Clear selection so we paste at the root level (absolutely positioned)
    await page.evaluate(() => {
      const ws = (window as any).ws;
      ws.selectedIds.clear();
      ws.callbacks.onSelectionChange?.(ws.selectedIds);
      ws.render();
    });
    await page.waitForTimeout(100);

    // 4. Paste via Cmd+V
    await page.evaluate(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'v',
        code: 'KeyV',
        metaKey: true,
        bubbles: true,
        cancelable: true
      });
      window.dispatchEvent(event);
    });
    await page.waitForTimeout(300);

    // Verify pasted node exists
    const state = await getWorkspaceState(page);
    const pastedNode = state.nodes.find(n => n.id.includes('pasted-'));
    expect(pastedNode).toBeDefined();

    const pastedId = pastedNode!.id;
    const pastedBox = await getNodeBox(page, pastedId);

    // 5. Select and drag the pasted node.
    // We move the mouse to the center of the pasted node and drag it.
    const startX = pastedBox.x + pastedBox.width / 2;
    const startY = pastedBox.y + pastedBox.height / 2;

    await dragOnCanvas(page, { x: startX, y: startY }, { x: startX + 100, y: startY + 100 });

    // Verify the pasted node moved correctly to the target position
    const finalBox = await getNodeBox(page, pastedId);
    expect(Math.abs((finalBox.x - pastedBox.x) - 100)).toBeLessThan(15);
    expect(Math.abs((finalBox.y - pastedBox.y) - 100)).toBeLessThan(15);
  });

  test('Multi-select via marquee', async ({ page }) => {
    // Add two nodes
    await clickSidebarButton(page, 'Add HTML Node');
    await clickSidebarButton(page, 'Add HTML Node');

    const box1 = await getNodeBox(page, 'html-node-1');
    const box2 = await getNodeBox(page, 'html-node-2');

    // We draw a marquee bounding box that spans both nodes.
    // Start at a coordinate above/left of both nodes and drag to below/right of both.
    // Making sure coordinates are completely inside the canvas area (x > 320, y > 0)
    const startX = 330;
    const startY = 10;
    const endX = 1050;
    const endY = 300;

    await dragOnCanvas(page, { x: startX, y: startY }, { x: endX, y: endY });

    const state = await getWorkspaceState(page);
    expect(state.selectedIds).toContain('html-node-1');
    expect(state.selectedIds).toContain('html-node-2');
  });

  test('Multi-select drag moves all selected nodes together', async ({ page }) => {
    await clickSidebarButton(page, 'Add HTML Node');
    await clickSidebarButton(page, 'Add HTML Node');

    // Programmatically select both nodes
    await page.evaluate(() => {
      const ws = (window as any).ws;
      ws.selectedIds.clear();
      ws.selectedIds.add('html-node-1');
      ws.selectedIds.add('html-node-2');
      ws.callbacks.onSelectionChange?.(ws.selectedIds);
      ws.render();
    });
    await page.waitForTimeout(100);

    const box1Before = await getNodeBox(page, 'html-node-1');
    const box2Before = await getNodeBox(page, 'html-node-2');

    // Drag from center of node 1
    const startX = box1Before.x + box1Before.width / 2;
    const startY = box1Before.y + box1Before.height / 2;

    await dragOnCanvas(page, { x: startX, y: startY }, { x: startX + 120, y: startY + 80 });

    const box1After = await getNodeBox(page, 'html-node-1');
    const box2After = await getNodeBox(page, 'html-node-2');

    expect(box1After.x - box1Before.x).toBeCloseTo(120, -1);
    expect(box1After.y - box1Before.y).toBeCloseTo(80, -1);
    expect(box2After.x - box2Before.x).toBeCloseTo(120, -1);
    expect(box2After.y - box2Before.y).toBeCloseTo(80, -1);
  });

  test('Cmd+Z Undo and Cmd+Shift+Z Redo revert and reapply actions', async ({ page }) => {
    await clickSidebarButton(page, 'Add HTML Node');

    const box1 = await getNodeBox(page, 'html-node-1');
    const startX = box1.x + box1.width / 2;
    const startY = box1.y + box1.height / 2;

    // Drag to new location
    await dragOnCanvas(page, { x: startX, y: startY }, { x: startX + 100, y: startY + 50 });
    const boxDragged = await getNodeBox(page, 'html-node-1');

    // Dispatch Undo (Cmd+Z)
    await page.evaluate(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'z',
        code: 'KeyZ',
        metaKey: true,
        bubbles: true,
        cancelable: true
      });
      window.dispatchEvent(event);
    });
    await page.waitForTimeout(200);

    // Verify it returned to the starting position
    const boxAfterUndo = await getNodeBox(page, 'html-node-1');
    expect(boxAfterUndo.x).toBeCloseTo(box1.x, -1);
    expect(boxAfterUndo.y).toBeCloseTo(box1.y, -1);

    // Dispatch Redo (Cmd+Shift+Z)
    await page.evaluate(() => {
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
    await page.waitForTimeout(200);

    // Verify it moved to the dragged position again
    const boxAfterRedo = await getNodeBox(page, 'html-node-1');
    expect(boxAfterRedo.x).toBeCloseTo(boxDragged.x, -1);
    expect(boxAfterRedo.y).toBeCloseTo(boxDragged.y, -1);
  });

  test('Cmd+D duplicates the selected node immediately as a sibling', async ({ page }) => {
    await clickSidebarButton(page, 'Add HTML Node');

    // Select the node
    const box = await getNodeBox(page, 'html-node-1');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(100);

    // Dispatch Cmd+D
    await page.evaluate(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'd',
        code: 'KeyD',
        metaKey: true,
        bubbles: true,
        cancelable: true
      });
      window.dispatchEvent(event);
    });
    await page.waitForTimeout(200);

    // Verify that cloned node exists and is selected
    const state = await getWorkspaceState(page);
    expect(state.nodeCount).toBeGreaterThan(1);

    const cloneNode = state.nodes.find(n => n.id.includes('cloned-'));
    expect(cloneNode).toBeDefined();
    expect(state.selectedIds).toContain(cloneNode!.id);
  });

  test('Delete node via Backspace key', async ({ page }) => {
    await clickSidebarButton(page, 'Add HTML Node');

    // Select it
    const box = await getNodeBox(page, 'html-node-1');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(100);

    // Hit Backspace key
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);

    const state = await getWorkspaceState(page);
    expect(state.nodeCount).toBe(0);
  });

  test('Original node text is editable via double click', async ({ page }) => {
    // 1. Add HTML Node
    await clickSidebarButton(page, 'Add HTML Node');

    // 2. Double click the text element inside the original node to drill down and select it
    const textLocator = page.locator('[data-canvus-id="html-node-1"] h3').first();
    await textLocator.dblclick({ force: true });
    await page.waitForTimeout(300);

    // Verify the child node gets selected
    const stateAfterFirstDblClick = await getWorkspaceState(page);
    const childNode = stateAfterFirstDblClick.nodes.find(n => n.parentId === 'html-node-1');
    expect(childNode).toBeDefined();
    expect(stateAfterFirstDblClick.selectedIds).toContain(childNode!.id);

    // 3. Double click the child text element again to enter text edit mode
    await textLocator.dblclick({ force: true });
    await page.waitForTimeout(300);

    // 4. Verify the child enters edit mode (gets canvus-editing class and is contenteditable)
    await expect(textLocator).toHaveClass(/canvus-editing/);
    
    // Verify it becomes contenteditable
    const contentEditable = await textLocator.getAttribute('contenteditable');
    expect(contentEditable).toBe('plaintext-only');
  });

  test('Duplicated node text is editable via double click', async ({ page }) => {
    // 1. Add HTML Node
    await clickSidebarButton(page, 'Add HTML Node');

    // 2. Select it
    const box = await getNodeBox(page, 'html-node-1');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(100);

    // 3. Duplicate it via Cmd+D
    await page.evaluate(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'd',
        code: 'KeyD',
        metaKey: true,
        bubbles: true,
        cancelable: true
      });
      window.dispatchEvent(event);
    });
    await page.waitForTimeout(300);

    // Get workspace state to find the cloned node
    const state = await getWorkspaceState(page);
    const cloneNode = state.nodes.find(n => n.id.includes('cloned-'));
    expect(cloneNode).toBeDefined();
    const clonedId = cloneNode!.id;

    // 4. Double click the text element inside the cloned node to drill down and select it
    const textLocator = page.locator(`[data-canvus-id="${clonedId}"] h3`).first();
    await textLocator.dblclick({ force: true });
    await page.waitForTimeout(300);

    // Verify the child node gets selected
    const stateAfterFirstDblClick = await getWorkspaceState(page);
    const childNode = stateAfterFirstDblClick.nodes.find(n => n.parentId === clonedId);
    expect(childNode).toBeDefined();
    expect(stateAfterFirstDblClick.selectedIds).toContain(childNode!.id);

    // 5. Double click the child text element again to enter text edit mode
    await textLocator.dblclick({ force: true });
    await page.waitForTimeout(300);

    // 6. Verify the child enters edit mode (gets canvus-editing class and is contenteditable)
    await expect(textLocator).toHaveClass(/canvus-editing/);
    
    // Verify it becomes contenteditable
    const contentEditable = await textLocator.getAttribute('contenteditable');
    expect(contentEditable).toBe('plaintext-only');
  });

  test('Alt-dragged child node is wrapped, editable, and retains styling', async ({ page }) => {
    // 1. Add HTML Node
    await clickSidebarButton(page, 'Add HTML Node');

    // 2. Select it and double click to drill down and select the child (h3)
    const textLocator = page.locator('[data-canvus-id="html-node-1"] h3').first();
    await textLocator.dblclick({ force: true });
    await page.waitForTimeout(300);

    // Get the child node's ID from selectedIds
    const state = await getWorkspaceState(page);
    const childId = state.selectedIds[0];
    expect(childId).toBeDefined();

    // Get child node's bounding box
    const boxBefore = await getNodeBox(page, childId);
    const startX = boxBefore.x + boxBefore.width / 2;
    const startY = boxBefore.y + boxBefore.height / 2;

    // 3. Alt-drag the child node onto the canvas root
    await page.keyboard.down('Alt');
    await dragOnCanvas(page, { x: startX, y: startY }, { x: startX + 250, y: startY + 150 });
    await page.keyboard.up('Alt');
    await page.waitForTimeout(300);

    // Verify a cloned node is created at root level (parentId === null)
    const stateAfterDrag = await getWorkspaceState(page);
    const cloneId = stateAfterDrag.selectedIds[0];
    expect(cloneId).toBeDefined();
    expect(cloneId).not.toBe(childId);

    const cloneNode = stateAfterDrag.nodes.find(n => n.id === cloneId);
    expect(cloneNode).toBeDefined();
    expect(cloneNode!.parentId).toBeNull(); // It should be at the canvas root

    // Verify it is wrapped (not direct, wrapper-based) and has correct box-sizing/width/height (not bigger)
    const cloneWrapper = page.locator(`.canvus-node-wrapper[data-canvus-id="${cloneId}"]`);
    await expect(cloneWrapper).toBeVisible();

    // Verify the inner h3 font-family is preserved (not default browser font, should match original)
    const originalFontFamily = await textLocator.evaluate(el => window.getComputedStyle(el).fontFamily);
    const cloneText = cloneWrapper.locator('h3').first();
    const clonedFontFamily = await cloneText.evaluate(el => window.getComputedStyle(el).fontFamily);
    expect(clonedFontFamily).toBe(originalFontFamily);

    // Verify the clone is editable by double-clicking it
    await cloneText.dblclick({ force: true });
    await page.waitForTimeout(300);
    await expect(cloneWrapper).toHaveClass(/canvus-editing/);
    
    const contentEditable = await cloneText.getAttribute('contenteditable');
    expect(contentEditable).toBe('plaintext-only');
  });
});

