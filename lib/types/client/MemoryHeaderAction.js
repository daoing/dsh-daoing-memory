import { jsx as _jsx } from "react/jsx-runtime";
import css from './MemoryHeaderAction.module.css';
/**
 * Render the header entry. Clicking selects the first monitoring page, which
 * opens the workbench overlay. The button carries `data-memory-nav` so the
 * workbench's click-outside dismissal treats it as part of the monitoring
 * surface.
 * @param props - composed slot props.
 * @returns the capsule button.
 */
export function MemoryHeaderAction(props) {
    return (_jsx("button", { type: "button", className: css.memoryButton, "data-memory-nav": true, "aria-label": "\u8BB0\u5FC6\u76D1\u63A7", onClick: () => { props.selectPage('experience'); }, children: _jsx("span", { children: "\u8BB0\u5FC6" }) }));
}
//# sourceMappingURL=MemoryHeaderAction.js.map