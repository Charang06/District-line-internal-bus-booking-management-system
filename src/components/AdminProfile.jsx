import { useState } from 'react'
import { api, assetUrl } from '../api'

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('Choose a profile photo.'))
      return
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      reject(new Error('Use a JPEG, PNG, WebP, or GIF image.'))
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      reject(new Error('Profile photo must be 2 MB or smaller.'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read that image.'))
    reader.readAsDataURL(file)
  })
}

export default function AdminProfile({ token, user, onUserUpdate, onClose, showMessage }) {
  const [fullName, setFullName] = useState(user?.fullName || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSaveProfile = async () => {
    setBusy(true)
    try {
      const data = await api.updateProfile(token, { fullName })
      onUserUpdate(data.user)
      showMessage('Profile name saved.')
    } catch (err) {
      showMessage(err.message, true)
    } finally {
      setBusy(false)
    }
  }

  const handlePhoto = async (file) => {
    setBusy(true)
    try {
      const image = await readImageFile(file)
      const data = await api.uploadProfilePhoto(token, image)
      onUserUpdate(data.user)
      showMessage('Profile photo updated.')
    } catch (err) {
      showMessage(err.message, true)
    } finally {
      setBusy(false)
    }
  }

  const handlePassword = async () => {
    if (newPassword !== confirmPassword) {
      showMessage('New password and confirmation do not match.', true)
      return
    }
    setBusy(true)
    try {
      await api.changePassword(token, { currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      showMessage('Password updated.')
    } catch (err) {
      showMessage(err.message, true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop no-print">
      <div className="modal admin-profile-modal">
        <h2>Admin profile</h2>
        <div className="admin-profile-hero">
          {user?.profilePhoto ? (
            <img className="admin-profile-photo" src={assetUrl(user.profilePhoto)} alt={user.fullName || 'Admin'} />
          ) : (
            <div className="admin-profile-photo fallback">{(user?.fullName || 'A').slice(0, 2).toUpperCase()}</div>
          )}
          <div>
            <strong>{user?.fullName}</strong>
            <small>{user?.username} · Administrator</small>
            <label className="ghost-button small photo-upload-button">
              Change photo
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) handlePhoto(file)
              }} />
            </label>
          </div>
        </div>
        <label>
          <span>Display name</span>
          <input value={fullName} onChange={(event) => setFullName(event.target.value)} />
        </label>
        <div className="reservation-actions">
          <button type="button" className="primary-button" disabled={busy} onClick={handleSaveProfile}>Save profile</button>
        </div>
        <div className="admin-password-block">
          <h3>Change password</h3>
          <label><span>Current password</span><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
          <label><span>New password</span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
          <label><span>Confirm new password</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
        </div>
        <div className="reservation-actions">
          <button type="button" className="ghost-button" onClick={onClose}>Close</button>
          <button type="button" className="primary-button" disabled={busy} onClick={handlePassword}>Update password</button>
        </div>
      </div>
    </div>
  )
}
