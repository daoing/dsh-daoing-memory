import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import clsx from 'clsx';
import { IconChevronDownOutline14, IconDataOutline16 } from '@deepseek-ai/dsh-client-ui-primitives';
import { MEMORY_NAV_ITEMS } from "./navStore.js";
import css from './MemoryNavSection.module.css';
/**
 * Render the nav group. The rail variant is a single icon: it selects the
 * first page and expands the sidebar so the group becomes visible.
 * @param props - composed slot props.
 * @returns the group element tree.
 */
export function MemoryNavSection(props) {
    const { wide, expandSidebar } = props;
    const nav = props.useStore(s => s);
    if (!wide) {
        return (_jsx("button", { type: "button", className: css.rail, "aria-label": "\u8BB0\u5FC6\u76D1\u63A7", "data-memory-nav": true, onClick: () => {
                props.actions.select('experience');
                expandSidebar();
            }, children: _jsx(IconDataOutline16, { size: 18 }) }));
    }
    return (_jsxs("nav", { className: css.group, "aria-label": "\u8BB0\u5FC6\u76D1\u63A7", "data-memory-nav": true, children: [_jsxs("button", { type: "button", className: css.header, "aria-expanded": !nav.collapsed, onClick: () => { props.actions.toggleCollapsed(); }, children: [_jsx(IconChevronDownOutline14, { size: 14, className: clsx(css.chevron, nav.collapsed && css.chevronCollapsed) }), _jsx("span", { className: css.headerLabel, children: "\u8BB0\u5FC6\u76D1\u63A7" })] }), !nav.collapsed && (_jsx("div", { className: css.items, children: MEMORY_NAV_ITEMS.map((item) => (_jsx("button", { type: "button", className: clsx(css.item, nav.page === item.key && css.itemActive), "aria-current": nav.page === item.key ? 'page' : undefined, onClick: () => { props.actions.select(item.key); }, children: item.label }, item.key))) }))] }));
}
//# sourceMappingURL=MemoryNavSection.js.map