import React, { useState, useEffect } from 'react';

const CopyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.346.102.637.318.806.622.196.355.258.775.258 1.238v11.112c0 .5-.064.92-.26 1.272a1.875 1.875 0 0 1-.806.622m-7.332 0a1.875 1.875 0 0 1-.806-.622C5.69 18.098 5.625 17.68 5.625 17.18V6.068c0-.463.062-.883.258-1.238a1.875 1.875 0 0 1 .806-.622M10.5 12h3m-3 3h3m-3-6h3" />
  </svg>
);

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);

export default function CopyMarkdownButton() {
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const handleCopy = async () => {
    try {
      const article = document.querySelector('article');
      if (!article) {
        alert('Could not find article content on this page.');
        return;
      }

      // 1. Get metadata
      const pageTitle = document.querySelector('h1')?.textContent?.trim() || document.title || 'Documentation';
      const sourceUrl = window.location.href;

      // 2. Convert DOM to Markdown
      const markdownContent = htmlToMarkdown(article);

      // 3. Construct the full payload
      const finalPayload = `> **Source**: ${sourceUrl}\n> **Title**: ${pageTitle}\n\n---\n\n${markdownContent}\n`;

      // 4. Copy to Clipboard
      await navigator.clipboard.writeText(finalPayload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy markdown: ', err);
    }
  };

  return (
    <button 
      className={`copy-markdown-btn ${copied ? 'copied' : ''}`}
      onClick={handleCopy}
      title="Copy page as Markdown for AI context"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      <span>{copied ? 'Copied Markdown!' : 'Copy Page for AI'}</span>
    </button>
  );
}

function resolveUrl(urlStr) {
  if (!urlStr) return '';
  if (urlStr.startsWith('http') || urlStr.startsWith('mailto') || urlStr.startsWith('data:') || urlStr.startsWith('#')) {
    return urlStr;
  }
  try {
    return new URL(urlStr, window.location.href).href;
  } catch (e) {
    return urlStr;
  }
}

function processNode(node, context = {}) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const tagName = node.tagName.toLowerCase();

  // Ignore specific Nextra UI elements
  if (
    node.classList.contains('nextra-copy-button') ||
    node.classList.contains('sr-only') ||
    node.classList.contains('nx-sr-only') ||
    tagName === 'button' ||
    tagName === 'style' ||
    tagName === 'script' ||
    tagName === 'noscript'
  ) {
    return '';
  }

  // Ignore header anchor links
  if (tagName === 'a' && (node.getAttribute('href')?.startsWith('#') && node.textContent.trim() === '#')) {
    return '';
  }
  if (tagName === 'a' && node.classList.contains('nx-absolute') && node.getAttribute('href')?.startsWith('#')) {
    return '';
  }

  // Handle table directly to keep format aligned
  if (tagName === 'table') {
    const rows = Array.from(node.querySelectorAll('tr'));
    if (rows.length === 0) return '';
    
    let tableMd = '\n\n';
    rows.forEach((row, rowIndex) => {
      const cells = Array.from(row.querySelectorAll('th, td'));
      const cellTexts = cells.map(cell => {
        let cellText = '';
        cell.childNodes.forEach(child => {
          cellText += processNode(child, { ...context, parentTag: cell.tagName.toLowerCase() });
        });
        return cellText.trim().replace(/\n/g, ' ').replace(/\|/g, '\\|');
      });
      
      tableMd += `| ${cellTexts.join(' | ')} |\n`;
      
      // If it's a header row, add divider
      const isHeaderRow = row.querySelector('th') !== null || rowIndex === 0;
      if (isHeaderRow) {
        const separators = cellTexts.map(() => '---');
        tableMd += `| ${separators.join(' | ')} |\n`;
      }
    });
    return tableMd + '\n';
  }

  // Handle code blocks (pre)
  if (tagName === 'pre') {
    const codeEl = node.querySelector('code');
    const langClass = codeEl ? Array.from(codeEl.classList).find(c => c.startsWith('language-')) : '';
    const lang = langClass ? langClass.replace('language-', '') : '';
    
    let codeText = '';
    if (codeEl) {
      codeText = codeEl.textContent || '';
    } else {
      codeText = node.textContent || '';
    }
    
    // Trim final newline
    codeText = codeText.replace(/\n$/, '');
    return `\n\n\`\`\`${lang}\n${codeText}\n\`\`\`\n\n`;
  }

  // Handle inline code
  if (tagName === 'code') {
    return `\`${node.textContent}\``;
  }

  // Handle Nextra Callout boxes as blockquotes
  const isCallout = node.classList.contains('nextra-callout') || node.classList.contains('nx-border-l-4');

  // Process children
  let childrenContent = '';
  const childNodes = Array.from(node.childNodes);
  
  let nextDepth = context.listDepth || 0;
  if (tagName === 'ul' || tagName === 'ol') {
    nextDepth = (context.listDepth || 0) + (context.parentTag === 'li' ? 1 : 0);
  }

  for (const child of childNodes) {
    childrenContent += processNode(child, { 
      ...context, 
      parentTag: tagName,
      listDepth: nextDepth
    });
  }

  if (isCallout) {
    return `\n\n> ${childrenContent.trim().split('\n').map(line => line.trim()).filter(Boolean).join('\n> ')}\n\n`;
  }

  switch (tagName) {
    case 'h1':
      return `\n\n# ${childrenContent.trim()}\n\n`;
    case 'h2':
      return `\n\n## ${childrenContent.trim()}\n\n`;
    case 'h3':
      return `\n\n### ${childrenContent.trim()}\n\n`;
    case 'h4':
      return `\n\n#### ${childrenContent.trim()}\n\n`;
    case 'h5':
      return `\n\n##### ${childrenContent.trim()}\n\n`;
    case 'h6':
      return `\n\n###### ${childrenContent.trim()}\n\n`;
    case 'p':
      return `\n\n${childrenContent.trim()}\n\n`;
    case 'strong':
    case 'b':
      return `**${childrenContent}**`;
    case 'em':
    case 'i':
      return `*${childrenContent}*`;
    case 'a':
      const href = node.getAttribute('href');
      return `[${childrenContent}](${resolveUrl(href)})`;
    case 'li': {
      const indent = '  '.repeat(context.listDepth || 0);
      const prefix = context.parentTag === 'ol' ? '1. ' : '- ';
      return `\n${indent}${prefix}${childrenContent.trim()}`;
    }
    case 'ul':
    case 'ol':
      return `\n${childrenContent}\n`;
    case 'img':
      const alt = node.getAttribute('alt') || 'image';
      const src = node.getAttribute('src') || '';
      return `\n\n![${alt}](${resolveUrl(src)})\n\n`;
    case 'blockquote':
      return `\n\n> ${childrenContent.trim().split('\n').join('\n> ')}\n\n`;
    default:
      return childrenContent;
  }
}

function htmlToMarkdown(element) {
  if (!element) return '';
  return processNode(element).replace(/\n{3,}/g, '\n\n').trim();
}
