/**
 * Ledger page: the append-only hash-chained audit trail of every memory
 * mutation (agent and human alike), with filters, an end-to-end integrity
 * check, and the full-library export used by experiments and migration.
 */

import { useCallback, useEffect, useState } from 'react'
import type { LedgerBlock, LedgerIntegrityResult } from '../types.ts'
import type { MemoryWorkbenchActions } from './actions.ts'
import { formatTs } from './Workbench.tsx'
import css from './Workbench.module.css'

/** Chinese gloss for each ledger op so the audit trail reads naturally. */
const OP_LABELS: Record<string, string> = {
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
}

/** Render an op with its Chinese gloss in parentheses. */
function opLabel(op: string): string {
  const label = OP_LABELS[op]
  return label === undefined ? op : `${op}（${label}）`
}

export interface LedgerPageProps {
  /** The injected memory callbacks. */
  actions: MemoryWorkbenchActions
}

/** The audit ledger page. */
export function LedgerPage({ actions }: LedgerPageProps): React.ReactElement {
  const [objectType, setObjectType] = useState('')
  const [op, setOp] = useState('')
  const [objectId, setObjectId] = useState('')
  const [seqFrom, setSeqFrom] = useState('')
  const [seqTo, setSeqTo] = useState('')
  const [blocks, setBlocks] = useState<LedgerBlock[]>([])
  const [integrity, setIntegrity] = useState<LedgerIntegrityResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [expandedSeq, setExpandedSeq] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  // View-side pagination (007 §2): the ledger itself is append-only and never
  // shrinks; we only page what is shown. Default page size 10 (most recent first).
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)

  // Build the shared filter (everything except limit/offset) once.
  const filter = {
    ...(objectType === '' ? {} : { objectType: objectType as 'experience' | 'fact' | 'diary' | 'library' | 'concern' }),
    ...(op === '' ? {} : { op }),
    ...(objectId.trim() === '' ? {} : { objectId: objectId.trim() }),
    ...(seqFrom.trim() === '' ? {} : { seqFrom: Number(seqFrom.trim()) }),
    ...(seqTo.trim() === '' ? {} : { seqTo: Number(seqTo.trim()) }),
  }

  const refresh = useCallback((): void => {
    void actions.ledgerQuery({ ...filter, limit: pageSize, offset: page * pageSize })
      .then(setBlocks).catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e))
      })
    void actions.ledgerQueryCount(filter).then(setTotal).catch(() => { /* count unavailable */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, objectType, op, objectId, seqFrom, seqTo, pageSize, page])

  useEffect(() => { refresh() }, [refresh])

  // Any filter change snaps back to the first page.
  const applyFilter = useCallback((setter: (v: string) => void) => (v: string): void => {
    setter(v)
    setPage(0)
  }, [])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const runIntegrity = useCallback((): void => {
    setChecking(true)
    void actions.verifyLedger().then((result) => {
      setIntegrity(result)
      setChecking(false)
    }).catch(() => { setChecking(false) })
  }, [actions])

  const runExport = useCallback((): void => {
    void actions.exportLibrary().then((data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `memory-export-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`
      anchor.click()
      URL.revokeObjectURL(url)
    }).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e))
    })
  }, [actions])

  return (
    <div className={css.page}>
      <div className={css.empty}>
        账本是「修」的审计底座：每一次生·用·修·记操作（代理与人工 alike）都追加一块，
        块内含上一块哈希，形成不可篡改的哈希链。它回答「谁、在何时、对哪条记忆、
        做了什么、为什么」。「完整性校验」重算全链验证无篡改；人工操作必须填原因。
      </div>
      <div className={css.toolbar}>
        <label className={css.field}>
          <span>对象类型</span>
          <select value={objectType} onChange={e => { applyFilter(setObjectType)(e.target.value) }}>
            <option value="">全部</option>
            <option value="experience">经验</option>
            <option value="fact">画像</option>
            <option value="diary">日记</option>
            <option value="concern">关心事项</option>
            <option value="library">库级</option>
          </select>
        </label>
        <label className={css.field}>
          <span>操作</span>
          <select value={op} onChange={e => { applyFilter(setOp)(e.target.value) }}>
            <option value="">全部</option>
            {Object.keys(OP_LABELS).map(key => (
              <option key={key} value={key}>{opLabel(key)}</option>
            ))}
          </select>
        </label>
        <label className={css.field}>
          <span>对象 id</span>
          <input value={objectId} placeholder="经验或画像 id" onChange={e => { applyFilter(setObjectId)(e.target.value) }} />
        </label>
        <label className={css.field}>
          <span>块号从</span>
          <input value={seqFrom} placeholder="如 1" onChange={e => { applyFilter(setSeqFrom)(e.target.value) }} />
        </label>
        <label className={css.field}>
          <span>到</span>
          <input value={seqTo} placeholder="如 100" onChange={e => { applyFilter(setSeqTo)(e.target.value) }} />
        </label>
        <button type="button" className={css.btn} onClick={refresh}>刷新</button>
        <button type="button" className={css.btn} onClick={runIntegrity} disabled={checking}
          title="从第 1 块起逐块重算哈希并与块内存储的哈希比对，任何篡改都会导致断裂">
          {checking ? '校验中…' : '完整性校验'}
        </button>
        <button type="button" className={css.btn} onClick={runExport}>导出全库 JSON</button>
        {integrity !== null && (
          integrity.ok
            ? <span className={css.okLine}>✓ 哈希链完整（{String(integrity.checked)} 块）</span>
            : <span className={css.error}>✗ 哈希链在 #{String(integrity.brokenAt ?? 0)} 处断裂</span>
        )}
        {error !== null && <span className={css.error}>{error}</span>}
      </div>

      {blocks.length === 0 && <div className={css.empty}>账本为空：还没有任何生用修记操作。</div>}
      <table className={css.table}>
        <thead>
          <tr><th>#</th><th>时间</th><th>操作</th><th>对象</th><th>行动者</th><th>原因</th><th>载荷</th></tr>
        </thead>
        <tbody>
          {blocks.map(block => (
            <tr key={block.seq}>
              <td>{String(block.seq)}</td>
              <td>{formatTs(block.ts)}</td>
              <td><span className={`${css.badge} ${css.statusCandidate}`}>{opLabel(block.op)}</span></td>
              <td>{block.objectType}:{block.objectId.slice(0, 8)}</td>
              <td>{block.actor}</td>
              <td>{block.reason ?? ''}</td>
              <td>
                <div className={css.cellActions}>
                  <div className={expandedSeq === block.seq ? css.payloadFull : css.valueCell}>
                    {expandedSeq === block.seq ? block.payload : (block.payload.length > 80 ? `${block.payload.slice(0, 80)}…` : block.payload)}
                  </div>
                  {block.payload.length > 80 && (
                    <span
                      className={css.payloadToggle}
                      title={expandedSeq === block.seq ? '收起' : '展开'}
                      onClick={() => { setExpandedSeq(expandedSeq === block.seq ? null : block.seq) }}
                    >
                      {expandedSeq === block.seq ? '▾' : '▸'}
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={css.toolbar}>
        <label className={css.field}>
          <span>每页</span>
          <select value={String(pageSize)} onChange={e => { setPageSize(Number(e.target.value)); setPage(0) }}>
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
          </select>
        </label>
        <button type="button" className={css.btn} disabled={page <= 0} onClick={() => { setPage(page - 1) }}>上一页</button>
        <span className={css.cardMeta}>第 {String(page + 1)} / {String(totalPages)} 页 · 共 {String(total)} 块</span>
        <button type="button" className={css.btn} disabled={page + 1 >= totalPages} onClick={() => { setPage(page + 1) }}>下一页</button>
        <span className={css.cardMeta}>账本只增不删（哈希链审计）；此处仅分页展示，不删除任何块。</span>
      </div>
    </div>
  )
}
