import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Memory workbench sidebar entry: an always-present nav row in the sidebar
 * sections region (root scope — mounted whether or not a session is current).
 * The host memory remote ignores its session argument (`void agent`), so
 * opening 人工管理 from here needs no session. Clicking expands a rail first,
 * then selects a page. `data-memory-nav` keeps the workbench's click-outside
 * dismissal from treating this row as an outside click.
 */
import clsx from 'clsx';
import { IconDataOutline16 } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './MemorySidebarEntry.module.css';
/**
 * Render the always-present sidebar entry. Wide mode shows icon + label; the
 * rail shows icon only. Clicking opens the workbench at 人工管理 (global,
 * session-free) so the memory library is manageable without opening a session.
 * @param props - composed slot props.
 * @returns the nav button.
 */
export function MemorySidebarEntry({ wide, expandSidebar, selectPage }) {
    const open = (page) => {
        if (!wide)
            expandSidebar();
        selectPage(page);
    };
    return (_jsxs("button", { type: "button", className: clsx(css.entry, !wide && css.rail), "data-memory-nav": true, "aria-label": "\u8BB0\u5FC6", onClick: () => { open('human'); }, children: [_jsx(IconDataOutline16, { size: wide ? 16 : 18, className: css.icon }), wide && _jsx("span", { className: css.label, children: "\u8BB0\u5FC6" })] }));
}
//# sourceMappingURL=MemorySidebarEntry.js.map