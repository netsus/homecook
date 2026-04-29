## Summary

- COOK_READY_LIST 화면 신규 구현 (`/cooking/ready` route) — 장보기 완료된 레시피를 카드 리스트로 표시
- 5가지 UI 상태: loading (skeletons), empty (planner 복귀 유도), error (재시도), unauthorized (로그인 게이트), ready (레시피 카드 리스트)
- PLANNER_WEEK [요리하기] CTA를 `/cooking/ready`로 연결 (기존 disabled button → Link)
- 세션 생성 → COOK_MODE route 이동 (`/cooking/sessions/{id}/cook-mode`)
- 409 conflict toast + 리스트 리프레시, 401 → 로그인 게이트 전환
- 세션 생성 중 모든 레시피 CTA를 잠그고 same-tick 중복 클릭을 ref guard로 차단
- return-to-action: `SocialLoginButtons nextPath="/cooking/ready"`
- COOK_MODE 화면은 15a 슬라이스 범위 (minimal placeholder만 포함)

## Change Type

- [x] `product-frontend`
- 선택 이유: COOK_READY_LIST 신규 화면 + PLANNER_WEEK CTA 연결, Stage 4 frontend implementation

## Workpack / Slice

- 관련 workpack: `docs/workpacks/14-cook-session-start/README.md`
- workflow v2 work item: `.workflow-v2/work-items/14-cook-session-start.json`
- 변경 범위: frontend — API client, Zustand store, screen component, page routes, PLANNER_WEEK CTA wiring
- 변경 유형 기준 required checks: `pnpm verify:frontend`, `pnpm lint`, `pnpm typecheck`

## Test Plan

- 실행한 검증:
  - `pnpm exec vitest run tests/cook-ready-list-screen.test.tsx` — 16 tests pass (auth gate, loading, ready, empty, error, retry, session creation, duplicate-submit guard, global pending lock, 409 conflict, 401, thumbnail)
  - `pnpm exec vitest run tests/planner-week-screen.test.tsx` — planner CTA test updated (요리하기 as link to /cooking/ready)
  - `pnpm exec vitest run tests/cook-session-start.backend.test.ts` — 9 backend tests pass (regression)
  - Playwright: `tests/e2e/slice-14-cook-session-start.spec.ts` — 7 E2E tests (ready list, login gate, empty, session create, 409 toast, back button, planner CTA link)
- 생략 또는 `N/A` 처리한 검증: live OAuth, 실제 장보기 완료부터 COOK_MODE route까지의 운영 DB cross-slice walkthrough
- 생략 또는 `N/A` 근거: 두 항목은 `acceptance.md`의 Manual Only 항목이며 fixture/local Supabase 자동화와 Stage 2 real DB smoke로 계약을 고정
- 추가 검증: `CI=true pnpm verify:frontend`, `pnpm validate:workflow-v2`, `pnpm validate:workpack`, `pnpm validate:authority-evidence-presence`, `pnpm validate:exploratory-qa-evidence`, `pnpm validate:real-smoke-presence`, `pnpm validate:pr-ready`, `pnpm validate:closeout-sync`, `pnpm validate:omo-bookkeeping`, `git diff --check`

## QA Evidence

- deterministic gates: Vitest 16 frontend + 9 backend regression; `CI=true pnpm verify:frontend` pass (product Vitest 348 tests, smoke 386 passed / 4 skipped, a11y 6, visual 12, security 9, Lighthouse 6 runs)
- exploratory QA: `.artifacts/qa/14-cook-session-start/2026-04-29T05-50-05-895Z/exploratory-report.json` — desktop/mobile/small viewport flow coverage, findings 0
- qa eval: `.artifacts/qa/14-cook-session-start/2026-04-29T05-50-05-895Z/eval-result.json` — score 100, pass
- 아티팩트 / 보고서 경로: `.artifacts/qa/14-cook-session-start/2026-04-29T05-50-05-895Z/exploratory-report.json`, `.artifacts/qa/14-cook-session-start/2026-04-29T05-50-05-895Z/eval-result.json`, `ui/designs/authority/COOK_READY_LIST-authority.md`
  - `ui/designs/authority/COOK_READY_LIST-authority.md` (verdict `pass`, blocker 0)
  - `ui/designs/evidence/14-cook-session-start/COOK_READY_LIST-mobile-default-screenshot.png`
  - `ui/designs/evidence/14-cook-session-start/COOK_READY_LIST-mobile-narrow-screenshot.png`
  - `.artifacts/qa/14-cook-session-start/2026-04-29T05-50-05-895Z/exploratory-report.json`
  - `.artifacts/qa/14-cook-session-start/2026-04-29T05-50-05-895Z/eval-result.json`
  - `.omx/artifacts/claude-delegate-14-cook-session-start-stage5-final-authority-gate-response-20260429T055358Z.md`

## Actual Verification

- verifier: Codex (Stage 5/6/6.5) + Claude final authority gate
- environment: local dev, QA fixture browser, CI-equivalent local verify (`CI=true`), Stage 2 local Supabase smoke via declared `pnpm dev:local-supabase` path
- scope: all non-Manual-Only acceptance items, COOK_READY_LIST visual/QA authority, duplicate session-submit guard, backend regression, local DB smoke evidence from Stage 2
- result: `CI=true pnpm verify:frontend` pass; Stage 2 backend PR #285 real DB smoke passed for declared `pnpm dev:local-supabase` path (migration applied and `cooking_sessions` / `cooking_session_meals` table existence confirmed via psql); Stage 5 exploratory QA score 100; Claude final authority gate passed
- 남은 manual/live 확인: live OAuth login → COOK_READY_LIST, real DB cross-slice end-to-end (Manual Only in acceptance.md)

## Closeout Sync

- roadmap status: `merged` (internal 6.5 closeout projection synced before final merge)
- README Delivery Checklist: complete
- acceptance: all non-Manual-Only items checked
- Design Status: `confirmed`
- Design Authority: `reviewed`; `COOK_READY_LIST-authority.md` verdict `pass`, Claude final authority gate `pass`
- 남은 Manual Only / follow-up: live OAuth, real DB cross-slice end-to-end (2 items)

## Merge Gate

- current head SHA: closeout commit to be pushed to PR #286; GitHub current-head checks must be green before merge
- started PR checks: will rerun after closeout commit push
- all checks completed green: required before final merge
- pending / failed / rerun checks: none locally; GitHub checks pending until push

## Docs Impact

- [x] 공식 문서 영향 없음
- 영향 내용: workpack README/acceptance closeout 갱신만 포함, 공식 제품 문서 변경 없음

## Security Review

- 인증/인가 영향: COOK_READY_LIST 접근 시 서버 사이드 `getServerAuthUser()` + 클라이언트 사이드 auth state checking. 비로그인 시 unauthorized gate 표시. API 호출 시 서버에서 소유자 검증 (403).
- 입력 검증 영향: 세션 생성 시 request body는 서버 검증 (recipe_id, meal_ids, cooking_servings). 프론트에서는 store에서 recipe 데이터를 그대로 전달.
- 비밀정보/권한 경계 영향: 없음. E2E auth override는 `HOMECOOK_ENABLE_QA_FIXTURES` 환경 변수가 있을 때만 활성화.
- `N/A` 또는 영향 없음 근거: 기존 auth 패턴 (planner-week-screen, pantry) 그대로 따름

## Performance

- UI 또는 fetch 변경 여부: 신규 route `/cooking/ready` 추가. 단일 API 호출 (`GET /cooking/ready`). 세션 생성 시 `POST /cooking/sessions` 1회.
- Lighthouse 또는 수동 점검 근거: `CI=true pnpm verify:frontend` 포함 `pnpm test:lighthouse` pass (2 URLs × 3 runs).
- `N/A` 또는 영향 없음 근거: 기존 페이지 성능에 영향 없음 (신규 route만 추가)

## Design / Accessibility

- 디자인 시스템 영향: 기존 디자인 토큰 사용 (`--brand`, `--radius-lg`, `--radius-md`, `--shadow-2`). 공용 컴포넌트 `ContentState`, `Skeleton`, `SocialLoginButtons`, `AppShell` 재사용.
- loading / empty / error / read-only 확인: loading (3 skeletons), empty (ContentState tone=empty + planner 복귀), error (ContentState tone=error + 재시도), unauthorized (ContentState tone=gate + SocialLoginButtons). read-only N/A (README에 해당 없음 명시).
- `N/A` 또는 영향 없음 근거: prototype-derived design (h8 matrix). Authority evidence reviewed: `ui/designs/authority/COOK_READY_LIST-authority.md`; Claude final authority gate passed. 44px touch targets, card radius 16px, button radius 12px 준수.

## Breaking Changes

- [x] 없음
- 설명: PLANNER_WEEK [요리하기] CTA가 disabled button에서 Link로 변경되었으나, 이전에 비활성 상태였으므로 기존 사용자 흐름에 영향 없음.

## New Files

| File | Purpose |
|------|---------|
| `lib/api/cooking.ts` | Cooking API client (pantry pattern) |
| `stores/cooking-ready-store.ts` | Zustand store for COOK_READY_LIST |
| `components/cooking/cook-ready-list-screen.tsx` | Screen component (all 5 states) |
| `app/cooking/ready/page.tsx` | Page route |
| `app/cooking/sessions/[session_id]/cook-mode/page.tsx` | COOK_MODE placeholder (15a scope) |
| `tests/cook-ready-list-screen.test.tsx` | Vitest/RTL tests (16 tests) |
| `tests/e2e/slice-14-cook-session-start.spec.ts` | Playwright E2E tests (7 tests) |
| `ui/designs/authority/COOK_READY_LIST-authority.md` | Design authority evidence |

## Modified Files

| File | Change |
|------|--------|
| `components/planner/planner-week-screen.tsx` | [요리하기] CTA: disabled button → Link to /cooking/ready |
| `tests/planner-week-screen.test.tsx` | Update CTA test: 요리하기 expects link, not button |
| `docs/workpacks/14-cook-session-start/README.md` | Delivery checklist, Design Status → confirmed, Stage 4/5/6 Evidence |
| `docs/workpacks/14-cook-session-start/acceptance.md` | Frontend acceptance items checked |
| `docs/workpacks/README.md` | Slice status → merged |
| `.workflow-v2/status.json` | Stage 6/internal 6.5 closeout projection |
| `.workflow-v2/work-items/14-cook-session-start.json` | Canonical closeout snapshot |
