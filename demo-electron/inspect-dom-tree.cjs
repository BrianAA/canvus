const { _electron: electron } = require('@playwright/test');
const path = require('path');
const { spawn } = require('child_process');

(async () => {
  const devServer = spawn('npm', ['run', 'dev'], {
    cwd: path.resolve(__dirname),
    shell: true
  });

  await new Promise(resolve => setTimeout(resolve, 3000));

  const appPath = path.resolve(__dirname, 'main.cjs');
  const electronApp = await electron.launch({
    args: [appPath]
  });

  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await window.selectOption('#sel-template', 'pressure-test');
    await new Promise(resolve => setTimeout(resolve, 2000));

    const result = await window.evaluate(() => {
      const host = document.querySelector('[data-canvus-shadow-host]');
      if (!host) return 'Shadow host not found';
      const shadow = host.shadowRoot;
      if (!shadow) return 'Shadow root not found';

      const formatNode = (node, depth = 0) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent.trim();
          return text ? '  '.repeat(depth) + `"#text: ${text}"\n` : '';
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return '';

        let name = node.tagName.toLowerCase();
        if (node.id) name += `#${node.id}`;
        if (node.className) name += `.${node.className.split(/\s+/).join('.')}`;
        
        const computed = window.getComputedStyle(node);
        name += ` [display: ${computed.display}, pos: ${computed.position}, w: ${computed.width}, h: ${computed.height}]`;

        let result = '  '.repeat(depth) + `<${name}>\n`;
        for (const child of node.childNodes) {
          result += formatNode(child, depth + 1);
        }
        return result;
      };

      const cardWrapper = shadow.querySelector('.canvus-node-wrapper[data-canvus-id="imported-node-13"]');
      if (!cardWrapper) return 'Card wrapper not found';
      return formatNode(cardWrapper);
    });

    console.log('DOM Tree Structure:\n', result);

  } catch (err) {
    console.error(err);
  } finally {
    await electronApp.close();
    devServer.kill('SIGINT');
    process.exit(0);
  }
})();
