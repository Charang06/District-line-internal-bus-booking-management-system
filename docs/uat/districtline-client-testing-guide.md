# District Line client testing guide

## Purpose

User acceptance testing (UAT) lets the client check that District Line supports the agreed daily work before final acceptance. UAT is a review of the test system; it is not production access or approval to change live bookings or finances.

## Access and test accounts

The UAT environment is **not yet available**. The project team will provide the approved test URL and named synthetic account details after the isolated environment, database, storage, delivery settings, TLS, and access checks are complete. Do not use `districtlinebooking.com` for these tests. Never send passwords in this guide, issue tracker, or email thread.

Each tester will receive a separate account matching their agreed role. Use the secure credential handoff method agreed with the project owner. Change any temporary password at first sign-in if prompted. Do not share accounts or reuse production credentials.

## Supported browsers

The final supported browser/version list has not been approved yet. The project team will fill it in after the isolated UAT deployment is checked. Please include browser name/version, device model, operating system, viewport size, and portrait/landscape orientation with each mobile report.

## Getting started

When the project team confirms access:

1. Open the UAT URL provided directly by the project team and verify the page is identified as a test environment.
2. Sign in with the account issued specifically for you.
3. Use the navigation pages allowed for your role. If an expected page is missing, report the role and page; do not try another person's credentials.
4. Use only the clearly labeled synthetic names and records prepared for UAT.
5. Record results in the UAT checklist. Mark any case that cannot be completed as **Blocked** and state what is missing.

## What to try

- **Dashboard:** review trip and seat summaries, filters, charts, revenue/expense summaries, loading/errors, and phone layout.
- **Bookings:** select a test trip, choose an available seat, enter the provided synthetic passenger details, save, review the Log, cancel the test booking, and confirm whether the seat can be booked again.
- **Accounts:** only authorized Accounts users should review revenue, submit a test entry, add expenses, manage duties, and finalize a duty. View-only users should confirm they cannot make changes.
- **Mobile:** try navigation, forms, tables, and dialogs at narrow phone widths in portrait and landscape. Report clipping, sideways page movement, hard-to-reach controls, or text overlap.
- **Authentication:** test only the login, logout, session, and recovery cases the project team explicitly enables for UAT.

Never use real passenger/customer details or test actions that could send a real SMS or email. Delivery should be mocked/disabled, and the project team will confirm this before access is granted.

## Reporting a problem

Create one feedback form per issue using `districtline-uat-feedback-template.md`. Include what you expected, what happened, exact steps, role, page, device/browser, approximate time, and a screenshot if it contains no real personal or financial information. Do not attach passwords, session tokens, production data, or screenshots from production. If an issue blocks testing, mark it Blocked and notify the agreed project contact.

## Synthetic data and known limitations

The test environment must use a separate UAT database and storage, synthetic records, dedicated credentials, TLS, and mocked or disabled message delivery. It must not share production sessions, secrets, protected backups, or customer data. These isolation requirements are not yet verified because no UAT deployment exists. Database-backed acceptance, provider behavior, mobile physical-device acceptance, and the final browser checks for the latest drawer changes are pending. Automated synthetic browser checks are not the same as client UAT or real PostgreSQL testing.

## Current contact and schedule

| Item | To be completed by project owner |
|---|---|
| UAT URL | |
| UAT start/end dates | |
| Project contact | |
| Defect reporting location | |
| Approved browsers/devices | |
| Emergency/access support | |

