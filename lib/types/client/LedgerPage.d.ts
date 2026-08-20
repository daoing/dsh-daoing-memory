/**
 * Ledger page: the append-only hash-chained audit trail of every memory
 * mutation (agent and human alike), with filters, an end-to-end integrity
 * check, and the full-library export used by experiments and migration.
 */
import type { MemoryWorkbenchActions } from './actions.ts';
export interface LedgerPageProps {
    /** The injected memory callbacks. */
    actions: MemoryWorkbenchActions;
}
/** The audit ledger page. */
export declare function LedgerPage({ actions }: LedgerPageProps): React.ReactElement;
//# sourceMappingURL=LedgerPage.d.ts.map