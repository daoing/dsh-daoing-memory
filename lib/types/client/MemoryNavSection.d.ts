/**
 * Memory monitoring nav group: the additive sidebar.sections entry between
 * the New Session button and the workspace browser. Wide shows a collapsible
 * group (header + four page items); the 56px rail shows one icon that expands
 * the column and opens the first page. Selection writes the shared memory nav
 * store that the shell.overlay takeover reads.
 */
import type { ReactElement } from 'react';
import type { PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots';
import { type createMemoryNavStore } from './navStore.ts';
/** Full props: sidebar owner share (wide/expandSidebar) + the shared nav store. */
export type MemoryNavSectionProps = PropsRuntime<'sidebar.sections'> & PropsStore<ReturnType<typeof createMemoryNavStore>>;
/**
 * Render the nav group. The rail variant is a single icon: it selects the
 * first page and expands the sidebar so the group becomes visible.
 * @param props - composed slot props.
 * @returns the group element tree.
 */
export declare function MemoryNavSection(props: MemoryNavSectionProps): ReactElement;
//# sourceMappingURL=MemoryNavSection.d.ts.map