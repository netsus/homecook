# Acceptance: 35b Growth Achievement Album Backend

> acceptance는 living closeout 문서다. 체크는 테스트, migration 검증, PR evidence가 생긴 뒤에만 한다.

## Happy Path

- [ ] 로그인 사용자가 `GET /api/v1/users/me/gamification`에서 `grade`, `tutorial`, `achievement_album` additive fields를 받는다 <!-- omo:id=accept-gamification-additive-fields;stage=2;scope=backend;review=3,6 -->
- [ ] 신규 사용자는 `Clay · Lv.1`, tutorial 첫 단계 active, achievement summary 0 earned 상태로 조회된다 <!-- omo:id=accept-new-user-projection;stage=2;scope=backend;review=3,6 -->
- [ ] tutorial 6단계를 모두 완료한 사용자는 tutorial completion achievement가 1회 earned 된다 <!-- omo:id=accept-tutorial-completion-earned;stage=2;scope=backend;review=3,6 -->
- [ ] 장기 업적 카테고리별 milestone이 `earned / active / locked` 상태로 서버 계산된다 <!-- omo:id=accept-achievement-statuses;stage=2;scope=backend;review=3,6 -->
- [ ] API 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->

## State / Policy

- [ ] 업적 달성은 XP를 추가 지급하지 않는다 <!-- omo:id=accept-no-achievement-xp;stage=2;scope=backend;review=3,6 -->
- [ ] 퀘스트는 tutorial 호환 surface로 유지되고 standard quest expansion은 추가되지 않는다 <!-- omo:id=accept-tutorial-only-quest;stage=2;scope=backend;review=3,6 -->
- [ ] `POST /tutorial-quests/{quest_key}/dismiss`는 XP, level, achievement award를 변경하지 않는다 <!-- omo:id=accept-dismiss-no-reward-change;stage=2;scope=backend;review=3,6 -->
- [ ] `GET /api/v1/users/me/progress` response shape에 gamification fields가 섞이지 않는다 <!-- omo:id=accept-progress-boundary;stage=2;scope=backend;review=3,6 -->
- [ ] achievement/badge/notification 중복 생성이 unique/idempotency 기준으로 방지된다 <!-- omo:id=accept-idempotency;stage=2;scope=backend;review=3,6 -->

## Achievement Criteria

- [ ] tutorial 6단계 + 전체 완료 achievement 기준이 구현된다 <!-- omo:id=accept-tutorial-criteria;stage=2;scope=backend;review=3,6 -->
- [ ] recipe saved track과 recipe registered track이 분리된다 <!-- omo:id=accept-recipe-tracks-separated;stage=2;scope=backend;review=3,6 -->
- [ ] planner, shopping, cooking, pantry, leftovers, recipebook threshold가 35a 계약과 일치한다 <!-- omo:id=accept-thresholds-match-contract;stage=2;scope=backend;review=3,6 -->
- [ ] shopping list 완료 count와 shopping bundle/covered meal count가 섞이지 않는다 <!-- omo:id=accept-shopping-count-basis;stage=2;scope=backend;review=3,6 -->
- [ ] pantry achievement는 distinct ingredient 기준으로 삭제/재추가 반복 악용을 막는다 <!-- omo:id=accept-pantry-distinct;stage=2;scope=backend;review=3,6 -->
- [ ] 자동 다먹음 처리된 남은요리는 leftovers cleanup achievement count에서 제외된다 <!-- omo:id=accept-leftovers-manual-only;stage=2;scope=backend;review=3,6 -->

## Error / Permission

- [ ] 비로그인 요청은 401 envelope로 실패한다 <!-- omo:id=accept-unauthorized;stage=2;scope=backend;review=3,6 -->
- [ ] archive limit/cursor 오류는 422 envelope로 실패한다 <!-- omo:id=accept-archive-validation;stage=2;scope=backend;review=3,6 -->
- [ ] 알 수 없는 tutorial quest key dismiss는 404 envelope로 실패한다 <!-- omo:id=accept-invalid-tutorial-key;stage=2;scope=backend;review=3,6 -->
- [ ] 다른 사용자 achievement/notification/quest row를 조회하거나 수정할 수 없다 <!-- omo:id=accept-owner-guard;stage=2;scope=backend;review=3,6 -->

## Backfill / Notifications

- [ ] legacy/backfill은 `user_achievement_awards` 상태만 만들고 `user_progress_notifications` row를 만들지 않는다 <!-- omo:id=accept-silent-backfill;stage=2;scope=backend;review=3,6 -->
- [ ] `achievement_unlocked` notification priority는 `badge_unlocked`와 같은 2순위다 <!-- omo:id=accept-achievement-notification-priority;stage=2;scope=backend;review=3,6 -->
- [ ] archive는 live non-silent notification만 최신순으로 반환한다 <!-- omo:id=accept-archive-live-only;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions

- [ ] `user_achievement_awards` migration이 table, unique index, category index를 포함한다 <!-- omo:id=accept-migration-schema;stage=2;scope=backend;review=3,6 -->
- [ ] Vitest fixture에서 progress/activity/notification baseline을 구성할 수 있다 <!-- omo:id=accept-fixture-baseline;stage=2;scope=backend;review=3,6 -->
- [ ] real DB smoke는 가능한 환경에서 `supabase db push` 후 table/index 확인으로 분리된다 <!-- omo:id=accept-real-db-ready;stage=2;scope=backend;review=3,6 -->

## Automation Split

### Vitest

- [ ] `tests/user-achievement-album-policy.test.ts`가 정책과 threshold를 고정한다 <!-- omo:id=accept-policy-tests;stage=2;scope=backend;review=3,6 -->
- [ ] `tests/user-achievement-awards.test.ts`가 award idempotency와 no-XP를 고정한다 <!-- omo:id=accept-award-tests;stage=2;scope=backend;review=3,6 -->
- [ ] `tests/user-gamification-route.test.ts`가 additive response shape를 고정한다 <!-- omo:id=accept-route-tests;stage=2;scope=backend;review=3,6 -->
- [ ] `tests/user-gamification-notification-priority.test.ts`가 priority ordering을 고정한다 <!-- omo:id=accept-priority-tests;stage=2;scope=backend;review=3,6 -->
- [ ] `tests/user-achievement-backfill.test.ts`가 silent backfill을 고정한다 <!-- omo:id=accept-backfill-tests;stage=2;scope=backend;review=3,6 -->

### Manual Only

- [ ] 운영 DB에 migration 적용
- [ ] 운영 기존 유저 backfill 실행과 spot check
