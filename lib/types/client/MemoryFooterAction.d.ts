/**
 * Memory workbench footer action: the sidebar.footer.action entry at the foot
 * of the left column, beside Settings. One click opens the shell.overlay
 * takeover on the first monitoring page; the shared memory nav store carries
 * the selection. The rail variant renders a bare icon, the wide variant adds
 * a label. Carries the `data-memory-nav` marker so the workbench's
 * click-outside dismissal treats it as part of the monitoring surface.
 */
import type { ReactElement } from 'react';
import type { PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots';
import type { createMemoryNavStore } from './navStore.ts';
/** Full props: sidebar owner share (wide) + the shared nav store. */
export type MemoryFooterActionProps = PropsRuntime<'sidebar.footer.action'> & PropsStore<ReturnType<typeof createMemoryNavStore>>;
/**
 * Render the footer entry. The wide variant shows an icon + label button;
 * the rail variant is a single icon. Clicking selects the first monitoring
 * page, which opens the workbench overlay.
 * @param props - composed slot props.
 * @returns the action button.
 */
export declare function MemoryFooterAction(props: MemoryFooterActionProps): ReactElement;
//# sourceMappingURL=MemoryFooterAction.d.ts.map