# Acceptance Checklist: 34c-growth-notification-ui

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> 34c는 FE-only slice이므로 backend 구현 항목은 N/A이며, Stage 6 merge 시점에 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `automation-spec.json`을 함께 쓰는 슬라이스이므로 `Manual Only`를 제외한 각 체크박스 끝에 `omo` metadata를 유지한다.
> Claude가 rebuttal을 수용해 닫은 항목은 checkbox를 유지한 채 `waived=true;waived_by=claude;waived_stage=<5|6>;waived_reason=<slug>` metadata를 추가한다.

## Happy Path

- [x] source action 성공 후 toast stack이 `priority_unseen` 서버 정렬 순서 그대로 표시된다 (`level_up > achievement_unlocked/badge_unlocked > xp_awarded`) <!-- omo:id=accept-priority-order-display;stage=4;scope=frontend;review=5,6 -->
- [x] visible toast가 mobile 최대 2개, desktop 최대 3개로 제한되고 초과분은 queue/collapse로 유실 없이 대기한다 <!-- omo:id=accept-visible-max;stage=4;scope=frontend;review=5,6 -->
- [x] `level_up` toast가 `xp_awarded`보다 강한 시각 강도(아이콘/색/강조)로 표시되고 stack에서 가장 먼저 보인다 <!-- omo:id=accept-levelup-emphasis;stage=4;scope=frontend;review=5,6 -->
- [x] 같은 `group_key` 알림이 stack에서 인접/묶음으로 표시되어 다른 source action 알림과 혼동되지 않는다 <!-- omo:id=accept-group-key-cohesion;stage=4;scope=frontend;review=5,6 -->
- [x] MYPAGE 최근 성장 기록 preview에서 보관함 surface로 진입해 live non-silent notification을 최신순으로 조회할 수 있다 <!-- omo:id=accept-archive-entry;stage=4;scope=frontend;review=5,6 -->
- [x] 보관함이 cursor pagination(`next_cursor`/`has_next`)으로 다음 페이지를 이어서 불러온다 <!-- omo:id=accept-archive-pagination-ui;stage=4;scope=frontend;review=5,6 -->
- [x] 장보기 안내 문구 `여러 끼니를 한번에 장보기할 수 있어요`가 SHOPPING_FLOW intro/empty/preview 중 1곳 이상에 정확히 표시된다 <!-- omo:id=accept-shopping-copy;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [x] 렌더링된 toast 또는 사용자가 의도적으로 닫은/collapse한 notification id만 `POST /api/v1/users/me/gamification/notifications/seen`으로 멱등 처리된다 <!-- omo:id=accept-seen-rendered-only;stage=4;scope=frontend;review=5,6 -->
- [x] queue에만 있고 렌더링되지 않은 unseen notification은 seen 처리되지 않고 다음 표시/보관함에 남는다 <!-- omo:id=accept-unrendered-stays-unseen;stage=4;scope=frontend;review=5,6 -->
- [x] 클라이언트가 priority를 재계산/재정렬하지 않는다 (서버 순서 소비만) <!-- omo:id=accept-no-client-priority-recompute;stage=4;scope=frontend;review=5,6 -->
- [x] source action 5종(레시피 저장, 커스텀 레시피북 생성, 장보기 완료, 요리 완료, 플래너 등록) 성공 후 notification refresh가 호출되고, 표시할 알림이 없으면 조용히 종료된다 <!-- omo:id=accept-five-triggers;stage=4;scope=frontend;review=5,6 -->
- [x] backfill/legacy 사용자 상태(기존 unseen 0, historical row 없음)에서 첫 로그인/MYPAGE 진입 시 과거 toast burst가 없다 <!-- omo:id=accept-no-backfill-burst;stage=4;scope=frontend;review=5,6 -->
- [x] `silent` notification은 toast/preview/보관함 어디에도 노출되지 않는다 <!-- omo:id=accept-silent-excluded;stage=4;scope=frontend;review=5,6 -->
- [x] seen 처리된 알림이 toast로 재표시되지 않되 보관함에는 유지된다 (`seen_at` ≠ 삭제) <!-- omo:id=accept-seen-stays-in-archive;stage=4;scope=frontend;review=5,6 -->
- [x] 장보기 quest/copy가 리스트 완료 기준과 끼니 묶음 기준을 한 문구/수치에서 섞지 않는다 (`장보기 완료 N회` 류 모호 문구 금지) <!-- omo:id=accept-list-bundle-copy-split;stage=4;scope=frontend;review=5,6 -->
- [x] backend public contract(endpoint/response/DB)가 변경되지 않았다 <!-- omo:id=accept-no-contract-change;stage=4;scope=shared;review=6 -->

## Error / Permission

- [x] 보관함 loading 상태(skeleton)가 있다 <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [x] 보관함 empty 상태가 있다 (신규 사용자 안내 문구) <!-- omo:id=accept-empty;stage=4;scope=frontend;review=5,6 -->
- [x] gamification/archive fetch 실패 시 해당 영역만 soft-fail하고 MYPAGE core·33b progress·33c surface는 유지된다 <!-- omo:id=accept-error-soft-fail;stage=4;scope=frontend;review=5,6 -->
- [x] seen API 실패가 source action 성공/완료 UI를 되돌리거나 에러로 바꾸지 않는다 <!-- omo:id=accept-seen-failure-isolated;stage=4;scope=frontend;review=5,6 -->
- [x] 비로그인 상태에서 gamification/archive API를 호출하지 않고 기존 auth gate를 따른다 <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [x] 보관함은 read-only이며 claim/삭제 CTA가 없다 <!-- omo:id=accept-read-only;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [x] seen 요청에 본인 notification id만 포함되고, 중복/재호출에도 UI 상태가 꼬이지 않는다 <!-- omo:id=accept-seen-idempotent-ui;stage=4;scope=frontend;review=5,6 -->
- [x] `priority_unseen` 필드가 없는 응답(구버전/부분 실패)에서 기존 `unseen` 기반으로 안전 degrade한다 <!-- omo:id=accept-degrade-path;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 33c badge/quest/tutorial UI와 33b progress UI가 additive 소비 변경 후에도 깨지지 않는다 <!-- omo:id=accept-33bc-regression;stage=4;scope=frontend;review=5,6 -->
- [x] badge guide의 XP 안내 copy가 v2 배점(첫/반복 분리)과 모순되지 않는다 <!-- omo:id=accept-xp-copy-v2;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [x] fixture에 priority 1~4 unseen, group_key 묶음, silent/archive_only, 전부 seen, empty archive, cursor 2페이지, API 실패, 401 baseline이 준비되어 있다 <!-- omo:id=accept-fixture-baseline;stage=4;scope=frontend;review=5,6 -->
- [x] source action 5종 성공 mock이 준비되어 refresh trigger를 검증할 수 있다 <!-- omo:id=accept-source-action-mocks;stage=4;scope=frontend;review=5,6 -->
- [x] real DB smoke 경로(`pnpm dev:local-supabase`)에서 플래너 등록→toast→보관함 흐름을 확인할 수 있다 <!-- omo:id=accept-real-db-ready;stage=4;scope=shared;review=6 -->

## Manual QA

- verifier:
- environment:
- scenarios:
  - 한 번의 요리 완료로 XP+quest+badge+level_up이 동시에 생긴 사용자에서 mobile toast가 2개만 보이고 나머지가 collapse로 대기하는지, level_up이 가장 먼저·가장 강조되어 보이는지 확인한다.
  - toast를 보지 않고 화면을 이탈한 뒤 MYPAGE 보관함에서 해당 알림이 unseen 상태로 다시 보이는지 확인한다.
  - 320px viewport에서 toast stack이 하단 탭/핵심 CTA를 가리지 않는지 확인한다.
  - SHOPPING_FLOW에서 안내 문구와 quest 문구가 리스트/끼니 묶음 기준을 혼동시키지 않는지 읽어본다.

## Automation Split

### Vitest

- [x] toast stack 상태 전이(queue/visible/collapse/seen), priority 소비, group_key 묶음, degrade 경로가 단위 테스트로 고정되어 있다 <!-- omo:id=accept-vitest-toast-stack;stage=4;scope=frontend;review=5,6 -->
- [x] archive client/surface(pagination, empty/error/401)와 shopping copy가 component 테스트로 고정되어 있다 <!-- omo:id=accept-vitest-archive-copy;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 33c 테스트(mypage-gamification-card, gamification-toast-provider 대체분)가 green이다 <!-- omo:id=accept-vitest-33c-green;stage=4;scope=frontend;review=5,6 -->

### Playwright

- [x] `tests/e2e/slice-34c-growth-notification.spec.ts`가 desktop-chrome/mobile-chrome에서 toast stack 표시·순서·seen·archive 진입·shopping 문구를 고정한다 <!-- omo:id=accept-playwright-34c;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 `tests/e2e/slice-33c-gamification.spec.ts`가 회귀 없이 green이다 <!-- omo:id=accept-playwright-33c-regression;stage=4;scope=frontend;review=6 -->

### Manual Only

- [ ] production Vercel/Supabase 환경에서 실제 source action 후 toast stack/보관함 표시는 배포 후 수동 확인한다
- [ ] 운영 backfill 실행 직후 기존 유저 계정의 toast burst 부재는 운영 판단으로 확인한다
