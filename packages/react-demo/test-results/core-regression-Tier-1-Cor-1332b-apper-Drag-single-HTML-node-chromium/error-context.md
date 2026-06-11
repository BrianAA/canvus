# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: core-regression.spec.ts >> Tier 1: Core Regression Tests via React Wrapper >> Drag single HTML node
- Location: tests/core-regression.spec.ts:55:3

# Error details

```
Error: expect(received).toBeCloseTo(expected, precision)

Expected: 100
Received: 105

Expected precision:    -1
Expected difference: < 5
Received difference:   5
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary [ref=e4]:
    - generic [ref=e5]:
      - heading "Canvus React Demo" [level=1] [ref=e6]:
        - generic [ref=e7]: Canvus
        - generic [ref=e8]: React Demo
      - button "✏️ Edit" [ref=e9] [cursor=pointer]:
        - generic [ref=e10]: ✏️
        - generic [ref=e11]: Edit
    - generic [ref=e12]:
      - generic [ref=e13]:
        - heading "Add Nodes" [level=3] [ref=e14]
        - generic [ref=e15]:
          - button "⚛️ Add React Node" [ref=e16] [cursor=pointer]:
            - generic [ref=e17]: ⚛️
            - text: Add React Node
          - button "📝 Add HTML Node" [ref=e18] [cursor=pointer]:
            - generic [ref=e19]: 📝
            - text: Add HTML Node
      - generic [ref=e20]:
        - heading "Active Nodes 1" [level=3] [ref=e21]:
          - text: Active Nodes
          - generic [ref=e22]: "1"
        - list [ref=e23]:
          - listitem [ref=e24]:
            - generic [ref=e25]:
              - generic [ref=e26]: 📝
              - generic [ref=e27]: html-node-1
            - button "✕" [ref=e29] [cursor=pointer]
    - generic [ref=e30]:
      - heading "Props Inspector" [level=3] [ref=e31]
      - paragraph [ref=e32]: Select a React node on the canvas to edit its props
    - generic [ref=e33]:
      - heading "Event Log 3" [level=3] [ref=e34]:
        - text: Event Log
        - generic [ref=e35]: "3"
      - generic [ref=e36]:
        - generic [ref=e37]:
          - generic [ref=e38]: 10:03:39 PM
          - generic [ref=e39]: HTML
          - generic [ref=e40]: "\"html-node-1\" → <div style=\" padding: 24px; background: linear-gradient(135d…"
        - generic [ref=e41]:
          - generic [ref=e42]: 10:03:39 PM
          - generic [ref=e43]: SELECT
          - generic [ref=e44]: "Selected: html-node-1"
        - generic [ref=e45]:
          - generic [ref=e46]: 10:03:39 PM
          - generic [ref=e47]: INFO
          - generic [ref=e48]: Added HTML node "html-node-1"
  - generic [ref=e52]:
    - heading "HTML Node" [level=3] [ref=e53]
    - paragraph [ref=e54]: This is a vanilla HTML node using rawMarkup. It participates in the Flat String Bridge.
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { setupDemoPage, getWorkspaceState, dragOnCanvas, getNodeBox, clickSidebarButton } from './helpers';
  3   | 
  4   | test.describe('Tier 1: Core Regression Tests via React Wrapper', () => {
  5   |   test.beforeEach(async ({ page }) => {
  6   |     page.on('console', msg => {
  7   |       const text = msg.text();
  8   |       if (text.includes('DEBUG') || text.includes('Error') || msg.type() === 'error') {
  9   |         console.log(`[BROWSER LOG] [${msg.type()}] ${text}`);
  10  |       }
  11  |     });
  12  |     await setupDemoPage(page);
  13  |   });
  14  | 
  15  |   test('Workspace mounts successfully', async ({ page }) => {
  16  |     // Check if the Canvus Workspace instance is registered on the window object
  17  |     const isWsMounted = await page.evaluate(() => !!(window as any).ws);
  18  |     expect(isWsMounted).toBe(true);
  19  | 
  20  |     const state = await getWorkspaceState(page);
  21  |     expect(state.nodeCount).toBe(0);
  22  |     expect(state.selectedIds.length).toBe(0);
  23  |   });
  24  | 
  25  |   test('Add HTML node via sidebar button', async ({ page }) => {
  26  |     await clickSidebarButton(page, 'Add HTML Node');
  27  | 
  28  |     const state = await getWorkspaceState(page);
  29  |     expect(state.nodeCount).toBe(1);
  30  |     expect(state.nodes[0].id).toBe('html-node-1');
  31  | 
  32  |     const nodeElement = page.locator('[data-canvus-id="html-node-1"]');
  33  |     await expect(nodeElement).toBeVisible();
  34  |   });
  35  | 
  36  |   test('Single-select by clicking a node', async ({ page }) => {
  37  |     await clickSidebarButton(page, 'Add HTML Node');
  38  | 
  39  |     const box = await getNodeBox(page, 'html-node-1');
  40  |     const centerX = box.x + box.width / 2;
  41  |     const centerY = box.y + box.height / 2;
  42  | 
  43  |     // Click the node
  44  |     await page.mouse.click(centerX, centerY);
  45  |     await page.waitForTimeout(100);
  46  | 
  47  |     const state = await getWorkspaceState(page);
  48  |     expect(state.selectedIds).toContain('html-node-1');
  49  | 
  50  |     // Sidebar list item should show selected class
  51  |     const selectedItem = page.locator('.node-item.selected', { hasText: 'html-node-1' });
  52  |     await expect(selectedItem).toBeVisible();
  53  |   });
  54  | 
  55  |   test('Drag single HTML node', async ({ page }) => {
  56  |     await clickSidebarButton(page, 'Add HTML Node');
  57  | 
  58  |     const boxBefore = await getNodeBox(page, 'html-node-1');
  59  |     const startX = boxBefore.x + boxBefore.width / 2;
  60  |     const startY = boxBefore.y + boxBefore.height / 2;
  61  | 
  62  |     // Drag by 150px right, 100px down
  63  |     await dragOnCanvas(page, { x: startX, y: startY }, { x: startX + 150, y: startY + 100 });
  64  | 
  65  |     const boxAfter = await getNodeBox(page, 'html-node-1');
  66  |     expect(boxAfter.x - boxBefore.x).toBeCloseTo(150, -1); // tolerance of 10px
> 67  |     expect(boxAfter.y - boxBefore.y).toBeCloseTo(100, -1);
      |                                      ^ Error: expect(received).toBeCloseTo(expected, precision)
  68  |   });
  69  | 
  70  |   test('Resize single HTML node', async ({ page }) => {
  71  |     await clickSidebarButton(page, 'Add HTML Node');
  72  | 
  73  |     // Select the node first to show the resize handles
  74  |     const boxBefore = await getNodeBox(page, 'html-node-1');
  75  |     await page.mouse.click(boxBefore.x + boxBefore.width / 2, boxBefore.y + boxBefore.height / 2);
  76  |     await page.waitForTimeout(500); // Wait to avoid double click detection
  77  | 
  78  |     // Bounding box of the node
  79  |     const activeBox = await getNodeBox(page, 'html-node-1');
  80  | 
  81  |     // The South-East resize handle is centered at (x + width, y + height)
  82  |     const handleX = activeBox.x + activeBox.width;
  83  |     const handleY = activeBox.y + activeBox.height;
  84  | 
  85  |     await dragOnCanvas(page, { x: handleX, y: handleY }, { x: handleX + 50, y: handleY + 30 });
  86  | 
  87  |     const boxAfter = await getNodeBox(page, 'html-node-1');
  88  |     expect(boxAfter.width).toBeGreaterThan(activeBox.width + 30);
  89  |     expect(boxAfter.height).toBeGreaterThan(activeBox.height + 15);
  90  |   });
  91  | 
  92  |   test('Copy after drag position sync behavior', async ({ page }) => {
  93  |     // 1. Add node
  94  |     await clickSidebarButton(page, 'Add HTML Node');
  95  | 
  96  |     // 2. Select it
  97  |     const box1 = await getNodeBox(page, 'html-node-1');
  98  |     await page.mouse.click(box1.x + box1.width / 2, box1.y + box1.height / 2);
  99  |     await page.waitForTimeout(100);
  100 | 
  101 |     // 3. Copy via Cmd+C or programmatically dispatching event
  102 |     await page.evaluate(() => {
  103 |       const event = new KeyboardEvent('keydown', {
  104 |         key: 'c',
  105 |         code: 'KeyC',
  106 |         metaKey: true,
  107 |         bubbles: true,
  108 |         cancelable: true
  109 |       });
  110 |       window.dispatchEvent(event);
  111 |     });
  112 |     await page.waitForTimeout(200);
  113 | 
  114 |     // Clear selection so we paste at the root level (absolutely positioned)
  115 |     await page.evaluate(() => {
  116 |       const ws = (window as any).ws;
  117 |       ws.selectedIds.clear();
  118 |       ws.callbacks.onSelectionChange?.(ws.selectedIds);
  119 |       ws.render();
  120 |     });
  121 |     await page.waitForTimeout(100);
  122 | 
  123 |     // 4. Paste via Cmd+V
  124 |     await page.evaluate(() => {
  125 |       const event = new KeyboardEvent('keydown', {
  126 |         key: 'v',
  127 |         code: 'KeyV',
  128 |         metaKey: true,
  129 |         bubbles: true,
  130 |         cancelable: true
  131 |       });
  132 |       window.dispatchEvent(event);
  133 |     });
  134 |     await page.waitForTimeout(300);
  135 | 
  136 |     // Verify pasted node exists
  137 |     const state = await getWorkspaceState(page);
  138 |     const pastedNode = state.nodes.find(n => n.id.includes('pasted-'));
  139 |     expect(pastedNode).toBeDefined();
  140 | 
  141 |     const pastedId = pastedNode!.id;
  142 |     const pastedBox = await getNodeBox(page, pastedId);
  143 | 
  144 |     // 5. Select and drag the pasted node.
  145 |     // We move the mouse to the center of the pasted node and drag it.
  146 |     const startX = pastedBox.x + pastedBox.width / 2;
  147 |     const startY = pastedBox.y + pastedBox.height / 2;
  148 | 
  149 |     await dragOnCanvas(page, { x: startX, y: startY }, { x: startX + 100, y: startY + 100 });
  150 | 
  151 |     // Verify the pasted node moved correctly to the target position
  152 |     const finalBox = await getNodeBox(page, pastedId);
  153 |     expect(Math.abs((finalBox.x - pastedBox.x) - 100)).toBeLessThan(15);
  154 |     expect(Math.abs((finalBox.y - pastedBox.y) - 100)).toBeLessThan(15);
  155 |   });
  156 | 
  157 |   test('Multi-select via marquee', async ({ page }) => {
  158 |     // Add two nodes
  159 |     await clickSidebarButton(page, 'Add HTML Node');
  160 |     await clickSidebarButton(page, 'Add HTML Node');
  161 | 
  162 |     const box1 = await getNodeBox(page, 'html-node-1');
  163 |     const box2 = await getNodeBox(page, 'html-node-2');
  164 | 
  165 |     // We draw a marquee bounding box that spans both nodes.
  166 |     // Start at a coordinate above/left of both nodes and drag to below/right of both.
  167 |     // Making sure coordinates are completely inside the canvas area (x > 320, y > 0)
```