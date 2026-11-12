# District Line client UAT checklist

**Environment:** Not provisioned. Do not use the production site for UAT.

**Execution rule:** All cases below are pending. Enter actual results only after the client is given the verified isolated UAT URL and synthetic accounts. Use the feedback template for defects. “Blocked” means the step cannot be run until the environment/account/prerequisite exists.

| ID | Role | Steps | Expected result | Actual result | Status | Comments |
|---|---|---|---|---|---|---|
| AUTH-01 | All | Open the approved UAT URL and sign in using the supplied account. | Correct role lands on an authorized page; no production data appears. | — | Blocked | UAT deployment and credentials pending. |
| AUTH-02 | All | Sign out, then try an incorrect password. | Sign-out returns to login; incorrect password is rejected without revealing sensitive account details. | — | Blocked | Never test on production. |
| AUTH-03 | All | Leave a session idle until the agreed timeout, then use a protected page. | Session expires and the user must sign in again. | — | Blocked | Timeout policy to be agreed. |
| AUTH-04 | All | Use only the recovery flow explicitly approved for UAT. | Approved recovery completes using a synthetic mailbox/channel; no real message is sent. | — | Blocked | Recovery feature and mock delivery configuration must be confirmed. |
| ADM-01 | Administrator | Open Dashboard and review KPIs, trip overview, charts, filters, and profit report. | Values and filters are understandable; errors/loading/empty states are clear. | — | Blocked | Admin account/UAT environment pending. |
| ADM-02 | Administrator | Create or update a synthetic bus and trip using agreed sample data. | Saved item appears in authorized views and can be selected for booking. | — | Blocked | Do not use real customer or passenger information. |
| ADM-03 | Administrator | Open Customers and search synthetic records. | Search and customer details match the synthetic data and permissions. | — | Blocked | Seeded test records pending. |
| ADM-04 | Administrator | Create/edit/deactivate a synthetic staff test user and review permissions. | Changes save; each staff role sees only authorized pages/actions. | — | Blocked | Use only approved isolated UAT identities. |
| BOOK-01 | Staff with booking access | Select an available trip and inspect its seat map. | Correct route/date/bus and available seats are shown. | — | Blocked | Synthetic trip fixtures pending. |
| BOOK-02 | Staff with booking access | Book an available seat using a clearly synthetic passenger identity. | Booking is saved once and appears in the log. SMS remains mocked/disabled. | — | Blocked | No real SMS or passenger data. |
| BOOK-03 | Staff with booking access | Attempt to book the same active seat twice, including from two sessions if enabled. | Duplicate active seat is rejected; only one booking owns the seat. | — | Blocked | Requires database-backed isolated UAT. |
| BOOK-04 | Staff with booking access | Cancel a synthetic booking, then book the released seat again. | Cancellation is recorded; seat becomes available and can be rebooked according to policy. | — | Blocked | Confirm expected cancellation policy before test. |
| ACC-01 | Accounts View + Manage | Review revenue entries and totals for synthetic completed trips. | Authorized records and totals are displayed; no unrelated records appear. | — | Blocked | UAT database and account pending. |
| ACC-02 | Accounts View + Manage | Enter manual revenue using four categories with a combined count of 49, then try 50. | 49 is accepted; 50 is rejected; totals follow the approved rules. | — | Blocked | Do not reinterpret amounts/categories during test. |
| ACC-03 | Accounts View + Manage | Submit an expense for an eligible synthetic duty. | Expense is saved and appears in the corresponding ledger/duty. | — | Blocked | Synthetic duty and test account pending. |
| ACC-04 | Accounts View + Manage | Create a duty, add permitted expenses/adjustments, review, then finalize. | Finalization saves the reviewed snapshot and locks edits as designed. | — | Blocked | Requires isolated PostgreSQL verification first. |
| ACC-05 | Accounts View only | Open Accounts and attempt to submit revenue, expenses, or duty changes. | View-only user can review permitted data but cannot access mutation controls or perform writes. | — | Blocked | Test server authorization as well as UI visibility. |
| ACC-06 | No Accounts access | Attempt to navigate to or request Accounts. | Accounts navigation and data access are denied. | — | Blocked | Server-side denial is required. |
| MOB-01 | Administrator | On a phone viewport, open Dashboard; inspect cards, charts, summaries, and filters at 320–430px. | No page-level horizontal scroll or clipped content; tables scroll inside their own container. | — | Blocked | Desktop browser emulation is not physical-device acceptance. |
| MOB-02 | All roles | Open/close navigation, use Escape, choose a page, and use keyboard focus. | Drawer closes appropriately; focus returns; background does not scroll; only permitted pages appear. | — | Blocked | Browser acceptance of latest responsive changes pending. |
| MOB-03 | Staff with booking access | Complete the booking flow and open forms/dialogs on a phone. | Controls are reachable, dialogs fit/scroll, and save/cancel actions are usable. | — | Blocked | Test in supported mobile browser and desktop emulation. |
| MOB-04 | All roles | Inspect long tables/forms and rotate device between portrait and landscape. | Content remains usable; any wide table scroll stays local to its container. | — | Blocked | Landscape and physical-device checks pending. |

## Completion record

| Field | Value |
|---|---|
| Tester | |
| UAT environment URL/identity | |
| Browser and version | |
| Device and viewport | |
| Test date | |
| Passed / Failed / Blocked counts | |
| Linked feedback issues | |

