# Slice: 33a-user-progress-foundation

## Goal

사용자가 집밥 서비스를 이용하며 쌓은 활동을 XP와 레벨로 안정적으로 계산할 수 있는 서버 기준 진도 기반을 만든다. 이번 슬라이스는 화면 보상이 아니라 데이터 진실원을 먼저 세우는 backend-first 작업이며, 이후 `MYPAGE` compact progress UI와 배지/퀘스트 시스템이 같은 ledger를 믿고 소비할 수 있게 한다. 기존 `GET /users/me` 프로필 계약은 유지하고, progress는 전용 API로 분리한다.

## Branches

- 백엔드: `feature/be-33a-user-progress-foundation`
- 프론트엔드: N/A (BE-only foundation)
- Stage 1 문서 브랜치: `docs/33a-user-progress-foundation`

## In Scope

- 화면: 없음. `MYPAGE` 표시는 `33b-mypage-progress-ui`에서 처리
- API:
  - `GET /api/v1/users/me/progress` (공식 문서 표기: `GET /users/me/progress`)
- 상태 전이:
  - XP award event는 source action 성공 후 전용 ledger에 append-only로 기록
  - 중복 호출, retry, 이미 완료된 action은 같은 idempotency key로 재적립 금지
  - projection은 ledger 기준으로 재계산 가능해야 함
- DB 영향:
  - 신규 `user_progress_events`
  - 신규 `user_progress_summary`
  - 기존 source table read/write hook: `leftover_dishes`, `shopping_lists`, `recipe_book_items`, `recipe_books`
- Schema Change:
  - [ ] 없음 (읽기 전용)
  - [x] 있음 -> `supabase/migrations/<timestamp>_user_progress_foundation.sql` 생성 필요

## Out of Scope

- `MYPAGE` UI 구현
- progress bar UI
- 하드코딩 subtitle 제거 구현
- badge, quest, XP toast, tutorial, timeline
- badge inventory, 대표 배지 선택
- public backfill API
- leaderboard, competitive rank, pressure streak
- season reset, XP decay, loot-box style rewards
- 33b/33c prototype 생성 자체
- `GET /users/me` response에 progress field 추가
- `operational_events`를 사용자 보상 truth로 재사용

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `04-recipe-save` | merged | [x] |
| `12a-shopping-complete` | merged | [x] |
| `15a-cook-planner-complete` | merged | [x] |
| `15b-cook-standalone-complete` | merged | [x] |
| `16-leftovers` | merged | [x] |
| `17a-mypage-overview-history` | merged | [x] |

## Backend First Contract

### Endpoint

```http
GET /api/v1/users/me/progress
```

공식 API 문서 표기는 `GET /users/me/progress`를 유지한다. route handler는 기존 Next.js route 구조에 맞춰 `/api/v1` prefix 아래에 둔다.

### Response

```json
{
  "success": true,
  "data": {
    "level": {
      "current_level": 3,
      "total_xp": 420,
      "current_level_start_xp": 300,
      "next_level_start_xp": 600,
      "xp_into_current_level": 120,
      "xp_to_next_level": 180,
      "progress_ratio": 0.4,
      "progress_percent": 40
    },
    "event_counts": {
      "cooking_completed": 8,
      "shopping_completed": 5,
      "recipe_saved_distinct_ever": 23,
      "custom_book_created": 2
    },
    "last_updated_at": "2026-06-10T12:34:56.000Z"
  },
  "error": null
}
```

### Error Cases

| 상황 | 코드 | 응답 |
| --- | --- | --- |
| 비로그인 | 401 | `UNAUTHORIZED` |
| progress summary 생성/조회 실패 | 500 | `INTERNAL_ERROR` 또는 기존 서버 에러 코드 |

`33b`에서는 progress 영역만 soft-fail할 수 있지만, `33a` backend endpoint는 기존 API envelope `{ success, data, error }`를 그대로 반환한다.

### Canonical Event Writers

| event_type | source of truth | award moment | idempotency key | 제외 |
| --- | --- | --- | --- | --- |
| `cooking_completed` | `leftover_dishes.id` | planner/standalone cooking completion이 `leftover_dishes` row를 확정한 직후 | `cooking_completed:{leftover_dish_id}` | `cooking_sessions.status` 단독, `meals.status` 단독 기준 award 금지 |
| `shopping_completed` | `shopping_lists.is_completed=true` and `completed_at IS NOT NULL` | 미완료 list가 완료로 전환된 직후 | `shopping_completed:{shopping_list_id}` | 이미 완료된 retry 재적립 금지 |
| `recipe_saved` | user+recipe saved/custom membership transition `0 -> >=1` | 저장 성공 후 최초 savable membership이 생긴 직후 | `recipe_saved:{user_id}:{recipe_id}` | `liked`, `my_added`, 추가 saved/custom membership, duplicate insert, ledger 존재 후 unsave/resave 재적립 제외 |
| `custom_book_created` | `recipe_books.book_type='custom'` | custom book INSERT 성공 직후 | `custom_book_created:{recipe_book_id}` | `my_added`/`saved`/`liked` bootstrap system books 제외 |

### Level Calculation

- XP curve와 level 계산은 server authority다.
- 클라이언트는 `current_level`, `progress_percent`, `xp_to_next_level` 등 계산 결과만 표시한다.
- Stage 2에서는 XP award table과 level curve를 서버 유틸로 고정하고, unit test로 경계값을 잠근다.
- `event_counts.recipe_saved_distinct_ever`는 ledger 기준 distinct-ever 카운트이며 현재 membership 수나 `recipes.save_count`가 아니다.

### Backfill / Reconcile

- legacy backfill은 surviving rows 기준 lower-bound다.
- 삭제된 custom book, 저장 해제된 recipe membership, 삭제된 과거 활동은 복원됐다고 주장하지 않는다.
- 33a 배포 이후 live writer로 기록되는 신규 활동부터 forward-accurate하다.
- projection mismatch가 생기면 ledger를 기준으로 `user_progress_summary`를 재계산할 수 있어야 한다.

## Frontend Delivery Mode

- 33a는 BE-only foundation이므로 Stage 4~6 프론트 구현은 N/A다.
- 필수 UI 상태는 `33b-mypage-progress-ui`에서 `loading / empty / error / read-only / unauthorized`를 다룬다.
- `33b`는 `GET /users/me/progress` 실패 시 MYPAGE 전체가 아니라 progress 영역만 soft-fail해야 한다.
- `33c`는 badge/quest/toast/tutorial prototype과 authority evidence를 별도 workpack에서 잠근다.

## Design Authority

- UI risk: `not-required`
- Anchor screen dependency: 없음
- Visual artifact: N/A
- Authority status: `not-required`
- Notes: 이 슬라이스는 UI가 없다. 33b에서 MYPAGE compact progress UI의 390px/320px evidence가 필요하고, 33c에서 badge/quest/toast/tutorial prototype 및 안내창 interaction evidence가 필요하다.

## Design Status

- [ ] 임시 UI (temporary)
- [ ] 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed)
- [x] N/A - BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.7.7.md`
- `docs/화면정의서-v1.5.14.md`
- `docs/유저flow맵-v1.3.14.md`
- `docs/db설계-v1.3.12.md`
- `docs/api문서-v1.2.16.md`
- `docs/engineering/slice-workflow.md`
- `docs/engineering/agent-workflow-overview.md`
- `docs/engineering/qa-system.md`

## QA / Test Data Plan

- fixture baseline:
  - 신규 사용자 0 XP
  - cooking/shopping/save/custom-book event가 각각 1개 이상인 사용자
  - retry/duplicate source event가 있는 사용자
  - saved -> unsave -> resave case
  - backfill 대상 surviving rows만 있는 legacy 사용자
- real DB smoke:
  - migration 후 `user_progress_events`와 `user_progress_summary` 존재 확인
  - 로그인 사용자로 source action 4종 중 최소 2종을 실제 route로 수행하고 ledger/projection이 증가하는지 확인
  - `GET /api/v1/users/me/progress`가 0 XP 사용자와 XP 보유 사용자 모두에서 envelope를 반환하는지 확인
- seed / reset:
  - 테스트용 progress ledger row는 사용자별로 cleanup 가능해야 한다.
  - backfill/reconcile script는 dry-run 또는 fixture mode를 먼저 지원한다.
- bootstrap 의존:
  - recipe save/custom book source는 기존 회원별 recipe book bootstrap에 의존한다.
  - bootstrap system books(`liked`, `saved`, `my_added`)는 `custom_book_created` XP 대상이 아니다.
- blocker 조건:
  - source action 성공 후 XP writer 실패가 원래 사용자 action을 실패시키는 설계
  - idempotency key 없이 count만 증가시키는 설계
  - `GET /users/me`에 progress field를 섞는 설계
  - `recipe_saved_distinct_ever`를 현재 저장 수로 계산하는 설계
  - backfill이 삭제된 과거 활동까지 복원했다고 주장하는 문구

### 검증 전략

```bash
pnpm validate:branch
pnpm validate:workflow-v2
pnpm validate:source-of-truth-sync
git diff --check
```

후속 Stage 2 구현에서 예상되는 targeted checks:

```bash
pnpm vitest run tests/user-progress-level.test.ts tests/user-progress-events.test.ts tests/user-progress-route.test.ts
pnpm vitest run tests/recipe-save-route.test.ts tests/shopping-complete-route.test.ts tests/cook-complete-progress.test.ts
```

## Key Rules

1. `GET /users/me`는 profile/settings-only 계약을 유지한다.
2. progress 조회는 `GET /users/me/progress` 전용 API로 분리한다.
3. `operational_events`는 운영 로그이며 사용자 보상 truth로 재사용하지 않는다.
4. XP award는 전용 ledger append와 projection update로 처리한다.
5. 모든 canonical event writer는 idempotency key로 중복 award를 막는다.
6. source action retry가 progress를 중복 증가시키면 안 된다.
7. progress writer 실패가 기존 사용자 핵심 action을 불필요하게 실패시키지 않도록 처리 경계를 명확히 한다.
8. backfill은 lower-bound이며 삭제된 활동 복원을 주장하지 않는다.
9. XP curve/level 계산은 서버만 알고, 클라이언트는 계산 결과만 표시한다.
10. 33a response에는 badge, quest, toast, tutorial, timeline field를 넣지 않는다.

## Contract Evolution Candidates

| 후보 | 현재 계약 | 제안 계약 | 기대 사용자 가치 | 영향 문서 | 승인 상태 |
| --- | --- | --- | --- | --- | --- |
| progress event timeline 공개 | 33a response는 level/event_counts/last_updated_at만 반환 | 최근 XP 이벤트 목록을 별도 endpoint 또는 paginated timeline으로 제공 | 사용자가 어떤 행동으로 성장했는지 이해 | API, 화면정의, DB index | 미승인 |
| badge/quest inventory | 33a는 badge/quest/toast/tutorial 없음 | 33c에서 badge inventory, active quest, toast payload, tutorial quest를 별도 계약으로 추가 | 성장 시스템의 재미와 온보딩 강화 | 요구사항, 화면정의, API, DB | 33c 예정 |
| admin backfill/reconcile UI | 33a는 internal script/API 계획만 문서화 | 운영자가 backfill 상태를 볼 수 있는 admin view 추가 | 배포 후 데이터 보정 안정성 | Admin 화면/API/권한 | 미승인 |

## Primary User Path

1. 사용자가 기존 서비스에서 레시피를 저장하거나, 장보기를 완료하거나, 요리를 완료하거나, 커스텀 레시피북을 만든다.
2. 서버가 source action 성공 후 canonical event writer를 호출한다.
3. writer가 `user_progress_events`에 idempotent ledger row를 기록하고 `user_progress_summary` projection을 갱신한다.
4. 사용자가 나중에 `MYPAGE`에 들어가면 33b UI가 `GET /users/me/progress`를 호출해 level/progress를 표시한다.

## Delivery Checklist

> 이 체크리스트는 Stage 2~3 동안 계속 갱신하는 living closeout 문서다.
> 33a는 BE-only slice이므로 Stage 4~6은 N/A이며, Stage 3 review와 merge 시점에 backend closeout을 닫는다.
> 구현 증거 없이 checkbox를 미리 닫지 않는다.

- [x] backend contract와 response type 고정 <!-- omo:id=delivery-backend-contract;stage=2;scope=backend;review=3 -->
- [x] `user_progress_events` / `user_progress_summary` migration 작성 <!-- omo:id=delivery-schema-migration;stage=2;scope=backend;review=3 -->
- [x] server-authority XP curve와 level 계산 유틸 작성 <!-- omo:id=delivery-level-calculator;stage=2;scope=backend;review=3 -->
- [x] canonical event writer 4종 연결 <!-- omo:id=delivery-event-writers;stage=2;scope=backend;review=3 -->
- [x] idempotency/duplicate award guard 테스트 <!-- omo:id=delivery-idempotency-tests;stage=2;scope=backend;review=3 -->
- [x] `GET /api/v1/users/me/progress` route handler 구현 <!-- omo:id=delivery-progress-route;stage=2;scope=backend;review=3 -->
- [ ] backfill/reconcile 경로와 lower-bound 문구 고정 <!-- omo:id=delivery-backfill-reconcile;stage=2;scope=backend;review=3 -->
- [ ] owner/auth/RLS/security boundary 검증 <!-- omo:id=delivery-security-boundary;stage=2;scope=backend;review=3 -->
- [ ] fixture와 real DB smoke 경로 구분 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3 -->
- [ ] 33b/33c handoff notes 갱신 <!-- omo:id=delivery-followup-handoff;stage=2;scope=shared;review=3 -->
