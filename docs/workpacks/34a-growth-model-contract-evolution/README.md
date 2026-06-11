# Slice: 34a-growth-model-contract-evolution

## Goal

33a/33b/33c 이후 성장/레벨링 v2를 구현하기 전에 공식 계약을 먼저 잠근다. 이 slice는 `planner_registered` XP source, non-XP activity ledger, 장기 레벨 곡선, 등급명, 알림 우선순위, toast stack, archive, MYPAGE 프로필 통합 UI 방향을 문서화한다. 구현은 하지 않고, 34b/34c/34d가 같은 기준으로 나뉘어 진행될 수 있게 public API/DB/화면/flow 경계를 확정한다.

## Branches

- 문서: `docs/34a-growth-model-contract-evolution`
- 백엔드: `feature/be-34b-growth-backend-model`
- 프론트엔드: `feature/fe-34c-growth-notification-ui`, `feature/fe-34d-mypage-growth-profile-assets`

## In Scope

- 화면:
  - `MYPAGE` 프로필 영역 안에 등급/레벨/XP/대표 배지 통합 방향
  - `MYPAGE` 최근 성장 기록/알림 보관함 preview와 secondary archive surface 계약
  - 앱 shell growth toast stack 계약
  - `SHOPPING_FLOW` 안내 문구: “여러 끼니를 한번에 장보기할 수 있어요”
- API:
  - `GET /api/v1/users/me/gamification` additive 확장
  - `GET /api/v1/users/me/gamification/archive`
  - `POST /api/v1/users/me/gamification/notifications/seen` seen 의미 재확인
  - `GET /api/v1/users/me` profile/settings-only 유지
  - `GET /api/v1/users/me/progress` progress-only 유지
- 상태 전이:
  - XP source action 성공 후 progress/activity/gamification projection은 soft-fail 가능
  - live XP write 후 level-up이 발생하면 `level_up` notification 생성
  - historical/backfill recompute는 notification/archive row를 만들지 않음
  - notification seen은 렌더링/의도적 collapse된 알림만 처리
- DB 영향:
  - `user_progress_events` 확장: `planner_registered`, `source_meta_json`
  - `user_progress_summary` 확장: `level_curve_version`, planner event counts
  - 신규: `user_growth_activity_events`
  - `user_progress_notifications` 확장: `level_up`, priority, delivery channel, toast eligibility, group key
- Schema Change:
  - [ ] 없음 (읽기 전용)
  - [x] 있음 → 34b에서 additive migration 필요

## Out of Scope

- 34b backend migration / writer / backfill 실제 구현
- 34c toast stack UI 실제 구현
- 34d MYPAGE UI/배지 SVG/CSS 실제 구현
- 생성 이미지 runtime asset 적용
- leaderboard, competitive rank, 전체 사용자 순위
- pressure streak, 실패/미접속 패널티, streak multiplier
- season reset, XP decay
- loot/reward box, 랜덤 보상, 재화성 보상, claim CTA
- `GET /api/v1/users/me`에 progress/gamification field 추가
- `GET /api/v1/users/me/progress`에 badge/quest/toast/archive field 추가

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `33a-user-progress-foundation` | merged | [x] |
| `33b-mypage-progress-ui` | merged | [x] |
| `33c-badges-quests-toasts-tutorial` | merged | [x] |
| `04-recipe-save` | merged | [x] |
| `05-planner-week-core` | merged | [x] |
| `08a-meal-add-search-core` | merged | [x] |
| `08b-meal-add-books-pantry` | merged | [x] |
| `09-shopping-preview-create` | merged | [x] |
| `12a-shopping-complete` | merged | [x] |
| `12b-shopping-pantry-reflect` | merged | [x] |
| `13-pantry-core` | merged | [x] |
| `15a-cook-planner-complete` | merged | [x] |
| `15b-cook-standalone-complete` | merged | [x] |
| `16-leftovers` | merged | [x] |
| `17a-mypage-overview-history` | merged | [x] |
| `17b-recipebook-detail-remove` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 상태이므로 34a contract-evolution을 시작할 수 있다. 34b/34c/34d 구현은 이 PR이 main에 merge된 뒤 시작한다.

## Backend First Contract

### Official Docs Updated

| 문서 | 새 버전 | 핵심 변경 |
| --- | --- | --- |
| `docs/요구사항기준선-v1.7.9.md` | v1.7.9 | XP source/배점/레벨 곡선/등급/알림/backfill 정책 |
| `docs/화면정의서-v1.5.16.md` | v1.5.16 | MYPAGE profile integration, toast stack, archive preview, shopping copy |
| `docs/유저flow맵-v1.3.16.md` | v1.3.16 | XP source action, non-XP activity, notification priority, archive 흐름 |
| `docs/db설계-v1.3.14.md` | v1.3.14 | activity ledger와 notification/schema 확장 |
| `docs/api문서-v1.2.18.md` | v1.2.18 | gamification additive response와 archive endpoint |
| `docs/sync/CURRENT_SOURCE_OF_TRUTH.md` | 최신 | 위 5종 공식 파일 경로와 34a 변경 이력 |

### XP Source Contract

| event_type | XP 정책 | abuse 방지 |
| --- | --- | --- |
| `recipe_saved` | 첫 distinct recipe 15 XP, 이후 distinct recipe 8 XP | `recipe_saved:{user_id}:{recipe_id}`로 unsave/resave 중복 방지 |
| `custom_book_created` | 첫 custom book 25 XP, 반복 10 XP | 2/day cap, system book 제외 |
| `shopping_completed` | 첫 list 40 XP, 반복 list 25 XP | `shopping_completed:{list_id}`로 retry 중복 방지 |
| `cooking_completed` | 첫 cook 60 XP, 반복 45 XP | `leftover_dish_id` 기준 source row unique |
| `planner_registered` | 최초 25 XP, 반복 5 XP | 반복은 KST 3/day, 12/week cap. first는 repeat cap을 소비하지 않음 |

### Non-XP Activity Contract

`user_growth_activity_events`는 XP를 지급하지 않는 배지/퀘스트/최근 성장 기록 ledger다.

| activity_type | 기준 |
| --- | --- |
| `shopping_bundle_prepared` | list 기반 또는 pantry-only 장보기 끼니 묶음 준비 |
| `pantry_item_added` | 실제 inserted pantry row |
| `leftover_eaten` | leftover별 첫 `leftover -> eaten` transition |
| `meal_add_path_used` | user별 distinct meal add path |
| `recipebook_created` | custom book 생성 |
| `recipebook_recipe_added` | custom book에 recipe 추가 |
| `recipebook_recipe_removed` | custom book에서 recipe 제거, live-only |

### API Boundary

- 모든 응답은 `{ success, data, error }` wrapper를 유지한다.
- error 객체는 `{ code, message, fields[] }` 구조를 유지한다.
- `GET /api/v1/users/me`는 profile/settings-only이다.
- `GET /api/v1/users/me/progress`는 progress-only이다.
- `GET /api/v1/users/me/gamification`은 grade, badge category/shape/hint, priority notifications, archive preview를 additive하게 포함한다.
- `GET /api/v1/users/me/gamification/archive`는 live non-silent notification을 `created_at DESC, id DESC`로 조회한다.

### Backfill / Existing Users

- Backfill은 surviving rows 기준 lower-bound이다.
- Backfill은 XP/레벨/등급/배지/퀘스트 상태를 조용히 반영할 수 있다.
- Backfill은 `user_progress_notifications` row를 만들지 않는다.
- Historical state는 `is_new=false`이며 기존 유저 첫 로그인 때 과거 toast burst가 없어야 한다.

## Frontend Delivery Mode

- 34a는 구현 없음. 34c/34d에서 기능 가능한 UI를 구현한다.
- 34d MYPAGE는 별도 대형 growth card보다 profile header 안에 grade/level/XP/featured badges를 통합한다.
- 34c toast stack은 mobile visible max 2, desktop visible max 3이다.
- 필수 상태는 후속 FE 구현에서 `loading / empty / error / read-only / unauthorized`를 유지한다.
- 장보기 안내 문구는 `SHOPPING_FLOW` intro/empty/preview surface 중 하나 이상에 표시한다.

## Design Authority

- UI risk: `high-risk` for 34d implementation, `not-required` for this docs-only 34a PR
- Anchor screen dependency: `MYPAGE`
- Visual artifact:
  - 34a: N/A, 공식 계약 잠금
  - 34d 예정: badge/grade concept images, MYPAGE profile screenshots 320/390/1440, level-up/toast/archive screenshots
- Authority status: `not-required`
- Notes:
  - 참고 이미지는 구조 참고만 한다. 전투형/랭킹형/loot tone은 적용하지 않는다.
  - 생성형 이미지는 concept artifact이고 앱 runtime은 SVG/CSS 컴포넌트다.
  - 34d implementation에서는 Design Authority가 `required`이다.

## Design Status

- [ ] 임시 UI (temporary)
- [ ] 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed)
- [x] N/A — docs-only contract-evolution, 구현 화면 없음

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.7.9.md`
- `docs/화면정의서-v1.5.16.md`
- `docs/유저flow맵-v1.3.16.md`
- `docs/db설계-v1.3.14.md`
- `docs/api문서-v1.2.18.md`
- `.omx/plans/growth-leveling-followup-ralplan.md`

## QA / Test Data Plan

- fixture baseline:
  - XP source별 첫/반복 XP 표
  - planner_registered cap window
  - non-XP activity type/category/source_key
  - level curve v2 threshold와 grade band
  - notification priority와 archive live-only 정책
- real DB smoke:
  - 34b에서 additive migration 적용 후 `user_growth_activity_events`, notification 확장 컬럼, RLS/owner guard 확인
  - backfill dry-run에서 notification 생성 수가 0인지 확인
- seed / reset:
  - 34a는 seed 없음
  - 34b에서 migration/fixture/backfill dry-run script를 추가
- blocker 조건:
  - 공식 문서가 `GET /users/me` 또는 `GET /users/me/progress` 경계를 흔듦
  - backfill이 toast/archive row를 만들도록 문서화됨
  - 장보기 list count와 meal bundle count가 다시 섞임
  - planner_registered delete/recreate abuse cap이 빠짐
  - 경쟁/pressure/loot 요소가 다시 scope에 들어감

## Key Rules

- 공식 문서가 구현보다 먼저 merge되어야 한다.
- 34a는 33c의 새 XP source/배점 변경 금지를 34 시리즈 범위에서 대체한다.
- `user_progress_events`는 XP 지급 ledger, `user_growth_activity_events`는 non-XP activity ledger다.
- Level-up notification은 live XP write에서만 생성한다.
- Historical/backfill recompute는 notification/archive row를 만들지 않는다.
- 장보기 quest는 list 기준과 meal bundle 기준을 분리한다.
- MYPAGE 첫 viewport는 profile 통합 성장 요약을 우선하고, 전체 inventory/archive는 secondary로 둔다.

## Contract Evolution Candidates (Optional)

- 현재 계약: archive는 live-only notification row 조회
  - 제안 계약: historical recompute를 archive-only로 남기는 정책
  - 기대 사용자 가치: 기존 유저도 과거 성장 기록을 볼 수 있음
  - 영향 문서: 요구사항, API, DB, flow
  - 승인 상태: 미승인. 과거 toast 폭발 방지가 더 중요하므로 v1 scope 밖
- 현재 계약: badge/quest definition은 서버 코드 상수
  - 제안 계약: 운영 편집 가능한 definition table/admin UI
  - 기대 사용자 가치: 배지/퀘스트 조정 속도 향상
  - 영향 문서: 요구사항, API, DB, Admin
  - 승인 상태: 미승인. 34 시리즈 scope 밖

## Primary User Path

1. 사용자가 플래너 등록, 저장, 장보기, 요리, 팬트리, 남은요리, 레시피북 활동을 한다.
2. 서버가 XP source는 `user_progress_events`, non-XP activity는 `user_growth_activity_events`에 기록한다.
3. live action이면 level/badge/quest/notification projection을 수행하고, 실패해도 원래 action은 성공으로 유지한다.
4. 사용자가 MYPAGE에 들어가 프로필 영역 안에서 등급/레벨/XP/대표 배지를 확인한다.
5. 사용자는 toast stack과 최근 성장 기록/보관함에서 live 성장 기록을 확인한다.

## Delivery Checklist

> 이 체크리스트는 34a docs PR 동안 닫는 항목과 34b~34d로 넘기는 항목을 구분한다.

- [x] 공식 문서 5종 새 버전 생성 및 동기화 <!-- omo:id=delivery-official-docs-vnext;stage=2;scope=shared;review=3,6 -->
- [x] `CURRENT_SOURCE_OF_TRUTH`를 v1.7.9/v1.5.16/v1.3.16/v1.3.14/v1.2.18로 갱신 <!-- omo:id=delivery-source-of-truth-sync;stage=2;scope=shared;review=3,6 -->
- [x] 34a/34b/34c/34d roadmap 항목 추가 <!-- omo:id=delivery-roadmap-34-series;stage=2;scope=shared;review=3,6 -->
- [x] XP source와 activity ledger 책임 분리 문서화 <!-- omo:id=delivery-xp-activity-separation;stage=2;scope=backend;review=3,6 -->
- [x] planner_registered 첫/반복/cap/backfill 정책 문서화 <!-- omo:id=delivery-planner-xp-policy;stage=2;scope=backend;review=3,6 -->
- [x] notification priority/toast stack/archive live-only 정책 문서화 <!-- omo:id=delivery-notification-archive-contract;stage=2;scope=shared;review=3,6 -->
- [x] MYPAGE profile integration과 badge visual 방향 문서화 <!-- omo:id=delivery-mypage-profile-visual-contract;stage=2;scope=shared;review=3,6 -->
- [x] 후속 구현은 34a merge 이후 34b/34c/34d로 분리한다고 명시 <!-- omo:id=delivery-followup-slice-boundary;stage=2;scope=shared;review=3,6 -->


## Closeout

- PR: [#728](https://github.com/netsus/homecook/pull/728)
- Merge commit: `5862becda67940a8d13dd8e8749323f234d94023`
- Merged at: 2026-06-11T01:46:14Z
- Local verification: `pnpm validate:source-of-truth-sync`, `pnpm validate:workflow-v2`, `pnpm validate:workpack -- --slice 34a-growth-model-contract-evolution`, `git diff --check`
- Review: Claude `claude-opus-4-8` one-off review returned `Verdict: OK`
- PR checks: `quality`, `build`, `policy`, `changes`, `labeler`, `template-check`, `GitGuardian Security Checks`, `Vercel`, `Vercel Preview Comments` passed; docs-only QA jobs skipped
- Follow-up: 34b/34c/34d implementation starts from this merged contract
