import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/**
 * Experience library monitoring page: lifecycle counters, a filterable
 * revision list with the Beta-posterior triple, expandable judgment context,
 * family revision history, and the human verbs (pin/promote/rollback/delete).
 */
import { useCallback, useEffect, useState } from 'react';
import { SYSTEM_EXPERIENCE_FAMILIES } from "../types.js";
import { formatTs, promptReason } from "./Workbench.js";
import css from './Workbench.module.css';
const STATUS_LABELS = {
    candidate: '候选',
    live: '生效',
    challenged: '已隔离',
    superseded: '已取代',
    archived: '已归档',
    cold: '冷宫',
};
const SKILL_STATUS_LABELS = {
    draft: '草稿',
    pending_review: '待审',
    approved: '已通过',
    published: '已发布',
    rejected: '已拒绝',
    deprecated: '已废弃',
    file_missing: '文件缺失',
    draft_lost: '草稿丢失',
    revising: '修订中',
    file_drift: '文件漂移',
};
const KIND_LABELS = {
    positive: '正经验',
    negative: '负经验',
};
function statusClass(status) {
    switch (status) {
        case 'live': return css.statusLive;
        case 'candidate': return css.statusCandidate;
        case 'challenged': return css.statusChallenged;
        case 'cold': return css.statusChallenged;
        default: return css.statusOther;
    }
}
/** Trust triple render: (置信度, 样本数, 最近验证时间). */
function TrustTriple({ e }) {
    const last = e.lastVerifiedAt === undefined ? '从未验证' : formatTs(e.lastVerifiedAt);
    return (_jsxs("span", { className: css.trust, title: `加权置信 ${e.weightedTrust.toFixed(3)}`, children: ["\u7F6E\u4FE1 ", e.trust.toFixed(2), " \u00B7 \u6837\u672C ", String(e.samples), " \u00B7 \u6700\u8FD1\u9A8C\u8BC1 ", last] }));
}
/** The experience library monitoring page. */
export function ExperiencePage({ actions, onChanged }) {
    const [statusFilter, setStatusFilter] = useState('');
    const [kindFilter, setKindFilter] = useState('');
    const [familyFilter, setFamilyFilter] = useState('');
    const [contextFilter, setContextFilter] = useState('');
    const [items, setItems] = useState([]);
    const [expanded, setExpanded] = useState(null);
    const [history, setHistory] = useState([]);
    const [error, setError] = useState(null);
    const [skillArtifacts, setSkillArtifacts] = useState([]);
    const refreshSkills = useCallback((experienceId) => {
        void actions.listSkillArtifacts(experienceId, '').then(setSkillArtifacts).catch(() => { setSkillArtifacts([]); });
    }, [actions]);
    const refresh = useCallback(() => {
        const filter = {};
        if (statusFilter !== '')
            filter.status = statusFilter;
        if (kindFilter !== '')
            filter.kind = kindFilter;
        if (familyFilter.trim() !== '')
            filter.family = familyFilter.trim();
        if (contextFilter.trim() !== '')
            filter.context = contextFilter.trim();
        void actions.listExperiences(filter).then(setItems).catch((e) => {
            setError(e instanceof Error ? e.message : String(e));
        });
    }, [actions, statusFilter, kindFilter, familyFilter, contextFilter]);
    useEffect(() => { refresh(); }, [refresh]);
    const toggleExpand = useCallback((item) => {
        const key = `${item.id}@${String(item.revision)}`;
        if (expanded === key) {
            setExpanded(null);
            setHistory([]);
            setSkillArtifacts([]);
            return;
        }
        setExpanded(key);
        void actions.family(item.id).then(setHistory).catch(() => { setHistory([]); });
        refreshSkills(item.id);
    }, [actions, expanded, refreshSkills]);
    const runPin = useCallback(async (item) => {
        const reason = await promptReason(item.pinned ? '取消永久标记' : '永久标记（置顶信任，豁免预算）');
        if (reason === undefined)
            return;
        await actions.humanPin({ id: item.id, pinned: !item.pinned, reason });
        refresh();
        onChanged();
    }, [actions, onChanged, refresh]);
    const runPromote = useCallback(async (item) => {
        const reason = await promptReason('人工转正（候选 → 生效，V2 人工权威）');
        if (reason === undefined)
            return;
        await actions.humanPromote(item.id, reason);
        refresh();
        onChanged();
    }, [actions, onChanged, refresh]);
    const runReleaseCold = useCallback(async (item) => {
        const reason = await promptReason('从冷宫放回候选（可再次被试探验证）');
        if (reason === undefined)
            return;
        await actions.humanReleaseCold({ id: item.id, reason });
        refresh();
        onChanged();
    }, [actions, onChanged, refresh]);
    const runDelete = useCallback(async (item) => {
        const isSystem = SYSTEM_EXPERIENCE_FAMILIES.has(item.family);
        if (isSystem) {
            const reason = await promptReason(`归档系统经验「${item.family}」（保留数据，移出活跃召回）`);
            if (reason === undefined)
                return;
            await actions.humanArchiveExperience({ id: item.id, reason });
        }
        else {
            const reason = await promptReason(`删除经验「${item.gist.slice(0, 24)}」（指纹保留在账本）`);
            if (reason === undefined)
                return;
            await actions.humanDeleteExperience({ id: item.id, reason });
        }
        refresh();
        onChanged();
    }, [actions, onChanged, refresh]);
    const runRollback = useCallback(async (item, toRevision) => {
        const reason = await promptReason(`回滚到 v${String(toRevision)}`);
        if (reason === undefined)
            return;
        await actions.humanRollback({ id: item.id, toRevision, reason });
        refresh();
        onChanged();
    }, [actions, onChanged, refresh]);
    const runGenerateSkill = useCallback(async (item, form) => {
        try {
            await actions.generateSkillDraft({ experienceId: item.id, form });
            refreshSkills(item.id);
            onChanged();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, [actions, onChanged, refreshSkills]);
    const runReviewSkill = useCallback(async (skillId, decision) => {
        const reason = await promptReason(decision === 'approve' ? '通过 skill 草稿' : '拒绝 skill 草稿');
        if (reason === undefined)
            return;
        try {
            await actions.reviewSkill({ id: skillId, decision, reason });
            // Refresh skills for the parent experience
            const sa = skillArtifacts.find(s => s.id === skillId);
            if (sa)
                refreshSkills(sa.parentExperienceId);
            onChanged();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, [actions, onChanged, refreshSkills, skillArtifacts]);
    const runPublishSkill = useCallback(async (skillId) => {
        const reason = await promptReason('发布 skill 到 $DSH_HOME/skills/');
        if (reason === undefined)
            return;
        try {
            await actions.publishSkill({ id: skillId, reason });
            const sa = skillArtifacts.find(s => s.id === skillId);
            if (sa)
                refreshSkills(sa.parentExperienceId);
            onChanged();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, [actions, onChanged, refreshSkills, skillArtifacts]);
    return (_jsxs("div", { className: css.page, children: [_jsx("div", { className: css.empty, children: "\u7ECF\u9A8C\u5E93\u662F\u300C\u751F\u00B7\u7528\u00B7\u4FEE\u300D\u7684\u8F7D\u4F53\uFF1A\u4EE3\u7406\u5728\u590D\u6742\u4EFB\u52A1\u540E\u63D0\u70BC\u7ECF\u9A8C\uFF08\u751F\uFF09\uFF0C\u76F8\u4F3C\u4EFB\u52A1\u524D\u53EC\u56DE\u6CE8\u5165\uFF08\u7528\uFF09\uFF0C \u5931\u8D25\u540E\u9694\u79BB/\u4FEE\u8BA2/\u56DE\u6EDA\uFF08\u4FEE\uFF09\u3002\u6BCF\u6761\u7ECF\u9A8C\u5E26\u7F6E\u4FE1\u5EA6\u00B7\u6837\u672C\u6570\u00B7\u6700\u8FD1\u9A8C\u8BC1\u65F6\u95F4\u4E09\u5143\u7EC4\u3002" }), _jsxs("div", { className: css.toolbar, children: [_jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u72B6\u6001" }), _jsxs("select", { value: statusFilter, onChange: e => { setStatusFilter(e.target.value); }, children: [_jsx("option", { value: "", children: "\u5168\u90E8" }), Object.entries(STATUS_LABELS).map(([value, label]) => (_jsx("option", { value: value, children: label }, value)))] })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: "\u7C7B\u578B" }), _jsxs("select", { value: kindFilter, onChange: e => { setKindFilter(e.target.value); }, children: [_jsx("option", { value: "", children: "\u5168\u90E8" }), _jsx("option", { value: "positive", children: "\u6B63\u7ECF\u9A8C" }), _jsx("option", { value: "negative", children: "\u8D1F\u7ECF\u9A8C" })] })] }), _jsxs("label", { className: css.field, title: "\u4EFB\u52A1\u65CF = \u4E00\u7C7B\u76F8\u4F3C\u4EFB\u52A1\u7684\u5206\u7EC4\u6807\u7B7E\uFF0C\u540C\u65CF\u7ECF\u9A8C\u5171\u4EAB\u53EC\u56DE\u4E0E\u4FEE\u8BA2\u5386\u53F2\uFF0C\u5982 windows-build", children: [_jsx("span", { children: "\u4EFB\u52A1\u65CF" }), _jsx("input", { value: familyFilter, placeholder: "\u4E00\u7C7B\u4EFB\u52A1\u7684\u6807\u7B7E\uFF0C\u5982 windows-build", onChange: e => { setFamilyFilter(e.target.value); } })] }), _jsxs("label", { className: css.field, title: "\u4F5C\u7528\u57DF = \u8BE5\u7ECF\u9A8C\u9002\u7528\u7684\u9886\u57DF/\u4E0A\u4E0B\u6587\uFF1B\u7559\u7A7A\u53EC\u56DE\u6240\u6709\u4F5C\u7528\u57DF\uFF0C\u586B\u5199\u5219\u53EA\u53EC\u56DE\u540C\u4F5C\u7528\u57DF\u6216\u5168\u5C40\u7ECF\u9A8C", children: [_jsx("span", { children: "\u4F5C\u7528\u57DF" }), _jsx("input", { value: contextFilter, placeholder: "\u9886\u57DF\u4F5C\u7528\u57DF\uFF0C\u5982 coding-windows-build", onChange: e => { setContextFilter(e.target.value); } })] }), _jsx("button", { type: "button", className: css.btn, onClick: refresh, children: "\u5237\u65B0" }), error !== null && _jsx("span", { className: css.error, children: error })] }), items.length === 0 && _jsx("div", { className: css.empty, children: "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u7ECF\u9A8C\u3002\u7ECF\u9A8C\u7531\u4EE3\u7406\u5728\u590D\u6742\u4EFB\u52A1\u540E\u63D0\u70BC\uFF08memory_refine\uFF09\uFF0C\u6216\u5728\u300C\u4EBA\u5DE5\u7BA1\u7406\u300D\u4E2D\u6CE8\u5165\u3002" }), _jsx("div", { className: css.list, children: items.map((item) => {
                    const key = `${item.id}@${String(item.revision)}`;
                    const isOpen = expanded === key;
                    return (_jsxs("div", { className: css.card, children: [_jsxs("div", { className: css.cardHead, onClick: () => { toggleExpand(item); }, children: [_jsx("span", { className: `${css.badge} ${statusClass(item.status)}`, children: STATUS_LABELS[item.status] ?? item.status }), _jsx("span", { className: `${css.badge} ${item.kind === 'negative' ? css.badgeNegative : css.badgePositive}`, children: KIND_LABELS[item.kind] ?? item.kind }), _jsx("span", { className: css.cardTitle, title: item.gist, children: item.gist }), SYSTEM_EXPERIENCE_FAMILIES.has(item.family) && _jsxs("span", { className: `${css.badge} ${css.badgeConflict}`, title: "\u7CFB\u7EDF\u81EA\u52A8\u751F\u6210\u7684\u7ECF\u9A8C\uFF0C\u7981\u6B62\u5220\u9664\uFF0C\u53EA\u80FD\u5F52\u6863", children: ["\u7CFB\u7EDF\u00B7", item.family] }), item.pinned && _jsx("span", { className: `${css.badge} ${css.badgePinned}`, children: "\u6C38\u4E45" }), item.globalFlag && _jsx("span", { className: `${css.badge} ${css.badgePinned}`, title: "\u5168\u5C40\u4F5C\u7528\u57DF\uFF1A\u8DE8\u9886\u57DF\u53EF\u53EC\u56DE", children: "\u5168\u5C40" }), item.context !== '' && _jsx("span", { className: `${css.badge} ${css.badgePositive}`, title: `作用域：${item.context}`, children: item.context }), _jsxs("span", { className: css.cardMeta, children: ["v", String(item.revision), " \u00B7 ", item.family] })] }), _jsxs("div", { className: css.cardSub, children: [_jsx(TrustTriple, { e: item }), _jsxs("span", { className: css.cardMeta, title: "\u9A8C\u8BC1\u901A\u8FC7\u6B21\u6570 / \u8BD5\u63A2\u5931\u8D25\u6B21\u6570\uFF08\u4EBA\u5DE5\u8F6C\u6B63\u4E0E\u51B7\u5BAB\u51B3\u7B56\u4F9D\u636E\uFF09", children: ["\u9A8C ", String(item.verifiedCount), " \u00B7 \u62D2 ", String(item.rejectCount)] }), _jsx("span", { className: css.cardMeta, children: formatTs(item.updatedAt) })] }), isOpen && (_jsxs("div", { className: css.cardDetail, children: [item.challengeReason !== undefined && (_jsxs("div", { className: css.warnLine, children: ["\u9694\u79BB\u539F\u56E0\uFF1A", item.challengeReason] })), item.kind === 'negative' && item.failureReason !== undefined && (_jsxs("div", { className: css.warnLine, children: ["\u786E\u8BA4\u7684\u5931\u8D25\u539F\u56E0\uFF1A", item.failureReason] })), _jsxs("div", { className: css.detailRow, children: [_jsx("span", { className: css.detailLabel, children: "\u60C5\u5883" }), item.situation.join('；')] }), _jsxs("div", { className: css.detailRow, children: [_jsx("span", { className: css.detailLabel, children: "\u8DEF\u5F84" }), item.path.map(step => `${String(step.order)}. ${step.action}`).join(' → ')] }), _jsxs("div", { className: css.detailRow, children: [_jsx("span", { className: css.detailLabel, children: "\u5224\u65AD\u80CC\u666F" }), item.reasoning] }), item.limits.length > 0 && (_jsxs("div", { className: css.detailRow, children: [_jsx("span", { className: css.detailLabel, children: "\u9650\u5236" }), item.limits.join('；')] })), _jsxs("div", { className: css.detailRow, children: [_jsx("span", { className: css.detailLabel, children: "\u7ECF\u6D4E\u8D26" }), "\u8282\u7701 ", String(Math.round(item.tokensSaved)), " / \u6295\u5165 ", String(Math.round(item.tokensSpent)), " tokens"] }), _jsxs("div", { className: css.actions, children: [_jsx("button", { type: "button", className: css.btn, onClick: () => { void runPin(item); }, children: item.pinned ? '取消永久标记' : '永久标记' }), item.status === 'candidate' && (_jsx("button", { type: "button", className: css.btn, onClick: () => { void runPromote(item); }, children: "\u4EBA\u5DE5\u8F6C\u6B63" })), item.status === 'cold' && (_jsx("button", { type: "button", className: css.btn, onClick: () => { void runReleaseCold(item); }, children: "\u653E\u56DE\u5019\u9009" })), _jsx("button", { type: "button", className: `${css.btn} ${css.btnDanger}`, onClick: () => { void runDelete(item); }, children: "\u5220\u9664" }), (item.status === 'live' && item.path.length >= 3 && item.verifiedCount >= 2) && (_jsx("button", { type: "button", className: css.btn, onClick: () => { void runGenerateSkill(item, 'skill_md'); }, title: "\u4ECE\u7ECF\u9A8C\u751F\u6210 DSH skill \u6587\u6863\u8349\u7A3F", children: "\u751F\u6210 Skill" })), (item.status === 'live' && item.path.length >= 3 && item.verifiedCount >= 2) && (_jsx("button", { type: "button", className: css.btn, onClick: () => { void runGenerateSkill(item, 'script_mjs'); }, title: "\u4ECE\u7ECF\u9A8C\u751F\u6210\u53EF\u6267\u884C\u811A\u672C\u8349\u7A3F", children: "\u751F\u6210\u811A\u672C" }))] }), skillArtifacts.length > 0 && (_jsxs("div", { className: css.historyTitle, children: ["\u5173\u8054 Skill/\u811A\u672C\uFF08", String(skillArtifacts.length), "\uFF09"] })), skillArtifacts.map(sa => (_jsxs("div", { className: css.cardDetail, children: [_jsxs("div", { className: css.detailRow, children: [_jsx("span", { className: css.detailLabel, children: sa.form === 'skill_md' ? 'Skill' : '脚本' }), "v", String(sa.version), " \u00B7 ", SKILL_STATUS_LABELS[sa.status] ?? sa.status, " \u00B7 \u4F7F\u7528 ", String(sa.useCount), " \u00B7 \u4F18\u5316 ", String(sa.optimizeCount)] }), sa.status === 'draft' && (_jsxs("div", { className: css.actions, children: [_jsx("button", { type: "button", className: css.btn, onClick: () => { void runReviewSkill(sa.id, 'approve'); }, children: "\u901A\u8FC7" }), _jsx("button", { type: "button", className: `${css.btn} ${css.btnDanger}`, onClick: () => { void runReviewSkill(sa.id, 'reject'); }, children: "\u62D2\u7EDD" })] })), sa.status === 'approved' && (_jsx("div", { className: css.actions, children: _jsx("button", { type: "button", className: css.btn, onClick: () => { void runPublishSkill(sa.id); }, children: "\u53D1\u5E03\u5230 $DSH_HOME/skills/" }) })), sa.status === 'published' && sa.publishedPath !== undefined && (_jsxs("div", { className: css.detailRow, children: [_jsx("span", { className: css.detailLabel, children: "\u8DEF\u5F84" }), sa.publishedPath] }))] }, sa.id))), _jsx("div", { className: css.historyTitle, children: "\u4FEE\u8BA2\u5386\u53F2\uFF08superseded \u4E3A\u53EA\u8BFB\u7D22\u5F15\uFF0C\u53EF\u56DE\u6EDA\uFF09" }), _jsxs("table", { className: css.table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u7248\u672C" }), _jsx("th", { children: "\u72B6\u6001" }), _jsx("th", { children: "\u7F6E\u4FE1\u4E09\u5143\u7EC4" }), _jsx("th", { children: "\u66F4\u65B0\u65F6\u95F4" }), _jsx("th", { children: "\u64CD\u4F5C" })] }) }), _jsx("tbody", { children: history.map(rev => (_jsxs("tr", { children: [_jsxs("td", { children: ["v", String(rev.revision), rev.parentRevision !== undefined ? ` ← v${String(rev.parentRevision)}` : ''] }), _jsx("td", { children: STATUS_LABELS[rev.status] ?? rev.status }), _jsxs("td", { children: [rev.trust.toFixed(2), " \u00B7 ", String(rev.samples), " \u00B7 ", rev.lastVerifiedAt === undefined ? '未验证' : formatTs(rev.lastVerifiedAt)] }), _jsx("td", { children: formatTs(rev.updatedAt) }), _jsx("td", { children: rev.status === 'superseded' && (_jsx("button", { type: "button", className: css.btn, onClick: () => { void runRollback(item, rev.revision); }, children: "\u56DE\u6EDA\u5230\u6B64\u7248" })) })] }, rev.revision))) })] })] }))] }, key));
                }) })] }));
}
//# sourceMappingURL=ExperiencePage.js.map