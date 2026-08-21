/**
 * Human management page: the fixed-format injection and editing forms.
 * Human additions use the ordinary experience/fact structure (fixed format);
 * every submit collects an audited reason and lands in the ledger as
 * actor=human. Pin/delete/edit verbs also live on the monitoring pages.
 */

import { useState } from 'react'
import type { FactCategory, ExperienceKind, IngestSourceType } from '../types.ts'
import type { MemoryWorkbenchActions } from './actions.ts'
import { promptReason } from './Workbench.tsx'
import css from './Workbench.module.css'

const CATEGORIES: FactCategory[] = ['identity', 'preference', 'communication', 'habit', 'thinking', 'value', 'delegation', 'background', 'other']

const CATEGORY_LABELS: Record<FactCategory, string> = {
  identity: '身份',
  preference: '偏好',
  communication: '沟通',
  habit: '习惯',
  thinking: '思维',
  value: '价值观',
  delegation: '委托',
  background: '背景',
  other: '其他·待裁决',
}

/** Split a textarea into trimmed non-empty lines. */
function lines(text: string): string[] {
  return text.split('\n').map(line => line.trim()).filter(line => line !== '')
}

export interface HumanOpsPageProps {
  /** The injected memory callbacks. */
  actions: MemoryWorkbenchActions
  /** Called after any mutation so the header stats refresh. */
  onChanged: () => void
}

/** The human management page. */
export function HumanOpsPage({ actions, onChanged }: HumanOpsPageProps): React.ReactElement {
  // Experience injection draft (fixed format).
  const [kind, setKind] = useState<ExperienceKind>('positive')
  const [family, setFamily] = useState('')
  const [gist, setGist] = useState('')
  const [situation, setSituation] = useState('')
  const [path, setPath] = useState('')
  const [reasoning, setReasoning] = useState('')
  const [limits, setLimits] = useState('')
  const [failureReason, setFailureReason] = useState('')
  const [addContext, setAddContext] = useState('')

  // 摄取归一 draft: provenance + one candidate (earned, not direct-live).
  const [ingestSourceType, setIngestSourceType] = useState<IngestSourceType>('other')
  const [ingestSourceRef, setIngestSourceRef] = useState('')
  const [ingestContext, setIngestContext] = useState('')
  const [ingestKind, setIngestKind] = useState<ExperienceKind>('positive')
  const [ingestFamily, setIngestFamily] = useState('')
  const [ingestGist, setIngestGist] = useState('')
  const [ingestSituation, setIngestSituation] = useState('')
  const [ingestPath, setIngestPath] = useState('')
  const [ingestReasoning, setIngestReasoning] = useState('')
  const [ingestLimits, setIngestLimits] = useState('')
  const [ingestFailureReason, setIngestFailureReason] = useState('')

  // Experience edit draft.
  const [editId, setEditId] = useState('')
  const [editGist, setEditGist] = useState('')
  const [editLimits, setEditLimits] = useState('')
  const [editContext, setEditContext] = useState('')
  const [editGlobalFlag, setEditGlobalFlag] = useState(false)

  // Fact add draft.
  const [factCategory, setFactCategory] = useState<FactCategory>('preference')
  const [factKey, setFactKey] = useState('')
  const [factValue, setFactValue] = useState('')
  const [factLocked, setFactLocked] = useState(true)

  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const report = (message: string): void => { setNotice(message); setError(null); onChanged() }
  const fail = (e: unknown): void => { setError(e instanceof Error ? e.message : String(e)); setNotice(null) }

  const submitExperience = async (): Promise<void> => {
    const reason = await promptReason('人工注入经验（固定格式）')
    if (reason === undefined) return
    if (gist.trim() === '' || family.trim() === '' || situation.trim() === '' || path.trim() === '' || reasoning.trim() === '') {
      setError('固定格式不完整：任务族、摘要、情境、路径、判断背景均为必填。')
      return
    }
    if (kind === 'negative' && failureReason.trim() === '') {
      setError('负经验必须填写确认的失败原因。')
      return
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
      })
      report(`已注入人工经验 [${snapshot.id}]（直接 live，置信下限 ${snapshot.trust.toFixed(2)}）`)
      setGist(''); setSituation(''); setPath(''); setReasoning(''); setLimits(''); setFailureReason(''); setAddContext('')
    } catch (e) { fail(e) }
  }

  const submitIngest = async (): Promise<void> => {
    if (ingestSourceRef.trim() === '') { setError('摄取必须填写出处（sourceRef，如书名/技能名/会话 id）。'); return }
    if (ingestFamily.trim() === '' || ingestGist.trim() === '' || ingestSituation.trim() === '' || ingestPath.trim() === '' || ingestReasoning.trim() === '') {
      setError('摄取不完整：任务族、摘要、情境、路径、判断背景均为必填。')
      return
    }
    if (ingestKind === 'negative' && ingestFailureReason.trim() === '') {
      setError('负经验必须填写确认的失败原因。')
      return
    }
    const reason = await promptReason('人工摄取（固定格式 + 出处，产出候选待验证）')
    if (reason === undefined) return
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
      })
      if (result.rejected.length > 0) {
        setError(`摄取部分拒收：${result.rejected.map(r => `${r.gist}（${r.reason}）`).join('；')}`)
      } else {
        report(`已摄取 ${String(result.accepted.length)} 条候选（初始置信先验 ${result.sourcePrior.alpha}/${result.sourcePrior.beta}，待验证转正）`)
      }
      setIngestSourceRef(''); setIngestGist(''); setIngestSituation(''); setIngestPath(''); setIngestReasoning(''); setIngestLimits(''); setIngestFailureReason('')
    } catch (e) { fail(e) }
  }

  const submitEdit = async (): Promise<void> => {
    if (editId.trim() === '') { setError('编辑需要先填写经验 id。'); return }
    const reason = await promptReason('人工编辑经验')
    if (reason === undefined) return
    try {
      const snapshot = await actions.humanEditExperience({
        id: editId.trim(),
        reason,
        ...(editGist.trim() === '' ? {} : { gist: editGist.trim() }),
        ...(editLimits.trim() === '' ? {} : { limits: lines(editLimits) }),
        ...(editContext.trim() === '' ? {} : { context: editContext.trim() }),
        globalFlag: editGlobalFlag,
      })
      report(`已编辑经验 [${snapshot.id}] v${String(snapshot.revision)}（原内容保留在账本载荷）`)
      setEditGist(''); setEditLimits(''); setEditContext(''); setEditGlobalFlag(false)
    } catch (e) { fail(e) }
  }

  const submitFact = async (): Promise<void> => {
    const reason = await promptReason('人工添加画像')
    if (reason === undefined) return
    if (factKey.trim() === '' || factValue.trim() === '') {
      setError('画像的键与值均为必填。')
      return
    }
    try {
      const fact = await actions.humanAddFact({
        category: factCategory,
        factKey: factKey.trim(),
        value: factValue.trim(),
        locked: factLocked,
        reason,
      })
      report(`已添加画像「${fact.category}/${fact.factKey}」（${fact.locked ? '已锁定' : '未锁定'}）`)
      setFactKey(''); setFactValue('')
    } catch (e) { fail(e) }
  }

  return (
    <div className={css.page}>
      {notice !== null && <div className={css.okLine}>{notice}</div>}
      {error !== null && <div className={css.error}>{error}</div>}
      <div className={css.columns}>
        <section className={css.column}>
          <div className={css.sectionTitle}>凭空添加经验（固定格式 = 普通经验结构；人工担保直接 live，置信下限约 0.67）</div>
          <div className={css.form}>
            <label className={css.field}>
              <span>类型</span>
              <select value={kind} onChange={e => { setKind(e.target.value as ExperienceKind) }}>
                <option value="positive">正经验（可行路径）</option>
                <option value="negative">负经验（确认死路）</option>
              </select>
            </label>
            <label className={css.field}><span>任务族 *</span><input value={family} placeholder="如 windows-build" onChange={e => { setFamily(e.target.value) }} /></label>
            <label className={css.field}><span>一句话摘要 *</span><input value={gist} onChange={e => { setGist(e.target.value) }} /></label>
            <label className={css.field}><span>适用情境 *（每行一条）</span><textarea rows={3} value={situation} onChange={e => { setSituation(e.target.value) }} /></label>
            <label className={css.field}><span>路径步骤 *（每行一步，按顺序）</span><textarea rows={4} value={path} onChange={e => { setPath(e.target.value) }} /></label>
            <label className={css.field}><span>判断背景 *</span><textarea rows={2} value={reasoning} onChange={e => { setReasoning(e.target.value) }} /></label>
            <label className={css.field}><span>不适用边界（每行一条）</span><textarea rows={2} value={limits} onChange={e => { setLimits(e.target.value) }} /></label>
            {kind === 'negative' && (
              <label className={css.field}><span>确认的失败原因 *</span><input value={failureReason} onChange={e => { setFailureReason(e.target.value) }} /></label>
            )}
            <label className={css.field} title="作用域：该经验适用的领域/上下文；留空为无作用域">
              <span>作用域（可选）</span><input value={addContext} placeholder="如 coding-windows-build" onChange={e => { setAddContext(e.target.value) }} />
            </label>
            <button type="button" className={css.btn} onClick={() => { void submitExperience() }}>注入经验（需填写原因）</button>
          </div>

          <div className={css.sectionTitle}>摄取归一（从外部来源学习：书/技能/文档/会话；产出候选待验证，不直接 live）</div>
          <div className={css.form}>
            <label className={css.field}>
              <span>来源类型</span>
              <select value={ingestSourceType} onChange={e => { setIngestSourceType(e.target.value as IngestSourceType) }}>
                <option value="other">other（其他）</option>
                <option value="note">note（笔记）</option>
                <option value="conversation">conversation（会话）</option>
                <option value="document">document（文档）</option>
                <option value="book">book（书籍）</option>
                <option value="skill">skill（技能）</option>
              </select>
            </label>
            <label className={css.field}><span>出处 *（sourceRef）</span><input value={ingestSourceRef} placeholder="书名/技能名/会话 id（可审计）" onChange={e => { setIngestSourceRef(e.target.value) }} /></label>
            <label className={css.field} title="作用域：摄取出的候选适用的领域/上下文"><span>作用域（可选）</span><input value={ingestContext} placeholder="如 coding-windows-build" onChange={e => { setIngestContext(e.target.value) }} /></label>
            <label className={css.field}>
              <span>类型</span>
              <select value={ingestKind} onChange={e => { setIngestKind(e.target.value as ExperienceKind) }}>
                <option value="positive">正经验（可行路径）</option>
                <option value="negative">负经验（确认死路）</option>
              </select>
            </label>
            <label className={css.field}><span>任务族 *</span><input value={ingestFamily} placeholder="如 windows-build" onChange={e => { setIngestFamily(e.target.value) }} /></label>
            <label className={css.field}><span>一句话摘要 *</span><input value={ingestGist} onChange={e => { setIngestGist(e.target.value) }} /></label>
            <label className={css.field}><span>适用情境 *（每行一条）</span><textarea rows={3} value={ingestSituation} onChange={e => { setIngestSituation(e.target.value) }} /></label>
            <label className={css.field}><span>路径步骤 *（每行一步，按顺序）</span><textarea rows={4} value={ingestPath} onChange={e => { setIngestPath(e.target.value) }} /></label>
            <label className={css.field}><span>判断背景 *</span><textarea rows={2} value={ingestReasoning} onChange={e => { setIngestReasoning(e.target.value) }} /></label>
            <label className={css.field}><span>不适用边界（每行一条）</span><textarea rows={2} value={ingestLimits} onChange={e => { setIngestLimits(e.target.value) }} /></label>
            {ingestKind === 'negative' && (
              <label className={css.field}><span>确认的失败原因 *</span><input value={ingestFailureReason} onChange={e => { setIngestFailureReason(e.target.value) }} /></label>
            )}
            <button type="button" className={css.btn} onClick={() => { void submitIngest() }}>摄取（产出候选，需填写原因）</button>
          </div>

          <div className={css.sectionTitle}>人工添加画像（默认锁定：提取冲突不会自动取代）</div>
          <div className={css.form}>
            <label className={css.field}>
              <span>分类</span>
              <select value={factCategory} onChange={e => { setFactCategory(e.target.value as FactCategory) }}>
                {CATEGORIES.map(value => <option key={value} value={value}>{value}（{CATEGORY_LABELS[value]}）</option>)}
              </select>
            </label>
            <label className={css.field}><span>键 *</span><input value={factKey} placeholder="如 timezone" onChange={e => { setFactKey(e.target.value) }} /></label>
            <label className={css.field}><span>值 *</span><input value={factValue} onChange={e => { setFactValue(e.target.value) }} /></label>
            <label className={css.check}>
              <input type="checkbox" checked={factLocked} onChange={e => { setFactLocked(e.target.checked) }} />
              立即锁定（人工确认）
            </label>
            <button type="button" className={css.btn} onClick={() => { void submitFact() }}>添加画像（需填写原因）</button>
          </div>
        </section>

        <section className={css.column}>
          <div className={css.sectionTitle}>编辑既有经验（按 id；完整编辑请配合经验库监控页的详情）</div>
          <div className={css.form}>
            <label className={css.field}><span>经验 id *</span><input value={editId} placeholder="从账本或经验列表复制" onChange={e => { setEditId(e.target.value) }} /></label>
            <label className={css.field}><span>新摘要（留空不改）</span><input value={editGist} onChange={e => { setEditGist(e.target.value) }} /></label>
            <label className={css.field}><span>新不适用边界（每行一条，留空不改）</span><textarea rows={3} value={editLimits} onChange={e => { setEditLimits(e.target.value) }} /></label>
            <label className={css.field} title="作用域：留空不改；填写则改写该经验的作用域"><span>新作用域（留空不改）</span><input value={editContext} placeholder="如 coding-windows-build" onChange={e => { setEditContext(e.target.value) }} /></label>
            <label className={css.check}>
              <input type="checkbox" checked={editGlobalFlag} onChange={e => { setEditGlobalFlag(e.target.checked) }} />
              全局作用域（勾选 = 跨领域可召回；取消 = 仅本作用域）
            </label>
            <button type="button" className={css.btn} onClick={() => { void submitEdit() }}>保存编辑（需填写原因）</button>
          </div>

          <div className={css.sectionTitle}>人工操作纪律</div>
          <ul className={css.rules}>
            <li>永久标记：置顶信任（置信不低于 0.67）且豁免注入预算退役。</li>
            <li>删除：全家族墓碑，指纹保留在账本，可审计不可恢复。</li>
            <li>编辑：就地改写活动版本，原内容保留在账本载荷。</li>
            <li>凭空添加：固定格式、人工担保、直接 live、置信下限约 0.67。</li>
            <li>摄取归一：带出处产出候选（初始按来源先验），须经验证才转正。</li>
            <li>作用域：默认本作用域；可勾选全局（跨领域可召回）。</li>
            <li>冷宫：候选试探失败即入冷宫，只有人工可放回候选或删除。</li>
            <li>所有人工操作强制填写原因，账本 actor=human。</li>
          </ul>
        </section>
      </div>
    </div>
  )
}
