import type { Workspace } from '../../dist/index.js';

export interface ImportHTMLOptions {
  baseUrl?: string;
  clearWorkspace?: boolean;
  defaultPageWidth?: number;
}

function resolveUrl(url: string, baseUrl?: string): string {
  if (!baseUrl) return url;
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}

function resolveCSSUrls(cssText: string, baseUrl?: string): string {
  if (!baseUrl) return cssText;
  return cssText.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g, (match, urlPath) => {
    if (
      urlPath.startsWith("data:") ||
      urlPath.startsWith("http:") ||
      urlPath.startsWith("https:") ||
      urlPath.startsWith("//")
    ) {
      return match;
    }
    const resolved = resolveUrl(urlPath, baseUrl);
    return `url("${resolved}")`;
  });
}

function resolveCSSImports(cssText: string, baseUrl?: string): string {
  if (!baseUrl) return cssText;
  return cssText.replace(/@import\s+['"]([^'"]+)['"]/g, (match, importPath) => {
    if (
      importPath.startsWith("data:") ||
      importPath.startsWith("http:") ||
      importPath.startsWith("https:") ||
      importPath.startsWith("//")
    ) {
      return match;
    }
    const resolved = resolveUrl(importPath, baseUrl);
    return `@import "${resolved}"`;
  });
}

function resolveSrcSet(srcset: string, baseUrl?: string): string {
  if (!baseUrl) return srcset;
  return srcset
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      const spaceIndex = trimmed.indexOf(" ");
      if (spaceIndex === -1) {
        return resolveUrl(trimmed, baseUrl);
      }
      const url = trimmed.slice(0, spaceIndex);
      const descriptor = trimmed.slice(spaceIndex);
      return `${resolveUrl(url, baseUrl)}${descriptor}`;
    })
    .join(", ");
}

function resolveRelativeAttributes(element: HTMLElement, baseUrl?: string): void {
  if (!baseUrl) return;

  if (element.hasAttribute("src")) {
    const src = element.getAttribute("src") || "";
    element.setAttribute("src", resolveUrl(src, baseUrl));
  }
  const elementsWithSrc = element.querySelectorAll("[src]");
  for (const el of Array.from(elementsWithSrc)) {
    const src = el.getAttribute("src") || "";
    el.setAttribute("src", resolveUrl(src, baseUrl));
  }

  if (element.hasAttribute("srcset")) {
    const srcset = element.getAttribute("srcset") || "";
    element.setAttribute("srcset", resolveSrcSet(srcset, baseUrl));
  }
  const elementsWithSrcset = element.querySelectorAll("[srcset]");
  for (const el of Array.from(elementsWithSrcset)) {
    const srcset = el.getAttribute("srcset") || "";
    el.setAttribute("srcset", resolveSrcSet(srcset, baseUrl));
  }

  if (element.hasAttribute("href")) {
    const href = element.getAttribute("href") || "";
    if (!href.startsWith("#") && !href.startsWith("mailto:") && !href.startsWith("tel:") && !href.startsWith("javascript:")) {
      element.setAttribute("href", resolveUrl(href, baseUrl));
    }
  }
  const elementsWithHref = element.querySelectorAll("[href]");
  for (const el of Array.from(elementsWithHref)) {
    const href = el.getAttribute("href") || "";
    if (!href.startsWith("#") && !href.startsWith("mailto:") && !href.startsWith("tel:") && !href.startsWith("javascript:")) {
      el.setAttribute("href", resolveUrl(href, baseUrl));
    }
  }

  if (element.hasAttribute("style")) {
    const style = element.getAttribute("style") || "";
    element.setAttribute("style", resolveCSSImports(resolveCSSUrls(style, baseUrl), baseUrl));
  }
  const elementsWithStyle = element.querySelectorAll("[style]");
  for (const el of Array.from(elementsWithStyle)) {
    const style = el.getAttribute("style") || "";
    el.setAttribute("style", resolveCSSImports(resolveCSSUrls(style, baseUrl), baseUrl));
  }
}

export interface ImportResultLog {
  filePath?: string;
  styleTagsCount: number;
  externalStylesheets: { url: string; status: "injected" | "link-fallback" | "failed" }[];
  scriptsExecuted: { src?: string; codeLength: number; status: "scoped-executed" }[];
}

/**
 * Imports an HTML document into a Canvus workspace.
 *
 * Philosophy: "Let the browser handle it."
 * - CSS is injected AS-IS with zero processing (no @property extraction,
 *   no @scope desugaring, no selector rewriting).
 * - The SDK's `injectCSS` only does the minimal `:root`/`body`/`html` → `:host`
 *   rewrite needed for Shadow DOM base styles.
 * - Each top-level HTML block is ONE root node on the canvas.
 * - Children are never registered as separate workspace nodes — the browser
 *   handles all internal layout, selectors, and rendering natively.
 */
export async function importHTMLDocument(
  workspace: Workspace,
  htmlString: string,
  options: ImportHTMLOptions = {},
): Promise<ImportResultLog> {
  let baseUrl = options.baseUrl;
  if (baseUrl && !baseUrl.startsWith("http://") && !baseUrl.startsWith("https://") && !baseUrl.startsWith("file://")) {
    baseUrl = "file://" + (baseUrl.startsWith("/") ? "" : "/") + baseUrl.replace(/\\/g, "/");
  }

  const externalStylesheetsLog: ImportResultLog["externalStylesheets"] = [];
  const scriptsLog: ImportResultLog["scriptsExecuted"] = [];
  let styleTagsCount = 0;

  // Clean up any leftover extracted properties from the old importer
  const oldExtracted = document.querySelectorAll("style[data-canvus-extracted-properties]");
  for (const el of Array.from(oldExtracted)) {
    el.remove();
  }

  // 1. Clear Workspace if requested
  if (options.clearWorkspace !== false) {
    workspace.deselectAll();
    const roots = workspace.getNodeTree().getRoots();
    for (const root of roots) {
      workspace.removeNode(root.id);
    }
  }

  // 2. Parse HTML string
  const parser = new DOMParser();
  const parsedDoc = parser.parseFromString(htmlString, "text/html");

  // 3. Extract and Inject Stylesheets
  //    CSS goes straight to the shadow DOM untouched, EXCEPT for @property rules.
  //    @property doesn't work inside Shadow DOM <style> elements (Chromium limitation) —
  //    we extract them to document.head so they register globally and cascade in.
  const styleTags = parsedDoc.querySelectorAll("style");
  const globalProperties: string[] = [];

  for (const style of Array.from(styleTags)) {
    let rawCSS = style.textContent || "";

    // Extract @property rules → move to document.head with inherits: true
    const propertyMatches = rawCSS.match(/@property\s+[^\{]+\{[^\}]*\}/g);
    if (propertyMatches) {
      const fixed = propertyMatches.map(m => m.replace(/inherits:\s*false/g, "inherits: true"));
      globalProperties.push(...fixed);
      rawCSS = rawCSS.replace(/@property\s+[^\{]+\{[^\}]*\}/g, "");
    }

    // Only resolve relative URLs — no other CSS transforms
    const resolvedCSS = resolveCSSImports(resolveCSSUrls(rawCSS, baseUrl), baseUrl);

    if (resolvedCSS) {
      workspace.injectCSS(resolvedCSS);
      styleTagsCount++;
    }
    style.remove();
  }

  // Register @property rules globally so they work inside Shadow DOM
  if (globalProperties.length > 0) {
    const propStyle = document.createElement("style");
    propStyle.setAttribute("data-canvus-extracted-properties", "");
    propStyle.textContent = globalProperties.join("\n");
    document.head.appendChild(propStyle);
  }

  const linkStylesheets = parsedDoc.querySelectorAll("link[rel='stylesheet']");
  for (const link of Array.from(linkStylesheets)) {
    const href = link.getAttribute("href") || "";
    const resolvedHref = resolveUrl(href, baseUrl);

    try {
      await workspace.injectCSSLink(resolvedHref);
      externalStylesheetsLog.push({ url: href, status: "injected" });
    } catch (linkErr) {
      console.error(`[importer] Failed to inject stylesheet link ${resolvedHref}:`, linkErr);
      externalStylesheetsLog.push({ url: href, status: "failed" });
    }
  }

  // 4. Extract and inject head-level scripts
  const headScripts = parsedDoc.head ? parsedDoc.head.querySelectorAll("script") : [];
  const shadowRoot = workspace.getShadowMount().getShadowRoot();
  for (const script of Array.from(headScripts)) {
    const src = script.getAttribute("src");
    if (src) {
      const resolvedSrc = resolveUrl(src, baseUrl);
      const newScript = document.createElement("script");
      for (const attr of Array.from(script.attributes)) {
        newScript.setAttribute(attr.name, attr.value);
      }
      newScript.setAttribute("src", resolvedSrc);
      shadowRoot.appendChild(newScript);
      scriptsLog.push({ src: src, codeLength: 0, status: "scoped-executed" });
    } else {
      const code = script.textContent || "";
      const newScript = document.createElement("script");
      newScript.textContent = code;
      shadowRoot.appendChild(newScript);
      scriptsLog.push({ codeLength: code.length, status: "scoped-executed" });
    }
  }

  // 5. Process body — ONE root node per top-level element
  const body = parsedDoc.body;
  if (!body) {
    return {
      filePath: baseUrl,
      styleTagsCount,
      externalStylesheets: externalStylesheetsLog,
      scriptsExecuted: scriptsLog
    };
  }

  // Pre-mark any element containing a script tag as having JS behavior
  const allElements = body.querySelectorAll("*");
  for (const el of Array.from(allElements)) {
    const id = el.getAttribute("id");
    if (id && el.querySelector("script")) {
      workspace.markNodeHasJS(id);
    }
  }

  // Separate global body scripts
  const bodyScripts = body.querySelectorAll("script");
  const globalBodyScripts: HTMLScriptElement[] = [];
  for (const script of Array.from(bodyScripts)) {
    globalBodyScripts.push(script as HTMLScriptElement);
    script.remove();
  }

  // Collect top-level content elements (skip text nodes, comments, etc.)
  const topLevelElements: HTMLElement[] = [];
  let nodeCounter = 0;

  for (const child of Array.from(body.children)) {
    if (child instanceof HTMLElement &&
        child.tagName.toLowerCase() !== "script" &&
        child.tagName.toLowerCase() !== "style" &&
        child.tagName.toLowerCase() !== "link") {
      topLevelElements.push(child);
    }
  }

  // Wrap each top-level element in a canvas-positioned wrapper
  // and append to shadow DOM — no child registration
  const defaultPageWidth = options.defaultPageWidth ?? 1200;
  let currentY = 0;

  for (const el of topLevelElements) {
    const id = el.getAttribute("id") || `imported-node-${++nodeCounter}`;
    el.setAttribute("id", id);

    // Resolve relative URLs in the element's attributes
    resolveRelativeAttributes(el, baseUrl);

    // Extract scripts from this element before cloning
    const scriptsInElement = el.querySelectorAll("script");
    const scriptCodes: string[] = [];
    for (const script of Array.from(scriptsInElement)) {
      scriptCodes.push(script.textContent || "");
      script.remove();
    }

    // Clone for rawMarkup (full content, no stripping)
    const rawMarkup = el.outerHTML;

    // Create wrapper for canvas positioning
    const wrapper = document.createElement("div");
    wrapper.className = "canvus-node-wrapper";
    wrapper.setAttribute("data-canvus-id", id);
    wrapper.appendChild(el);
    shadowRoot.appendChild(wrapper);

    // Register as a single root node
    const currentRect = { x: 0, y: currentY, width: defaultPageWidth, height: 0 };
    const measuredRect = workspace.addNode(
      {
        id,
        rawMarkup,
        currentRect,
      },
      null,
    );

    // Execute scripts from this element
    for (const code of scriptCodes) {
      workspace.getShadowMount().executeScopedScript(code);
      scriptsLog.push({ codeLength: code.length, status: "scoped-executed" });
    }

    if (scriptCodes.length > 0) {
      workspace.markNodeHasJS(id);
    }

    if (measuredRect) {
      currentY += measuredRect.height;
    }
  }

  // Run global body scripts
  for (const script of globalBodyScripts) {
    const src = script.getAttribute("src");
    if (src) {
      const resolvedSrc = resolveUrl(src, baseUrl);
      const newScript = document.createElement("script");
      for (const attr of Array.from(script.attributes)) {
        newScript.setAttribute(attr.name, attr.value);
      }
      newScript.setAttribute("src", resolvedSrc);
      shadowRoot.appendChild(newScript);
      scriptsLog.push({ src: src, codeLength: 0, status: "scoped-executed" });
    } else {
      const code = script.textContent || "";
      workspace.getShadowMount().executeScopedScript(code);
      scriptsLog.push({ codeLength: code.length, status: "scoped-executed" });
    }
  }

  return {
    filePath: baseUrl,
    styleTagsCount,
    externalStylesheets: externalStylesheetsLog,
    scriptsExecuted: scriptsLog
  };
}
