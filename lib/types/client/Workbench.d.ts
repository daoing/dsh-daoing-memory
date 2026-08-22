/**
 * Memory workbench takeover: covers the frame area to the right of the
 * sidebar while a monitoring page is selected. The entry point is the
 * conversation.session.header.utilities button (MemoryHeaderAction, left of
 * Session log); page switching lives inside this panel as a tab bar so all
 * four pages remain reachable. Opening a session row clears the selection
 * and returns to the native conversation view. All human mutations go through
 * the audited Remote callbacks.
 *
 * IMPORTANT: No DSH store handle is used here. The overlay slot has scope
 * "root" while the header slot has scope "session" — sharing a handle would
 * violate DSH's "one handle, one scope" rule. Page state comes from the
 * module-level observable in navStore.ts via useCurrentPage().
 */
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { MemoryRemoteActions } from './actions.ts';
/** Full props of the overlay entry: session standard kit + injected memory callbacks (session-first). */
export type MemoryWorkbenchProps = PropsRuntime<'shell.overlay'> & MemoryRemoteActions;
/** Format an epoch-ms timestamp as a compact local string. */
export declare function formatTs(ts: number): string;
/**
 * Confirmation prompt with an audited reason; resolves undefined when cancelled.
 * Uses the custom ReasonDialog instead of the browser's native window.prompt.
 */
export declare function promptReason(action: string): Promise<string | undefined>;
export declare function MemoryWorkbench(props: MemoryWorkbenchProps): React.ReactElement | null;
//# sourceMappingURL=Workbench.d.ts.map