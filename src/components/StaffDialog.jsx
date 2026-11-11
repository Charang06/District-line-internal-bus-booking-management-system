import { useEffect, useRef } from 'react'
import './StaffPage.css'

// Native dialogs contain keyboard focus and make the background inert.
export default function StaffDialog({ title, subtitle, children, onClose, busy = false, className = '', alert = false }) {
  const ref = useRef(null)
  const containFocus = event => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (!busy) onClose()
      return
    }
    if (event.key !== 'Tab') return
    const dialog = ref.current
    const controls = [...dialog.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
      .filter(element => !element.matches(':disabled') && element.tabIndex >= 0 && element.getClientRects().length)
    const first = controls[0]
    const last = controls.at(-1)
    if (!first) { event.preventDefault(); dialog.focus(); return }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
      event.preventDefault()
      first.focus()
    }
  }
  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement
    dialog.showModal()
    const firstField = dialog.querySelector('input:not([disabled]), select:not([disabled])') || dialog.querySelector('.staff-dialog-footer .ghost-button')
    firstField?.focus()
    return () => {
      dialog.close()
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])

  return <dialog ref={ref} tabIndex={-1} className={`modal staff-ui-dialog no-print ${className}`} aria-modal="true" aria-labelledby="staff-dialog-title" aria-describedby={subtitle ? 'staff-dialog-description' : undefined} aria-busy={busy} role={alert ? 'alertdialog' : undefined} onKeyDown={containFocus} onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <header className="staff-dialog-header">
      <div><h2 id="staff-dialog-title">{title}</h2>{subtitle && <p id="staff-dialog-description">{subtitle}</p>}</div>
      <button type="button" className="staff-icon-button staff-dialog-close" aria-label="Close dialog" disabled={busy} onClick={onClose}>×</button>
    </header>
    {children}
  </dialog>
}
