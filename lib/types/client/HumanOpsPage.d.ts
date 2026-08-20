/**
 * Human management page: the fixed-format injection and editing forms.
 * Human additions use the ordinary experience/fact structure (fixed format);
 * every submit collects an audited reason and lands in the ledger as
 * actor=human. Pin/delete/edit verbs also live on the monitoring pages.
 */
import type { MemoryWorkbenchActions } from './actions.ts';
export interface HumanOpsPageProps {
    /** The injected memory callbacks. */
    actions: MemoryWorkbenchActions;
    /** Called after any mutation so the header stats refresh. */
    onChanged: () => void;
}
/** The human management page. */
export declare function HumanOpsPage({ actions, onChanged }: HumanOpsPageProps): React.ReactElement;
//# sourceMappingURL=HumanOpsPage.d.ts.map