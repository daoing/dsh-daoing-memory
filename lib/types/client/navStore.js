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
import { useEffect, useState } from 'react';
/** The four fixed monitoring pages. */
export const MEMORY_NAV_ITEMS = [
    { key: 'experience', label: '经验库监控' },
    { key: 'fact', label: '画像·日记' },
    { key: 'ledger', label: '账本' },
    { key: 'human', label: '人工管理' },
];
// ── Module-level observable ────────────────────────────────────────────────
let _currentPage = null;
const _listeners = new Set();
function notify() {
    for (const fn of _listeners)
        fn();
}
/** Select a monitoring page (opens the overlay on that page). */
export function selectPage(page) {
    _currentPage = page;
    notify();
}
/** Clear the selection (hides the overlay, returns to conversation view). */
export function clearPage() {
    _currentPage = null;
    notify();
}
/** Read the current page (null = overlay hidden). */
export function getCurrentPage() {
    return _currentPage;
}
/**
 * React hook: subscribe to page changes and re-render on update.
 * Returns the current page key, or null when the overlay is hidden.
 */
export function useCurrentPage() {
    const [, force] = useState(0);
    useEffect(() => {
        const fn = () => { force(n => n + 1); };
        _listeners.add(fn);
        return () => { _listeners.delete(fn); };
    }, []);
    return _currentPage;
}
//# sourceMappingURL=navStore.js.map