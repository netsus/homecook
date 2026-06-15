# Slice: 35c-mypage-achievement-album-ui

## Goal

35a/35b에서 잠근 성장/업적 앨범 계약을 MYPAGE production UI로 연결한다. 사용자는 프로필 header 안에서 현재 등급, 레벨, XP, 주요 기록, 상세 진입 버튼을 한 덩어리로 보고, 등급/업적/알림은 modal 또는 bottom sheet로 확인한다. 튜토리얼은 업적 앨범의 `튜토리얼` 카테고리 안에서 확인한다.

이 slice는 FE-only다. 서버가 계산한 `GET /api/v1/users/me/gamification` projection을 표시하며, 클라이언트에서 achievement unlock, badge unlock, XP, grade를 계산하지 않는다.

## Branches

- 백엔드: N/A
- 프론트엔드: `feature/fe-35c-mypage-achievement-album-ui`

## In Scope

- 화면:
  - `MYPAGE` profile header 성장 통합
  - 등급 modal/bottom sheet
  - 업적 앨범 modal/bottom sheet
  - 알림 archive modal/bottom sheet
- API:
  - `GET /api/v1/users/me/progress`
  - `GET /api/v1/users/me/gamification`
  - `GET /api/v1/users/me/gamification/archive`
  - `POST /api/v1/users/me/gamification/notifications/seen`
  - `POST /api/v1/users/me/gamification/tutorial-quests/{quest_key}/dismiss`
  - `POST /api/v1/leftovers/{leftover_id}/eat` review-loop correction: `leftover_eaten` XP/achievement notification source action
- 상태 전이:
  - modal/sheet open/close
  - category/filter tab switching
  - tutorial dismiss는 기존 API 계약 소비만 수행
  - notification seen 처리는 기존 API 계약 소비만 수행
- DB 영향:
  - 35c public review loop에서 남은요리 다먹음 source action이 XP/업적 알림을 만들지 못하는 버그를 수정하며 `user_progress_events.event_type`에 `leftover_eaten` 허용값을 추가한다.
  - 35c public review loop에서 업적 달성 toast와 중복되는 `quest_completed` notification row를 제거하고, 앞으로 새 quest notification row를 만들지 않도록 한다.
- Schema Change:
  - [ ] 없음 (읽기 전용)
  - [x] 있음 → `supabase/migrations/20260615090000_35c_leftover_eaten_progress_event.sql`, `supabase/migrations/20260615143000_35c_remove_quest_completed_notifications.sql`

## Out of Scope

- 그 외 신규 DB migration
- 신규 backend endpoint
- 대표 배지 사용자 선택 API
- achievement definition admin editor
- leaderboard, public rank, pressure streak, season reset, XP decay
- reward claim CTA, loot/random reward
- 업적 달성 XP 지급
- 기존 유저 backfill 실행 UI

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
| `35b-growth-achievement-album-backend` | merged | [x] |

## Backend First Contract

- Backend 구현 없음.
- 모든 응답은 기존 `{ success, data, error }` envelope를 소비한다.
- `GET /users/me/progress`는 progress-only로 유지되며 badge/achievement/tutorial/archive field를 읽지 않는다.
- `GET /users/me/gamification`의 `grade`, `tutorial`, `achievement_album`, `notifications`를 표시한다.
- 튜토리얼은 별도 프로필 버튼이 아니라 `achievement_album`의 `tutorial` 카테고리로 표시한다.
- `GET /users/me/gamification/archive` 실패는 알림 modal 내부 error로만 격리한다.
- UI는 서버 projection의 `earned / active / locked` 상태를 그대로 표시한다.

## Frontend Delivery Mode

- 디자인 상태: 35a concept board를 그대로 복붙하지 않고 production responsive UI로 재해석한다.
- 필수 상태: `loading / empty / error / read-only / unauthorized`
- MYPAGE core auth gate는 기존 흐름을 유지한다.
- Growth/progress/gamification/archive 실패는 각각 soft-fail로 격리한다.
- 모바일은 bottom sheet, 데스크톱은 modal 또는 popover를 사용한다.
- 첫 viewport는 profile-led여야 하며 locked stamp grid를 바로 크게 노출하지 않는다.

## Design Authority

- UI risk: `high-risk`
- Anchor screen dependency: `MYPAGE`
- Visual artifact:
  - `docs/design/assets/spoon-grade-characters/concept-boards/mypage-achievement-album-prototype.png`
  - `docs/design/assets/spoon-grade-characters/concept-boards/mypage-achievement-album-prototype-v1.png`
- Authority status: `required`
- Notes:
  - 등급 이미지는 `docs/design/assets/spoon-grade-characters/`의 source asset을 production 크기로 안전하게 사용하거나, equivalent CSS/SVG component로 대체할 수 있다.
  - 화면 톤은 집밥/수집 앨범 방향이며 전투 rank, 경쟁 rank, gacha처럼 보이면 실패다.

## Design Status

- [ ] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [x] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [ ] 확정 (confirmed) — Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과
- [ ] N/A — BE-only 슬라이스

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/35a-growth-achievement-album-contract-evolution/README.md`
- `docs/workpacks/35b-growth-achievement-album-backend/README.md`
- `docs/요구사항기준선-v1.7.10.md`
- `docs/화면정의서-v1.5.17.md` §19
- `docs/유저flow맵-v1.3.17.md` §⑪-b
- `docs/api문서-v1.2.19.md` §12-10~12
- `ui/designs/MYPAGE_ACHIEVEMENT_ALBUM.md`
- `ui/designs/critiques/MYPAGE_ACHIEVEMENT_ALBUM-critique.md`

## QA / Test Data Plan

- 신규 사용자: `Clay · Lv.1`, XP 0, 첫 튜토리얼 active, achievement 0 earned
- 중간 사용자: tutorial 3/7, 업적 category별 earned/active/locked 혼합
- 풍부한 사용자: Diamond grade, category tabs, archive list, notification priority 표시
- soft-fail:
  - progress fetch failure
  - gamification fetch failure
  - archive fetch failure
- visual evidence:
  - `mobile-320.png`
  - `mobile-390.png`
  - `desktop-1440.png`
  - `desktop-1920.png`
  - `grade-modal.png`
  - `achievement-album-modal.png`
- `mobile-achievement-tutorial-category.png`
- `notification-archive-modal.png`

## Key Rules

1. 프로필 header 안에 성장 정보를 통합한다.
2. 등급/업적/알림 상세는 버튼으로 열린다.
3. 튜토리얼은 업적 앨범 안의 카테고리로 확인한다.
4. 업적은 XP reward가 아니다. 단, 남은요리 다먹음 같은 source action은 XP와 업적 projection을 함께 만들 수 있다.
5. 퀘스트는 튜토리얼 전용 surface다.
6. 업적 앨범은 같은 누적 `track_key`를 하나의 card로 묶고 milestone badge를 가로 배열한다.
7. 클라이언트는 achievement unlock, XP, grade를 계산하지 않는다.
8. 잠긴 업적 hint는 짧고 압박 없는 문구만 쓴다.
9. leaderboard, rank, streak penalty, loot, reward claim은 금지한다.
10. 모바일 320px에서 텍스트가 잘리거나 버튼 안에서 넘치면 실패다.
11. MYPAGE 진입 loading은 현재 profile header 구조와 맞춘 단일 skeleton만 사용하고, mobile home은 성장 데이터 준비 후 한 번에 전환한다.
12. 업적 앨범 track card는 desktop/mobile 모두 한 줄에 하나씩 배치하고, 가로 스크롤은 card 내부 milestone badge row에만 허용한다.
13. 새로 획득한 milestone badge는 `NEW` chip을 표시하고, 잠긴 milestone은 lock state로 표시한다.
14. 장기 업적 track은 tutorial 첫 1회 달성 badge와 겹치는 `1회` milestone을 표시하지 않는다.
15. 알림 archive modal은 첫 페이지 이후 `next_cursor`가 있으면 더 보기로 오래된 알림을 이어서 불러온다.

## Primary User Path

1. 사용자가 MYPAGE에 진입한다.
2. 프로필 header에서 등급/레벨/XP/요리·플래너·장보기 기록과 세 개의 상세 버튼을 본다.
3. 사용자가 `업적`을 눌러 묶인 category tab과 track별 badge row를 확인한다.
4. 사용자가 업적 앨범의 `튜토리얼` 카테고리에서 onboarding 진행 상태를 확인한다.
5. 사용자가 `알림`을 눌러 성장 기록 archive를 확인한다.

## Delivery Checklist

- [x] 35c workpack/acceptance/automation-spec 작성 <!-- omo:id=delivery-stage1-docs;stage=2;scope=shared;review=3 -->
- [x] 기존 MYPAGE 성장 profile/header 구조 분석 <!-- omo:id=delivery-existing-ui-map;stage=4;scope=frontend;review=5,6 -->
- [x] `GET /users/me/gamification` achievement_album 표시 연결 <!-- omo:id=delivery-achievement-album-connection;stage=4;scope=frontend;review=5,6 -->
- [x] profile header 안에 grade/level/XP/action buttons 통합 <!-- omo:id=delivery-profile-header-integration;stage=4;scope=frontend;review=5,6 -->
- [x] 등급 modal/bottom sheet 구현 <!-- omo:id=delivery-grade-modal;stage=4;scope=frontend;review=5,6 -->
- [x] 업적 앨범 modal/bottom sheet 구현 <!-- omo:id=delivery-achievement-modal;stage=4;scope=frontend;review=5,6 -->
- [x] 튜토리얼 카테고리를 업적 앨범 안에 통합 <!-- omo:id=delivery-tutorial-modal;stage=4;scope=frontend;review=5,6 -->
- [x] 알림 archive modal/bottom sheet 구현 <!-- omo:id=delivery-notification-modal;stage=4;scope=frontend;review=5,6 -->
- [x] loading / empty / error / read-only / unauthorized 상태 점검 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [x] Vitest와 Playwright 자동화 범위 구분 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [x] 320/390/1440/1920 및 modal evidence 캡처 <!-- omo:id=delivery-design-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] 남은요리 다먹음 `leftover_eaten` XP/업적/알림 source action 연결 <!-- omo:id=delivery-leftover-eaten-xp-notification;stage=4;scope=shared;review=5,6 -->
- [x] 알림 archive modal cursor pagination 연결 <!-- omo:id=delivery-notification-archive-pagination;stage=4;scope=frontend;review=5,6 -->
