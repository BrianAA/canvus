import type { Command } from "../types.js";
import type { KeyboardHandler, WorkspaceContext } from "./types.js";
/**
 * Manages modular keyboard commands and coordinates shortcut execution.
 */
export declare class CommandHandler implements KeyboardHandler {
    readonly id = "command";
    private ctx;
    private commands;
    constructor(ctx: WorkspaceContext);
    onKeyDown(e: KeyboardEvent): boolean;
    registerCommand(cmd: Command): void;
    private registerDefaultCommands;
    private nudgeOrReorderSelected;
    private ungroupSelectedOrParent;
    private wrapSelectedInFlex;
}
//# sourceMappingURL=command.handler.d.ts.map