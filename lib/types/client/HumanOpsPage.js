import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Human management page: the fixed-format injection and editing forms.
 * Human additions use the ordinary experience/fact structure (fixed format);
 * every submit collects an audited reason and lands in the ledger as
 * actor=human. Pin/delete/edit verbs also live on the monitoring pages.
 */
import { useState } from 'react';
import { promptReason } from "./Workbench.js";
import css from './Workbench.module.css';
const CATEGORIES = ['identity', 'preference', 'communication', 'habit', 'thinking', 'value', 'delegation', 'background', 'other'];
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
/** Split a textarea into trimmed non-empty lines. */
function lines(text) {
    return text.split('\n').map(line => line.trim()).filter(line => line !== '');
}
/** The human management page. */
export function HumanOpsPage({ actions, onChanged }) {
    // Experience injection draft (fixed format).
    const [kind, setKind] = useState('positive');
    const [family, setFamily] = useState('');
    const [gist, setGist] = useState('');
    const [situation, setSituation] = useState('');
    const [path, setPath] = useState('');
    const [reasoning, setReasoning] = useState('');
    const [limits, setLimits] = useState('');
    const [failureReason, setFailureReason] = useState('');
    const [addContext, setAddContext] = useState('');
    // 摄取归一 draft: provenance + one candidate (earned, not direct-live).
    const [ingestSourceType, setIngestSourceType] = useState('other');
    const [ingestSourceRef, setIngestSourceRef] = useState('');
    const [ingestContext, setIngestContext] = useState('');
    const [ingestKind, setIngestKind] = useState('positive');
    const [ingestFamily, setIngestFamily] = useState('');
    const [ingestGist, setIngestGist] = useState('');
    const [ingestSituation, setIngestSituation] = useState('');
    const [ingestPath, setIngestPath] = useState('');
    const [ingestReasoning, setIngestReasoning] = useState('');
    const [ingestLimits, setIngestLimits] = useState('');
    const [ingestFailureReason, setIngestFailureReason] = useState('');
    // Experience edit draft.
    const [editId, setEditId] = useState('');
    const [editGist, setEditGist] = useState('');
    const [editLimits, setEditLimits] = useState('');
    const [editContext, setEditContext] = useState('');
    const [editGlobalFlag, setEditGlobalFlag] = useState(false);
    // Fact add draft.
    const [factCategory, setFactCategory] = useState('preference');
    const [factKey, setFactKey] = useState('');
    const [factValue, setFactValue] = useState('');
    const [factLocked, setFactLocked] = useState(true);
    const [notice, setNotice] = useState(null);
    const [error, setError] = useState(null);
    const report = (message) => { setNotice(message); setError(null); onChanged(); };
    const fail = (e) => { setError(e instanceof Error ? e.message : String(e)); setNotice(null); };
    const submitExperience = async () => {
        const reason = promptReason('人工注入经验（固定格式）');
        if (reason === undefined)
            return;
        if (gist.trim() === '' || family.trim() === '' || situation.trim() === '' || path.trim() === '' || reasoning.trim() === '') {
            setError('固定格式不完整：任务族、摘要、情境、路径、判断背景均为必填。');
            return;
        }
        if (kind === 'negative' && failureReason.trim() === '') {
            setError('负经验必须填写确认的失败原因。');
            return;
        }
        try {
            const snapshot = await actions.humanAddExperience({
                kind,
                family: family.trim(),
                gist: gist.trim(),
                situation: lines(situation),
                path: lines(path).map((action, index) => ({ order: index + 1, action })),
                reasoning: reasoning.trim(),
                limits: lines(limits),
                ...(failureReason.trim() === '' ? {} : { failureReason: failureReason.trim() }),
                ...(addContext.trim() === '' ? {} : { context: addContext.trim() }),
                reason,
            });
            report(`已注入人工经验 [${snapshot.id}]（直接 live，置信下限 ${snapshot.trust.toFixed(2)}）`);
            setGist('');
            setSituation('');
            setPath('');
            setReasoning('');
            setLimits('');
            setFailureReason('');
            setAddContext('');
        }
        catch (e) {
            fail(e);
        }
    };
    const submitIngest = async () => {
        if (ingestSourceRef.trim() === '') {
            setError('摄取必须填写出处（sourceRef，如书名/技能名/会话 id）。');
            return;
        }
        if (ingestFamily.trim() === '' || ingestGist.trim() === '' || ingestSituation.trim() === '' || ingestPath.trim() === '' || ingestReasoning.trim() === '') {
            setError('摄取不完整：任务族、摘要、情境、路径、判断背景均为必填。');
            return;
        }
        if (ingestKind === 'negative' && ingestFailureReason.trim() === '') {
            setError('负经验必须填写确认的失败原因。');
            return;
        }
        const reason = promptReason('人工摄取（固定格式 + 出处，产出候选待验证）');
        if (reason === undefined)
            return;
        try {
            const result = await actions.ingest({
                sourceType: ingestSourceType,
                sourceRef: ingestSourceRef.trim(),
                ...(ingestContext.trim() === '' ? {} : { context: ingestContext.trim() }),
                note: reason,
                experiences: [{
                        kind: ingestKind,
                        family: ingestFamily.trim(),
                        gist: ingestGist.trim(),
                        situation: lines(ingestSituation),
                        path: lines(ingestPath).map((action, index) => ({ order: index + 1, action })),
                        reasoning: ingestReasoning.trim(),
                        limits: lines(ingestLimits),
                        ...(ingestFailureReason.trim() === '' ? {} : { failureReason: ingestFailureReason.trim() }),
                    }],
            });
            if (result.rejected.length > 0) {
                setError(`摄取部分拒收：${result.rejected.map(r => `${r.gist}（${r.reason}）`).join('；')}`);
            }
            else {
                report(`已摄取 ${String(result.accepted.length)} 条候选（初始置信先验 ${result.sourcePrior.alpha}/${result.sourcePrior.beta}，待验证转正）`);
            }
            setIngestSourceRef('');
            setIngestGist('');
            setIngestSituation('');
            setIngestPath('');
            setIngestReasoning('');
            setIngestLimits('');
            setIngestFailureReason('');
        }
        catch (e) {
            fail(e);
        }
    };
    const submitEdit = async () => {
        if (editId.trim() === '') {
            setError('编辑需要先填写经验 id。');
            return;
        }
        const reason = promptReason('人工编辑经验');
        if (reason === undefined)
            return;
        try {
            const snapshot = await actions.humanEditExperience({
                id: editId.trim(),
                reason,
                ...(editGist.trim() === '' ? {} : { gist: editGist.trim() }),
                ...(editLimits.trim() === '' ? {} : { limits: lines(editLimits) }),
                ...(editContext.trim() === '' ? {} : { context: editContext.trim() }),
                globalFlag: editGlobalFlag,
            });
            report(`已编辑经验 [${snapshot.id}] v${String(snapshot.revision)}（原内容保留在账本载荷）`);
            setEditGist('');
            setEditLimits('');
            setEditContext('');
            setEditGlobalFlag(false);
        }
        catch (e) {
            fail(e);
        }
    };
    const submitFact = async () => {
        const reason = promptReason('人工添加画像');
        if (reason === undefined)
            return;
        if (factKey.trim() === '' || factValue.trim() === '') {
            setError('画像的键与值均为必填。');
            return;
        }
        try {
            const fact = await actions.humanAddFact({
                category: factCategory,
                factKey: factKey.trim(),
                value: factValue.trim(),
                locked: factLocked,
                reason,
            });
            report(`已添加画像「${fact.category}/${fact.factKey}」（${fact.locked ? '已锁定' : '未锁定'}）`);
            setFactKey('');
            setFactValue('');
        }
        catch (e) {
            fail(e);
        }
    };
    return (_jsxs("div", { className: css.page, children: [notice !== null && _jsx("div", { className: css.okLine, children: notice }), error !== null && _jsx("div", { className: css.error, children: error }), _jsxs("div", { className: css.columns, children: [_jsxs("section", { className: css.column, children: [_jsx("div", { className: css.sectionTitle, children: "\u51ED\u7A7A\u6DFB\u52A0\u7ECF\u9A8C\uFF08\u56FA\u5B9A\u683C\u5F0F = \u666E\u901A\u7ECF\u9A8C\u7ED3\u6784\uFF1B\u4EBA\u5DE5\u62C5\u4FDD\u76F4\u63A5 live\uFF0C\u7F6E\u4FE1\u4E0B\u9650\u7EA6 0.67\uFF09" }), _jsxs("div", { className: css.form, children: [_jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u7C7B\u578B" }), _jsxs("select", { value: kind, onChange: e => { setKind(e.target.value); }, children: [_jsx("option", { value: "positive", children: "\u6B63\u7ECF\u9A8C\uFF08\u53EF\u884C\u8DEF\u5F84\uFF09" }), _jsx("option", { value: "negative", children: "\u8D1F\u7ECF\u9A8C\uFF08\u786E\u8BA4\u6B7B\u8DEF\uFF09" })] })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u4EFB\u52A1\u65CF *" }), _jsx("input", { value: family, placeholder: "\u5982 windows-build", onChange: e => { setFamily(e.target.value); } })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u4E00\u53E5\u8BDD\u6458\u8981 *" }), _jsx("input", { value: gist, onChange: e => { setGist(e.target.value); } })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u9002\u7528\u60C5\u5883 *\uFF08\u6BCF\u884C\u4E00\u6761\uFF09" }), _jsx("textarea", { rows: 3, value: situation, onChange: e => { setSituation(e.target.value); } })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u8DEF\u5F84\u6B65\u9AA4 *\uFF08\u6BCF\u884C\u4E00\u6B65\uFF0C\u6309\u987A\u5E8F\uFF09" }), _jsx("textarea", { rows: 4, value: path, onChange: e => { setPath(e.target.value); } })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u5224\u65AD\u80CC\u666F *" }), _jsx("textarea", { rows: 2, value: reasoning, onChange: e => { setReasoning(e.target.value); } })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u4E0D\u9002\u7528\u8FB9\u754C\uFF08\u6BCF\u884C\u4E00\u6761\uFF09" }), _jsx("textarea", { rows: 2, value: limits, onChange: e => { setLimits(e.target.value); } })] }), kind === 'negative' && (_jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u786E\u8BA4\u7684\u5931\u8D25\u539F\u56E0 *" }), _jsx("input", { value: failureReason, onChange: e => { setFailureReason(e.target.value); } })] })), _jsxs("label", { className: css.field, title: "\u4F5C\u7528\u57DF\uFF1A\u8BE5\u7ECF\u9A8C\u9002\u7528\u7684\u9886\u57DF/\u4E0A\u4E0B\u6587\uFF1B\u7559\u7A7A\u4E3A\u65E0\u4F5C\u7528\u57DF", children: [_jsx("span", { children: "\u4F5C\u7528\u57DF\uFF08\u53EF\u9009\uFF09" }), _jsx("input", { value: addContext, placeholder: "\u5982 coding-windows-build", onChange: e => { setAddContext(e.target.value); } })] }), _jsx("button", { type: "button", className: css.btn, onClick: () => { void submitExperience(); }, children: "\u6CE8\u5165\u7ECF\u9A8C\uFF08\u9700\u586B\u5199\u539F\u56E0\uFF09" })] }), _jsx("div", { className: css.sectionTitle, children: "\u6444\u53D6\u5F52\u4E00\uFF08\u4ECE\u5916\u90E8\u6765\u6E90\u5B66\u4E60\uFF1A\u4E66/\u6280\u80FD/\u6587\u6863/\u4F1A\u8BDD\uFF1B\u4EA7\u51FA\u5019\u9009\u5F85\u9A8C\u8BC1\uFF0C\u4E0D\u76F4\u63A5 live\uFF09" }), _jsxs("div", { className: css.form, children: [_jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u6765\u6E90\u7C7B\u578B" }), _jsxs("select", { value: ingestSourceType, onChange: e => { setIngestSourceType(e.target.value); }, children: [_jsx("option", { value: "other", children: "other\uFF08\u5176\u4ED6\uFF09" }), _jsx("option", { value: "note", children: "note\uFF08\u7B14\u8BB0\uFF09" }), _jsx("option", { value: "conversation", children: "conversation\uFF08\u4F1A\u8BDD\uFF09" }), _jsx("option", { value: "document", children: "document\uFF08\u6587\u6863\uFF09" }), _jsx("option", { value: "book", children: "book\uFF08\u4E66\u7C4D\uFF09" }), _jsx("option", { value: "skill", children: "skill\uFF08\u6280\u80FD\uFF09" })] })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u51FA\u5904 *\uFF08sourceRef\uFF09" }), _jsx("input", { value: ingestSourceRef, placeholder: "\u4E66\u540D/\u6280\u80FD\u540D/\u4F1A\u8BDD id\uFF08\u53EF\u5BA1\u8BA1\uFF09", onChange: e => { setIngestSourceRef(e.target.value); } })] }), _jsxs("label", { className: css.field, title: "\u4F5C\u7528\u57DF\uFF1A\u6444\u53D6\u51FA\u7684\u5019\u9009\u9002\u7528\u7684\u9886\u57DF/\u4E0A\u4E0B\u6587", children: [_jsx("span", { children: "\u4F5C\u7528\u57DF\uFF08\u53EF\u9009\uFF09" }), _jsx("input", { value: ingestContext, placeholder: "\u5982 coding-windows-build", onChange: e => { setIngestContext(e.target.value); } })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u7C7B\u578B" }), _jsxs("select", { value: ingestKind, onChange: e => { setIngestKind(e.target.value); }, children: [_jsx("option", { value: "positive", children: "\u6B63\u7ECF\u9A8C\uFF08\u53EF\u884C\u8DEF\u5F84\uFF09" }), _jsx("option", { value: "negative", children: "\u8D1F\u7ECF\u9A8C\uFF08\u786E\u8BA4\u6B7B\u8DEF\uFF09" })] })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u4EFB\u52A1\u65CF *" }), _jsx("input", { value: ingestFamily, placeholder: "\u5982 windows-build", onChange: e => { setIngestFamily(e.target.value); } })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u4E00\u53E5\u8BDD\u6458\u8981 *" }), _jsx("input", { value: ingestGist, onChange: e => { setIngestGist(e.target.value); } })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u9002\u7528\u60C5\u5883 *\uFF08\u6BCF\u884C\u4E00\u6761\uFF09" }), _jsx("textarea", { rows: 3, value: ingestSituation, onChange: e => { setIngestSituation(e.target.value); } })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u8DEF\u5F84\u6B65\u9AA4 *\uFF08\u6BCF\u884C\u4E00\u6B65\uFF0C\u6309\u987A\u5E8F\uFF09" }), _jsx("textarea", { rows: 4, value: ingestPath, onChange: e => { setIngestPath(e.target.value); } })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u5224\u65AD\u80CC\u666F *" }), _jsx("textarea", { rows: 2, value: ingestReasoning, onChange: e => { setIngestReasoning(e.target.value); } })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u4E0D\u9002\u7528\u8FB9\u754C\uFF08\u6BCF\u884C\u4E00\u6761\uFF09" }), _jsx("textarea", { rows: 2, value: ingestLimits, onChange: e => { setIngestLimits(e.target.value); } })] }), ingestKind === 'negative' && (_jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u786E\u8BA4\u7684\u5931\u8D25\u539F\u56E0 *" }), _jsx("input", { value: ingestFailureReason, onChange: e => { setIngestFailureReason(e.target.value); } })] })), _jsx("button", { type: "button", className: css.btn, onClick: () => { void submitIngest(); }, children: "\u6444\u53D6\uFF08\u4EA7\u51FA\u5019\u9009\uFF0C\u9700\u586B\u5199\u539F\u56E0\uFF09" })] }), _jsx("div", { className: css.sectionTitle, children: "\u4EBA\u5DE5\u6DFB\u52A0\u753B\u50CF\uFF08\u9ED8\u8BA4\u9501\u5B9A\uFF1A\u63D0\u53D6\u51B2\u7A81\u4E0D\u4F1A\u81EA\u52A8\u53D6\u4EE3\uFF09" }), _jsxs("div", { className: css.form, children: [_jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u5206\u7C7B" }), _jsx("select", { value: factCategory, onChange: e => { setFactCategory(e.target.value); }, children: CATEGORIES.map(value => _jsxs("option", { value: value, children: [value, "\uFF08", CATEGORY_LABELS[value], "\uFF09"] }, value)) })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u952E *" }), _jsx("input", { value: factKey, placeholder: "\u5982 timezone", onChange: e => { setFactKey(e.target.value); } })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u503C *" }), _jsx("input", { value: factValue, onChange: e => { setFactValue(e.target.value); } })] }), _jsxs("label", { className: css.check, children: [_jsx("input", { type: "checkbox", checked: factLocked, onChange: e => { setFactLocked(e.target.checked); } }), "\u7ACB\u5373\u9501\u5B9A\uFF08\u4EBA\u5DE5\u786E\u8BA4\uFF09"] }), _jsx("button", { type: "button", className: css.btn, onClick: () => { void submitFact(); }, children: "\u6DFB\u52A0\u753B\u50CF\uFF08\u9700\u586B\u5199\u539F\u56E0\uFF09" })] })] }), _jsxs("section", { className: css.column, children: [_jsx("div", { className: css.sectionTitle, children: "\u7F16\u8F91\u65E2\u6709\u7ECF\u9A8C\uFF08\u6309 id\uFF1B\u5B8C\u6574\u7F16\u8F91\u8BF7\u914D\u5408\u7ECF\u9A8C\u5E93\u76D1\u63A7\u9875\u7684\u8BE6\u60C5\uFF09" }), _jsxs("div", { className: css.form, children: [_jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u7ECF\u9A8C id *" }), _jsx("input", { value: editId, placeholder: "\u4ECE\u8D26\u672C\u6216\u7ECF\u9A8C\u5217\u8868\u590D\u5236", onChange: e => { setEditId(e.target.value); } })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u65B0\u6458\u8981\uFF08\u7559\u7A7A\u4E0D\u6539\uFF09" }), _jsx("input", { value: editGist, onChange: e => { setEditGist(e.target.value); } })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u65B0\u4E0D\u9002\u7528\u8FB9\u754C\uFF08\u6BCF\u884C\u4E00\u6761\uFF0C\u7559\u7A7A\u4E0D\u6539\uFF09" }), _jsx("textarea", { rows: 3, value: editLimits, onChange: e => { setEditLimits(e.target.value); } })] }), _jsxs("label", { className: css.field, title: "\u4F5C\u7528\u57DF\uFF1A\u7559\u7A7A\u4E0D\u6539\uFF1B\u586B\u5199\u5219\u6539\u5199\u8BE5\u7ECF\u9A8C\u7684\u4F5C\u7528\u57DF", children: [_jsx("span", { children: "\u65B0\u4F5C\u7528\u57DF\uFF08\u7559\u7A7A\u4E0D\u6539\uFF09" }), _jsx("input", { value: editContext, placeholder: "\u5982 coding-windows-build", onChange: e => { setEditContext(e.target.value); } })] }), _jsxs("label", { className: css.check, children: [_jsx("input", { type: "checkbox", checked: editGlobalFlag, onChange: e => { setEditGlobalFlag(e.target.checked); } }), "\u5168\u5C40\u4F5C\u7528\u57DF\uFF08\u52FE\u9009 = \u8DE8\u9886\u57DF\u53EF\u53EC\u56DE\uFF1B\u53D6\u6D88 = \u4EC5\u672C\u4F5C\u7528\u57DF\uFF09"] }), _jsx("button", { type: "button", className: css.btn, onClick: () => { void submitEdit(); }, children: "\u4FDD\u5B58\u7F16\u8F91\uFF08\u9700\u586B\u5199\u539F\u56E0\uFF09" })] }), _jsx("div", { className: css.sectionTitle, children: "\u4EBA\u5DE5\u64CD\u4F5C\u7EAA\u5F8B" }), _jsxs("ul", { className: css.rules, children: [_jsx("li", { children: "\u6C38\u4E45\u6807\u8BB0\uFF1A\u7F6E\u9876\u4FE1\u4EFB\uFF08\u7F6E\u4FE1\u4E0D\u4F4E\u4E8E 0.67\uFF09\u4E14\u8C41\u514D\u6CE8\u5165\u9884\u7B97\u9000\u5F79\u3002" }), _jsx("li", { children: "\u5220\u9664\uFF1A\u5168\u5BB6\u65CF\u5893\u7891\uFF0C\u6307\u7EB9\u4FDD\u7559\u5728\u8D26\u672C\uFF0C\u53EF\u5BA1\u8BA1\u4E0D\u53EF\u6062\u590D\u3002" }), _jsx("li", { children: "\u7F16\u8F91\uFF1A\u5C31\u5730\u6539\u5199\u6D3B\u52A8\u7248\u672C\uFF0C\u539F\u5185\u5BB9\u4FDD\u7559\u5728\u8D26\u672C\u8F7D\u8377\u3002" }), _jsx("li", { children: "\u51ED\u7A7A\u6DFB\u52A0\uFF1A\u56FA\u5B9A\u683C\u5F0F\u3001\u4EBA\u5DE5\u62C5\u4FDD\u3001\u76F4\u63A5 live\u3001\u7F6E\u4FE1\u4E0B\u9650\u7EA6 0.67\u3002" }), _jsx("li", { children: "\u6444\u53D6\u5F52\u4E00\uFF1A\u5E26\u51FA\u5904\u4EA7\u51FA\u5019\u9009\uFF08\u521D\u59CB\u6309\u6765\u6E90\u5148\u9A8C\uFF09\uFF0C\u987B\u7ECF\u9A8C\u8BC1\u624D\u8F6C\u6B63\u3002" }), _jsx("li", { children: "\u4F5C\u7528\u57DF\uFF1A\u9ED8\u8BA4\u672C\u4F5C\u7528\u57DF\uFF1B\u53EF\u52FE\u9009\u5168\u5C40\uFF08\u8DE8\u9886\u57DF\u53EF\u53EC\u56DE\uFF09\u3002" }), _jsx("li", { children: "\u51B7\u5BAB\uFF1A\u5019\u9009\u8BD5\u63A2\u5931\u8D25\u5373\u5165\u51B7\u5BAB\uFF0C\u53EA\u6709\u4EBA\u5DE5\u53EF\u653E\u56DE\u5019\u9009\u6216\u5220\u9664\u3002" }), _jsx("li", { children: "\u6240\u6709\u4EBA\u5DE5\u64CD\u4F5C\u5F3A\u5236\u586B\u5199\u539F\u56E0\uFF0C\u8D26\u672C actor=human\u3002" })] })] })] })] }));
}
//# sourceMappingURL=HumanOpsPage.js.map