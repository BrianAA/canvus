import { type Page, type Locator, expect } from '@playwright/test';

export interface WorkspaceNode {
  id: string;
  parentId: string | null;
  currentRect: { x: number; y: number; width: number; height: number };
}

export interface WorkspaceState {
  nodeCount: number;
  selectedIds: string[];
  nodes: WorkspaceNode[];
  isPreviewMode: boolean;
}

/**
 * Navigates to the demo app and waits for the Canvus workspace to be mounted and exposed.
 */
export async function setupDemoPage(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  // Wait for the workspace object to be exposed on the window
  await page.waitForFunction(() => typeof (window as any).ws !== 'undefined', { timeout: 10000 });
}

/**
 * Returns the workspace state by evaluating window.ws inside the page.
 */
export async function getWorkspaceState(page: Page): Promise<WorkspaceState> {
  return page.evaluate(() => {
    const ws = (window as any).ws;
    if (!ws) {
      throw new Error('Workspace is not initialized on window.ws');
    }
    return {
      nodeCount: ws.getNodes().length,
      selectedIds: Array.from(ws.getSelectedIds() as Set<string>),
      nodes: ws.getNodes().map((n: any) => ({
        id: n.id,
        parentId: n.parentId,
        currentRect: n.currentRect,
      })),
      isPreviewMode: ws.isPreviewMode(),
    };
  });
}

/**
 * Drags from a start coordinate to an end coordinate.
 */
export async function dragOnCanvas(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 10
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.move(to.x, to.y, { steps });
  await page.waitForTimeout(100);
  await page.mouse.up();
  await page.waitForTimeout(100);
}

/**
 * Gets the bounding box of a canvus node.
 */
export async function getNodeBox(page: Page, id: string) {
  const locator = page.locator(`[data-canvus-id="${id}"]`);
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error(`Could not find bounding box for node ${id}`);
  }
  return box;
}

/**
 * Toggles preview mode via the sidebar toggle button.
 */
export async function togglePreview(page: Page): Promise<boolean> {
  const toggleBtn = page.locator('.preview-toggle');
  await expect(toggleBtn).toBeVisible();
  await toggleBtn.click();
  await page.waitForTimeout(100);
  return page.evaluate(() => (window as any).ws.isPreviewMode());
}

/**
 * Clicks a sidebar button by its text content.
 */
export async function clickSidebarButton(page: Page, text: string): Promise<void> {
  const button = page.locator('.sidebar button', { hasText: text });
  await expect(button).toBeVisible();
  await button.click();
  await page.waitForTimeout(100);
}
