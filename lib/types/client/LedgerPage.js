import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Ledger page: the append-only hash-chained audit trail of every memory
 * mutation (agent and human alike), with filters, an end-to-end integrity
 * check, and the full-library export used by experiments and migration.
 */
import { useCallback, useEffect, useState } from 'react';
import { formatTs } from "./Workbench.js";
import css from './Workbench.module.css';
/** Chinese gloss for each ledger op so the audit trail reads naturally. */
const OP_LABELS = {
    refine: '提炼·生',
    corroborate: '佐证',
    adopt: '转正·用',
    promote: '提升',
    restore: '恢复',
    challenge: '隔离·修',
    use: '使用·用',
    supersede: '取代',
    archive: '归档',
    propose: '提议修订',
    'shadow-fail': '影子重放失败',
    'shadow-pass': '影子重放通过',
    rollback: '回滚',
    diary: '记日记·记',
    extract: '提取运行',
    'fact-extract': '提取画像·记',
    'fact-corroborate': '画像佐证',
    'fact-conflict': '画像冲突',
    'fact-supersede': '画像取代',
    'fact-add': '人工画像',
    'fact-edit': '人工编辑画像',
    'fact-delete': '人工删除画像',
    add: '人工添加',
    edit: '编辑',
    delete: '删除',
    'human-promote': '人工转正',
    'diary-ack': '日记已处理',
    'concern-new': '关心事项·新',
    'concern-mention': '关心事项·更新',
    'concern-status': '关心事项·状态',
    'concern-delete': '关心事项·删除',
};
/** Render an op with its Chinese gloss in parentheses. */
function opLabel(op) {
    const label = OP_LABELS[op];
    return label === undefined ? op : `${op}（${label}）`;
}
/** The audit ledger page. */
export function LedgerPage({ actions }) {
    const [objectType, setObjectType] = useState('');
    const [op, setOp] = useState('');
    const [objectId, setObjectId] = useState('');
    const [seqFrom, setSeqFrom] = useState('');
    const [seqTo, setSeqTo] = useState('');
    const [blocks, setBlocks] = useState([]);
    const [integrity, setIntegrity] = useState(null);
    const [checking, setChecking] = useState(false);
    const [expandedSeq, setExpandedSeq] = useState(null);
    const [error, setError] = useState(null);
    // View-side pagination (007 §2): the ledger itself is append-only and never
    // shrinks; we only page what is shown. Default page size 10 (most recent first).
    const [pageSize, setPageSize] = useState(10);
    const [page, setPage] = useState(0);
    const [total, setTotal] = useState(0);
    // Build the shared filter (everything except limit/offset) once.
    const filter = {
        ...(objectType === '' ? {} : { objectType: objectType }),
        ...(op === '' ? {} : { op }),
        ...(objectId.trim() === '' ? {} : { objectId: objectId.trim() }),
        ...(seqFrom.trim() === '' ? {} : { seqFrom: Number(seqFrom.trim()) }),
        ...(seqTo.trim() === '' ? {} : { seqTo: Number(seqTo.trim()) }),
    };
    const refresh = useCallback(() => {
        void actions.ledgerQuery({ ...filter, limit: pageSize, offset: page * pageSize })
            .then(setBlocks).catch((e) => {
            setError(e instanceof Error ? e.message : String(e));
        });
        void actions.ledgerQueryCount(filter).then(setTotal).catch(() => { });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [actions, objectType, op, objectId, seqFrom, seqTo, pageSize, page]);
    useEffect(() => { refresh(); }, [refresh]);
    // Any filter change snaps back to the first page.
    const applyFilter = useCallback((setter) => (v) => {
        setter(v);
        setPage(0);
    }, []);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const runIntegrity = useCallback(() => {
        setChecking(true);
        void actions.verifyLedger().then((result) => {
            setIntegrity(result);
            setChecking(false);
        }).catch(() => { setChecking(false); });
    }, [actions]);
    const runExport = useCallback(() => {
        void actions.exportLibrary().then((data) => {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `memory-export-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
            anchor.click();
            URL.revokeObjectURL(url);
        }).catch((e) => {
            setError(e instanceof Error ? e.message : String(e));
        });
    }, [actions]);
    return (_jsxs("div", { className: css.page, children: [_jsx("div", { className: css.empty, children: "\u8D26\u672C\u662F\u300C\u4FEE\u300D\u7684\u5BA1\u8BA1\u5E95\u5EA7\uFF1A\u6BCF\u4E00\u6B21\u751F\u00B7\u7528\u00B7\u4FEE\u00B7\u8BB0\u64CD\u4F5C\uFF08\u4EE3\u7406\u4E0E\u4EBA\u5DE5 alike\uFF09\u90FD\u8FFD\u52A0\u4E00\u5757\uFF0C \u5757\u5185\u542B\u4E0A\u4E00\u5757\u54C8\u5E0C\uFF0C\u5F62\u6210\u4E0D\u53EF\u7BE1\u6539\u7684\u54C8\u5E0C\u94FE\u3002\u5B83\u56DE\u7B54\u300C\u8C01\u3001\u5728\u4F55\u65F6\u3001\u5BF9\u54EA\u6761\u8BB0\u5FC6\u3001 \u505A\u4E86\u4EC0\u4E48\u3001\u4E3A\u4EC0\u4E48\u300D\u3002\u300C\u5B8C\u6574\u6027\u6821\u9A8C\u300D\u91CD\u7B97\u5168\u94FE\u9A8C\u8BC1\u65E0\u7BE1\u6539\uFF1B\u4EBA\u5DE5\u64CD\u4F5C\u5FC5\u987B\u586B\u539F\u56E0\u3002" }), _jsxs("div", { className: css.toolbar, children: [_jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u5BF9\u8C61\u7C7B\u578B" }), _jsxs("select", { value: objectType, onChange: e => { applyFilter(setObjectType)(e.target.value); }, children: [_jsx("option", { value: "", children: "\u5168\u90E8" }), _jsx("option", { value: "experience", children: "\u7ECF\u9A8C" }), _jsx("option", { value: "fact", children: "\u753B\u50CF" }), _jsx("option", { value: "diary", children: "\u65E5\u8BB0" }), _jsx("option", { value: "concern", children: "\u5173\u5FC3\u4E8B\u9879" }), _jsx("option", { value: "library", children: "\u5E93\u7EA7" })] })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u64CD\u4F5C" }), _jsxs("select", { value: op, onChange: e => { applyFilter(setOp)(e.target.value); }, children: [_jsx("option", { value: "", children: "\u5168\u90E8" }), Object.keys(OP_LABELS).map(key => (_jsx("option", { value: key, children: opLabel(key) }, key)))] })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u5BF9\u8C61 id" }), _jsx("input", { value: objectId, placeholder: "\u7ECF\u9A8C\u6216\u753B\u50CF id", onChange: e => { applyFilter(setObjectId)(e.target.value); } })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u5757\u53F7\u4ECE" }), _jsx("input", { value: seqFrom, placeholder: "\u5982 1", onChange: e => { applyFilter(setSeqFrom)(e.target.value); } })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u5230" }), _jsx("input", { value: seqTo, placeholder: "\u5982 100", onChange: e => { applyFilter(setSeqTo)(e.target.value); } })] }), _jsx("button", { type: "button", className: css.btn, onClick: refresh, children: "\u5237\u65B0" }), _jsx("button", { type: "button", className: css.btn, onClick: runIntegrity, disabled: checking, title: "\u4ECE\u7B2C 1 \u5757\u8D77\u9010\u5757\u91CD\u7B97\u54C8\u5E0C\u5E76\u4E0E\u5757\u5185\u5B58\u50A8\u7684\u54C8\u5E0C\u6BD4\u5BF9\uFF0C\u4EFB\u4F55\u7BE1\u6539\u90FD\u4F1A\u5BFC\u81F4\u65AD\u88C2", children: checking ? '校验中…' : '完整性校验' }), _jsx("button", { type: "button", className: css.btn, onClick: runExport, children: "\u5BFC\u51FA\u5168\u5E93 JSON" }), integrity !== null && (integrity.ok
                        ? _jsxs("span", { className: css.okLine, children: ["\u2713 \u54C8\u5E0C\u94FE\u5B8C\u6574\uFF08", String(integrity.checked), " \u5757\uFF09"] })
                        : _jsxs("span", { className: css.error, children: ["\u2717 \u54C8\u5E0C\u94FE\u5728 #", String(integrity.brokenAt ?? 0), " \u5904\u65AD\u88C2"] })), error !== null && _jsx("span", { className: css.error, children: error })] }), blocks.length === 0 && _jsx("div", { className: css.empty, children: "\u8D26\u672C\u4E3A\u7A7A\uFF1A\u8FD8\u6CA1\u6709\u4EFB\u4F55\u751F\u7528\u4FEE\u8BB0\u64CD\u4F5C\u3002" }), _jsxs("table", { className: css.table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "#" }), _jsx("th", { children: "\u65F6\u95F4" }), _jsx("th", { children: "\u64CD\u4F5C" }), _jsx("th", { children: "\u5BF9\u8C61" }), _jsx("th", { children: "\u884C\u52A8\u8005" }), _jsx("th", { children: "\u539F\u56E0" }), _jsx("th", { children: "\u8F7D\u8377" })] }) }), _jsx("tbody", { children: blocks.map(block => (_jsxs("tr", { children: [_jsx("td", { children: String(block.seq) }), _jsx("td", { children: formatTs(block.ts) }), _jsx("td", { children: _jsx("span", { className: `${css.badge} ${css.statusCandidate}`, children: opLabel(block.op) }) }), _jsxs("td", { children: [block.objectType, ":", block.objectId.slice(0, 8)] }), _jsx("td", { children: block.actor }), _jsx("td", { children: block.reason ?? '' }), _jsx("td", { children: _jsxs("div", { className: css.cellActions, children: [_jsx("div", { className: expandedSeq === block.seq ? css.payloadFull : css.valueCell, children: expandedSeq === block.seq ? block.payload : (block.payload.length > 80 ? `${block.payload.slice(0, 80)}…` : block.payload) }), block.payload.length > 80 && (_jsx("span", { className: css.payloadToggle, title: expandedSeq === block.seq ? '收起' : '展开', onClick: () => { setExpandedSeq(expandedSeq === block.seq ? null : block.seq); }, children: expandedSeq === block.seq ? '▾' : '▸' }))] }) })] }, block.seq))) })] }), _jsxs("div", { className: css.toolbar, children: [_jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u6BCF\u9875" }), _jsxs("select", { value: String(pageSize), onChange: e => { setPageSize(Number(e.target.value)); setPage(0); }, children: [_jsx("option", { value: "10", children: "10" }), _jsx("option", { value: "20", children: "20" }), _jsx("option", { value: "50", children: "50" })] })] }), _jsx("button", { type: "button", className: css.btn, disabled: page <= 0, onClick: () => { setPage(page - 1); }, children: "\u4E0A\u4E00\u9875" }), _jsxs("span", { className: css.cardMeta, children: ["\u7B2C ", String(page + 1), " / ", String(totalPages), " \u9875 \u00B7 \u5171 ", String(total), " \u5757"] }), _jsx("button", { type: "button", className: css.btn, disabled: page + 1 >= totalPages, onClick: () => { setPage(page + 1); }, children: "\u4E0B\u4E00\u9875" }), _jsx("span", { className: css.cardMeta, children: "\u8D26\u672C\u53EA\u589E\u4E0D\u5220\uFF08\u54C8\u5E0C\u94FE\u5BA1\u8BA1\uFF09\uFF1B\u6B64\u5904\u4EC5\u5206\u9875\u5C55\u793A\uFF0C\u4E0D\u5220\u9664\u4EFB\u4F55\u5757\u3002" })] })] }));
}
//# sourceMappingURL=LedgerPage.js.map