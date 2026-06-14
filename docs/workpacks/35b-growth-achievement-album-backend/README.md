# Slice: 35b-growth-achievement-album-backend

## Goal

35a에서 잠근 성장/업적 앨범 계약을 백엔드 authority로 구현한다. 서버는 업적 정의, 진행 count, unlock 상태, 등급 label/image, 알림 우선순위를 계산하고, 클라이언트는 `GET /users/me/gamification`의 projection만 표시한다. 업적 달성은 XP를 추가 지급하지 않으며, 기존 유저 backfill은 과거 toast/archive 폭발 없이 조용히 상태만 반영한다.

## Branches

- 백엔드: `feature/be-35b-growth-achievement-album-backend`
- 프론트엔드: `feature/fe-35c-mypage-achievement-album-ui`

## In Scope

- 화면: 없음. BE-only slice이며 MYPAGE UI 적용은 35c에서 진행한다.
- API:
  - `GET /api/v1/users/me/gamification`
  - `GET /api/v1/users/me/gamification/archive`
  - `POST /api/v1/users/me/gamification/tutorial-quests/{quest_key}/dismiss`
- 상태 전이:
  - tutorial quest는 `active / completed / dismissed` 호환 상태를 유지한다.
  - tutorial dismiss는 UX 상태만 바꾸고 XP, level, achievement award를 변경하지 않는다.
  - achievement status는 서버 projection에서 `earned / active / locked`로 계산한다.
- DB 영향:
  - `user_achievement_awards` 신규 additive table
  - `user_progress_events`, `user_growth_activity_events`, `user_progress_summary`
  - `user_badge_awards`, `user_quest_progress`, `user_progress_notifications`
- Schema Change:
  - [ ] 없음 (읽기 전용)
  - [x] 있음 → `supabase/migrations/20260613220000_35b_growth_achievement_awards.sql` 생성 필요

## Out of Scope

- MYPAGE profile header, modal, bottom sheet, stamp grid UI 구현
- 등급 PNG runtime/public asset 최적화와 이미지 렌더링
- 대표 배지 사용자 선택 API
- achievement definition admin editor/table
- leaderboard, competitive rank, pressure streak, season reset, XP decay
- loot/random rewards, reward claim CTA
- 업적 달성 XP 지급
- historical/backfill toast/archive row 생성

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `33a-user-progress-foundation` | merged | [x] |
| `33b-mypage-progress-ui` | merged | [x] |
| `33c-badges-quests-toasts-tutorial` | merged | [x] |
| `34a-growth-model-contract-evolution` | merged | [x] |
| `34b-growth-backend-model` | merged | [x] |
| `34c-growth-notification-ui` | merged | [x] |
| `34d-mypage-growth-profile-assets` | merged | [x] |
| `35a-growth-achievement-album-contract-evolution` | merged | [x] |

## Backend First Contract

- Request:
  - `GET /api/v1/users/me/gamification`: path/query/body 없음, 로그인 필수
  - `GET /api/v1/users/me/gamification/archive?limit&cursor`: limit 기본 20, 최대 50, cursor는 opaque `created_at|id` 계열
  - `POST /api/v1/users/me/gamification/tutorial-quests/{quest_key}/dismiss`: `quest_key` path param
- Response:
  - 모든 응답은 `{ success, data, error }` envelope를 유지한다.
  - gamification data는 기존 `level`, `featured_badges`, `badges`, `quests`, `notifications`, `last_updated_at`를 유지하고 `grade`, `tutorial`, `achievement_album`을 additive로 제공한다.
  - `GET /users/me/progress`에는 badge/quest/tutorial/achievement/toast/archive field를 추가하지 않는다.
- 권한:
  - 모든 조회/수정은 로그인 사용자 본인 row만 대상으로 한다.
  - service role이 필요한 backfill/reconcile helper는 route handler에서 직접 노출하지 않는다.
- 멱등성:
  - `user_achievement_awards`는 `(user_id, achievement_key)`와 `(user_id, idempotency_key)` unique 기준으로 중복 unlock을 막는다.
  - tutorial completion badge/achievement는 6개 tutorial achievement가 모두 earned인 경우 서버가 1회만 생성한다.
  - dismiss 재호출은 200 + 동일 status로 처리한다.
- Projection:
  - 업적 정의는 서버 코드 상수로 관리한다.
  - XP source count는 `user_progress_events` / `user_progress_summary` 기준이다.
  - non-XP activity count는 `user_growth_activity_events` 기준이다.
  - 팬트리 count는 distinct ingredient 기준을 우선한다.
  - 남은요리 정리는 사용자가 직접 다먹음 처리한 activity만 포함한다.
  - backfill은 achievement award 상태만 만들 수 있고 notification/toast/archive row를 만들지 않는다.

## Frontend Delivery Mode

- Design Status: N/A. 35b는 FE 화면이 없다.
- 35c에서 5개 필수 상태(`loading / empty / error / read-only / unauthorized`)와 modal/bottom sheet UI를 구현한다.
- 35b는 35c가 그대로 소비할 API shape와 soft-fail 가능한 envelope만 제공한다.

## Design Authority

- UI risk: N/A (BE-only)
- Anchor screen dependency: `MYPAGE`는 35c에서 다룬다.
- Visual artifact: N/A
- Authority status: `not-required`
- Notes: 35b는 grade image URL 문자열만 서버 projection에 포함한다. 실제 asset serving/optimization은 35c 범위다.

## Design Status

- [ ] 임시 UI (temporary)
- [ ] 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed)
- [x] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/35a-growth-achievement-album-contract-evolution/README.md`
- `docs/요구사항기준선-v1.7.10.md` §2-16-a, §2-16-b
- `docs/db설계-v1.3.15.md` §11-2b~e, index list
- `docs/api문서-v1.2.19.md` §12-10, §12-11b, §12-12
- `docs/유저flow맵-v1.3.17.md` §⑪-b

## QA / Test Data Plan

- Fixture baseline:
  - 신규 사용자: XP 0, achievement 0, tutorial 첫 단계 active
  - tutorial mid-state: 3/7 earned, completion locked
  - tutorial complete: 6/6 earned + completion earned
  - rich user: Diamond grade, category별 earned/active/locked 섞임
  - legacy/backfill user: achievement state만 반영, notification 없음
- Real DB smoke:
  - migration file 존재 및 SQL 정합성 확인
  - local Supabase가 가능한 환경에서는 `supabase db push` 후 `user_achievement_awards` table/index 확인
  - 현재 CI는 migration을 적용하지 않으므로 SQL file + repository tests를 기본 evidence로 둔다.
- Seed/reset:
  - 기존 Vitest fixture builder로 progress/activity/notification rows를 구성한다.
  - 운영 데이터 backfill 실행은 Manual Only이며 PR에서 실행하지 않는다.
- Blocker:
  - `user_achievement_awards` schema 누락
  - achievement unlock이 XP를 생성
  - backfill/recompute가 notification row 생성
  - `GET /users/me/progress` response shape 변경

## Key Rules

1. 업적은 XP reward가 아니다.
2. 퀘스트는 튜토리얼 전용이다.
3. 튜토리얼은 업적 앨범의 `tutorial` category로도 표시한다.
4. 기존 `quests` field는 호환성을 위해 유지하되 standard quest expansion은 하지 않는다.
5. grade label과 image URL은 서버가 level band 기준으로 계산한다.
6. achievement count와 unlock은 서버 authority다.
7. 기존 유저 backfill은 silent이며 toast/archive를 만들지 않는다.
8. 장보기 list 완료 수와 여러 끼니 묶음 기준 count를 섞지 않는다.
9. 팬트리 distinct count는 삭제/재추가 반복 악용을 막는다.
10. 자동 다먹음 처리된 남은요리는 achievement count에서 제외한다.
11. 같은 grade band 안에서 level만 오른 `level_up` 알림은 grade label을 말하지 않는다.
12. 장기 업적 milestone은 tutorial의 첫 1회 달성 업적과 중복되는 `target=1` 항목을 만들지 않는다.

## Contract Evolution Candidates

- 없음. 35a에서 공식 계약이 잠겼고, 35b는 해당 계약의 backend 구현만 다룬다.

## Primary User Path

1. 사용자가 MYPAGE에 진입하면 FE가 `GET /users/me/progress`와 `GET /users/me/gamification`을 호출한다.
2. 서버는 현재 level/grade, tutorial summary, achievement album categories, priority notifications를 계산해 반환한다.
3. 사용자가 source action을 완료하면 서버 projection이 업데이트되고, 해당 achievement/stamp가 중복 없이 earned 상태가 된다.
4. 기존 유저 backfill 후 첫 진입에서는 업적 상태는 반영되지만 과거 toast/archive row는 표시되지 않는다.

## Delivery Checklist

- [x] `user_achievement_awards` additive migration 작성 <!-- omo:id=delivery-achievement-awards-migration;stage=2;scope=backend;review=3,6 -->
- [x] achievement definition과 category/track threshold를 서버 상수로 구현 <!-- omo:id=delivery-achievement-definitions;stage=2;scope=backend;review=3,6 -->
- [x] achievement count projection과 earned/active/locked status 계산 구현 <!-- omo:id=delivery-achievement-projection;stage=2;scope=backend;review=3,6 -->
- [x] `GET /users/me/gamification` additive fields 구현 <!-- omo:id=delivery-gamification-achievement-fields;stage=2;scope=backend;review=3,6 -->
- [x] tutorial category summary와 dismiss 호환 정책 유지 <!-- omo:id=delivery-tutorial-category-compat;stage=2;scope=backend;review=3,6 -->
- [x] notification priority에 `achievement_unlocked` 포함 <!-- omo:id=delivery-achievement-notification-priority;stage=2;scope=backend;review=3,6 -->
- [x] silent backfill/reconcile helper가 notification row를 만들지 않음 <!-- omo:id=delivery-silent-achievement-backfill;stage=2;scope=backend;review=3,6 -->
- [x] `GET /users/me/progress` response shape 불변 확인 <!-- omo:id=delivery-progress-boundary;stage=2;scope=backend;review=3,6 -->
- [x] targeted Vitest와 backend verification 실행 <!-- omo:id=delivery-backend-verification;stage=2;scope=backend;review=3,6 -->
- [x] fixture와 real DB smoke 경로 구분 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=backend;review=3,6 -->
