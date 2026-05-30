const { _electron: electron } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

(async () => {
  const appPath = path.resolve(__dirname, '../main.cjs');
  const electronApp = await electron.launch({
    args: [appPath]
  });

  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Load template HTML directly from disk
    const templatePath = path.resolve(__dirname, '../../demo/pressure-test.html');
    const htmlContent = fs.readFileSync(templatePath, 'utf8');

    const result = await window.evaluate(async (html) => {
      const ws = window.ws;
      ws.deselectAll();
      const roots = ws.getNodeTree().getRoots();
      for (const root of roots) {
        ws.removeNode(root.id);
      }

      // Import content directly
      ws.addNode({
        id: 'imported-node-1',
        rawMarkup: html,
        currentRect: { x: 0, y: 0, width: 1200, height: 800 }
      });

      // Register the child hierarchy by selecting sequentially
      // 1. Select imported-node-1 to register child-1 (._card-list)
      ws.selectNode('imported-node-1');
      await new Promise(resolve => requestAnimationFrame(resolve));

      const child1Id = ws.tree.getChildren('imported-node-1')[0].id; // usually imported-node-1__child-1

      // 2. Select child-1 to register the card list children
      ws.selectNode(child1Id);
      await new Promise(resolve => requestAnimationFrame(resolve));

      const cardId = ws.tree.getChildren(child1Id)[0].id; // Card 1

      // 3. Select Card 1 to register its children (heading, tags, etc.)
      ws.selectNode(cardId);
      await new Promise(resolve => requestAnimationFrame(resolve));

      const cardChildren = ws.tree.getChildren(cardId);

      // Find the tag list node (usually has class "_tag-list")
      let tagListId = null;
      for (const child of cardChildren) {
        const root = ws.mount.getContentRoot(child.id);
        if (root && root.classList.contains('_tag-list')) {
          tagListId = child.id;
          break;
        }
      }

      if (!tagListId) {
        return { error: 'Tag list not found' };
      }

      // 4. Select tag list to register the tag elements
      ws.selectNode(tagListId);
      await new Promise(resolve => requestAnimationFrame(resolve));

      const tags = ws.tree.getChildren(tagListId);
      let tagBId = null;
      for (const tag of tags) {
        const root = ws.mount.getContentRoot(tag.id);
        if (root && root.textContent.trim() === 'Tag B') {
          tagBId = tag.id;
          break;
        }
      }

      if (!tagBId) {
        return { error: 'Tag B not found' };
      }

      // Select Tag B
      ws.selectNode(tagBId);
      await new Promise(resolve => requestAnimationFrame(resolve));

      // Query adjusters for tag-b
      const contentRoot = ws.mount.getContentRoot(tagBId);
      const cs = window.getComputedStyle(contentRoot);
      const internalScale = ws.mount.getElementScale(contentRoot);
      const adjusters = ws.computeSpacingAdjusters(tagBId);

      return {
        tagBId,
        internalScale,
        computedFontSize: cs.fontSize,
        computedPaddingTop: cs.paddingTop,
        computedPaddingBottom: cs.paddingBottom,
        computedPaddingLeft: cs.paddingLeft,
        computedPaddingRight: cs.paddingRight,
        computedMarginTop: cs.marginTop,
        computedMarginBottom: cs.marginBottom,
        adjusters,
        nodeRect: ws.tree.get(tagBId).currentRect
      };
    }, htmlContent);

    console.log('Real Zoom Spacing Adjuster Test Result:');
    console.log(JSON.stringify(result, null, 2));

  } catch (err) {
    console.error('Error during inspection:', err);
  } finally {
    await electronApp.close();
    process.exit(0);
  }
})();
