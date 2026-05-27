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
 * Rewrites relative attributes (src, href, style background url) to absolute URLs on a cloned element.
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
    element.setAttribute("style", resolveCSSUrls(style, baseUrl));
  }
  const elementsWithStyle = element.querySelectorAll("[style]");
  for (const el of Array.from(elementsWithStyle)) {
    const style = el.getAttribute("style") || "";
    el.setAttribute("style", resolveCSSUrls(style, baseUrl));
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
    const resolvedCSS = resolveCSSUrls(rawCSS, baseUrl);
    workspace.injectCSS(resolvedCSS);
  }

  const linkStylesheets = parsedDoc.querySelectorAll("link[rel='stylesheet']");
  for (const link of Array.from(linkStylesheets)) {
    const href = link.getAttribute("href") || "";
    const resolvedHref = resolveUrl(href, baseUrl);
    workspace.injectCSSLink(resolvedHref);
  }

  // 4. Extract Global Script Tags (and load them into the shadow DOM)
  const scriptTags = parsedDoc.querySelectorAll("script");
  const shadowRoot = workspace.getShadowMount().getShadowRoot();
  for (const script of Array.from(scriptTags)) {
    // If the script is nested inside body, we will handle it when parsing body (or skip it as a workspace node)
    // Only inject head scripts or document-level scripts here
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

  // 5. Traverse Body & Build Node Hierarchies
  const body = parsedDoc.body;
  if (!body) return;

  interface NodeMetadata {
    id: string;
    element: HTMLElement;
    parentId: string | null;
  }

  const registeredNodes: NodeMetadata[] = [];
  const elementToId = new Map<Element, string>();
  let nodeCounter = 0;

  // Pass 1: Identify all workspace nodes and tag them with unique IDs
  function identifyNodes(el: Element, activeParentId: string | null): void {
    // Skip script elements inside body (they are evaluated/removed)
    if (el.tagName.toLowerCase() === "script") return;

    const isWorkspaceNode = el.matches(nodeSelector);
    let currentId = activeParentId;

    if (isWorkspaceNode) {
      const htmlEl = el as HTMLElement;
      let id = htmlEl.getAttribute("id") || `imported-node-${++nodeCounter}`;
      htmlEl.setAttribute("id", id);
      currentId = id;
      elementToId.set(el, id);
      registeredNodes.push({
        id,
        element: htmlEl,
        parentId: activeParentId,
      });
    }

    for (const child of Array.from(el.children)) {
      identifyNodes(child, currentId);
    }
  }

  identifyNodes(body, null);

  // Pass 2: Mount each node in topological order (parents before children)
  for (const metadata of registeredNodes) {
    const el = metadata.element;

    // Clone element to construct rawMarkup without mutating the parsed DOM
    const clone = el.cloneNode(true) as HTMLElement;

    // Resolve relative URL paths inside the cloned element
    resolveRelativeAttributes(clone, baseUrl);

    // Remove any descendant elements in the clone that are registered as separate workspace nodes
    // to prevent duplicate rendering of children wrappers
    const childrenNodesInClone = clone.querySelectorAll(nodeSelector);
    for (const childNode of Array.from(childrenNodesInClone)) {
      childNode.remove();
    }

    const rawMarkup = clone.outerHTML;

    // Mount to the workspace
    workspace.addNode(
      {
        id: metadata.id,
        rawMarkup,
        currentRect: null,
      },
      metadata.parentId,
    );
  }
}
