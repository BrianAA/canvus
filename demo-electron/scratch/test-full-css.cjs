const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.error('BROWSER ERROR:', err.message));

  // Read pressure-test.html
  const htmlPath = '/Users/balfaro01/Documents/GitHub/canvus/demo/pressure-test.html';
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  // Extract style tag content
  const styleMatch = htmlContent.match(/<style>([\s\S]*?)<\/style>/);
  const rawCSS = styleMatch ? styleMatch[1] : '';

  // Extract HTML body content (everything outside the style tag)
  let cleanHTML = htmlContent.replace(/<style>[\s\S]*?<\/style>/, '');

  // Escape backticks and dollar signs for safe interpolation
  const escapedCSS = rawCSS.replace(/`/g, '\\`').replace(/\$/g, '\\$');
  const escapedHTML = cleanHTML.replace(/`/g, '\\`').replace(/\$/g, '\\$');

  await page.setContent(`
    <div id="host"></div>
    <script>
      try {
        const host = document.getElementById('host');
        const shadow = host.attachShadow({ mode: 'open' });
        
        // Let's create the default wrapper styles
        const defaultStyles = document.createElement('style');
        defaultStyles.textContent = \`
          :host {
            all: initial;
            display: block;
            position: absolute;
            top: 0; left: 0; width: 0; height: 0;
            overflow: visible;
            transform-origin: 0 0;
            pointer-events: none;
          }
          .canvus-node-wrapper {
            position: absolute;
            pointer-events: auto;
            transform-origin: 0 0;
            overflow: visible;
            display: flex;
            flex-direction: column;
            user-select: none;
          }
          .canvus-node-wrapper.canvus-flow-child {
            display: contents;
          }
          .canvus-node-wrapper > * {
            flex: 1 0 auto;
            min-width: 0; min-height: 0;
          }
          .canvus-node-wrapper * {
            box-sizing: border-box;
          }
        \`;
        shadow.appendChild(defaultStyles);

        // Injected user CSS
        const userStyle = document.createElement('style');
        userStyle.textContent = \`${escapedCSS}\`;
        shadow.appendChild(userStyle);

        // Now we rewrite the selectors in userStyle sheet
        const rewriteSelectorText = (selector) => {
          return selector
            .split(",")
            .map(sel => {
              const trimmed = sel.trim();
              if (!trimmed.includes(">")) return sel;
              const parts = [];
              let currentPart = "";
              let depth = 0;
              for (let i = 0; i < trimmed.length; i++) {
                const char = trimmed[i];
                if (char === "(") {
                  depth++;
                  currentPart += char;
                } else if (char === ")") {
                  depth--;
                  currentPart += char;
                } else if (char === ">" && depth === 0) {
                  parts.push(currentPart.trim());
                  currentPart = "";
                } else {
                  currentPart += char;
                }
              }
              parts.push(currentPart.trim());
              if (parts.length === 0 || !parts[0]) return sel;

              let combinations = [[parts[0]]];
              for (let i = 1; i < parts.length; i++) {
                const nextPart = parts[i];
                const newCombinations = [];
                for (const combo of combinations) {
                  newCombinations.push([...combo, nextPart]);
                  newCombinations.push([...combo, ".canvus-node-wrapper", nextPart]);
                }
                combinations = newCombinations;
              }
              return combinations.map(combo => combo.join(" > ")).join(", ");
            })
            .join(", ");
        };

        const rewriteRules = (rules) => {
          for (let i = 0; i < rules.length; i++) {
            const rule = rules[i];
            if (rule.selectorText && rule.selectorText.includes('>')) {
              rule.selectorText = rewriteSelectorText(rule.selectorText);
            }
            if (rule.cssRules) {
              rewriteRules(rule.cssRules);
            }
          }
        };
        
        rewriteRules(userStyle.sheet.cssRules);

        // Append HTML body using the same wrappers as the app
        const container = document.createElement('div');
        container.innerHTML = \`${escapedHTML}\`;
        
        // Let's manually wrap elements to match the app structure
        const nodeSelector = 'div,section,header,footer,main,aside,nav,article,p,h1,h2,h3,h4,h5,h6,img,button,a,form,input,textarea,select,ul,ol,li,table,tr,td,th';
        const body = container;
        
        const wrapNodes = (el, isRoot = true) => {
          const children = Array.from(el.children);
          for (const child of children) {
            wrapNodes(child, false);
          }
          if (el.matches(nodeSelector) && el.tagName.toLowerCase() !== 'script' && el.tagName.toLowerCase() !== 'style') {
            const wrapper = document.createElement('div');
            wrapper.className = 'canvus-node-wrapper';
            if (!isRoot) {
              wrapper.classList.add('canvus-flow-child');
            }
            if (el.parentNode) {
              el.parentNode.replaceChild(wrapper, el);
              wrapper.appendChild(el);
            }
          }
        };

        const rootChildren = Array.from(body.children);
        for (const child of rootChildren) {
          wrapNodes(child, true);
        }

        while (body.firstChild) {
          shadow.appendChild(body.firstChild);
        }

        // Simulate the addChildNode grid style synchronization
        const wrappers = shadow.querySelectorAll('.canvus-node-wrapper');
        for (const wrapper of Array.from(wrappers)) {
          const contentRoot = wrapper.firstElementChild;
          if (contentRoot) {
            const cs = window.getComputedStyle(contentRoot);
            const gridProps = [
              "grid-column-start",
              "grid-column-end",
              "grid-row-start",
              "grid-row-end",
              "grid-area",
              "grid-column",
              "grid-row",
            ];
            for (const prop of gridProps) {
              const val = cs.getPropertyValue(prop);
              if (val && val !== "auto" && val !== "normal" && val !== "none") {
                wrapper.style.setProperty(prop, val);
              }
            }
          }
        }

      } catch(e) {
        console.error('JS error in shadow setup:', e.stack);
      }
    </script>
  `);

  // Wait for remote styles if any
  await page.waitForTimeout(2000);

  try {
    const result = await page.evaluate(() => {
      const host = document.getElementById('host');
      const shadow = host.shadowRoot;
      const card = shadow.querySelector('._card');
      if (!card) return { error: 'Card not found in evaluation' };
      const computed = window.getComputedStyle(card);
      const cardList = shadow.querySelector('._card-list');
      const computedList = window.getComputedStyle(cardList);
      
      return {
        cardBg: computed.backgroundColor,
        cardGridRow: computed.gridRow,
        cardListGridRows: computedList.gridTemplateRows,
        cardHeight: computed.height
      };
    });

    console.log('Result with style sync:', JSON.stringify(result, null, 2));
  } catch (evalErr) {
    console.error('Eval error:', evalErr.message);
  }
  
  await browser.close();
})();
