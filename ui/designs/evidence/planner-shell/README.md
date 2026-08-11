# planner-shell Stage 4 fresh screenshot evidence — GREEN

- generator task: `019fefab-38cc-77b0-bcd5-00be9f024690`
- start head/tree/parent: `3556375f7d5a131c7a7ea9db333b5a6b05acb922` / `5892a3c2ce357d99f23af4b28cb0c0ebebb706d3` / `c38e0b10b794e34f954027840579e7d4523f8a4e`
- PR/base/branch: `#1331` / `2a32d20bc45279bebbcd2cf9f201898f2edc658b` / `feature/fe-planner-shell`
- real first-capture timestamp shared by the matrix: `2026-08-11T07:24:52.810Z`
- fixed fixture now/date: `2026-07-23T09:00:00.000+09:00` / `2026-07-23`
- cold deep-link URL: `/planner?date=2026-07-26`
- official matrix: 24 PNG = 390/320/1280 × default/loading/empty/error/unauthorized/shopping-read-only/legacy-read-only/meal-log-disabled
- official PNG bytes: `1192681`
- manifest: `ui/designs/evidence/planner-shell/manifest.json`
- local-only 200% supplemental captures: `/Users/shj/.codex/visualizations/2026/08/11/019fefab-38cc-77b0-bcd5-00be9f024690/planner-shell-stage4-green` (not committed)

## Governing references

- `docs/workpacks/planner-shell/README.md`
- `docs/workpacks/planner-shell/acceptance.md`
- `docs/workpacks/planner-shell/automation-spec.json`
- `docs/engineering/product-design-authority.md`
- `docs/design/mobile-ux-rules.md`

## Green findings

- fixed 320px cold Sunday: selected `7/26 일 선택`, rail `scrollWidth=332`, `clientWidth=262`, `maxScrollLeft=70`, `scrollLeft=70`, fully visible
- default date and key action targets are at least 44×44 CSS px; 200% supplemental date widths remain at least 44 CSS px
- page-level horizontal overflow is 0px in all 24 official captures and all three 200% supplemental captures
- mobile plan-panel internal padding is 16px left/right; this does not impose a desktop or 390px rail-end scroll condition
- 7 dates, 2-day overview, and configured 1/3/5 meal columns are covered
- default and 200% mobile captures retain bottom-tab clearance; no one-character vertical-collapse candidate was found
- loading, empty, error, unauthorized, shopping read-only, legacy read-only, and meal-log-disabled states are visually distinct
- all PNGs are non-empty and have a valid PNG signature, dimensions, byte count, and SHA-256 in the manifest

## Dimensions

- mobile-default: 390×1253, 390×844, 390×1019, 390×919, 390×844, 390×1097, 390×1172, 390×844
- mobile-narrow: 320×1561, 320×725, 320×1303, 320×919, 320×693, 320×1405, 320×1456, 320×693
- desktop: 1280×1069, 1280×900, 1280×900, 1280×900, 1280×900, 1280×900, 1280×900, 1280×900

## Evidence boundary

These PNGs and DOM measurements prove visible static layout for deterministic mock fixtures only. They do not prove runtime keyboard/focus sequences, full WCAG conformance, screen-reader announcements, physical-device safe-area behavior, or virtual-keyboard occlusion. Manual/server-Mac/OAuth, merged-exact server-production/local rehearsal, capability, `R/R+1/R+2`, and activation remain pending.

This bundle is evidence-only. It does not approve Stage 5, final authority, Stage 6, Ready, or merge.
