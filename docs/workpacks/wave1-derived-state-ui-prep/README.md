# wave1-derived-state-ui-prep

> Phase4 재진행 전 상태 UI 선행 정리 slice.
> 이 작업은 fixed prototype reference가 직접 없는 `loading / skeleton / empty / error / unauthorized / not-found / submitting` 상태를 `prototype-derived design`으로 분류하고, 공통 규칙과 대표 적용 범위를 먼저 잠근다.
> Public owner 기준으로는 Stage 1/4가 Claude 담당이지만, 이번 PR은 사용자 요청에 따른 Codex fallback으로 진행한다.

## Goal

Wave1 Phase4 재포팅을 병렬로 시작하기 전에, fixed prototype에 직접 없는 상태 화면을 각 slice가 임의로 해석하지 않도록 공통 상태 UI 기준을 먼저 만든다. 이 slice는 전체 화면 리디자인이 아니라 `ContentState`, `Skeleton`, legacy `EmptyState`/`ErrorState`를 Wave1-derived 상태 표현으로 정리하고 HOME, RECIPE_DETAIL, PLANNER_WEEK 대표 상태가 그 기준을 소비하게 한다. API, route, auth, read-only, status transition 계약은 바꾸지 않는다.

## Branches

| Type | Branch |
| --- | --- |
| Docs + frontend prep | `docs/wave1-derived-state-ui-prep` |

## Stage Owner Mapping

| Stage | Name | Owner | Status |
| --- | --- | --- | --- |
| 1 | Workpack README + acceptance | Claude normally / Codex fallback in this PR | complete |
| 2 | Backend implementation | N/A | no backend |
| 3 | Backend PR review | N/A | no backend |
| 4 | Frontend shared state prep | Claude normally / Codex fallback in this PR | complete |
| 5 | Design review | Codex | passed |
| 6 | Frontend PR review / closeout | Codex | passed |

## In Scope

- 화면:
  - HOME representative `loading / skeleton / empty / error`
  - RECIPE_DETAIL representative `loading / skeleton / error`
  - PLANNER_WEEK representative `loading / skeleton / empty / error / unauthorized`
- API: 없음
- 상태 전이: 없음
- DB 영향: 없음
- Schema Change:
  - [x] 없음

### Component Scope

| Target | Work |
| --- | --- |
| `components/shared/content-state.tsx` | Wave1-derived 상태 shell, tone, action hierarchy 정리 |
| `components/ui/skeleton.tsx` | Wave1-derived skeleton marker와 visual baseline 정리 |
| `components/ui/empty-state.tsx` | legacy wrapper를 `ContentState` 기준으로 맞춤 |
| `components/ui/error-state.tsx` | legacy wrapper를 `ContentState` 기준으로 맞춤 |
| HOME / RECIPE_DETAIL / PLANNER_WEEK | 대표 상태가 공통 기준을 소비하는지 테스트와 최소 코드로 고정 |

### State Inventory

| Screen / surface | Fixed reference? | Classification | Prep action |
| --- | --- | --- | --- |
| HOME ready / sort / filter / modal | yes | `prototype parity` | Phase4 Slice B에서 exact parity로 재검증 |
| HOME initial list loading | no direct fixed state | `prototype-derived design` | skeleton density를 final content 구조에 맞춤 |
| HOME empty / error | no direct fixed state | `prototype-derived design` | `ContentState` 기준으로 고정 |
| RECIPE_DETAIL ready / save popup / planner popup | yes | `prototype parity` | Phase4 Slice B에서 exact parity로 재검증 |
| RECIPE_DETAIL loading / error | no direct fixed state | `prototype-derived design` | skeleton + `ContentState` 기준으로 고정 |
| PLANNER_WEEK ready / unauthorized login gate reference | mixed | `prototype parity` where reference exists, otherwise `prototype-derived design` | login gate fixed reference는 exact parity 대상, loading/error/empty는 derived |
| PLANNER_WEEK loading / empty / error | no direct fixed state | `prototype-derived design` | final card density를 예고하는 skeleton과 `ContentState` 기준으로 고정 |
| submitting / creating / completing states in later slices | no direct fixed state | `prototype-derived design` | 이 PR에서는 inventory만 잠그고 Slice A~F에서 확산 |

## Out of Scope

- Slice A~F의 full Phase4 re-porting
- fixed reference가 있는 ready-state 화면을 이 PR에서 exact parity로 완료 주장
- 모든 화면의 loading/empty/error 전면 교체
- API, route, payload, auth, read-only, status transition, DB/schema 변경
- 신규 dependency, 신규 font, prototype-only asset 추가
- Wave1 global token value 변경

## Dependencies

| Dependency | Status | Why it matters |
| --- | --- | --- |
| `wave1-prototype-repair` | merged | fixed prototype SHA와 reference manifest가 service porting 기준 |
| `wave1-exact-parity-validator-baseline` | done | exact mobile parity evidence gate |
| `wave1-app-web-responsibility-matrix` | done | exact-ready / web-only / derived 범위 분리 |
| `wave1-login-gate-reference-freeze` | done | LoginGateModal은 fixed reference 대상 |

## Backend First Contract

Backend 없음. 기존 계약은 그대로 유지한다.

- API response envelope `{ success, data, error }` 유지
- error object `{ code, message, fields[] }` 유지
- auth / owner guard / read-only / idempotency 정책 변경 없음
- `meals.status` 전이와 shopping/cooking/pantry domain rule 변경 없음

## Frontend Delivery Mode

- fixed prototype reference가 없는 상태 UI는 `prototype-derived design`으로 기록한다.
- `ContentState`, `Skeleton`, legacy `EmptyState`, `ErrorState`가 같은 상태 shell/tone/action hierarchy를 공유한다.
- skeleton은 최종 콘텐츠의 구조와 밀도를 예고해야 하며, 장식 카드나 설명문으로 대체하지 않는다.
- HOME / RECIPE_DETAIL / PLANNER_WEEK 대표 상태는 새 공통 기준을 소비한다.
- Phase4 Slice A~F는 이 기준을 확산하되, fixed reference가 있는 surface의 exact parity claim과 섞지 않는다.

## Design Authority

- UI risk: `high-risk`
- Anchor screen dependency: `HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK`
- Visual artifact: representative state UI is covered by component/Vitest assertions in this prep; full screenshot evidence remains Phase4 slice responsibility.
- Authority status: `not-required`
- Notes: this prep does not claim 100% pixel parity for derived states. Stage 5/6 checked classification, component state consistency, no behavior regression, and no conflation between `prototype parity` and `prototype-derived design`.

## Design Status

- [ ] Temporary (temporary) — workpack created and implementation in progress
- [ ] Review pending (pending-review) — implementation complete; review/verification pending
- [x] Confirmed (confirmed) — Stage 5/6 review passed, blocker 0, PR merged
- [ ] N/A

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/wave1-service-porting-plan.md`
- `docs/workpacks/wave1-prototype-repair/closeout.md`
- `ui/designs/WAVE1_MOBILE_APP_BASELINE.md`
- `ui/designs/WAVE1_APP_WEB_RESPONSIBILITY_MATRIX.md`
- `ui/designs/BAEMIN_STYLE_DIRECTION.md`
- `ui/designs/reference/wave1-fixed-prototype/manifest.json`
- `docs/engineering/product-design-authority.md`

## QA / Test Data Plan

- Fixture baseline: existing HOME, RECIPE_DETAIL, PLANNER_WEEK unit tests and mocks.
- Real DB smoke: N/A, no API/DB change.
- Browser smoke: targeted component/screen tests; full mobile screenshot evidence deferred to Phase4 slice PRs.
- Required local checks:
  - `pnpm exec vitest run tests/content-state.test.tsx tests/home-screen.test.tsx tests/recipe-detail-screen.test.tsx tests/planner-week-screen.test.tsx`
  - `pnpm verify:frontend`
  - `pnpm validate:workflow-v2`
  - `pnpm validate:workpack -- --slice wave1-derived-state-ui-prep`
  - `git diff --check`
- Blocker conditions:
  - fixed-reference 없는 state를 `prototype parity`로 기록
  - derived state가 API/auth/status/read-only 동작을 변경
  - representative HOME / RECIPE_DETAIL / PLANNER_WEEK state가 common state 기준을 소비하지 않음
  - legacy glass/radius/color treatment가 공통 state shell에 남음

## Key Rules

- `prototype parity`와 `prototype-derived design`을 PR 본문과 closeout에서 분리한다.
- derived state는 Wave1 mobile white/mint/neutral density를 따르되 exact screenshot parity 점수로 완료 주장하지 않는다.
- 기존 기능 테스트를 삭제하지 않는다. selector 변경이 필요하면 기능 기대값은 유지한다.
- Phase4 병렬 작업은 이 prep과 Slice A foundation 기준이 잠긴 뒤 시작한다.

## Contract Evolution Candidates

없음.

## Primary User Path

1. 사용자가 Wave1 Phase4 재포팅을 시작하기 전, 공통 상태 UI 기준을 확인한다.
2. HOME / RECIPE_DETAIL / PLANNER_WEEK의 representative loading/error/empty/gate 상태가 같은 derived shell과 skeleton 기준을 소비한다.
3. 이후 Slice A~F는 fixed reference가 없는 상태를 이 기준으로 확산하고, fixed reference가 있는 화면은 별도 exact parity evidence로 닫는다.

## Delivery Checklist

- [x] Workpack README / acceptance / automation spec 작성 <!-- omo:id=wdsu-docs;stage=4;scope=frontend;review=5,6 -->
- [x] `.workflow-v2` work item과 status bookkeeping 추가 <!-- omo:id=wdsu-workflow-bookkeeping;stage=4;scope=frontend;review=6 -->
- [x] `wave1-service-porting-plan.md`의 First Next Action을 Slice A 기준으로 넘김 <!-- omo:id=wdsu-first-next-action;stage=4;scope=frontend;review=6 -->
- [x] State inventory가 `prototype parity` / `prototype-derived design` / `out of prototype scope`를 분리한다 <!-- omo:id=wdsu-state-inventory;stage=4;scope=frontend;review=5,6 -->
- [x] `ContentState`가 Wave1-derived 상태 shell/tone/action 기준을 제공한다 <!-- omo:id=wdsu-content-state;stage=4;scope=frontend;review=5,6 -->
- [x] `Skeleton`이 Wave1-derived skeleton 기준을 제공한다 <!-- omo:id=wdsu-skeleton;stage=4;scope=frontend;review=5,6 -->
- [x] legacy `EmptyState` / `ErrorState`가 공통 기준을 소비한다 <!-- omo:id=wdsu-legacy-state-wrappers;stage=4;scope=frontend;review=5,6 -->
- [x] HOME representative loading/empty/error 상태가 공통 기준을 소비한다 <!-- omo:id=wdsu-home-states;stage=4;scope=frontend;review=5,6 -->
- [x] RECIPE_DETAIL representative loading/error 상태가 공통 기준을 소비한다 <!-- omo:id=wdsu-recipe-detail-states;stage=4;scope=frontend;review=5,6 -->
- [x] PLANNER_WEEK representative loading/empty/error/unauthorized 상태가 공통 기준을 소비한다 <!-- omo:id=wdsu-planner-states;stage=4;scope=frontend;review=5,6 -->
- [x] Targeted Vitest regression passes <!-- omo:id=wdsu-vitest;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm verify:frontend` passes <!-- omo:id=wdsu-verify-frontend;stage=4;scope=frontend;review=6 -->
- [x] PR closeout separates `prototype-derived design` from `prototype parity` <!-- omo:id=wdsu-closeout-classification;stage=4;scope=frontend;review=6 -->

## Manual Only

- [ ] 사용자의 최종 visual feel 확인은 Phase4 slice screenshot evidence에서 진행한다.
