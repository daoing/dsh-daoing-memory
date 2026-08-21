/**
 * Profile·concerns page, split into two sub-pages: 关心事项 (open-loop memos) /
 * 画像分类 (the AI's perception of the user). The event-layer diary is the
 * append-only raw material and is surfaced only as per-fact provenance (来源日记),
 * not as its own browsing tab. Facts paginate server-side; concerns stay as an
 * expandable tree. All human mutations go through the audited Remote callbacks.
 */

import { Fragment, useCallback, useEffect, useState } from 'react'
import type { ConcernStatus, ConcernTree, DiaryEntry, FactEntry } from '../types.ts'
import type { MemoryWorkbenchActions } from './actions.ts'
import { formatTs, promptReason } from './Workbench.tsx'
import { showInputDialog } from './ReasonDialog.tsx'
import css from './Workbench.module.css'

const CATEGORY_LABELS: Record<string, string> = {
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

const CONCERN_KIND_LABELS: Record<string, string> = {
  todo: '待办',
  thinking: '思考',
  idea: '想法',
  question: '疑问',
  decision: '决定',
  commitment: '约定',
  other: '其他',
}

const CONCERN_STATUS_LABELS: Record<string, string> = {
  ongoing: '未闭环',
  concluded: '已闭环',
  recurring: '反复出现',
  paused: '搁置',
}

const DIARY_KIND_LABELS: Record<string, string> = {
  said: '用户说',
  delegated: '委托',
  promised: '承诺',
  happened: '事件',
  preference: '偏好变化',
  other: '其他',
}

/** The sub-pages under 画像·日记: open-loop concern memos + user-perception profile. Diary demoted to provenance. */
const TABS = [
  { key: 'concerns', label: '关心事项' },
  { key: 'facts', label: '画像分类' },
] as const

type TabKey = typeof TABS[number]['key']

/** Shared page-size choices for the paginated sub-pages. */
function PageSizeSelect({ value, onChange }: { value: number; onChange: (v: number) => void }): React.ReactElement {
  return (
    <label className={css.field}>
      <span>每页</span>
      <select value={String(value)} onChange={e => { onChange(Number(e.target.value)) }}>
        <option value="10">10</option>
        <option value="20">20</option>
        <option value="50">50</option>
      </select>
    </label>
  )
}

/** Compact prev/next pager with a filtered total. */
function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }): React.ReactElement {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className={css.toolbar}>
      <button type="button" className={css.btn} disabled={page <= 0} onClick={() => { onPage(page - 1) }}>上一页</button>
      <span className={css.cardMeta}>第 {String(page + 1)} / {String(totalPages)} 页 · 共 {String(total)} 条 · 最新在前</span>
      <button type="button" className={css.btn} disabled={page + 1 >= totalPages} onClick={() => { onPage(page + 1) }}>下一页</button>
    </div>
  )
}

export interface FactDiaryPageProps {
  /** The injected memory callbacks. */
  actions: MemoryWorkbenchActions
  /** Called after any mutation so the header stats refresh. */
  onChanged: () => void
}

/** The profile·concerns page with two sub-pages (diary demoted to per-fact provenance). */
export function FactDiaryPage({ actions, onChanged }: FactDiaryPageProps): React.ReactElement {
  const [tab, setTab] = useState<TabKey>('concerns')
  const [error, setError] = useState<string | null>(null)

  // 关心事项
  // 关心事项（010 §D：kind/status 筛选 + 分页）
  const [concerns, setConcerns] = useState<ConcernTree[]>([])
  const [openConcerns, setOpenConcerns] = useState<Record<string, boolean>>({})
  const [concernKind, setConcernKind] = useState('')
  const [concernStatus, setConcernStatus] = useState('')
  const [concernPage, setConcernPage] = useState(0)
  const [concernPageSize, setConcernPageSize] = useState(10)
  const [concernTotal, setConcernTotal] = useState(0)

  // 画像分类（分页）
  const [category, setCategory] = useState('')
  const [includeHistory, setIncludeHistory] = useState(false)
  const [facts, setFacts] = useState<FactEntry[]>([])
  const [factPage, setFactPage] = useState(0)
  const [factPageSize, setFactPageSize] = useState(10)
  const [factTotal, setFactTotal] = useState(0)

  // 画像溯源（008 Path A）：每条画像可展开看它来自哪些日记。
  const [openFactSources, setOpenFactSources] = useState<Record<string, boolean>>({})
  const [factSources, setFactSources] = useState<Record<string, DiaryEntry[]>>({})

  const refresh = useCallback((): void => {
    void actions.listConcerns(concernKind, concernStatus, concernPageSize, concernPage * concernPageSize).then(setConcerns).catch(() => { /* concerns unavailable */ })
    void actions.listConcernsCount(concernKind, concernStatus).then(setConcernTotal).catch(() => { /* count unavailable */ })
    void actions.listFacts(category, includeHistory, factPageSize, factPage * factPageSize).then(setFacts).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e))
    })
    void actions.listFactsCount(category, includeHistory).then(setFactTotal).catch(() => { /* count unavailable */ })
  }, [actions, concernKind, concernStatus, concernPage, concernPageSize, category, includeHistory, factPage, factPageSize])

  useEffect(() => { refresh() }, [refresh])

  const runConfirm = useCallback(async (fact: FactEntry): Promise<void> => {
    const verb = fact.locked ? '解除人工确认' : '人工确认（锁定，禁止自动取代）'
    const reason = await promptReason(verb)
    if (reason === undefined) return
    await actions.humanConfirmFact({ factId: fact.id, locked: !fact.locked, reason })
    refresh()
    onChanged()
  }, [actions, onChanged, refresh])

  const runEditFact = useCallback(async (fact: FactEntry): Promise<void> => {
    const value = await showInputDialog(`编辑画像「${fact.category}/${fact.factKey}」的新值`, fact.value)
    if (value === undefined || value.trim() === '') return
    const reason = await promptReason('人工编辑画像')
    if (reason === undefined) return
    await actions.humanEditFact({ factId: fact.id, value: value.trim(), reason })
    refresh()
    onChanged()
  }, [actions, onChanged, refresh])

  const runDeleteFact = useCallback(async (fact: FactEntry): Promise<void> => {
    const reason = await promptReason(`删除画像「${fact.category}/${fact.factKey}」（墓碑保留）`)
    if (reason === undefined) return
    await actions.humanDeleteFact({ factId: fact.id, reason })
    refresh()
    onChanged()
  }, [actions, onChanged, refresh])

  const toggleConcern = useCallback((id: string): void => {
    setOpenConcerns(prev => ({ ...prev, [id]: prev[id] !== true }))
  }, [])

  // 画像溯源：展开时按需拉取来源日记（只拉一次，缓存到 factSources）。
  const toggleFactSources = useCallback((fact: FactEntry): void => {
    const opening = openFactSources[fact.id] !== true
    setOpenFactSources(prev => ({ ...prev, [fact.id]: prev[fact.id] !== true }))
    if (opening && factSources[fact.id] === undefined && fact.sourceDiaryIds.length > 0) {
      void actions.getDiaryByIds(fact.sourceDiaryIds).then(entries => {
        setFactSources(prev => ({ ...prev, [fact.id]: entries }))
      }).catch(() => { setFactSources(prev => ({ ...prev, [fact.id]: [] })) })
    }
  }, [actions, openFactSources, factSources])

  const runSetConcernStatus = useCallback(async (tree: ConcernTree, status: ConcernStatus): Promise<void> => {
    const reason = await promptReason(`把关心事项「${tree.concern.title}」改为 ${CONCERN_STATUS_LABELS[status] ?? status}`)
    if (reason === undefined) return
    await actions.humanSetConcernStatus({ id: tree.concern.id, status, reason })
    refresh()
    onChanged()
  }, [actions, onChanged, refresh])

  const runDeleteConcern = useCallback(async (tree: ConcernTree): Promise<void> => {
    const reason = await promptReason(`删除关心事项「${tree.concern.title}」及其更新（墓碑保留）`)
    if (reason === undefined) return
    await actions.humanDeleteConcern({ id: tree.concern.id, reason })
    refresh()
    onChanged()
  }, [actions, onChanged, refresh])

  return (
    <div className={css.page}>
      <div className={css.empty}>
        「记」的产物分两层：<b>画像分类</b>是 AI 通过对话沉淀出的"这个用户是什么样的人、怎么跟他协作"（稳定特质，每条可展开看来源日记）；
        <b>关心事项</b>是替用户记着的<b>开环备忘</b>——提过还没办的事、冒出的想法、悬而未决的问题、待定的决定、答应的事。
        事件层日记是原料（只增不删），不单列子页，作为画像的"来源日记"露出。提取是否在跑，看右上角「待提取」数即可。
      </div>

      <div className={css.tabs}>
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            className={tab === t.key ? `${css.tab} ${css.tabActive}` : css.tab}
            onClick={() => { setTab(t.key) }}
          >
            {t.label}
          </button>
        ))}
        <button type="button" className={css.btn} onClick={refresh} style={{ marginLeft: 'auto' }}>刷新</button>
      </div>

      {tab === 'concerns' && (
        <section className={css.column}>
          <div className={css.toolbar}>
            <span className={css.sectionTitle}>关心事项 · 开环备忘（替你记着还没闭环的事，用于提醒）</span>
            <label className={css.field}>
              <span>类型</span>
              <select value={concernKind} onChange={e => { setConcernKind(e.target.value); setConcernPage(0) }}>
                <option value="">全部</option>
                {Object.entries(CONCERN_KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className={css.field}>
              <span>状态</span>
              <select value={concernStatus} onChange={e => { setConcernStatus(e.target.value); setConcernPage(0) }}>
                <option value="">全部</option>
                {Object.entries(CONCERN_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <PageSizeSelect value={concernPageSize} onChange={v => { setConcernPageSize(v); setConcernPage(0) }} />
          </div>
          {concerns.length === 0 && <div className={css.empty}>还没有关心事项。代理提取时（memory_extract 的 concerns）会沉淀你提过但还没闭环的事：待办、思考、想法、疑问、决定、约定。</div>}
          <div className={css.list}>
            {concerns.map(tree => (
              <div key={tree.concern.id} className={css.card}>
                <div className={css.cardHead}>
                  <span
                    className={css.payloadToggle}
                    title={openConcerns[tree.concern.id] === true ? '收起更新' : '展开更新'}
                    onClick={() => { toggleConcern(tree.concern.id) }}
                  >
                    {openConcerns[tree.concern.id] === true ? '▾' : '▸'}
                  </span>
                  <span className={`${css.badge} ${css.statusCandidate}`}>{CONCERN_KIND_LABELS[tree.concern.kind ?? 'other'] ?? '其他'}</span>
                  <span className={css.cardTitle}>{tree.concern.title}</span>
                  <span className={`${css.badge} ${css.statusOther}`}>{CONCERN_STATUS_LABELS[tree.concern.status ?? 'ongoing'] ?? '未闭环'}</span>
                  <span className={css.cardMeta}>更新 {String(tree.mentions.length)} 次</span>
                </div>
                {tree.concern.background !== undefined && tree.concern.background !== '' && (
                  <div className={css.concernBg}>背景：{tree.concern.background}</div>
                )}
                {openConcerns[tree.concern.id] === true && (
                  <div className={css.list}>
                    {tree.mentions.length === 0 && <div className={css.cardSub}><span className={css.cardMeta}>暂无后续更新。</span></div>}
                    {tree.mentions.map(mention => (
                      <div key={mention.id} className={css.cardSub}>
                        <span className={css.cardMeta}>{formatTs(mention.ts)}</span>
                        <span className={css.cardTitle}>{mention.title}</span>
                        {mention.sourceDiaryIds.length > 0 && (
                          <span className={css.cardMeta}>← 日记 {mention.sourceDiaryIds.map(id => id.slice(0, 6)).join('、')}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className={css.cardSub}>
                  <select
                    value={tree.concern.status ?? 'ongoing'}
                    onChange={e => { void runSetConcernStatus(tree, e.target.value as ConcernStatus) }}
                  >
                    <option value="ongoing">未闭环</option>
                    <option value="concluded">已闭环</option>
                    <option value="recurring">反复出现</option>
                    <option value="paused">搁置</option>
                  </select>
                  <button type="button" className={`${css.btn} ${css.btnDanger}`} onClick={() => { void runDeleteConcern(tree) }}>删除</button>
                </div>
              </div>
            ))}
          </div>
          <Pager page={concernPage} pageSize={concernPageSize} total={concernTotal} onPage={setConcernPage} />
        </section>
      )}

      {tab === 'facts' && (
        <section className={css.column}>
          <div className={css.toolbar}>
            <label className={css.field}>
              <span>画像分类</span>
              <select value={category} onChange={e => { setCategory(e.target.value); setFactPage(0) }}>
                <option value="">全部</option>
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className={css.check}>
              <input type="checkbox" checked={includeHistory} onChange={e => { setIncludeHistory(e.target.checked); setFactPage(0) }} />
              显示历史版本（双时间轴）
            </label>
            <PageSizeSelect value={factPageSize} onChange={v => { setFactPageSize(v); setFactPage(0) }} />
          </div>
          {error !== null && <div className={css.error}>{error}</div>}
          {facts.length === 0 && <div className={css.empty}>暂无画像条目。代理记录日记后按周期提取（memory_extract），或在本页「人工管理」中直接添加。</div>}
          <table className={css.table}>
            <thead>
              <tr><th>分类/键</th><th>值</th><th>佐证</th><th>来源</th><th>状态</th><th>生效起</th><th>操作</th></tr>
            </thead>
            <tbody>
              {facts.map(fact => (
                <Fragment key={fact.id}>
                  <tr>
                    <td>{CATEGORY_LABELS[fact.category] ?? fact.category} / {fact.factKey}</td>
                    <td className={css.valueCell}>{fact.value}</td>
                    <td>×{String(fact.corroboration)}</td>
                    <td>
                      {fact.sourceDiaryIds.length === 0
                        ? <span className={css.cardMeta}>人工/无</span>
                        : (
                          <span className={css.cellActions}>
                            <span
                              className={css.payloadToggle}
                              title={openFactSources[fact.id] === true ? '收起来源日记' : '展开来源日记'}
                              onClick={() => { toggleFactSources(fact) }}
                            >
                              {openFactSources[fact.id] === true ? '▾' : '▸'}
                            </span>
                            <span className={css.cardMeta}>← {String(fact.sourceDiaryIds.length)} 条日记</span>
                          </span>
                        )}
                    </td>
                    <td>
                      {fact.locked && <span className={`${css.badge} ${css.badgePinned}`}>已确认</span>}
                      {fact.conflictPending && <span className={`${css.badge} ${css.badgeConflict}`}>冲突待裁决</span>}
                      {fact.validTo !== undefined && <span className={`${css.badge} ${css.statusOther}`}>历史</span>}
                    </td>
                    <td>{formatTs(fact.validFrom)}</td>
                    <td className={css.cellActions}>
                      <button type="button" className={css.btn} onClick={() => { void runConfirm(fact) }}>
                        {fact.locked ? '解锁' : '确认'}
                      </button>
                      <button type="button" className={css.btn} onClick={() => { void runEditFact(fact) }}>编辑</button>
                      <button type="button" className={`${css.btn} ${css.btnDanger}`} onClick={() => { void runDeleteFact(fact) }}>删除</button>
                    </td>
                  </tr>
                  {openFactSources[fact.id] === true && (
                    <tr>
                      <td colSpan={7}>
                        <div className={css.list}>
                          {(factSources[fact.id] ?? []).length === 0
                            ? <div className={css.cardSub}><span className={css.cardMeta}>加载中…（或来源日记已不存在）</span></div>
                            : (factSources[fact.id] ?? []).map(entry => (
                              <div key={entry.id} className={css.cardSub}>
                                <span className={`${css.badge} ${css.statusCandidate}`}>{DIARY_KIND_LABELS[entry.kind] ?? entry.kind}</span>
                                <span className={css.cardTitle}>{entry.content}</span>
                                <span className={css.cardMeta}>{formatTs(entry.ts)}</span>
                              </div>
                            ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          <Pager page={factPage} pageSize={factPageSize} total={factTotal} onPage={setFactPage} />
        </section>
      )}

    </div>
  )
}
