import { test, expect } from '@playwright/test';
import { setupDemoPage, getWorkspaceState, dragOnCanvas, getNodeBox, togglePreview, clickSidebarButton } from './helpers';

test.describe('Tier 2: React-Specific Integration Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupDemoPage(page);
  });

  test('addReactNode mounts and renders DemoCard component inside Shadow DOM', async ({ page }) => {
    await clickSidebarButton(page, 'Add React Node');

    const state = await getWorkspaceState(page);
    expect(state.nodeCount).toBe(1);
    expect(state.nodes[0].id).toBe('react-card-1');

    // Verify card elements (which are inside the shadow DOM) are visible
    const cardTitle = page.locator('[data-canvus-id="react-card-1"] h3', { hasText: 'Card 1' });
    await expect(cardTitle).toBeVisible();

    const reactBadge = page.locator('[data-canvus-id="react-card-1"] span', { hasText: 'React' });
    await expect(reactBadge).toBeVisible();
  });

  test('updateReactNode re-renders component on prop changes from Inspector', async ({ page }) => {
    await clickSidebarButton(page, 'Add React Node');

    // Click node to select it and open the Props Inspector
    const box = await getNodeBox(page, 'react-card-1');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(100);

    const inspector = page.locator('.props-inspector');
    await expect(inspector).toBeVisible();

    // Find the title input in PropsInspector and type a new title
    const titleInput = inspector.locator('input[type="text"]').first();
    await expect(titleInput).toBeVisible();
    
    await titleInput.fill('');
    await titleInput.type('Hello React 18!');
    await titleInput.press('Enter');
    await page.waitForTimeout(200);

    // Verify the card header text inside shadow DOM updated
    const cardTitle = page.locator('[data-canvus-id="react-card-1"] h3');
    await expect(cardTitle).toHaveText('Hello React 18!');
  });

  test('updateReactNode variant style change re-renders', async ({ page }) => {
    await clickSidebarButton(page, 'Add React Node');

    // Select the card
    const box = await getNodeBox(page, 'react-card-1');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(100);

    // Click 'secondary' variant button in Props Inspector
    const variantBtn = page.locator('.variant-btn.variant-secondary');
    await expect(variantBtn).toBeVisible();
    await variantBtn.click();
    await page.waitForTimeout(200);

    // Verify button has active state
    await expect(variantBtn).toHaveClass(/active/);

    // Verify color styles or background style inside shadow DOM node changes
    const cardElement = page.locator('[data-canvus-id="react-card-1"] > div > div');
    await expect(cardElement).toBeVisible();
    const styleAttr = await cardElement.getAttribute('style');
    // The secondary variant uses cyan/sky styles which contain e.g. #0ea5e9 (rgb(14, 165, 233))
    expect(styleAttr).toContain('14, 165, 233');
  });

  test('removeReactNode unmounts the React root and removes node from canvas', async ({ page }) => {
    await clickSidebarButton(page, 'Add React Node');
    
    // Verify it exists in node list
    const nodeItem = page.locator('.node-item', { hasText: 'react-card-1' });
    await expect(nodeItem).toBeVisible();

    // Click the close/delete button next to it in active node list
    const deleteBtn = nodeItem.locator('.btn-danger');
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();
    await page.waitForTimeout(200);

    const state = await getWorkspaceState(page);
    expect(state.nodeCount).toBe(0);

    // Shadow DOM node should be gone
    const card = page.locator('[data-canvus-id="react-card-1"]');
    await expect(card).not.toBeVisible();
  });

  test('Multiple React nodes and mixed nodes coexistence', async ({ page }) => {
    // Add two react nodes and one HTML node
    await clickSidebarButton(page, 'Add React Node');
    await clickSidebarButton(page, 'Add React Node');
    await clickSidebarButton(page, 'Add HTML Node');

    const state = await getWorkspaceState(page);
    expect(state.nodeCount).toBe(3);
    expect(state.nodes.map(n => n.id)).toContain('react-card-1');
    expect(state.nodes.map(n => n.id)).toContain('react-card-2');
    expect(state.nodes.map(n => n.id)).toContain('html-node-3');

    await expect(page.locator('[data-canvus-id="react-card-1"]')).toBeVisible();
    await expect(page.locator('[data-canvus-id="react-card-2"]')).toBeVisible();
    await expect(page.locator('[data-canvus-id="html-node-3"]')).toBeVisible();
  });

  test('Preview mode toggle behaves correctly', async ({ page }) => {
    const isPreviewInitial = await page.evaluate(() => (window as any).ws.isPreviewMode());
    expect(isPreviewInitial).toBe(false);

    // Toggle to preview
    const isPreviewActive = await togglePreview(page);
    expect(isPreviewActive).toBe(true);

    const toggleBtn = page.locator('.preview-toggle');
    await expect(toggleBtn).toHaveClass(/active/);
    await expect(toggleBtn).toContainText('Preview');

    // Toggle back to edit
    const isPreviewDisabled = await togglePreview(page);
    expect(isPreviewDisabled).toBe(false);
    await expect(toggleBtn).not.toHaveClass(/active/);
    await expect(toggleBtn).toContainText('Edit');
  });

  test('Preview mode disables selections but enables interactive component clicks', async ({ page }) => {
    await clickSidebarButton(page, 'Add React Node');

    // Toggle preview mode
    await togglePreview(page);

    const box = await getNodeBox(page, 'react-card-1');
    
    // Clicking card center in preview mode should NOT select the card
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(100);

    const stateAfterClick = await getWorkspaceState(page);
    expect(stateAfterClick.selectedIds.length).toBe(0);

    // But clicking the "+1" button inside the card should increment count
    const plusOneBtn = page.locator('[data-canvus-id="react-card-1"] button', { hasText: '+1' });
    await expect(plusOneBtn).toBeVisible();

    const countContainer = page.locator('[data-canvus-id="react-card-1"]', { hasText: 'Count:' });
    await expect(countContainer).toContainText('Count: 0');

    await plusOneBtn.click();
    await page.waitForTimeout(100);

    // Verify count incremented to 1
    await expect(countContainer).toContainText('Count: 1');
  });

  test('onReactNodeCommit vs onHTMLCommit callback commit routing', async ({ page }) => {
    await clickSidebarButton(page, 'Add React Node');
    await clickSidebarButton(page, 'Add HTML Node');

    // Drag the React node to trigger onReactNodeCommit
    const reactBox = await getNodeBox(page, 'react-card-1');
    const rx = reactBox.x + reactBox.width / 2;
    const ry = reactBox.y + reactBox.height / 2;
    await dragOnCanvas(page, { x: rx, y: ry }, { x: rx + 50, y: ry + 50 });
    await page.waitForTimeout(200);

    // Drag the HTML node to trigger onHTMLCommit
    const htmlBox = await getNodeBox(page, 'html-node-2');
    const hx = htmlBox.x + htmlBox.width / 2;
    const hy = htmlBox.y + htmlBox.height / 2;
    await dragOnCanvas(page, { x: hx, y: hy }, { x: hx + 50, y: hy + 50 });
    await page.waitForTimeout(200);

    // Verify entries in the event log
    const reactLogEntry = page.locator('.log-entry', { hasText: 'REACT' }).first();
    const htmlLogEntry = page.locator('.log-entry', { hasText: 'HTML' }).first();

    await expect(reactLogEntry).toBeVisible();
    await expect(htmlLogEntry).toBeVisible();

    await expect(reactLogEntry).toContainText('react-card-1');
    await expect(htmlLogEntry).toContainText('html-node-2');
  });

  test('Cmd+D duplicates the selected React node as an active React node instance', async ({ page }) => {
    await clickSidebarButton(page, 'Add React Node');

    // Select the React node
    const box = await getNodeBox(page, 'react-card-1');
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
    await page.waitForTimeout(300);

    // Verify cloned node is registered, selected, and visible
    const state = await getWorkspaceState(page);
    const cloneNode = state.nodes.find(n => n.id.includes('cloned-'));
    expect(cloneNode).toBeDefined();
    const cloneId = cloneNode!.id;
    expect(state.selectedIds).toContain(cloneId);

    // Verify the cloned node is an active React node inside shadow DOM
    const cardTitle = page.locator(`[data-canvus-id="${cloneId}"] h3`, { hasText: 'Card 1' });
    await expect(cardTitle).toBeVisible();

    const reactBadge = page.locator(`[data-canvus-id="${cloneId}"] span`, { hasText: 'React' });
    await expect(reactBadge).toBeVisible();

    // Verify Props Inspector has the cloned React node selected and can update its props
    const inspector = page.locator('.props-inspector');
    await expect(inspector).toBeVisible();

    const titleInput = inspector.locator('input[type="text"]').first();
    await expect(titleInput).toBeVisible();
    await titleInput.fill('');
    await titleInput.type('Hello Cloned React!');
    await titleInput.press('Enter');
    await page.waitForTimeout(200);

    // Verify the cloned card header text updated
    const clonedCardTitle = page.locator(`[data-canvus-id="${cloneId}"] h3`);
    await expect(clonedCardTitle).toHaveText('Hello Cloned React!');
  });

  test('Alt-drag duplicates the React node as an active React node instance', async ({ page }) => {
    await clickSidebarButton(page, 'Add React Node');

    const box = await getNodeBox(page, 'react-card-1');
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    // Alt-drag the React node
    await page.keyboard.down('Alt');
    await dragOnCanvas(page, { x: startX, y: startY }, { x: startX + 350, y: startY + 100 });
    await page.keyboard.up('Alt');
    await page.waitForTimeout(300);

    // Verify cloned node is created, selected, and is an active React node
    const state = await getWorkspaceState(page);
    const cloneNode = state.nodes.find(n => n.id.includes('cloned-'));
    expect(cloneNode).toBeDefined();
    const cloneId = cloneNode!.id;
    expect(state.selectedIds).toContain(cloneId);

    const cardTitle = page.locator(`[data-canvus-id="${cloneId}"] h3`, { hasText: 'Card 1' });
    await expect(cardTitle).toBeVisible();

    const reactBadge = page.locator(`[data-canvus-id="${cloneId}"] span`, { hasText: 'React' });
    await expect(reactBadge).toBeVisible();

    // Verify Props Inspector is visible and functional
    const inspector = page.locator('.props-inspector');
    await expect(inspector).toBeVisible();
  });
});
