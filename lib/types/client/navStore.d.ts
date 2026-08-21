/**
 * Memory monitoring nav store: shared viewing state between the left-sidebar
 * footer entry (sidebar.footer.action) and the right-pane takeover (shell.overlay).
 * One factory handle is created in apply and passed to both registrations so
 * selecting a menu in the sidebar and rendering the matching page read the
 * same state. Module level exports the factory only — a module-level handle
 * would pin the store's identity across plugin reloads.
 */
import { type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client';
/** The four fixed monitoring pages. */
export declare const MEMORY_NAV_ITEMS: readonly [{
    readonly key: "experience";
    readonly label: "经验库监控";
}, {
    readonly key: "fact";
    readonly label: "画像·日记";
}, {
    readonly key: "ledger";
    readonly label: "账本";
}, {
    readonly key: "human";
    readonly label: "人工管理";
}];
/** One monitoring page key. */
export type MemoryNavKey = typeof MEMORY_NAV_ITEMS[number]['key'];
/** Nav state: which page is active (null = the takeover overlay is hidden) and the group fold. */
type MemoryNavState = {
    page: MemoryNavKey | null;
    collapsed: boolean;
};
/** Annotation twin of the actions literal (the export needs a declared return type). */
type MemoryNavActions = {
    select: (draft: MemoryNavState, page: MemoryNavKey) => void;
    clear: (draft: MemoryNavState) => void;
    toggleCollapsed: (draft: MemoryNavState) => void;
};
/**
 * Create the memory nav store handle. `select` both chooses the page and
 * expands the group; `clear` hides the takeover overlay (used when the user
 * opens a session row, returning to the native conversation view).
 * @returns the store handle (spec + type + identity + factory in one).
 */
export declare function createMemoryNavStore(): EngineStoreHandle<MemoryNavState, MemoryNavActions>;
export {};
//# sourceMappingURL=navStore.d.ts.map