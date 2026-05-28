const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.setContent(`
    <div id="host"></div>
    <script>
      const host = document.getElementById('host');
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = \`
        <style>
          @layer reset, base, composition, features, utilities;

          @layer features {
            @scope (.scope.product-cards) to (.scope) {
              :scope {
                container: --scope / inline-size;
              }

              ._card-list {
                & > *, & > .canvus-node-wrapper > * {
                  grid-row: span 5;
                  background-color: rgb(0, 255, 0);
                }
              }

              ._card {
                display: grid;
                grid-template-rows: subgrid;
              }
            }
          }
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
      \`;
    </script>
  `);

  const result = await page.evaluate(() => {
    const host = document.getElementById('host');
    const shadow = host.shadowRoot;
    const card = shadow.querySelector('._card');
    const computed = window.getComputedStyle(card);
    
    return {
      cardBg: computed.backgroundColor,
      cardGridRow: computed.gridRow
    };
  });

  console.log('Result:', JSON.stringify(result, null, 2));
  await browser.close();
})();
