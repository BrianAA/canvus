const { _electron: electron } = require('@playwright/test');
const path = require('path');

(async () => {
  const appPath = path.resolve(__dirname, '../main.cjs');
  const electronApp = await electron.launch({
    args: [appPath]
  });

  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Run programmatic test inside the browser context
    const result = await window.evaluate(async () => {
      const ws = window.ws;
      ws.deselectAll();
      const roots = ws.getNodeTree().getRoots();
      for (const root of roots) {
        ws.removeNode(root.id);
      }

      // Add node with zoom
      ws.addNode({
        id: 'zoom-parent',
        rawMarkup: `
          <div id="parent-card" style="zoom: 0.75; padding: 20px; background: #fff; border: 4px solid black;">
            <div id="tag-b" style="padding: 10px; margin: 15px; background: #eee;">Tag B</div>
          </div>
        `,
        currentRect: { x: 50, y: 50, width: 300, height: 200 }
      });

      // Select parent to register children
      ws.selectNode('zoom-parent');
      await new Promise(resolve => requestAnimationFrame(resolve));

      const nodesBefore = ws.getNodes().map(n => n.id);

      // Select whatever is registered
      const children = ws.tree.getChildren('zoom-parent').map(n => n.id);
      if (children.length > 0) {
        ws.selectNode(children[0]);
        await new Promise(resolve => requestAnimationFrame(resolve));
      }

      const nodesAfter = ws.getNodes().map(n => n.id);

      // Now query target
      const targetId = children[0] || 'zoom-parent';
      const contentRoot = ws.mount.getContentRoot(targetId);
      const cs = window.getComputedStyle(contentRoot);
      const internalScale = ws.mount.getElementScale(contentRoot);
      const adjusters = ws.computeSpacingAdjusters(targetId);

      return {
        nodesBefore,
        nodesAfter,
        targetId,
        internalScale,
        computedPaddingTop: cs.paddingTop,
        computedMarginTop: cs.marginTop,
        adjusters,
        nodeRect: ws.tree.get(targetId).currentRect
      };
    });

    console.log('Programmatic Zoom Spacing Adjuster Test Result:');
    console.log(JSON.stringify(result, null, 2));

  } catch (err) {
    console.error('Error during inspection:', err);
  } finally {
    await electronApp.close();
    process.exit(0);
  }
})();
