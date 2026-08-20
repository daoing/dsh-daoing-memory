/**
 * Experience library monitoring page: lifecycle counters, a filterable
 * revision list with the Beta-posterior triple, expandable judgment context,
 * family revision history, and the human verbs (pin/promote/rollback/delete).
 */
import type { MemoryWorkbenchActions } from './actions.ts';
export interface ExperiencePageProps {
    /** The injected memory callbacks. */
    actions: MemoryWorkbenchActions;
    /** Called after any mutation so the header stats refresh. */
    onChanged: () => void;
}
/** The experience library monitoring page. */
export declare function ExperiencePage({ actions, onChanged }: ExperiencePageProps): React.ReactElement;
//# sourceMappingURL=ExperiencePage.d.ts.map