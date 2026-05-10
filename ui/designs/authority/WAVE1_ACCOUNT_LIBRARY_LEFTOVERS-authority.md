# Authority Report: WAVE1_ACCOUNT_LIBRARY_LEFTOVERS

> slice: wave1-port-account-library-leftovers
> stage: 5
> reviewer: Codex authority_precheck fallback
> date: 2026-05-10

## Design Status

**reviewed**

Claude Stage 1 documentation was attempted through the existing VS Code Claude session `3f4ca745-db71-4392-a3f1-4e3c4493e9bc` with `--resume`, `model=opus`, requested `effort=xhigh` (CLI `high`), and `permission_mode=bypassPermissions`, but Claude returned a provider limit response. Per user instruction, Codex proceeded directly and performed the Stage 4 implementation plus authority precheck against the screenshot evidence below.

## Changes Summary

### MYPAGE
- The icon-only profile gear was replaced with a visible `설정으로 이동` text entry inside the profile row.
- Recipe book and shopping history tabs continue to use the existing MYPAGE API contracts.
- System recipe books remain list items without rename/delete menus.
- Account-destructive actions remain out of the profile area and stay in SETTINGS.

### SETTINGS
- Existing screen wake lock, nickname, planner column, logout, and delete-account contracts are preserved.
- `로그아웃` and `회원탈퇴` remain visible text triggers that open confirm dialogs.
- Planner column rules remain unchanged: default columns, 1-5 user columns, and empty-column delete only.

### LEFTOVERS
- Card actions now use the user-facing labels `다 먹었어요` and `식단에 추가`.
- At 320px, the two card actions stack vertically to prevent clipping.
- The planner add flow still submits the existing `POST /meals` payload with `leftover_dish_id`.
- Leftover card meta uses only the existing official response fields and does not require meal name, servings, or new metadata.

### ATE_LIST
- Repeated `다먹음` text was removed from card meta and empty-state description.
- The recovery action keeps the existing uneat API and is relabeled to `남은요리로 복귀`.
- At 320px, the recovery action stacks under the item body to avoid clipping.

### RECIPEBOOK_DETAIL
- Custom books now expose a book-level kebab menu for `이름 변경` and `삭제`.
- The menu uses existing `PATCH /recipe-books/{book_id}` and `DELETE /recipe-books/{book_id}` APIs.
- System books (`my_added`, `saved`, `liked`) still do not expose book-level rename/delete.
- Recipe-level removal behavior remains unchanged.

## Contract / State Risk

- No API, DB, endpoint, status, or dependency changes.
- `leftover_dishes.status` remains `leftover` / `eaten`.
- `POST /leftovers/{id}/eat` and `POST /leftovers/{id}/uneat` remain available.
- No undocumented LEFTOVERS metadata such as meal column name or servings was introduced.
- System recipe book rename/delete remains blocked in UI and backend policy.
- SETTINGS destructive actions still require confirm dialogs.

## Evidence

> evidence:
> - MYPAGE mobile 390: `ui/designs/evidence/wave1-port-account-library-leftovers/mypage-default.png`
> - MYPAGE mobile 320: `ui/designs/evidence/wave1-port-account-library-leftovers/mypage-narrow.png`
> - SETTINGS mobile 390: `ui/designs/evidence/wave1-port-account-library-leftovers/settings-default.png`
> - SETTINGS mobile 320: `ui/designs/evidence/wave1-port-account-library-leftovers/settings-narrow.png`
> - LEFTOVERS mobile 390: `ui/designs/evidence/wave1-port-account-library-leftovers/leftovers-default.png`
> - LEFTOVERS mobile 320: `ui/designs/evidence/wave1-port-account-library-leftovers/leftovers-narrow.png`
> - ATE_LIST mobile 390: `ui/designs/evidence/wave1-port-account-library-leftovers/ate-list-default.png`
> - ATE_LIST mobile 320: `ui/designs/evidence/wave1-port-account-library-leftovers/ate-list-narrow.png`
> - RECIPEBOOK_DETAIL mobile 390: `ui/designs/evidence/wave1-port-account-library-leftovers/recipebook-detail-default.png`
> - RECIPEBOOK_DETAIL mobile 320: `ui/designs/evidence/wave1-port-account-library-leftovers/recipebook-detail-narrow.png`

## Verification

- `pnpm verify:frontend` — passed: lint, typecheck, 624 product tests, production build, smoke E2E 758 passed / 4 skipped, a11y 6 passed, visual 12 passed, security 9 passed, Lighthouse autorun passed for 2 URLs / 6 runs.
- `pnpm exec vitest run tests/mypage-screen.test.tsx tests/settings-screen.test.tsx tests/leftovers.frontend.test.tsx tests/recipe-book-detail-screen.test.tsx` — passed, 78 tests.
- `pnpm exec playwright test tests/e2e/slice-17a-mypage.spec.ts tests/e2e/slice-17c-settings.spec.ts tests/e2e/slice-16-leftovers.spec.ts tests/e2e/slice-17b-recipebook-detail.spec.ts tests/e2e/qa-wave1-account-library-leftovers-evidence.spec.ts` — passed, 189 tests.
- `pnpm exec playwright test tests/e2e/qa-wave1-account-library-leftovers-evidence.spec.ts --project=desktop-chrome` — passed, generated 10 evidence screenshots.
- `pnpm qa:eval -- --checklist .artifacts/qa/wave1-port-account-library-leftovers/2026-05-10T04-43-48-093Z/exploratory-checklist.json --report .artifacts/qa/wave1-port-account-library-leftovers/2026-05-10T04-43-48-093Z/exploratory-report.json --fail-under 85` — passed, score 98.

## Scorecard

| Dimension | Score |
|-----------|-------|
| Mobile UX | 4/5 |
| Interaction Clarity | 4/5 |
| Visual Hierarchy | 4/5 |
| Contract Safety | 5/5 |
| Narrow Viewport Robustness | 4/5 |

## Verdict

verdict: pass

**PASS** — `confirmed_allowed: true` for Codex fallback closeout.

- **Blockers**: 0
- **Majors**: 0
- **Minors**: 2
  1. MYPAGE remains dense at 320px because it must show profile, tabs, system books, custom book entry, create action, and bottom tabs together. Acceptable because labels and actions no longer clip and the bottom-nav sentinel passes.
  2. RECIPEBOOK_DETAIL uses the existing recipe-level remove buttons next to a book-level kebab menu. Acceptable because system books have no book-level menu and custom book actions live only in the header.

Claude final authority gate could not complete due provider limit; this is recorded as provider-bound automation limit, not an unresolved design blocker.
