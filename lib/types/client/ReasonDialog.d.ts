/**
 * Custom modal dialogs: replaces the browser's native window.prompt for
 * audited human operations (delete, rollback, etc.) and value editing.
 * A modal overlay with a textarea, confirm/cancel buttons, and DSH theme tokens.
 *
 * Usage:
 *   showReasonDialog(action) → Promise<string | undefined>  (reason required)
 *   showInputDialog(title, defaultValue?) → Promise<string | undefined>  (value optional)
 *
 * The dialog is rendered as a fixed overlay (DSH slots don't provide a modal
 * seat; a fixed-position element is the standard pattern).
 */
/**
 * Show the reason dialog and wait for the user's response.
 * @param action - human-readable action name shown in the title.
 * @returns the trimmed reason on confirm, or undefined on cancel/empty.
 */
export declare function showReasonDialog(action: string): Promise<string | undefined>;
/**
 * Show a generic input dialog and wait for the user's response.
 * @param title - dialog title.
 * @param defaultValue - pre-filled value (optional).
 * @returns the trimmed value on confirm, or undefined on cancel. Empty string is allowed.
 */
export declare function showInputDialog(title: string, defaultValue?: string): Promise<string | undefined>;
/**
 * The dialog component. Mount once at the workbench root; it stays invisible
 * until showReasonDialog or showInputDialog is called.
 */
export declare function ReasonDialogHost(): React.ReactElement | null;
//# sourceMappingURL=ReasonDialog.d.ts.map