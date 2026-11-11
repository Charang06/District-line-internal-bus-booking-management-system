import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveStaffPageAccess, STAFF_PAGE_KEYS } from './staffPageAccess.js'

test('legacy page flags retain their effective view and Home/Log action access', () => {
  const access = resolveStaffPageAccess({ home: true, log: true, dashboard: false, passengers: true, cargo: false, trips: false })
  assert.equal(access.home.view, true)
  assert.equal(access.home.manage, true)
  assert.equal(access.log.manage, true)
  assert.equal(access.dashboard.view, false)
  assert.equal(access.accounts.manage, false)
})

test('explicit page access requires View for Manage and keeps Staff Manage administrator-only', () => {
  const access = resolveStaffPageAccess({ pageAccess: {
    home: { view: false, manage: true },
    accounts: { view: true, manage: true },
    staff: { view: true, manage: true },
  } })
  assert.equal(access.home.manage, false)
  assert.equal(access.accounts.manage, true)
  assert.equal(access.staff.view, true)
  assert.equal(access.staff.manage, false)
  assert.equal(access.log.view, false)
})

test('administrators retain full access across all pages', () => {
  const access = resolveStaffPageAccess({}, true)
  assert.deepEqual(Object.keys(access), STAFF_PAGE_KEYS)
  assert.ok(Object.values(access).every(({ view, manage }) => view && manage))
})
