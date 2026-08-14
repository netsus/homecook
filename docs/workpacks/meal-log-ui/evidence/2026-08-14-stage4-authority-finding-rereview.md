# Stage 4 authority finding fresh re-review — 2026-08-14

## Scope and independence

- task / role: `019ffe71-8e06-7702-a5f4-9a644fe158c0` / independent `design-reviewer` authority recheck
- source coordinator task: `019ff12c-dc8b-7752-9319-398a68cacb6e`
- repair author: `019ffe50-9a4b-7061-9bc1-2b842f8574e9`
- initial authority reviewer: `019ffe4a-b756-7e43-8098-c15bb13f67b3`
- reviewed PR: `https://github.com/netsus/homecook/pull/1361`
- reviewed branch: `feature/fe-meal-log-ui-superseding-draft`
- scope: fresh re-review of `P1-ML-AUTH-01`, `P1-ML-AUTH-02`, `P1-ML-AUTH-03` only
- excluded: Stage 5, final authority, Stage 6, Ready, push, merge, production, activation, and contract invention

This reviewer did not author the implementation or repair and does not approve its own changes. `ui/designs/authority/MEAL_LOG-authority.md` remains reserved for the later final authority task.

## Exact reviewed tuple

| Purpose | Commit | Tree | Parent |
| --- | --- | --- | --- |
| current PR evidence head | `bc86f79affea8c69c0fdb6223c135c99beedd430` | `9169e20b433b0fa90cba8525a7d1553661a00185` | `f1630f029af3e306baabb7cb1d6a26ff8eaeb0a7` |
| normalized PR implementation | `f1630f029af3e306baabb7cb1d6a26ff8eaeb0a7` | `5861ddd4f3762d5c4f27fcca5488e3101122d481` | `0033653bfe50fed624bf411a5552d7cc914767aa` |
| capture source implementation | `5816920358c9d588c128b1459e80c7ae0c5bd78e` | `5861ddd4f3762d5c4f27fcca5488e3101122d481` | `61d8b668a6c9a9b5bf39270f5e8ec120b1919574` |
| upstream evidence equivalent | `8675ae474d8a273844f5702ba2b3c5a205a1ebcf` | `9169e20b433b0fa90cba8525a7d1553661a00185` | `5816920358c9d588c128b1459e80c7ae0c5bd78e` |

GitHub returned PR #1361 as open Draft with exact `headRefOid=bc86f79affea8c69c0fdb6223c135c99beedd430`. Local `HEAD`, its tree, the PR head, and the supplied tuple agree. The normalized PR implementation and capture source implementation have the exact same tree `5861ddd4f3762d5c4f27fcca5488e3101122d481`; their tree-to-tree diff is empty. The manifest therefore pins a content-identical implementation even though the normal commit identities differ.

## 51-PNG visual inspection

The reviewer opened and visually inspected every file enumerated by `ui/designs/evidence/meal-log-ui/manifest.json`:

- 17 states: `default`, `loading`, `empty`, `error`, `unauthorized`, `partial`, `unavailable`, `deleted-column`, `add-sheet-recent`, `add-sheet-search`, `missing-batch`, `unrecoverable-batch`, `edit`, `delete-confirm`, `pending`, `replay`, `conflict`
- 3 viewports: `mobile-default` 390×844, `mobile-narrow` 320×693, `desktop` 1280×900
- exact count: 51 PNGs; manifest entries and on-disk filenames are a one-to-one match
- mobile captures are exact viewport dimensions and viewport-bound; desktop captures preserve the declared 1280px width
- capture window: `2026-08-14T03:53:11.149Z`–`2026-08-14T03:53:52.512Z`

Visual inspection found no blank, wrong-state, loading-only, unintended crop, page-level horizontal overflow, clipped add-sheet header, fake empty nutrition, or missing required state in the assigned finding scope. The mobile add-sheet captures show the title, selected date, selected meal, and close action at the top edge while the sheet reaches the viewport bottom.

## Finding disposition

### `P1-ML-AUTH-01` — RESOLVED

- manifest exact pin: `5816920358c9d588c128b1459e80c7ae0c5bd78e` / `5861ddd4f3762d5c4f27fcca5488e3101122d481`
- normalized PR implementation: `f1630f029af3e306baabb7cb1d6a26ff8eaeb0a7` / `5861ddd4f3762d5c4f27fcca5488e3101122d481`
- proof: exact tree identity and empty tree-to-tree diff
- capture startup guard: Playwright records the clean Git HEAD/tree once at configuration startup and supplies no tuple when startup is dirty

### `P1-ML-AUTH-02` — RESOLVED

- all three `empty` PNGs show explanatory empty copy and active meal add actions with no `0 kcal`, `0g`, or zero nutrient summary
- `MealLogScreen` renders the day nutrition summary only when `day.entries.length > 0`
- Vitest and Playwright explicitly assert absence of `0 kcal` and zero carbohydrate/protein/fat text in empty state

### `P1-ML-AUTH-03` — RESOLVED

- mobile add sheet is portaled to `document.body` and uses `fixed inset-0 h-[100dvh] max-h-[100dvh]`
- every mobile add-sheet state is a viewport-bound capture with the header at the top and visible `먹은 음식 추가`, `8월 10일 · 아침`, and `닫기` context
- canonical Playwright asserts mobile dialog `y=0` and height equal to the declared viewport height
- runtime audit records horizontal overflow `0`, targets below 44px `0`, and axe serious/critical `0`

## Verification

- focused Vitest: 6 files / 27 tests passed
- `pnpm validate:source-of-truth-sync`: passed
- `pnpm validate:workflow-v2`: passed
- `BRANCH_NAME=feature/fe-meal-log-ui-superseding-draft pnpm validate:workpack -- --slice meal-log-ui`: passed
- `node scripts/validate-automation-spec.mjs --slice meal-log-ui`: passed
- `pnpm validate:omo-bookkeeping`: passed
- `pnpm validate:authority-evidence-presence`: passed
- `pnpm validate:real-smoke-presence`: passed
- `pnpm validate:commits`: passed, 20 commits
- `git diff --check`: passed
- existing repair evidence: environment-free `pnpm verify:frontend` passed with 2,767 product tests, 943 Playwright regression tests, 18 accessibility tests, 22 visual tests, 12 security tests, build 81 pages, and Lighthouse 2 URLs × 3 runs

GitHub current-head checks were read only. At review time, all observed completed checks were success or intended skip; `quality` and `smoke` were still in progress. This authority recheck does not promote Ready or make a Stage 6/current-head terminal-check claim.

## Verdict

- P0: `0`
- P1: `0`
- P2: `0`
- verdict: `PASS`
- assigned unresolved findings: none

Manual Only remains physical device, real screen reader, virtual keyboard, server-Mac, OAuth, assistive technology, `R/R+1/R+2`, production, and activation. None is claimed by this re-review.

Next handoff: a fresh Stage 5 design review task may consume PR head `bc86f79a…`, current tree `9169e20b…`, normalized implementation `f1630f02… / 5861ddd4…`, capture source `58169203… / 5861ddd4…`, the 51-PNG manifest/runtime bundle, and this reviewer-owned PASS evidence. Final authority and Stage 6 remain separate later tasks.
