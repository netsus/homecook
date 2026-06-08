# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Happy Path

- [ ] `MYPAGE` 레시피북 목록이 책장/책 표지 형태로 표시된다 <!-- omo:id=accept-mypage-bookshelf;stage=4;scope=frontend;review=5,6 -->
- [ ] 레시피북 생성/수정/삭제와 상세 진입은 기존 `17a` 동작을 유지한다 <!-- omo:id=accept-mypage-crud-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] `RECIPEBOOK_DETAIL` desktop은 왼쪽 목차/책 정보 rail과 오른쪽 레시피 영역이 분리되어 있다 <!-- omo:id=accept-detail-desktop-split;stage=4;scope=frontend;review=5,6 -->
- [ ] `RECIPEBOOK_DETAIL` mobile은 표지/요약 + 섹션/레시피 카드 흐름으로 표시된다 <!-- omo:id=accept-detail-mobile-flow;stage=4;scope=frontend;review=5,6 -->
- [ ] 레시피 카드 클릭은 기존 `RECIPE_DETAIL`로 이동한다 <!-- omo:id=accept-recipe-click-detail-route;stage=4;scope=frontend;review=5,6 -->
- [ ] 저장 책 제거와 liked 책 좋아요 해제는 기존 `17b` 동작을 유지한다 <!-- omo:id=accept-remove-unlike-preserved;stage=4;scope=frontend;review=5,6 -->

## Contract Preservation

- [ ] 새 API endpoint가 추가되지 않는다 <!-- omo:id=accept-no-new-api;stage=4;scope=shared;review=5,6 -->
- [ ] DB schema, seed, enum, recipebook type이 변경되지 않는다 <!-- omo:id=accept-no-db-change;stage=4;scope=shared;review=5,6 -->
- [ ] 삭제된 `DELETE /recipes/{id}/save` endpoint를 되살리지 않는다 <!-- omo:id=accept-no-deleted-endpoint-revival;stage=4;scope=shared;review=5,6 -->
- [ ] `GET /api/v1/recipe-books/{book_id}/recipes`가 레시피북 상세 목록 source로 유지된다 <!-- omo:id=accept-recipebook-list-source;stage=4;scope=frontend;review=5,6 -->
- [ ] 책 안 preview 목적으로 `GET /api/v1/recipes/{id}`를 자동 호출하지 않는다 <!-- omo:id=accept-no-hidden-view-count-fetch;stage=4;scope=frontend;review=5,6 -->
- [ ] full page-turn reader는 공식 계약 변경 전까지 구현하지 않는다 <!-- omo:id=accept-full-reader-out-of-scope;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [ ] 시스템 책과 커스텀 책의 표시/액션 정책이 기존 계약과 일치한다 <!-- omo:id=accept-book-type-policy;stage=4;scope=frontend;review=5,6 -->
- [ ] `saved/custom` 제거와 `liked` unlike 분기가 기존 정책과 일치한다 <!-- omo:id=accept-remove-policy;stage=4;scope=frontend;review=5,6 -->
- [ ] `my_added` 책의 제거 불가 정책을 완화하지 않는다 <!-- omo:id=accept-my-added-policy;stage=4;scope=frontend;review=5,6 -->
- [ ] read-only 또는 제거 불가 상태가 사용자가 이해할 수 있게 표시된다 <!-- omo:id=accept-readonly-copy;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [ ] `MYPAGE`와 `RECIPEBOOK_DETAIL` loading 상태가 layout shift 없이 표시된다 <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [ ] 레시피북 목록 empty와 책 안 레시피 empty 상태가 구분된다 <!-- omo:id=accept-empty;stage=4;scope=frontend;review=5,6 -->
- [ ] 목록/상세 fetch 실패 error 상태가 있다 <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [ ] 비로그인 접근 시 unauthorized/login gate와 return-to-action이 유지된다 <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [ ] 삭제/제거 중 실패 상태가 기존 방식으로 복구된다 <!-- omo:id=accept-action-error-recovery;stage=4;scope=frontend;review=5,6 -->

## Responsive / Accessibility

- [ ] desktop 1440에서 오른쪽 레시피 영역이 좁게 눌리지 않는다 <!-- omo:id=accept-desktop-readable-width;stage=4;scope=frontend;review=5,6 -->
- [ ] mobile 390과 320에서 page-level horizontal overflow가 없다 <!-- omo:id=accept-mobile-no-overflow;stage=4;scope=frontend;review=5,6 -->
- [ ] mobile 320에서 책 제목, 레시피명, count, 액션이 겹치지 않는다 <!-- omo:id=accept-mobile-text-fit;stage=4;scope=frontend;review=5,6 -->
- [ ] 주요 touch target은 최소 44px 이상이다 <!-- omo:id=accept-touch-target;stage=4;scope=frontend;review=5,6 -->
- [ ] 목차/책장/레시피 목록은 keyboard와 screen reader로 탐색 가능하다 <!-- omo:id=accept-accessible-navigation;stage=4;scope=frontend;review=5,6 -->
- [ ] page-turn/book effect가 유일한 navigation 수단이 아니다 <!-- omo:id=accept-effect-not-only-navigation;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [ ] fixture에 시스템 책, 커스텀 책, empty 책, 다수 레시피 책이 준비되어 있다 <!-- omo:id=accept-fixture-books;stage=4;scope=shared;review=5,6 -->
- [ ] 긴 레시피북 이름/레시피명 fixture가 있다 <!-- omo:id=accept-fixture-long-text;stage=4;scope=shared;review=5,6 -->
- [ ] real DB smoke는 기존 `17a/17b` owning flow와 충돌하지 않는다 <!-- omo:id=accept-real-db-smoke-scope;stage=4;scope=shared;review=5,6 -->

## Manual QA

- verifier: Stage 5/6 Codex verifier
- environment:
  - local dev 또는 preview URL
  - desktop 1440
  - mobile 390
  - mobile 320
- scenarios:
  - `MYPAGE`에서 시스템/커스텀 책장 스캔
  - 커스텀 책 생성/이름 변경/삭제
  - 레시피북 상세 진입 후 desktop split 확인
  - mobile 상세에서 표지/요약/목록 흐름 확인
  - 레시피 클릭 후 기존 상세 이동 확인
  - saved/custom 제거와 liked unlike 확인
  - long text, empty, error, unauthorized 상태 확인

## Automation Split

### Vitest

- [ ] `MYPAGE` 책장 rendering과 CRUD action discoverability를 검증한다 <!-- omo:id=accept-vitest-mypage;stage=4;scope=frontend;review=5,6 -->
- [ ] `RECIPEBOOK_DETAIL` desktop/mobile layout state와 remove action을 검증한다 <!-- omo:id=accept-vitest-detail;stage=4;scope=frontend;review=5,6 -->
- [ ] hidden `GET /api/v1/recipes/{id}` preview 호출이 없음을 검증한다 <!-- omo:id=accept-vitest-no-hidden-detail-fetch;stage=4;scope=frontend;review=5,6 -->

### Playwright

- [ ] desktop 1440에서 shelf와 detail split screenshot evidence를 확보한다 <!-- omo:id=accept-playwright-desktop;stage=4;scope=frontend;review=5,6 -->
- [ ] mobile 390에서 no overflow, tap target, text fit을 확인한다 <!-- omo:id=accept-playwright-mobile;stage=4;scope=frontend;review=5,6 -->
- [ ] mobile 320에서 narrow layout을 확인한다 <!-- omo:id=accept-playwright-mobile-narrow;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 `MYPAGE -> RECIPEBOOK_DETAIL -> RECIPE_DETAIL` route flow를 검증한다 <!-- omo:id=accept-playwright-route-flow;stage=4;scope=frontend;review=5,6 -->

### Design Authority / Exploratory QA

- [ ] `ui/designs/authority/RECIPEBOOK_DIARY_PORT-authority.md`를 생성하고 blocker 0개를 확인한다 <!-- omo:id=accept-authority-report;stage=5;scope=frontend;review=6 -->
- [ ] high-risk UI 변경 기준의 exploratory QA/eval을 수행한다 <!-- omo:id=accept-exploratory-qa;stage=5;scope=frontend;review=6 -->

### Manual Only

- [ ] full page-turn reader UX 채택 여부는 별도 사용자 승인과 contract-evolution이 필요하다
