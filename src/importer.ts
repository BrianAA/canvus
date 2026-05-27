// ─────────────────────────────────────────────────────────────
// canvus/src/importer.ts
// HTML/CSS Document Importer Subsystem.
// Parses raw HTML strings, extracts stylesheets, resolves relative
// asset paths, and recursively registers nodes into the Workspace.
// ─────────────────────────────────────────────────────────────

import type { Workspace } from "./workspace.js";

/** Configuration options for the HTML document importer. */
export interface ImportHTMLOptions {
  /** The base URL of the original document, used to resolve relative URLs for stylesheets, images, and links. */
  baseUrl?: string;

  /**
   * CSS selector identifying which elements should become interactive workspace nodes.
   * Elements not matching this selector will remain as static structure inside their parent node.
   * @default "div,section,header,footer,main,aside,nav,article,p,h1,h2,h3,h4,h5,h6,img,button,a,form,input,textarea,select,ul,ol,li,table,tr,td,th"
   */
  nodeSelector?: string;

  /** Whether to clear selection and remove existing nodes from the workspace before importing. @default true */
  clearWorkspace?: boolean;

  /** The default width (in pixels) applied to imported root-level nodes. @default 1200 */
  defaultPageWidth?: number;
}

const DEFAULT_NODE_SELECTOR =
  "div,section,header,footer,main,aside,nav,article,p,h1,h2,h3,h4,h5,h6,img,button,a,form,input,textarea,select,ul,ol,li,table,tr,td,th";

/**
 * Resolves a relative URL string against a base URL.
 */
function resolveUrl(url: string, baseUrl?: string): string {
  if (!baseUrl) return url;
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}

/**
 * Resolves relative url(...) declarations inside CSS text.
 */
function resolveCSSUrls(cssText: string, baseUrl?: string): string {
  if (!baseUrl) return cssText;
  return cssText.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g, (match, urlPath) => {
    // Skip absolute or data URLs
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

/**
 * Resolves relative paths inside CSS @import declarations.
 */
function resolveCSSImports(cssText: string, baseUrl?: string): string {
  if (!baseUrl) return cssText;
  return cssText.replace(/@import\s+['"]([^'"]+)['"]/g, (match, importPath) => {
    // Skip absolute or data URLs
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

/**
 * Resolves relative paths inside srcset attributes.
 */
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

/**
 * Rewrites relative attributes (src, srcset, href, style background url) to absolute URLs on a cloned element.
 */
function resolveRelativeAttributes(element: HTMLElement, baseUrl?: string): void {
  if (!baseUrl) return;

  // Resolve src attribute
  if (element.hasAttribute("src")) {
    const src = element.getAttribute("src") || "";
    element.setAttribute("src", resolveUrl(src, baseUrl));
  }
  const elementsWithSrc = element.querySelectorAll("[src]");
  for (const el of Array.from(elementsWithSrc)) {
    const src = el.getAttribute("src") || "";
    el.setAttribute("src", resolveUrl(src, baseUrl));
  }

  // Resolve srcset attribute
  if (element.hasAttribute("srcset")) {
    const srcset = element.getAttribute("srcset") || "";
    element.setAttribute("srcset", resolveSrcSet(srcset, baseUrl));
  }
  const elementsWithSrcset = element.querySelectorAll("[srcset]");
  for (const el of Array.from(elementsWithSrcset)) {
    const srcset = el.getAttribute("srcset") || "";
    el.setAttribute("srcset", resolveSrcSet(srcset, baseUrl));
  }

  // Resolve href attribute (skipping hashes/anchors or protocol links)
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

  // Resolve inline styles containing urls
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

/**
 * Imports a complete HTML document string into the Workspace.
 * Automatically extracts head styles, parses DOM structures, resolves relative links,
 * and recursively mounts nodes into the layout tree.
 *
 * @param workspace  - The Canvus Workspace instance to load into.
 * @param htmlString - The raw full HTML page or fragment string.
 * @param options    - Config options for URL resolution and selector filters.
 */
export function importHTMLDocument(
  workspace: Workspace,
  htmlString: string,
  options: ImportHTMLOptions = {},
): void {
  const baseUrl = options.baseUrl;
  const nodeSelector = options.nodeSelector ?? DEFAULT_NODE_SELECTOR;

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
  for (const style of Array.from(styleTags)) {
    const rawCSS = style.textContent || "";
    const resolvedCSS = resolveCSSImports(resolveCSSUrls(rawCSS, baseUrl), baseUrl);
    workspace.injectCSS(resolvedCSS);
  }

  const linkStylesheets = parsedDoc.querySelectorAll("link[rel='stylesheet']");
  for (const link of Array.from(linkStylesheets)) {
    const href = link.getAttribute("href") || "";
    const resolvedHref = resolveUrl(href, baseUrl);
    workspace.injectCSSLink(resolvedHref);
  }

  // 4. Extract and inject head-level scripts (scripts inside <head>)
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
    } else {
      const newScript = document.createElement("script");
      newScript.textContent = script.textContent || "";
      shadowRoot.appendChild(newScript);
    }
  }

  // 5. Traverse Body & Build Node Hierarchies in-place
  const body = parsedDoc.body;
  if (!body) return;

  // Helper to check if an element has a workspace ancestor in the original tree
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

  // Recursive in-place wrapping bottom-up
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

      const doc = el.ownerDocument;
      const wrapper = doc.createElement("div");
      wrapper.className = "canvus-node-wrapper";
      wrapper.setAttribute("data-canvus-id", id);

      const isFlowChild = hasWorkspaceAncestor(el);
      if (isFlowChild) {
        wrapper.classList.add("canvus-flow-child");
      }

      if (el.parentNode) {
        el.parentNode.replaceChild(wrapper, el);
        wrapper.appendChild(el);
      }
    }
  }

  // Identify body script elements. Differentiate global scripts from node-nested scripts.
  const bodyScripts = body.querySelectorAll("script");
  const globalBodyScripts: HTMLScriptElement[] = [];

  for (const script of Array.from(bodyScripts)) {
    // If the script does not have a workspace ancestor, it's a global body script
    if (!hasWorkspaceAncestor(script)) {
      globalBodyScripts.push(script as HTMLScriptElement);
      // Remove it from the parsed body to prevent duplicate/unscoped execution
      script.remove();
    }
  }

  // Wrap workspace nodes bottom-up in the body
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

    if (canvusId && el.classList.contains("canvus-node-wrapper")) {
      const contentRoot = el.firstElementChild as HTMLElement;
      registeredNodes.push({
        id: canvusId,
        parentId: activeParentId,
        element: contentRoot,
      });
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

  // Register each node in topological order
  for (const metadata of registeredNodes) {
    const el = metadata.element;

    // Clone element to construct rawMarkup without mutating the active DOM
    const clone = el.cloneNode(true) as HTMLElement;

    // Resolve relative URL paths inside the cloned element
    resolveRelativeAttributes(clone, baseUrl);

    // Remove any descendant wrappers inside the clone to have a clean rawMarkup
    const childrenNodesInClone = clone.querySelectorAll(".canvus-node-wrapper");
    for (const childNode of Array.from(childrenNodesInClone)) {
      childNode.remove();
    }

    const rawMarkup = clone.outerHTML;

    let currentRect = null;
    if (metadata.parentId === null) {
      currentRect = { x: 0, y: currentY, width: defaultPageWidth, height: 0 };
    }

    // Mount to the workspace (which will find the pre-mounted wrapper in the Shadow DOM and register it)
    const measuredRect = workspace.addNode(
      {
        id: metadata.id,
        rawMarkup,
        currentRect,
      },
      metadata.parentId,
    );

    // If this is a root node, stack the next root node below it
    if (metadata.parentId === null && measuredRect) {
      currentY += measuredRect.height;
    }
  }

  // Run global body scripts scoped to the shadow DOM
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
    } else {
      const code = script.textContent || "";
      workspace.getShadowMount().executeScopedScript(code);
    }
  }
}
