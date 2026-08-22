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

import { useEffect, useRef, useState } from 'react'
import css from './ReasonDialog.module.css'

interface DialogRequest {
  title: string
  subtitle: string
  placeholder: string
  defaultValue: string
  /** When true, empty input is rejected (reason mode). When false, empty is allowed (value edit mode). */
  requireNonEmpty: boolean
  resolve: (value: string | undefined) => void
}

let pendingRequest: DialogRequest | null = null
let renderCallback: (() => void) | null = null

function showDialog(request: Omit<DialogRequest, 'resolve'>): Promise<string | undefined> {
  return new Promise((resolve) => {
    pendingRequest = { ...request, resolve }
    renderCallback?.()
  })
}

/**
 * Show the reason dialog and wait for the user's response.
 * @param action - human-readable action name shown in the title.
 * @returns the trimmed reason on confirm, or undefined on cancel/empty.
 */
export function showReasonDialog(action: string): Promise<string | undefined> {
  return showDialog({
    title: `「${action}」需要填写原因`,
    subtitle: '此操作将写入审计账本，原因必填',
    placeholder: '请填写原因…',
    defaultValue: '',
    requireNonEmpty: true,
  })
}

/**
 * Show a generic input dialog and wait for the user's response.
 * @param title - dialog title.
 * @param defaultValue - pre-filled value (optional).
 * @returns the trimmed value on confirm, or undefined on cancel. Empty string is allowed.
 */
export function showInputDialog(title: string, defaultValue = ''): Promise<string | undefined> {
  return showDialog({
    title,
    subtitle: '',
    placeholder: '请输入…',
    defaultValue,
    requireNonEmpty: false,
  })
}

/**
 * The dialog component. Mount once at the workbench root; it stays invisible
 * until showReasonDialog or showInputDialog is called.
 */
export function ReasonDialogHost(): React.ReactElement | null {
  const [, forceRender] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    renderCallback = () => { forceRender(n => n + 1) }
    return () => { renderCallback = null }
  }, [])

  useEffect(() => {
    if (pendingRequest) {
      requestAnimationFrame(() => {
        const el = textareaRef.current
        if (el) {
          el.focus()
          // Select all text for easy replacement
          el.select()
        }
      })
    }
  }, [pendingRequest?.title])

  if (!pendingRequest) return null

  const { title, subtitle, placeholder, defaultValue, requireNonEmpty, resolve } = pendingRequest

  const handleConfirm = (): void => {
    const value = textareaRef.current?.value?.trim() ?? ''
    if (requireNonEmpty && value === '') return
    pendingRequest = null
    resolve(value)
    forceRender(n => n + 1)
  }

  const handleCancel = (): void => {
    pendingRequest = null
    resolve(undefined)
    forceRender(n => n + 1)
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      handleCancel()
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleConfirm()
    }
  }

  return (
    <div className={css.overlay} onClick={handleCancel}>
      <div className={css.dialog} onClick={(e) => { e.stopPropagation() }} onKeyDown={handleKeyDown}>
        <div className={css.header}>
          <span className={css.title}>{title}</span>
          {subtitle && <span className={css.subtitle}>{subtitle}</span>}
        </div>
        <textarea
          ref={textareaRef}
          className={css.textarea}
          placeholder={placeholder}
          defaultValue={defaultValue}
          rows={4}
        />
        <div className={css.footer}>
          <span className={css.hint}>Ctrl+Enter 确认 · Esc 取消</span>
          <div className={css.buttons}>
            <button type="button" className={css.btnCancel} onClick={handleCancel}>取消</button>
            <button type="button" className={css.btnConfirm} onClick={handleConfirm}>确认</button>
          </div>
        </div>
      </div>
    </div>
  )
}
