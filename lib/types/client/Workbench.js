import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Memory workbench takeover: covers the frame area to the right of the
 * sidebar while a monitoring page is selected in the left-sidebar memory nav
 * group. The header title follows the selected page; opening a session row
 * clears the selection and returns to the native conversation view. All human
 * mutations go through the audited Remote callbacks.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { bindMemoryActions } from "./actions.js";
import { MEMORY_NAV_ITEMS } from "./navStore.js";
import { ExperiencePage } from "./ExperiencePage.js";
import { FactDiaryPage } from "./FactDiaryPage.js";
import { LedgerPage } from "./LedgerPage.js";
import { HumanOpsPage } from "./HumanOpsPage.js";
import css from './Workbench.module.css';
/** Format an epoch-ms timestamp as a compact local string. */
export function formatTs(ts) {
    return new Date(ts).toLocaleString('zh-CN', { hour12: false });
}
/** Confirmation prompt with an audited reason; resolves undefined when cancelled. */
export function promptReason(action) {
    const reason = window.prompt(`「${action}」将写入审计账本。请填写原因（必填）：`);
    if (reason === null)
        return undefined;
    const trimmed = reason.trim();
    if (trimmed === '') {
        window.alert('原因是必填项：人工操作必须可审计。');
        return undefined;
    }
    return trimmed;
}
/**
 * The workbench entry component. Renders nothing unless a monitoring page is
 * selected in the nav store and a current session exists (the Remote face is
 * session-bound).
 */
export function MemoryWorkbench(props) {
    const nav = props.useStore(s => s);
    const sessionList = props.useSessions(s => s);
    const sessionId = sessionList.current;
    const [info, setInfo] = useState(null);
    const [stats, setStats] = useState(null);
    const [sidebarWidth, setSidebarWidth] = useState(260);
    const rootRef = useRef(null);
    const fetchInfo = props.workbenchInfo;
    const fetchStats = props.stats;
    useEffect(() => {
        if (sessionId === undefined)
            return;
        let cancelled = false;
        void fetchInfo(sessionId).then((value) => {
            if (!cancelled)
                setInfo(value);
        }).catch(() => { });
        return () => { cancelled = true; };
    }, [fetchInfo, sessionId]);
    const refreshStats = useCallback(() => {
        if (sessionId === undefined)
            return;
        void fetchStats(sessionId).then(setStats).catch(() => { });
    }, [fetchStats, sessionId]);
    useEffect(() => {
        if (info === null)
            return;
        refreshStats();
        const timer = setInterval(refreshStats, 15000);
        return () => { clearInterval(timer); };
    }, [info, refreshStats, nav.page]);
    const active = nav.page !== null && info !== null && sessionId !== undefined;
    // Opening a session returns to the native conversation view: clear the nav
    // selection whenever the current session changes. Never fires on mount —
    // the store survives remounts, so the initial ref value is the baseline.
    // Clicking outside the takeover (a session row, New Session, settings —
    // anything but the memory nav group and the panel itself) returns to the
    // native view. Click-outside is the deterministic dismissal signal: opening
    // an already-current session reuses it without moving `current`, so a
    // session-change watch alone would miss the gesture.
    useEffect(() => {
        if (!active)
            return;
        const onPointerDown = (event) => {
            const target = event.target;
            if (!(target instanceof Element))
                return;
            if (target.closest('[data-memory-workbench]') !== null)
                return;
            if (target.closest('[data-memory-nav]') !== null)
                return;
            props.actions.clear();
        };
        window.addEventListener('pointerdown', onPointerDown, true);
        return () => { window.removeEventListener('pointerdown', onPointerDown, true); };
    }, [active, props.actions]);
    // Belt and braces: a genuine current-session change (quick-open, another
    // tab's session) also returns to the conversation. The ref baseline keeps
    // the mount-time restore of the persisted selection from clearing.
    const prevSession = useRef(sessionId);
    useEffect(() => {
        if (prevSession.current === sessionId)
            return;
        prevSession.current = sessionId;
        props.actions.clear();
    }, [sessionId, props.actions]);
    // Measure the sidebar column so the panel starts exactly where it ends. The
    // slot renderer wraps each entry in its own div, so walk up to the overlay
    // layer (the stable data-shell-overlay hook) and take the frame's first
    // child — the sidebar column.
    useEffect(() => {
        if (!active)
            return;
        const root = rootRef.current;
        if (root === null)
            return;
        const layer = root.closest('[data-shell-overlay]');
        const frame = layer?.parentElement ?? null;
        const sidebar = frame?.firstElementChild ?? null;
        if (!(sidebar instanceof HTMLElement))
            return;
        const update = () => { setSidebarWidth(sidebar.getBoundingClientRect().width); };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(sidebar);
        return () => { observer.disconnect(); };
    }, [active]);
    // The pages call the session-free face; bind once per current session. The
    // injected Remote callbacks are minted once per plugin activation, so only a
    // session change rebuilds the bound face (a remount rebuilds the component).
    const bound = useMemo(() => (sessionId === undefined ? null : bindMemoryActions(props, sessionId)), 
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable injected face, see comment above
    [sessionId]);
    if (!active || info === null || bound === null)
        return null;
    const current = MEMORY_NAV_ITEMS.find(item => item.key === nav.page);
    const title = current?.label ?? info.workspaceTitle;
    return (_jsxs("div", { ref: rootRef, className: css.panel, style: { left: `${String(sidebarWidth)}px` }, "data-memory-workbench": true, children: [_jsxs("header", { className: css.header, children: [_jsxs("div", { className: css.titleBlock, children: [_jsx("span", { className: css.title, children: title }), _jsx("span", { className: css.subtitle, children: "\u81EA\u8FDB\u5316\u8BB0\u5FC6 \u00B7 \u751F\u7528\u4FEE\u8BB0 \u00B7 \u5168\u5C40\u5171\u4EAB\u8BB0\u5FC6\u5E93" })] }), _jsx("div", { className: css.statline, children: stats === null
                            ? '加载中…'
                            : `经验 ${String(stats.experiences.total)}（live ${String(stats.experiences.byStatus.live)} / 隔离 ${String(stats.experiences.byStatus.challenged)}）· 画像 ${String(stats.facts.current)} · 日记 ${String(stats.diary.total)}（待提取 ${String(stats.diary.unextracted)}）· 账本 ${String(stats.ledgerBlocks)} 块` })] }), _jsxs("main", { className: css.body, children: [nav.page === 'experience' && _jsx(ExperiencePage, { actions: bound, onChanged: refreshStats }), nav.page === 'fact' && _jsx(FactDiaryPage, { actions: bound, onChanged: refreshStats }), nav.page === 'ledger' && _jsx(LedgerPage, { actions: bound }), nav.page === 'human' && _jsx(HumanOpsPage, { actions: bound, onChanged: refreshStats })] })] }));
}
//# sourceMappingURL=Workbench.js.map