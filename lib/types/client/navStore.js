/**
 * Memory monitoring nav store: shared viewing state between the left-sidebar
 * nav group (sidebar.sections) and the right-pane takeover (shell.overlay).
 * One factory handle is created in apply and passed to both registrations so
 * selecting a menu in the sidebar and rendering the matching page read the
 * same state. Module level exports the factory only — a module-level handle
 * would pin the store's identity across plugin reloads.
 */
import { defineStore } from '@deepseek-ai/dsh-client-runtime/client';
/** The four fixed monitoring pages. */
export const MEMORY_NAV_ITEMS = [
    { key: 'experience', label: '经验库监控' },
    { key: 'fact', label: '画像·日记' },
    { key: 'ledger', label: '账本' },
    { key: 'human', label: '人工管理' },
];
/**
 * Create the memory nav store handle. `select` both chooses the page and
 * expands the group; `clear` hides the takeover overlay (used when the user
 * opens a session row, returning to the native conversation view).
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createMemoryNavStore() {
    return defineStore({
        init: () => ({ page: null, collapsed: false }),
        actions: {
            select: (d, page) => {
                d.page = page;
                d.collapsed = false;
            },
            clear: (d) => { d.page = null; },
            toggleCollapsed: (d) => { d.collapsed = !d.collapsed; },
        },
    });
}
//# sourceMappingURL=navStore.js.map