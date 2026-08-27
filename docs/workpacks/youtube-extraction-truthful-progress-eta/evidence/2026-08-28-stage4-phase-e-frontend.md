# Phase E frontend evidence — 2026-08-28

## Scope

- Existing surface only: `YT_IMPORT_BACKGROUND`
- Changed: accepted/processing progress card
- Preserved: 5-second polling, leave-safe behavior, `나가기`, `작업 보기`, retry CTA, terminal redirect, notification payload
- Production or remote mutation: 0

## TDD

RED:

- The new browser regression failed on the previous UI because the progressbar had no server-confirmed `aria-valuenow` and still rendered the fixed `예상 소요 시간 약 1~3분` copy.
- The focused component suite produced five expected failures before implementation.

GREEN:

- `tests/youtube-async-extraction-ui.test.tsx`: 27/27
- ETA/API/UI combined focused suite: 38/38
- Cross-project progress Playwright: 9/9
- `pnpm lint`: passed
- `pnpm typecheck`: passed

## Contract evidence

- Six server stages are rendered as compact segments.
- Determinate progress uses only `confirmed_percent` from the server.
- `processing + progress=null` is indeterminate and does not invent a percentage.
- Numeric ETA is hidden when the range is null.
- Promoted fixture renders a low/high range, never a single exact second.
- Delayed state hides the numeric range and keeps the job active.
- Attempt 2 renders `다시 분석 중 (2/3)`.
- Elapsed time remains secondary and does not change `aria-valuenow`.
- ETA and elapsed copy use `aria-live=off`; current stage changes use polite status semantics.
- Reduced-motion browser emulation confirms the spinner, current segment, and status dot all compute to `animation-name: none`.

## Browser evidence

- `ui/designs/evidence/youtube-extraction-truthful-progress-eta/YT_IMPORT_BACKGROUND/mobile-390-model-analysis.png`
- `ui/designs/evidence/youtube-extraction-truthful-progress-eta/YT_IMPORT_BACKGROUND/mobile-320-delayed.png`
- `ui/designs/evidence/youtube-extraction-truthful-progress-eta/YT_IMPORT_BACKGROUND/desktop-1280-source-fetch-retry.png`
- Manifest: `ui/designs/evidence/youtube-extraction-truthful-progress-eta/manifest.json`

The 390 scenario also performs a real page reload against deterministic route fixtures and restores the same stage snapshot. The 320 scenario verifies no page-level horizontal overflow and keeps both accepted-state actions usable.

## Review

- Independent lightweight design review: `Findings 0`
- Independent exact frontend diff review: first pass found one low-severity missing reduced-motion regression; the browser test was repaired and the exact `e33c8cf65b396e3cab7b456206b308c5fb042c7d` re-review returned `Findings 0`.

## Manual-only boundary

- Same-SHA production app/worker/schema promotion
- Exact public YouTube canary
- First-30 terminal job aggregate observation
- Physical-device screen reader and virtual-keyboard validation

These remain release-stage work and are not claimed by the local Phase E evidence.
