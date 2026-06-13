# Slice: 35c-mypage-achievement-album-ui

## Goal

35a/35b에서 잠근 성장/업적 앨범 계약을 MYPAGE production UI로 연결한다. 사용자는 프로필 header 안에서 현재 등급, 레벨, XP, 주요 기록, 상세 진입 버튼을 한 덩어리로 보고, 등급/업적/튜토리얼/알림은 modal 또는 bottom sheet로 확인한다.

이 slice는 FE-only다. 서버가 계산한 `GET /api/v1/users/me/gamification` projection을 표시하며, 클라이언트에서 achievement unlock, badge unlock, XP, grade를 계산하지 않는다.

## Branches

- 백엔드: N/A
- 프론트엔드: `feature/fe-35c-mypage-achievement-album-ui`

## In Scope

- 화면:
  - `MYPAGE` profile header 성장 통합
  - 등급 modal/bottom sheet
  - 업적 앨범 modal/bottom sheet
  - 튜토리얼 modal/bottom sheet
  - 알림 archive modal/bottom sheet
- API:
  - `GET /api/v1/users/me/progress`
  - `GET /api/v1/users/me/gamification`
  - `GET /api/v1/users/me/gamification/archive`
  - `POST /api/v1/users/me/gamification/notifications/seen`
  - `POST /api/v1/users/me/gamification/tutorial-quests/{quest_key}/dismiss`
- 상태 전이:
  - modal/sheet open/close
  - category/filter tab switching
  - tutorial dismiss는 기존 API 계약 소비만 수행
  - notification seen 처리는 기존 API 계약 소비만 수행
- DB 영향:
  - 없음. 35b migration 적용 완료 후의 읽기 UI다.
- Schema Change:
  - [x] 없음 (읽기 전용)
  - [ ] 있음 → `supabase/migrations/<파일명>.sql` 생성 필요

## Out of Scope

- 신규 DB migration
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
- 중간 사용자: tutorial 3/6, 업적 category별 earned/active/locked 혼합
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
  - `tutorial-modal.png`
  - `notification-archive-modal.png`

## Key Rules

1. 프로필 header 안에 성장 정보를 통합한다.
2. 등급/업적/튜토리얼/알림 상세는 버튼으로 열린다.
3. 업적은 XP reward가 아니다.
4. 퀘스트는 튜토리얼 전용 surface다.
5. 클라이언트는 achievement unlock, XP, grade를 계산하지 않는다.
6. 잠긴 업적 hint는 짧고 압박 없는 문구만 쓴다.
7. leaderboard, rank, streak penalty, loot, reward claim은 금지한다.
8. 모바일 320px에서 텍스트가 잘리거나 버튼 안에서 넘치면 실패다.

## Primary User Path

1. 사용자가 MYPAGE에 진입한다.
2. 프로필 header에서 등급/레벨/XP/요리·플래너·장보기 기록과 네 개의 상세 버튼을 본다.
3. 사용자가 `업적`을 눌러 category tab과 stamp grid를 확인한다.
4. 사용자가 `튜토리얼`을 눌러 onboarding 진행 상태를 확인한다.
5. 사용자가 `알림`을 눌러 성장 기록 archive를 확인한다.

## Delivery Checklist

- [x] 35c workpack/acceptance/automation-spec 작성 <!-- omo:id=delivery-stage1-docs;stage=2;scope=shared;review=3 -->
- [x] 기존 MYPAGE 성장 profile/header 구조 분석 <!-- omo:id=delivery-existing-ui-map;stage=4;scope=frontend;review=5,6 -->
- [x] `GET /users/me/gamification` achievement_album 표시 연결 <!-- omo:id=delivery-achievement-album-connection;stage=4;scope=frontend;review=5,6 -->
- [x] profile header 안에 grade/level/XP/action buttons 통합 <!-- omo:id=delivery-profile-header-integration;stage=4;scope=frontend;review=5,6 -->
- [x] 등급 modal/bottom sheet 구현 <!-- omo:id=delivery-grade-modal;stage=4;scope=frontend;review=5,6 -->
- [x] 업적 앨범 modal/bottom sheet 구현 <!-- omo:id=delivery-achievement-modal;stage=4;scope=frontend;review=5,6 -->
- [x] 튜토리얼 modal/bottom sheet 구현 <!-- omo:id=delivery-tutorial-modal;stage=4;scope=frontend;review=5,6 -->
- [x] 알림 archive modal/bottom sheet 구현 <!-- omo:id=delivery-notification-modal;stage=4;scope=frontend;review=5,6 -->
- [x] loading / empty / error / read-only / unauthorized 상태 점검 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [x] Vitest와 Playwright 자동화 범위 구분 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [x] 320/390/1440/1920 및 modal evidence 캡처 <!-- omo:id=delivery-design-evidence;stage=4;scope=frontend;review=5,6 -->
