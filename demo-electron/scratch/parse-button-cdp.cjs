const fs = require('fs');

const data = JSON.parse(fs.readFileSync('/Users/balfaro01/.gemini/antigravity-ide/brain/fa6fbd3b-56b7-45f2-ba3f-2dbdd1a45bfb/scratch/button-matched-styles.json', 'utf8'));

console.log('--- MATCHED RULES FOR BUTTON ---');
if (data.matchedCSSRules) {
  data.matchedCSSRules.forEach((entry, i) => {
    const selectors = entry.rule.selectorList.selectors.map(s => s.text).join(', ');
    const cssText = entry.rule.style.cssText || '';
    console.log(`[Rule ${i}] Selectors: "${selectors}"`);
    console.log(`Origin: ${entry.rule.origin}`);
    if (entry.rule.layers && entry.rule.layers.length > 0) {
      console.log(`Layers: ${entry.rule.layers.map(l => l.text).join(' > ')}`);
    }
    console.log(`CSS Text: ${cssText.substring(0, 150).replace(/\n/g, ' ')}...`);
    console.log('------------------------------');
  });
} else {
  console.log('No matched CSS rules.');
}

console.log('\n--- PSEUDO ELEMENTS ---');
if (data.pseudoElements) {
  data.pseudoElements.forEach((pe, i) => {
    console.log(`[Pseudo ${i}] Type: ${pe.pseudoType}`);
    pe.matches.forEach((entry, j) => {
      const selectors = entry.rule.selectorList.selectors.map(s => s.text).join(', ');
      const cssText = entry.rule.style.cssText || '';
      console.log(`  [Rule ${j}] Selectors: "${selectors}"`);
      console.log(`  CSS Text: ${cssText.substring(0, 150).replace(/\n/g, ' ')}...`);
    });
    console.log('------------------------------');
  });
} else {
  console.log('No pseudo elements matched.');
}
