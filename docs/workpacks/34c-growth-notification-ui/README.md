# Slice: 34c-growth-notification-ui

## Goal

34b가 서버에 쌓아둔 성장 notification을 사용자가 실제로 체감하게 한다. 여러 알림이 동시에 발생해도 `level_up > badge_unlocked > quest_completed > xp_awarded` 우선순위대로 toast stack으로 쌓여 보이고, 레벨업은 XP 적립보다 강한 시각 강도로 표시되며, 놓친 알림은 최근 성장 기록/알림 보관함(archive)에서 다시 볼 수 있다. 장보기 안내 문구와 리스트 기준/끼니 묶음 기준 quest 문구 분리로 장보기 성장 카운트의 혼동을 없앤다. 이 slice는 FE-only이며 34b API를 소비만 하고 backend public contract를 바꾸지 않는다.

## Branches

- 문서: `docs/34c-growth-notification-ui`
- 프론트엔드: `feature/fe-34c-growth-notification-ui`
- 백엔드: N/A (34b contract 소비 only. endpoint/DB 변경 없음)

## In Scope

- 화면:
  - 앱 shell 공통 growth toast stack layer (기존 33c 단일 XP toast provider를 priority stack으로 대체)
  - `MYPAGE` 최근 성장 기록 preview(최신 live notification 3~5개) + 전체 알림 보관함 secondary surface (계정 섹션 내 inline 상세 진입, 신규 top-level route 없음)
  - `SHOPPING_FLOW` intro/empty/preview 중 1곳 이상에 안내 문구 `여러 끼니를 한번에 장보기할 수 있어요`
  - 기존 33c badge guide의 XP 안내 copy를 v2 배점(첫/반복 분리)과 모순되지 않게 갱신
  - source action 성공 화면 5종의 notification refresh trigger 연결 (레시피 저장, 커스텀 레시피북 생성, 장보기 완료, 요리 완료, **플래너 등록 — 신규 trigger**)
- API (소비 only, 변경 없음):
  - `GET /api/v1/users/me/gamification` — `notifications.priority_unseen`, `notifications.archive_preview`, 기존 33c 필드
  - `GET /api/v1/users/me/gamification/archive?limit&cursor` — 보관함 pagination
  - `POST /api/v1/users/me/gamification/notifications/seen` — 렌더링/collapse된 notification만 멱등 seen 처리
- 상태 전이 (클라이언트 UI 상태):
  - notification: `queued → visible → (auto-dismiss | user-dismiss | collapsed) → seen`
  - 렌더링되지 않은 unseen은 queue에 남고 seen 처리하지 않는다
  - archive: cursor 기반 `idle → loading-more → end(has_next=false)`
- DB 영향: 없음 (read-only 소비)
- Schema Change:
  - [x] 없음 (읽기 전용)
  - [ ] 있음

## Out of Scope

- `MYPAGE` 프로필 header 통합(등급/레벨/XP/대표 배지) — `34d-mypage-growth-profile-assets`
- badge/grade concept image 생성과 SVG/CSS production component — 34d
- 신규 badge/quest definition 추가
- backend public contract 변경 (endpoint, response shape, DB, migration)
- `GET /users/me/progress`에 badge/quest/archive field 추가, `GET /users/me`에 progress/gamification field 추가
- 장보기 끼니 묶음 기준 quest의 **수치 표시** (`shopping_meal_bundle_completed_count` 등은 public API field가 아님 — Contract Evolution Candidates 참조)
- historical/backfill notification row 생성 또는 표시 (서버가 만들지 않으며 클라이언트도 합성하지 않는다)
- leaderboard, competitive rank, pressure streak, season reset, XP decay, loot/random reward, claim CTA
- push/OS notification, 이메일 알림

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `34a-growth-model-contract-evolution` | merged | [x] |
| `34b-growth-backend-model` | merged (PR #731) | [x] |
| `33b-mypage-progress-ui` | merged | [x] |
| `33c-badges-quests-toasts-tutorial` | merged | [x] |

## Backend First Contract

34c는 34b가 main에 merge한 아래 계약을 소비한다. 이 slice에서 계약을 바꾸지 않는다.

### 소비 endpoint

| Endpoint | 용도 | 핵심 필드/규칙 |
| --- | --- | --- |
| `GET /api/v1/users/me/gamification` | toast stack 소스 + archive preview | `notifications.priority_unseen`은 **서버가 `priority ASC, created_at DESC, id DESC`로 정렬**한 unseen·toast_eligible 목록. `notifications.archive_preview`는 live non-silent 최신 5개. notification item은 `id`, `notification_type`, `priority(1~4)`, `delivery_channel`, `toast_eligible`, `group_key`, `title`, `body`, `category`, `payload`, `created_at`, `seen_at` 포함 |
| `GET /api/v1/users/me/gamification/archive` | 보관함 전체 조회 | `limit` 기본 20·최대 50, `cursor`는 opaque(`created_at\|id` base64url). 응답 `{ items[], next_cursor, has_next }`, 정렬 `created_at DESC, id DESC`, `silent` 제외. 401/422/500 |
| `POST /api/v1/users/me/gamification/notifications/seen` | seen 처리 | body `{ notification_ids: uuid[] }`. 멱등, 본인 소유만, 이미 seen 재호출 성공. 401/422/500 |

### 핵심 소비 규칙

- 클라이언트는 priority를 재계산하거나 재정렬하지 않는다. `priority_unseen` 순서를 그대로 표시 순서로 사용한다.
- `level_up`(priority 1)은 XP toast보다 강한 시각 강도(아이콘/색/크기/지속시간)로 표시한다. type별 title/body/icon/tone은 서버가 내려주는 `title`/`body`/`category`를 우선 사용한다.
- 같은 `group_key`(같은 source action) 알림은 stack 안에서 인접/묶음으로 표시해 다른 액션의 알림과 섞여 보이지 않게 한다.
- seen 처리는 **화면에 렌더링된 toast** 또는 **사용자가 의도적으로 닫거나 collapse한 notification**의 id만 보낸다. queue에만 있고 렌더링되지 않은 notification은 seen 처리하지 않는다.
- seen API 실패는 원래 source action 성공과 무관하다. 실패 시 다음 조회에서 재표시될 수 있음을 전제로 하고 rollback/재시도 강제를 하지 않는다.
- `delivery_channel='silent'` row는 서버가 응답에서 제외한다. 클라이언트는 방어적으로도 silent를 toast/archive에 노출하지 않는다.
- backfill/legacy 사용자: 서버가 historical notification row를 만들지 않으므로(34b 보장) 첫 로그인 toast burst가 없어야 하고, 클라이언트도 progress 수치 변화만으로 toast를 합성하지 않는다.

## Frontend Delivery Mode

- 디자인 확정 전: `ui/designs/MYPAGE_GAMIFICATION.md`(34c 기준으로 갱신 필요, Design Authority 참조)를 기준으로 기능 가능한 UI를 먼저 구현한다.
- 필수 상태:
  - `loading`: archive surface/preview skeleton. MYPAGE core·33b progress·33c surface loading과 분리
  - `empty`: 알림 없음 — toast 미표시, archive는 "아직 성장 기록이 없어요" 류 빈 상태
  - `error`: gamification/archive fetch 실패 시 해당 영역만 soft-fail. toast는 조용히 생략
  - `read-only`: 보관함은 조회 전용. seen 외 mutation 없음, claim CTA 없음
  - `unauthorized`: 기존 auth gate 동일(fatal). 비로그인에서는 gamification/archive API를 호출하지 않음
- toast stack 상태:
  - visible 동시 표시: **mobile 최대 2, desktop 최대 3**
  - 초과분은 queue 유지 후 빈자리에 순서대로 표시하거나 collapsed summary(예: `+N개의 새 소식`)로 묶는다. collapse를 사용자가 열거나 닫으면 해당 id들을 seen 처리한다
  - 위치: 모바일 하단 탭 위 safe area, 데스크톱 lower-right. source action 성공 피드백을 가리지 않는다
  - 자동 dismiss 후에도 해당 알림은 archive에서 다시 볼 수 있다 (`seen_at`은 보관함 제거가 아님)
- notification refresh trigger:
  - 기존 `notifyGamificationSourceAction()`(`lib/gamification-events.ts`) 경로 유지: 레시피 저장(`components/home/use-home-recipe-save-flow.ts`, `components/recipe/recipe-detail-screen.tsx`), 장보기 완료(`components/shopping/shopping-detail-screen.tsx`), 요리 완료(`components/cooking/cook-mode-screen.tsx`, `components/cooking/standalone-cook-mode-screen.tsx`), 커스텀 레시피북 생성/MYPAGE(`components/mypage/mypage-screen.tsx`)
  - **신규**: 플래너 등록 성공 경로(PlannerAddPopup·식사추가 modal의 `POST /api/v1/meals` 성공 콜백)에 trigger 추가
- 기존 33c UI migration plan:
  - `components/gamification/gamification-toast-provider.tsx`(단일 toast, `unseen[0]` 소비)를 priority stack provider로 교체한다. 같은 mount 지점(앱 shell)을 유지해 이중 toast가 생기지 않게 한다
  - `notifications.priority_unseen`을 1차 소스로 쓰되, 필드 부재(구버전 응답) 시 기존 `unseen` 기반으로 안전 degrade
  - 기존 `mypage-gamification-card.tsx`의 badge/quest/tutorial 표시는 깨지지 않아야 하며, badge guide의 XP 안내 copy만 v2 배점 기준으로 갱신한다

## Design Authority

- UI risk: `high-risk` (공통 shell notification layer 동작 변경 + MYPAGE 신규 secondary surface. 33c와 동일 클래스)
- Anchor screen dependency: 없음 — toast stack은 anchor 화면 위 overlay일 뿐 `HOME`/`RECIPE_DETAIL`/`PLANNER_WEEK`의 CTA/스크롤/정보 구조/모달 구조를 변경하지 않는다. anchor 화면 내부 구조를 건드리게 되면 그 시점에 anchor-extension으로 재분류한다
- Visual artifact:
  - `ui/designs/MYPAGE_GAMIFICATION.md` — 34c 기준으로 갱신 완료. 공식 계약(화면정의서 v1.5.16 §19 1-b)의 **mobile 2 / desktop 3** toast stack/collapse/archive surface 내용을 반영했다
  - `ui/designs/critiques/MYPAGE_GAMIFICATION-critique.md` — 34c 갱신분 re-critique 완료
  - authority report: `ui/designs/authority/GROWTH_NOTIFICATION_UI-authority.md`
- Stage 4 evidence 계획 (`ui/designs/evidence/34c-growth-notification-ui/`):
  - `mobile-390.png`, `mobile-320.png`, `desktop-1440.png` (35c profile integration 이후 archive modal 포함)
  - `toast-stack-mobile.png` (mobile 2개 visible + queue/collapse 상태), `toast-stack-desktop.png` (3개 visible)
  - `toast-levelup.png` (level_up 강조 톤 vs xp_awarded 비교가 드러나게)
  - `archive-modal.png`, `archive-empty.png`
  - `shopping-copy.png` (SHOPPING_FLOW 안내 문구 surface)
- Authority status: `reviewed`
- Notes:
  - mobile-ux-rules Rule 5: 320px sentinel에서 toast가 하단 탭/CTA를 가리거나 잘리면 blocker
  - 경쟁/압박/loot 톤 금지. level_up 강조는 celebratory하되 보상 상자형 연출 금지

## Design Status

- [ ] 임시 UI (temporary)
- [ ] 리뷰 대기 (pending-review)
- [x] 확정 (confirmed)
- [ ] N/A

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/34a-growth-model-contract-evolution/README.md`
- `docs/workpacks/34b-growth-backend-model/README.md` (Stage 2 Closeout / Handoff Notes)
- `docs/요구사항기준선-v1.7.9.md` §2-16, §2-16-a
- `docs/화면정의서-v1.5.16.md` §19 MYPAGE 1-a/1-b
- `docs/유저flow맵-v1.3.16.md` §⑪-b
- `docs/api문서-v1.2.18.md` §12-10, §12-11, §12-11b
- `docs/db설계-v1.3.14.md` §11-2e (notification priority/delivery_channel 의미)
- `docs/engineering/slice-workflow.md`, `docs/engineering/qa-system.md`, `docs/engineering/product-design-authority.md`
- `docs/design/mobile-ux-rules.md`, `docs/design/anchor-screens.md`
- `ui/designs/MYPAGE_GAMIFICATION.md`

## QA / Test Data Plan

- fixture baseline (Vitest mock / QA fixture):
  - priority 1~4가 섞인 `priority_unseen` (level_up + badge + quest + xp, 서버 정렬 순서 그대로)
  - 같은 `group_key`를 공유하는 알림 묶음 (한 source action에서 xp+level_up+badge)
  - visible max 초과 케이스: mobile 3개 이상, desktop 4개 이상 unseen
  - `silent`/`archive_only` row가 섞인 응답 (toast 미노출 검증)
  - 전부 seen인 상태 (toast 미표시, archive에는 유지)
  - empty archive (`items: []`, `has_next: false`)
  - cursor 2페이지 pagination (`has_next: true` → `next_cursor`로 2번째 페이지)
  - gamification/archive API 5xx/network 실패, 401
  - `priority_unseen` 필드가 없는 구버전 응답 (degrade 경로)
- source action mock 5종: 레시피 저장, 커스텀 레시피북 생성, 장보기 완료, 요리 완료, 플래너 등록 성공 후 `notifyGamificationSourceAction` 호출 → refresh → toast 표시/없음 안전 처리
- real DB smoke 경로: `pnpm dev:local-supabase`에서 로그인 사용자로 플래너 등록/레시피 저장을 수행해 toast stack 표시, 보관함 반영, seen 후 재진입 시 미재표시 확인
- Playwright: `tests/e2e/slice-34c-growth-notification.spec.ts` — desktop-chrome/mobile-chrome에서 toast stack 표시·우선순위 순서·seen 처리·archive surface 진입·shopping 문구. 기존 `tests/e2e/slice-33c-gamification.spec.ts` 회귀 green 유지
- seed / reset: QA fixture 서버(`pnpm dev:qa-fixtures`) notification fixture에 priority/delivery_channel/group_key 필드 보강
- blocker 조건:
  - 클라이언트가 priority를 재계산/재정렬하는 설계
  - 렌더링되지 않은 notification을 seen 처리하는 설계
  - seen 실패가 source action 실패/재시도 강제로 이어지는 설계
  - backfill/legacy 사용자 첫 로그인에서 과거 알림 toast burst
  - 장보기 quest/copy에서 리스트 완료 수와 끼니 묶음 수를 같은 수치/문구로 합치는 설계
  - MYPAGE profile header 통합(34d 범위) 침범
  - 320px에서 toast가 하단 탭/핵심 CTA를 가림

### 검증 전략

Stage 1 (이 docs PR):

```bash
pnpm validate:source-of-truth-sync
pnpm validate:workflow-v2
pnpm validate:workpack -- --slice 34c-growth-notification-ui
git diff --check
```

Stage 4 targeted checks:

```bash
pnpm vitest run tests/growth-toast-stack.test.tsx tests/gamification-archive-surface.test.tsx tests/user-gamification-api-client.test.ts tests/meal-api-client.test.ts tests/mypage-gamification-card.test.tsx tests/shopping-flow-screen.test.tsx
pnpm exec playwright test tests/e2e/slice-34c-growth-notification.spec.ts tests/e2e/slice-33c-gamification.spec.ts
CI=1 pnpm verify:frontend:pr
```

Ready for Review 전 전체 게이트: `pnpm verify:frontend` 1회 통과 + exploratory QA(`pnpm qa:explore -- --slice 34c-growth-notification-ui`) + `pnpm qa:eval`.

Stage 4 closeout evidence:

- `pnpm vitest run tests/growth-toast-stack.test.tsx tests/gamification-archive-surface.test.tsx tests/user-gamification-api-client.test.ts tests/meal-api-client.test.ts tests/mypage-gamification-card.test.tsx tests/shopping-flow-screen.test.tsx` — passed, 56 tests.
- `pnpm vitest run tests/gamification-archive-surface.test.tsx tests/mypage-screen.test.tsx tests/mypage-gamification-card.test.tsx && pnpm typecheck` — passed, 59 tests + typecheck.
- `CI=1 pnpm verify:frontend:pr` — passed (lint, typecheck, product tests, build, smoke, a11y core, visual core).
- `CI=1 pnpm verify:frontend` — attempted after the PR fast gate. Lint/typecheck/product/build/Lighthouse passed, but the full regression suite stopped on unrelated existing failures in slice-09, slice-12a, and slice-17b. The same line-targeted Playwright failures reproduced outside the 34c paths, so 34c relies on the passed `verify:frontend:pr`, targeted 34c/33c E2E, and QA/eval evidence for merge readiness.
- `pnpm qa:explore -- --slice 34c-growth-notification-ui --base-url http://127.0.0.1:3100` — generated `.artifacts/qa/34c-growth-notification-ui/2026-06-11T12-47-06-582Z/`.
- `pnpm qa:eval -- --checklist .artifacts/qa/34c-growth-notification-ui/2026-06-11T12-47-06-582Z/exploratory-checklist.json --report .artifacts/qa/34c-growth-notification-ui/2026-06-11T12-47-06-582Z/exploratory-report.json --fail-under 90` — passed, 97/100.
- Claude review was attempted with session `daf4b849-9bee-44f4-b2f5-92111db03c19`, model `claude-opus-4-8`, effort `high`, but the session returned 429 five-hour limit until `2026-06-12 01:20 KST`; per user instruction, Codex self-review continued and fixed a mobile archive auth guard plus a toast viewport-shrink timer edge case.

## Key Rules

1. 알림 표시 순서의 단일 권한자는 서버다. `priority_unseen` 정렬을 그대로 소비하고 클라이언트 재계산 금지.
2. visible toast는 mobile 최대 2, desktop 최대 3. 초과분은 queue/collapse로 처리하고 유실하지 않는다.
3. seen 처리는 렌더링된 toast와 사용자가 의도적으로 닫은/collapse한 notification id만, 멱등 API로 보낸다.
4. seen/refresh/archive 실패는 원래 source action 성공을 바꾸지 않는다 (soft-fail).
5. backfill/legacy 상태에서 과거 toast burst가 없어야 한다. 클라이언트는 notification row 없이 toast를 합성하지 않는다.
6. `silent`는 어디에도 노출하지 않고, `seen_at`은 보관함에서 제거를 의미하지 않는다.
7. 장보기 안내 문구는 `여러 끼니를 한번에 장보기할 수 있어요`를 그대로 사용하고, 리스트 완료 기준과 끼니 묶음 기준을 한 문구에서 섞지 않는다.
8. 기존 33c badge/quest/tutorial UI와 33b progress UI는 깨지지 않아야 한다 (additive 소비).
9. backend public contract(endpoint/response/DB)를 변경하지 않는다.
10. 경쟁 랭킹/압박/loot 표현 금지. level_up 강조는 집밥 서비스 톤 안에서.

## Contract Evolution Candidates (Optional)

| 후보 | 현재 계약 | 제안 계약 | 기대 사용자 가치 | 영향 문서 | 승인 상태 |
| --- | --- | --- | --- | --- | --- |
| bundle 기준 장보기 quest 수치 노출 | `shopping_meal_bundle_completed_count`/`shopping_meals_covered_count`는 서버 내부 기준만 존재, public field 없음 | `GET /users/me/gamification` quest 또는 별도 field로 bundle/covered count 노출 | 끼니 묶음 기준 quest의 `current/target` 수치 표시 가능 | 요구사항, API, 화면정의 | 미승인. 34c는 기존 `quests`/copy 표시까지만 |
| notification delivery 설정 | 모든 live notification이 toast 후보 | 사용자별 toast on/off, archive-only 전환 설정 | 알림 피로 제어 | 요구사항, API, DB, SETTINGS | 미승인. 34 시리즈 범위 밖 |

## Primary User Path

1. 사용자가 플래너에 식사를 등록한다 (또는 레시피 저장/장보기 완료/요리 완료/커스텀 북 생성).
2. 성공 직후 notification refresh가 실행되고, 서버 정렬 `priority_unseen`에서 level_up이 있으면 가장 먼저, 강조된 toast로 표시된다. 같은 액션에서 나온 XP/badge 알림은 묶여서 뒤따른다.
3. mobile에서는 최대 2개만 보이고 나머지는 queue/collapse로 대기한다. 사용자가 toast를 보거나 닫으면 해당 알림만 seen 처리된다.
4. 사용자가 MYPAGE 계정 섹션의 최근 성장 기록 preview에서 전체 보관함으로 진입해 지난 알림을 최신순으로 넘겨본다.
5. 장보기 화면에서는 `여러 끼니를 한번에 장보기할 수 있어요` 안내와 함께, 리스트 완료와 끼니 묶음 완료가 다른 개념임이 문구로 드러난다.

## Delivery Checklist

> 이 체크리스트는 Stage 4~6 동안 계속 갱신하는 living closeout 문서다.
> 34c는 FE-only slice이므로 Stage 2~3은 N/A이며, Stage 4 구현 → Stage 5 design review → Stage 6 merge로 진행한다.
> 구현 증거 없이 checkbox를 미리 닫지 않는다.
> `automation-spec.json`을 함께 쓰는 슬라이스이므로 `Manual Only`를 제외한 각 체크박스 끝에 `omo` metadata를 유지한다.

- [x] priority toast stack provider 구현 (기존 33c 단일 toast provider 대체, 같은 shell mount 유지) <!-- omo:id=delivery-toast-stack-provider;stage=4;scope=frontend;review=5,6 -->
- [x] 서버 정렬 `priority_unseen` 소비 + visible max(mobile 2/desktop 3) + queue/collapse 구현 <!-- omo:id=delivery-priority-visible-max;stage=4;scope=frontend;review=5,6 -->
- [x] type별 title/body/icon/tone 차등 표시 + level_up 강조 + group_key 묶음 표시 <!-- omo:id=delivery-type-tone-grouping;stage=4;scope=frontend;review=5,6 -->
- [x] rendered/collapsed-only seen 처리 + 멱등/soft-fail 경계 <!-- omo:id=delivery-seen-rendered-only;stage=4;scope=frontend;review=5,6 -->
- [x] source action 5종 refresh trigger 연결 (플래너 등록 신규 포함) <!-- omo:id=delivery-source-action-triggers;stage=4;scope=frontend;review=5,6 -->
- [x] archive client helper(`lib/api/user-gamification.ts` 확장) + cursor pagination <!-- omo:id=delivery-archive-client;stage=4;scope=frontend;review=5,6 -->
- [x] MYPAGE 최근 성장 기록 preview + 보관함 secondary surface (loading/empty/error/unauthorized) <!-- omo:id=delivery-archive-surface;stage=4;scope=frontend;review=5,6 -->
- [x] SHOPPING_FLOW 안내 문구 + 리스트/끼니 묶음 기준 copy 분리 <!-- omo:id=delivery-shopping-copy;stage=4;scope=frontend;review=5,6 -->
- [x] 33c badge guide XP copy v2 배점 갱신 + 33b/33c UI 회귀 없음 확인 <!-- omo:id=delivery-33c-regression-safe;stage=4;scope=frontend;review=5,6 -->
- [x] 타입 소비 정합 (`types/user-gamification.ts` 기준, 타입 변경 없이) <!-- omo:id=delivery-types;stage=4;scope=shared;review=6 -->
- [x] toast stack/archive 상태 전이·seen 정책 테스트 작성 <!-- omo:id=delivery-state-policy-tests;stage=4;scope=frontend;review=5,6 -->
- [x] Vitest / Playwright 자동화 범위 구분 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [x] `ui/designs/MYPAGE_GAMIFICATION.md` 34c 기준 갱신(visible max 충돌 해소) + critique 갱신 <!-- omo:id=delivery-design-doc-sync;stage=4;scope=frontend;review=5,6 -->
- [x] Stage 4 evidence 캡처 + authority review (`ui/designs/authority/GROWTH_NOTIFICATION_UI-authority.md`) <!-- omo:id=delivery-authority-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
