import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
import { useEffect, useRef, useState } from 'react';
import css from './ReasonDialog.module.css';
let pendingRequest = null;
let renderCallback = null;
function showDialog(request) {
    return new Promise((resolve) => {
        pendingRequest = { ...request, resolve };
        renderCallback?.();
    });
}
/**
 * Show the reason dialog and wait for the user's response.
 * @param action - human-readable action name shown in the title.
 * @returns the trimmed reason on confirm, or undefined on cancel/empty.
 */
export function showReasonDialog(action) {
    return showDialog({
        title: `「${action}」需要填写原因`,
        subtitle: '此操作将写入审计账本，原因必填',
        placeholder: '请填写原因…',
        defaultValue: '',
        requireNonEmpty: true,
    });
}
/**
 * Show a generic input dialog and wait for the user's response.
 * @param title - dialog title.
 * @param defaultValue - pre-filled value (optional).
 * @returns the trimmed value on confirm, or undefined on cancel. Empty string is allowed.
 */
export function showInputDialog(title, defaultValue = '') {
    return showDialog({
        title,
        subtitle: '',
        placeholder: '请输入…',
        defaultValue,
        requireNonEmpty: false,
    });
}
/**
 * The dialog component. Mount once at the workbench root; it stays invisible
 * until showReasonDialog or showInputDialog is called.
 */
export function ReasonDialogHost() {
    const [, forceRender] = useState(0);
    const textareaRef = useRef(null);
    useEffect(() => {
        renderCallback = () => { forceRender(n => n + 1); };
        return () => { renderCallback = null; };
    }, []);
    useEffect(() => {
        if (pendingRequest) {
            requestAnimationFrame(() => {
                const el = textareaRef.current;
                if (el) {
                    el.focus();
                    // Select all text for easy replacement
                    el.select();
                }
            });
        }
    }, [pendingRequest?.title]);
    if (!pendingRequest)
        return null;
    const { title, subtitle, placeholder, defaultValue, requireNonEmpty, resolve } = pendingRequest;
    const handleConfirm = () => {
        const value = textareaRef.current?.value?.trim() ?? '';
        if (requireNonEmpty && value === '')
            return;
        pendingRequest = null;
        resolve(value);
        forceRender(n => n + 1);
    };
    const handleCancel = () => {
        pendingRequest = null;
        resolve(undefined);
        forceRender(n => n + 1);
    };
    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            handleCancel();
        }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleConfirm();
        }
    };
    return (_jsx("div", { className: css.overlay, onClick: handleCancel, children: _jsxs("div", { className: css.dialog, onClick: (e) => { e.stopPropagation(); }, onKeyDown: handleKeyDown, children: [_jsxs("div", { className: css.header, children: [_jsx("span", { className: css.title, children: title }), subtitle && _jsx("span", { className: css.subtitle, children: subtitle })] }), _jsx("textarea", { ref: textareaRef, className: css.textarea, placeholder: placeholder, defaultValue: defaultValue, rows: 4 }), _jsxs("div", { className: css.footer, children: [_jsx("span", { className: css.hint, children: "Ctrl+Enter \u786E\u8BA4 \u00B7 Esc \u53D6\u6D88" }), _jsxs("div", { className: css.buttons, children: [_jsx("button", { type: "button", className: css.btnCancel, onClick: handleCancel, children: "\u53D6\u6D88" }), _jsx("button", { type: "button", className: css.btnConfirm, onClick: handleConfirm, children: "\u786E\u8BA4" })] })] })] }) }));
}
//# sourceMappingURL=ReasonDialog.js.map