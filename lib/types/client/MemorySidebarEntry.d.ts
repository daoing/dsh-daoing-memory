import type { ReactElement } from 'react';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { MemoryNavKey } from './navStore.ts';
/** Injected face: the module-level page selector. */
export interface MemorySidebarEntryInjected {
    selectPage: (page: MemoryNavKey) => void;
}
/** Full props: sidebar owner share (wide/expandSidebar) + injected page selector. */
export type MemorySidebarEntryProps = PropsRuntime<'sidebar.sections'> & MemorySidebarEntryInjected;
/**
 * Render the always-present sidebar entry. Wide mode shows icon + label; the
 * rail shows icon only. Clicking opens the workbench at 人工管理 (global,
 * session-free) so the memory library is manageable without opening a session.
 * @param props - composed slot props.
 * @returns the nav button.
 */
export declare function MemorySidebarEntry({ wide, expandSidebar, selectPage }: MemorySidebarEntryProps): ReactElement;
//# sourceMappingURL=MemorySidebarEntry.d.ts.map