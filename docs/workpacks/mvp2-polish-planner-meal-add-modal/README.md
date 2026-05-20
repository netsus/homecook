# mvp2-polish-planner-meal-add-modal

## Goal

플래너 식사추가 흐름에서 옵션별 화면 전환과 헤더 형태가 제각각인 문제를 정리한다. 사용자는 `검색으로 추가`, `레시피북에서 추가`, `팬트리 기반 추천`, `유튜브에서 가져오기`를 원래 보던 플래너/끼니 맥락 위의 모달 또는 시트로 열고, 같은 크기와 형태의 뒤로가기 버튼으로 옵션 목록에 돌아올 수 있어야 한다. `직접등록`은 별도 작성 화면으로 이동하는 기존 계약을 유지하되, 옵션 버튼의 글자 크기와 위계를 다른 옵션과 맞춘다.

## Branches

- 백엔드: N/A (FE-only UI polish)
- 프론트엔드: `feature/fe-mvp2-polish-planner-meal-add-modal`

## In Scope

- 화면:
  - `PLANNER_WEEK` 식사추가 옵션 시트
  - `MEAL_SCREEN` 식사추가 옵션 시트
  - `MENU_ADD` 모바일 fallback 화면
  - `RECIPE_SEARCH_PICKER`
  - `RecipeBookSelector` / `RecipeBookDetailPicker`
  - `PantryMatchPicker`
  - `LeftoverPicker`
  - `YT_IMPORT` 진입용 유튜브 모달/시트
- API: 신규/변경 없음. 기존 `GET /recipes`, `GET /recipe-books/{id}/recipes`, `GET /recipes/pantry-match`, `GET /leftovers`, `POST /meals`, `POST /recipes/youtube/*` 계약만 소비한다.
- 상태 전이: 변경 없음. `meals.status`는 `registered -> shopping_done -> cook_done`만 허용한다.
- DB 영향: 없음
- Schema Change:
  - [x] 없음 (읽기 전용)
  - [ ] 있음 → `supabase/migrations/<파일명>.sql` 생성 필요

## Out of Scope

- `MANUAL_RECIPE_CREATE`를 모달로 전환하는 작업
- 유튜브 레시피 추출/등록 API 계약 변경
- `/menu/add/youtube`와 `/menu/add/manual` deep link route 삭제
- PLANNER_WEEK 날짜/끼니 카드 레이아웃 또는 스크롤 구조 변경
- Meal 생성, 장보기, 요리하기, 남은요리 저장 정책 변경
- API, DB, auth, RLS, seed, bootstrap 변경
- 전역 색상 토큰 또는 웹 전용 토큰 변경

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `05-planner-week-core` | merged | [x] |
| `08a-meal-add-search-core` | merged | [x] |
| `08b-meal-add-books-pantry` | merged | [x] |
| `16-leftovers` | merged | [x] |
| `18-manual-recipe-create` | merged | [x] |
| `19-youtube-import` | merged | [x] |
| `design-polish-slice4-planner-meal-add` | merged | [x] |

> `design-polish-slice4-planner-meal-add`가 이미 검색/레시피북/팬트리/남은요리의 modal/sheet 기반 picker 흐름을 만들었다. 이 슬라이스는 그 후속 보완으로 유튜브 진입, 공용 뒤로가기 버튼, 남은요리 뒤로가기, 옵션 버튼 typography 불일치만 닫는다.

## Backend First Contract

- Backend branch 없음.
- Request/response/error 계약 변경 없음.
- 기존 API 응답 wrapper `{ success, data, error }`를 그대로 소비한다.
- `POST /meals` 호출 payload, owner guard, 로그인 필요 조건, 상태 전이 정책은 기존 구현을 유지한다.
- `POST /recipes/youtube/validate`, `POST /recipes/youtube/extract`, `POST /recipes/youtube/register` 계약은 바꾸지 않는다. 유튜브 옵션의 presentation만 route-only에서 modal/sheet entry surface로 바꾼다.
- `/menu/add/youtube`와 `/menu/add/manual` route는 직접 접근, return-to-action, 테스트 fallback을 위해 유지한다.

## Frontend Delivery Mode

- 기존 확정 모바일 앱 UI 위의 FE-only polish로 구현한다.
- 필수 상태: `loading / empty / error / read-only / unauthorized` 기존 흐름을 보존한다.
- 로그인 보호 액션은 기존 login gate와 return-to-action을 유지한다.
- `유튜브에서 가져오기`는 option sheet 안에서 modal/sheet entry를 먼저 열고, 필요 시 full `YT_IMPORT` route로 이어질 수 있다.
- `직접등록`은 기존 `router.push` route 이동을 유지한다.

## Design Authority

- UI risk: `anchor-extension`
- Anchor screen dependency: `PLANNER_WEEK`
- Visual artifact:
  - `ui/designs/evidence/mvp2-polish-planner-meal-add-modal/PLANNER_WEEK-youtube-modal-mobile.png`
  - `ui/designs/evidence/mvp2-polish-planner-meal-add-modal/PLANNER_WEEK-youtube-modal-mobile-narrow.png`
  - `ui/designs/evidence/mvp2-polish-planner-meal-add-modal/MEAL_SCREEN-youtube-modal-mobile.png`
  - `ui/designs/evidence/mvp2-polish-planner-meal-add-modal/MEAL_ADD-back-button-mobile.png`
  - `ui/designs/evidence/mvp2-polish-planner-meal-add-modal/MEAL_ADD-options-font-mobile.png`
- Authority status: `required`
- Notes:
  - 신규 화면은 만들지 않으므로 design-generator/design-critic은 생략한다.
  - 다만 PLANNER_WEEK의 핵심 식사추가 옵션에서 `유튜브에서 가져오기`의 route transition을 modal/sheet entry로 바꾸므로 anchor-extension으로 분류한다.
  - Stage 4 후 screenshot evidence 기반 Product Design Authority review를 수행한다.

## Design Status

- [x] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [ ] 확정 (confirmed) — Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과, Tailwind/공용 컴포넌트 정리 완료, authority blocker 0개
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/design-polish-slice4-planner-meal-add/README.md`
- `docs/workpacks/design-polish-slice4-planner-meal-add/acceptance.md`
- `docs/요구사항기준선-v1.6.7.md` — §1-5 식사추가
- `docs/화면정의서-v1.5.4.md` — §5 PLANNER_WEEK, §6 MEAL_SCREEN, §7 MENU_ADD, §8 RECIPE_SEARCH_PICKER, §10 YT_IMPORT
- `docs/유저flow맵-v1.3.4.md` — ③ 식단 계획 여정, ⑨ 유튜브 등록 여정
- `docs/api문서-v1.2.5.md` — §5 식사 추가, §6 유튜브 레시피 등록
- `docs/db설계-v1.3.3.md`
- `docs/design/mobile-ux-rules.md`
- `docs/design/anchor-screens.md`
- `docs/engineering/product-design-authority.md`

## QA / Test Data Plan

- fixture baseline: 기존 planner/menu-add/youtube/mock route fixture를 사용한다.
- auth override: 기존 로그인 fixture와 login gate 테스트를 재사용한다.
- fault injection: 기존 picker API 실패 mock으로 `error` 상태 보존을 확인한다.
- real DB smoke 경로: N/A. API/DB/seed 변경이 없고 presentation-only 변경이다.
- seed / reset 명령: 신규 없음.
- bootstrap/system row: 신규 없음.
- blocker 조건:
  - 유튜브 옵션이 route-only로 남아 PLANNER_WEEK/MEAL_SCREEN 컨텍스트를 잃는 경우
  - picker header 뒤로가기 버튼 크기/shape가 화면별로 다시 갈라지는 경우
  - `남은 요리에서 추가` 모달에서 옵션 목록으로 돌아갈 수 없는 경우
  - `직접등록` route fallback이 깨지는 경우
  - `loading / empty / error / unauthorized` 상태가 사라지는 경우

## Key Rules

- `/menu/add/manual` 직접등록 route는 유지한다.
- `/menu/add/youtube` route는 deep link/fallback으로 유지한다.
- `검색으로 추가`, `레시피북에서 추가`, `팬트리 기반 추천`, `유튜브에서 가져오기`는 PLANNER_WEEK/MEAL_SCREEN에서 modal/sheet로 열린다.
- picker modal header의 back button은 공용 primitive 또는 shared class/function으로 통일한다.
- `LeftoverPicker`도 modal header에 back button을 제공하고, 뒤로가기 시 식사추가 옵션 시트로 돌아간다.
- option sheet의 `유튜브에서 가져오기`, `직접등록` 버튼 typography는 다른 option button과 같은 font-size/weight/line-height 계열을 쓴다.
- `meals.status` 전이, Meal 생성 payload, owner guard는 변경하지 않는다.

## Primary User Path

1. 사용자가 `PLANNER_WEEK`에서 빈 끼니 `+`를 누르거나 `MEAL_SCREEN`에서 `식사 추가`를 누른다.
2. 식사추가 옵션 시트가 열리고, 사용자가 `유튜브에서 가져오기`를 누르면 현재 화면 위에 유튜브 URL 입력/진입 모달 또는 시트가 열린다.
3. 사용자가 모달 header의 뒤로가기 버튼을 누르면 동일한 식사추가 옵션 시트로 돌아오고, `직접등록`을 누르면 기존 직접등록 route로 이동한다.

## Delivery Checklist

> 이 체크리스트는 Stage 4~6 동안 계속 갱신하는 living closeout 문서다.
> Stage 6 merge 시점에는 Manual Only를 제외한 In Scope 항목이 모두 닫혀 있어야 한다.

- [ ] `검색으로 추가`가 PLANNER_WEEK/MEAL_SCREEN에서 modal/sheet로 열린다 <!-- omo:id=mppma-search-modal;stage=4;scope=frontend;review=5,6 -->
- [ ] `레시피북에서 추가`가 PLANNER_WEEK/MEAL_SCREEN에서 modal/sheet로 열린다 <!-- omo:id=mppma-recipebook-modal;stage=4;scope=frontend;review=5,6 -->
- [ ] `팬트리 기반 추천`이 PLANNER_WEEK/MEAL_SCREEN에서 modal/sheet로 열린다 <!-- omo:id=mppma-pantry-modal;stage=4;scope=frontend;review=5,6 -->
- [ ] `유튜브에서 가져오기`가 route-only 이동이 아니라 modal/sheet entry로 열린다 <!-- omo:id=mppma-youtube-modal;stage=4;scope=frontend;review=5,6 -->
- [ ] `/menu/add/youtube` deep link/fallback route가 유지된다 <!-- omo:id=mppma-youtube-route-fallback;stage=4;scope=frontend;review=5,6 -->
- [ ] `직접등록`은 기존 `/menu/add/manual` route 이동을 유지한다 <!-- omo:id=mppma-manual-route-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] picker header 뒤로가기 버튼 크기/형태가 shared primitive로 통일된다 <!-- omo:id=mppma-shared-back-button;stage=4;scope=frontend;review=5,6 -->
- [ ] `남은 요리에서 추가` 모달에 뒤로가기 버튼이 추가된다 <!-- omo:id=mppma-leftover-back-button;stage=4;scope=frontend;review=5,6 -->
- [ ] `유튜브에서 가져오기`와 `직접등록` option button typography가 다른 옵션과 일치한다 <!-- omo:id=mppma-option-font-normalized;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 loading/empty/error/unauthorized 상태 UI가 보존된다 <!-- omo:id=mppma-state-ui-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] 모바일 default/narrow screenshot evidence와 authority report가 생성된다 <!-- omo:id=mppma-authority-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] `Vitest` / `Playwright` 자동화 범위가 업데이트된다 <!-- omo:id=mppma-test-coverage;stage=4;scope=frontend;review=6 -->
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm verify:frontend`가 통과한다 <!-- omo:id=mppma-frontend-verification;stage=4;scope=frontend;review=6 -->

## Contract Evolution Candidates

없음. 화면정의서의 `MENU_ADD` 형태는 바텀시트/풀스크린 중 디자인 단계 결정을 허용하고, 이번 작업은 API/DB 계약이 아니라 presentation을 정리하는 범위다.
