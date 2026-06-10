# Slice: 33c-badges-quests-toasts-tutorial

## Goal

33a의 서버 기준 progress ledger와 33b의 MYPAGE compact progress UI 위에, 사용자가 집밥 활동을 계속 이어가고 싶어지는 배지/퀘스트/XP 알림 경험을 만든다. 이 슬라이스는 경쟁형 게임 시스템이 아니라 저장, 장보기, 요리 완료, 커스텀 책 생성처럼 실제 서비스 행동이 쌓여 성장하는 느낌을 주는 온보딩/업적 레이어다. 사용자는 마이페이지에서 현재 성장 상태, 대표 배지, 진행 중인 퀘스트, 튜토리얼 퀘스트를 확인하고, XP가 생기는 행동 직후 과하지 않은 toast로 “이번 행동이 성장에 반영됐다”는 피드백을 받는다.

## Branches

- 문서: `docs/33c-badges-quests-toasts-tutorial`
- 백엔드: `feature/be-33c-badges-quests-toasts-tutorial`
- 프론트엔드: `feature/fe-33c-badges-quests-toasts-tutorial`

## In Scope

- 화면:
  - `MYPAGE` 프로필/progress 영역 아래 대표 배지 row
  - `MYPAGE` 배지/성장 시스템 안내 popover 또는 modal
  - `MYPAGE` 현재 퀘스트/업적 요약 surface
  - `MYPAGE` 튜토리얼 퀘스트 surface
  - 앱 shell 단위 XP toast/notification surface
  - XP source action 완료 후 notification refresh hook: 레시피 저장, 커스텀 책 생성, 장보기 완료, 요리 완료
- API:
  - `GET /api/v1/users/me/gamification`
  - `POST /api/v1/users/me/gamification/notifications/seen`
  - `POST /api/v1/users/me/gamification/tutorial-quests/{quest_key}/dismiss`
  - `GET /api/v1/users/me/progress`는 계속 33a 계약 그대로 소비
  - `GET /api/v1/users/me`는 profile/settings-only 유지
- 상태 전이:
  - 33a canonical progress event append 이후 badge/quest/tutorial/notification projection 파생
  - badge award는 `user_id + badge_key` 또는 idempotency key 기준으로 중복 unlock 금지
  - quest completion은 조건 충족 시 자동 완료, 별도 보상 claim 없음
  - XP toast/notification은 source action 성공 후 표시 대상이 되며 seen 처리 호출은 멱등
  - tutorial quest dismiss는 사용자의 숨김 선택만 기록하고 XP/level을 바꾸지 않음
- DB 영향:
  - 신규: `user_badge_awards`
  - 신규: `user_quest_progress`
  - 신규: `user_progress_notifications`
  - badge/quest definition은 MVP에서 서버 코드 상수로 시작하고, 운영 중 조정이 필요해지면 별도 definition table을 후속 후보로 분리
  - 기존 `user_progress_events`, `user_progress_summary`를 reward truth로 사용
- Schema Change:
  - [ ] 없음 (읽기 전용)
  - [x] 있음 -> contract-evolution 승인 후 `supabase/migrations/<timestamp>_user_gamification.sql` 생성 필요

## Out of Scope

- leaderboard, competitive rank, 전체 사용자 순위
- pressure streak, 출석 실패 패널티, streak multiplier
- season reset, XP decay
- loot/reward box, 랜덤 보상, 재화성 보상
- badge/quest admin editor
- public badge profile, 친구 비교, 공유용 랭킹
- XP source 추가 또는 XP 배점 변경
- `GET /api/v1/users/me`에 progress/gamification field 추가
- 33a progress response shape에 badge/quest/toast/tutorial field 추가
- `operational_events`를 사용자 보상 truth로 재사용
- legacy backfill이 삭제된 활동까지 복원했다고 주장하는 UX

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `33a-user-progress-foundation` | merged (PR #719) | [x] |
| `33b-mypage-progress-ui` | merged (PR #722, merge commit `b6723d16`) | [x] |
| `17a-mypage-overview-history` | merged | [x] |
| `04-recipe-save` | merged | [x] |
| `12a-shopping-complete` | merged | [x] |
| `15a-cook-planner-complete` | merged | [x] |
| `15b-cook-standalone-complete` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 상태가 아니면 구현을 시작하지 않는다. 이 Stage 1 브랜치에서는 roadmap에 남은 33b `in-progress` 표기를 실제 merge 상태로 바로잡는다.

## Backend First Contract

### Contract Evolution Status

33c는 신규 public API와 DB table이 필요하므로 Stage 2 전에 별도 `contract-evolution` docs PR이 필요했다. PR #724가 main에 merge되어 이 workpack은 `docs/요구사항기준선-v1.7.8.md`, `docs/화면정의서-v1.5.15.md`, `docs/유저flow맵-v1.3.15.md`, `docs/db설계-v1.3.13.md`, `docs/api문서-v1.2.17.md` 기준으로 재잠금되었다. 백엔드 Stage 2 구현은 `feature/be-33c-badges-quests-toasts-tutorial`에서 진행한다.

### Proposed Read Endpoint

```http
GET /api/v1/users/me/gamification
```

request body 없음. query는 MVP에서 없음. 인증 사용자 본인 데이터만 반환한다.

성공 응답 후보:

```json
{
  "success": true,
  "data": {
    "level": {
      "current_level": 6,
      "total_xp": 830,
      "xp_to_next_level": 170,
      "progress_percent": 82
    },
    "featured_badges": [
      {
        "badge_key": "first_cook_done",
        "label": "첫 집밥 완성",
        "description": "첫 요리 완료를 기록했어요.",
        "earned_at": "2026-06-10T12:00:00.000Z",
        "is_new": false
      }
    ],
    "badges": {
      "earned": [],
      "locked": []
    },
    "quests": {
      "active": [],
      "completed_recent": []
    },
    "tutorial": {
      "active_steps": []
    },
    "notifications": {
      "unseen": []
    },
    "last_updated_at": "2026-06-10T12:00:00.000Z"
  },
  "error": null
}
```

error envelope는 기존 `{ success, data, error }`와 `{ code, message, fields[] }`를 따른다.

### Proposed Seen Endpoint

```http
POST /api/v1/users/me/gamification/notifications/seen
```

request body 후보:

```json
{
  "notification_ids": ["uuid-1", "uuid-2"]
}
```

- 인증 사용자 본인의 notification만 seen 처리한다.
- 이미 seen인 notification을 다시 보내도 성공한다.
- 존재하지 않거나 타인 소유인 id는 정보 노출 없이 무시하거나 `fields[]`로 거부한다. 공식 계약에서 하나로 고정한다.

### Proposed Tutorial Dismiss Endpoint

```http
POST /api/v1/users/me/gamification/tutorial-quests/{quest_key}/dismiss
```

- tutorial quest surface를 숨기는 사용자 선택만 저장한다.
- XP, level, badge award를 변경하지 않는다.
- 이미 dismiss된 quest를 다시 dismiss해도 성공한다.

### Authority / Idempotency / Failure Boundary

- 33a `user_progress_events`와 `user_progress_summary`가 XP/level truth다.
- gamification projection은 progress event 이후 파생되며, 실패해도 원래 source action을 실패시키지 않는다.
- badge award는 append 또는 upsert 시 unique constraint로 중복 unlock을 막는다.
- quest completion은 같은 조건을 여러 번 평가해도 같은 결과가 된다.
- XP toast notification은 같은 source event를 여러 번 표시하지 않는다.
- 클라이언트는 XP/level/badge unlock을 계산하지 않고 서버 결과를 표시한다.
- backfill 또는 legacy lower-bound 데이터는 “이미 한 행동 전체를 완벽히 복원했다”는 문구로 표현하지 않는다.

## Frontend Delivery Mode

- 디자인 확정 전: `ui/designs/MYPAGE_GAMIFICATION.md`와 정적 prototype을 기준으로 기능 가능한 UI를 구현한다.
- 필수 상태:
  - `loading`: progress/badge/quest 영역 skeleton, core MYPAGE 유지
  - `empty`: 신규 사용자에게 첫 요리/첫 저장/첫 장보기 tutorial quest를 표시
  - `error`: gamification 영역만 soft-fail, MYPAGE와 33b progress core는 유지
  - `read-only`: badge/quest 목록은 조회 중심이며 claim 보상 버튼 없음
  - `unauthorized`: 기존 MYPAGE auth gate를 따르고 gamification API를 호출하지 않음
- toast/notification:
  - source action 성공 후 gamification notification refresh를 호출한다.
  - toast는 화면 하단 또는 shell 안전 영역 안에 짧게 표시하고, core action 성공 feedback을 가리지 않는다.
  - toast seen 처리는 실패해도 다음 조회에서 재표시될 수 있으며 core action을 되돌리지 않는다.
- popover/modal:
  - 배지 안내는 icon button 또는 대표 배지 row에서 열 수 있다.
  - mobile 320px에서는 full-width bottom sheet, desktop에서는 compact dialog/popover를 기본으로 한다.
  - 닫기 버튼, focus trap, ESC/backdrop close, 스크린리더용 title을 포함한다.

## Design Authority

- UI risk: `high-risk`
- Anchor screen dependency: 없음
- Visual artifact:
  - `ui/designs/MYPAGE_GAMIFICATION.md`
  - `ui/designs/critiques/MYPAGE_GAMIFICATION-critique.md`
  - `ui/designs/authority/MYPAGE_GAMIFICATION-authority.md`
  - `ui/designs/prototypes/33c-badges-quests-toasts-tutorial/index.html`
  - Stage 4 evidence:
    - `ui/designs/evidence/33c-badges-quests-toasts-tutorial/mobile-390.png`
    - `ui/designs/evidence/33c-badges-quests-toasts-tutorial/mobile-320.png`
    - `ui/designs/evidence/33c-badges-quests-toasts-tutorial/desktop-1440.png`
    - `ui/designs/evidence/33c-badges-quests-toasts-tutorial/xp-toast.png`
    - `ui/designs/evidence/33c-badges-quests-toasts-tutorial/badge-guide-modal.png`
- Authority status: `required`
- Notes:
  - 참고 이미지는 구조 참고만 한다. 등급/배지의 광택, 전투형 톤, stage card, 보상 상자형 CTA는 집밥 서비스 톤에 맞춰 낮춘다.
  - MYPAGE 첫 화면 밀도를 해치지 않도록 compact progress 아래 “대표 배지 + 현재 퀘스트 1~2개”를 우선 배치한다.

## Design Status

- [ ] 임시 UI (temporary) — Stage 1에서 설계/프로토타입 기준만 잠금
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [x] 확정 (confirmed) — Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과
- [ ] N/A — BE-only 슬라이스

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/33a-user-progress-foundation/README.md`
- `docs/workpacks/33b-mypage-progress-ui/README.md`
- `docs/요구사항기준선-v1.7.8.md`
- `docs/화면정의서-v1.5.15.md`
- `docs/유저flow맵-v1.3.15.md`
- `docs/db설계-v1.3.13.md`
- `docs/api문서-v1.2.17.md`
- `docs/design/design-tokens.md`
- `docs/design/mobile-ux-rules.md`
- `docs/engineering/product-design-authority.md`
- `ui/designs/MYPAGE.md`
- `ui/designs/MYPAGE_PROGRESS.md`

## QA / Test Data Plan

- fixture baseline:
  - 0 XP 신규 사용자
  - 각 canonical event 1개 이상 보유 사용자
  - badge unlock 직후 new badge 사용자
  - active quest 2개와 completed_recent quest 1개 사용자
  - unseen XP notification 1개 이상 사용자
  - gamification API 실패 사용자
- real DB smoke:
  - migration 후 신규 table 존재와 unique constraint 확인
  - source action 4종 중 최소 2종을 실제 route로 수행한 뒤 notification/badge/quest projection이 생성되는지 확인
  - `GET /api/v1/users/me/gamification`이 0 XP 사용자와 XP 보유 사용자 모두 envelope를 반환하는지 확인
  - seen/dismiss endpoint 멱등성 확인
- seed / reset:
  - 테스트용 user별 gamification rows cleanup 가능해야 한다.
  - badge/quest definition은 코드 상수 fixture와 snapshot test로 고정한다.
- bootstrap:
  - 신규 회원 bootstrap row는 필요하지 않다.
  - 신규 사용자의 tutorial quest는 조회 시 definition + progress summary로 파생할 수 있어야 한다.
- blocker 조건:
  - 공식 문서 contract-evolution 없이 신규 API/DB 구현 시작
  - gamification writer 실패가 source action 실패로 전파
  - 클라이언트에서 badge unlock 또는 XP/level 계산
  - notification 중복 표시
  - 320px에서 badge/quest/toast가 겹치거나 core MYPAGE를 밀어냄

## Key Rules

1. `GET /api/v1/users/me`는 profile/settings-only로 유지한다.
2. 33a progress response에는 badge/quest/toast/tutorial field를 추가하지 않는다.
3. 33c는 별도 gamification read/write endpoint로 계약을 분리한다.
4. XP source는 33a의 4개 canonical event를 기본으로 유지한다.
5. badge/quest는 사용자 행동을 안내하는 보조 레이어이며 추가 XP 보상 claim을 만들지 않는다.
6. XP toast는 source action success feedback을 보강하지만 core action 성공/실패를 바꾸지 않는다.
7. badge/quest/tutorial copy는 집밥 루틴을 응원하는 톤으로 유지하고 경쟁/압박 표현을 쓰지 않는다.
8. leaderboard, competitive rank, pressure streak, season reset, loot box는 범위 밖이다.
9. 모든 owner-scoped read/write는 인증 사용자 본인 리소스만 대상으로 한다.
10. failed gamification fetch는 MYPAGE core와 33b progress display 전체를 깨뜨리지 않는다.

## Contract Evolution Required

| 항목 | 현재 계약 | 제안 계약 | 기대 사용자 가치 | 영향 문서 | 승인 상태 |
| --- | --- | --- | --- | --- | --- |
| gamification read model | 33a에는 level/event_counts만 있음 | badge/quest/tutorial/notification 전용 read endpoint 추가 | 성장 시스템을 한 번에 조회 | 요구사항, 화면정의, 유저flow, DB, API | v1.7.8/v1.5.15/v1.3.15/v1.3.13/v1.2.17 반영 |
| badge/quest state tables | 33a에는 progress ledger/summary만 있음 | `user_badge_awards`, `user_quest_progress`, `user_progress_notifications` 추가 | 중복 unlock 방지와 seen 상태 유지 | DB, API | v1.3.13/v1.2.17 반영 |
| notification seen/dismiss | 현재 없음 | seen/dismiss idempotent endpoint 추가 | toast 반복 표시 방지, tutorial UX 제어 | API, 유저flow | v1.3.15/v1.2.17 반영 |
| source action notification refresh | source route 응답 변경 없음 | source action 성공 후 FE가 gamification refresh를 호출 | 행동 직후 XP feedback 제공 | 화면정의, 유저flow | v1.5.15/v1.3.15 반영 |

## Primary User Path

1. 로그인한 사용자가 MYPAGE에 들어와 33b compact progress 아래 대표 배지와 현재 퀘스트를 확인한다.
2. 배지 row의 안내 버튼을 눌러 어떤 행동이 배지/퀘스트에 반영되는지 본다.
3. 사용자가 레시피를 저장하거나 장보기를 완료하거나 요리를 완료하면 core action 성공 후 XP toast가 짧게 뜬다.
4. 다시 MYPAGE에 들어오면 새 배지 또는 완료된 퀘스트가 new 상태로 표시되고, tutorial quest는 다음 자연스러운 행동을 안내한다.

## Delivery Checklist

> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> 33c는 contract-evolution 이후 Stage 2/4 구현을 시작한다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 각 체크박스 끝에 `omo` metadata를 유지한다.

- [x] 공식 contract-evolution PR merge 확인 <!-- omo:id=delivery-contract-evolution-merged;stage=2;scope=shared;review=3,6 -->
- [x] gamification DB schema와 unique constraint 구현 <!-- omo:id=delivery-gamification-schema;stage=2;scope=backend;review=3,6 -->
- [x] gamification read/seen/dismiss endpoint 구현 <!-- omo:id=delivery-gamification-api;stage=2;scope=backend;review=3,6 -->
- [x] badge/quest/tutorial definition과 projection 정책 구현 <!-- omo:id=delivery-gamification-projection;stage=2;scope=backend;review=3,6 -->
- [x] source action과 gamification projection 실패 격리 확인 <!-- omo:id=delivery-source-action-isolation;stage=2;scope=backend;review=3,6 -->
- [x] API adapter/type 연결 <!-- omo:id=delivery-api-adapter-types;stage=4;scope=frontend;review=5,6 -->
- [x] MYPAGE badge/quest/tutorial UI 연결 <!-- omo:id=delivery-mypage-gamification-ui;stage=4;scope=frontend;review=5,6 -->
- [x] 배지 안내 modal/popover 구현 <!-- omo:id=delivery-badge-guide-modal;stage=4;scope=frontend;review=5,6 -->
- [x] source action 후 XP toast/notification refresh 연결 <!-- omo:id=delivery-xp-toast-refresh;stage=4;scope=frontend;review=5,6 -->
- [x] `loading / empty / error / read-only / unauthorized` 상태 점검 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [x] 320px/390px/desktop visual evidence 확보 <!-- omo:id=delivery-visual-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] Vitest/Playwright 자동화와 real DB smoke 경로 구분 <!-- omo:id=delivery-test-smoke-split;stage=4;scope=frontend;review=5,6 -->
- [x] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->

## Stage 2 Backend Evidence

- branch: `feature/be-33c-badges-quests-toasts-tutorial`
- migration: `supabase/migrations/20260610183000_33c_user_gamification.sql`
- server modules/routes:
  - `types/user-gamification.ts`
  - `lib/server/user-gamification.ts`
  - `app/api/v1/users/me/gamification/route.ts`
  - `app/api/v1/users/me/gamification/notifications/seen/route.ts`
  - `app/api/v1/users/me/gamification/tutorial-quests/[quest_key]/dismiss/route.ts`
- tests:
  - `tests/user-gamification-definitions.test.ts`
  - `tests/user-gamification-events.test.ts`
  - `tests/user-gamification-route.test.ts`
  - `tests/user-gamification-source-action-smoke.test.ts`
- local evidence:
  - `pnpm exec -- vitest run tests/user-gamification-definitions.test.ts tests/user-gamification-events.test.ts tests/user-gamification-route.test.ts tests/user-gamification-source-action-smoke.test.ts`
  - `pnpm exec -- vitest run tests/user-progress-events.test.ts tests/user-progress-route.test.ts tests/recipe-save-route.test.ts tests/recipe-books-route.test.ts tests/shopping-complete.backend.test.ts tests/cook-planner-complete.backend.test.ts tests/cook-standalone-complete.backend.test.ts tests/user-gamification-definitions.test.ts tests/user-gamification-events.test.ts tests/user-gamification-route.test.ts tests/user-gamification-source-action-smoke.test.ts`
  - `pnpm exec -- vitest run tests/mypage.backend.test.ts tests/settings-account.backend.test.ts tests/user-progress-route.test.ts tests/user-gamification-route.test.ts`
  - `pnpm typecheck`
  - `pnpm verify:backend`

## Stage 4 Frontend Evidence

- branch: `feature/fe-33c-badges-quests-toasts-tutorial`
- implementation note: Stage 4 public owner is Claude, but Claude CLI repo-task prompts hung with no output/no edits after successful ping checks on 2026-06-11T01:08:40+09:00. Codex completed the frontend fallback in the dedicated FE worktree. The requested `--resume c2d15736-d4d8-430f-9028-debee1c90df6` session later returned `No conversation found`, so Codex ran a same-prompt one-off Claude final review; Claude returned `Verdict: OK` with no merge blocker.
- client modules/components:
  - `lib/api/user-gamification.ts`
  - `lib/gamification-events.ts`
  - `components/gamification/gamification-toast-provider.tsx`
  - `components/mypage/mypage-gamification-card.tsx`
  - `components/mypage/mypage-screen.tsx`
  - `components/mypage/mypage-mobile-screen.tsx`
  - `app/layout.tsx`
- source action refresh hooks:
  - `components/home/use-home-recipe-save-flow.ts`
  - `components/recipe/recipe-detail-screen.tsx`
  - `components/shopping/shopping-detail-screen.tsx`
  - `components/cooking/cook-mode-screen.tsx`
  - `components/cooking/standalone-cook-mode-screen.tsx`
- tests:
  - `tests/user-gamification-api-client.test.ts`
  - `tests/mypage-gamification-card.test.tsx`
  - `tests/gamification-toast-provider.test.tsx`
  - `tests/mypage-screen.test.tsx`
  - `tests/e2e/slice-33c-gamification.spec.ts`
- visual evidence:
  - `ui/designs/evidence/33c-badges-quests-toasts-tutorial/mobile-390.png`
  - `ui/designs/evidence/33c-badges-quests-toasts-tutorial/mobile-320.png`
  - `ui/designs/evidence/33c-badges-quests-toasts-tutorial/desktop-1440.png`
  - `ui/designs/evidence/33c-badges-quests-toasts-tutorial/xp-toast.png`
  - `ui/designs/evidence/33c-badges-quests-toasts-tutorial/badge-guide-modal.png`
  - `ui/designs/authority/MYPAGE_GAMIFICATION-authority.md`
- local evidence:
  - `pnpm exec -- vitest run tests/user-gamification-api-client.test.ts tests/mypage-gamification-card.test.tsx tests/gamification-toast-provider.test.tsx tests/mypage-screen.test.tsx tests/mypage-progress-card.test.tsx`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm exec -- vitest run tests/recipe-card.test.tsx tests/recipe-detail-screen.test.tsx tests/shopping-detail.frontend.test.tsx tests/cook-mode-screen.test.tsx tests/standalone-cook-mode-screen.test.tsx tests/mypage-screen.test.tsx tests/user-gamification-api-client.test.ts tests/mypage-gamification-card.test.tsx tests/gamification-toast-provider.test.tsx`
  - `pnpm exec playwright test tests/e2e/slice-33c-gamification.spec.ts`
  - `pnpm exec playwright test tests/e2e/slice-17a-mypage.spec.ts --grep '@smoke-core'`
  - `pnpm verify:frontend:pr`
  - `pnpm qa:explore -- --slice 33c-badges-quests-toasts-tutorial`
  - `pnpm qa:eval -- --checklist .artifacts/qa/33c-badges-quests-toasts-tutorial/2026-06-10T16-40-35-511Z/exploratory-checklist.json --report .artifacts/qa/33c-badges-quests-toasts-tutorial/2026-06-10T16-40-35-511Z/exploratory-report.json` (score 100)
  - Claude final review: `Verdict: OK` from one-off CLI call after requested resume session was unavailable
