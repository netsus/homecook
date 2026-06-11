# Acceptance Checklist: 34a-growth-model-contract-evolution

> 이 slice는 contract-evolution docs PR이다. 구현 완료 체크가 아니라 후속 34b/34c/34d 구현을 시작해도 되는 공식 계약 잠금 여부를 확인한다.
> Stage 2/4 구현은 이 PR이 main에 merge된 뒤 시작한다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `omo` metadata를 유지한다.

## Happy Path

- [ ] 공식 문서 5종이 v1.7.9 / v1.5.16 / v1.3.16 / v1.3.14 / v1.2.18로 생성되어 서로 같은 성장/레벨링 v2 계약을 말한다 <!-- omo:id=accept-official-docs-vnext;stage=2;scope=shared;review=3,6 -->
- [ ] `CURRENT_SOURCE_OF_TRUTH`가 새 공식 문서 경로와 34a 변경 이력을 가리킨다 <!-- omo:id=accept-source-of-truth-vnext;stage=2;scope=shared;review=3,6 -->
- [ ] `docs/workpacks/README.md`에 34a-34d 후속 slice가 등록되어 있고 34a는 `docs`, 34b-34d는 `planned` 상태다 <!-- omo:id=accept-roadmap-34-series;stage=2;scope=shared;review=3,6 -->
- [ ] API 응답 형식이 `{ success, data, error }`를 유지한다고 문서화되어 있다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->

## State / Policy

- [ ] 33c의 “새 XP source 없음 / 배점 변경 없음” 제약이 34 시리즈 계약으로 명시적으로 대체된다 <!-- omo:id=accept-supersede-33c-xp-freeze;stage=2;scope=shared;review=3,6 -->
- [ ] 5개 XP source의 first/repeat 배점표와 반복 cap/idempotency 기준이 요구사항/DB/API 문서에 같은 값으로 잠겨 있다 <!-- omo:id=accept-xp-policy-map-locked;stage=2;scope=shared;review=3,6 -->
- [ ] `planner_registered` XP source가 first/repeat/cap/backfill/retry/delete-recreate 정책과 함께 문서화되어 있다 <!-- omo:id=accept-planner-registered-xp-policy;stage=2;scope=backend;review=3,6 -->
- [ ] 첫 경험치와 반복 경험치가 XP source별로 분리되어 있고 abuse cap이 명시되어 있다 <!-- omo:id=accept-first-repeat-xp-split;stage=2;scope=backend;review=3,6 -->
- [ ] `user_progress_events`는 XP 지급 ledger, `user_growth_activity_events`는 non-XP activity ledger로 분리되어 있다 <!-- omo:id=accept-ledger-separation;stage=2;scope=backend;review=3,6 -->
- [ ] 팬트리, 남은요리, 식사 추가 경로, 레시피북 활동은 XP가 아니라 activity ledger 기준으로 문서화되어 있다 <!-- omo:id=accept-non-xp-activity-policy;stage=2;scope=backend;review=3,6 -->
- [ ] 장보기 quest count가 list 기준, meal bundle 기준, covered meal 기준으로 분리되어 있다 <!-- omo:id=accept-shopping-count-criteria;stage=2;scope=shared;review=3,6 -->
- [ ] level curve v2 공식과 등급명 band가 문서화되어 있다 <!-- omo:id=accept-level-curve-grade;stage=2;scope=shared;review=3,6 -->
- [ ] historical/backfill recompute가 notification/archive row를 만들지 않는다고 문서화되어 있다 <!-- omo:id=accept-backfill-no-toast;stage=2;scope=backend;review=3,6 -->
- [ ] 알림 우선순위가 `level_up > badge_unlocked > quest_completed > xp_awarded`로 문서화되어 있다 <!-- omo:id=accept-notification-priority;stage=2;scope=shared;review=3,6 -->
- [ ] `GET /api/v1/users/me`와 `GET /api/v1/users/me/progress`의 기존 경계가 유지된다 <!-- omo:id=accept-api-boundary-preserved;stage=2;scope=backend;review=3,6 -->

## Error / Permission

- [ ] source action 성공 후 progress/activity/gamification projection 실패가 원래 source action 실패로 전파되지 않는다고 문서화되어 있다 <!-- omo:id=accept-source-action-isolation;stage=2;scope=shared;review=3,6 -->
- [ ] notification seen은 렌더링되거나 collapse된 알림만 처리해야 한다고 문서화되어 있다 <!-- omo:id=accept-seen-rendered-only;stage=2;scope=frontend;review=3,6 -->
- [ ] archive endpoint의 cursor/limit 오류와 인증 오류가 API 문서에 포함되어 있다 <!-- omo:id=accept-archive-error-contract;stage=2;scope=backend;review=3,6 -->
- [ ] locked badge hint가 압박/경쟁/loot 문구를 쓰지 않는다고 문서화되어 있다 <!-- omo:id=accept-locked-hint-copy-guard;stage=2;scope=frontend;review=3,6 -->

## Data Integrity

- [ ] `user_growth_activity_events` unique 기준이 `(user_id, activity_type, source_key)`로 문서화되어 있다 <!-- omo:id=accept-activity-idempotency;stage=2;scope=backend;review=3,6 -->
- [ ] `user_progress_notifications`에 `level_up`, `priority`, `delivery_channel`, `toast_eligible`, `group_key` 필드가 문서화되어 있다 <!-- omo:id=accept-notification-schema;stage=2;scope=backend;review=3,6 -->
- [ ] archive는 live non-silent notification만 포함하고 historical recompute는 제외한다고 문서화되어 있다 <!-- omo:id=accept-archive-live-only;stage=2;scope=backend;review=3,6 -->
- [ ] 배지 category와 shape key가 API/화면/요구사항에서 같은 후보를 사용한다 <!-- omo:id=accept-badge-category-shape-sync;stage=2;scope=shared;review=3,6 -->

## Data Setup / Preconditions

- [ ] 34b가 시작할 수 있도록 필요한 migration 대상 테이블/컬럼이 DB 문서에 모두 있다 <!-- omo:id=accept-34b-migration-preconditions;stage=2;scope=backend;review=3,6 -->
- [ ] 34c가 시작할 수 있도록 toast stack과 archive API 계약이 API/화면/flow 문서에 모두 있다 <!-- omo:id=accept-34c-ui-preconditions;stage=2;scope=frontend;review=3,6 -->
- [ ] 34d가 시작할 수 있도록 MYPAGE profile integration, badge/grade image concept, SVG/CSS production 원칙이 문서화되어 있다 <!-- omo:id=accept-34d-design-preconditions;stage=2;scope=frontend;review=3,6 -->

## Manual QA

- verifier:
- environment:
- scenarios:
  - 공식 문서 5종을 서로 대조해 XP source, activity ledger, archive, MYPAGE UI 방향이 충돌하지 않는지 확인한다.
  - 장보기 리스트 완료 수와 끼니 묶음 완료 수가 같은 문구로 표시되지 않는지 확인한다.
  - 후속 구현자가 34b/34c/34d 범위를 구분할 수 있는지 README와 roadmap을 읽고 확인한다.

## Automation Split

### Validation

- [ ] `pnpm validate:source-of-truth-sync`가 통과한다 <!-- omo:id=accept-validate-source-of-truth;stage=2;scope=shared;review=3,6 -->
- [ ] `pnpm validate:workflow-v2`가 통과한다 <!-- omo:id=accept-validate-workflow-v2;stage=2;scope=shared;review=3,6 -->
- [ ] `pnpm validate:workpack -- --slice 34a-growth-model-contract-evolution`이 통과한다 <!-- omo:id=accept-validate-workpack;stage=2;scope=shared;review=3,6 -->
- [ ] `git diff --check`가 통과한다 <!-- omo:id=accept-diff-check;stage=2;scope=shared;review=3,6 -->

### Vitest

- [ ] 34a는 docs-only contract-evolution이므로 Vitest는 N/A이며, 34b에서 XP/activity/backfill/notification policy tests를 추가한다고 README에 명시되어 있다 <!-- omo:id=accept-vitest-na-docs-only;stage=2;scope=shared;review=3,6 -->

### Playwright

- [ ] 34a는 docs-only contract-evolution이므로 Playwright는 N/A이며, 34c/34d에서 toast stack/MYPAGE screenshots를 추가한다고 README에 명시되어 있다 <!-- omo:id=accept-playwright-na-docs-only;stage=2;scope=shared;review=3,6 -->

### Manual Only

- [ ] XP 값과 등급명이 제품 톤에 맞는지 출시 전 제품 판단으로 최종 확인한다
- [ ] 생성 이미지 concept prompt와 실제 SVG/CSS 적용 방향은 34d 시작 전 디자인 판단으로 최종 확인한다
