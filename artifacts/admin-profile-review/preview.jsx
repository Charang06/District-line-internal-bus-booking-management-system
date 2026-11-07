// Local review harness only: all APIs are mocked by the browser test driver.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import AdminProfile from '../../src/components/AdminProfile'

window.__profileReviewRoot?.unmount()
document.getElementById('admin-profile-review')?.remove()
const container = document.createElement('div')
container.id = 'admin-profile-review'
container.className = 'app-shell'
container.style.minHeight = '0'
document.body.append(container)
export default function Preview() {
  const [user, setUser] = useState(window.__profileUser)
  const [open, setOpen] = useState(false)
  return <>
    <button id="profile-review-open" style={{ position: 'fixed', left: 12, top: 12, zIndex: 50 }} onClick={() => setOpen(true)}>Open profile</button>
    {open && <AdminProfile token="preview-only" user={user} onUserUpdate={next => { window.__profileUser = next; setUser(next) }} onClose={() => setOpen(false)} showMessage={() => {}} />}
  </>
}
const previewRoot = createRoot(container)
window.__profileReviewRoot = previewRoot
previewRoot.render(<Preview />)
window.__unmountProfileReview = () => previewRoot.unmount()

