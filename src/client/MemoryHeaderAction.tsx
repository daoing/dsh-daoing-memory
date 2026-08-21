/**
 * Memory workbench header action: registers into the conversation session
 * header utilities slot, to the left of the Session log button. A plain text
 * capsule (same visual style as Session log, no icon) that opens the
 * shell.overlay workbench on click.
 */

import type { ReactElement } from 'react'
import type { PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-conversation's SlotMap merge (the conversation.session.header.utilities entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { createMemoryNavStore } from './navStore.ts'
import css from './MemoryHeaderAction.module.css'

/** Full props: header owner share + the shared nav store. */
export type MemoryHeaderActionProps =
  & PropsRuntime<'conversation.session.header.utilities'>
  & PropsStore<ReturnType<typeof createMemoryNavStore>>

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
      onClick={() => { props.actions.select('experience') }}
    >
      <span>记忆</span>
    </button>
  )
}
