import { useMemo, useState } from 'react'
import { api } from '../api'
import StaffDialog from './StaffDialog'
import StaffIcon from './StaffIcon'
import { resolveStaffPageAccess, STAFF_PAGE_KEYS } from '../data/staffPageAccess'
import './StaffPage.css'

export const STAFF_PERMISSION_OPTIONS = [
  { key: 'passengers', label: 'Passenger bookings', group: 'Actions' },
  { key: 'cargo', label: 'Cargo entries', group: 'Actions' },
  { key: 'trips', label: 'Trip / bus controls', group: 'Actions' },
]

export const DEFAULT_STAFF_PERMISSIONS = {
  home: true,
  log: true,
  info: true,
  dashboard: false,
  accounts: false,
  customers: false,
  staff: false,
  passengers: false,
  cargo: false,
  trips: false,
  pageAccess: Object.fromEntries(STAFF_PAGE_KEYS.map((page) => [page, { view: false, manage: false }])),
}

const emptyForm = {
  full_name: '',
  username: '',
  password: '',
  status: 'active',
  permissions: { ...DEFAULT_STAFF_PERMISSIONS },
}

const PAGE_ACCESS_ROWS = [
  ['home', 'Home'], ['log', 'Log'], ['info', 'Info'], ['dashboard', 'Dashboard'],
  ['accounts', 'Accounts'], ['customers', 'Customers'], ['staff', 'Staff Management'],
]

export default function StaffManagement({ token, staffList, setStaffList, crewList, setCrewList, buses, busContacts = [], loading = false, loadError = '', onRetry, onRegisterBus, onDeleteBus, onActivateBus, showMessage, onSaved, requestConfirmation, readOnly = false }) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [busQuery, setBusQuery] = useState('')
  const [formError, setFormError] = useState('')
  const [resetError, setResetError] = useState('')
  const [crewError, setCrewError] = useState('')
  const [crewSaving, setCrewSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [resetTarget, setResetTarget] = useState(null)
  const [resetPassword, setResetPassword] = useState('')
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [crewForm, setCrewForm] = useState({ full_name: '', role: 'driver' })

  const visibleStaff = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return (staffList || []).filter((person) => {
      if (statusFilter !== 'all' && (person.status || 'active') !== statusFilter) return false
      if (!needle) return true
      return [person.full_name, person.username, person.status]
        .some((value) => String(value || '').toLocaleLowerCase().includes(needle))
    })
  }, [staffList, query, statusFilter])

  const selected = visibleStaff.find(person => person.id === selectedId) || visibleStaff[0]
  const selectedPageAccess = resolveStaffPageAccess(selected?.permissions || {})
  const total = (staffList || []).length
  const inactive = (staffList || []).filter(person => person.status === 'inactive').length
  const visibleBuses = (buses || []).filter(bus => [bus.registration_no, bus.display_name].some(value => String(value || '').toLocaleLowerCase().includes(busQuery.trim().toLocaleLowerCase())))

  const updatePageAccess = (page, key, checked) => {
    setFormError('')
    setForm((current) => {
      const currentAccess = current.permissions.pageAccess || resolveStaffPageAccess(current.permissions)
      const nextPage = { ...currentAccess[page], [key]: checked }
      if (key === 'view' && !checked) nextPage.manage = false
      return { ...current, permissions: { ...current.permissions, pageAccess: { ...currentAccess, [page]: nextPage } } }
    })
  }

  const openCreate = () => {
    setFormError('')
    setEditing(null)
    setForm({ ...emptyForm, permissions: { ...DEFAULT_STAFF_PERMISSIONS, pageAccess: resolveStaffPageAccess(DEFAULT_STAFF_PERMISSIONS) } })
    setShowForm(true)
  }

  const openEdit = (person) => {
    setFormError('')
    setEditing(person)
    setForm({
      full_name: person.full_name || '',
      username: person.username || '',
      password: '',
      status: person.status || 'active',
      permissions: {
        ...DEFAULT_STAFF_PERMISSIONS,
        ...(person.permissions || {}),
        pageAccess: resolveStaffPageAccess(person.permissions || {}),
      },
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (busy) return
    setFormError('')
    if (!STAFF_PAGE_KEYS.some((key) => form.permissions.pageAccess?.[key]?.view === true)) {
      setFormError('Select at least one page for this staff account.')
      showMessage('Select at least one page for this staff account.', true)
      return
    }
    if (!form.full_name.trim() || !form.username.trim() || (!editing && !form.password)) {
      setFormError('Enter a name, username, and temporary password.')
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
        onSaved?.({ id: editing.id, permissions: result.staff.permissions })
        showMessage(`Updated ${result.staff.full_name}.`)
      } else {
        const result = await api.createStaff(token, form)
        setStaffList((current) => [...current, result.staff].sort((a, b) => a.full_name.localeCompare(b.full_name)))
        setSelectedId(result.staff.id)
        setQuery('')
        setStatusFilter('all')
        showMessage(`Created staff account ${result.staff.username}.`)
      }
      setShowForm(false)
      setEditing(null)
    } catch (err) {
      setFormError(err.message)
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
    setBusy(true)
    try {
      const result = await api.updateStaff(token, person.id, { status: nextStatus })
      setStaffList((current) => current.map((entry) => entry.id === person.id ? result.staff : entry))
      showMessage(`${person.full_name} is now ${nextStatus}.`)
    } catch (err) {
      showMessage(err.message, true)
    } finally {
      setBusy(false)
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

  const handleResetPassword = async () => {
    if (!resetTarget || busy) return
    setResetError('')
    setBusy(true)
    try {
      const result = await api.resetStaffPassword(token, resetTarget.id, resetPassword)
      showMessage(result.message || `Password reset for ${resetTarget.username}.`)
      setResetTarget(null)
      setResetPassword('')
    } catch (err) {
      setResetError(err.message)
      showMessage(err.message, true)
    } finally {
      setBusy(false)
    }
  }

  const handleAddCrew = async (event) => {
    event.preventDefault()
    if (busy) return
    setCrewError('')
    const full_name = crewForm.full_name.trim()
    if (full_name.length < 2) {
      setCrewError('Enter a crew member name.')
      return showMessage('Enter a crew member name.', true)
    }
    setBusy(true)
    setCrewSaving(true)
    try {
      const result = await api.createCrewMember(token, { full_name, role: crewForm.role })
      setCrewList((current) => [...current, result.crewMember].sort((a, b) => a.role.localeCompare(b.role) || a.full_name.localeCompare(b.full_name)))
      setCrewForm((current) => ({ ...current, full_name: '' }))
      showMessage(`Added ${result.crewMember.full_name} as ${result.crewMember.role}.`)
    } catch (err) {
      setCrewError(err.message)
      showMessage(err.message, true)
    } finally {
      setBusy(false)
      setCrewSaving(false)
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

  return (
    <main className="content-page dashboard-page staff-management-page staff-ui-page">
      <header className="staff-ui-page-header">
        <span className="staff-ui-page-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-13a3 3 0 0 1 0 6m4 7v-3a5 5 0 0 0-3-4" /></svg></span>
        <div><h1 id="staff-page-title">Staff Management</h1><p>Manage staff accounts, permissions, and access to District Line.</p></div>
      </header>
      <div className="staff-ui-toolbar">
        <div className="staff-ui-header-actions">
          <label className="staff-ui-search"><StaffIcon name="search" /><input type="search" aria-label="Search staff" placeholder="Search name or username" value={query} onChange={event => setQuery(event.target.value)} /></label>
          {!readOnly && <button type="button" className="primary-button staff-add-button" onClick={openCreate}><span aria-hidden="true">+</span> Add Staff</button>}
        </div>
      </div>
      <section className="staff-management-card staff-ui-section" aria-labelledby="staff-page-title">
        {loadError && <div className="staff-ui-notice" role="alert">Unable to load staff data: {loadError}<button type="button" className="ghost-button" onClick={onRetry} disabled={loading}>Retry</button></div>}
        <div className="staff-ui-summary" aria-label="Staff account summary" aria-busy={loading}>
          {[['Total staff', total, 'total'], ['Active staff', total - inactive, 'active'], ['Inactive staff', inactive, 'inactive']].map(([label, count, status]) => <div className={'staff-ui-stat ' + status} key={status}><span>{label}</span><strong>{loading && !total ? '\u2014' : count}</strong></div>)}
        </div>
        {loading && !total ? <div className="staff-ui-empty" role="status">Loading staff accounts...</div> : <div className="staff-ui-workspace">
          <section className="staff-ui-directory" aria-labelledby="staff-directory-title">
            <header><h2 id="staff-directory-title">Staff Directory <span className="staff-ui-count">{visibleStaff.length}</span></h2><label className="staff-ui-filter"><span>Status</span><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label></header>
            <ul className="staff-ui-directory-list">
              {visibleStaff.map(person => <li key={person.id}><button type="button" className={'staff-ui-directory-item' + (person.id === selected?.id ? ' is-selected' : '')} aria-current={person.id === selected?.id ? 'true' : undefined} onClick={() => setSelectedId(person.id)}>
                <span className="staff-ui-avatar" aria-hidden="true">{(person.full_name || person.username || '?').split(/\s+/).slice(0, 2).map(word => word[0]).join('').toLocaleUpperCase()}</span>
                <span className="staff-ui-directory-name"><strong>{person.full_name || person.username}</strong><span>@{person.username}</span></span>
                <span className={'staff-ui-status ' + (person.status === 'inactive' ? 'inactive' : 'active')}>{person.status === 'inactive' ? 'Inactive' : 'Active'}</span>
              </button></li>)}
            </ul>
            {!visibleStaff.length && <div className="staff-ui-empty"><StaffIcon /><h3>{loadError ? 'Directory unavailable' : query || statusFilter !== 'all' ? 'No matching staff' : 'Your directory is ready'}</h3><p>{loadError ? 'Retry loading the directory above.' : query || statusFilter !== 'all' ? 'Try another name or change the status filter.' : 'Add a staff account to get started.'}</p>{(query || statusFilter !== 'all') && <button type="button" className="ghost-button" onClick={() => { setQuery(''); setStatusFilter('all') }}>Clear filters</button>}</div>}
          </section>
          <section className="staff-ui-details" aria-labelledby="staff-details-title">
            {selected ? <>
              <header className="staff-ui-details-header"><div><span className="staff-ui-eyebrow">Staff details</span><h2 id="staff-details-title">{selected.full_name || selected.username}</h2><p>@{selected.username}</p></div><span className={'staff-ui-status ' + (selected.status === 'inactive' ? 'inactive' : 'active')}>{selected.status === 'inactive' ? 'Inactive' : 'Active'}</span></header>
              <div className="staff-ui-assigned-heading"><h3>Assigned permissions</h3><p>{readOnly ? 'Access currently assigned to this account.' : 'Access currently assigned to this account. Choose Edit staff to make changes.'}</p></div>
              <div className="staff-ui-permission-group"><h4>Page Access</h4><div className="staff-ui-page-access-table" role="table" aria-label="Assigned page view and manage permissions"><div className="staff-ui-page-access-row is-heading" role="row"><span role="columnheader">Page</span><span role="columnheader">View</span><span role="columnheader">Manage</span></div>{PAGE_ACCESS_ROWS.map(([page, label]) => <div className="staff-ui-page-access-row" role="row" key={page}><span role="cell">{label}</span><span role="cell" className={'staff-ui-permission-state' + (selectedPageAccess[page].view ? ' granted' : '')}>{selectedPageAccess[page].view ? 'Allowed' : 'Not assigned'}</span><span role="cell" className={'staff-ui-permission-state' + (selectedPageAccess[page].manage ? ' granted' : '')}>{page === 'staff' ? 'Administrator only' : selectedPageAccess[page].manage ? 'Allowed' : 'Not assigned'}</span></div>)}</div></div>
              <div className="staff-ui-permission-group"><h4>Action Permissions</h4><ul>{STAFF_PERMISSION_OPTIONS.map(item => <li key={item.key}><span>{item.label}</span><span className={'staff-ui-permission-state' + (selected.permissions?.[item.key] === true ? ' granted' : '')}><span aria-hidden="true">{selected.permissions?.[item.key] === true ? '\u2713' : '\u2014'}</span>{selected.permissions?.[item.key] === true ? 'Allowed' : 'Not assigned'}</span></li>)}</ul></div>
              {!readOnly && <><div className="staff-ui-account-actions"><button type="button" className="primary-button" disabled={busy} onClick={() => openEdit(selected)}>Edit staff</button><button type="button" className="ghost-button" disabled={busy} onClick={() => { setResetTarget(selected); setResetPassword(''); setShowResetPassword(false); setResetError('') }}>Reset password</button></div>
              <div className="staff-ui-sensitive-actions"><p>Account access</p><div><button type="button" className={selected.status === 'inactive' ? 'ghost-button staff-ui-activate' : 'ghost-button'} disabled={busy} onClick={() => handleToggleStatus(selected)}>{selected.status === 'inactive' ? 'Activate' : 'Deactivate'}</button><button type="button" className="staff-delete-button" disabled={busy} onClick={() => handleDeleteStaff(selected)}>Delete</button></div></div></>}
            </> : <div className="staff-ui-empty staff-ui-details-empty"><StaffIcon /><h2 id="staff-details-title">Staff Details</h2><p>{visibleStaff.length ? 'Select a staff member to review their account.' : 'Staff details will appear here when an account is available.'}</p></div>}
          </section>
        </div>}
      </section>

      {!readOnly && <section className="staff-ui-section staff-crew-management-card" aria-labelledby="staff-crew-title">
        <header className="staff-ui-section-header"><div><span className="staff-ui-eyebrow">Crew directory</span><h2 id="staff-crew-title">Drivers and Conductors</h2><p>Save crew names for quick selection in trip and revenue forms.</p></div></header>
        <form className="staff-ui-crew-form staff-crew-add-form" onSubmit={handleAddCrew}>
          <label><span>Name</span><input required minLength={2} maxLength={80} value={crewForm.full_name} onChange={event => { setCrewForm(current => ({ ...current, full_name: event.target.value })); setCrewError('') }} placeholder="Enter driver or conductor name" /></label>
          <label><span>Role</span><select value={crewForm.role} onChange={event => setCrewForm(current => ({ ...current, role: event.target.value }))}><option value="driver">Driver</option><option value="conductor">Conductor</option></select></label>
          <button type="submit" className="primary-button" disabled={busy}>{crewSaving ? 'Adding...' : 'Add crew member'}</button>
        </form>
        {crewError && <p className="staff-ui-form-error" role="alert">{crewError}</p>}
        <div className="staff-ui-crew-grid">
          {loading && !crewList.length ? <div className="staff-ui-empty" role="status">Loading crew directory...</div> : ['driver', 'conductor'].map(role => {
            const members = (crewList || []).filter(member => member.role === role)
            return <section className="staff-ui-crew-card" key={role}><header><span className="staff-ui-icon"><StaffIcon name={role} /></span><h3>{role === 'driver' ? 'Drivers' : 'Conductors'}</h3><span className="staff-ui-count" aria-label={members.length + ' ' + role + 's'}>{members.length}</span></header><ul className="staff-ui-crew-chips">{members.map(member => <li key={member.id} className="staff-ui-crew-chip"><span>{member.full_name}</span><button type="button" className="staff-icon-button" disabled={busy} aria-label={'Remove ' + member.full_name} onClick={() => handleRemoveCrew(member)}>&times;</button></li>)}</ul>{!members.length && <p className="staff-ui-muted">No {role === 'driver' ? 'drivers' : 'conductors'} added yet.</p>}</section>
          })}
        </div>
      </section>}

      {!readOnly && <section className="staff-ui-section staff-bus-contacts-card" aria-labelledby="staff-buses-title">
        <header className="staff-ui-section-header"><div><span className="staff-ui-eyebrow">Bus contacts</span><h2 id="staff-buses-title">Buses</h2><p>Manage registered buses and their contact details. Bus numbers stay available across your forms.</p></div><div className="staff-ui-header-actions"><label className="staff-ui-search"><StaffIcon name="search" /><input type="search" aria-label="Search buses" placeholder="Search registration or name" value={busQuery} onChange={event => setBusQuery(event.target.value)} /></label><button type="button" className="primary-button" onClick={onRegisterBus}>Add bus</button></div></header>
        <div className="staff-ui-bus-grid">{visibleBuses.map(bus => {
          const contact = busContacts.find(item => String(item.bus_no || '').trim().toLocaleLowerCase() === String(bus.registration_no || '').trim().toLocaleLowerCase())
          return <article key={bus.id} className={'staff-ui-bus-card' + (bus.status === 'inactive' ? ' is-inactive' : '')}><span className="staff-ui-icon"><StaffIcon name="bus" /></span><div className="staff-ui-bus-copy"><h3>{bus.registration_no}</h3>{bus.display_name && <p>{bus.display_name}</p>}{contact?.phone_number && <p className="staff-ui-bus-phone"><span>Mobile No.</span> {contact.phone_number}</p>}{bus.status === 'inactive' && <span className="staff-ui-status inactive">Inactive</span>}</div><div className="staff-ui-bus-actions">{bus.status === 'inactive' ? <button type="button" className="ghost-button staff-ui-activate" onClick={() => onActivateBus?.(bus)}>Reactivate</button> : <button type="button" className="staff-delete-button staff-bus-contact-remove" aria-label={'Delete bus ' + bus.registration_no} onClick={() => onDeleteBus(bus)}>Delete</button>}</div></article>
        })}</div>
        {!visibleBuses.length && <div className="staff-ui-empty" role={loading ? 'status' : undefined}><StaffIcon name="bus" /><h3>{loading ? 'Loading buses...' : busQuery ? 'No matching buses' : 'No buses registered yet'}</h3><p>{busQuery ? 'Try another registration number or display name.' : 'Add a bus to make it available in your bus number lists.'}</p></div>}
      </section>}

      {!readOnly && showForm && <StaffDialog title={editing ? 'Edit staff account' : 'Create staff account'} subtitle={editing ? 'Update account details and assigned access.' : 'Create a staff account and choose its assigned access.'} className="staff-form-modal" busy={busy} onClose={() => { setShowForm(false); setEditing(null) }}>
        <form onSubmit={event => { event.preventDefault(); handleSave() }} onInvalid={event => setFormError(event.target.validationMessage)}>
          <fieldset disabled={busy} className="staff-ui-fields">
            <div className="staff-ui-form-grid">
              <label><span>Full name</span><input required minLength={2} maxLength={80} autoComplete="name" placeholder="Staff member name" value={form.full_name} onChange={event => { setFormError(''); setForm(prev => ({ ...prev, full_name: event.target.value })) }} /></label>
              <label><span>Username</span><input required minLength={3} maxLength={32} pattern="[A-Za-z0-9._-]+" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="e.g. dispatch.team" value={form.username} onChange={event => { setFormError(''); setForm(prev => ({ ...prev, username: event.target.value })) }} /></label>
              {!editing && <label><span>Temporary password</span><input type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={event => { setFormError(''); setForm(prev => ({ ...prev, password: event.target.value })) }} /><small>At least 8 characters.</small></label>}
              <label><span>Account status</span><select value={form.status} onChange={event => setForm(prev => ({ ...prev, status: event.target.value }))}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
            </div>
            <div className="staff-ui-permission-editor"><h3>Assigned permissions</h3><p>View opens a page. Manage allows its approved actions and always requires View. Action permissions remain additional restrictions.</p><div className="staff-ui-permission-group"><h4>Page Access</h4><div className="staff-ui-page-access-table" role="table" aria-label="Set page view and manage permissions"><div className="staff-ui-page-access-row is-heading" role="row"><span role="columnheader">Page</span><span role="columnheader">View</span><span role="columnheader">Manage</span></div>{PAGE_ACCESS_ROWS.map(([page, label]) => <div className="staff-ui-page-access-row" role="row" key={page}><span role="cell">{label}</span><span role="cell"><label className="staff-ui-page-access-toggle" aria-label={`${label} View`}><input type="checkbox" checked={form.permissions.pageAccess?.[page]?.view === true} onChange={event => updatePageAccess(page, 'view', event.target.checked)} /><span className="dashboard-sr-only">{label} View</span></label></span><span role="cell">{page === 'staff' ? <span className="staff-ui-admin-only">Administrator only</span> : <label className="staff-ui-page-access-toggle" aria-label={`${label} Manage`}><input type="checkbox" checked={form.permissions.pageAccess?.[page]?.manage === true} disabled={!form.permissions.pageAccess?.[page]?.view} onChange={event => updatePageAccess(page, 'manage', event.target.checked)} /><span className="dashboard-sr-only">{label} Manage</span></label>}</span></div>)}</div></div><fieldset className="staff-ui-permission-fieldset staff-ui-action-permissions"><legend>Action Permissions</legend>{STAFF_PERMISSION_OPTIONS.map(item => <label key={item.key} className="permission-toggle"><input type="checkbox" checked={form.permissions[item.key] === true} onChange={event => { setFormError(''); setForm(prev => ({ ...prev, permissions: { ...prev.permissions, [item.key]: event.target.checked } })) }} /><span>{item.label}</span></label>)}</fieldset></div>
          </fieldset>
          {formError && <p className="staff-ui-form-error" role="alert">{formError}</p>}
          <footer className="staff-dialog-footer"><button type="button" className="ghost-button" disabled={busy} onClick={() => { setShowForm(false); setEditing(null) }}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Saving...' : editing ? 'Save staff details' : 'Create staff account'}</button></footer>
        </form>
      </StaffDialog>}

      {!readOnly && resetTarget && <StaffDialog title="Reset password" subtitle={'Set a new password for ' + resetTarget.full_name + ' (' + resetTarget.username + '). They will use this on the next sign in.'} className="staff-reset-modal" busy={busy} onClose={() => { setResetTarget(null); setResetPassword(''); setShowResetPassword(false) }}>
        <form onSubmit={event => { event.preventDefault(); handleResetPassword() }} onInvalid={event => setResetError(event.target.validationMessage)}><fieldset className="staff-ui-fields" disabled={busy}><label><span>New password</span><input type={showResetPassword ? 'text' : 'password'} required minLength={8} autoComplete="new-password" value={resetPassword} onChange={event => { setResetError(''); setResetPassword(event.target.value) }} /><small>At least 8 characters.</small></label><label className="permission-toggle staff-ui-show-password"><input type="checkbox" checked={showResetPassword} onChange={event => setShowResetPassword(event.target.checked)} /><span>Show password</span></label></fieldset>{resetError && <p className="staff-ui-form-error" role="alert">{resetError}</p>}<footer className="staff-dialog-footer"><button type="button" className="ghost-button" disabled={busy} onClick={() => { setResetTarget(null); setResetPassword(''); setShowResetPassword(false) }}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Saving...' : 'Save new password'}</button></footer></form>
      </StaffDialog>}
    </main>
  )
}
