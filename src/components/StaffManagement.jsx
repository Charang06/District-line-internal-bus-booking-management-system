import { useMemo, useState } from 'react'
import { api } from '../api'

export const STAFF_PERMISSION_OPTIONS = [
  { key: 'home', label: 'Home page', group: 'Pages' },
  { key: 'log', label: 'Log page', group: 'Pages' },
  { key: 'info', label: 'Info page', group: 'Pages' },
  { key: 'passengers', label: 'Passenger bookings', group: 'Actions' },
  { key: 'cargo', label: 'Cargo entries', group: 'Actions' },
  { key: 'trips', label: 'Trip / bus controls', group: 'Actions' },
]

export const DEFAULT_STAFF_PERMISSIONS = {
  home: true,
  log: true,
  info: true,
  passengers: true,
  cargo: true,
  trips: true,
}

const emptyForm = {
  full_name: '',
  username: '',
  password: '',
  status: 'active',
  permissions: { ...DEFAULT_STAFF_PERMISSIONS },
}

function permissionSummary(permissions = {}) {
  return STAFF_PERMISSION_OPTIONS.filter((item) => permissions[item.key]).map((item) => item.label.replace(' page', '')).join(' · ') || 'No access assigned'
}

export default function StaffManagement({ token, staffList, setStaffList, crewList, setCrewList, busContactList, setBusContactList, showMessage, onSaved, requestConfirmation }) {
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [resetTarget, setResetTarget] = useState(null)
  const [resetPassword, setResetPassword] = useState('')
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [crewForm, setCrewForm] = useState({ full_name: '', role: 'driver' })
  const [busContactForm, setBusContactForm] = useState({ bus_no: '', phone_number: '' })

  const visibleStaff = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return (staffList || []).filter((person) => {
      if (!needle) return true
      return [person.full_name, person.username, person.status]
        .some((value) => String(value || '').toLocaleLowerCase().includes(needle))
    })
  }, [staffList, query])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm, permissions: { ...DEFAULT_STAFF_PERMISSIONS } })
    setShowForm(true)
  }

  const openEdit = (person) => {
    setEditing(person)
    setForm({
      full_name: person.full_name || '',
      username: person.username || '',
      password: '',
      status: person.status || 'active',
      permissions: { ...DEFAULT_STAFF_PERMISSIONS, ...(person.permissions || {}) },
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!['home', 'log', 'info'].some((key) => form.permissions[key])) {
      showMessage('Select at least one page for this staff account.', true)
      return
    }
    if (!form.full_name.trim() || !form.username.trim() || (!editing && !form.password)) {
      showMessage('Enter a name, username, and temporary password.', true)
      return
    }
    setBusy(true)
    try {
      if (editing) {
        const result = await api.updateStaff(token, editing.id, {
          full_name: form.full_name,
          username: form.username,
          status: form.status,
          permissions: form.permissions,
        })
        setStaffList((current) => current.map((entry) => entry.id === editing.id ? result.staff : entry))
        if (editing.permissions?.home && !result.staff.permissions?.home) onSaved?.({ id: editing.id, permissions: result.staff.permissions })
        showMessage(`Updated ${result.staff.full_name}.`)
      } else {
        const result = await api.createStaff(token, form)
        setStaffList((current) => [...current, result.staff].sort((a, b) => a.full_name.localeCompare(b.full_name)))
        showMessage(`Created staff account ${result.staff.username}.`)
      }
      setShowForm(false)
      setEditing(null)
    } catch (err) {
      showMessage(err.message, true)
    } finally {
      setBusy(false)
    }
  }

  const handleToggleStatus = async (person) => {
    const nextStatus = person.status === 'inactive' ? 'active' : 'inactive'
    const action = nextStatus === 'inactive' ? 'Deactivate' : 'Reactivate'
    requestConfirmation({
      title: `${action} ${person.full_name}?`,
      message: nextStatus === 'inactive' ? 'This staff account will no longer be able to sign in.' : 'This staff account will be able to sign in again with its existing permissions.',
      confirmLabel: action,
      destructive: nextStatus === 'inactive',
      onConfirm: async () => {
    try {
      const result = await api.updateStaff(token, person.id, { status: nextStatus })
      setStaffList((current) => current.map((entry) => entry.id === person.id ? result.staff : entry))
      showMessage(`${person.full_name} is now ${nextStatus}.`)
    } catch (err) {
      showMessage(err.message, true)
    }
      },
    })
  }

  const handleDeleteStaff = async (person) => {
    requestConfirmation({
      title: `Delete ${person.full_name}'s account?`,
      message: `The staff account (${person.username}) will be permanently deleted. This cannot be undone.`,
      confirmLabel: 'Delete account',
      onConfirm: async () => {
    setBusy(true)
    try {
      const result = await api.deleteStaff(token, person.id)
      setStaffList((current) => current.filter((entry) => entry.id !== person.id))
      showMessage(result.message || `Deleted ${person.username}.`)
    } catch (err) {
      showMessage(err.message, true)
    } finally {
      setBusy(false)
    }
      },
    })
  }

  const handlePermissionChange = async (person, key, checked) => {
    const visiblePages = ['home', 'log', 'info']
    if (visiblePages.includes(key) && !checked && !visiblePages.some((page) => page !== key && person.permissions?.[page] === true)) {
      showMessage('Each staff account must have access to at least one page.', true)
      return
    }
    const permissions = { ...DEFAULT_STAFF_PERMISSIONS, ...person.permissions, [key]: checked }
    setStaffList((current) => current.map((entry) => entry.id === person.id ? { ...entry, permissions } : entry))
    try {
      const result = await api.updateStaffPermissions(token, person.id, permissions)
      setStaffList((current) => current.map((entry) => entry.id === person.id ? result.staff : entry))
      if (person.permissions?.home && !result.staff.permissions?.home) onSaved?.({ id: person.id, permissions: result.staff.permissions })
      showMessage(`Permissions updated for ${person.full_name}.`)
    } catch (err) {
      setStaffList((current) => current.map((entry) => entry.id === person.id ? person : entry))
      showMessage(err.message, true)
    }
  }

  const handleResetPassword = async () => {
    if (!resetTarget) return
    setBusy(true)
    try {
      const result = await api.resetStaffPassword(token, resetTarget.id, resetPassword)
      showMessage(result.message || `Password reset for ${resetTarget.username}.`)
      setResetTarget(null)
      setResetPassword('')
    } catch (err) {
      showMessage(err.message, true)
    } finally {
      setBusy(false)
    }
  }

  const handleAddCrew = async (event) => {
    event.preventDefault()
    const full_name = crewForm.full_name.trim()
    if (full_name.length < 2) return showMessage('Enter a crew member name.', true)
    setBusy(true)
    try {
      const result = await api.createCrewMember(token, { full_name, role: crewForm.role })
      setCrewList((current) => [...current, result.crewMember].sort((a, b) => a.role.localeCompare(b.role) || a.full_name.localeCompare(b.full_name)))
      setCrewForm((current) => ({ ...current, full_name: '' }))
      showMessage(`Added ${result.crewMember.full_name} as ${result.crewMember.role}.`)
    } catch (err) {
      showMessage(err.message, true)
    } finally {
      setBusy(false)
    }
  }

  const handleRemoveCrew = (member) => requestConfirmation({
    title: `Remove ${member.full_name}?`,
    message: `This removes ${member.full_name} from the saved ${member.role} name suggestions. Existing trip records are unchanged.`,
    confirmLabel: 'Remove name',
    onConfirm: async () => {
      try {
        await api.deleteCrewMember(token, member.id)
        setCrewList((current) => current.filter((person) => person.id !== member.id))
        showMessage(`Removed ${member.full_name} from the crew list.`)
      } catch (err) {
        showMessage(err.message, true)
      }
    },
  })

  const handleAddBusContact = async (event) => {
    event.preventDefault()
    if (!busContactForm.bus_no.trim() || !busContactForm.phone_number.trim()) return showMessage('Enter both the bus number and contact number.', true)
    setBusy(true)
    try {
      const result = await api.createBusContact(token, busContactForm)
      setBusContactList((current) => [...current, result.contact].sort((a, b) => a.bus_no.localeCompare(b.bus_no)))
      setBusContactForm({ bus_no: '', phone_number: '' })
      showMessage(`Added contact number for ${result.contact.bus_no}.`)
    } catch (err) {
      showMessage(err.message, true)
    } finally {
      setBusy(false)
    }
  }

  const handleRemoveBusContact = (contact) => requestConfirmation({
    title: `Remove contact for ${contact.bus_no}?`,
    message: `The saved bus contact number ${contact.phone_number} will be deleted.`,
    confirmLabel: 'Remove contact',
    onConfirm: async () => {
      try {
        await api.deleteBusContact(token, contact.id)
        setBusContactList((current) => current.filter((entry) => entry.id !== contact.id))
        showMessage(`Removed contact for ${contact.bus_no}.`)
      } catch (err) {
        showMessage(err.message, true)
      }
    },
  })

  return (
    <main className="content-page dashboard-page staff-management-page">
      <section className="content-card staff-management-card">
        <div className="dashboard-section-heading staff-page-heading">
          <div>
            <span className="staff-eyebrow">Access control</span>
            <h2>Staff management</h2>
            <p className="staff-permission-caption staff-page-caption">Create staff accounts, assign page and action permissions, and activate or reset access. Only administrators can change these settings.</p>
          </div>
          <div className="toolbar-actions">
            <label className="staff-search-wrap">
              <span aria-hidden="true">⌕</span>
              <input className="staff-search" type="search" aria-label="Search staff" placeholder="Search staff" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <button type="button" className="primary-button staff-add-button" onClick={openCreate}><span aria-hidden="true">＋</span> Add staff account</button>
          </div>
        </div>
        <div className="staff-card-grid">
          {visibleStaff.map((person) => (
            <article key={person.id} className="staff-account-card">
              <div className="staff-card-top">
                <div>
                  <span className="staff-field-label">Staff member</span>
                  <h3>{person.full_name}</h3>
                  <small className="staff-username">{person.username}</small>
                </div>
                <div>
                  <span className="staff-field-label">Status</span>
                  <span className={`staff-status-pill ${person.status === 'inactive' ? 'inactive' : 'active'}`}><i />{person.status || 'active'}</span>
                </div>
              </div>
              <div className="staff-assigned">
                <span className="staff-field-label">Assigned permissions</span>
                <p>{permissionSummary(person.permissions)}</p>
              </div>
              <div className="staff-card-permissions">
                {['Pages', 'Actions'].map((group) => (
                  <div key={group} className="staff-card-permission-group">
                    <span className="staff-field-label">{group}</span>
                    {STAFF_PERMISSION_OPTIONS.filter((item) => item.group === group).map((item) => (
                      <label key={item.key} className="permission-toggle">
                        <input type="checkbox" checked={person.permissions?.[item.key] === true} aria-label={`${item.label} permission for ${person.full_name}`} onChange={(event) => handlePermissionChange(person, item.key, event.target.checked)} />
                        <span>{item.label.replace(' page', '')}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
              <div className="staff-card-controls">
                <span className="staff-field-label">Controls</span>
                <div className="toolbar-actions">
                  <button type="button" className="ghost-button small" onClick={() => openEdit(person)}>Edit</button>
                  <button type="button" className="ghost-button small" onClick={() => { setResetTarget(person); setResetPassword(''); setShowResetPassword(false) }}>Reset password</button>
                  <button type="button" className={person.status === 'inactive' ? 'staff-activate-button small' : 'ghost-button small'} onClick={() => handleToggleStatus(person)}>
                    {person.status === 'inactive' ? 'Activate' : 'Deactivate'}
                  </button>
                  <button type="button" className="staff-delete-button small" disabled={busy} onClick={() => handleDeleteStaff(person)}>Delete</button>
                </div>
              </div>
            </article>
          ))}
          {!visibleStaff.length && <div className="staff-empty-state">{query ? 'No staff accounts match your search.' : 'No staff accounts yet. Add an account to get started.'}</div>}
        </div>
      </section>

      <section className="content-card staff-crew-management-card">
        <div className="dashboard-section-heading">
          <div><span className="staff-eyebrow">Crew directory</span><h2>Drivers and conductors</h2><p>Add names once to make them available as suggestions in trip and revenue forms.</p></div>
        </div>
        <form className="staff-crew-add-form" onSubmit={handleAddCrew}>
          <label><span>Name</span><input required minLength={2} maxLength={80} value={crewForm.full_name} onChange={(event) => setCrewForm((current) => ({ ...current, full_name: event.target.value }))} placeholder="Enter driver or conductor name" /></label>
          <label><span>Role</span><select value={crewForm.role} onChange={(event) => setCrewForm((current) => ({ ...current, role: event.target.value }))}><option value="driver">Driver</option><option value="conductor">Conductor</option></select></label>
          <button type="submit" className="primary-button" disabled={busy}>Add crew member</button>
        </form>
        <div className="staff-crew-list">
          {['driver', 'conductor'].map((role) => <div className="staff-crew-group" key={role}>
            <h3>{role === 'driver' ? 'Drivers' : 'Conductors'}</h3>
            <div>{(crewList || []).filter((member) => member.role === role).map((member) => <span className="staff-crew-chip" key={member.id}>{member.full_name}<button type="button" aria-label={`Remove ${member.full_name}`} onClick={() => handleRemoveCrew(member)}>×</button></span>)}
              {!(crewList || []).some((member) => member.role === role) && <small>No names added.</small>}
            </div>
          </div>)}
        </div>
      </section>

      <section className="content-card staff-bus-contacts-card">
        <div className="dashboard-section-heading"><div><span className="staff-eyebrow">Bus contacts</span><h2>Bus contact numbers</h2><p>Add or remove a contact number associated with a bus.</p></div></div>
        <form className="staff-crew-add-form" onSubmit={handleAddBusContact}>
          <label><span>Bus No</span><input required maxLength={40} value={busContactForm.bus_no} onChange={(event) => setBusContactForm((current) => ({ ...current, bus_no: event.target.value }))} placeholder="e.g. NE 3456" /></label>
          <label><span>Contact number</span><input required type="tel" maxLength={30} value={busContactForm.phone_number} onChange={(event) => setBusContactForm((current) => ({ ...current, phone_number: event.target.value }))} placeholder="e.g. 0776777464" /></label>
          <button type="submit" className="primary-button" disabled={busy}>Add bus contact</button>
        </form>
        <div className="staff-bus-contact-list">{(busContactList || []).map((contact) => <p key={contact.id}><strong>{contact.bus_no}</strong><a href={`tel:${contact.phone_number.replace(/[^+\d]/g, '')}`}>{contact.phone_number}</a><button type="button" className="staff-bus-contact-remove" onClick={() => handleRemoveBusContact(contact)}>Remove</button></p>)}
          {!(busContactList || []).length && <span className="staff-bus-contact-empty">No bus contact numbers added.</span>}
        </div>
      </section>

      {showForm && (
        <div className="modal-backdrop no-print">
          <div className="modal staff-form-modal">
            <h2>{editing ? 'Edit staff account' : 'Create staff account'}</h2>
            <label><span>Full name</span><input required minLength={2} maxLength={80} value={form.full_name} onChange={(event) => setForm((prev) => ({ ...prev, full_name: event.target.value }))} /></label>
            <label><span>Username</span><input required minLength={3} maxLength={32} pattern="[A-Za-z0-9._-]+" value={form.username} onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))} /></label>
            {!editing && (
              <label>
                <span>Temporary password</span>
                <input type="password" required minLength={8} value={form.password} onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))} />
              </label>
            )}
            <label>
              <span>Account status</span>
              <select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <div className="staff-permission-editor">
              <strong>Assigned permissions</strong>
              {['Pages', 'Actions'].map((group) => (
                <div key={group} className="staff-permission-group">
                  <span>{group}</span>
                  {STAFF_PERMISSION_OPTIONS.filter((item) => item.group === group).map((item) => (
                    <label key={item.key} className="permission-toggle">
                      <input
                        type="checkbox"
                        checked={form.permissions[item.key] === true}
                        onChange={(event) => setForm((prev) => ({ ...prev, permissions: { ...prev.permissions, [item.key]: event.target.checked } }))}
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
            <div className="reservation-actions">
              <button type="button" className="ghost-button" onClick={() => { setShowForm(false); setEditing(null) }}>Close</button>
              <button type="button" className="primary-button" disabled={busy} onClick={handleSave}>{editing ? 'Save staff details' : 'Create staff account'}</button>
            </div>
          </div>
        </div>
      )}

      {resetTarget && (
        <div className="modal-backdrop no-print">
          <div className="modal">
            <h2>Reset password</h2>
            <p>Set a new password for {resetTarget.full_name} ({resetTarget.username}). They will use this on the next sign in.</p>
            <label>
              <span>New password</span>
              <input type={showResetPassword ? 'text' : 'password'} required minLength={8} autoComplete="new-password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} />
            </label>
            <label className="staff-show-password-toggle">
              <input type="checkbox" checked={showResetPassword} onChange={(event) => setShowResetPassword(event.target.checked)} />
              <span>Show password</span>
            </label>
            <div className="reservation-actions">
              <button type="button" className="ghost-button" onClick={() => { setResetTarget(null); setResetPassword(''); setShowResetPassword(false) }}>Cancel</button>
              <button type="button" className="primary-button" disabled={busy} onClick={handleResetPassword}>Save new password</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
