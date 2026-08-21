/**
 * Experience library monitoring page: lifecycle counters, a filterable
 * revision list with the Beta-posterior triple, expandable judgment context,
 * family revision history, and the human verbs (pin/promote/rollback/delete).
 */

import { useCallback, useEffect, useState } from 'react'
import type { ExperienceKind, ExperienceListFilter, ExperienceSnapshot, ExperienceStatus, SkillArtifact, SkillForm } from '../types.ts'
import { SYSTEM_EXPERIENCE_FAMILIES } from '../types.ts'
import type { MemoryWorkbenchActions } from './actions.ts'
import { formatTs, promptReason } from './Workbench.tsx'
import css from './Workbench.module.css'

const STATUS_LABELS: Record<string, string> = {
  candidate: '候选',
  live: '生效',
  challenged: '已隔离',
  superseded: '已取代',
  archived: '已归档',
  cold: '冷宫',
}

const SKILL_STATUS_LABELS: Record<string, string> = {
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
}

const KIND_LABELS: Record<string, string> = {
  positive: '正经验',
  negative: '负经验',
}

function statusClass(status: string) {
  switch (status) {
    case 'live': return css.statusLive
    case 'candidate': return css.statusCandidate
    case 'challenged': return css.statusChallenged
    case 'cold': return css.statusChallenged
    default: return css.statusOther
  }
}

/** Trust triple render: (置信度, 样本数, 最近验证时间). */
function TrustTriple({ e }: { e: ExperienceSnapshot }): React.ReactElement {
  const last = e.lastVerifiedAt === undefined ? '从未验证' : formatTs(e.lastVerifiedAt)
  return (
    <span className={css.trust} title={`加权置信 ${e.weightedTrust.toFixed(3)}`}>
      置信 {e.trust.toFixed(2)} · 样本 {String(e.samples)} · 最近验证 {last}
    </span>
  )
}

export interface ExperiencePageProps {
  /** The injected memory callbacks. */
  actions: MemoryWorkbenchActions
  /** Called after any mutation so the header stats refresh. */
  onChanged: () => void
}

/** The experience library monitoring page. */
export function ExperiencePage({ actions, onChanged }: ExperiencePageProps): React.ReactElement {
  const [statusFilter, setStatusFilter] = useState('')
  const [kindFilter, setKindFilter] = useState('')
  const [familyFilter, setFamilyFilter] = useState('')
  const [contextFilter, setContextFilter] = useState('')
  const [items, setItems] = useState<ExperienceSnapshot[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [history, setHistory] = useState<ExperienceSnapshot[]>([])
  const [error, setError] = useState<string | null>(null)
  const [skillArtifacts, setSkillArtifacts] = useState<SkillArtifact[]>([])

  const refreshSkills = useCallback((experienceId: string): void => {
    void actions.listSkillArtifacts(experienceId, '').then(setSkillArtifacts).catch(() => { setSkillArtifacts([]) })
  }, [actions])

  const refresh = useCallback((): void => {
    const filter: ExperienceListFilter = {}
    if (statusFilter !== '') filter.status = statusFilter as ExperienceStatus
    if (kindFilter !== '') filter.kind = kindFilter as ExperienceKind
    if (familyFilter.trim() !== '') filter.family = familyFilter.trim()
    if (contextFilter.trim() !== '') filter.context = contextFilter.trim()
    void actions.listExperiences(filter).then(setItems).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e))
    })
  }, [actions, statusFilter, kindFilter, familyFilter, contextFilter])

  useEffect(() => { refresh() }, [refresh])

  const toggleExpand = useCallback((item: ExperienceSnapshot): void => {
    const key = `${item.id}@${String(item.revision)}`
    if (expanded === key) {
      setExpanded(null)
      setHistory([])
      setSkillArtifacts([])
      return
    }
    setExpanded(key)
    void actions.family(item.id).then(setHistory).catch(() => { setHistory([]) })
    refreshSkills(item.id)
  }, [actions, expanded, refreshSkills])

  const runPin = useCallback(async (item: ExperienceSnapshot): Promise<void> => {
    const reason = await promptReason(item.pinned ? '取消永久标记' : '永久标记（置顶信任，豁免预算）')
    if (reason === undefined) return
    await actions.humanPin({ id: item.id, pinned: !item.pinned, reason })
    refresh()
    onChanged()
  }, [actions, onChanged, refresh])

  const runPromote = useCallback(async (item: ExperienceSnapshot): Promise<void> => {
    const reason = await promptReason('人工转正（候选 → 生效，V2 人工权威）')
    if (reason === undefined) return
    await actions.humanPromote(item.id, reason)
    refresh()
    onChanged()
  }, [actions, onChanged, refresh])

  const runReleaseCold = useCallback(async (item: ExperienceSnapshot): Promise<void> => {
    const reason = await promptReason('从冷宫放回候选（可再次被试探验证）')
    if (reason === undefined) return
    await actions.humanReleaseCold({ id: item.id, reason })
    refresh()
    onChanged()
  }, [actions, onChanged, refresh])

  const runDelete = useCallback(async (item: ExperienceSnapshot): Promise<void> => {
    const isSystem = SYSTEM_EXPERIENCE_FAMILIES.has(item.family)
    if (isSystem) {
      const reason = await promptReason(`归档系统经验「${item.family}」（保留数据，移出活跃召回）`)
      if (reason === undefined) return
      await actions.humanArchiveExperience({ id: item.id, reason })
    } else {
      const reason = await promptReason(`删除经验「${item.gist.slice(0, 24)}」（指纹保留在账本）`)
      if (reason === undefined) return
      await actions.humanDeleteExperience({ id: item.id, reason })
    }
    refresh()
    onChanged()
  }, [actions, onChanged, refresh])

  const runRollback = useCallback(async (item: ExperienceSnapshot, toRevision: number): Promise<void> => {
    const reason = await promptReason(`回滚到 v${String(toRevision)}`)
    if (reason === undefined) return
    await actions.humanRollback({ id: item.id, toRevision, reason })
    refresh()
    onChanged()
  }, [actions, onChanged, refresh])

  const runGenerateSkill = useCallback(async (item: ExperienceSnapshot, form: SkillForm): Promise<void> => {
    try {
      await actions.generateSkillDraft({ experienceId: item.id, form })
      refreshSkills(item.id)
      onChanged()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [actions, onChanged, refreshSkills])

  const runReviewSkill = useCallback(async (skillId: string, decision: 'approve' | 'reject'): Promise<void> => {
    const reason = await promptReason(decision === 'approve' ? '通过 skill 草稿' : '拒绝 skill 草稿')
    if (reason === undefined) return
    try {
      await actions.reviewSkill({ id: skillId, decision, reason })
      // Refresh skills for the parent experience
      const sa = skillArtifacts.find(s => s.id === skillId)
      if (sa) refreshSkills(sa.parentExperienceId)
      onChanged()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [actions, onChanged, refreshSkills, skillArtifacts])

  const runPublishSkill = useCallback(async (skillId: string): Promise<void> => {
    const reason = await promptReason('发布 skill 到 $DSH_HOME/skills/')
    if (reason === undefined) return
    try {
      await actions.publishSkill({ id: skillId, reason })
      const sa = skillArtifacts.find(s => s.id === skillId)
      if (sa) refreshSkills(sa.parentExperienceId)
      onChanged()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [actions, onChanged, refreshSkills, skillArtifacts])

  return (
    <div className={css.page}>
      <div className={css.empty}>
        经验库是「生·用·修」的载体：代理在复杂任务后提炼经验（生），相似任务前召回注入（用），
        失败后隔离/修订/回滚（修）。每条经验带置信度·样本数·最近验证时间三元组。
      </div>
      <div className={css.toolbar}>
        <label className={css.field}>
          <span>状态</span>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value) }}>
            <option value="">全部</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className={css.field}>
          <span>类型</span>
          <select value={kindFilter} onChange={e => { setKindFilter(e.target.value) }}>
            <option value="">全部</option>
            <option value="positive">正经验</option>
            <option value="negative">负经验</option>
          </select>
        </label>
        <label className={css.field} title="任务族 = 一类相似任务的分组标签，同族经验共享召回与修订历史，如 windows-build">
          <span>任务族</span>
          <input value={familyFilter} placeholder="一类任务的标签，如 windows-build" onChange={e => { setFamilyFilter(e.target.value) }} />
        </label>
        <label className={css.field} title="作用域 = 该经验适用的领域/上下文；留空召回所有作用域，填写则只召回同作用域或全局经验">
          <span>作用域</span>
          <input value={contextFilter} placeholder="领域作用域，如 coding-windows-build" onChange={e => { setContextFilter(e.target.value) }} />
        </label>
        <button type="button" className={css.btn} onClick={refresh}>刷新</button>
        {error !== null && <span className={css.error}>{error}</span>}
      </div>

      {items.length === 0 && <div className={css.empty}>没有符合条件的经验。经验由代理在复杂任务后提炼（memory_refine），或在「人工管理」中注入。</div>}

      <div className={css.list}>
        {items.map((item) => {
          const key = `${item.id}@${String(item.revision)}`
          const isOpen = expanded === key
          return (
            <div key={key} className={css.card}>
              <div className={css.cardHead} onClick={() => { toggleExpand(item) }}>
                <span className={`${css.badge} ${statusClass(item.status)}`}>{STATUS_LABELS[item.status] ?? item.status}</span>
                <span className={`${css.badge} ${item.kind === 'negative' ? css.badgeNegative : css.badgePositive}`}>
                  {KIND_LABELS[item.kind] ?? item.kind}
                </span>
                <span className={css.cardTitle} title={item.gist}>{item.gist}</span>
                {SYSTEM_EXPERIENCE_FAMILIES.has(item.family) && <span className={`${css.badge} ${css.badgeConflict}`} title="系统自动生成的经验，禁止删除，只能归档">系统·{item.family}</span>}
                {item.pinned && <span className={`${css.badge} ${css.badgePinned}`}>永久</span>}
                {item.globalFlag && <span className={`${css.badge} ${css.badgePinned}`} title="全局作用域：跨领域可召回">全局</span>}
                {item.context !== '' && <span className={`${css.badge} ${css.badgePositive}`} title={`作用域：${item.context}`}>{item.context}</span>}
                <span className={css.cardMeta}>v{String(item.revision)} · {item.family}</span>
              </div>
              <div className={css.cardSub}>
                <TrustTriple e={item} />
                <span className={css.cardMeta} title="验证通过次数 / 试探失败次数（人工转正与冷宫决策依据）">
                  验 {String(item.verifiedCount)} · 拒 {String(item.rejectCount)}
                </span>
                <span className={css.cardMeta}>{formatTs(item.updatedAt)}</span>
              </div>
              {isOpen && (
                <div className={css.cardDetail}>
                  {item.challengeReason !== undefined && (
                    <div className={css.warnLine}>隔离原因：{item.challengeReason}</div>
                  )}
                  {item.kind === 'negative' && item.failureReason !== undefined && (
                    <div className={css.warnLine}>确认的失败原因：{item.failureReason}</div>
                  )}
                  <div className={css.detailRow}><span className={css.detailLabel}>情境</span>{item.situation.join('；')}</div>
                  <div className={css.detailRow}>
                    <span className={css.detailLabel}>路径</span>
                    {item.path.map(step => `${String(step.order)}. ${step.action}`).join(' → ')}
                  </div>
                  <div className={css.detailRow}><span className={css.detailLabel}>判断背景</span>{item.reasoning}</div>
                  {item.limits.length > 0 && (
                    <div className={css.detailRow}><span className={css.detailLabel}>限制</span>{item.limits.join('；')}</div>
                  )}
                  <div className={css.detailRow}>
                    <span className={css.detailLabel}>经济账</span>
                    节省 {String(Math.round(item.tokensSaved))} / 投入 {String(Math.round(item.tokensSpent))} tokens
                  </div>
                  <div className={css.actions}>
                    <button type="button" className={css.btn} onClick={() => { void runPin(item) }}>
                      {item.pinned ? '取消永久标记' : '永久标记'}
                    </button>
                    {item.status === 'candidate' && (
                      <button type="button" className={css.btn} onClick={() => { void runPromote(item) }}>人工转正</button>
                    )}
                    {item.status === 'cold' && (
                      <button type="button" className={css.btn} onClick={() => { void runReleaseCold(item) }}>放回候选</button>
                    )}
                    <button type="button" className={`${css.btn} ${css.btnDanger}`} onClick={() => { void runDelete(item) }}>删除</button>
                    {(item.status === 'live' && item.path.length >= 3 && item.verifiedCount >= 2) && (
                      <button type="button" className={css.btn} onClick={() => { void runGenerateSkill(item, 'skill_md') }} title="从经验生成 DSH skill 文档草稿">生成 Skill</button>
                    )}
                    {(item.status === 'live' && item.path.length >= 3 && item.verifiedCount >= 2) && (
                      <button type="button" className={css.btn} onClick={() => { void runGenerateSkill(item, 'script_mjs') }} title="从经验生成可执行脚本草稿">生成脚本</button>
                    )}
                  </div>
                  {skillArtifacts.length > 0 && (
                    <div className={css.historyTitle}>关联 Skill/脚本（{String(skillArtifacts.length)}）</div>
                  )}
                  {skillArtifacts.map(sa => (
                    <div key={sa.id} className={css.cardDetail}>
                      <div className={css.detailRow}>
                        <span className={css.detailLabel}>{sa.form === 'skill_md' ? 'Skill' : '脚本'}</span>
                        v{String(sa.version)} · {SKILL_STATUS_LABELS[sa.status] ?? sa.status} · 使用 {String(sa.useCount)} · 优化 {String(sa.optimizeCount)}
                      </div>
                      {sa.status === 'draft' && (
                        <div className={css.actions}>
                          <button type="button" className={css.btn} onClick={() => { void runReviewSkill(sa.id, 'approve') }}>通过</button>
                          <button type="button" className={`${css.btn} ${css.btnDanger}`} onClick={() => { void runReviewSkill(sa.id, 'reject') }}>拒绝</button>
                        </div>
                      )}
                      {sa.status === 'approved' && (
                        <div className={css.actions}>
                          <button type="button" className={css.btn} onClick={() => { void runPublishSkill(sa.id) }}>发布到 $DSH_HOME/skills/</button>
                        </div>
                      )}
                      {sa.status === 'published' && sa.publishedPath !== undefined && (
                        <div className={css.detailRow}><span className={css.detailLabel}>路径</span>{sa.publishedPath}</div>
                      )}
                    </div>
                  ))}
                  <div className={css.historyTitle}>修订历史（superseded 为只读索引，可回滚）</div>
                  <table className={css.table}>
                    <thead>
                      <tr><th>版本</th><th>状态</th><th>置信三元组</th><th>更新时间</th><th>操作</th></tr>
                    </thead>
                    <tbody>
                      {history.map(rev => (
                        <tr key={rev.revision}>
                          <td>v{String(rev.revision)}{rev.parentRevision !== undefined ? ` ← v${String(rev.parentRevision)}` : ''}</td>
                          <td>{STATUS_LABELS[rev.status] ?? rev.status}</td>
                          <td>{rev.trust.toFixed(2)} · {String(rev.samples)} · {rev.lastVerifiedAt === undefined ? '未验证' : formatTs(rev.lastVerifiedAt)}</td>
                          <td>{formatTs(rev.updatedAt)}</td>
                          <td>
                            {rev.status === 'superseded' && (
                              <button type="button" className={css.btn} onClick={() => { void runRollback(item, rev.revision) }}>回滚到此版</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
