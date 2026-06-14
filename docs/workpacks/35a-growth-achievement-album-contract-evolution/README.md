# 35a Growth Achievement Album Contract Evolution

## Goal

slice34 성장 시스템을 바탕으로 퀘스트/배지/등급 구조를 다시 정리한다. 퀘스트는 신규 사용자의 튜토리얼 용도로 축소하고, 장기 목표는 카테고리별 업적 앨범과 stamp 수집 경험으로 전환한다. MYPAGE는 별도 성장 카드가 아니라 프로필 header 안에 등급/레벨/XP/action buttons를 통합하고, 등급/업적/알림은 버튼으로 여는 modal 또는 bottom sheet로 표시한다. 튜토리얼은 별도 MYPAGE 버튼이 아니라 업적 앨범의 `tutorial` 카테고리로 진입한다.

## Slice Type

- Change type: `contract-evolution`
- Stage owner fallback: Claude token limit 상태이므로 사용자 지시에 따라 Codex가 Stage 1 docs를 작성한다.
- Branches:
  - docs: `docs/35a-growth-achievement-album-contract-evolution`
  - backend follow-up: `feature/be-35b-growth-achievement-album-backend`
  - frontend follow-up: `feature/fe-35c-mypage-achievement-album-ui`
- Implementation: 없음. 35a는 공식 문서와 acceptance 기준만 잠근다.

## Problem Evidence

- slice34 결과물은 XP/레벨/배지/알림 기반은 들어왔지만, 사용자 눈에는 장기 수집 목표가 작고 분산되어 보인다.
- 기존 standard quest가 늘어나는 방식은 장기 사용자에게 할 일 목록처럼 느껴질 수 있고, 업적 수집 욕구를 만들기 어렵다.
- 사용자가 제안한 spoon 등급 이미지는 등급별 수집 신호가 명확하지만, 공식 등급명과 화면 계약에 아직 반영되지 않았다.
- 기존 MYPAGE 성장 UI는 별도 카드/목록이 섞이면 첫 화면에서 프로필과 성장 상태가 분리되어 보인다.

## In Scope

- 공식 성장 계약 업데이트
  - 등급명: `Clay`, `Wood`, `Steel`, `Silver`, `Gold`, `Diamond`, `Titanium`
  - 레벨 band는 기존 7단계를 유지한다.
  - 등급 이미지 asset path를 문서 기준으로 고정한다.
- 퀘스트 정책 변경
  - 퀘스트는 튜토리얼 전용 surface로 축소한다.
  - 튜토리얼은 업적 앨범의 `tutorial` 카테고리다.
  - 튜토리얼 각 단계 완료마다 stamp/badge를 1개 준다.
  - 튜토리얼 전체 완료 시 completion badge를 준다.
- 업적 앨범 계약 추가
  - 카테고리: `tutorial`, `recipe`, `planner`, `shopping`, `cooking`, `pantry`, `leftovers`, `recipebook`
  - `recipe` 카테고리 안에서 `saved`와 `registered` track을 분리한다.
  - 각 achievement는 `achievement_key`, `category_key`, `track_key`, `target`, `current`, `status`, `badge` metadata를 가진다.
  - 업적은 XP를 추가 지급하지 않는다.
- 튜토리얼 기준
  - 첫 레시피 저장
  - 첫 플래너 끼니 등록
  - 첫 장보기 목록 만들기
  - 첫 장보기 목록 완료
  - 첫 집밥 완료
  - 첫 나만의 레시피북 생성
  - 튜토리얼 전체 완료
- 장기 업적 기준
  - 레시피 보관: `1 / 5 / 20 / 50 / 100 / 300 / 1000`
  - 플래너 등록: `1 / 3 / 10 / 30 / 100 / 300 / 1000 / 3000`
  - 장보기 완료: `1 / 3 / 10 / 30 / 100 / 300 / 700 / 1300`
  - 요리 완료: `1 / 3 / 10 / 30 / 100 / 300 / 1000 / 3000`
  - 팬트리 distinct 재료: `1 / 10 / 30 / 60 / 120 / 250 / 600`
  - 남은요리 정리: `1 / 3 / 10 / 30 / 100 / 300 / 1000`
  - 레시피 등록: `1 / 3 / 10 / 30 / 100 / 300 / 600 / 1000`
- API contract additive update
  - `GET /users/me/gamification`에 `achievement_album`, grade image fields, tutorial category summary를 추가한다.
  - 기존 `quests` field는 호환성 때문에 유지하되 standard quest는 신규 추가하지 않는다.
  - notification priority는 `level_up > achievement_unlocked/badge_unlocked > quest_completed > xp_awarded`로 확장한다.
- DB contract additive update
  - `user_achievement_awards` 추가
  - achievement/badge 중복 방지 unique key와 backfill no-toast 정책 추가
- MYPAGE UI contract update
  - profile header 안에 등급/레벨/XP/대표 count/action buttons 통합
  - 등급/업적/알림은 버튼으로 진입
  - 튜토리얼은 업적 앨범의 `tutorial` 카테고리로 진입
  - 업적 앨범은 같은 `track_key`를 하나의 card로 묶고, 누적 milestone badge를 가로 배열로 표시한다.
  - 모바일 bottom sheet, 데스크톱 modal/popover

## Out of Scope

- 35a에서 DB migration, route handler, component 구현
- 대표 배지 사용자가 직접 선택 API
- achievement definition admin editor
- leaderboard, competitive rank, pressure streak, season reset, XP decay
- loot/random rewards, reward claim CTA
- 업적 달성 XP 지급
- 과거 backfill toast/archive 생성
- pixel-perfect concept board 복제. 35c에서 실제 반응형 화면으로 맞춘다.

## Dependencies

| Slice | Status | Required |
| --- | --- | --- |
| `33a-user-progress-foundation` | merged | [x] |
| `33b-mypage-progress-ui` | merged | [x] |
| `33c-badges-quests-toasts-tutorial` | merged | [x] |
| `34a-growth-model-contract-evolution` | merged | [x] |
| `34b-growth-backend-model` | merged | [x] |
| `34c-growth-notification-ui` | merged | [x] |
| `34d-mypage-growth-profile-assets` | merged | [x] |
| `34e-growth-profile-visual-polish` | merged or superseded by 35c | [ ] |

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.10.md`
- `docs/화면정의서-v1.5.17.md`
- `docs/유저flow맵-v1.3.17.md`
- `docs/db설계-v1.3.15.md`
- `docs/api문서-v1.2.19.md`
- `ui/designs/MYPAGE_ACHIEVEMENT_ALBUM.md`
- `ui/designs/critiques/MYPAGE_ACHIEVEMENT_ALBUM-critique.md`

## Grade Assets

| Grade | Character asset | Icon asset |
| --- | --- | --- |
| Clay | `docs/design/assets/spoon-grade-characters/characters/clay-spoon.png` | `docs/design/assets/spoon-grade-characters/badge-icons/clay-spoon-badge.png` |
| Wood | `docs/design/assets/spoon-grade-characters/characters/wood-spoon.png` | `docs/design/assets/spoon-grade-characters/badge-icons/wood-spoon-badge.png` |
| Steel | `docs/design/assets/spoon-grade-characters/characters/steel-spoon.png` | `docs/design/assets/spoon-grade-characters/badge-icons/steel-spoon-badge.png` |
| Silver | `docs/design/assets/spoon-grade-characters/characters/silver-spoon.png` | `docs/design/assets/spoon-grade-characters/badge-icons/silver-spoon-badge.png` |
| Gold | `docs/design/assets/spoon-grade-characters/characters/gold-spoon.png` | `docs/design/assets/spoon-grade-characters/badge-icons/gold-spoon-badge.png` |
| Diamond | `docs/design/assets/spoon-grade-characters/characters/diamond-spoon.png` | `docs/design/assets/spoon-grade-characters/badge-icons/diamond-spoon-badge.png` |
| Titanium | `docs/design/assets/spoon-grade-characters/characters/titanium-spoon.png` | `docs/design/assets/spoon-grade-characters/badge-icons/titanium-spoon-badge.png` |

## Backend First Contract

35b는 35a merge 후 시작한다.

- Additive schema only.
- `GET /users/me/progress`는 progress-only를 유지한다.
- `GET /users/me/gamification`은 업적 앨범 표시용 additive fields를 제공한다.
- 서버가 achievement count, achievement unlock, grade label, XP, level의 단일 권한자다.
- 업적 projection 실패는 원래 source action 성공을 실패로 바꾸지 않는다.
- backfill은 silent로 수행하고 toast/archive row를 만들지 않는다.

## Frontend Delivery Mode

35c는 35b merge 후 시작한다.

- MYPAGE 첫 화면 profile header 안에 성장 상태를 통합한다.
- Header 내부 action buttons:
  - 등급
  - 업적
  - 알림
- 각 버튼은 모바일에서 bottom sheet, desktop에서 modal 또는 popover를 연다.
- 튜토리얼은 업적 앨범의 `tutorial` 카테고리로 확인한다.
- 업적 앨범은 묶인 category tab + track card + milestone badge row + locked hint를 기본 구조로 한다.
- 화면 내 설명문을 과하게 넣지 않고, 상태와 액션이 바로 읽히게 한다.

## Design Authority

- UI risk: `high-risk`
- Anchor screen: `MYPAGE`
- Reference concept board:
  - `docs/design/assets/spoon-grade-characters/concept-boards/mypage-achievement-album-prototype.png`
  - `docs/design/assets/spoon-grade-characters/concept-boards/mypage-achievement-album-prototype-v1.png`
- Source design doc:
  - `ui/designs/MYPAGE_ACHIEVEMENT_ALBUM.md`
- Critique:
  - `ui/designs/critiques/MYPAGE_ACHIEVEMENT_ALBUM-critique.md`
- 35c authority evidence target:
  - `ui/designs/evidence/35c-mypage-achievement-album-ui/`
  - `ui/designs/authority/MYPAGE_ACHIEVEMENT_ALBUM-authority.md`

## QA / Test Data Plan

- New user: no XP, no achievements, tutorial first step active
- Tutorial mid-state: 3/6 completed, completion badge locked
- Tutorial complete: 6/6 completed + completion badge earned
- Rich user: Diamond, multiple categories with earned/active/locked stamps
- Legacy user after backfill: achievements earned but no historical toast burst
- Soft-fail:
  - progress fetch failure
  - gamification fetch failure
  - archive fetch failure
- Anti-abuse:
  - duplicate source action retry
  - pantry add/delete/readd
  - automatic leftover eaten excluded
  - shopping list count and meal bundle count separated

## Verification Strategy

Stage 1 docs:

```bash
pnpm validate:source-of-truth-sync
pnpm validate:workflow-v2
pnpm validate:workpack -- --slice 35a-growth-achievement-album-contract-evolution
git diff --check
```

35b backend:

```bash
pnpm vitest run tests/user-achievement-album-policy.test.ts tests/user-achievement-awards.test.ts tests/user-gamification-route.test.ts tests/user-gamification-notification-priority.test.ts tests/user-achievement-backfill.test.ts
CI=1 pnpm verify:backend:pr
pnpm validate:source-of-truth-sync
pnpm validate:workflow-v2
pnpm validate:workpack -- --slice 35b-growth-achievement-album-backend
git diff --check
```

35c frontend:

```bash
pnpm vitest run tests/mypage-achievement-album.test.tsx tests/mypage-growth-profile.test.tsx tests/user-gamification-api-client.test.ts
pnpm exec playwright test tests/e2e/slice-35c-mypage-achievement-album.spec.ts tests/e2e/slice-33c-gamification.spec.ts
CI=1 pnpm verify:frontend:pr
pnpm qa:explore -- --slice 35c-mypage-achievement-album-ui --base-url http://127.0.0.1:3100
pnpm validate:source-of-truth-sync
pnpm validate:workflow-v2
pnpm validate:workpack -- --slice 35c-mypage-achievement-album-ui
git diff --check
```

## Key Rules

1. 업적은 XP reward가 아니다.
2. 퀘스트는 튜토리얼 전용이다.
3. 튜토리얼도 업적 앨범의 category로 표시한다.
4. 기존 `quests` API field는 호환성을 위해 유지하되 standard quest expansion은 하지 않는다.
5. grade label과 image URL은 서버 응답 기준으로 표시한다.
6. achievement count와 unlock은 서버 authority다.
7. 기존 유저 backfill은 silent이며 toast/archive를 만들지 않는다.
8. 장보기 list 완료 수와 여러 끼니 묶음 기준 count를 섞지 않는다.
9. 팬트리 distinct count는 삭제/재추가 반복 악용을 막는다.
10. 자동 다먹음 처리된 남은요리는 achievement count에서 제외한다.
11. MYPAGE 첫 viewport에 locked badge grid를 크게 깔지 않는다.
12. leaderboard, competitive rank, pressure streak, reward claim, loot box는 금지한다.

## Primary User Path

1. 신규 사용자가 MYPAGE에 들어온다.
2. 프로필 header에서 `Clay · Lv.1`, XP bar, 주요 기록, `등급/업적/알림` 버튼을 본다.
3. `업적` 버튼을 눌러 업적 앨범의 `튜토리얼` 카테고리에서 첫 레시피 저장 같은 다음 행동을 확인한다.
4. 튜토리얼 단계를 하나 완료하면 해당 stamp/badge가 채워지고 알림이 쌓인다.
5. 튜토리얼을 모두 끝내면 completion badge를 받고, 이후에는 카테고리별 업적 앨범을 채워간다.
