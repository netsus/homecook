# Stage 4 authority finding repair — 2026-08-14

## Scope and lineage

- task / role: `019ffe50-9a4b-7061-9bc1-2b842f8574e9` / Stage 4 authority finding repair author
- input base/head/tree: `e71e01721f0c28262610d3c6ad6a1f77843e33d3` / `e71e01721f0c28262610d3c6ad6a1f77843e33d3` / `d8dd829ebb0a356a3b299a4a30549b9c68bcf3a4`
- original Stage 4 actor: `019ffd0f-124b-70f3-9861-4efc2d3d40b6`
- authority precheck reviewer: `019ffe4a-b756-7e43-8098-c15bb13f67b3`
- repaired findings: `P1-ML-AUTH-01`, `P1-ML-AUTH-02`, `P1-ML-AUTH-03`
- public API/schema/field/status/route/dependency/capability change: none

This task authors repairs only. It does not approve its own changes and does not perform Stage 5, final authority, Stage 6, push, Ready, merge, or external notification.

## RED → GREEN

- RED: `pnpm exec vitest run tests/meal-log-ui.test.tsx tests/meal-log-add-sheet.test.tsx` produced `2 files / 2 failed`.
  - empty state rendered multiple `0 kcal` values and zero nutrients;
  - add sheet lacked the exact mobile `h-[100dvh]` contract.
- GREEN: the same scope produced `2 files / 8 passed`.
- focused current-head GREEN: six files / 40 tests passed.
- browser repair loop additionally caught the header outside the viewport; portal-based document-boundary rendering closed it while preserving the desktop dialog model.

## Product repair commits

The exact clean implementation tuple used for evidence is the latest normal commit in this additive repair chain:

| commit | tree | parent | purpose |
|---|---|---|---|
| `5c3f7d35a6f1afb2d1c28925b1d92755228ca59f` | `fec794fe69a448091551096dfdc5353ea1b0e0ab` | `e71e01721f0c28262610d3c6ad6a1f77843e33d3` | empty truth, initial full-height contract, viewport capture, exact-pin guard |
| `b49b56219281f7158cf0dd3581bfe1bae375afad` | `0defe47ef4b87b2ccda740bc859075913563394a` | `5c3f7d35a6f1afb2d1c28925b1d92755228ca59f` | viewport-edge mobile positioning |
| `9dce2464aff4914e17f2335646862f5ba3e0c614` | `e44217338fb05de47dc68b2a10ce9c59de83d5d5` | `b49b56219281f7158cf0dd3581bfe1bae375afad` | document-body portal containment |
| `61d8b668a6c9a9b5bf39270f5e8ec120b1919574` | `b9e6ddbc9eb6cd669935a7c6414a1d6d97be7e26` | `9dce2464aff4914e17f2335646862f5ba3e0c614` | clean Git tuple derivation |
| `5816920358c9d588c128b1459e80c7ae0c5bd78e` | `5861ddd4f3762d5c4f27fcca5488e3101122d481` | `61d8b668a6c9a9b5bf39270f5e8ec120b1919574` | config-start clean tuple injection for the standard umbrella suite |

All commits use Conventional Commits plus Lore trailers. No history rewrite was used.

## Fresh runtime evidence

- manifest: `ui/designs/evidence/meal-log-ui/manifest.json`
- runtime audit: `ui/designs/evidence/meal-log-ui/runtime-accessibility-layout.json`
- exact implementation head/tree: `5816920358c9d588c128b1459e80c7ae0c5bd78e` / `5861ddd4f3762d5c4f27fcca5488e3101122d481`
- manifest captured at: `2026-08-14T03:53:52.569Z`
- capture window: `2026-08-14T03:53:11.149Z`–`2026-08-14T03:53:52.512Z`
- matrix: 17 states × 3 viewports = 51 PNGs
- mobile capture boundary: `390×844`, `320×693`, `fullPage: false`
- desktop: `1280×900` viewport with full-page capture
- sheet runtime assertions: visible title/date/meal/close; mobile dialog `y=0`; dialog height equals viewport height
- axe serious/critical: `0`
- horizontal overflow: `0`
- targets below 44px: `0`
- replay idempotency key reuse: `true`

Playwright derives the tuple once when its configuration starts from a clean worktree. A dirty startup does not receive a tuple and canonical capture fails before writing MEAL_LOG artifacts. The standard no-environment-variable `pnpm verify:frontend` remains the required command.

## Verification

- focused Vitest: six files / 40 passed
- `pnpm verify:frontend` with no SHA environment variables: pass
  - lint / typecheck: pass
  - product Vitest: 2,767 passed / 175 intended skipped
  - build: 81 pages
  - Lighthouse: 2 URLs × 3 runs
  - Playwright regression: 943 passed / 176 intended skipped
  - accessibility: 18 passed / 15 intended skipped
  - visual: 22 passed / 23 intended skipped
  - security: 12 passed
- remaining workpack/source/workflow/authority validators: recorded in the evidence commit verification.

## Remaining boundaries

Unresolved authority findings in the assigned set: none. Manual Only remains physical device, screen reader, virtual keyboard, server-Mac, OAuth, AT, R/R+1/R+2, production, and activation. These are not claimed.

Next handoff: a fresh `design-reviewer` task must review exact implementation tuple `58169203… / 5861ddd4…` plus the evidence successor commit. This repair author must not self-approve.
