/**
 * Memory workbench takeover: covers the frame area to the right of the
 * sidebar while a monitoring page is selected. The entry point is the
 * sidebar.footer.action button (MemoryFooterAction); page switching lives
 * inside this panel as a tab bar so all four pages remain reachable without
 * relying on a sidebar nav group. Opening a session row clears the selection
 * and returns to the native conversation view. All human mutations go through
 * the audited Remote callbacks.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import type { PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { MemoryWorkbenchInfo, MemoryStats } from '../types.ts'
import type { MemoryRemoteActions, MemoryWorkbenchActions } from './actions.ts'
import { bindMemoryActions } from './actions.ts'
import { MEMORY_NAV_ITEMS, type createMemoryNavStore } from './navStore.ts'
import { ExperiencePage } from './ExperiencePage.tsx'
import { FactDiaryPage } from './FactDiaryPage.tsx'
import { LedgerPage } from './LedgerPage.tsx'
import { HumanOpsPage } from './HumanOpsPage.tsx'
import css from './Workbench.module.css'

/** Full props of the overlay entry: session standard kit + the shared nav store + injected memory callbacks (session-first). */
export type MemoryWorkbenchProps =
  & PropsRuntime<'shell.overlay'>
  & PropsStore<ReturnType<typeof createMemoryNavStore>>
  & MemoryRemoteActions

/** Format an epoch-ms timestamp as a compact local string. */
export function formatTs(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

/** Confirmation prompt with an audited reason; resolves undefined when cancelled. */
export function promptReason(action: string): string | undefined {
  const reason = window.prompt(`「${action}」将写入审计账本。请填写原因（必填）：`)
  if (reason === null) return undefined
  const trimmed = reason.trim()
  if (trimmed === '') {
    window.alert('原因是必填项：人工操作必须可审计。')
    return undefined
  }
  return trimmed
}

/**
 * The workbench entry component. Renders nothing unless a monitoring page is
 * selected in the nav store and a current session exists (the Remote face is
 * session-bound).
 */
export function MemoryWorkbench(props: MemoryWorkbenchProps): React.ReactElement | null {
  const nav = props.useStore(s => s)
  const sessionList = props.useSessions(s => s)
  const sessionId = sessionList.current

  const [info, setInfo] = useState<MemoryWorkbenchInfo | null>(null)
  const [stats, setStats] = useState<MemoryStats | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(260)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const fetchInfo = props.workbenchInfo
  const fetchStats = props.stats

  useEffect(() => {
    if (sessionId === undefined) return
    let cancelled = false
    void fetchInfo(sessionId).then((value) => {
      if (!cancelled) setInfo(value)
    }).catch(() => { /* service absent: the workbench stays hidden */ })
    return () => { cancelled = true }
  }, [fetchInfo, sessionId])

  const refreshStats = useCallback((): void => {
    if (sessionId === undefined) return
    void fetchStats(sessionId).then(setStats).catch(() => { /* stats unavailable */ })
  }, [fetchStats, sessionId])

  useEffect(() => {
    if (info === null) return
    refreshStats()
    const timer = setInterval(refreshStats, 15000)
    return () => { clearInterval(timer) }
  }, [info, refreshStats, nav.page])

  const active = nav.page !== null && info !== null && sessionId !== undefined

  // Opening a session returns to the native conversation view: clear the nav
  // selection whenever the current session changes. Never fires on mount —
  // the store survives remounts, so the initial ref value is the baseline.
  // Clicking outside the takeover (a session row, New Session, settings —
  // anything but the memory nav group and the panel itself) returns to the
  // native view. Click-outside is the deterministic dismissal signal: opening
  // an already-current session reuses it without moving `current`, so a
  // session-change watch alone would miss the gesture.
  useEffect(() => {
    if (!active) return
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('[data-memory-workbench]') !== null) return
      if (target.closest('[data-memory-nav]') !== null) return
      props.actions.clear()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => { window.removeEventListener('pointerdown', onPointerDown, true) }
  }, [active, props.actions])

  // Belt and braces: a genuine current-session change (quick-open, another
  // tab's session) also returns to the conversation. The ref baseline keeps
  // the mount-time restore of the persisted selection from clearing.
  const prevSession = useRef(sessionId)
  useEffect(() => {
    if (prevSession.current === sessionId) return
    prevSession.current = sessionId
    props.actions.clear()
  }, [sessionId, props.actions])

  // Measure the sidebar column so the panel starts exactly where it ends. The
  // slot renderer wraps each entry in its own div, so walk up to the overlay
  // layer (the stable data-shell-overlay hook) and take the frame's first
  // child — the sidebar column.
  useEffect(() => {
    if (!active) return
    const root = rootRef.current
    if (root === null) return
    const layer = root.closest('[data-shell-overlay]')
    const frame = layer?.parentElement ?? null
    const sidebar = frame?.firstElementChild ?? null
    if (!(sidebar instanceof HTMLElement)) return
    const update = (): void => { setSidebarWidth(sidebar.getBoundingClientRect().width) }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(sidebar)
    return () => { observer.disconnect() }
  }, [active])

  // The pages call the session-free face; bind once per current session. The
  // injected Remote callbacks are minted once per plugin activation, so only a
  // session change rebuilds the bound face (a remount rebuilds the component).
  const bound: MemoryWorkbenchActions | null = useMemo(
    () => (sessionId === undefined ? null : bindMemoryActions(props, sessionId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable injected face, see comment above
    [sessionId],
  )

  if (!active || info === null || bound === null) return null

  const current = MEMORY_NAV_ITEMS.find(item => item.key === nav.page)
  const title = current?.label ?? info.workspaceTitle

  return (
    <div ref={rootRef} className={css.panel} style={{ left: `${String(sidebarWidth)}px` }} data-memory-workbench>
      <header className={css.header}>
        <div className={css.titleBlock}>
          <span className={css.title}>{title}</span>
          <span className={css.subtitle}>自进化记忆 · 生用修记 · 全局共享记忆库</span>
        </div>
        <div className={css.statline}>
          {stats === null
            ? '加载中…'
            : `经验 ${String(stats.experiences.total)}（live ${String(stats.experiences.byStatus.live)} / 隔离 ${String(stats.experiences.byStatus.challenged)}）· 画像 ${String(stats.facts.current)} · 日记 ${String(stats.diary.total)}（待提取 ${String(stats.diary.unextracted)}）· 账本 ${String(stats.ledgerBlocks)} 块`}
        </div>
      </header>
      <nav className={css.workbenchTabs} aria-label="记忆监控页面">
        {MEMORY_NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={clsx(css.workbenchTab, nav.page === item.key && css.workbenchTabActive)}
            aria-current={nav.page === item.key ? 'page' : undefined}
            onClick={() => { props.actions.select(item.key) }}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <main className={css.body}>
        {nav.page === 'experience' && <ExperiencePage actions={bound} onChanged={refreshStats} />}
        {nav.page === 'fact' && <FactDiaryPage actions={bound} onChanged={refreshStats} />}
        {nav.page === 'ledger' && <LedgerPage actions={bound} />}
        {nav.page === 'human' && <HumanOpsPage actions={bound} onChanged={refreshStats} />}
      </main>
    </div>
  )
}
