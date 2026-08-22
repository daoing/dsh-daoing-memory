/**
 * Memory monitoring nav state: shared viewing state between the session header
 * entry (conversation.session.header.utilities, scope "session") and the
 * right-pane takeover (shell.overlay, scope "root").
 *
 * IMPORTANT: DSH's slot system enforces "one handle, one scope" — a single
 * store handle cannot be mounted under two different scopes. Since the header
 * slot is scope "session" and the overlay slot is scope "root", we CANNOT
 * share a DSH EngineStoreHandle between them.
 *
 * Instead, page selection lives in a module-level observable that both
 * components subscribe to via the useCurrentPage() React hook. Neither slot
 * registration passes a `store` option, so no scope pinning occurs.
 */
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
/** Select a monitoring page (opens the overlay on that page). */
export declare function selectPage(page: MemoryNavKey): void;
/** Clear the selection (hides the overlay, returns to conversation view). */
export declare function clearPage(): void;
/** Read the current page (null = overlay hidden). */
export declare function getCurrentPage(): MemoryNavKey | null;
/**
 * React hook: subscribe to page changes and re-render on update.
 * Returns the current page key, or null when the overlay is hidden.
 */
export declare function useCurrentPage(): MemoryNavKey | null;
//# sourceMappingURL=navStore.d.ts.map