# Slice: 34b-growth-backend-model

## Goal

34a에서 merge된 성장/레벨링 v2 공식 계약을 실제 서버 모델로 구현한다. 사용자는 플래너 등록을 포함한 XP source에서 첫/반복 경험치를 분리 적립받고, 장기 레벨 곡선 v2와 등급명 기준으로 자신의 성장을 조회할 수 있게 된다. 이 slice는 backend model 전용이며, additive DB migration, XP writer v2, activity ledger, level curve v2/grade, backfill no-toast, notification priority/archive server logic, API additive response를 닫는다. 런타임 UI 표시는 34c/34d가 담당한다.

## Branches

- 문서: `docs/34b-growth-backend-model`
- 백엔드: `feature/be-34b-growth-backend-model`
- 프론트엔드: N/A (BE-only model slice. toast stack UI는 34c, MYPAGE profile 통합은 34d)

## In Scope

- 화면: 없음. `MYPAGE` 표시 변경은 `34c-growth-notification-ui` / `34d-mypage-growth-profile-assets`에서 처리
- API:
  - `GET /api/v1/users/me/progress` additive 확장 (공식 표기 `GET /users/me/progress`): `event_counts.planner_registered_first`, `event_counts.planner_registered_repeat`, 35c review-loop amendment의 `event_counts.leftover_eaten` 추가. progress-only 계약 유지
  - `GET /api/v1/users/me/gamification` additive 확장 (공식 표기 `GET /users/me/gamification`): `grade`, badge item `category`/`shape_key`/`locked_hint`, `notifications.priority_unseen`, `notifications.archive_preview` 추가
  - `GET /api/v1/users/me/gamification/archive` 신규 route (공식 표기 §12-11b)
  - `POST /api/v1/users/me/gamification/notifications/seen` 기존 seen semantics 유지 (멱등, 본인 소유만, rollback 없음)
  - `GET /api/v1/users/me`는 profile/settings-only 유지 (변경 없음)
- 상태 전이:
  - XP source의 첫/반복 XP 분리 적립과 source별 멱등성 적용
  - `POST /api/v1/meals` meal INSERT 성공 직후 `planner_registered` award (PATCH/status transition/shopping/cooking transition은 award 금지)
  - live XP write 후 `previous_level < next_level`일 때만 `level_up` notification 생성
  - activity 7종을 `user_growth_activity_events`에 idempotent append
  - historical/backfill recompute는 XP/레벨/등급/배지/퀘스트 상태만 조용히 반영하고 notification/archive row를 만들지 않음
- DB 영향 (모두 additive migration):
  - `user_progress_events`: `event_type` 허용값에 `planner_registered` 추가, 35c review-loop amendment에서 `leftover_eaten` 추가, `source_meta_json` 컬럼 추가
  - `user_progress_summary`: `level_curve_version` 컬럼 추가, `event_counts`에 `planner_registered_first` / `planner_registered_repeat` / `leftover_eaten` 키 추가
  - 신규 `user_growth_activity_events` (unique `(user_id, activity_type, source_key)`, 인덱스 2종)
  - `user_progress_notifications`: `notification_type` 허용값에 `level_up` 추가, `priority`, `delivery_channel`, `toast_eligible`, `group_key` 컬럼 추가, priority/archive 조회 인덱스 추가
  - 기존 source table read/write hook: `meals`, `leftover_dishes`, `shopping_lists`, `recipe_book_items`, `recipe_books`, `pantry_items`
- Schema Change:
  - [ ] 없음 (읽기 전용)
  - [x] 있음 → `supabase/migrations/<timestamp>_34b_growth_backend_model.sql` 생성 필요

## Out of Scope

- toast stack UI rendering (34c)
- MYPAGE profile visual integration (34d)
- badge/grade SVG/CSS production component (34d)
- 생성 이미지 runtime asset 적용
- 신규 업적 badge/quest definition 대량 추가 (이 slice는 activity ledger 데이터 기반만 마련하고, 신규 badge/quest set은 별도 승인된 후속 작업으로 분리)
- public backfill API (backfill/recompute는 internal script/test helper로만 제공)
- leaderboard, competitive rank, 전체 사용자 순위
- pressure streak, 실패/미접속 패널티, streak multiplier
- season reset, XP decay
- loot/reward box, 랜덤 보상, claim CTA
- `GET /api/v1/users/me`에 progress/gamification field 추가
- `GET /api/v1/users/me/progress`에 badge/quest/toast/archive field 추가
- `operational_events`를 사용자 보상 truth로 재사용

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `34a-growth-model-contract-evolution` | merged | [x] |
| `33a-user-progress-foundation` | merged | [x] |
| `33b-mypage-progress-ui` | merged | [x] |
| `33c-badges-quests-toasts-tutorial` | merged | [x] |
| `05-planner-week-core` | merged | [x] |
| `08a-meal-add-search-core` | merged | [x] |
| `08b-meal-add-books-pantry` | merged | [x] |
| `12a-shopping-complete` | merged | [x] |
| `12b-shopping-pantry-reflect` | merged | [x] |
| `13-pantry-core` | merged | [x] |
| `16-leftovers` | merged | [x] |
| `17b-recipebook-detail-remove` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 상태다. Stage 2 구현은 이 docs PR이 main에 merge된 뒤 시작한다.

## Backend First Contract

### XP Policy v2 (첫/반복 분리 + source guard)

| event_type | first XP | repeat XP | repeat cap / abuse 방지 |
| --- | ---: | ---: | --- |
| `recipe_saved` | 15 | 8 | user+recipe distinct-ever. unsave/resave 재적립 금지 |
| `custom_book_created` | 25 | 10 | KST 2/day repeat cap. bootstrap system books 제외 |
| `shopping_completed` | 40 | 25 | `shopping_completed:{shopping_list_id}` 1회. 완료 retry 재적립 금지 |
| `cooking_completed` | 60 | 45 | `cooking_completed:{leftover_dish_id}` 1회 |
| `planner_registered` | 25 | 5 | meal source id 기준 멱등. 35c review loop 이후 KST daily/weekly repeat cap 없음 |
| `leftover_eaten` | 15 | 8 | `leftover_eaten:{leftover_dish_id}` 1회. 35c review-loop amendment |

- 첫 XP(`xp_kind='first'`)는 event_type별 user당 1회다. 반복 XP(`xp_kind='repeat'`)는 두 번째 적립부터다.
- cap window는 cap이 있는 source에만 적용한다. 35c review loop 이후 현재 cap source는 `custom_book_created`뿐이다.
- cap 초과 반복 액션은 `user_progress_events` row를 만들지 않는다 (`xp_delta > 0` 제약과 일관). source action 성공은 유지되고 notification도 만들지 않는다.
- cap/source guard 계산의 단일 권한자는 서버다. cap source는 `source_meta_json`의 cap window key와 ledger 조회로 같은 결과가 재현돼야 한다.

### planner_registered Canonical Event

| 항목 | 계약 |
| --- | --- |
| source of truth | `meals.id` |
| award moment | `POST /api/v1/meals`에서 meal INSERT 성공 직후 |
| first idempotency key | `planner_registered:first:{user_id}` (user당 평생 1회) |
| repeat idempotency key | `planner_registered:{meal_id}` |
| 제외 | meal PATCH, status transition, shopping/cooking transition 기준 award 금지 |
| abuse 방지 | 같은 `meal_id`/source key는 재시도해도 재적립하지 않는다. 35c review loop 이후 한 달치 선등록 사용자를 막지 않도록 daily/weekly cap은 적용하지 않는다 |

### source_meta_json

`user_progress_events.source_meta_json` (jsonb, NOT NULL, DEFAULT `'{}'`)에는 최소 아래를 기록한다:

- `xp_kind`: `first` / `repeat`
- `level_curve_version`: award 시점 curve version (`v2`)
- cap 적용 이벤트면 cap window key (예: `cap_day_key` = KST date, `cap_week_key` = KST ISO week). `planner_registered`는 35c review loop 이후 cap key를 기록하지 않는다.
- backfill로 생성된 row면 `backfill: true`

live writer와 backfill/recompute가 같은 정책으로 검증될 수 있게 하는 것이 목적이다.

### Level Curve v2 + Grade

- 공식: `levelStartXp(level) = 40 * (level - 1) ** 2 + 60 * (level - 1)`
- `user_progress_summary.level_curve_version`은 `'v1'` default로 추가하고, 34b recompute가 `'v2'`로 전환한다.
- 경계값 (테스트 고정 대상): L1=0, L2=100, L3=280, L4=540, L5=880, L8=2380, L13=6480, L21=17200, L35=48280, L50=98980
- v2 threshold는 모든 레벨에서 v1(`100*(level-1)*level/2`) 이하이므로, 같은 `total_xp`에서 v2 재계산 레벨은 절대 내려가지 않는다. 이 property를 단위 테스트로 고정한다.
- 등급 band (서버 계산, 클라이언트는 label 미계산):

| grade_key | label | level band |
| --- | --- | --- |
| `sprout_homecook` | 새싹 집밥러 | 1-3 |
| `homecook_runner` | 집밥 러너 | 4-7 |
| `kitchen_explorer` | 주방 탐험가 | 8-12 |
| `table_maker` | 한상 메이커 | 13-20 |
| `homecook_artisan` | 집밥 장인 | 21-34 |
| `table_curator` | 식탁 큐레이터 | 35-49 |
| `homecook_master` | 집밥 명장 | 50+ |

> `kitchen_explorer`는 api문서 v1.2.18 §12-10 예시로 고정된 key다. 나머지 key는 같은 snake_case 패턴의 서버 상수로 잠근다. 만렙은 없으며 50+ 이후에도 레벨은 계속 오른다.

### Non-XP Activity Ledger (`user_growth_activity_events`)

Activity truth. badge/quest/최근 성장 기록의 데이터 기반이며 기본적으로 `user_progress_events`의 XP 경제와 분리한다. 35c review-loop amendment 이후 `leftover_eaten`은 XP source와 activity ledger 양쪽에 기록되어 XP toast와 남은요리 정리 업적 projection을 동시에 안정화한다.

| activity_type | category | source of truth | idempotency key | count 기준 |
| --- | --- | --- | --- | --- |
| `shopping_bundle_prepared` | `shopping` | `shopping_lists` 또는 pantry-only `completed_without_list` action | sorted affected meal ids + action kind hash | 끼니 묶음 기준. list 완료 수와 분리 |
| `pantry_item_added` | `pantry` | `pantry_items.id` | `pantry_item_added:{pantry_item_id}` | 실제 inserted pantry row만 |
| `leftover_eaten` | `leftovers` | `leftover_dishes.id` | `leftover_eaten:{leftover_id}` | 첫 `leftover -> eaten` transition만. `uneat` 후 재-eat은 중복 아님 |
| `meal_add_path_used` | `planner` | `meals.id` + path metadata | `meal_add_path:{user_id}:{path}` | user별 distinct path |
| `recipebook_created` | `recipebook` | `recipe_books.id` | `recipebook_created:{recipe_book_id}` | custom book only |
| `recipebook_recipe_added` | `recipebook` | `recipe_book_items.id` | `recipebook_recipe_added:{recipe_book_item_id}` | distinct book-recipe metric은 `{book_id}:{recipe_id}`로 dedupe |
| `recipebook_recipe_removed` | `recipebook` | recipebook remove action | `recipebook_recipe_removed:{user_id}:{book_id}:{recipe_id}:{removed_at_epoch_ms}` | live-only. backfill 없음 |

- UNIQUE `(user_id, activity_type, source_key)`, 인덱스 `(user_id, activity_type, occurred_at DESC)`, `(user_id, category, occurred_at DESC)`
- `meal_add_path_used`의 path 후보는 `search` / `recipebook` / `pantry` / `leftover` / `youtube` / `manual` 서버 상수로 잠근다. 식별 불가 path는 row를 만들지 않는다 (소진성 fallback 금지).
- activity writer 실패는 원래 source action 성공을 실패로 바꾸지 않는다 (progress writer와 같은 soft-fail 경계).
- 장보기 count 3종 분리: `shopping_list_completed_count`(완료 `shopping_lists` row 수), `shopping_meal_bundle_completed_count`(distinct `shopping_bundle_prepared` 수), `shopping_meals_covered_count`(prep action으로 cover된 meal id 수). 같은 수치로 합치지 않는다.

### Notification Priority + level_up

- `user_progress_notifications` additive 컬럼: `priority` (integer NOT NULL DEFAULT 4), `delivery_channel` (text NOT NULL DEFAULT `'toast'`, `toast`/`archive_only`/`silent`), `toast_eligible` (boolean NOT NULL DEFAULT true), `group_key` (text NULL)
- priority 값: `level_up=1`, `achievement_unlocked/badge_unlocked=2`, `xp_awarded=4`. 정렬은 서버 권한이며 클라이언트가 순서를 바꾸지 않는다.
- 35c review-loop 이후 `quest_completed` notification row는 만들지 않고, 기존 row는 migration으로 제거한다. 퀘스트 완료 상태는 `user_quest_progress`와 업적 앨범 tutorial projection으로만 표시한다.
- `level_up` notification은 live XP write 후 `previous_level < next_level`일 때만 생성한다. notification_key는 `level-up:{user_id}:{next_level}` 패턴으로 레벨당 1회 멱등 생성한다. 한 번에 여러 레벨이 오르면 최종 도달 레벨 1건만 만든다.
- 같은 source action에서 나온 notification은 `group_key = progress-event:{source_event_id}`로 묶는다.
- backfill/recompute 경로는 어떤 notification_type도 생성하지 않는다.

### GET /api/v1/users/me/gamification/archive

```http
GET /api/v1/users/me/gamification/archive?limit=20&cursor=<opaque>
```

| Query | 타입 | 필수 | 규칙 |
| --- | --- | --- | --- |
| limit | number | 선택 | 기본 20, 1~50 정수. 범위/형식 위반은 422 |
| cursor | string | 선택 | 직전 응답 `next_cursor`. 내부 형식은 `created_at\|id` 기반 opaque 문자열. 파싱 불가면 422 |

응답 `{ success, data: { items[], next_cursor, has_next }, error }`. item 필드는 api문서 v1.2.18 §12-11b 예시(`id`, `notification_type`, `priority`, `delivery_channel`, `toast_eligible`, `group_key`, `title`, `body`, `category`, `payload`, `created_at`, `seen_at`)를 따른다.

- 정렬: `created_at DESC, id DESC`
- `delivery_channel='toast'`와 `'archive_only'`인 live non-silent row만 포함. `'silent'` 제외
- archive는 v1에서 cutover 이후 live notification만 조회한다. historical/backfill recompute row는 존재하지 않아야 한다
- `seen_at`은 확인 표시일 뿐 archive에서 제거하지 않는다
- 본인 row만 조회 (RLS select-own + route auth)

**에러**: 401 비로그인 / 422 limit·cursor 형식 오류 / 500 내부 실패

### GET /api/v1/users/me/gamification additive 확장

- `grade`: `{ grade_key, label, level_min, level_max }` (50+ band의 `level_max`는 null 허용)
- badge item additive 필드: `category` (7종: `recipe`/`planner`/`shopping`/`cooking`/`pantry`/`leftovers`/`recipebook`), `shape_key` (`plate`/`shield`/`ribbon`/`bookmark`/`pot`/`leaf`/`bowl`), `locked_hint` (locked badge만 단문 hint, earned badge는 null)
- 기존 badge 8종 metadata 잠금 (서버 상수):

| badge_key | category | shape_key |
| --- | --- | --- |
| `first_recipe_saved` | `recipe` | `bookmark` |
| `recipe_collector` | `recipe` | `ribbon` |
| `first_shopping_done` | `shopping` | `leaf` |
| `shopping_rhythm` | `shopping` | `shield` |
| `first_cook_done` | `cooking` | `pot` |
| `kitchen_routine_starter` | `cooking` | `bowl` |
| `first_custom_book_created` | `recipebook` | `plate` |
| `level_5_homecook` | `cooking` | `shield` |

- `locked_hint` copy는 다음 행동 안내 단문만 허용한다. 압박 streak, 경쟁 순위, loot 보상 표현 금지
- `notifications.priority_unseen`: unseen 중 `toast_eligible=true` row를 `priority ASC, created_at DESC, id DESC`로 정렬해 반환
- `notifications.archive_preview`: live non-silent 최신 5개
- 기존 `level`, `featured_badges`, `badges`, `quests`, `tutorial`, `notifications.unseen` shape는 유지 (additive only)

### Backfill / Recompute (internal only)

- surviving rows 기준 lower-bound. 삭제된 활동은 복원됐다고 주장하지 않는다
- deterministic order: `planner_registered` backfill은 `meals.created_at ASC, meals.id ASC` 순서로 first XP와 repeat XP를 계산한다
- 기존 ledger row의 `xp_delta`는 append-only로 불변이다. v2 배점은 cutover 이후 신규 XP write부터 적용하며, 과거 4종 source row의 재배점(re-scoring)은 하지 않는다
- recompute는 `user_progress_summary.current_level`을 v2 곡선으로 재계산하고 `level_curve_version='v2'`로 전환한다. v2 threshold ≤ v1 threshold이므로 레벨 하락은 발생하지 않는다
- backfill/recompute는 `user_progress_notifications` row를 만들지 않는다. 기존 유저 첫 로그인에서 과거 toast burst가 없어야 한다
- `recipebook_recipe_removed`는 live-only activity이며 backfill하지 않는다
- public backfill API는 만들지 않는다. internal script/test helper로만 실행하고 dry-run mode를 먼저 지원한다

### 권한 / RLS

- 신규 테이블/컬럼은 33a/33c와 같은 패턴: authenticated select-own, service_role all, anon revoke
- 모든 신규/확장 route는 본인 리소스만 처리하고 타인 리소스 소유 여부를 노출하지 않는다
- write 경로(ledger append, activity append, notification 생성)는 server-side service 경계 안에서만 수행한다

## Frontend Delivery Mode

- 34b는 BE-only model slice이므로 Stage 4~6 프론트 구현은 N/A다.
- 34c가 priority toast stack(mobile visible max 2, desktop max 3), archive surface, 장보기 안내 문구를 구현한다.
- 34d가 MYPAGE profile header 통합(등급/레벨/XP/대표 배지)과 badge SVG/CSS component를 구현한다.
- 필수 UI 상태(`loading / empty / error / read-only / unauthorized`)는 34c/34d에서 잠근다.
- 기존 33b/33c UI는 34b additive response에 의해 깨지면 안 된다 (기존 필드 shape 유지).

## Design Authority

- UI risk: `not-required`
- Anchor screen dependency: 없음
- Visual artifact: N/A
- Authority status: `not-required`
- Notes: 이 슬라이스는 UI가 없다. 34c에서 toast stack/archive surface evidence, 34d에서 MYPAGE profile 통합 320/390/1440 evidence와 final authority gate가 필요하다.

## Design Status

- [ ] 임시 UI (temporary)
- [ ] 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed)
- [x] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/34a-growth-model-contract-evolution/README.md`
- `docs/요구사항기준선-v1.7.9.md` §2-16, §2-16-a
- `docs/화면정의서-v1.5.16.md`
- `docs/유저flow맵-v1.3.16.md`
- `docs/db설계-v1.3.14.md` §11-2a, §11-2a-2, §11-2b, §11-2e
- `docs/api문서-v1.2.18.md` §12-9, §12-10, §12-11, §12-11b, §12-12
- `docs/engineering/slice-workflow.md`
- `docs/engineering/agent-workflow-overview.md`
- `docs/engineering/qa-system.md`

## QA / Test Data Plan

- fixture baseline:
  - 신규 사용자 0 XP (level 1, `sprout_homecook`)
  - XP source 각각 first/repeat가 섞인 사용자
  - planner repeat cap regression: KST 같은 날 repeat 3회까지만, 같은 KST 주 repeat 12회까지만 적립하며 repeat ledger에 cap key 기록
  - custom book repeat cap 경계: KST 같은 날 repeat 2회 후 3번째 미적립
  - first XP와 repeat XP source key가 분리되는 케이스
  - 같은 meal source 재시도 중복 지급 방지 케이스
  - 한 번에 2레벨 이상 오르는 XP write (level_up notification 1건만)
  - level curve 경계값 사용자 (L2=100, L8=2380, L50=98980 직전/직후)
  - v1 summary를 가진 legacy 사용자 (recompute 후 level_curve_version='v2', 레벨 비하락)
  - activity 7종 각각의 중복 시도 케이스
  - archive pagination: silent 포함 21건 이상 notification 사용자 (limit/cursor/silent 제외 검증)
- real DB smoke:
  - additive migration 적용 후 `user_growth_activity_events` 테이블, `user_progress_events.source_meta_json`, `user_progress_summary.level_curve_version`, notification 확장 컬럼(`priority`/`delivery_channel`/`toast_eligible`/`group_key`), 인덱스, RLS(authenticated select-own / service_role / anon revoke) 확인
  - 로그인 사용자로 `POST /api/v1/meals` 2회 호출 → first 25 XP + repeat 5 XP ledger/projection 확인
  - `GET /api/v1/users/me/progress`에서 `planner_registered_first/repeat` count 확인
  - `GET /api/v1/users/me/gamification`에서 `grade`, `priority_unseen`, `archive_preview` 확인
  - `GET /api/v1/users/me/gamification/archive`에서 정렬/cursor/has_next 확인
  - backfill dry-run에서 notification 생성 수가 0인지 확인
- seed / reset:
  - `pnpm dev:local-supabase` 경로에서 migration 적용 + 사용자별 progress/activity/notification row cleanup 가능해야 한다
  - backfill/recompute script는 dry-run 또는 fixture mode를 먼저 지원한다
- bootstrap 의존:
  - `planner_registered`는 회원 bootstrap의 `meal_plan_columns ×3`에 의존한다 (meal 추가 전제)
  - `custom_book_created`/`recipebook_*`는 bootstrap system books(`liked`, `saved`, `my_added`) 제외 규칙을 유지한다
- blocker 조건:
  - `GET /users/me` 또는 `GET /users/me/progress` 경계를 흔드는 설계
  - backfill/recompute가 notification/archive row를 만드는 설계
  - planner first/repeat 분리가 빠진 설계
  - 장보기 list count와 meal bundle count를 같은 수치로 합치는 설계
  - 기존 ledger row `xp_delta`를 소급 변경(re-scoring)하는 설계
  - XP/level/grade/badge/quest/notification을 클라이언트가 계산하는 설계
  - source action 성공 후 progress/activity/gamification projection 실패가 원래 action을 실패시키는 설계
  - 경쟁 랭킹/pressure streak/season reset/loot 요소 재진입

### 검증 전략

Stage 1 (이 docs PR):

```bash
pnpm validate:source-of-truth-sync
pnpm validate:workflow-v2
pnpm validate:workpack -- --slice 34b-growth-backend-model
git diff --check
```

Stage 2 targeted checks (Codex):

```bash
pnpm vitest run tests/user-progress-xp-policy-v2.test.ts tests/user-progress-level-v2.test.ts tests/planner-registered-events.test.ts tests/user-growth-activity-events.test.ts tests/user-gamification-archive-route.test.ts tests/user-gamification-notification-priority.test.ts tests/user-progress-backfill-recompute.test.ts
pnpm vitest run tests/user-progress-events.test.ts tests/user-progress-level.test.ts tests/user-progress-route.test.ts tests/user-gamification-events.test.ts tests/user-gamification-route.test.ts tests/user-gamification-source-action-smoke.test.ts
pnpm verify:backend
```

> 기존 `tests/user-progress-level.test.ts`는 v1 곡선을 고정하고 있으므로 Stage 2에서 curve version 분기 기준으로 갱신한다. v1 공식 자체는 legacy 검증용으로 유지할 수 있다.

## Key Rules

1. 공식 문서(v1.7.9 / v1.5.16 / v1.3.16 / v1.3.14 / v1.2.18)가 구현 기준이다. 34a 계약을 바꾸지 않고 소비만 한다.
2. `user_progress_events`는 XP 지급 ledger, `user_growth_activity_events`는 activity ledger다. 35c amendment의 `leftover_eaten`처럼 두 ledger에 모두 남기는 경우에도 XP truth는 `user_progress_events`이고 activity/count 보정 truth는 `user_growth_activity_events`다.
3. XP/level/grade/badge/quest/notification 계산의 단일 권한자는 서버다.
4. 첫 XP와 반복 XP는 분리하며, cap이 있는 source는 KST(Asia/Seoul) 기준으로 서버가 계산한다.
5. cap 초과 액션은 ledger row와 notification을 만들지 않지만 source action 성공은 유지한다.
6. `level_up` notification은 live XP write에서 `previous_level < next_level`일 때만, 레벨당 1회 멱등 생성한다.
7. historical/backfill recompute는 어떤 notification/archive row도 만들지 않는다.
8. 기존 ledger row `xp_delta`는 불변이다. v2 배점은 forward-only로 적용하고, 레벨만 v2 곡선으로 재계산한다 (레벨 하락 없음).
9. 장보기 quest count는 list 기준 / meal bundle 기준 / covered meal 기준을 분리한다.
10. progress/activity/gamification projection 실패는 원래 source action 성공을 실패로 바꾸지 않는다.
11. `GET /users/me`는 profile/settings-only, `GET /users/me/progress`는 progress-only 계약을 유지한다. 기존 33a/33c response 필드는 additive로만 확장한다.
12. `operational_events`는 운영 로그이며 보상 truth로 재사용하지 않는다.
13. leaderboard, competitive rank, pressure streak, season reset, XP decay, loot/random reward는 scope 밖이다.

## Contract Evolution Candidates (Optional)

| 후보 | 현재 계약 | 제안 계약 | 기대 사용자 가치 | 영향 문서 | 승인 상태 |
| --- | --- | --- | --- | --- | --- |
| historical archive | archive는 cutover 이후 live notification만 | historical recompute를 archive-only(`delivery_channel='archive_only'`)로 노출 | 기존 유저도 과거 성장 기록 열람 | 요구사항, API, DB, flow | 미승인. toast burst 방지가 우선이라 v1 scope 밖 |
| badge/quest definition table | 서버 코드 상수 | 운영 편집 가능한 definition table/admin UI | 배지/퀘스트 조정 속도 향상 | 요구사항, API, DB, Admin | 미승인. 34 시리즈 scope 밖 |
| 신규 업적 badge/quest set | 기존 8 badge / 6 quest 유지 | activity ledger 기반 pantry/leftovers/recipebook/planner 업적 추가 | 카테고리별 수집 재미 | 요구사항, API | 미승인. 데이터 기반(activity ledger)만 34b에서 마련 |

## Primary User Path

1. 사용자가 플래너에 식사를 등록하고, 레시피를 저장하고, 장보기/요리를 완료하고, 팬트리/남은요리/레시피북을 관리한다.
2. 서버가 XP source는 `user_progress_events`에 첫/반복 XP 분리와 source guard 적용으로 기록하고, activity는 `user_growth_activity_events`에 idempotent하게 기록한다.
3. live XP write로 레벨이 오르면 `level_up` notification이 priority 1로 생성되고, badge/quest/xp notification과 `group_key`로 묶인다.
4. 클라이언트(34c/34d)가 `GET /api/v1/users/me/gamification`의 grade/priority_unseen/archive_preview와 `GET /api/v1/users/me/gamification/archive`를 소비해 성장 상태를 표시한다.
5. 기존 유저는 backfill/recompute로 v2 레벨/등급이 조용히 반영되고, 과거 활동에 대한 toast burst는 발생하지 않는다.

## Delivery Checklist

> 이 체크리스트는 Stage 2~3 동안 계속 갱신하는 living closeout 문서다.
> 34b는 BE-only slice이므로 Stage 4~5는 N/A이며, Stage 3 review와 merge 시점에 backend closeout을 닫는다.
> 구현 증거 없이 checkbox를 미리 닫지 않는다.
> `automation-spec.json`을 함께 쓰는 슬라이스이므로 `Manual Only`를 제외한 각 체크박스 끝에 `omo` metadata를 유지한다.

- [x] additive migration 작성 (`user_growth_activity_events`, `source_meta_json`, `level_curve_version`, notification priority/channel/toast_eligible/group_key, `planner_registered`/`level_up` 허용값) <!-- omo:id=delivery-additive-migration;stage=2;scope=backend;review=3,6 -->
- [x] XP policy v2 서버 상수와 first/repeat/cap 로직 구현 <!-- omo:id=delivery-xp-policy-v2;stage=2;scope=backend;review=3,6 -->
- [x] `planner_registered` writer를 `POST /api/v1/meals` 성공 경로에 연결 <!-- omo:id=delivery-planner-registered-writer;stage=2;scope=backend;review=3,6 -->
- [x] activity writer 7종 연결 <!-- omo:id=delivery-activity-ledger-writers;stage=2;scope=backend;review=3,6 -->
- [x] level curve v2 + grade band 서버 유틸과 `level_curve_version` 전환 구현 <!-- omo:id=delivery-level-curve-v2-grade;stage=2;scope=backend;review=3,6 -->
- [x] `level_up` notification 생성 규칙과 priority/delivery_channel/toast_eligible/group_key projection 구현 <!-- omo:id=delivery-levelup-notification-priority;stage=2;scope=backend;review=3,6 -->
- [x] `GET /api/v1/users/me/gamification/archive` route 구현 (cursor pagination, silent 제외) <!-- omo:id=delivery-archive-route;stage=2;scope=backend;review=3,6 -->
- [x] progress/gamification additive response 확장 (planner counts, grade, badge metadata, priority_unseen, archive_preview) <!-- omo:id=delivery-additive-responses;stage=2;scope=backend;review=3,6 -->
- [x] backfill/recompute internal 경로 구현 (deterministic order, no-toast, dry-run) <!-- omo:id=delivery-backfill-recompute-no-toast;stage=2;scope=backend;review=3,6 -->
- [x] owner/auth/RLS/security boundary 검증 <!-- omo:id=delivery-security-boundary;stage=2;scope=backend;review=3,6 -->
- [x] 타입 반영 (`types/user-progress.ts`, `types/user-gamification.ts` additive 확장) <!-- omo:id=delivery-types;stage=2;scope=shared;review=3,6 -->
- [x] 상태 전이 / 멱등성 / cap 경계 테스트 작성 <!-- omo:id=delivery-state-policy-tests;stage=2;scope=backend;review=3,6 -->
- [x] fixture와 real DB smoke 경로 구분 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [x] 34c/34d handoff notes 갱신 (additive response 소비 가이드) <!-- omo:id=delivery-followup-handoff;stage=2;scope=shared;review=3,6 -->

## Stage 2 Closeout / Handoff Notes

- 34c는 `GET /api/v1/users/me/gamification`의 `notifications.priority_unseen`을 서버 정렬 그대로 소비해 toast stack을 렌더링한다. 클라이언트에서 priority를 재계산하지 않는다.
- 34c archive surface는 `GET /api/v1/users/me/gamification/archive`를 사용하고, `delivery_channel='silent'` row가 제외된다는 서버 계약을 전제로 한다.
- 34d MYPAGE profile 통합은 `grade`, badge `category` / `shape_key` / `locked_hint`, 기존 `featured_badges` shape를 함께 소비한다.
- 장보기 quest count는 public API 필드로 추가하지 않았다. 서버 내부 기준은 `shopping_completed` XP/list count, `shopping_bundle_prepared` activity count, `source_meta_json.meal_ids` distinct covered meal count로 분리한다.
- local Supabase schema smoke: `pnpm exec supabase db reset --local --yes`로 clean DB에 전체 migration을 재적용했고, `20260611152000_34b_growth_backend_model`, `user_growth_activity_events.source_id NOT NULL`, `source_meta_json`, notification `priority`/`delivery_channel` constraints, priority/archive indexes, RLS select-own policy를 `psql`로 확인했다.
- local priority backfill smoke: rollback transaction 안에서 legacy-style `xp_awarded`/`badge_unlocked`/`quest_completed` notification row에 migration UPDATE를 적용해 priority `4/2/3` 매핑을 확인했다.
- dry-run no-toast evidence: `tests/user-progress-backfill-recompute.test.ts`에서 `would_insert_notifications=0`과 `level_curve_version='v2'`를 고정한다.
- Stage 2 local verification evidence: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e:security`, `pnpm exec playwright test tests/e2e/slice-33c-gamification.spec.ts --project=desktop-chrome --project=mobile-chrome`, `pnpm validate:source-of-truth-sync`, `pnpm validate:workflow-v2`, `pnpm validate:workpack -- --slice 34b-growth-backend-model`, `git diff --check` 통과.
