import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { IconDataOutline16 } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './MemoryFooterAction.module.css';
/**
 * Render the footer entry. The wide variant shows an icon + label button;
 * the rail variant is a single icon. Clicking selects the first monitoring
 * page, which opens the workbench overlay.
 * @param props - composed slot props.
 * @returns the action button.
 */
export function MemoryFooterAction(props) {
    const { wide } = props;
    return (_jsxs("button", { type: "button", className: css.action, "data-memory-nav": true, "aria-label": "\u8BB0\u5FC6\u76D1\u63A7", title: "\u8BB0\u5FC6\u76D1\u63A7", onClick: () => { props.actions.select('experience'); }, children: [_jsx(IconDataOutline16, { size: 18 }), wide && _jsx("span", { className: css.label, children: "\u8BB0\u5FC6" })] }));
}
//# sourceMappingURL=MemoryFooterAction.js.map