/**
 * Memory workbench header action: registers into the conversation session
 * header utilities slot, to the left of the Session log button. A plain text
 * capsule (same visual style as Session log, no icon) that opens the
 * shell.overlay workbench on click.
 *
 * No DSH store handle is used here (the header slot is scope "session" while
 * the overlay slot is scope "root" — sharing a handle would violate DSH's
 * "one handle, one scope" rule). Page selection goes through the injected
 * selectPage function from the module-level observable in navStore.ts.
 */

import type { ReactElement } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-conversation's SlotMap merge (the conversation.session.header.utilities entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { MemoryNavKey } from './navStore.ts'
import css from './MemoryHeaderAction.module.css'

/** Injected face: the module-level page selector. */
export interface MemoryHeaderActionInjected {
  selectPage: (page: MemoryNavKey) => void
}

/** Full props: header owner share + injected page selector. */
export type MemoryHeaderActionProps =
  & PropsRuntime<'conversation.session.header.utilities'>
  & MemoryHeaderActionInjected

/**
 * Render the header entry. Clicking selects the first monitoring page, which
 * opens the workbench overlay. The button carries `data-memory-nav` so the
 * workbench's click-outside dismissal treats it as part of the monitoring
 * surface.
 * @param props - composed slot props.
 * @returns the capsule button.
 */
export function MemoryHeaderAction(props: MemoryHeaderActionProps): ReactElement {
  return (
    <button
      type="button"
      className={css.memoryButton}
      data-memory-nav
      aria-label="记忆监控"
      onClick={() => { props.selectPage('experience') }}
    >
      <span>记忆</span>
    </button>
  )
}
