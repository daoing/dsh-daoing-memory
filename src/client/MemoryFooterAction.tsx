/**
 * Memory workbench footer action: the sidebar.footer.action entry at the foot
 * of the left column, beside Settings. One click opens the shell.overlay
 * takeover on the first monitoring page; the shared memory nav store carries
 * the selection. The rail variant renders a bare icon, the wide variant adds
 * a label. Carries the `data-memory-nav` marker so the workbench's
 * click-outside dismissal treats it as part of the monitoring surface.
 */

import type { ReactElement } from 'react'
import type { PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-sidebar's SlotMap merge (the sidebar.footer.action entry).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { IconDataOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { createMemoryNavStore } from './navStore.ts'
import css from './MemoryFooterAction.module.css'

/** Full props: sidebar owner share (wide) + the shared nav store. */
export type MemoryFooterActionProps =
  & PropsRuntime<'sidebar.footer.action'>
  & PropsStore<ReturnType<typeof createMemoryNavStore>>

/**
 * Render the footer entry. The wide variant shows an icon + label button;
 * the rail variant is a single icon. Clicking selects the first monitoring
 * page, which opens the workbench overlay.
 * @param props - composed slot props.
 * @returns the action button.
 */
export function MemoryFooterAction(props: MemoryFooterActionProps): ReactElement {
  const { wide } = props

  return (
    <button
      type="button"
      className={css.action}
      data-memory-nav
      aria-label="记忆监控"
      title="记忆监控"
      onClick={() => { props.actions.select('experience') }}
    >
      <IconDataOutline16 size={18} />
      {wide && <span className={css.label}>记忆</span>}
    </button>
  )
}
