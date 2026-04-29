## Summary

- COOK_READY_LIST 화면 신규 구현 (`/cooking/ready` route) — 장보기 완료된 레시피를 카드 리스트로 표시
- 5가지 UI 상태: loading (skeletons), empty (planner 복귀 유도), error (재시도), unauthorized (로그인 게이트), ready (레시피 카드 리스트)
- PLANNER_WEEK [요리하기] CTA를 `/cooking/ready`로 연결 (기존 disabled button → Link)
- 세션 생성 → COOK_MODE route 이동 (`/cooking/sessions/{id}/cook-mode`)
- 409 conflict toast + 리스트 리프레시, 401 → 로그인 게이트 전환
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
  - `pnpm exec vitest run tests/cook-ready-list-screen.test.tsx` — 14 tests pass (auth gate, loading, ready, empty, error, retry, session creation, 409 conflict, 401, thumbnail)
  - `pnpm exec vitest run tests/planner-week-screen.test.tsx` — planner CTA test updated (요리하기 as link to /cooking/ready)
  - `pnpm exec vitest run tests/cook-session-start.backend.test.ts` — 9 backend tests pass (regression)
  - Playwright: `tests/e2e/slice-14-cook-session-start.spec.ts` — 7 E2E tests (ready list, login gate, empty, session create, 409 toast, back button, planner CTA link)
- 생략 또는 `N/A` 처리한 검증: `pnpm test:e2e` full suite (fixture-mocked tests only, no live OAuth)
- 생략 또는 `N/A` 근거: E2E tests use route mocking and localStorage auth override; live OAuth is Manual Only per acceptance.md
- 추가 검증: `pnpm lint`, `pnpm validate:workflow-v2`, `pnpm validate:workpack`, `git diff --check`

## QA Evidence

- deterministic gates: Vitest 14 frontend + 9 backend = 23 tests pass; Playwright 7 fixture E2E tests
- exploratory QA: pending — Stage 5 Codex will produce `exploratory-report.json` and `eval-result.json`
- qa eval: pending (Stage 5 Codex review)
- 아티팩트 / 보고서 경로:
  - `ui/designs/authority/COOK_READY_LIST-authority.md` (authority precheck)
  - `.artifacts/qa/14-cook-session-start/` (pending: exploratory-report.json, eval-result.json will be added by Stage 5)

## Actual Verification

- verifier: Claude (Stage 4 self-check)
- environment: local dev (Vitest jsdom + Playwright fixture mocks); local Supabase DB verified in backend PR #285 (real DB smoke: `cooking_sessions` and `cooking_session_meals` tables exist after `supabase migration up`)
- scope: all Stage 4 frontend acceptance items, backend Vitest regression, local DB smoke evidence from Stage 2
- result: all automated checks pass; real DB smoke passed in Stage 2 backend PR #285 (table existence confirmed via psql)
- 남은 manual/live 확인: live OAuth login → COOK_READY_LIST, real DB cross-slice end-to-end (Manual Only in acceptance.md)

## Closeout Sync

- roadmap status: `in_progress` (Stage 4 frontend complete, awaiting Stage 5/6)
- README Delivery Checklist: all Stage 4 items checked (UI 연결, test split, state UI, manual QA handoff)
- acceptance: all Stage 4 frontend items checked (Happy Path ×4, Error/Permission ×6, Vitest frontend ×1, Playwright ×3)
- Design Status: `pending-review` (단일 체크, temporary 해제)
- 남은 Manual Only / follow-up: live OAuth, real DB cross-slice end-to-end (2 items)

## Merge Gate

- current head SHA: (pending after repair commit push)
- started PR checks: template-check, policy, quality (first run failed → repair in progress)
- all checks completed green: pending (repair commit)
- pending / failed / rerun checks: template-check, policy, quality → fix committed

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
- Lighthouse 또는 수동 점검 근거: 신규 화면이며 기존 화면에 영향 없음. 카드 리스트는 3개 skeleton + lazy fetch 패턴.
- `N/A` 또는 영향 없음 근거: 기존 페이지 성능에 영향 없음 (신규 route만 추가)

## Design / Accessibility

- 디자인 시스템 영향: 기존 디자인 토큰 사용 (`--brand`, `--radius-lg`, `--radius-md`, `--shadow-2`). 공용 컴포넌트 `ContentState`, `Skeleton`, `SocialLoginButtons`, `AppShell` 재사용.
- loading / empty / error / read-only 확인: loading (3 skeletons), empty (ContentState tone=empty + planner 복귀), error (ContentState tone=error + 재시도), unauthorized (ContentState tone=gate + SocialLoginButtons). read-only N/A (README에 해당 없음 명시).
- `N/A` 또는 영향 없음 근거: prototype-derived design (h8 matrix). Authority evidence 작성됨: `ui/designs/authority/COOK_READY_LIST-authority.md`. 44px touch targets, card radius 16px, button radius 12px 준수.

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
| `tests/cook-ready-list-screen.test.tsx` | Vitest/RTL tests (14 tests) |
| `tests/e2e/slice-14-cook-session-start.spec.ts` | Playwright E2E tests (7 tests) |
| `ui/designs/authority/COOK_READY_LIST-authority.md` | Design authority evidence |

## Modified Files

| File | Change |
|------|--------|
| `components/planner/planner-week-screen.tsx` | [요리하기] CTA: disabled button → Link to /cooking/ready |
| `tests/planner-week-screen.test.tsx` | Update CTA test: 요리하기 expects link, not button |
| `docs/workpacks/14-cook-session-start/README.md` | Delivery checklist, Design Status → pending-review, Stage 4 Evidence |
| `docs/workpacks/14-cook-session-start/acceptance.md` | Frontend acceptance items checked |
| `.workflow-v2/status.json` | Branch → fe, notes → Stage 4 |
| `.workflow-v2/work-items/14-cook-session-start.json` | Notes → Stage 4 |
