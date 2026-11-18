# Login UI polish verification

Only `src/App.css` changed for this task. Other existing workspace changes belong to earlier work.

## Changes

- Reduced the space between adjacent recovery links from 10px to 2px; retained 44px tap targets.
- Reduced the developer footer minimum height from 56px to 48px; preserved its exact text, 12px type, gold emphasis, navy background and position outside the form.
- Replaced fixed viewport-minus-footer sizing with intrinsic grid sizing, so a wrapped footer is accommodated without overlap.
- At widths of at least 768px and heights up to 760px, reduced stage vertical padding to 16px, card vertical padding to 24px, icon size to 48px, divider margins to 14px/18px and support top margin to 12px. Input, button and card widths are unchanged.
- No image or loading-code changes: the existing optimized photograph and decode-gated fade passed verification.

## Checks

The Vite production frontend builds passed in memory with environment files and public-directory copying disabled. No backend process or database was started. Isolated Chrome served only reviewed local assets and synthetic API responses; off-origin page requests were blocked. Username recovery was enabled or disabled only in test build configuration.

- Before and after screenshots/measurements: 320x640, 360x740, 375x667, 390x844, 430x932, 768x1024, 1024x768, 1440x900, 1440x768, 1366x768, 1280x720, 1440x720, 1366x650 and 1280x600.
- Additional mobile and desktop checks with username recovery disabled: 390x844 and 1440x768.
- All final checks passed: no horizontal overflow, footer/form overlap or JavaScript runtime exceptions. Recovery links retain 44px height. Company credit text matches exactly.
- At 1440x720 and 1366x650, the original layout scrolled; the polished layout fits without scrolling. Very short screens, including 1280x600, intentionally scroll.
- Synthetic interactions passed at every final viewport: entering credentials, show/hide password, displaying a failed-login response, opening password recovery, submitting a synthetic recovery request and returning to login; equivalent username recovery checks passed when enabled.
- Mobile viewport resized to 360px high: Sign In and the footer remained reachable by scrolling after focusing the password input. This approximates keyboard space; a physical mobile keyboard was not tested.
- Empty-cache throttled image loading with a held decode promise kept the background invisible while the form accepted input, then revealed the completed image. Failed images retained the navy fallback. Reduced motion used an effectively instant transition.

Saved results: `before-results.json`, `after-results.json`, `before-short-results.json`, `after-short-results.json`, `after-flag-off-results.json`, plus corresponding PNG screenshots. The harness can be regenerated with `node artifacts/login-polish-review/generate.cjs` and run with `node artifacts/login-polish-review/check.mjs`; use `--before`, `--short` or `--flag-off` for additional cases.

No production access, deployment, commit or push occurred. No remaining UI defects found within these local checks. Device-native keyboard behavior remains a verification limitation.
