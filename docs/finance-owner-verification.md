# Owner-controlled finance verification — pending

## Required guard BEFORE finance navigation

Do not infer safety from HTTP GET. Source review confirms that
`GET /api/admin/dashboard` without scope, or with a scope other than exactly
`accounts`/`dashboard`, calls getAdminDutyData(), which can UPDATE bus_duties statuses.
The current Accounts refresh callback can call the unscoped route. Customers/full
dashboard/report paths can also invoke it. Do not use those production flows here.

The owner must first enforce and verify browser request interception/blocking that
denies every /api/admin/dashboard request except the exact reviewed scope=accounts
or scope=dashboard variants, and denies all finance mutations. Block before clicking
finance tabs, refresh, filters or reports; inspecting Network afterward is too late.
Normal owner authentication endpoints may be allowed separately. If reliable blocking
is unavailable, mark the relevant production screen BLOCKED and use a synthetic local
browser instead. This preparation does not install anything in the owner's browser.

| Requested area | Production result | Reason |
| --- | --- | --- |
| Revenue/Accounts | PENDING | Owner access and pre-navigation request guard required |
| Daily Expenses | PENDING | View-only path/guard must be confirmed; no Save/Edit/Delete |
| Expense Submissions | PENDING | Owner view only; no approve/reject/submit |
| Combined finance filters | PENDING | Guard must prevent a refresh from calling unscoped dashboard |
| Read-only reports | PENDING/BLOCKED for full-duty paths | Unscoped/full dashboard can update duty statuses |

Record PASS/FAIL only after the owner actually completes a safely guarded check.
The synthetic browser evidence proves no production finance values or permissions.

Use the existing administrator account in the owner's browser at the production
origin. Do not share passwords, MFA seeds, codes, cookies, customer data or financial
screenshots in chat or reports. No production finance browser checks were performed
by this preparation. The automated tests use synthetic data and mocked services.

1. Sign in as the existing administrator. Check navigation, navy/gold appearance,
   desktop layout and a narrow mobile viewport. Confirm the signed-in administrator
   identity privately. Do not create a test production account.
2. Open Revenue/Accounts. Observe existing totals and the revenue-entry list. Compare
   one previously known date with the owner's existing records. Confirm totals are
   labelled for the active filters and do not silently retain another filter's data.
3. Open daily expenses. View existing entries only. Inspect dates, categories, amounts,
   descriptions and bus filters. Never use Add, Save, Edit, Delete or adjustment actions.
4. Open Expense submissions. View existing submitted/approved/rejected rows and their
   status labels. Do not approve, reject, submit, edit or delete anything.
5. Exercise date/day/month/range, route, bus and trip filters that the screen actually
   provides. Try a known populated period, an empty period and clear/reset. Confirm
   combined filters agree across cards, tables and totals; navigate away/back and refresh.
6. Open existing read-only finance and finalized duty reports. Check loading, empty,
   error and report states without finalizing/reopening any duty. Use print preview
   only if needed; cancel it and do not save sensitive reports to shared directories.
7. Inspect the browser Network panel privately. Finance reads should use GET endpoints
   such as /api/admin/revenue-entries and /api/admin/expense-submissions. If a screen
   issues a write request during inspection, stop and report only its route/status.
   Some existing GET duty code updates computed statuses; avoid invoking those flows
   for verification without separate owner approval. This checklist authorizes no writes.
8. In a separate existing staff session, check that administrator finance pages/data
   are denied. Do not change staff permissions. Sign out when finished.

Record only date/time (Asia/Colombo), deployed commit, viewport, screen/filter tested,
PASS/FAIL and sanitized error/status. Each of the five requested areas needs an owner
result before production finance verification can be claimed complete. Authentication
and last-seen session updates may occur during normal sign-in; no finance records
should change. If a result requires creating or changing a financial record, move
that test to an isolated database with synthetic fixtures.
