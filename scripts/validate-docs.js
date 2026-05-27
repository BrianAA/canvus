#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let hasErrors = false;

function logError(message) {
  console.error(`\x1b[31m[ERROR]\x1b[0m ${message}`);
  hasErrors = true;
}

function logSuccess(message) {
  console.log(`\x1b[32m[OK]\x1b[0m ${message}`);
}

// ── 1. Validate File Links ───────────────────────────────────────
console.log('--- Validating Markdown File Links ---');

const mdFiles = [
  path.join(rootDir, 'README.md'),
  path.join(rootDir, 'docs', 'README.md'),
  path.join(rootDir, 'docs', 'architecture.md'),
  path.join(rootDir, 'docs', 'operations.md'),
  path.join(rootDir, 'docs', 'custom-editor-integration.md'),
  path.join(rootDir, 'docs', 'layout-system.md'),
  path.join(rootDir, 'docs', 'api.md'),
];

// Regex to capture markdown links, e.g., [text](file://...) or [text](path)
// Excludes external web links (http/https/img.shields.io)
const linkRegex = /\[[^\]]+\]\(([^)#]+)(?:#[^)]*)?\)/g;

for (const file of mdFiles) {
  if (!fs.existsSync(file)) {
    logError(`Markdown file does not exist: ${file}`);
    continue;
  }

  const content = fs.readFileSync(file, 'utf8');
  let match;
  let linksChecked = 0;

  while ((match = linkRegex.exec(content)) !== null) {
    const rawLink = match[1];
    
    // Skip remote HTTP/HTTPS links
    if (rawLink.startsWith('http://') || rawLink.startsWith('https://')) {
      continue;
    }

    linksChecked++;
    let targetPath = '';

    if (rawLink.startsWith('file:///')) {
      // Decode absolute file:// URI
      const normalizedLink = rawLink.replace('file:///', '/');
      targetPath = path.normalize(decodeURIComponent(normalizedLink));
    } else {
      // Resolve relative path against the source file's directory
      targetPath = path.resolve(path.dirname(file), rawLink);
    }

    if (!fs.existsSync(targetPath)) {
      logError(`Broken link in ${path.basename(file)}: "${rawLink}" (Resolved: ${targetPath})`);
    }
  }

  logSuccess(`Checked ${linksChecked} links in ${path.basename(file)}`);
}

// ── 2. Validate ADRs are Indexed ─────────────────────────────────
console.log('\n--- Validating ADR Index ---');

const adrDir = path.join(rootDir, 'docs', 'adr');
const docsReadmePath = path.join(rootDir, 'docs', 'README.md');

if (fs.existsSync(adrDir) && fs.existsSync(docsReadmePath)) {
  const adrFiles = fs.readdirSync(adrDir).filter(f => f.endsWith('.md'));
  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf8');

  for (const adr of adrFiles) {
    // Check if the filename is referenced in docs/README.md
    if (!docsReadmeContent.includes(adr)) {
      logError(`ADR "${adr}" is not linked in docs/README.md`);
    } else {
      logSuccess(`ADR "${adr}" is indexed`);
    }
  }
} else {
  logError('ADR directory or docs/README.md missing');
}

// ── 3. Validate API Document Completeness ────────────────────────
console.log('\n--- Checking API Documentation Coverage ---');

const indexPath = path.join(rootDir, 'src', 'index.ts');
const apiDocPath = path.join(rootDir, 'docs', 'api.md');

if (fs.existsSync(indexPath) && fs.existsSync(apiDocPath)) {
  const indexContent = fs.readFileSync(indexPath, 'utf8');
  const apiDocContent = fs.readFileSync(apiDocPath, 'utf8');

  // Extract all exported members from src/index.ts
  const exports = [];
  const lines = indexContent.split('\n');
  let inExportBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('export type {') || trimmed.startsWith('export {')) {
      inExportBlock = true;
      // Check if it's a single line export, e.g. export { Foo } from ...
      if (trimmed.includes('}') && trimmed.includes('from')) {
        const match = trimmed.match(/export\s+(?:type\s+)?\{\s*([^}]+)\s*\}/);
        if (match && match[1]) {
          const names = match[1].split(',').map(n => n.trim()).filter(Boolean);
          exports.push(...names);
        }
        inExportBlock = false;
      }
      continue;
    }

    if (inExportBlock) {
      if (trimmed.startsWith('}')) {
        inExportBlock = false;
      } else {
        // Strip comma, comments, and whitespace
        const name = trimmed.replace(/,/g, '').replace(/\/\/.*$/, '').trim();
        if (name && !name.startsWith('from')) {
          exports.push(name);
        }
      }
    }
  }

  // Check if each exported API member is documented in docs/api.md
  let missingCount = 0;
  for (const exp of exports) {
    if (!apiDocContent.includes(exp)) {
      logError(`Exported API member "${exp}" is missing from docs/api.md`);
      missingCount++;
    }
  }

  if (missingCount === 0) {
    logSuccess(`All ${exports.length} exported members from index.ts are documented in api.md`);
  } else {
    logError(`${missingCount} exported members are undocumented.`);
  }
} else {
  logError('src/index.ts or docs/api.md missing');
}

// ── 4. Final Exit Code ───────────────────────────────────────────
console.log('\n--------------------------------------');
if (hasErrors) {
  console.log('\x1b[31mDocumentation validation FAILED.\x1b[0m');
  process.exit(1);
} else {
  console.log('\x1b[32mDocumentation validation PASSED successfully.\x1b[0m');
  process.exit(0);
}
