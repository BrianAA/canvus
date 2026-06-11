// ─────────────────────────────────────────────────────────────
// canvus/src/handlers/command.handler.ts
// Handles modular keyboard commands (Shift+A wrap-in-flex, Cmd+Delete ungroup, arrows nudge).
// ─────────────────────────────────────────────────────────────

import type { Command, CommandShortcut, ResolvedNode } from "../types.js";
import type { KeyboardHandler, WorkspaceContext } from "./types.js";
import { computeAggregateBounds } from "../tree.js";
import { detectLayout, getFlowAxis } from "../layout.js";

/** Helper to match a KeyboardEvent against CommandShortcut matchers. */
function matchesShortcut(e: KeyboardEvent, shortcut: CommandShortcut | CommandShortcut[]): boolean {
  const list = Array.isArray(shortcut) ? shortcut : [shortcut];
  return list.some(s => {
    // Check modifiers
    const metaOrCtrlMatch = s.metaOrCtrl !== undefined ? (s.metaOrCtrl === (e.metaKey || e.ctrlKey)) : true;
    const shiftMatch = s.shift !== undefined ? (s.shift === e.shiftKey) : true;
    const altMatch = s.alt !== undefined ? (s.alt === e.altKey) : true;
    if (!metaOrCtrlMatch || !shiftMatch || !altMatch) return false;

    // Check key or code
    if (s.key !== undefined) {
      if (e.key.toLowerCase() !== s.key.toLowerCase()) return false;
    }
    if (s.code !== undefined) {
      if (e.code !== s.code) return false;
    }
    return true;
  });
}

/**
 * Manages modular keyboard commands and coordinates shortcut execution.
 */
export class CommandHandler implements KeyboardHandler {
  readonly id = "command";

  private ctx: WorkspaceContext;
  private commands = new Map<string, Command>();

  constructor(ctx: WorkspaceContext) {
    this.ctx = ctx;
    this.registerDefaultCommands();
  }

  // ── KeyboardHandler Interface ───────────────────────

  onKeyDown(e: KeyboardEvent): boolean {
    for (const cmd of this.commands.values()) {
      if (cmd.enabled && !cmd.enabled(this.ctx)) continue;
      if (cmd.shortcut && matchesShortcut(e, cmd.shortcut)) {
        e.preventDefault();
        cmd.execute(this.ctx, e);
        return true;
      }
    }
    return false;
  }

  // ── Command Registration ────────────────────────────

  registerCommand(cmd: Command): void {
    this.commands.set(cmd.id, cmd);
  }

  private registerDefaultCommands(): void {
    // 1. Shift+A: Wrap in Flex
    this.registerCommand({
      id: "wrap-in-flex",
      name: "Wrap in Flex",
      description: "Wraps the selected node(s) in a flex container",
      shortcut: { key: "a", shift: true, metaOrCtrl: false, alt: false },
      execute: () => {
        this.wrapSelectedInFlex();
      }
    });

    // 2. Cmd+Delete / Cmd+Backspace: Ungroup
    this.registerCommand({
      id: "ungroup",
      name: "Ungroup",
      description: "Ungroups the selected container node(s)",
      shortcut: [
        { key: "Delete", metaOrCtrl: true },
        { key: "Backspace", metaOrCtrl: true }
      ],
      execute: () => {
        this.ungroupSelectedOrParent();
      }
    });

    // 3. Arrow Keys: Nudge or Reorder
    const arrowKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
    for (const key of arrowKeys) {
      this.registerCommand({
        id: `nudge-${key.toLowerCase()}`,
        name: `Nudge ${key}`,
        shortcut: [
          { key, shift: false, metaOrCtrl: false },
          { key, shift: true, metaOrCtrl: false }
        ],
        enabled: (ctx) => ctx.selectedIds.size > 0,
        execute: (_ctx, e) => {
          if (e) {
            this.nudgeOrReorderSelected(e.key, e.shiftKey);
          }
        }
      });
    }
  }

  // ── Command Implementations ─────────────────────────

  private nudgeRootNodes(
    rootNodes: ResolvedNode[],
    key: string,
    shiftKey: boolean,
    ops: any[],
  ): void {
    const nudgeAmount = shiftKey ? 10 : 1;
    for (const node of rootNodes) {
      const currentX = node.currentRect ? node.currentRect.x : 0;
      const currentY = node.currentRect ? node.currentRect.y : 0;

      let newX = currentX;
      let newY = currentY;

      if (key === "ArrowLeft") newX -= nudgeAmount;
      if (key === "ArrowRight") newX += nudgeAmount;
      if (key === "ArrowUp") newY -= nudgeAmount;
      if (key === "ArrowDown") newY += nudgeAmount;

      if (newX !== currentX || newY !== currentY) {
        const payload = { left: `${newX}px`, top: `${newY}px` };
        const undoPayload = { left: `${currentX}px`, top: `${currentY}px` };

        this.ctx.setNodeStyles(node.id, payload);

        ops.push({
          type: "update-style",
          nodeId: node.id,
          payload,
          undoPayload
        });

        if (node.currentRect) {
          this.ctx.callbacks.onNodeRectChange?.(node.id, node.currentRect);
        }
      }
    }
  }

  private reorderFlowChildren(
    groupedByParent: Map<string, ResolvedNode[]>,
    key: string,
    ops: any[],
  ): void {
    for (const [parentId, nodes] of groupedByParent.entries()) {
      const parentContent = this.ctx.mount.getContentRoot(parentId);
      if (!parentContent) continue;

      const layoutInfo = detectLayout(parentContent);
      const flowAxis = getFlowAxis(layoutInfo); // "x" or "y"
      const siblings = this.ctx.tree.getChildren(parentId);
      const maxIndex = siblings.length - 1;

      let direction = 0;
      if (layoutInfo.mode === "grid" || layoutInfo.mode === "inline-grid") {
        if (key === "ArrowLeft" || key === "ArrowUp") direction = -1;
        else if (key === "ArrowRight" || key === "ArrowDown") direction = 1;
      } else if (flowAxis === "x") {
        if (key === "ArrowLeft") direction = -1;
        else if (key === "ArrowRight") direction = 1;
      } else {
        if (key === "ArrowUp") direction = -1;
        else if (key === "ArrowDown") direction = 1;
      }

      if (direction !== 0) {
        const sortedNodes = nodes.slice().sort((a, b) => {
          return this.ctx.tree.getChildIndex(a.id) - this.ctx.tree.getChildIndex(b.id);
        });

        if (direction === -1) {
          for (const node of sortedNodes) {
            const currentIndex = this.ctx.tree.getChildIndex(node.id);
            const oldIndex = currentIndex;
            const newIndex = Math.max(0, currentIndex - 1);
            if (newIndex !== currentIndex) {
              this.ctx.reorderChild(node.id, newIndex);
              ops.push({
                type: "reorder",
                nodeId: node.id,
                payload: { index: newIndex },
                undoPayload: { index: oldIndex }
              });
            }
          }
        } else {
          for (let i = sortedNodes.length - 1; i >= 0; i--) {
            const node = sortedNodes[i] as ResolvedNode;
            const currentIndex = this.ctx.tree.getChildIndex(node.id);
            const oldIndex = currentIndex;
            const newIndex = Math.min(maxIndex, currentIndex + 1);
            if (newIndex !== currentIndex) {
              this.ctx.reorderChild(node.id, newIndex);
              ops.push({
                type: "reorder",
                nodeId: node.id,
                payload: { index: newIndex },
                undoPayload: { index: oldIndex }
              });
            }
          }
        }

        const html = this.ctx.mount.extractHTML(parentId);
        if (html) {
          this.ctx.callbacks.onHTMLCommit?.(parentId, html);
        }
      }
    }
  }

  private nudgeOrReorderSelected(key: string, shiftKey: boolean): void {
    const topLevelIds = this.ctx.getTopLevelSelectedIds();
    if (topLevelIds.length === 0) return;

    const rootNodes: ResolvedNode[] = [];
    const groupedByParent = new Map<string, ResolvedNode[]>();

    for (const id of topLevelIds) {
      const node = this.ctx.tree.get(id);
      if (!node) continue;
      if (node.parentId === null) {
        rootNodes.push(node);
      } else {
        if (!groupedByParent.has(node.parentId)) {
          groupedByParent.set(node.parentId, []);
        }
        groupedByParent.get(node.parentId)!.push(node);
      }
    }

    this.ctx.mount.setTransitionsEnabled(false);

    const ops: any[] = [];

    // ── Absolute Nudging (Root Nodes) ─────────────
    if (rootNodes.length > 0) {
      this.nudgeRootNodes(rootNodes, key, shiftKey, ops);
    }

    // ── Flow Child Reordering (Grouped by Parent) ──
    if (groupedByParent.size > 0) {
      this.reorderFlowChildren(groupedByParent, key, ops);
    }

    if (ops.length > 0) {
      this.ctx.callbacks.onOperationsGenerated?.(ops);
    }

    this.ctx.mount.setTransitionsEnabled(true);
    this.ctx.render();
  }

  private ungroupSelectedOrParent(): void {
    const targetContainers = new Set<string>();
    for (const id of this.ctx.selectedIds) {
      const node = this.ctx.tree.get(id);
      if (!node) continue;
      if (this.ctx.tree.isContainer(id)) {
        if (node.parentId !== null) {
          targetContainers.add(id);
        }
      } else {
        if (node.parentId !== null) {
          targetContainers.add(node.parentId);
        }
      }
    }

    if (targetContainers.size === 0) return;

    this.ctx.mount.setTransitionsEnabled(false);

    const ops: any[] = [];
    const parentsToCommit = new Set<string>();
    const rootsToCommit = new Set<string>();

    for (const containerId of targetContainers) {
      const containerNode = this.ctx.tree.get(containerId);
      if (!containerNode) continue;

      const parentId = containerNode.parentId;
      const index = parentId !== null ? this.ctx.tree.getChildIndex(containerId) : -1;
      const children = this.ctx.tree.getChildren(containerId);

      let childIndexOffset = 0;
      for (const child of children) {
        const childId = child.id;
        const oldParentId = containerId;
        const oldIndex = this.ctx.tree.getChildIndex(childId);

        const newIndex = parentId !== null ? index + childIndexOffset : undefined;
        this.ctx.mount.reparentNodeDOM(childId, parentId, newIndex);
        this.ctx.tree.reparentNode(childId, parentId, newIndex);
        this.ctx.remeasureSubtree(childId);

        ops.push({
          type: "reparent",
          nodeId: childId,
          payload: { newParentId: parentId, index: newIndex !== undefined ? this.ctx.tree.getChildIndex(childId) : undefined },
          undoPayload: { newParentId: oldParentId, index: oldIndex }
        });

        childIndexOffset++;
      }

      const rawMarkup = this.ctx.mount.extractHTML(containerId);
      const rect = containerNode.currentRect;

      this.ctx.removeNode(containerId);

      ops.push({
        type: "delete-node" as any,
        nodeId: containerId,
        payload: { parentId },
        undoPayload: { parentId, rawMarkup, rect }
      });

      if (parentId) {
        parentsToCommit.add(parentId);
        this.ctx.remeasureSubtree(parentId);
      } else {
        rootsToCommit.add(containerId);
      }
    }

    if (ops.length > 0) {
      this.ctx.deselectAll();
      this.ctx.callbacks.onOperationsGenerated?.(ops);

      for (const parentId of parentsToCommit) {
        const html = this.ctx.mount.extractHTML(parentId);
        if (html) {
          this.ctx.callbacks.onHTMLCommit?.(parentId, html);
        }
      }
      for (const rootId of rootsToCommit) {
        this.ctx.callbacks.onHTMLCommit?.(rootId, "");
      }
    }

    this.ctx.mount.setTransitionsEnabled(true);
    this.ctx.render();
  }

  private wrapSelectedInFlex(): void {
    const topLevelIds = this.ctx.getTopLevelSelectedIds();
    if (topLevelIds.length === 0) return;

    this.ctx.mount.setTransitionsEnabled(false);

    const firstId = topLevelIds[0] as string;
    const firstNode = this.ctx.tree.get(firstId);
    if (!firstNode) {
      this.ctx.mount.setTransitionsEnabled(true);
      return;
    }

    // ── Single selection: transform the node itself into a flex container ──
    if (topLevelIds.length === 1) {
      const nodeId = firstId;
      const contentRoot = this.ctx.mount.getContentRoot(nodeId);

      // Read current style values for undo
      const oldDisplay = contentRoot?.style.display || null;
      const oldJustifyContent = contentRoot?.style.justifyContent || null;
      const oldAlignItems = contentRoot?.style.alignItems || null;
      const oldGap = contentRoot?.style.gap || null;
      const oldFlexDirection = contentRoot?.style.flexDirection || null;

      const payload: Record<string, string | null> = {
        "display": "flex",
        "justify-content": "center",
        "align-items": "center",
        "gap": "10px",
        "flex-direction": "row",
      };

      const undoPayload: Record<string, string | null> = {
        "display": oldDisplay,
        "justify-content": oldJustifyContent,
        "align-items": oldAlignItems,
        "gap": oldGap,
        "flex-direction": oldFlexDirection,
      };

      this.ctx.mount.setNodeStyles(nodeId, payload);

      // Sync layout mode
      const updatedContentRoot = this.ctx.mount.getContentRoot(nodeId);
      firstNode.layoutMode = updatedContentRoot ? detectLayout(updatedContentRoot).mode : "flex";

      this.ctx.remeasureSubtree(nodeId);
      if (firstNode.parentId) {
        this.ctx.remeasureSubtree(firstNode.parentId);
      }

      const ops: any[] = [{
        type: "update-style" as any,
        nodeId,
        payload,
        undoPayload,
      }];

      this.ctx.callbacks.onOperationsGenerated?.(ops);

      const commitTarget = firstNode.parentId ?? nodeId;
      const html = this.ctx.mount.extractHTML(commitTarget);
      if (html) {
        this.ctx.callbacks.onHTMLCommit?.(commitTarget, html);
      }

      this.ctx.mount.setTransitionsEnabled(true);
      this.ctx.render();
      return;
    }

    // ── Multi selection: wrap all selected nodes in a new flex container ──
    const parentId = firstNode.parentId;
    const index = parentId !== null ? this.ctx.tree.getChildIndex(firstId) : -1;

    const nodesToWrap = topLevelIds.map(id => this.ctx.tree.get(id)).filter((n): n is ResolvedNode => n !== undefined);
    // Helper bounds computation requires import or context.
    const bounds = computeAggregateBounds(nodesToWrap);

    const wrapperId = `flex-wrapper-${this.ctx.nextElementId()}-${Date.now().toString(36)}`;
    const rawMarkup = `<div style="display: flex; justify-content: center; align-items: center; gap: 10px; flex-direction: row; box-sizing: border-box;"></div>`;

    let rect = bounds ? { ...bounds } : null;
    this.ctx.addNode({
      id: wrapperId,
      rawMarkup,
      currentRect: rect
    }, parentId, index === -1 ? undefined : index);

    const ops: any[] = [];
    ops.push({
      type: "create-node" as any,
      nodeId: wrapperId,
      payload: { parentId, index: index === -1 ? undefined : this.ctx.tree.getChildIndex(wrapperId), rawMarkup, rect },
      undoPayload: { parentId }
    });

    let childIdx = 0;
    for (const nodeId of topLevelIds) {
      const node = this.ctx.tree.get(nodeId);
      if (!node) continue;
      const oldParentId = node.parentId;
      const oldIndex = this.ctx.tree.getChildIndex(nodeId);

      this.ctx.mount.reparentNodeDOM(nodeId, wrapperId, childIdx);
      this.ctx.tree.reparentNode(nodeId, wrapperId, childIdx);
      this.ctx.remeasureSubtree(nodeId);

      ops.push({
        type: "reparent",
        nodeId: nodeId,
        payload: { newParentId: wrapperId, index: childIdx },
        undoPayload: { newParentId: oldParentId, index: oldIndex }
      });

      childIdx++;
    }

    this.ctx.remeasureSubtree(wrapperId);
    if (parentId) {
      this.ctx.remeasureSubtree(parentId);
    }

    const prevSelection = new Set(this.ctx.selectedIds);
    this.ctx.selectedIds.clear();
    this.ctx.selectedIds.add(wrapperId);
    this.ctx.syncLazyChildren(prevSelection, this.ctx.selectedIds);
    this.ctx.callbacks.onSelectionChange?.(this.ctx.selectedIds);
    this.ctx.updateBreadcrumb();

    this.ctx.callbacks.onOperationsGenerated?.(ops);

    const commitTarget = parentId ?? wrapperId;
    const html = this.ctx.mount.extractHTML(commitTarget);
    if (html) {
      this.ctx.callbacks.onHTMLCommit?.(commitTarget, html);
    }

    this.ctx.mount.setTransitionsEnabled(true);
    this.ctx.render();
  }
}
