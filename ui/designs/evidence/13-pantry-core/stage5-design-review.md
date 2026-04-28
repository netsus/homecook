# Stage 5 Design Review: 13-pantry-core

> reviewer: Codex
> date: 2026-04-29
> scope: `PANTRY`, `PANTRY_BUNDLE_PICKER`
> PR: #281

## Result

- verdict: `approve`
- Design Status decision: `pending-review` 유지, Claude `final_authority_gate` 후 `confirmed` 전환 가능
- final authority gate required: `yes`
- blocker_count: `0`
- major_count: `0`
- minor_count: `0`

## Evidence Reviewed

- `ui/designs/evidence/13-pantry-core/PANTRY-mobile.png`
- `ui/designs/evidence/13-pantry-core/PANTRY-mobile-narrow.png`
- `ui/designs/evidence/13-pantry-core/PANTRY_BUNDLE_PICKER-mobile.png`
- `ui/designs/evidence/13-pantry-core/PANTRY_BUNDLE_PICKER-mobile-narrow.png`
- `ui/designs/authority/PANTRY-authority.md`
- `ui/designs/authority/PANTRY_BUNDLE_PICKER-authority.md`
- `components/pantry/pantry-screen.tsx`
- `components/pantry/pantry-add-sheet.tsx`
- `components/pantry/pantry-bundle-picker.tsx`
- `tests/e2e/slice-13-pantry-core.spec.ts`

## Review Scope

- required UI states: `loading`, `empty`, `error`, `read-only`, `unauthorized`
- screen contract fit: `PANTRY`, `PANTRY_BUNDLE_PICKER`
- mobile layout: default 390px and narrow 320px
- token/component consistency
- basic accessibility: roles, labels, focusable controls, 44px touch target intent

## Checklist IDs Reviewed

- `delivery-pantry-ui`
- `delivery-bundle-picker-ui`
- `delivery-test-split`
- `delivery-state-ui`
- `delivery-pantry-authority-evidence`
- `delivery-bundle-picker-authority-evidence`
- `accept-pantry-list`
- `accept-direct-add`
- `accept-bundle-add`
- `accept-delete`
- `accept-search-filter`
- `accept-backend-frontend-types`
- `accept-loading`
- `accept-empty`
- `accept-error`
- `accept-unauthorized`
- `accept-return-to-action`
- `accept-vitest-frontend`
- `accept-playwright-pantry-flow`
- `accept-playwright-bundle-flow`
- `accept-playwright-login-gate`
- `accept-playwright-empty-state`

## Findings

없음.

## Notes

- `read-only`는 팬트리 도메인에 서버 read-only 상태가 없어 `N/A-pass`로 판정했다. UI는 read-only 상태를 새로 발명하지 않고 README 계약의 "해당 없음" 정책을 따른다.
- 직접 추가와 묶음 추가 E2E는 단순 sheet open이 아니라 POST 후 목록 갱신까지 보강되어 acceptance evidence와 일치한다.
- Prototype-only 요소(Jua 폰트, prototype 전용 탭 behavior, prototype-only asset)는 도입하지 않았다.

## Decision

Codex Stage 5 design review는 approve. Authority-required slice이므로 `confirmed` 전환은 Claude `final_authority_gate` 승인 뒤에만 진행한다.
