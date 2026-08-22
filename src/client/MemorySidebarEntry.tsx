/**
 * Memory workbench sidebar entry: an always-present nav row in the sidebar
 * sections region (root scope — mounted whether or not a session is current).
 * The host memory remote ignores its session argument (`void agent`), so
 * opening 人工管理 from here needs no session. Clicking expands a rail first,
 * then selects a page. `data-memory-nav` keeps the workbench's click-outside
 * dismissal from treating this row as an outside click.
 */
import clsx from 'clsx'
import type { ReactElement } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-sidebar's SlotMap merge (the 'sidebar.sections' entry).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { IconDataOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MemoryNavKey } from './navStore.ts'
import css from './MemorySidebarEntry.module.css'

/** Injected face: the module-level page selector. */
export interface MemorySidebarEntryInjected {
  selectPage: (page: MemoryNavKey) => void
}

/** Full props: sidebar owner share (wide/expandSidebar) + injected page selector. */
export type MemorySidebarEntryProps =
  & PropsRuntime<'sidebar.sections'>
  & MemorySidebarEntryInjected

/**
 * Render the always-present sidebar entry. Wide mode shows icon + label; the
 * rail shows icon only. Clicking opens the workbench at 人工管理 (global,
 * session-free) so the memory library is manageable without opening a session.
 * @param props - composed slot props.
 * @returns the nav button.
 */
export function MemorySidebarEntry({ wide, expandSidebar, selectPage }: MemorySidebarEntryProps): ReactElement {
  const open = (page: MemoryNavKey): void => {
    if (!wide) expandSidebar()
    selectPage(page)
  }
  return (
    <button
      type="button"
      className={clsx(css.entry, !wide && css.rail)}
      data-memory-nav
      aria-label="记忆"
      onClick={() => { open('human') }}
    >
      <IconDataOutline16 size={wide ? 16 : 18} className={css.icon} />
      {wide && <span className={css.label}>记忆</span>}
    </button>
  )
}
