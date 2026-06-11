# 34d MYPAGE Growth Profile Assets

## Goal

MYPAGE 첫 화면에서 성장 정보를 별도 대형 카드로 분리하지 않고, 프로필 영역 안에서 등급/레벨/XP/대표 배지를 한눈에 확인하게 한다. 배지와 등급은 생성 이미지 concept을 먼저 참고하되, 런타임 앱에는 가볍고 접근 가능한 SVG/CSS 컴포넌트로 적용한다.

## Slice Type

- Change type: `product-frontend`
- Stage owner fallback: Claude token limit 상태이므로 사용자 지시에 따라 Codex가 Stage 1 docs와 Stage 4 구현까지 수행한다
- Branches:
  - docs: `docs/34d-mypage-growth-profile-assets`
  - frontend: `feature/fe-34d-mypage-growth-profile-assets`
- Backend/schema/API: 변경 없음. 34b/34c에서 merge된 계약을 소비만 한다

## In Scope

- `MYPAGE` 프로필/account 영역 안에 성장 summary 통합
  - 등급명 + 현재 레벨
  - XP progress bar + 다음 레벨까지 남은 XP
  - 대표/최근 배지 row: mobile 최대 3개, desktop 최대 4개
- 기존 33b progress와 33c gamification surface의 중복 카드감을 줄이고, profile context 안에서 grade/level/XP/featured badges가 먼저 보이게 정리
- `GET /users/me/progress`는 level/XP progress source로 유지하고, `GET /users/me/gamification`은 grade/featured_badges/badge metadata source로 소비
- badge SVG/CSS component family 구현 검토 및 적용
  - `plate`, `shield`, `ribbon`, `bookmark`, `pot`, `leaf`, `bowl`
  - shape별 silhouette가 달라야 하며 색상만 바꾼 동일 badge 금지
- 등급 visual treatment
  - grade label은 서버 `grade.label`만 표시한다
  - client-side grade 계산 금지
  - `sprout_homecook`~`homecook_master`를 CSS tone key로만 사용하고 label은 서버 값을 우선한다
- badge guide modal/bottom sheet에서 locked badge hint 표시 개선
  - locked badge는 category별 짧은 next-action hint를 노출
  - MYPAGE 첫 viewport에는 locked badge 대형 grid를 노출하지 않는다
- Codex image generation concept artifact를 design source로 남긴다
  - generated concept: `ui/designs/evidence/34d-mypage-growth-profile-assets/badge-grade-concept.png`
  - runtime production: SVG/CSS component only
- Required UI states
  - loading: profile growth row skeleton only, MYPAGE core loading과 분리
  - empty: 0 XP/new user에서도 `새싹 집밥러 · Lv.1` 계열의 조용한 시작 상태와 tutorial quest 유지
  - error: gamification/progress 중 하나가 실패해도 가능한 부분만 축소 표시하고 MYPAGE core 유지
  - read-only: badge/grade는 조회 중심. reward claim CTA 없음
  - unauthorized: 기존 MYPAGE auth gate 유지

## Out of Scope

- Backend public contract, DB schema, migration, source action writer 변경
- 신규 badge/quest definition 대량 추가
- badge 대표 선택/정렬 API 또는 사용자 설정 API
- `GET /users/me` 또는 `GET /users/me/progress`에 badge/quest/archive field 추가
- leaderboard, competitive rank, 전체 사용자 순위
- pressure streak, season reset, XP decay
- loot/reward box, random reward, reward claim CTA
- 별도 top-level growth page
- historical/backfill archive row 생성
- 34c toast stack/archive behavior 변경

## Dependencies

| Slice | Status | Required |
| --- | --- | --- |
| `34a-growth-model-contract-evolution` | merged | [x] |
| `34b-growth-backend-model` | merged | [x] |
| `34c-growth-notification-ui` | merged | [x] |
| `33b-mypage-progress-ui` | merged | [x] |
| `33c-badges-quests-toasts-tutorial` | merged | [x] |

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.9.md` §2-16
- `docs/화면정의서-v1.5.16.md` §19 1-a/1-b
- `docs/유저flow맵-v1.3.16.md` §⑪-a/⑪-b
- `docs/api문서-v1.2.18.md` §12-9, §12-10, §12-11b
- `docs/db설계-v1.3.14.md` §11-2
- `docs/workpacks/34b-growth-backend-model/README.md`
- `docs/workpacks/34c-growth-notification-ui/README.md`
- `ui/designs/MYPAGE_GROWTH_PROFILE.md`

## Backend First Contract

No backend work.

- `GET /api/v1/users/me/progress`
  - source for level/XP progress display
  - soft-fail: growth profile keeps available gamification information or hides only the XP row
- `GET /api/v1/users/me/gamification`
  - source for `grade`, `featured_badges`, badge `category`/`shape_key`/`locked_hint`, quests/tutorial
  - soft-fail: profile core and progress UI remain usable
- Response wrapper remains `{ success, data, error }`
- Error object remains `{ code, message, fields[] }`
- Client must not compute XP, level, grade, badge unlock, or quest completion.

## Frontend Delivery Mode

- Integrate growth summary into existing MYPAGE account/profile area.
- Avoid nested cards and avoid a separate large growth card in first viewport.
- Existing secondary surfaces remain below profile:
  - active quest/tutorial quest
  - badge guide modal/bottom sheet
  - recent growth archive surface from 34c
- Mobile first-viewport guard:
  - 320px width must show profile identity + compact growth summary without overlap
  - recipebook/shopping tabs must not be pushed so far that account-only content dominates the first viewport
- Desktop guard:
  - profile region should read as an account header, not a game dashboard
  - representative badges max 4

## Design Authority

- UI risk: `high-risk` because MYPAGE account hierarchy and badge visual system change.
- Anchor screen dependency: `MYPAGE` only. HOME/RECIPE_DETAIL/PLANNER_WEEK are untouched.
- Visual artifacts:
  - Concept image: `ui/designs/evidence/34d-mypage-growth-profile-assets/badge-grade-concept.png`
  - Design generator: `ui/designs/MYPAGE_GROWTH_PROFILE.md`
  - Design critic: `ui/designs/critiques/MYPAGE_GROWTH_PROFILE-critique.md`
  - Stage 4 evidence target: `ui/designs/evidence/34d-mypage-growth-profile-assets/`
  - Authority report target: `ui/designs/authority/MYPAGE_GROWTH_PROFILE-authority.md`
- Authority status: `reviewed`

## Design Status

- [ ] 임시 UI (temporary)
- [ ] 리뷰 대기 (pending-review)
- [x] 확정 (confirmed)
- [ ] N/A

## QA / Test Data Plan

- Fixture baseline:
  - grade band examples: `sprout_homecook`, `kitchen_explorer`, `homecook_master`
  - featured badges with all `shape_key` values
  - locked badges with `locked_hint`
  - empty featured badges
  - progress fetch failure only
  - gamification fetch failure only
  - unauthenticated MYPAGE
- Screenshot evidence:
  - `mobile-390.png`
  - `mobile-320.png`
  - `desktop-1440.png`
  - `badge-shapes.png`
  - `locked-badge-hints.png`
  - `soft-fail-progress.png`
  - `soft-fail-gamification.png`
- Exploratory QA:
  - `pnpm qa:explore -- --slice 34d-mypage-growth-profile-assets --base-url http://127.0.0.1:3100`
  - `pnpm qa:eval -- --checklist .artifacts/qa/34d-mypage-growth-profile-assets/2026-06-11T14-26-06-569Z/exploratory-checklist.json --report .artifacts/qa/34d-mypage-growth-profile-assets/2026-06-11T14-26-06-569Z/exploratory-report.json --fail-under 90`
- Manual Only:
  - production Vercel/Supabase live source-action smoke: source action 후 profile header grade/badge state가 조용히 갱신되는지 확인

## Verification Strategy

Stage 1 docs:

```bash
pnpm validate:source-of-truth-sync
pnpm validate:workflow-v2
pnpm validate:workpack -- --slice 34d-mypage-growth-profile-assets
git diff --check
```

Stage 4 frontend:

```bash
pnpm vitest run tests/mypage-growth-profile.test.tsx tests/mypage-gamification-card.test.tsx tests/mypage-screen.test.tsx tests/user-gamification-api-client.test.ts
pnpm exec playwright test tests/e2e/slice-34d-mypage-growth-profile.spec.ts tests/e2e/slice-33c-gamification.spec.ts
CI=1 pnpm verify:frontend:pr
pnpm qa:explore -- --slice 34d-mypage-growth-profile-assets --base-url http://127.0.0.1:3100
pnpm qa:eval -- --checklist .artifacts/qa/34d-mypage-growth-profile-assets/2026-06-11T14-26-06-569Z/exploratory-checklist.json --report .artifacts/qa/34d-mypage-growth-profile-assets/2026-06-11T14-26-06-569Z/exploratory-report.json --fail-under 90
pnpm validate:source-of-truth-sync
pnpm validate:workflow-v2
pnpm validate:workpack -- --slice 34d-mypage-growth-profile-assets
git diff --check
```

Ready for Review before merge:

```bash
CI=1 pnpm verify:frontend:pr
BRANCH_NAME=feature/fe-34d-mypage-growth-profile-assets PR_IS_DRAFT=false pnpm validate:authority-evidence-presence
BRANCH_NAME=feature/fe-34d-mypage-growth-profile-assets PR_IS_DRAFT=false pnpm validate:exploratory-qa-evidence
```

## Key Rules

1. Grade label is server authority. Do not calculate grade label from level in the client.
2. XP/level progress remains progress API authority. Do not derive XP curve locally.
3. Badge shape is visual metadata only. It must not imply rarity, rank, reward, or competitive status.
4. First viewport may show representative badges only. Locked badge grid stays inside guide/secondary surface.
5. Locked hints are next-action hints, not pressure streak or reward claims.
6. Existing 34c toast/archive behavior remains unchanged.
7. Existing MYPAGE core, recipebook, shopping history, settings, and auth gate must remain usable under growth API soft-fail.
8. No new dependencies.

## Primary User Path

1. 사용자가 MYPAGE에 들어온다.
2. 프로필 영역에서 닉네임/제공자와 함께 `등급명 · Lv.N`, XP bar, 대표 배지 row를 본다.
3. 대표 배지를 눌러 badge guide bottom sheet/modal을 연다.
4. 사용자는 획득 배지와 잠긴 배지 hint를 확인하지만, 보상 claim이나 경쟁 순위 CTA는 보지 않는다.
5. 사용자는 같은 화면에서 기존 레시피북/장보기 기록 탭으로 자연스럽게 이동한다.

## Delivery Checklist

> 이 체크리스트는 Stage 4~6 동안 계속 갱신하는 living closeout 문서다.

- [x] Stage 1 docs/acceptance/automation/work-item 잠금 <!-- omo:id=delivery-stage1-docs;stage=4;scope=frontend;review=6 -->
- [x] Codex image generation concept artifact 기록 <!-- omo:id=delivery-concept-image;stage=4;scope=frontend;review=5,6 -->
- [x] MYPAGE profile growth summary mobile/desktop 구현 <!-- omo:id=delivery-profile-summary;stage=4;scope=frontend;review=5,6 -->
- [x] badge SVG/CSS shape component family 구현 <!-- omo:id=delivery-badge-shapes;stage=4;scope=frontend;review=5,6 -->
- [x] locked badge hint guide 표시 <!-- omo:id=delivery-locked-hints;stage=4;scope=frontend;review=5,6 -->
- [x] progress/gamification soft-fail isolation 유지 <!-- omo:id=delivery-soft-fail;stage=4;scope=frontend;review=5,6 -->
- [x] 320/390/1440 screenshot evidence + authority report <!-- omo:id=delivery-authority-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] exploratory QA/eval evidence <!-- omo:id=delivery-exploratory-qa;stage=4;scope=frontend;review=6 -->

Stage 6 docs-side closeout projection completed after PR #737 merge.

## Implementation Evidence

- `MypageGrowthProfile` integrates server `grade.label`, progress API level/XP, and representative badges inside the profile area.
- `GrowthBadgeIcon` implements `plate`, `shield`, `ribbon`, `bookmark`, `pot`, `leaf`, `bowl` with distinct SVG silhouettes.
- `MypageBadgeGuideDialog` shows earned badges and locked badge hints without reward claim or competitive rank CTA.
- `MypageGamificationCard` remains as a secondary quest/guide surface below the profile area on mobile.
- Source PR #737 merged on 2026-06-11T14:54:00Z as `0dfde41c74dea702c4d12dd2c255e63bffa3d035`.
- Verification passed:
  - `pnpm vitest run tests/mypage-growth-profile.test.tsx tests/mypage-gamification-card.test.tsx tests/mypage-screen.test.tsx tests/user-gamification-api-client.test.ts`
  - `pnpm exec playwright test tests/e2e/slice-34d-mypage-growth-profile.spec.ts tests/e2e/slice-33c-gamification.spec.ts`
  - `CI=1 pnpm verify:frontend:pr`
  - `pnpm qa:eval -- --checklist .artifacts/qa/34d-mypage-growth-profile-assets/2026-06-11T14-26-06-569Z/exploratory-checklist.json --report .artifacts/qa/34d-mypage-growth-profile-assets/2026-06-11T14-26-06-569Z/exploratory-report.json --fail-under 90`
  - authority/evidence validators
- GitHub PR #737 current-head checks passed on `019744958900d47606975c2f3070d971b0f82325`: build, quality, policy, security-smoke, QA changes/accessibility/lighthouse/smoke/visual, PR governance, Vercel, GitGuardian. `full-regression` was path-filter skipped.
- `CI=1 pnpm verify:frontend:pr` completed with exit 0. During smoke, existing slice-06 and slice-10a mobile-chrome checks were reported as flaky and passed after retry.

## Contract Evolution Candidates

| 후보 | 현재 계약 | 제안 계약 | 기대 사용자 가치 | 영향 문서 | 승인 상태 |
| --- | --- | --- | --- | --- | --- |
| 대표 배지 선택 | 서버 `featured_badges` 대표/최근 목록만 소비 | 사용자가 대표 배지 직접 선택 | 자기표현 강화 | 요구사항/API/DB/화면/flow | 미승인 |
| 배지 definition admin | 서버 코드 상수 | 운영 편집 가능한 definition table/admin | 배지 운영 속도 향상 | 요구사항/API/DB/Admin | 미승인 |
| 공개 profile badge | MYPAGE 본인 전용 | 공개 profile 대표 배지 | 공유/사회적 proof | 요구사항/API/권한/화면 | 미승인 |
