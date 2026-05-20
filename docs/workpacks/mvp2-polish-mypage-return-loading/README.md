# Slice: mvp2-polish-mypage-return-loading

## Goal

마이페이지 진입 시 로딩 헤더의 "마이페이지" 텍스트가 중앙에서 좌측으로 이동하는 레이아웃 불안정을 제거하고, 레시피북 상세/장보기 상세에서 뒤로가기 시 마이페이지 홈이 잠깐 보이는 flash 현상을 수정하며, 장보기 상세 초기 로딩에 skeleton UI를 도입해 마이페이지 하위 화면의 navigation/loading 품질을 안정화한다.

## Branches

- 백엔드: N/A (FE-only navigation/loading polish)
- 프론트엔드: `feature/fe-mvp2-polish-mypage-return-loading`

## In Scope

- 화면: `MYPAGE`, `RECIPEBOOK_DETAIL`, `SHOPPING_DETAIL`
- API: 기존 API 소비만 유지
  - `GET /users/me`
  - `GET /recipe-books`
  - `GET /recipe-books/{id}/recipes`
  - `GET /shopping/lists`
  - `GET /shopping/lists/{id}`
- 상태 전이: 없음. 화면 복귀/라우팅 상태와 loading skeleton 표현만 다룬다.
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
- 데스크톱 전용 레이아웃 변경 (모바일 우선, 데스크톱은 동일 이슈가 있는 경우만 함께 수정)

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `17a-mypage-overview-history` | merged | [x] |
| `17b-recipebook-detail-remove` | merged | [x] |
| `17c-settings-account` | merged | [x] |
| `10a-shopping-detail-interact` | merged | [x] |
| `12a-shopping-complete` | merged | [x] |
| `design-polish-slice7-mypage-settings-account` | merged | [x] |

## Classification

- **UI risk: `low-risk-ui-change`**
- 이유: 기존 confirmed 화면의 정보 구조, layout, CTA, modal/sheet 패턴을 바꾸지 않는다. 헤더 loading 레이아웃 안정화, return context 복귀 로직 보정, skeleton 추가는 기존 화면의 동작 polish다. 새 화면, 새 공용 컴포넌트, anchor screen 변경은 없다.
- Anchor screen dependency: 없음 (`HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK` 직접 변경 없음)
- design-generator / design-critic: 생략. 기존 확정 화면의 시각 구조 변경이 아니며, loading/skeleton 개선은 Playwright/Vitest로 회귀 잠금한다.
- product-design-authority: not-required. Screenshot authority 대신 browser flow evidence와 skeleton rendering evidence로 검증한다.

## User Finding

수동 리뷰에서 발견된 4가지 마이페이지 navigation/loading regression:

1. **마이페이지 진입 시 헤더 정렬 불안정**: 마이페이지로 이동할 때 loading 상태에서 "마이페이지" 텍스트가 중앙 정렬로 표시되었다가 데이터 로드 후 좌측 정렬로 이동한다. loading과 ready 상태의 헤더 레이아웃이 일치해야 한다.
2. **레시피북 상세 뒤로가기 flash**: 마이페이지 > 레시피북 목록 > 레시피북 상세에서 뒤로가기를 누르면 마이페이지 홈이 잠깐 보인 뒤 레시피북 목록으로 이동한다. 레시피북 목록으로 직접 복귀해야 한다.
3. **장보기 상세 뒤로가기 flash**: 마이페이지 > 장보기 기록 > 장보기 상세에서 뒤로가기를 누르면 마이페이지 홈이 잠깐 보인 뒤 장보기 기록으로 이동한다. 장보기 기록으로 직접 복귀해야 한다.
4. **장보기 상세 로딩 skeleton 부재**: 마이페이지 > 장보기 기록 > 장보기 상세 진입 시 loading 화면이 generic 표현이다. 장보기 상세에 맞는 skeleton UI를 사용해야 한다.

## Affected Components

| Component | File 후보 | 변경 사유 |
| --- | --- | --- |
| MyPage screen | `components/mypage/mypage-screen.tsx`, `components/mypage/mypage-mobile-screen.tsx` | loading 헤더 정렬 안정화, return context 복귀 |
| MyPage loading skeleton | `components/mypage/mypage-screen.tsx` `MypageLoadingSkeleton` | loading 헤더가 ready 상태와 동일 레이아웃 유지 |
| Recipe book detail | `components/recipebook/recipebook-detail-screen.tsx`, `app/mypage/recipe-books/[book_id]/page.tsx` | 뒤로가기 시 레시피북 목록 맥락으로 직접 복귀 |
| Shopping detail | `components/shopping/*`, `app/shopping/lists/[list_id]/page.tsx` | 마이페이지 장보기 기록 경유 상세에서 목록 맥락으로 직접 복귀, skeleton UI 추가 |
| Navigation helper | `lib/navigation/return-context.ts`, `lib/navigation/mypage-return-state.ts` | 기존 return-to-action/returnTo 패턴 보정 |
| MobileAppBar | `components/shared/*` | loading/ready 시 헤더 title alignment 일관성 |
| Tests | `tests/*mypage*`, `tests/*recipebook*`, `tests/*shopping*`, `tests/e2e/*` | 직접 복귀, 헤더 안정성, skeleton 렌더링 회귀 고정 |

## Backend First Contract

- Backend 변경 없음.
- 기존 응답 래퍼 `{ success, data, error }` 소비 방식 유지.
- `GET /recipe-books`, `GET /recipe-books/{id}/recipes`, `GET /shopping/lists`, `GET /shopping/lists/{id}`의 request/response/error 계약을 바꾸지 않는다.
- 권한/소유자 검증은 기존 API가 담당한다. 프론트는 unauthorized/error state를 기존 방식으로 표시한다.
- 멱등성 변경 없음. 이번 slice에는 mutation, complete, cancel 성 API가 없다.
- 장보기 기록에서 열린 `SHOPPING_DETAIL`은 완료 리스트 read-only 재열람 정책을 유지한다.

## Frontend Delivery Mode

- 디자인 상태: 기존 confirmed 화면의 low-risk navigation/loading polish
- 필수 상태:
  - `loading`: 마이페이지 헤더/본문, 레시피북 상세, 장보기 상세 로딩 유지 (헤더 정렬 안정화, 장보기 상세 skeleton 추가)
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
- Notes: 화면 구조, 시각 위계, 컴포넌트 형태를 바꾸지 않는 loading/navigation behavior fix다. 헤더 정렬 안정화와 skeleton 추가는 기존 디자인 패턴을 따르며 시각적 판단이 필요한 수준이 아니다. Stage 5는 생략하고 Stage 6에서 lightweight design check로 흡수한다.

## Design Status

- [ ] 임시 UI (temporary)
- [ ] 리뷰 대기 (pending-review)
- [x] 확정 (confirmed) -- 기존 confirmed 화면 유지. 시각 구조 변경 없음
- [ ] N/A

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/17a-mypage-overview-history/README.md`
- `docs/workpacks/17b-recipebook-detail-remove/README.md`
- `docs/workpacks/10a-shopping-detail-interact/README.md`
- `docs/workpacks/12a-shopping-complete/README.md`
- `docs/workpacks/design-polish-slice7-mypage-settings-account/README.md`
- `docs/요구사항기준선-v1.6.7.md` -- MYPAGE, RECIPEBOOK_DETAIL, SHOPPING_DETAIL 관련
- `docs/화면정의서-v1.5.4.md` -- §12 `SHOPPING_DETAIL`, §19 `MYPAGE`, §20 `RECIPEBOOK_DETAIL`
- `docs/유저flow맵-v1.3.4.md` -- 저장/관리 여정, 장보기 기록 재열람
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
  - 마이페이지 loading 헤더와 ready 헤더의 title alignment가 다르다
  - RECIPEBOOK_DETAIL 뒤로가기 시 마이페이지 root/default 상태가 먼저 렌더링됨
  - SHOPPING_DETAIL 뒤로가기 시 마이페이지 root/default 상태가 먼저 렌더링됨
  - SHOPPING_DETAIL loading 상태가 generic spinner이고 skeleton이 아니다
  - return context가 다른 진입 경로의 정상 뒤로가기 동작을 깨뜨림
  - 장보기 기록 read-only 상세가 editable 상태로 바뀜
  - 비로그인/권한 오류 상태가 무한 redirect 또는 잘못된 returnTo를 만든다

### 검증 전략

- targeted Vitest: MyPage 로딩 상태 헤더 정렬, 상세 링크 생성/return context, detail back action helper
- targeted Vitest: Shopping detail skeleton rendering
- targeted Playwright: `MYPAGE` 진입 시 loading → ready 헤더 title alignment 일관성
- targeted Playwright: `MYPAGE -> RECIPEBOOK_DETAIL -> back -> MYPAGE recipebook list` 직접 복귀
- targeted Playwright: `MYPAGE shopping history -> SHOPPING_DETAIL -> back -> MYPAGE shopping history` 직접 복귀
- targeted Playwright: `SHOPPING_DETAIL` loading 시 skeleton UI 렌더링 확인
- `pnpm verify:frontend`
- `pnpm validate:workflow-v2`
- `pnpm validate:workpack -- --slice mvp2-polish-mypage-return-loading`
- low-risk skip rationale이 포함된 closeout sync 검증

## Key Rules

1. API/DB 계약을 바꾸지 않는다.
2. 마이페이지 loading 헤더와 ready 헤더의 title 위치/정렬이 동일해야 한다.
3. 마이페이지 목록에서 상세로 들어갈 때 사용자가 있던 탭/목록 맥락을 보존한다.
4. 상세 화면의 앱 헤더 뒤로가기는 return context가 있으면 그 경로를 우선 사용한다.
5. return context가 없으면 기존 직접 진입/브라우저 history 동작을 유지한다.
6. 장보기 기록에서 연 `SHOPPING_DETAIL`은 read-only 재열람 모드를 유지한다.
7. 장보기 상세 loading 상태는 화면 구조에 맞는 skeleton UI를 사용한다.
8. `MYPAGE`, `RECIPEBOOK_DETAIL`, `SHOPPING_DETAIL`의 empty/error/unauthorized 상태를 회귀시키지 않는다.
9. 새 화면, 새 공용 컴포넌트, 글로벌 디자인 토큰 변경을 추가하지 않는다.
10. `design-polish-slice7-mypage-settings-account`에서 이미 수정한 return context 로직이 있으면 그 구현 위에서 보정한다.

## Contract Evolution Candidates

없음. 공식 문서는 마이페이지, 레시피북 상세, 장보기 상세 화면을 이미 정의하고 있으며, 이번 작업은 loading/navigation 동작의 구현 polish다.

## Primary User Path

1. 사용자가 하단 탭 또는 메뉴에서 `MYPAGE`로 이동한다.
2. loading 상태의 헤더에 "마이페이지" 텍스트가 좌측 정렬로 안정적으로 표시된다 (중앙→좌측 이동 없음).
3. 사용자가 레시피북 탭에서 레시피북 하나를 연다.
4. `RECIPEBOOK_DETAIL`에서 앱 헤더 뒤로가기를 누르면 마이페이지 기본 화면을 거치지 않고 레시피북 탭/목록으로 바로 돌아온다.
5. 사용자가 장보기 기록 탭에서 완료된 장보기 리스트를 다시 연다.
6. `SHOPPING_DETAIL` loading 시 장보기 상세에 맞는 skeleton이 표시된다.
7. `SHOPPING_DETAIL`에서 앱 헤더 뒤로가기를 누르면 장보기 기록 탭/목록으로 바로 돌아온다.

## Delivery Checklist

- [x] MYPAGE loading 헤더 title alignment이 ready 상태와 일치 <!-- omo:id=mvp2-mypage-header-alignment;stage=4;scope=frontend;review=6 -->
- [x] MYPAGE 레시피북 목록에서 RECIPEBOOK_DETAIL 진입 시 return context 보존 <!-- omo:id=mvp2-recipebook-return-context;stage=4;scope=frontend;review=6 -->
- [x] RECIPEBOOK_DETAIL 뒤로가기 시 레시피북 목록 맥락으로 직접 복귀 <!-- omo:id=mvp2-recipebook-direct-back;stage=4;scope=frontend;review=6 -->
- [x] MYPAGE 장보기 기록에서 SHOPPING_DETAIL 진입 시 return context 보존 <!-- omo:id=mvp2-shopping-return-context;stage=4;scope=frontend;review=6 -->
- [x] SHOPPING_DETAIL 뒤로가기 시 장보기 기록 목록 맥락으로 직접 복귀 <!-- omo:id=mvp2-shopping-direct-back;stage=4;scope=frontend;review=6 -->
- [x] 마이페이지 root/default 중간 렌더링 또는 탭 깜빡임 회귀 없음 확인 <!-- omo:id=mvp2-no-intermediate-root-flash;stage=4;scope=frontend;review=6 -->
- [x] SHOPPING_DETAIL loading 상태가 skeleton UI를 사용 <!-- omo:id=mvp2-shopping-detail-skeleton;stage=4;scope=frontend;review=6 -->
- [x] 직접 진입 또는 다른 화면 진입의 기존 뒤로가기 fallback 유지 <!-- omo:id=mvp2-back-fallback-preserved;stage=4;scope=frontend;review=6 -->
- [x] `loading / empty / error / read-only / unauthorized` 상태 회귀 없음 확인 <!-- omo:id=mvp2-state-ui-preserved;stage=4;scope=frontend;review=6 -->
- [x] targeted Vitest / Playwright 라우팅/skeleton 회귀 테스트 통과 <!-- omo:id=mvp2-targeted-tests;stage=4;scope=frontend;review=6 -->
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm verify:frontend` 통과 <!-- omo:id=mvp2-frontend-verification;stage=4;scope=frontend;review=6 -->
