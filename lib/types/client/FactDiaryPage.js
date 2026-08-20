import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Profile·concerns page, split into two sub-pages: 关心事项 (open-loop memos) /
 * 画像分类 (the AI's perception of the user). The event-layer diary is the
 * append-only raw material and is surfaced only as per-fact provenance (来源日记),
 * not as its own browsing tab. Facts paginate server-side; concerns stay as an
 * expandable tree. All human mutations go through the audited Remote callbacks.
 */
import { Fragment, useCallback, useEffect, useState } from 'react';
import { formatTs, promptReason } from "./Workbench.js";
import css from './Workbench.module.css';
const CATEGORY_LABELS = {
    identity: '身份',
    preference: '偏好',
    communication: '沟通',
    habit: '习惯',
    thinking: '思维',
    value: '价值观',
    delegation: '委托',
    background: '背景',
    other: '其他·待裁决',
};
const CONCERN_KIND_LABELS = {
    todo: '待办',
    thinking: '思考',
    idea: '想法',
    question: '疑问',
    decision: '决定',
    commitment: '约定',
    other: '其他',
};
const CONCERN_STATUS_LABELS = {
    ongoing: '未闭环',
    concluded: '已闭环',
    recurring: '反复出现',
    paused: '搁置',
};
const DIARY_KIND_LABELS = {
    said: '用户说',
    delegated: '委托',
    promised: '承诺',
    happened: '事件',
    preference: '偏好变化',
    other: '其他',
};
/** The sub-pages under 画像·日记: open-loop concern memos + user-perception profile. Diary demoted to provenance. */
const TABS = [
    { key: 'concerns', label: '关心事项' },
    { key: 'facts', label: '画像分类' },
];
/** Shared page-size choices for the paginated sub-pages. */
function PageSizeSelect({ value, onChange }) {
    return (_jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u6BCF\u9875" }), _jsxs("select", { value: String(value), onChange: e => { onChange(Number(e.target.value)); }, children: [_jsx("option", { value: "10", children: "10" }), _jsx("option", { value: "20", children: "20" }), _jsx("option", { value: "50", children: "50" })] })] }));
}
/** Compact prev/next pager with a filtered total. */
function Pager({ page, pageSize, total, onPage }) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return (_jsxs("div", { className: css.toolbar, children: [_jsx("button", { type: "button", className: css.btn, disabled: page <= 0, onClick: () => { onPage(page - 1); }, children: "\u4E0A\u4E00\u9875" }), _jsxs("span", { className: css.cardMeta, children: ["\u7B2C ", String(page + 1), " / ", String(totalPages), " \u9875 \u00B7 \u5171 ", String(total), " \u6761 \u00B7 \u6700\u65B0\u5728\u524D"] }), _jsx("button", { type: "button", className: css.btn, disabled: page + 1 >= totalPages, onClick: () => { onPage(page + 1); }, children: "\u4E0B\u4E00\u9875" })] }));
}
/** The profile·concerns page with two sub-pages (diary demoted to per-fact provenance). */
export function FactDiaryPage({ actions, onChanged }) {
    const [tab, setTab] = useState('concerns');
    const [error, setError] = useState(null);
    // 关心事项
    // 关心事项（010 §D：kind/status 筛选 + 分页）
    const [concerns, setConcerns] = useState([]);
    const [openConcerns, setOpenConcerns] = useState({});
    const [concernKind, setConcernKind] = useState('');
    const [concernStatus, setConcernStatus] = useState('');
    const [concernPage, setConcernPage] = useState(0);
    const [concernPageSize, setConcernPageSize] = useState(10);
    const [concernTotal, setConcernTotal] = useState(0);
    // 画像分类（分页）
    const [category, setCategory] = useState('');
    const [includeHistory, setIncludeHistory] = useState(false);
    const [facts, setFacts] = useState([]);
    const [factPage, setFactPage] = useState(0);
    const [factPageSize, setFactPageSize] = useState(10);
    const [factTotal, setFactTotal] = useState(0);
    // 画像溯源（008 Path A）：每条画像可展开看它来自哪些日记。
    const [openFactSources, setOpenFactSources] = useState({});
    const [factSources, setFactSources] = useState({});
    const refresh = useCallback(() => {
        void actions.listConcerns(concernKind, concernStatus, concernPageSize, concernPage * concernPageSize).then(setConcerns).catch(() => { });
        void actions.listConcernsCount(concernKind, concernStatus).then(setConcernTotal).catch(() => { });
        void actions.listFacts(category, includeHistory, factPageSize, factPage * factPageSize).then(setFacts).catch((e) => {
            setError(e instanceof Error ? e.message : String(e));
        });
        void actions.listFactsCount(category, includeHistory).then(setFactTotal).catch(() => { });
    }, [actions, concernKind, concernStatus, concernPage, concernPageSize, category, includeHistory, factPage, factPageSize]);
    useEffect(() => { refresh(); }, [refresh]);
    const runConfirm = useCallback(async (fact) => {
        const verb = fact.locked ? '解除人工确认' : '人工确认（锁定，禁止自动取代）';
        const reason = promptReason(verb);
        if (reason === undefined)
            return;
        await actions.humanConfirmFact({ factId: fact.id, locked: !fact.locked, reason });
        refresh();
        onChanged();
    }, [actions, onChanged, refresh]);
    const runEditFact = useCallback(async (fact) => {
        const value = window.prompt(`编辑画像「${fact.category}/${fact.factKey}」的新值：`, fact.value);
        if (value === null || value.trim() === '')
            return;
        const reason = promptReason('人工编辑画像');
        if (reason === undefined)
            return;
        await actions.humanEditFact({ factId: fact.id, value: value.trim(), reason });
        refresh();
        onChanged();
    }, [actions, onChanged, refresh]);
    const runDeleteFact = useCallback(async (fact) => {
        const reason = promptReason(`删除画像「${fact.category}/${fact.factKey}」（墓碑保留）`);
        if (reason === undefined)
            return;
        await actions.humanDeleteFact({ factId: fact.id, reason });
        refresh();
        onChanged();
    }, [actions, onChanged, refresh]);
    const toggleConcern = useCallback((id) => {
        setOpenConcerns(prev => ({ ...prev, [id]: prev[id] !== true }));
    }, []);
    // 画像溯源：展开时按需拉取来源日记（只拉一次，缓存到 factSources）。
    const toggleFactSources = useCallback((fact) => {
        const opening = openFactSources[fact.id] !== true;
        setOpenFactSources(prev => ({ ...prev, [fact.id]: prev[fact.id] !== true }));
        if (opening && factSources[fact.id] === undefined && fact.sourceDiaryIds.length > 0) {
            void actions.getDiaryByIds(fact.sourceDiaryIds).then(entries => {
                setFactSources(prev => ({ ...prev, [fact.id]: entries }));
            }).catch(() => { setFactSources(prev => ({ ...prev, [fact.id]: [] })); });
        }
    }, [actions, openFactSources, factSources]);
    const runSetConcernStatus = useCallback(async (tree, status) => {
        const reason = promptReason(`把关心事项「${tree.concern.title}」改为 ${CONCERN_STATUS_LABELS[status] ?? status}`);
        if (reason === undefined)
            return;
        await actions.humanSetConcernStatus({ id: tree.concern.id, status, reason });
        refresh();
        onChanged();
    }, [actions, onChanged, refresh]);
    const runDeleteConcern = useCallback(async (tree) => {
        const reason = promptReason(`删除关心事项「${tree.concern.title}」及其更新（墓碑保留）`);
        if (reason === undefined)
            return;
        await actions.humanDeleteConcern({ id: tree.concern.id, reason });
        refresh();
        onChanged();
    }, [actions, onChanged, refresh]);
    return (_jsxs("div", { className: css.page, children: [_jsxs("div", { className: css.empty, children: ["\u300C\u8BB0\u300D\u7684\u4EA7\u7269\u5206\u4E24\u5C42\uFF1A", _jsx("b", { children: "\u753B\u50CF\u5206\u7C7B" }), "\u662F AI \u901A\u8FC7\u5BF9\u8BDD\u6C89\u6DC0\u51FA\u7684\"\u8FD9\u4E2A\u7528\u6237\u662F\u4EC0\u4E48\u6837\u7684\u4EBA\u3001\u600E\u4E48\u8DDF\u4ED6\u534F\u4F5C\"\uFF08\u7A33\u5B9A\u7279\u8D28\uFF0C\u6BCF\u6761\u53EF\u5C55\u5F00\u770B\u6765\u6E90\u65E5\u8BB0\uFF09\uFF1B", _jsx("b", { children: "\u5173\u5FC3\u4E8B\u9879" }), "\u662F\u66FF\u7528\u6237\u8BB0\u7740\u7684", _jsx("b", { children: "\u5F00\u73AF\u5907\u5FD8" }), "\u2014\u2014\u63D0\u8FC7\u8FD8\u6CA1\u529E\u7684\u4E8B\u3001\u5192\u51FA\u7684\u60F3\u6CD5\u3001\u60AC\u800C\u672A\u51B3\u7684\u95EE\u9898\u3001\u5F85\u5B9A\u7684\u51B3\u5B9A\u3001\u7B54\u5E94\u7684\u4E8B\u3002 \u4E8B\u4EF6\u5C42\u65E5\u8BB0\u662F\u539F\u6599\uFF08\u53EA\u589E\u4E0D\u5220\uFF09\uFF0C\u4E0D\u5355\u5217\u5B50\u9875\uFF0C\u4F5C\u4E3A\u753B\u50CF\u7684\"\u6765\u6E90\u65E5\u8BB0\"\u9732\u51FA\u3002\u63D0\u53D6\u662F\u5426\u5728\u8DD1\uFF0C\u770B\u53F3\u4E0A\u89D2\u300C\u5F85\u63D0\u53D6\u300D\u6570\u5373\u53EF\u3002"] }), _jsxs("div", { className: css.tabs, children: [TABS.map(t => (_jsx("button", { type: "button", className: tab === t.key ? `${css.tab} ${css.tabActive}` : css.tab, onClick: () => { setTab(t.key); }, children: t.label }, t.key))), _jsx("button", { type: "button", className: css.btn, onClick: refresh, style: { marginLeft: 'auto' }, children: "\u5237\u65B0" })] }), tab === 'concerns' && (_jsxs("section", { className: css.column, children: [_jsxs("div", { className: css.toolbar, children: [_jsx("span", { className: css.sectionTitle, children: "\u5173\u5FC3\u4E8B\u9879 \u00B7 \u5F00\u73AF\u5907\u5FD8\uFF08\u66FF\u4F60\u8BB0\u7740\u8FD8\u6CA1\u95ED\u73AF\u7684\u4E8B\uFF0C\u7528\u4E8E\u63D0\u9192\uFF09" }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u7C7B\u578B" }), _jsxs("select", { value: concernKind, onChange: e => { setConcernKind(e.target.value); setConcernPage(0); }, children: [_jsx("option", { value: "", children: "\u5168\u90E8" }), Object.entries(CONCERN_KIND_LABELS).map(([value, label]) => (_jsx("option", { value: value, children: label }, value)))] })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u72B6\u6001" }), _jsxs("select", { value: concernStatus, onChange: e => { setConcernStatus(e.target.value); setConcernPage(0); }, children: [_jsx("option", { value: "", children: "\u5168\u90E8" }), Object.entries(CONCERN_STATUS_LABELS).map(([value, label]) => (_jsx("option", { value: value, children: label }, value)))] })] }), _jsx(PageSizeSelect, { value: concernPageSize, onChange: v => { setConcernPageSize(v); setConcernPage(0); } })] }), concerns.length === 0 && _jsx("div", { className: css.empty, children: "\u8FD8\u6CA1\u6709\u5173\u5FC3\u4E8B\u9879\u3002\u4EE3\u7406\u63D0\u53D6\u65F6\uFF08memory_extract \u7684 concerns\uFF09\u4F1A\u6C89\u6DC0\u4F60\u63D0\u8FC7\u4F46\u8FD8\u6CA1\u95ED\u73AF\u7684\u4E8B\uFF1A\u5F85\u529E\u3001\u601D\u8003\u3001\u60F3\u6CD5\u3001\u7591\u95EE\u3001\u51B3\u5B9A\u3001\u7EA6\u5B9A\u3002" }), _jsx("div", { className: css.list, children: concerns.map(tree => (_jsxs("div", { className: css.card, children: [_jsxs("div", { className: css.cardHead, children: [_jsx("span", { className: css.payloadToggle, title: openConcerns[tree.concern.id] === true ? '收起更新' : '展开更新', onClick: () => { toggleConcern(tree.concern.id); }, children: openConcerns[tree.concern.id] === true ? '▾' : '▸' }), _jsx("span", { className: `${css.badge} ${css.statusCandidate}`, children: CONCERN_KIND_LABELS[tree.concern.kind ?? 'other'] ?? '其他' }), _jsx("span", { className: css.cardTitle, children: tree.concern.title }), _jsx("span", { className: `${css.badge} ${css.statusOther}`, children: CONCERN_STATUS_LABELS[tree.concern.status ?? 'ongoing'] ?? '未闭环' }), _jsxs("span", { className: css.cardMeta, children: ["\u66F4\u65B0 ", String(tree.mentions.length), " \u6B21"] })] }), tree.concern.background !== undefined && tree.concern.background !== '' && (_jsxs("div", { className: css.concernBg, children: ["\u80CC\u666F\uFF1A", tree.concern.background] })), openConcerns[tree.concern.id] === true && (_jsxs("div", { className: css.list, children: [tree.mentions.length === 0 && _jsx("div", { className: css.cardSub, children: _jsx("span", { className: css.cardMeta, children: "\u6682\u65E0\u540E\u7EED\u66F4\u65B0\u3002" }) }), tree.mentions.map(mention => (_jsxs("div", { className: css.cardSub, children: [_jsx("span", { className: css.cardMeta, children: formatTs(mention.ts) }), _jsx("span", { className: css.cardTitle, children: mention.title }), mention.sourceDiaryIds.length > 0 && (_jsxs("span", { className: css.cardMeta, children: ["\u2190 \u65E5\u8BB0 ", mention.sourceDiaryIds.map(id => id.slice(0, 6)).join('、')] }))] }, mention.id)))] })), _jsxs("div", { className: css.cardSub, children: [_jsxs("select", { value: tree.concern.status ?? 'ongoing', onChange: e => { void runSetConcernStatus(tree, e.target.value); }, children: [_jsx("option", { value: "ongoing", children: "\u672A\u95ED\u73AF" }), _jsx("option", { value: "concluded", children: "\u5DF2\u95ED\u73AF" }), _jsx("option", { value: "recurring", children: "\u53CD\u590D\u51FA\u73B0" }), _jsx("option", { value: "paused", children: "\u6401\u7F6E" })] }), _jsx("button", { type: "button", className: `${css.btn} ${css.btnDanger}`, onClick: () => { void runDeleteConcern(tree); }, children: "\u5220\u9664" })] })] }, tree.concern.id))) }), _jsx(Pager, { page: concernPage, pageSize: concernPageSize, total: concernTotal, onPage: setConcernPage })] })), tab === 'facts' && (_jsxs("section", { className: css.column, children: [_jsxs("div", { className: css.toolbar, children: [_jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u753B\u50CF\u5206\u7C7B" }), _jsxs("select", { value: category, onChange: e => { setCategory(e.target.value); setFactPage(0); }, children: [_jsx("option", { value: "", children: "\u5168\u90E8" }), Object.entries(CATEGORY_LABELS).map(([value, label]) => (_jsx("option", { value: value, children: label }, value)))] })] }), _jsxs("label", { className: css.check, children: [_jsx("input", { type: "checkbox", checked: includeHistory, onChange: e => { setIncludeHistory(e.target.checked); setFactPage(0); } }), "\u663E\u793A\u5386\u53F2\u7248\u672C\uFF08\u53CC\u65F6\u95F4\u8F74\uFF09"] }), _jsx(PageSizeSelect, { value: factPageSize, onChange: v => { setFactPageSize(v); setFactPage(0); } })] }), error !== null && _jsx("div", { className: css.error, children: error }), facts.length === 0 && _jsx("div", { className: css.empty, children: "\u6682\u65E0\u753B\u50CF\u6761\u76EE\u3002\u4EE3\u7406\u8BB0\u5F55\u65E5\u8BB0\u540E\u6309\u5468\u671F\u63D0\u53D6\uFF08memory_extract\uFF09\uFF0C\u6216\u5728\u672C\u9875\u300C\u4EBA\u5DE5\u7BA1\u7406\u300D\u4E2D\u76F4\u63A5\u6DFB\u52A0\u3002" }), _jsxs("table", { className: css.table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u5206\u7C7B/\u952E" }), _jsx("th", { children: "\u503C" }), _jsx("th", { children: "\u4F50\u8BC1" }), _jsx("th", { children: "\u6765\u6E90" }), _jsx("th", { children: "\u72B6\u6001" }), _jsx("th", { children: "\u751F\u6548\u8D77" }), _jsx("th", { children: "\u64CD\u4F5C" })] }) }), _jsx("tbody", { children: facts.map(fact => (_jsxs(Fragment, { children: [_jsxs("tr", { children: [_jsxs("td", { children: [CATEGORY_LABELS[fact.category] ?? fact.category, " / ", fact.factKey] }), _jsx("td", { className: css.valueCell, children: fact.value }), _jsxs("td", { children: ["\u00D7", String(fact.corroboration)] }), _jsx("td", { children: fact.sourceDiaryIds.length === 0
                                                        ? _jsx("span", { className: css.cardMeta, children: "\u4EBA\u5DE5/\u65E0" })
                                                        : (_jsxs("span", { className: css.cellActions, children: [_jsx("span", { className: css.payloadToggle, title: openFactSources[fact.id] === true ? '收起来源日记' : '展开来源日记', onClick: () => { toggleFactSources(fact); }, children: openFactSources[fact.id] === true ? '▾' : '▸' }), _jsxs("span", { className: css.cardMeta, children: ["\u2190 ", String(fact.sourceDiaryIds.length), " \u6761\u65E5\u8BB0"] })] })) }), _jsxs("td", { children: [fact.locked && _jsx("span", { className: `${css.badge} ${css.badgePinned}`, children: "\u5DF2\u786E\u8BA4" }), fact.conflictPending && _jsx("span", { className: `${css.badge} ${css.badgeConflict}`, children: "\u51B2\u7A81\u5F85\u88C1\u51B3" }), fact.validTo !== undefined && _jsx("span", { className: `${css.badge} ${css.statusOther}`, children: "\u5386\u53F2" })] }), _jsx("td", { children: formatTs(fact.validFrom) }), _jsxs("td", { className: css.cellActions, children: [_jsx("button", { type: "button", className: css.btn, onClick: () => { void runConfirm(fact); }, children: fact.locked ? '解锁' : '确认' }), _jsx("button", { type: "button", className: css.btn, onClick: () => { void runEditFact(fact); }, children: "\u7F16\u8F91" }), _jsx("button", { type: "button", className: `${css.btn} ${css.btnDanger}`, onClick: () => { void runDeleteFact(fact); }, children: "\u5220\u9664" })] })] }), openFactSources[fact.id] === true && (_jsx("tr", { children: _jsx("td", { colSpan: 7, children: _jsx("div", { className: css.list, children: (factSources[fact.id] ?? []).length === 0
                                                        ? _jsx("div", { className: css.cardSub, children: _jsx("span", { className: css.cardMeta, children: "\u52A0\u8F7D\u4E2D\u2026\uFF08\u6216\u6765\u6E90\u65E5\u8BB0\u5DF2\u4E0D\u5B58\u5728\uFF09" }) })
                                                        : (factSources[fact.id] ?? []).map(entry => (_jsxs("div", { className: css.cardSub, children: [_jsx("span", { className: `${css.badge} ${css.statusCandidate}`, children: DIARY_KIND_LABELS[entry.kind] ?? entry.kind }), _jsx("span", { className: css.cardTitle, children: entry.content }), _jsx("span", { className: css.cardMeta, children: formatTs(entry.ts) })] }, entry.id))) }) }) }))] }, fact.id))) })] }), _jsx(Pager, { page: factPage, pageSize: factPageSize, total: factTotal, onPage: setFactPage })] }))] }));
}
//# sourceMappingURL=FactDiaryPage.js.map