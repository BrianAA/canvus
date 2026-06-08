// ─────────────────────────────────────────────────────────────
// canvus/src/handlers/resize.handler.ts
// Handles hit-testing and dragging for 8-anchor element resize handles.
// ─────────────────────────────────────────────────────────────

import type { Rect, Vec2, ResizeAnchor } from "../types.js";
import { anchorCursor, computeAlignmentGuides } from "../renderer.js";
import { detectLayout, parseGridTracks } from "../layout.js";
import type { GridTrack } from "../layout.js";
import type { InteractionHandler, WorkspaceContext } from "./types.js";

/**
 * Maps a resize anchor to the CSS properties it affects.
 */
export function getLockedPropertiesForAnchor(anchor: ResizeAnchor): string[] {
  const props: string[] = [];
  const affectsWidth =
    anchor === "e" || anchor === "w" ||
    anchor === "ne" || anchor === "nw" ||
    anchor === "se" || anchor === "sw";
  const affectsHeight =
    anchor === "n" || anchor === "s" ||
    anchor === "ne" || anchor === "nw" ||
    anchor === "se" || anchor === "sw";
  if (affectsWidth) props.push("width");
  if (affectsHeight) props.push("height");
  return props;
}

/** Helper to compute resized bounds. */
function computeResizedRect(
  start: Readonly<Rect>,
  anchor: ResizeAnchor,
  dx: number,
  dy: number,
  minSize: number,
  symmetrical: boolean,
): Rect {
  let { x, y, width, height } = start;

  const affectsLeft = anchor === "nw" || anchor === "w" || anchor === "sw";
  const affectsRight = anchor === "ne" || anchor === "e" || anchor === "se";
  const affectsTop = anchor === "nw" || anchor === "n" || anchor === "ne";
  const affectsBottom = anchor === "sw" || anchor === "s" || anchor === "se";

  if (symmetrical) {
    const centerX = start.x + start.width / 2;
    const centerY = start.y + start.height / 2;

    if (affectsRight) {
      width = Math.max(minSize, start.width + 2 * dx);
    } else if (affectsLeft) {
      width = Math.max(minSize, start.width - 2 * dx);
    }

    if (affectsBottom) {
      height = Math.max(minSize, start.height + 2 * dy);
    } else if (affectsTop) {
      height = Math.max(minSize, start.height - 2 * dy);
    }

    x = centerX - width / 2;
    y = centerY - height / 2;
    return { x, y, width, height };
  }

  if (affectsRight) {
    width = Math.max(minSize, width + dx);
  }
  if (affectsLeft) {
    const newWidth = Math.max(minSize, width - dx);
    x = x + (width - newWidth); // Shift origin to compensate.
    width = newWidth;
  }
  if (affectsBottom) {
    height = Math.max(minSize, height + dy);
  }
  if (affectsTop) {
    const newHeight = Math.max(minSize, height - dy);
    y = y + (height - newHeight);
    height = newHeight;
  }

  return { x, y, width, height };
}

// ── Layout Grid Helpers ─────────────────────────────────────

function getGridStart(element: HTMLElement, dimension: "column" | "row"): number {
  const cs = getComputedStyle(element);
  const startVal = cs.getPropertyValue(`grid-${dimension}-start`);
  const val = cs.getPropertyValue(`grid-${dimension}`);
  
  const startNum = parseInt(startVal, 10);
  if (!isNaN(startNum)) return startNum;

  if (val) {
    const match = val.match(/^\s*(\d+)/);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }

  return getRealGridStart(element, dimension);
}

function getRealGridStart(element: HTMLElement, dimension: "column" | "row"): number {
  const parent = element.parentElement;
  if (!parent) return 1;

  let current: HTMLElement | null = parent;
  let offset = 0;
  let gap = 0;
  let tracks: GridTrack[] = [];
  let definingGrid: HTMLElement | null = null;

  while (current) {
    const cs = getComputedStyle(current);
    const display = cs.display;
    if (display.includes("grid")) {
      const template = cs.getPropertyValue(`grid-template-${dimension}s`);
      if (template && !template.includes("subgrid")) {
        definingGrid = current;
        gap = parseFloat(cs.getPropertyValue(`${dimension}-gap`)) || 0;
        tracks = parseGridTracks(template, gap);
        break;
      }
    }

    const nextParent: HTMLElement | null = current.parentElement;
    if (!nextParent) break;

    const currentRect = current.getBoundingClientRect();
    const parentRect = nextParent.getBoundingClientRect();
    const pcs = getComputedStyle(nextParent);
    const padLeft = parseFloat(pcs.paddingLeft) || 0;
    const padTop = parseFloat(pcs.paddingTop) || 0;

    offset += (dimension === "column")
      ? (currentRect.left - parentRect.left - padLeft)
      : (currentRect.top - parentRect.top - padTop);

    current = nextParent;
  }

  if (!definingGrid || tracks.length === 0) return 1;

  const elRect = element.getBoundingClientRect();
  const defRect = definingGrid.getBoundingClientRect();
  const defStyle = getComputedStyle(definingGrid);
  const defPadLeft = parseFloat(defStyle.paddingLeft) || 0;
  const defPadTop = parseFloat(defStyle.paddingTop) || 0;

  const elOffset = (dimension === "column")
    ? (elRect.left - defRect.left - defPadLeft)
    : (elRect.top - defRect.top - defPadTop);

  const cellIndex = getCellIndexAtOffset(elOffset, tracks, gap);

  if (parent !== definingGrid) {
    const parentRect = parent.getBoundingClientRect();
    const parentOffset = (dimension === "column")
      ? (parentRect.left - defRect.left - defPadLeft)
      : (parentRect.top - defRect.top - defPadTop);
    const parentCellIndex = getCellIndexAtOffset(parentOffset, tracks, gap);
    return Math.max(1, cellIndex - parentCellIndex + 1);
  }

  return cellIndex;
}

function getCellIndexAtOffset(offset: number, tracks: GridTrack[], gap: number): number {
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i]!;
    if (offset <= t.start + t.size + gap / 2) {
      return i + 1;
    }
  }
  return tracks.length;
}

function getGridSpan(element: HTMLElement, dimension: "column" | "row"): number {
  const cs = getComputedStyle(element);
  const startVal = cs.getPropertyValue(`grid-${dimension}-start`);
  const endVal = cs.getPropertyValue(`grid-${dimension}-end`);
  const val = cs.getPropertyValue(`grid-${dimension}`);

  const spanMatch = (startVal + " " + endVal + " " + val).match(/span\s+(\d+)/i);
  if (spanMatch && spanMatch[1]) {
    return parseInt(spanMatch[1], 10);
  }

  const startNum = parseInt(startVal, 10);
  const endNum = parseInt(endVal, 10);
  if (!isNaN(startNum) && !isNaN(endNum) && endNum > startNum) {
    return endNum - startNum;
  }

  return 1;
}

/**
 * Manages the element resizing gesture.
 */
export class ResizeHandler implements InteractionHandler {
  readonly id = "resize";

  private ctx: WorkspaceContext;

  private _isResizing = false;
  private _activeAnchor: ResizeAnchor | null = null;
  private _resizeStartRect: Rect | null = null;
  private _dragStartCanvas: Vec2 | null = null;
  private _dragStartStyles: Record<string, string | null> | null = null;

  constructor(ctx: WorkspaceContext) {
    this.ctx = ctx;
  }

  get isResizing(): boolean {
    return this._isResizing;
  }

  get activeAnchor(): ResizeAnchor | null {
    return this._activeAnchor;
  }

  // ── InteractionHandler Interface ────────────────

  claim(
    e: PointerEvent,
    canvasPos: Vec2,
    hitNodeId: string | null,
    containerRect: Rect,
  ): boolean {
    if (e.button !== 0 || this.ctx.previewMode) return false;

    // Calculate isDoubleClick early to prevent handles/adjusters from intercepting double-clicks on small/nested nodes
    const now = Date.now();
    const targetEl = e.composedPath()[0] as HTMLElement | null;
    const isSameTarget = targetEl !== null && this.ctx.lastPointerDownTarget !== null &&
      (targetEl === this.ctx.lastPointerDownTarget || (this.ctx.lastPointerDownTarget as Node).contains(targetEl) || targetEl.contains(this.ctx.lastPointerDownTarget as Node));
    const isDoubleClick = (now - this.ctx.lastPointerDownTime < 350) && (
      hitNodeId !== null &&
      this.ctx.lastPointerDownId !== null &&
      (hitNodeId === this.ctx.lastPointerDownId || isSameTarget || this.ctx.tree.isAncestor(this.ctx.lastPointerDownId, hitNodeId))
    );

    if (isDoubleClick) return false;

    if (this.ctx.selectedIds.size === 1) {
      const selId = this.ctx.selectedIds.values().next().value as string;
      const selNode = this.ctx.tree.get(selId);
      if (selNode?.currentRect) {
        const localX = e.clientX - containerRect.x;
        const localY = e.clientY - containerRect.y;
        const anchor = this.ctx.renderer.hitTestHandle(
          localX, localY, selNode.currentRect, this.ctx.viewport,
        );
        if (anchor) {
          // Property lock check for resize
          const affectedProps = getLockedPropertiesForAnchor(anchor);
          const lockedProps = affectedProps.filter(p => this.ctx.isPropertyLocked(selId, p));
          if (lockedProps.length > 0) {
            for (const prop of lockedProps) {
              this.ctx.notifyPropertyLockInteraction(selId, prop);
            }
            return true; // Claim and block
          }

          this._isResizing = true;
          this._activeAnchor = anchor;
          this._dragStartCanvas = canvasPos;
          this._resizeStartRect = { ...selNode.currentRect };

          const contentRoot = this.ctx.mount.getContentRoot(selId);
          if (contentRoot) {
            this._dragStartStyles = {
              "grid-column-start": contentRoot.style.gridColumnStart || null,
              "grid-column-end": contentRoot.style.gridColumnEnd || null,
              "grid-row-start": contentRoot.style.gridRowStart || null,
              "grid-row-end": contentRoot.style.gridRowEnd || null,
              "position": contentRoot.style.position || null,
              "left": contentRoot.style.left || null,
              "top": contentRoot.style.top || null,
              "width": contentRoot.style.width || null,
              "height": contentRoot.style.height || null,
            };
          }

          this.ctx.render();
          return true;
        }
      }
    }

    return false;
  }

  onPointerMove(e: PointerEvent, canvasPos: Vec2, _containerRect: Rect): void {
    if (!this._isResizing || !this._activeAnchor || !this._dragStartCanvas || !this._resizeStartRect) return;

    const selId = this.ctx.selectedIds.values().next().value as string;
    const node = this.ctx.tree.get(selId);
    if (!node) return;

    this.ctx.safeSetPointerCapture(e.pointerId);
    this.ctx.container.style.cursor = anchorCursor(this._activeAnchor);
    this.ctx.canvas.style.pointerEvents = "auto";
    this.ctx.emitInteraction("resize-node", { handler: this.id });

    const dx = canvasPos.x - this._dragStartCanvas.x;
    const dy = canvasPos.y - this._dragStartCanvas.y;

    const wrapper = this.ctx.mount.getWrapper(selId);
    let parentIsGrid = false;
    let gridInfo: any = null;
    let parentRect: Rect | null = null;
    let padLeft = 0;
    let padTop = 0;

    if (node.parentId !== null) {
      const parentContent = this.ctx.mount.getContentRoot(node.parentId);
      if (parentContent) {
        gridInfo = detectLayout(parentContent);
        if (gridInfo.mode === "grid" || gridInfo.mode === "inline-grid") {
          parentIsGrid = true;
          const parentNode = this.ctx.tree.get(node.parentId);
          parentRect = parentNode?.currentRect ?? null;
          const cs = getComputedStyle(parentContent);
          padLeft = parseFloat(cs.paddingLeft) || 0;
          padTop = parseFloat(cs.paddingTop) || 0;
        }
      }
    }

    if (parentIsGrid && gridInfo && parentRect && wrapper) {
      const colTracks = parseGridTracks(gridInfo.gridTemplateColumns || "", gridInfo.gap.column);
      const rowTracks = parseGridTracks(gridInfo.gridTemplateRows || "", gridInfo.gap.row);

      const contentRoot = this.ctx.mount.getContentRoot(selId);
      if (contentRoot) {
        const colStart = getGridStart(contentRoot, "column");
        const rowStart = getGridStart(contentRoot, "row");
        const colSpan = getGridSpan(contentRoot, "column");
        const rowSpan = getGridSpan(contentRoot, "row");

        const cx = canvasPos.x - parentRect.x - padLeft;
        const cy = canvasPos.y - parentRect.y - padTop;

        let newColStart = colStart;
        let newColSpan = colSpan;
        let newRowStart = rowStart;
        let newRowSpan = rowSpan;

        const anchor = this._activeAnchor;

        // West / East column resizing
        if (anchor.includes("w")) {
          const colEndIndex = colStart + colSpan;
          for (let i = 0; i < colTracks.length; i++) {
            const c = colTracks[i]!;
            if (cx <= c.start + c.size + gridInfo.gap.column / 2) {
              newColStart = Math.min(i + 1, colEndIndex - 1);
              newColSpan = colEndIndex - newColStart;
              break;
            }
          }
        } else if (anchor.includes("e")) {
          for (let i = 0; i < colTracks.length; i++) {
            const c = colTracks[i]!;
            if (cx <= c.start + c.size + gridInfo.gap.column / 2) {
              newColSpan = Math.max(1, (i + 1) - colStart + 1);
              break;
            }
            newColSpan = Math.max(1, (i + 1) - colStart + 1);
          }
        }

        // North / South row resizing
        if (anchor.includes("n")) {
          const rowEndIndex = rowStart + rowSpan;
          for (let i = 0; i < rowTracks.length; i++) {
            const r = rowTracks[i]!;
            if (cy <= r.start + r.size + gridInfo.gap.row / 2) {
              newRowStart = Math.min(i + 1, rowEndIndex - 1);
              newRowSpan = rowEndIndex - newRowStart;
              break;
            }
          }
        } else if (anchor.includes("s")) {
          for (let i = 0; i < rowTracks.length; i++) {
            const r = rowTracks[i]!;
            if (cy <= r.start + r.size + gridInfo.gap.row / 2) {
              newRowSpan = Math.max(1, (i + 1) - rowStart + 1);
              break;
            }
            newRowSpan = Math.max(1, (i + 1) - rowStart + 1);
          }
        }

        this.ctx.mount.setNodeStyles(selId, {
          "grid-column-start": `${newColStart}`,
          "grid-column-end": `span ${newColSpan}`,
          "grid-row-start": `${newRowStart}`,
          "grid-row-end": `span ${newRowSpan}`,
        });

        this.ctx.remeasureSubtree(selId);
        if (node.parentId) {
          this.ctx.remeasureSubtree(node.parentId);
        }
      }
    } else {
      // 1. Compute new rect from anchor delta.
      const newRect = computeResizedRect(
        this._resizeStartRect, this._activeAnchor, dx, dy, this.ctx.minResizeSize, e.altKey,
      );

      // 2. Style surgery — direct DOM mutation.
      this.ctx.mount.setNodeRect(selId, newRect);

      // 3. Synchronous reflow + measurement.
      this.ctx.remeasureSubtree(selId);
    }

    // 4. Compute alignment guides.
    if (this.ctx.enableSnapGuides && node.currentRect) {
      const otherRects = this.ctx.getOtherRects(selId);
      this.ctx.guides = computeAlignmentGuides(
        node.currentRect, otherRects, this.ctx.snapThreshold,
      );
    }

    // 5. Notify.
    if (node.currentRect) {
      this.ctx.callbacks.onNodeRectChange?.(selId, node.currentRect);
    }

    // 6. Render overlay.
    this.ctx.container.style.cursor = anchorCursor(this._activeAnchor);
    this.ctx.canvas.style.pointerEvents = "auto";
    this.ctx.render();
  }

  onPointerUp(e: PointerEvent, _canvasPos: Vec2, _containerRect: Rect): void {
    if (!this._isResizing || !this._activeAnchor) return;

    this._isResizing = false;
    this._activeAnchor = null;
    this._dragStartCanvas = null;

    const operations: any[] = [];
    let commitId: string | null = null;
    if (this.ctx.selectedIds.size === 1) {
      commitId = this.ctx.selectedIds.values().next().value as string;
    }

    if (commitId && this._resizeStartRect) {
      const node = this.ctx.tree.get(commitId);
      if (node?.currentRect) {
        let parentIsGrid = false;
        if (node.parentId !== null) {
          const parentContent = this.ctx.mount.getContentRoot(node.parentId);
          if (parentContent) {
            const info = detectLayout(parentContent);
            parentIsGrid = info.mode === "grid" || info.mode === "inline-grid";
          }
        }

        if (parentIsGrid) {
          const contentRoot = this.ctx.mount.getContentRoot(commitId);
          if (contentRoot && this._dragStartStyles) {
            const payload: any = {};
            const undoPayload: any = {};
            let styleChanged = false;

            const styleProps = [
              "grid-column-start",
              "grid-column-end",
              "grid-row-start",
              "grid-row-end",
            ];

            for (const prop of styleProps) {
              const val = contentRoot.style.getPropertyValue(prop) || null;
              const origVal = this._dragStartStyles[prop] || null;
              if (val !== origVal) {
                payload[prop] = val;
                undoPayload[prop] = origVal;
                styleChanged = true;
              }
            }

            if (styleChanged) {
              operations.push({
                type: "update-style",
                nodeId: commitId,
                payload,
                undoPayload
              });
            }
          }
        } else {
          const finalRect = node.currentRect;
          const startRect = this._resizeStartRect;
          if (finalRect.width !== startRect.width || finalRect.height !== startRect.height ||
              finalRect.x !== startRect.x || finalRect.y !== startRect.y) {
            
            const payload: any = {
              width: `${finalRect.width}px`,
              height: `${finalRect.height}px`
            };
            const undoPayload: any = {
              width: `${startRect.width}px`,
              height: `${startRect.height}px`
            };

            if (node.parentId === null) {
              payload.left = `${finalRect.x}px`;
              payload.top = `${finalRect.y}px`;
              undoPayload.left = `${startRect.x}px`;
              undoPayload.top = `${startRect.y}px`;
            }

            operations.push({
              type: "update-style",
              nodeId: commitId,
              payload,
              undoPayload
            });
          }
        }
        this.ctx.callbacks.onNodeRectChange?.(commitId, node.currentRect);
      }
    }
    this._resizeStartRect = null;
    this._dragStartStyles = null;

    // Clear guides.
    this.ctx.guides = [];

    // Release pointer capture.
    try {
      this.ctx.container.releasePointerCapture(e.pointerId);
    } catch {}

    if (operations.length > 0) {
      this.ctx.callbacks.onOperationsGenerated?.(operations);
    }

    this.ctx.canvas.style.pointerEvents = "none";
    this.ctx.emitInteraction(null);
    this.ctx.render();

    // ── Flat String Bridge ────────────────────────
    if (commitId) {
      const node = this.ctx.tree.get(commitId);
      const commitTarget = (node && node.parentId !== null) ? node.parentId : commitId;
      const html = this.ctx.mount.extractHTML(commitTarget);
      if (html) {
        this.ctx.callbacks.onHTMLCommit?.(commitTarget, html);
      }
    }
  }

  onCancel(): void {
    this._isResizing = false;
    this._activeAnchor = null;
    this._resizeStartRect = null;
    this._dragStartCanvas = null;
    this._dragStartStyles = null;
    this.ctx.guides = [];
    this.ctx.container.style.cursor = "default";
    this.ctx.emitInteraction(null);
    this.ctx.render();
  }
}
