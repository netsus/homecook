# design-polish-slice7-mypage-settings-account

## Goal

마이페이지에서 레시피북 목록 또는 장보기 기록을 열고 상세 화면으로 이동한 뒤 뒤로가기를 눌렀을 때, 사용자가 보던 목록 맥락으로 바로 돌아오게 한다. 현재처럼 마이페이지 기본 화면이 잠깐 보였다가 목록으로 이동하는 중간 상태를 제거해 모바일 앱의 back navigation을 안정화한다. API, DB, 상태 전이, 디자인 토큰은 변경하지 않고 기존 `MYPAGE`, `RECIPEBOOK_DETAIL`, `SHOPPING_DETAIL` 화면의 라우팅/복귀 동작만 고정한다.

## Branches

- 백엔드: N/A (FE-only navigation polish)
- 프론트엔드: `feature/fe-design-polish-slice7-mypage-settings-account`

## In Scope

- 화면: `MYPAGE`, `RECIPEBOOK_DETAIL`, `SHOPPING_DETAIL`
- API: 기존 API 소비만 유지
  - `GET /users/me`
  - `GET /recipe-books`
  - `GET /recipe-books/{id}/recipes`
  - `GET /shopping/lists`
  - `GET /shopping/lists/{id}`
- 상태 전이: 없음. 화면 복귀/라우팅 상태만 다룬다.
- DB 영향: 없음. 기존 `recipe_books`, `recipe_book_items`, `shopping_lists`, `shopping_list_items` 조회 계약만 소비한다.
- Schema Change:
  - [x] 없음 (읽기 전용)

## Out of Scope

- API request/response/error 구조 변경
- DB 스키마, seed, status enum 변경
- 레시피북 생성/수정/삭제 정책 변경
- 레시피북 상세에서 레시피 제거 정책 변경
- 장보기 상세 read-only/complete/reorder/팬트리 반영 정책 변경
- 마이페이지 화면 구조, 탭 정보 구조, 색상/토큰/컴포넌트 재디자인
- SETTINGS, ACCOUNT의 계정 수정/로그아웃/탈퇴 기능 변경

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `17a-mypage-overview-history` | merged | [x] |
| `17b-recipebook-detail-remove` | merged | [x] |
| `17c-settings-account` | merged | [x] |
| `10a-shopping-detail-interact` | merged | [x] |
| `12a-shopping-complete` | merged | [x] |
| `design-polish-slice1-typography-tokens` | merged | [x] |
| `design-polish-slice2-app-shell-home` | merged | [x] |
| `design-polish-slice3-recipe-detail` | merged | [x] |
| `design-polish-slice4-planner-meal-add` | merged | [x] |
| `design-polish-slice5-manual-youtube` | merged | [x] |
| `design-polish-slice6-shopping-cooking-pantry` | merged | [x] |

## Classification

- **UI risk: `low-risk-ui-change`**
- 이유: 기존 confirmed 화면의 정보 구조, layout, CTA, modal/sheet 패턴을 바꾸지 않고, 상세 화면으로 들어갈 때의 return context와 back action만 바로잡는다. 새 화면, 새 공용 컴포넌트, anchor screen 변경은 없다.
- Anchor screen dependency: 없음 (`HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK` 직접 변경 없음)
- design-generator / design-critic: 생략. 기존 확정 화면의 시각 구조 변경이 아니며, 회귀 위험은 Playwright/Vitest 라우팅 테스트로 잠근다.
- product-design-authority: not-required. Screenshot authority 대신 browser flow evidence로 "중간 MyPage root 노출 없음"을 검증한다.

## User Finding

마이페이지 > 레시피북 목록 > 레시피북 상세로 이동한 뒤 앱 헤더의 뒤로가기를 누르면, 마이페이지 기본 화면이 먼저 보였다가 레시피북 목록으로 이동한다. 장보기 기록에서 `SHOPPING_DETAIL`로 들어갔다가 뒤로가기할 때도 같은 현상이 발생한다. 뒤로가기는 사용자가 떠났던 목록 맥락으로 바로 복귀해야 하며, 중간 화면 깜빡임이나 기본 탭 노출이 없어야 한다.

## Affected Components

| Component | File 후보 | 변경 사유 |
| --- | --- | --- |
| MyPage screen | `components/mypage/*`, `app/mypage/page.tsx` | 레시피북/장보기 기록 목록에서 상세 진입 시 return context 보존 |
| Recipe book detail | `components/recipebook/*`, `app/mypage/recipe-books/[book_id]/page.tsx` | 뒤로가기 시 레시피북 목록 맥락으로 직접 복귀 |
| Shopping detail | `components/shopping/*`, `app/shopping/lists/[list_id]/page.tsx` | 마이페이지 장보기 기록 경유 상세에서 read-only 목록 맥락으로 직접 복귀 |
| Navigation helper | `components/shared/*`, `lib/navigation/*` | 기존 return-to-action/returnTo 패턴 재사용 여부 확인 |
| Tests | `tests/*mypage*`, `tests/*recipebook*`, `tests/*shopping*`, `tests/e2e/*` | 직접 복귀와 중간 화면 미노출 회귀 고정 |

## Backend First Contract

- Backend 변경 없음.
- 기존 응답 래퍼 `{ success, data, error }` 소비 방식 유지.
- `GET /recipe-books`, `GET /recipe-books/{id}/recipes`, `GET /shopping/lists`, `GET /shopping/lists/{id}`의 request/response/error 계약을 바꾸지 않는다.
- 권한/소유자 검증은 기존 API가 담당한다. 프론트는 unauthorized/error state를 기존 방식으로 표시한다.
- 멱등성 변경 없음. 이번 slice에는 mutation, complete, cancel 성 API가 없다.
- 장보기 기록에서 열린 `SHOPPING_DETAIL`은 완료 리스트 read-only 재열람 정책을 유지한다.

## Frontend Delivery Mode

- 디자인 상태: 기존 confirmed 화면의 low-risk navigation polish
- 필수 상태:
  - `loading`: 마이페이지, 레시피북 상세, 장보기 상세 데이터 로딩 유지
  - `empty`: 레시피북 목록/장보기 기록/상세 빈 상태 유지
  - `error`: 목록/상세 fetch 실패 상태 유지
  - `read-only`: 완료된 장보기 기록 상세 read-only 안내 유지
  - `unauthorized`: 비로그인 마이페이지/상세 접근 시 기존 로그인 흐름 유지
- 보호 액션의 return-to-action 계약은 기존 구현을 유지한다.

## Design Authority

- UI risk: `low-risk-ui-change`
- Anchor screen dependency: 없음
- Visual artifact: not-required
- Authority status: `not-required`
- Notes: 화면 구조, 시각 위계, 컴포넌트 형태를 바꾸지 않는 back navigation behavior fix다. Stage 5는 생략하고 Stage 6에서 lightweight design/navigation check로 흡수한다.

## Design Status

- [ ] 임시 UI (temporary) -- Stage 1 문서 잠금 상태
- [ ] 리뷰 대기 (pending-review) -- Stage 4 완료 후, 필요 시 browser-flow evidence 준비
- [x] 확정 (confirmed) -- 기존 confirmed 화면 유지. 시각 구조 변경 없음
- [ ] N/A -- BE-only 슬라이스 아님

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/17a-mypage-overview-history/README.md`
- `docs/workpacks/17b-recipebook-detail-remove/README.md`
- `docs/workpacks/17c-settings-account/README.md`
- `docs/workpacks/10a-shopping-detail-interact/README.md`
- `docs/workpacks/12a-shopping-complete/README.md`
- `docs/요구사항기준선-v1.6.7.md` -- §1-9, §2-13
- `docs/화면정의서-v1.5.4.md` -- §12 `SHOPPING_DETAIL`, §19 `MYPAGE`, §20 `RECIPEBOOK_DETAIL`
- `docs/유저flow맵-v1.3.4.md` -- ⑪ 저장/관리 여정, ④ 장보기 기록 재열람
- `docs/api문서-v1.2.5.md` -- §8-3, §12-1, §12-2, §12-6, §12-8
- `docs/db설계-v1.3.3.md` -- `recipe_books`, `recipe_book_items`, `shopping_lists`, `shopping_list_items`
- `docs/design/mobile-ux-rules.md`
- `docs/engineering/qa-system.md`

## QA / Test Data Plan

- fixture baseline:
  - 마이페이지 레시피북 탭에 시스템/커스텀 레시피북이 1개 이상 있다.
  - 마이페이지 장보기 기록 탭에 완료된 shopping list가 1개 이상 있다.
  - 상세 화면은 정상 데이터와 empty/error fixture를 유지한다.
- real DB smoke: API/DB 변경이 없으므로 신규 real DB smoke는 필수 아님. 기존 `17a/17b/10a/12a` 경로의 fixture/browser regression으로 검증한다.
- seed/reset: 신규 seed 없음.
- bootstrap: 시스템 레시피북 row와 완료 장보기 기록은 기존 owning flow 유지.
- blocker 조건:
  - RECIPEBOOK_DETAIL 뒤로가기 시 마이페이지 root/default 상태가 먼저 렌더링됨
  - SHOPPING_DETAIL 뒤로가기 시 마이페이지 root/default 상태가 먼저 렌더링됨
  - return context가 다른 진입 경로의 정상 뒤로가기 동작을 깨뜨림
  - 장보기 기록 read-only 상세가 editable 상태로 바뀜
  - 비로그인/권한 오류 상태가 무한 redirect 또는 잘못된 returnTo를 만든다

### 검증 전략

- targeted Vitest: MyPage에서 상세 링크 생성/return context, detail back action helper
- targeted Playwright: `MYPAGE -> RECIPEBOOK_DETAIL -> back -> MYPAGE recipebook list` 직접 복귀
- targeted Playwright: `MYPAGE shopping history -> SHOPPING_DETAIL -> back -> MYPAGE shopping history` 직접 복귀
- `pnpm verify:frontend`
- `pnpm validate:workflow-v2`
- `pnpm validate:workpack -- --slice design-polish-slice7-mypage-settings-account`
- low-risk skip rationale이 포함된 closeout sync 검증

## Key Rules

1. API/DB 계약을 바꾸지 않는다.
2. 마이페이지 목록에서 상세로 들어갈 때 사용자가 있던 탭/목록 맥락을 보존한다.
3. 상세 화면의 앱 헤더 뒤로가기는 return context가 있으면 그 경로를 우선 사용한다.
4. return context가 없으면 기존 직접 진입/브라우저 history 동작을 유지한다.
5. 장보기 기록에서 연 `SHOPPING_DETAIL`은 read-only 재열람 모드를 유지한다.
6. `MYPAGE`, `RECIPEBOOK_DETAIL`, `SHOPPING_DETAIL`의 loading/empty/error/unauthorized 상태를 회귀시키지 않는다.
7. 새 화면, 새 공용 컴포넌트, 글로벌 디자인 토큰 변경을 추가하지 않는다.

## Contract Evolution Candidates

없음. 공식 문서는 마이페이지에서 레시피북 상세와 장보기 상세로 진입하는 흐름을 이미 정의하고 있으며, 이번 작업은 기존 화면/흐름의 복귀 경험을 안정화하는 구현 polish다.

## Primary User Path

1. 사용자가 `MYPAGE`의 레시피북 탭에서 레시피북 하나를 연다.
2. `RECIPEBOOK_DETAIL`에서 앱 헤더 뒤로가기를 누른다.
3. 앱은 마이페이지 기본 상태를 거치지 않고 레시피북 탭/목록으로 바로 돌아온다.
4. 사용자가 `MYPAGE`의 장보기 기록 탭에서 완료된 장보기 리스트를 다시 연다.
5. `SHOPPING_DETAIL`에서 앱 헤더 뒤로가기를 누르면 장보기 기록 탭/목록으로 바로 돌아온다.

## Delivery Checklist

- [ ] MYPAGE 레시피북 목록에서 RECIPEBOOK_DETAIL 진입 시 return context 보존 <!-- omo:id=dp7-recipebook-return-context;stage=4;scope=frontend;review=6 -->
- [ ] RECIPEBOOK_DETAIL 뒤로가기 시 레시피북 목록 맥락으로 직접 복귀 <!-- omo:id=dp7-recipebook-direct-back;stage=4;scope=frontend;review=6 -->
- [ ] MYPAGE 장보기 기록에서 SHOPPING_DETAIL 진입 시 return context 보존 <!-- omo:id=dp7-shopping-return-context;stage=4;scope=frontend;review=6 -->
- [ ] SHOPPING_DETAIL 뒤로가기 시 장보기 기록 목록 맥락으로 직접 복귀 <!-- omo:id=dp7-shopping-direct-back;stage=4;scope=frontend;review=6 -->
- [ ] 마이페이지 root/default 중간 렌더링 또는 탭 깜빡임 회귀 없음 확인 <!-- omo:id=dp7-no-intermediate-root-flash;stage=4;scope=frontend;review=6 -->
- [ ] 직접 진입 또는 다른 화면 진입의 기존 뒤로가기 fallback 유지 <!-- omo:id=dp7-back-fallback-preserved;stage=4;scope=frontend;review=6 -->
- [ ] `loading / empty / error / read-only / unauthorized` 상태 회귀 없음 확인 <!-- omo:id=dp7-state-ui-preserved;stage=4;scope=frontend;review=6 -->
- [ ] targeted Vitest / Playwright 라우팅 회귀 테스트 통과 <!-- omo:id=dp7-targeted-tests;stage=4;scope=frontend;review=6 -->
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm verify:frontend` 통과 <!-- omo:id=dp7-frontend-verification;stage=4;scope=frontend;review=6 -->

