/**
 * Memory monitoring nav group: the additive sidebar.sections entry between
 * the New Session button and the workspace browser. Wide shows a collapsible
 * group (header + four page items); the 56px rail shows one icon that expands
 * the column and opens the first page. Selection writes the shared memory nav
 * store that the shell.overlay takeover reads.
 */

import type { ReactElement } from 'react'
import clsx from 'clsx'
import type { PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-sidebar's SlotMap merge (the sidebar.sections entry).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { IconChevronDownOutline14, IconDataOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { MEMORY_NAV_ITEMS, type createMemoryNavStore } from './navStore.ts'
import css from './MemoryNavSection.module.css'

/** Full props: sidebar owner share (wide/expandSidebar) + the shared nav store. */
export type MemoryNavSectionProps =
  & PropsRuntime<'sidebar.sections'>
  & PropsStore<ReturnType<typeof createMemoryNavStore>>

/**
 * Render the nav group. The rail variant is a single icon: it selects the
 * first page and expands the sidebar so the group becomes visible.
 * @param props - composed slot props.
 * @returns the group element tree.
 */
export function MemoryNavSection(props: MemoryNavSectionProps): ReactElement {
  const { wide, expandSidebar } = props
  const nav = props.useStore(s => s)

  if (!wide) {
    return (
      <button
        type="button"
        className={css.rail}
        aria-label="记忆监控"
        data-memory-nav
        onClick={() => {
          props.actions.select('experience')
          expandSidebar()
        }}
      >
        <IconDataOutline16 size={18} />
      </button>
    )
  }

  return (
    <nav className={css.group} aria-label="记忆监控" data-memory-nav>
      <button
        type="button"
        className={css.header}
        aria-expanded={!nav.collapsed}
        onClick={() => { props.actions.toggleCollapsed() }}
      >
        <IconChevronDownOutline14
          size={14}
          className={clsx(css.chevron, nav.collapsed && css.chevronCollapsed)}
        />
        <span className={css.headerLabel}>记忆监控</span>
      </button>
      {!nav.collapsed && (
        <div className={css.items}>
          {MEMORY_NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={clsx(css.item, nav.page === item.key && css.itemActive)}
              aria-current={nav.page === item.key ? 'page' : undefined}
              onClick={() => { props.actions.select(item.key) }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </nav>
  )
}
