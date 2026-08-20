/**
 * Memory workbench takeover: covers the frame area to the right of the
 * sidebar while a monitoring page is selected in the left-sidebar memory nav
 * group. The header title follows the selected page; opening a session row
 * clears the selection and returns to the native conversation view. All human
 * mutations go through the audited Remote callbacks.
 */
import type { PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots';
import type { MemoryRemoteActions } from './actions.ts';
import { type createMemoryNavStore } from './navStore.ts';
/** Full props of the overlay entry: session standard kit + the shared nav store + injected memory callbacks (session-first). */
export type MemoryWorkbenchProps = PropsRuntime<'shell.overlay'> & PropsStore<ReturnType<typeof createMemoryNavStore>> & MemoryRemoteActions;
/** Format an epoch-ms timestamp as a compact local string. */
export declare function formatTs(ts: number): string;
/** Confirmation prompt with an audited reason; resolves undefined when cancelled. */
export declare function promptReason(action: string): string | undefined;
/**
 * The workbench entry component. Renders nothing unless a monitoring page is
 * selected in the nav store and a current session exists (the Remote face is
 * session-bound).
 */
export declare function MemoryWorkbench(props: MemoryWorkbenchProps): React.ReactElement | null;
//# sourceMappingURL=Workbench.d.ts.map