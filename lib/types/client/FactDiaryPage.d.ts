/**
 * Profile·concerns page, split into two sub-pages: 关心事项 (open-loop memos) /
 * 画像分类 (the AI's perception of the user). The event-layer diary is the
 * append-only raw material and is surfaced only as per-fact provenance (来源日记),
 * not as its own browsing tab. Facts paginate server-side; concerns stay as an
 * expandable tree. All human mutations go through the audited Remote callbacks.
 */
import type { MemoryWorkbenchActions } from './actions.ts';
export interface FactDiaryPageProps {
    /** The injected memory callbacks. */
    actions: MemoryWorkbenchActions;
    /** Called after any mutation so the header stats refresh. */
    onChanged: () => void;
}
/** The profile·concerns page with two sub-pages (diary demoted to per-fact provenance). */
export declare function FactDiaryPage({ actions, onChanged }: FactDiaryPageProps): React.ReactElement;
//# sourceMappingURL=FactDiaryPage.d.ts.map