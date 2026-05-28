const { chromium } = require('@playwright/test');

function rewriteSelectorText(selector) {
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
        if (nextPart === undefined) continue;
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
}

function rewriteCSS(css) {
  let result = "";
  let currentStatement = "";
  let inString = null;
  let inComment = false;
  let parenDepth = 0;

  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    const nextChar = css[i + 1];

    if (inComment) {
      currentStatement += char;
      if (char === "*" && nextChar === "/") {
        inComment = false;
        currentStatement += "/";
        i++;
      }
      continue;
    }

    if (inString) {
      currentStatement += char;
      if (char === inString && css[i - 1] !== "\\") {
        inString = null;
      }
      continue;
    }

    if (char === "/" && nextChar === "*") {
      inComment = true;
      currentStatement += "/*";
      i++;
      continue;
    }

    if (char === '"' || char === "'") {
      inString = char;
      currentStatement += char;
      continue;
    }

    if (char === "(") {
      parenDepth++;
      currentStatement += char;
      continue;
    }

    if (char === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      currentStatement += char;
      continue;
    }

    if (parenDepth > 0) {
      currentStatement += char;
      continue;
    }

    if (char === "{") {
      const trimmed = currentStatement.trim();
      if (trimmed.startsWith("@")) {
        result += currentStatement + "{";
      } else {
        result += rewriteSelectorText(currentStatement) + "{";
      }
      currentStatement = "";
      continue;
    }

    if (char === ";") {
      result += currentStatement + ";";
      currentStatement = "";
      continue;
    }

    if (char === "}") {
      const trimmed = currentStatement.trim();
      if (trimmed) {
        result += currentStatement;
      }
      result += "}";
      currentStatement = "";
      continue;
    }

    currentStatement += char;
  }

  result += currentStatement;
  return result;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const originalCSS = `
  @scope (.scope.product-cards) to (.scope) {
    :scope {
      container: --scope / inline-size;
    }

    ._card-list {
      & > * {
        grid-row: span 5;
      }
    }
  }

  @scope (.purchase-button) {
    :scope {
      display: flex;
      &::before {
        content: "CART";
        mask-image: url('data:image/svg+xml;utf8,<svg></svg>');
      }
    }
  }
  `;

  const rewrittenCSS = rewriteCSS(originalCSS);

  // We write the HTML with backticks escaped for the browser, but we let Node interpolate rewrittenCSS
  await page.setContent(`
    <div id="host"></div>
    <script>
      const host = document.getElementById('host');
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = \`
        <style>
          ${rewrittenCSS}
        </style>
        <div class="canvus-node-wrapper" data-canvus-id="imported-node-57">
          <div class="scope product-cards" id="imported-node-57">
            <div class="canvus-node-wrapper canvus-flow-child" data-canvus-id="imported-node-56">
              <div class="_card-list" id="imported-node-56">
                <div class="canvus-node-wrapper canvus-flow-child" data-canvus-id="imported-node-13">
                  <section class="_card" id="imported-node-13">
                    Card Content
                    <a href="#" class="scope purchase-button">Add to cart</a>
                  </section>
                </div>
              </div>
            </div>
          </div>
        </div>
      \n\`;
    </script>
  `);

  // Wait for shadow root content to exist
  await page.waitForFunction(() => {
    const host = document.getElementById('host');
    if (!host || !host.shadowRoot) return false;
    return host.shadowRoot.querySelector('._card') !== null && host.shadowRoot.querySelector('.purchase-button') !== null;
  }, null, { timeout: 5000 });

  const result = await page.evaluate(() => {
    const host = document.getElementById('host');
    const shadow = host.shadowRoot;
    const card = shadow.querySelector('._card');
    const computedCard = window.getComputedStyle(card);
    const button = shadow.querySelector('.purchase-button');
    const computedBefore = window.getComputedStyle(button, '::before');

    return {
      cardGridRow: computedCard.gridRow,
      buttonBeforeContent: computedBefore.content
    };
  });

  console.log('Result of pre-rewritten CSS injection:', JSON.stringify(result, null, 2));
  await browser.close();
})();
