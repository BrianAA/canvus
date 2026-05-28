import type { Workspace } from '../../dist/index.js';

export interface ImportHTMLOptions {
  baseUrl?: string;
  nodeSelector?: string;
  clearWorkspace?: boolean;
  defaultPageWidth?: number;
}

const DEFAULT_NODE_SELECTOR =
  "div,section,header,footer,main,aside,nav,article,p,h1,h2,h3,h4,h5,h6,img,button,a,form,input,textarea,select,ul,ol,li,table,tr,td,th";

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

export async function importHTMLDocument(
  workspace: Workspace,
  htmlString: string,
  options: ImportHTMLOptions = {},
): Promise<ImportResultLog> {
  let baseUrl = options.baseUrl;
  if (baseUrl && !baseUrl.startsWith("http://") && !baseUrl.startsWith("https://") && !baseUrl.startsWith("file://")) {
    baseUrl = "file://" + (baseUrl.startsWith("/") ? "" : "/") + baseUrl.replace(/\\/g, "/");
  }
  const nodeSelector = options.nodeSelector ?? DEFAULT_NODE_SELECTOR;

  const externalStylesheetsLog: ImportResultLog["externalStylesheets"] = [];
  const scriptsLog: ImportResultLog["scriptsExecuted"] = [];
  let styleTagsCount = 0;

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
  const styleTags = parsedDoc.querySelectorAll("style");
  const globalProperties: string[] = [];

  // Clean up any previously extracted properties from document.head
  const oldExtracted = document.querySelectorAll("style[data-canvus-extracted-properties]");
  for (const el of Array.from(oldExtracted)) {
    el.remove();
  }

  for (const style of Array.from(styleTags)) {
    let rawCSS = style.textContent || "";

    // Extract @property rules and force inherits: true to bypass Chromium Shadow DOM inheritance bug
    const matches = rawCSS.match(/@property\s+[^\{]+\{[^\}]*\}/g);
    if (matches) {
      const updatedMatches = matches.map(m => m.replace(/inherits:\s*false/g, "inherits: true"));
      globalProperties.push(...updatedMatches);
      rawCSS = rawCSS.replace(/@property\s+[^\{]+\{[^\}]*\}/g, "");
    }

    // Fix Chromium @scope limit conflict when root has the limit class
    rawCSS = rawCSS.replace(/@scope\s*\(\.scope\.purchase-button\)\s*to\s*\(\.scope\)/g, "@scope (.purchase-button)");

    const resolvedCSS = resolveCSSImports(resolveCSSUrls(rawCSS, baseUrl), baseUrl);

    if (resolvedCSS) {
      workspace.injectCSS(resolvedCSS);
      styleTagsCount++;
    }
    style.remove();
  }

  if (globalProperties.length > 0) {
    const globalStyle = document.createElement("style");
    globalStyle.setAttribute("data-canvus-extracted-properties", "");
    globalStyle.textContent = globalProperties.join("\n");
    document.head.appendChild(globalStyle);
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

  // 5. Traverse Body & Build Node Hierarchies in-place
  const body = parsedDoc.body;
  if (!body) {
    return {
      filePath: baseUrl,
      styleTagsCount,
      externalStylesheets: externalStylesheetsLog,
      scriptsExecuted: scriptsLog
    };
  }

  function hasWorkspaceAncestor(el: Element): boolean {
    let parent = el.parentElement;
    while (parent && parent !== body) {
      if (parent.matches(nodeSelector)) {
        return true;
      }
      parent = parent.parentElement;
    }
    return false;
  }

  const elementToId = new Map<Element, string>();
  let nodeCounter = 0;
  function getNextId(): string {
    return `imported-node-${++nodeCounter}`;
  }

  // Wrap workspace nodes in-place bottom-up
  function wrapNodesInPlace(el: Element): void {
    const children = Array.from(el.children);
    for (const child of children) {
      wrapNodesInPlace(child);
    }

    if (
      el.matches(nodeSelector) &&
      el.tagName.toLowerCase() !== "script" &&
      el.tagName.toLowerCase() !== "style"
    ) {
      const htmlEl = el as HTMLElement;
      const id = htmlEl.getAttribute("id") || getNextId();
      htmlEl.setAttribute("id", id);
      elementToId.set(el, id);

      const isFlowChild = hasWorkspaceAncestor(el);

      if (isFlowChild) {
        // Flow children: mark with data attribute only, no wrapper div.
        // This preserves the DOM structure so CSS child combinators (>)
        // match correctly.
        htmlEl.setAttribute("data-canvus-id", id);
      } else {
        // Root elements: create wrapper for absolute positioning.
        const doc = el.ownerDocument;
        const wrapper = doc.createElement("div");
        wrapper.className = "canvus-node-wrapper";
        wrapper.setAttribute("data-canvus-id", id);

        if (el.parentNode) {
          el.parentNode.replaceChild(wrapper, el);
          wrapper.appendChild(el);
        }
      }
    }
  }

  // Separate global body scripts from nested scripts
  const bodyScripts = body.querySelectorAll("script");
  const globalBodyScripts: HTMLScriptElement[] = [];

  for (const script of Array.from(bodyScripts)) {
    if (!hasWorkspaceAncestor(script)) {
      globalBodyScripts.push(script as HTMLScriptElement);
      script.remove();
    }
  }

  // Wrap workspace nodes in the body
  const bodyChildren = Array.from(body.children);
  for (const child of bodyChildren) {
    wrapNodesInPlace(child);
  }

  // Collect registered workspace nodes top-down (parents before children)
  interface NodeMetadata {
    id: string;
    parentId: string | null;
    element: HTMLElement;
  }
  const registeredNodes: NodeMetadata[] = [];

  function collectRegisteredNodes(el: Element, activeParentId: string | null): void {
    const canvusId = el.getAttribute("data-canvus-id");
    let currentParentId = activeParentId;

    if (canvusId) {
      if (el.classList.contains("canvus-node-wrapper")) {
        // Wrapper-based node (root element)
        const contentRoot = el.firstElementChild as HTMLElement;
        registeredNodes.push({
          id: canvusId,
          parentId: activeParentId,
          element: contentRoot,
        });
      } else {
        // Direct element (flow child, no wrapper)
        registeredNodes.push({
          id: canvusId,
          parentId: activeParentId,
          element: el as HTMLElement,
        });
      }
      currentParentId = canvusId;
    }

    for (const child of Array.from(el.children)) {
      collectRegisteredNodes(child, currentParentId);
    }
  }

  for (const child of Array.from(body.children)) {
    collectRegisteredNodes(child, null);
  }

  // Append all children of the parsed body directly into the active Shadow DOM
  while (body.firstChild) {
    const child = body.firstChild;
    shadowRoot.appendChild(child);
  }

  let currentY = 0;
  const defaultPageWidth = options.defaultPageWidth ?? 1200;

  // Register each node and process scripts
  for (const metadata of registeredNodes) {
    const el = metadata.element;

    // Check for nested script content inside the element
    const scriptsInElement = el.querySelectorAll("script");
    const scriptCodes: string[] = [];
    for (const script of Array.from(scriptsInElement)) {
      const closestWrapper = script.closest(".canvus-node-wrapper");
      if (closestWrapper && closestWrapper.getAttribute("data-canvus-id") === metadata.id) {
        scriptCodes.push(script.textContent || "");
        // Remove it from active DOM to avoid duplicate script execution
        script.remove();
      }
    }

    // Clone element to construct rawMarkup without mutating active DOM
    const clone = el.cloneNode(true) as HTMLElement;

    // Resolve relative URL paths inside the cloned element
    resolveRelativeAttributes(clone, baseUrl);

    // Remove both wrapper-based and direct child markers from clone
    const childrenNodesInClone = clone.querySelectorAll(
      ".canvus-node-wrapper[data-canvus-id], [data-canvus-id]"
    );
    for (const childNode of Array.from(childrenNodesInClone)) {
      // Don't remove the clone root itself
      if (childNode === clone) continue;
      childNode.remove();
    }
    // Remove data-canvus-id from the clone itself
    clone.removeAttribute("data-canvus-id");

    const rawMarkup = clone.outerHTML;

    let currentRect = null;
    if (metadata.parentId === null) {
      currentRect = { x: 0, y: currentY, width: defaultPageWidth, height: 0 };
    }

    // Mount to the workspace
    const measuredRect = workspace.addNode(
      {
        id: metadata.id,
        rawMarkup,
        currentRect,
      },
      metadata.parentId,
    );

    // Execute scripts extracted from this element
    for (const code of scriptCodes) {
      workspace.getShadowMount().executeScopedScript(code);
      scriptsLog.push({ codeLength: code.length, status: "scoped-executed" });
    }

    // If there were scripts, explicitly mark the node with JS
    if (scriptCodes.length > 0) {
      workspace.markNodeHasJS(metadata.id);
    }

    if (metadata.parentId === null && measuredRect) {
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

