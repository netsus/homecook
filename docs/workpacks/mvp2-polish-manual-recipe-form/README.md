# mvp2-polish-manual-recipe-form

## Goal

직접 레시피 등록 화면에서 기준인분 조절, 조리과정 추가, 저장 전 검증, 재료 선택 모달의 피드백을 사용자가 예상하는 방식으로 정리한다. 사용자는 `- / +` 버튼으로 기준인분을 조절하고, 조리방법을 고르지 않으면 조리과정이 임의로 `볶기`로 추가되지 않으며, 저장을 눌렀을 때 빠진 항목을 해당 입력 주변에서 바로 알 수 있어야 한다. 재료 추가 모달에서는 선택된 재료가 카테고리 아래에 보이고, 선택된 칩을 다시 누르면 선택이 취소되며, 선택 수가 생기면 완료 버튼이 명확히 활성 상태로 보여야 한다.

## Branches

- 백엔드: N/A (FE-only UI / validation polish)
- 프론트엔드: `feature/fe-mvp2-polish-manual-recipe-form`

## In Scope

- 화면:
  - `MANUAL_RECIPE_CREATE`
  - `RecipeIngredientAddModal`
- API: 신규/변경 없음. 기존 직접 레시피 등록, 재료 조회, 조리방법 조회 계약만 소비한다.
- 상태 전이: 변경 없음. `meals.status` 전이는 이 슬라이스 범위가 아니다.
- DB 영향: 없음
- Schema Change:
  - [x] 없음 (읽기 전용)
  - [ ] 있음 -> `supabase/migrations/<파일명>.sql` 생성 필요

## Out of Scope

- 직접 레시피 등록 API request/response/error 계약 변경
- 재료 또는 조리방법 taxonomy 변경
- 유튜브 가져오기 화면과 검증/추출/등록 API 변경
- 레시피 상세, 플래너 추가, 레시피북 저장 흐름 변경
- 전역 색상 토큰, 웹 전용 토큰, 앱 shell 구조 변경
- real DB seed/bootstrap 변경

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `18-manual-recipe-create` | merged | [x] |
| `19-youtube-import` | merged | [x] |
| `design-polish-slice5-manual-youtube` | merged | [x] |
| `mvp2-polish-planner-meal-add-modal` | merged | [x] |

> `design-polish-slice5-manual-youtube`가 이미 수동 등록/유튜브 폼의 밀도와 조리방법 UX를 정리했다. 이 슬라이스는 사용자가 MVP2 수동 검토에서 발견한 남은 직접등록 폼 문제만 닫는다.

## Backend First Contract

- Backend branch 없음.
- Request/response/error 계약 변경 없음.
- 기존 API 응답 wrapper `{ success, data, error }`를 그대로 소비한다.
- 직접 레시피 저장 payload, 로그인 필요 조건, owner guard, error 객체 `{ code, message, fields[] }` 구조는 유지한다.
- 조리방법을 선택하지 않은 조리과정은 프론트에서 추가를 막는다. API 계약이나 DB 기본값으로 보정하지 않는다.
- 기준인분은 UI에서 최소 1 이상으로 조절되며, 저장 계약의 타입/필드는 바꾸지 않는다.

## Frontend Delivery Mode

- 기존 확정 모바일 앱 UI 위의 FE-only polish로 구현한다.
- 필수 상태: 기존 `loading / empty / error / unauthorized` 흐름을 보존한다.
- 저장 버튼은 빠진 항목이 있을 때도 사용자가 눌러 검증 피드백을 볼 수 있어야 한다.
- 하단의 큰 저장 요구사항 박스는 제거하고, 빠진 항목은 제목/기준인분/재료/조리과정 주변 설명문구로 안내한다.
- `조리 과정을 추가해주세요.` 문구는 재료 helper와 비슷한 낮은 밀도의 inline helper로 유지한다.

## Design Authority

- UI risk: `high-risk`
- Anchor screen dependency: 없음
- Visual artifact:
  - `ui/designs/evidence/mvp2-polish-manual-recipe-form/MANUAL_RECIPE_CREATE-base-servings-stepper-mobile.png`
  - `ui/designs/evidence/mvp2-polish-manual-recipe-form/MANUAL_RECIPE_CREATE-method-required-validation-mobile.png`
  - `ui/designs/evidence/mvp2-polish-manual-recipe-form/MANUAL_RECIPE_CREATE-field-validation-on-save-mobile.png`
  - `ui/designs/evidence/mvp2-polish-manual-recipe-form/MANUAL_RECIPE_CREATE-ingredient-modal-selection-mobile.png`
  - `ui/designs/evidence/mvp2-polish-manual-recipe-form/MANUAL_RECIPE_CREATE-narrow.png`
- Authority status: `reviewed`
- Notes:
  - `MANUAL_RECIPE_CREATE`는 h8 future-screen matrix의 직접 등록 화면이며, 이미 구현된 화면의 핵심 입력/저장 UX를 바꾸므로 high-risk로 분류한다.
  - 신규 화면은 만들지 않으므로 design-generator/design-critic은 생략한다.
  - Stage 4 후 mobile default/narrow screenshot evidence 기반 Product Design Authority review를 수행한다.

## Design Status

- [ ] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [x] 확정 (confirmed) — Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과, Tailwind/공용 컴포넌트 정리 완료, authority blocker 0개
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/18-manual-recipe-create/README.md`
- `docs/workpacks/18-manual-recipe-create/acceptance.md`
- `docs/workpacks/design-polish-slice5-manual-youtube/README.md`
- `docs/workpacks/design-polish-slice5-manual-youtube/acceptance.md`
- `docs/요구사항기준선-v1.6.7.md` — 직접 레시피 등록
- `docs/화면정의서-v1.5.4.md` — `MANUAL_RECIPE_CREATE`, 재료 선택 모달
- `docs/유저flow맵-v1.3.4.md` — 직접등록 여정
- `docs/api문서-v1.2.5.md` — 직접 레시피 등록, 재료/조리방법 조회
- `docs/db설계-v1.3.3.md`
- `docs/design/mobile-ux-rules.md`
- `docs/design/anchor-screens.md`
- `docs/engineering/product-design-authority.md`

## QA / Test Data Plan

- fixture baseline: 기존 manual recipe create component fixture와 ingredient/cooking method mock을 사용한다.
- auth override: 기존 로그인 fixture와 저장 가능 상태 mock을 재사용한다.
- fault injection: 기존 API 실패 mock으로 저장 실패/error UI 보존을 확인한다.
- real DB smoke 경로: N/A. API/DB/seed 변경이 없고 UI/validation presentation 변경이다.
- seed / reset 명령: 신규 없음.
- bootstrap/system row: 신규 없음.
- blocker 조건:
  - 조리방법 미선택 상태에서 조리과정이 `볶기` 등 임의 기본값으로 추가되는 경우
  - 저장 요구사항이 하단 박스에만 남고 필드 주변 피드백이 없는 경우
  - 기준인분 모바일 입력에 `- / +` affordance가 없는 경우
  - 선택한 재료 요약이 카테고리 아래가 아니라 footer에만 남는 경우
  - 선택된 재료 칩 재클릭으로 선택 취소가 되지 않는 경우
  - 선택한 재료 추가 버튼이 선택 상태에서도 비활성처럼 보이는 경우

## Key Rules

- 기준인분은 최소 1 미만으로 내려가지 않는다.
- 조리방법을 선택하지 않은 조리과정 추가는 거부하고, 사용자가 조리방법을 고르도록 inline 안내한다.
- 저장 전 빠진 항목 안내는 하단 요약 박스가 아니라 각 입력/섹션 주변에 표시한다.
- `재료를 1개 이상 추가해주세요.` helper와 `조리 과정을 추가해주세요.` helper는 같은 낮은 밀도와 오류 강조 패턴을 쓴다.
- 재료 추가 모달의 선택 요약은 카테고리 컨트롤 아래에 배치한다.
- 선택된 재료 요약 칩은 누르면 선택 해제된다.
- 선택 재료가 1개 이상이면 `선택한 재료 추가` 버튼은 명확한 active 색상을 쓴다.
- 직접 레시피 저장 계약, 레시피북 반영, 플래너 연계 계약은 변경하지 않는다.

## Primary User Path

1. 사용자가 식사추가 옵션 또는 직접 URL에서 `MANUAL_RECIPE_CREATE`를 연다.
2. 기준인분을 `- / +`로 조절하고, 제목/재료/조리과정을 입력한다.
3. 조리방법을 고르지 않고 조리과정을 추가하면 추가되지 않고 조리방법 선택 안내를 본다.
4. 빠진 항목이 있는 상태에서 저장을 누르면 해당 입력 주변의 설명문구로 무엇을 채워야 하는지 확인한다.
5. 재료 추가 모달에서 재료를 고르면 카테고리 아래 선택 요약과 active 완료 버튼을 보고, 선택 칩 재클릭으로 취소하거나 완료해 본문 재료 목록에 추가한다.

## Delivery Checklist

> 이 체크리스트는 Stage 4~6 동안 계속 갱신하는 living closeout 문서다.
> Stage 6 merge 시점에는 Manual Only를 제외한 In Scope 항목이 모두 닫혀 있어야 한다.

- [x] 기준인분 입력 좌우에 `- / +` 버튼이 있고 최소 1을 지킨다 <!-- omo:id=mprf-base-servings-stepper;stage=4;scope=frontend;review=5,6 -->
- [x] `조리 과정을 추가해주세요.` helper가 배경 없는 compact inline 문구로 표시된다 <!-- omo:id=mprf-step-empty-helper-compact;stage=4;scope=frontend;review=5,6 -->
- [x] 조리방법 미선택 상태에서 조리과정 추가가 막히고 선택 안내가 표시된다 <!-- omo:id=mprf-method-required-before-step;stage=4;scope=frontend;review=5,6 -->
- [x] 하단 저장 요구사항 박스가 제거되고 저장 클릭 시 필드별 validation 문구가 표시된다 <!-- omo:id=mprf-field-validation-on-save;stage=4;scope=frontend;review=5,6 -->
- [x] 재료 추가 모달의 선택 요약이 카테고리 컨트롤 아래로 이동한다 <!-- omo:id=mprf-selected-ingredients-below-category;stage=4;scope=frontend;review=5,6 -->
- [x] 선택 요약의 `n개 선택됨...` 설명 문구가 제거된다 <!-- omo:id=mprf-selected-count-copy-removed;stage=4;scope=frontend;review=5,6 -->
- [x] 선택 요약 재료 칩을 누르면 선택이 취소된다 <!-- omo:id=mprf-selected-chip-deselects;stage=4;scope=frontend;review=5,6 -->
- [x] 재료가 1개 이상 선택되면 `선택한 재료 추가` 버튼이 active 색상으로 보인다 <!-- omo:id=mprf-add-selected-button-active;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 loading/empty/error/unauthorized 상태 UI가 보존된다 <!-- omo:id=mprf-state-ui-preserved;stage=4;scope=frontend;review=5,6 -->
- [x] mobile default/narrow screenshot evidence와 authority report가 생성된다 <!-- omo:id=mprf-authority-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] `Vitest` / `Playwright` 자동화 범위가 업데이트된다 <!-- omo:id=mprf-test-coverage;stage=4;scope=frontend;review=6 -->
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm verify:frontend`가 통과한다 <!-- omo:id=mprf-frontend-verification;stage=4;scope=frontend;review=6 -->

## Stage 5/6 Closeout Evidence

- Authority report: `ui/designs/authority/MVP2_POLISH_MANUAL_RECIPE_FORM-authority.md`
- Screenshot evidence:
  - `ui/designs/evidence/mvp2-polish-manual-recipe-form/MANUAL_RECIPE_CREATE-base-servings-stepper-mobile.png`
  - `ui/designs/evidence/mvp2-polish-manual-recipe-form/MANUAL_RECIPE_CREATE-method-required-validation-mobile.png`
  - `ui/designs/evidence/mvp2-polish-manual-recipe-form/MANUAL_RECIPE_CREATE-field-validation-on-save-mobile.png`
  - `ui/designs/evidence/mvp2-polish-manual-recipe-form/MANUAL_RECIPE_CREATE-ingredient-modal-selection-mobile.png`
  - `ui/designs/evidence/mvp2-polish-manual-recipe-form/MANUAL_RECIPE_CREATE-narrow.png`
- Local verification:
  - `pnpm vitest run tests/manual-recipe-create-screen.test.tsx tests/recipe-ingredient-add-modal.test.tsx`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm playwright test tests/e2e/slice-18-manual-recipe-create.spec.ts --project=mobile-chrome`
  - `pnpm playwright test tests/e2e/tmp-mvp2-manual-recipe-form-evidence.spec.ts --project=mobile-chrome` (temporary evidence spec removed after capture)
  - `pnpm playwright test tests/e2e/tmp-mvp2-manual-method-evidence.spec.ts --project=mobile-chrome` (temporary evidence spec removed after capture)
  - `pnpm playwright test tests/e2e/qa-visual.spec.ts -g "manual recipe desktop screen" --project=desktop-chrome --update-snapshots`
  - `pnpm playwright test tests/e2e/qa-visual.spec.ts -g "manual recipe desktop screen" --project=desktop-chrome`
  - `pnpm verify:frontend`
  - `PR_IS_DRAFT=false pnpm validate:authority-evidence-presence`
  - `pnpm validate:workpack -- --slice mvp2-polish-manual-recipe-form`
  - `pnpm validate:workflow-v2`
  - `git diff --check`
- Claude delegation note: Stage 1/4 was requested through resume session `b48a95b1-d4bf-490f-bd7e-915f2f4521bf` with `session_attach_mode=resume`, `model=opus`, `effort=high`, `permission_mode=bypassPermissions`; the CLI produced a zero-byte response artifact and stalled, so Codex completed fallback implementation and review per user instruction.

## Claude Delegation Note

- Stage 1 docs handoff attempted with Claude resume session `b48a95b1-d4bf-490f-bd7e-915f2f4521bf`.
- Recorded settings: `session_attach_mode=resume`, `model=opus`, `effort=high`, `permission_mode=bypassPermissions`.
- Claude CLI produced a zero-byte response artifact and stalled, so Codex completed Stage 1 fallback per user instruction.

## Contract Evolution Candidates

없음. 이번 작업은 직접등록 화면의 presentation과 client-side validation 피드백 정리이며, 공식 API/DB 계약 변경을 포함하지 않는다.
