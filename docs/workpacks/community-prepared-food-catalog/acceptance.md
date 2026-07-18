# Acceptance Checklist

> Stage 6 merge 시 `Manual Only`를 제외한 In Scope 항목을 모두 닫는다. 결측은 0이 아니며 production/staging write는 별도 승인 전 수행하지 않는다.

## Search / Source Projection

- [x] `GET /food-products`가 `source=all|public_dataset|manual`만 받고 생략은 all이다 <!-- omo:id=accept-community-source-filter;stage=2;scope=backend;review=3,6 -->
- [x] visible public dataset → visible shared manual → self legacy private 순서와 opaque cursor가 결정적이다 <!-- omo:id=accept-community-search-order;stage=2;scope=backend;review=3,6 -->
- [x] other-user private, hidden, deleted 제품은 검색에 나타나지 않는다 <!-- omo:id=accept-community-search-scope;stage=2;scope=backend;review=3,6 -->
- [x] 응답은 공식 field만 사용하고 owner/moderation/stable key를 노출하지 않는다 <!-- omo:id=accept-community-response-shape;stage=2;scope=shared;review=3,6 -->
- [ ] public/manual/private badge가 각각 `공공 영양DB / 사용자 등록 / 비공개 보관`이다 <!-- omo:id=accept-community-source-badges;stage=4;scope=frontend;review=5,6 -->

## Shared Manual Create

- [x] 신규 manual은 server가 public/manual/visible/auth owner로 원자 생성한다 <!-- omo:id=accept-community-public-manual-create;stage=2;scope=backend;review=3,6 -->
- [x] client authority field와 basis_relations 입력은 422로 거부된다 <!-- omo:id=accept-community-authority-field-reject;stage=2;scope=backend;review=3,6 -->
- [x] basis amount는 양수, unit은 g/ml만이고 label_basis_text는 optional이다 <!-- omo:id=accept-community-create-basis;stage=2;scope=shared;review=3,6 -->
- [x] energy는 필수 nonnegative이고 optional null/missing을 0으로 저장하지 않는다 <!-- omo:id=accept-community-create-nutrients;stage=2;scope=backend;review=3,6 -->
- [x] 첫 profile/value/version/current pointer가 한 transaction이며 실패 시 partial row가 없다 <!-- omo:id=accept-community-create-atomic;stage=2;scope=backend;review=3,6 -->
- [ ] form에 공동 공개와 owner-only 수정·삭제 안내가 저장 전 보인다 <!-- omo:id=accept-community-create-notice;stage=4;scope=frontend;review=5,6 -->

## Edit / Delete / Legacy

- [x] owner visible manual만 수정·soft-delete할 수 있다 <!-- omo:id=accept-community-owner-edit-delete;stage=2;scope=backend;review=3,6 -->
- [x] public dataset, 다른 사용자, owner-null anonymized shared manual mutation은 403이다 <!-- omo:id=accept-community-readonly-mutation-denied;stage=2;scope=backend;review=3,6 -->
- [x] hidden_by_report/operator 제품은 owner도 409 PRODUCT_MODERATION_LOCKED다 <!-- omo:id=accept-community-moderation-lock;stage=2;scope=shared;review=3,6 -->
- [x] nutrition PATCH는 immutable version append, metadata-only PATCH는 current version 유지다 <!-- omo:id=accept-community-versioning;stage=2;scope=backend;review=3,6 -->
- [x] DELETE는 visible owner row에서 멱등하며 old version과 existing entry pin을 보존한다 <!-- omo:id=accept-community-delete-pin-retention;stage=2;scope=backend;review=3,6 -->
- [x] legacy private row는 자동 공개되지 않고 owner에게만 보인다 <!-- omo:id=accept-community-legacy-private;stage=2;scope=shared;review=3,6 -->
- [x] anonymized public manual은 read-only public catalog row로 남는다 <!-- omo:id=accept-community-anonymized-public;stage=2;scope=shared;review=3,6 -->
- [x] `DELETE /users/me`가 shared public manual owner를 null로 익명화하고 제품/version/pin을 보존한다 <!-- omo:id=accept-community-account-delete-anonymize;stage=2;scope=backend;review=3,6 -->
- [x] 익명화와 개인 데이터 삭제는 fail-closed transaction이며 partial deletion을 남기지 않는다 <!-- omo:id=accept-community-account-delete-atomic;stage=2;scope=backend;review=3,6 -->
- [ ] SETTINGS 탈퇴 확인이 shared manual의 익명 read-only 보존과 기존 식단 보호를 안내한다 <!-- omo:id=accept-community-account-delete-notice;stage=4;scope=frontend;review=5,6 -->

## Report / Moderation

- [x] report reason은 정확히 spam/incorrect_nutrition/duplicate/rights/unsafe/other다 <!-- omo:id=accept-community-report-reasons;stage=2;scope=shared;review=3,6 -->
- [x] detail_text는 optional이며 report는 append-only pending row로 생성된다 <!-- omo:id=accept-community-report-append-only;stage=2;scope=backend;review=3,6 -->
- [x] self report는 403, duplicate는 409 PRODUCT_ALREADY_REPORTED다 <!-- omo:id=accept-community-report-self-duplicate;stage=2;scope=backend;review=3,6 -->
- [x] public dataset/private/hidden/deleted report는 409 PRODUCT_REPORT_NOT_ALLOWED다 <!-- omo:id=accept-community-report-ineligible;stage=2;scope=backend;review=3,6 -->
- [x] reporter는 status/reviewer/moderation을 수정할 수 없고 operator HTTP endpoint가 추가되지 않는다 <!-- omo:id=accept-community-report-operator-boundary;stage=2;scope=backend;review=3,6 -->
- [ ] UI는 other-user/anonymized visible manual에만 신고를 노출하고 six reason과 retry를 제공한다 <!-- omo:id=accept-community-report-ui;stage=4;scope=frontend;review=5,6 -->

## Planner / Pin Regression

- [x] hidden product 신규 add는 409 PRODUCT_HIDDEN, deleted는 409 PRODUCT_DELETED다 <!-- omo:id=accept-community-planner-admission;stage=2;scope=backend;review=3,6 -->
- [x] hidden/deleted/update 후 existing planner name/nutrition version pin이 변하지 않는다 <!-- omo:id=accept-community-existing-pin-stable;stage=2;scope=backend;review=3,6 -->
- [x] product는 Meal status, shopping, cooking, leftover, recipe XP/activity에 들어가지 않는다 <!-- omo:id=accept-community-domain-exclusion;stage=2;scope=shared;review=3,6 -->
- [ ] relation 없는 serving/package legacy product를 100g/100mL로 추정하지 않는다 <!-- omo:id=accept-community-no-basis-inference;stage=4;scope=frontend;review=5,6 -->
- [ ] picker/planner의 g/ml 수량은 기본 100, 1g/1mL step을 유지하며 create prefill을 공식 계약으로 오인하지 않는다 <!-- omo:id=accept-community-gml-default-step;stage=4;scope=frontend;review=5,6 -->

## Error / State / Accessibility

- [ ] loading, initial/pagination pending, empty 상태가 구분된다 <!-- omo:id=accept-community-loading-empty;stage=4;scope=frontend;review=5,6 -->
- [ ] search/create/edit/delete/report/add 오류가 context와 draft를 보존하고 retry를 제공한다 <!-- omo:id=accept-community-error-recovery;stage=4;scope=frontend;review=5,6 -->
- [ ] unauthorized 후 query/source/date/column/selection/draft return-to-action이 복구된다 <!-- omo:id=accept-community-return-to-action;stage=4;scope=frontend;review=5,6 -->
- [ ] read-only와 선택 불가를 혼동하지 않고 owner actions/report event bubbling을 막는다 <!-- omo:id=accept-community-readonly-actions;stage=4;scope=frontend;review=5,6 -->
- [ ] 390/320/1280에서 overflow, sticky CTA, 44px target, keyboard/focus/safe-area가 검증된다 <!-- omo:id=accept-community-responsive-a11y;stage=4;scope=frontend;review=5,6 -->

## Security / DB / Performance

- [x] CHECK/RLS/privilege가 public/manual/private/moderation/owner 조합과 cross-owner denial을 고정한다 <!-- omo:id=accept-community-rls-constraints;stage=2;scope=backend;review=3,6 -->
- [x] food_product_reports unique/reason/status/reviewer constraints와 append-only 권한이 적용된다 <!-- omo:id=accept-community-report-db;stage=2;scope=backend;review=3,6 -->
- [x] list scope/filter/order/pagination이 SQL 단계에서 적용되고 item별 N+1이 없다 <!-- omo:id=accept-community-query-performance;stage=2;scope=backend;review=3,6 -->
- [x] secret/auth query/cookie/raw provider row/private path 노출이 0이다 <!-- omo:id=accept-community-secret-raw-zero;stage=2;scope=backend;review=3,6 -->
- [x] production/staging/provider write는 별도 승인 전 0이다 <!-- omo:id=accept-community-external-write-zero;stage=2;scope=backend;review=3,6 -->

## Data Setup / Real DB

- [x] A/B/public/shared/anonymized/private/hidden/deleted deterministic fixtures가 준비된다 <!-- omo:id=accept-community-fixtures;stage=2;scope=shared;review=3,6 -->
- [x] isolated PostgreSQL에서 constraints/RLS/RPC/version/pin/report/concurrency/rollback을 검증한다 <!-- omo:id=accept-community-postgres;stage=2;scope=backend;review=3,6 -->
- [x] fresh local Supabase에서 migration stack, auth A/B, PostgREST wrapper와 RLS를 검증한다 <!-- omo:id=accept-community-local-supabase;stage=2;scope=shared;review=3,6 -->
- [ ] real browser가 같은 local DB를 사용해 create→other-user search/report/add→owner edit/delete→account deletion notice/익명화 흐름을 검증한다 <!-- omo:id=accept-community-real-browser;stage=4;scope=frontend;review=5,6 -->

## Automation Split

### Vitest / PostgreSQL

- [x] parser/source filter/response/error/owner/report policy unit tests가 있다 <!-- omo:id=accept-community-vitest;stage=2;scope=backend;review=3,6 -->
- [x] real DB RLS, report uniqueness, immutable version, pin preservation integration이 있다 <!-- omo:id=accept-community-db-integration;stage=2;scope=backend;review=3,6 -->

### Playwright / Authority

- [ ] picker/create/edit/delete/report/add와 auth/error/moderation race Playwright가 있다 <!-- omo:id=accept-community-playwright;stage=4;scope=frontend;review=5,6 -->
- [ ] exploratory QA와 qa eval report가 있다 <!-- omo:id=accept-community-exploratory;stage=4;scope=frontend;review=5,6 -->
- [ ] 390/320/1280 before/after와 authority blocker 0 report가 있다 <!-- omo:id=accept-community-authority;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [ ] production/staging migration·promotion·provider write는 별도 사용자/운영 승인 후에만 수행한다
- [ ] 실제 물리 기기, screen reader, production-scale query는 최종 release QA에서 별도 확인한다
