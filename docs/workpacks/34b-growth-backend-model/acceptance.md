# Acceptance Checklist: 34b-growth-backend-model

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, real DB smoke, 실제 검증처럼 evidence가 생긴 뒤에만 한다.
> 34b는 BE-only slice이므로 frontend UI 상태 항목은 N/A이며, Stage 3 merge 시점에 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `automation-spec.json`을 함께 쓰는 슬라이스이므로 `Manual Only`를 제외한 각 체크박스 끝에 `omo` metadata를 유지한다.
> Claude가 rebuttal을 수용해 닫은 항목은 checkbox를 유지한 채 `waived=true;waived_by=claude;waived_stage=<3|6>;waived_reason=<slug>` metadata를 추가한다.

## Happy Path

- [x] `POST /api/v1/meals` 첫 등록이 `planner_registered` first 25 XP를, 두 번째 등록이 repeat 5 XP를 ledger/projection에 적립한다 <!-- omo:id=accept-planner-first-repeat-award;stage=2;scope=backend;review=3,6 -->
- [x] `GET /api/v1/users/me/progress`가 `planner_registered_first` / `planner_registered_repeat` count를 포함한 progress-only 응답을 반환한다 <!-- omo:id=accept-progress-planner-counts;stage=2;scope=backend;review=3,6 -->
- [x] `GET /api/v1/users/me/gamification`이 `grade`, badge `category`/`shape_key`/`locked_hint`, `notifications.priority_unseen`, `notifications.archive_preview`를 additive로 반환하고 기존 33c 필드 shape를 유지한다 <!-- omo:id=accept-gamification-additive-response;stage=2;scope=backend;review=3,6 -->
- [x] `GET /api/v1/users/me/gamification/archive`가 `created_at DESC, id DESC` 정렬과 cursor pagination(`limit` 기본 20, 최대 50, `next_cursor`, `has_next`)으로 live non-silent notification을 반환한다 <!-- omo:id=accept-archive-pagination;stage=2;scope=backend;review=3,6 -->
- [x] 모든 신규/확장 API 응답이 `{ success, data, error }` envelope를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [x] 백엔드 계약과 공유 타입(`types/user-progress.ts`, `types/user-gamification.ts`)이 일치한다 <!-- omo:id=accept-backend-types;stage=2;scope=shared;review=3,6 -->

## State / Policy

- [x] XP source 5종 모두 first/repeat XP가 공식 배점표(15/8, 25/10, 40/25, 60/45, 25/5)대로 분리 적립된다 <!-- omo:id=accept-xp-policy-v2-table;stage=2;scope=backend;review=3,6 -->
- [x] planner repeat cap이 KST 3/day, 12/week로 적용되고 first XP는 repeat cap을 소비하지 않는다 <!-- omo:id=accept-planner-repeat-cap;stage=2;scope=backend;review=3,6 -->
- [x] custom book repeat cap이 KST 2/day로 적용된다 <!-- omo:id=accept-custom-book-repeat-cap;stage=2;scope=backend;review=3,6 -->
- [x] cap 초과 액션은 ledger row와 notification을 만들지 않고 source action 성공은 유지된다 <!-- omo:id=accept-cap-exceeded-no-row;stage=2;scope=backend;review=3,6 -->
- [x] KST 자정/주(일→월) 경계에서 cap window가 올바르게 리셋된다 <!-- omo:id=accept-kst-window-boundary;stage=2;scope=backend;review=3,6 -->
- [x] meal PATCH/status transition/shopping/cooking transition은 `planner_registered` award를 만들지 않는다 <!-- omo:id=accept-planner-award-exclusions;stage=2;scope=backend;review=3,6 -->
- [x] meal 삭제 후 재생성 반복이 cap 범위를 넘는 XP를 만들지 않는다 <!-- omo:id=accept-delete-recreate-abuse-guard;stage=2;scope=backend;review=3,6 -->
- [x] level curve v2 공식과 경계값(L2=100, L3=280, L5=880, L8=2380, L50=98980)이 서버 유틸 테스트로 고정되어 있다 <!-- omo:id=accept-level-curve-v2-boundaries;stage=2;scope=backend;review=3,6 -->
- [x] 등급 band 7종(`sprout_homecook`~`homecook_master`)이 레벨 경계(3/4, 7/8, 12/13, 20/21, 34/35, 49/50)에서 올바르게 전환된다 <!-- omo:id=accept-grade-band-boundaries;stage=2;scope=backend;review=3,6 -->
- [x] 같은 `total_xp`에서 v1→v2 재계산 시 레벨이 내려가지 않는다 <!-- omo:id=accept-v2-no-level-decrease;stage=2;scope=backend;review=3,6 -->
- [x] `level_up` notification은 live XP write에서 `previous_level < next_level`일 때만 레벨당 1회 생성되고, 다단계 상승 시 최종 레벨 1건만 생성된다 <!-- omo:id=accept-levelup-live-only-once;stage=2;scope=backend;review=3,6 -->
- [x] notification priority가 `level_up=1 > badge_unlocked=2 > quest_completed=3 > xp_awarded=4`로 저장/정렬된다 <!-- omo:id=accept-notification-priority-order;stage=2;scope=backend;review=3,6 -->
- [x] backfill/recompute가 deterministic order(`meals.created_at ASC, id ASC`)로 처리되고 notification/archive row를 만들지 않는다 <!-- omo:id=accept-backfill-no-toast;stage=2;scope=backend;review=3,6 -->
- [x] recompute 후 `user_progress_summary.level_curve_version`이 `'v2'`로 전환된다 <!-- omo:id=accept-level-curve-version-transition;stage=2;scope=backend;review=3,6 -->
- [x] 장보기 count가 list 기준 / meal bundle 기준 / covered meal 기준으로 분리 집계된다 <!-- omo:id=accept-shopping-count-separation;stage=2;scope=backend;review=3,6 -->
- [x] notification seen 처리가 기존 semantics(멱등, 본인 소유만, rollback 없음)를 유지한다 <!-- omo:id=accept-seen-semantics-preserved;stage=2;scope=backend;review=3,6 -->

## Error / Permission

- [x] 신규/확장 endpoint 4종이 비로그인에서 401을 반환한다 <!-- omo:id=accept-unauthorized-401;stage=2;scope=backend;review=3,6 -->
- [x] archive `limit`/`cursor` 형식 오류가 422를 반환한다 <!-- omo:id=accept-archive-422;stage=2;scope=backend;review=3,6 -->
- [x] 타인 notification/progress/activity 리소스를 조회/수정할 수 없고 소유 여부가 노출되지 않는다 <!-- omo:id=accept-owner-guard;stage=2;scope=backend;review=3,6 -->
- [x] source action 성공 후 progress/activity/gamification projection 실패가 원래 action 실패로 전파되지 않는다 <!-- omo:id=accept-source-action-isolation;stage=2;scope=backend;review=3,6 -->
- [x] `GET /api/v1/users/me`는 profile/settings-only, `GET /api/v1/users/me/progress`는 progress-only 경계를 유지한다 <!-- omo:id=accept-api-boundary-preserved;stage=2;scope=backend;review=3,6 -->

## Data Integrity

- [x] `user_progress_events` UNIQUE `(user_id, event_type, source_key)`와 `xp_delta > 0` 제약이 v2 writer에서도 유지된다 <!-- omo:id=accept-ledger-constraints;stage=2;scope=backend;review=3,6 -->
- [x] `user_growth_activity_events` UNIQUE `(user_id, activity_type, source_key)`로 7종 activity 중복 기록이 방지된다 <!-- omo:id=accept-activity-idempotency;stage=2;scope=backend;review=3,6 -->
- [x] `source_meta_json`에 `xp_kind`, `level_curve_version`, cap window key, backfill 여부가 기록된다 <!-- omo:id=accept-source-meta-json;stage=2;scope=backend;review=3,6 -->
- [x] 기존 ledger row의 `xp_delta`가 소급 변경되지 않는다 (append-only, forward-only re-scoring) <!-- omo:id=accept-no-retroactive-rescoring;stage=2;scope=backend;review=3,6 -->
- [x] `leftover_eaten`은 첫 `leftover -> eaten` transition만 기록하고 uneat/재-eat은 중복 기록하지 않는다 <!-- omo:id=accept-leftover-eaten-first-transition;stage=2;scope=backend;review=3,6 -->
- [x] `meal_add_path_used`가 user별 distinct path만 기록하고 식별 불가 path는 row를 만들지 않는다 <!-- omo:id=accept-meal-add-path-distinct;stage=2;scope=backend;review=3,6 -->
- [x] notification `payload_json`/`group_key`에 비밀정보, OAuth code, raw source text, query string이 저장되지 않는다 <!-- omo:id=accept-notification-payload-safety;stage=2;scope=backend;review=3,6 -->
- [x] 신규 테이블/컬럼 RLS가 authenticated select-own / service_role all / anon revoke 패턴을 따른다 <!-- omo:id=accept-rls-pattern;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions

- [x] fixture에 first/repeat/cap 경계, 다단계 level-up, legacy v1 summary, silent notification 포함 baseline이 준비되어 있다 <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
- [x] real DB smoke에 필요한 additive migration / 인덱스 / RLS / seed 경로가 준비되어 있다 <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
- [x] `planner_registered`가 의존하는 bootstrap(`meal_plan_columns ×3`)과 recipebook bootstrap 제외 규칙(`liked`/`saved`/`my_added`)이 명시·검증되어 있다 <!-- omo:id=accept-bootstrap-owning-flow;stage=2;scope=shared;review=3,6 -->
- [x] backfill/recompute script가 dry-run mode를 지원하고 dry-run에서 notification 생성 수 0이 확인된다 <!-- omo:id=accept-backfill-dry-run;stage=2;scope=backend;review=3,6 -->

## Manual QA

- verifier: Codex local verification; production smoke / operating-user backfill verifier는 `Manual Only` 항목에서 배포 후 지정
- environment: local Supabase CLI stack + local Next/Vitest environment on `feature/be-34b-growth-backend-model`; production Vercel/Supabase는 배포 후 수동 확인
- local evidence: `pnpm exec supabase db reset --local --yes` clean migration apply, `psql` schema/index/RLS checks, rollback priority backfill smoke, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e:security`, 33c gamification Playwright desktop/mobile pass
- scenarios:
  - local Supabase에서 migration 적용 후 로그인 사용자로 플래너 등록 4회(같은 KST 날)를 수행하고 first 25 + repeat 5×3까지만 적립되는지 확인한다.
  - 기존 XP 보유 사용자 recompute 후 MYPAGE 기존 progress UI(33b)가 깨지지 않고 toast burst가 없는지 확인한다.
  - archive 응답에서 silent row가 보이지 않는지, seen 처리 후에도 row가 유지되는지 확인한다.

## Automation Split

### Vitest

- [x] XP policy v2(first/repeat/cap/KST window), level curve v2/grade, planner writer, activity ledger, archive route, notification priority, backfill no-toast가 단위 테스트로 고정되어 있다 <!-- omo:id=accept-vitest-regression;stage=2;scope=backend;review=3,6 -->
- [x] 기존 33a/33c 테스트(user-progress-*, user-gamification-*)가 additive 변경 후에도 green이고, v1 curve 테스트는 curve version 분기 기준으로 갱신되어 있다 <!-- omo:id=accept-vitest-33-regression-green;stage=2;scope=backend;review=3,6 -->

### Playwright

- [x] 34b는 BE-only slice이므로 신규 Playwright 시나리오는 N/A이며, 기존 auth/session security smoke와 33c E2E가 회귀 없이 green임을 확인한다. toast stack/archive UI E2E는 34c에서 추가한다고 README에 명시되어 있다 <!-- omo:id=accept-playwright-na-be-only;stage=2;scope=shared;review=3,6 -->

### Manual Only

- [ ] production Vercel/Supabase 환경의 service-role/additive migration smoke는 배포 후 수동으로 확인한다 (33c follow-up과 동일 경로)
- [ ] 기존 운영 유저 대상 backfill/recompute 실행과 결과 검수는 운영 판단으로 수행한다
