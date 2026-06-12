# 34e Growth Profile Visual Polish

## Goal

34d가 의도한 "프로필 안의 성장 정보"가 실제 `/mypage` desktop에서 큰 빈 영역과 분리된 작은 카드처럼 보이는 문제를 고친다. 사용자는 프로필, 등급/레벨/XP, 대표 배지, 진행 중 퀘스트를 하나의 프로필 헤더 안에서 자연스럽게 보고, 최근 성장 기록은 보조 영역으로 분리해서 확인한다.

## Slice Type

- Change type: `product-frontend`
- Stage owner fallback: Claude token limit 상태이므로 사용자 지시에 따라 Codex가 Stage 1 docs와 Stage 4 구현까지 수행한다
- Branches:
  - docs: `docs/34e-growth-profile-visual-polish`
  - frontend: `feature/fe-34e-growth-profile-visual-polish`
- Backend/schema/API: 변경 없음. 34b/34c/34d에서 merge된 계약을 소비만 한다

## Problem Evidence

- 사용자가 제공한 production `/mypage` desktop screenshot에서 `web-mypage-profile` 카드가 archive column 높이에 끌려 커지고, profile/growth/quest가 카드 하단에 흩어져 보인다.
- badge guide의 배지가 작은 flat pictogram처럼 보여 34d의 "모양 다양화" 의도에 못 미친다.
- concept board의 `집밥 러너` 등급 이미지가 밥그릇에 신발을 넣은 형태라 비위생적이고 집밥 서비스 톤에 맞지 않는다.

## In Scope

- `MYPAGE` profile header 재구성
  - avatar, nickname, provider/login badge, settings/edit affordance
  - grade emblem + grade label + level
  - XP progress + next-level helper text
  - representative badges: mobile 최대 4개, desktop 최대 4개
  - active quest/tutorial summary를 profile header 안의 보조 행 또는 내부 section으로 통합
- `GrowthArchiveSurface`를 profile header 바깥의 secondary surface로 분리
- desktop `/mypage` layout guard
  - profile header가 첫 viewport 상단에 안정적으로 배치된다
  - archive column 높이가 profile card 높이를 늘리지 않는다
  - stats/tabs가 큰 빈 영역 때문에 화면 밖으로 밀리지 않는다
- badge visual polish
  - 기존 `plate`, `shield`, `ribbon`, `bookmark`, `pot`, `leaf`, `bowl` shape family를 유지한다
  - 각 badge는 작은 pictogram이 아니라 badge/emblem처럼 보이게 외곽, rim, depth, symbol layer를 가진다
  - badge guide modal/bottom sheet와 representative row 모두 같은 visual language를 쓴다
- grade visual hygiene rule
  - `homecook_runner` / `집밥 러너`는 신발, 발, 양말, 바닥 오염물, 음식/식기 위 이물질을 쓰지 않는다
  - `새싹 집밥러`와 구분되도록 runner visual에는 새싹을 쓰지 않는다
  - 대체 visual은 깨끗한 밥그릇 + 움직임 선 + 타이머/forward mark다
  - `homecook_artisan` / `집밥 장인`은 단순 냄비만 쓰지 않고 장인 도장, 나무 조리도구, 정교한 김/불 표현 중 2개 이상을 조합한다
- Codex image generation concept artifact를 34e design source로 남긴다
  - generated concept v2: `ui/designs/evidence/34e-growth-profile-visual-polish/profile-growth-concept-v2-collectible-grades.png`
  - generated concept v1: `ui/designs/evidence/34e-growth-profile-visual-polish/profile-growth-concept-no-footwear.png`
  - runtime production: SVG/CSS component only
- Required UI states
  - loading: profile header 내부 skeleton만 표시하고 기존 MYPAGE core loading과 분리
  - empty: 0 XP/new user에서도 `새싹 집밥러 · Lv.1` 계열 시작 상태가 깨지지 않는다
  - error: progress/gamification/archive 중 일부 실패가 profile core 전체 fatal error로 번지지 않는다
  - read-only: reward claim, loot box, competitive rank CTA 없음
  - unauthorized: 기존 MYPAGE auth gate 유지

## Out of Scope

- Backend public contract, DB schema, migration, source action writer 변경
- XP/level/grade/badge/quest 계산 로직 변경
- 신규 badge/quest definition 대량 추가
- 대표 배지를 사용자가 직접 선택하는 API/UI
- growth archive 서버 계약 변경
- leaderboard, competitive rank, pressure streak, season reset, XP decay
- loot/random rewards, reward claim CTA
- 별도 top-level growth page
- production live OAuth smoke 자동화

## Dependencies

| Slice | Status | Required |
| --- | --- | --- |
| `34a-growth-model-contract-evolution` | merged | [x] |
| `34b-growth-backend-model` | merged | [x] |
| `34c-growth-notification-ui` | merged | [x] |
| `34d-mypage-growth-profile-assets` | merged | [x] |

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.9.md` §2-16
- `docs/화면정의서-v1.5.16.md` §19 1-a/1-b
- `docs/유저flow맵-v1.3.16.md` §⑪-a/⑪-b
- `docs/api문서-v1.2.18.md` §12-9, §12-10, §12-11b
- `docs/db설계-v1.3.14.md` §11-2
- `docs/workpacks/34d-mypage-growth-profile-assets/README.md`
- `ui/designs/MYPAGE_GROWTH_PROFILE.md`
- `ui/designs/MYPAGE_GROWTH_PROFILE_POLISH.md`

## Backend First Contract

No backend work.

- `GET /api/v1/users/me/progress`
  - source for level/XP progress display
  - soft-fail: profile header keeps identity and available gamification information
- `GET /api/v1/users/me/gamification`
  - source for `grade`, `featured_badges`, badge metadata, quests/tutorial
  - soft-fail: profile identity and progress compact state remain usable
- `GET /api/v1/users/me/gamification/archive`
  - source for recent growth archive
  - archive failure must not expand or break the profile header
- Response wrapper remains `{ success, data, error }`
- Error object remains `{ code, message, fields[] }`
- Client must not compute XP, level, grade, badge unlock, or quest completion.

## Frontend Delivery Mode

- Build one integrated profile header instead of adjacent profile/growth/quest mini cards.
- Recent growth archive is a secondary surface outside the profile header.
- Avoid nested cards inside the profile header. Use sections, rows, dividers, and compact panels instead.
- Keep existing route and auth behavior.
- Mobile first-viewport guard:
  - 320px width must show identity + grade/level + XP + representative badge entry without overlap
  - bottom tab must not overlap profile content
- Desktop guard:
  - first viewport must not show a huge empty profile card
  - profile header height must be content-driven, not archive-column-driven
  - stats/tabs remain reachable without scrolling through blank space

## Design Authority

- UI risk: `high-risk` because this fixes a visible production-quality regression in MYPAGE hierarchy and badge visual system.
- Anchor screen dependency: `MYPAGE` only. HOME/RECIPE_DETAIL/PLANNER_WEEK are untouched.
- Visual artifacts:
  - Current-state evidence: user-provided production `/mypage` screenshots in chat
  - Revised concept image v2: `ui/designs/evidence/34e-growth-profile-visual-polish/profile-growth-concept-v2-collectible-grades.png`
  - Previous concept image v1: `ui/designs/evidence/34e-growth-profile-visual-polish/profile-growth-concept-no-footwear.png`
  - Design generator: `ui/designs/MYPAGE_GROWTH_PROFILE_POLISH.md`
  - Design critic: `ui/designs/critiques/MYPAGE_GROWTH_PROFILE_POLISH-critique.md`
  - Stage 4 evidence target: `ui/designs/evidence/34e-growth-profile-visual-polish/`
  - Authority report target: `ui/designs/authority/MYPAGE_GROWTH_PROFILE_POLISH-authority.md`
- Authority status: `required`

## Design Status

- [ ] 임시 UI (temporary)
- [ ] 리뷰 대기 (pending-review)
- [x] 확정 (confirmed) — Codex fallback authority pass, blocker 0 / major 0
- [ ] N/A

## QA / Test Data Plan

- Fixture baseline:
  - rich user: grade `kitchen_explorer` or `homecook_runner`, level 8, 4 featured badges, 2 active quests, archive rows
  - runner grade visual: `homecook_runner` with clean bowl/motion/timer or forward mark only
  - artisan grade visual: `homecook_artisan` with craft seal/tool/steam treatment, not plain pot only
  - all badge shape keys: `plate`, `shield`, `ribbon`, `bookmark`, `pot`, `leaf`, `bowl`
  - locked badges with `locked_hint`
  - empty/new user: 0 XP, no featured badges, tutorial quest
  - progress fetch failure only
  - gamification fetch failure only
  - archive fetch failure only
  - unauthenticated MYPAGE
- Screenshot evidence:
  - `before-production-user-screenshot-reference.md`
  - `mobile-390.png`
  - `mobile-320.png`
  - `desktop-1440.png`
  - `desktop-1920.png`
  - `badge-guide-polished.png`
  - `runner-grade-no-footwear.png`
  - `soft-fail-progress.png`
  - `soft-fail-gamification.png`
  - `soft-fail-archive.png`
- Exploratory QA:
  - `pnpm qa:explore -- --slice 34e-growth-profile-visual-polish --base-url http://127.0.0.1:3100`
  - `pnpm qa:eval -- --checklist <generated-checklist> --report <generated-report> --fail-under 90`
- Manual Only:
  - production Vercel logged-in `/mypage` smoke after deployment

## Verification Strategy

Stage 1 docs:

```bash
pnpm validate:source-of-truth-sync
pnpm validate:workflow-v2
pnpm validate:workpack -- --slice 34e-growth-profile-visual-polish
git diff --check
```

Stage 4 frontend:

```bash
pnpm vitest run tests/mypage-growth-profile.test.tsx tests/mypage-gamification-card.test.tsx tests/mypage-screen.test.tsx tests/user-gamification-api-client.test.ts
pnpm exec playwright test tests/e2e/slice-34e-growth-profile-visual-polish.spec.ts tests/e2e/slice-34d-mypage-growth-profile.spec.ts tests/e2e/slice-33c-gamification.spec.ts
CI=1 pnpm verify:frontend:pr
pnpm qa:explore -- --slice 34e-growth-profile-visual-polish --base-url http://127.0.0.1:3100
pnpm validate:source-of-truth-sync
pnpm validate:workflow-v2
pnpm validate:workpack -- --slice 34e-growth-profile-visual-polish
git diff --check
```

Ready for Review before merge:

```bash
CI=1 pnpm verify:frontend:pr
BRANCH_NAME=feature/fe-34e-growth-profile-visual-polish PR_IS_DRAFT=false pnpm validate:authority-evidence-presence
BRANCH_NAME=feature/fe-34e-growth-profile-visual-polish PR_IS_DRAFT=false pnpm validate:exploratory-qa-evidence
```

## Key Rules

1. Grade label is server authority. Do not calculate grade label from level in the client.
2. XP/level progress remains progress API authority. Do not derive XP curve locally.
3. Badge shape is visual metadata only. It must not imply rarity, rank, reward, or competitive status.
4. `집밥 러너` visual must never include shoes, feet, socks, footwear, floor dirt, or anything abnormal touching food/tableware.
5. `집밥 러너` visual must not use sprout as the main motif because it overlaps with `새싹 집밥러`.
6. `집밥 장인` visual must not be a plain cooking pot; it needs an artisan cue such as seal, crafted tool, or refined heat/steam mark.
7. Profile header height must not be controlled by archive list height.
8. Recent growth archive is secondary content and stays outside the profile header.
9. Locked badge grid stays inside guide/secondary surface, not in the first viewport profile header.
10. Existing MYPAGE core, recipebook, shopping history, settings, and auth gate must remain usable under growth API soft-fail.
11. No new dependencies.

## Primary User Path

1. 사용자가 MYPAGE에 들어온다.
2. 상단 profile header에서 닉네임/로그인 제공자와 함께 등급 emblem, `등급명 · Lv.N`, XP bar, 대표 배지를 한 덩어리로 본다.
3. 같은 header 안에서 진행 중 퀘스트 요약을 확인한다.
4. 대표 배지 또는 안내 버튼으로 badge guide를 열어 획득/잠긴 배지 hint를 확인한다.
5. 사용자는 header 아래에서 최근 성장 기록과 기존 레시피북/장보기 기록 탭으로 자연스럽게 이동한다.

## Delivery Checklist

> 이 체크리스트는 Stage 4~6 동안 계속 갱신하는 living closeout 문서다.

- [x] Stage 1 docs/acceptance/automation/work-item 잠금 <!-- omo:id=delivery-stage1-docs;stage=4;scope=frontend;review=6 -->
- [x] collectible/no-footwear concept image artifact 기록 <!-- omo:id=delivery-concept-image;stage=4;scope=frontend;review=5,6 -->
- [x] integrated profile header mobile/desktop 구현 <!-- omo:id=delivery-integrated-header;stage=4;scope=frontend;review=5,6 -->
- [x] archive를 profile header 밖 secondary surface로 분리 <!-- omo:id=delivery-archive-separated;stage=4;scope=frontend;review=5,6 -->
- [x] desktop blank-card regression 수정 <!-- omo:id=delivery-desktop-blank-regression;stage=4;scope=frontend;review=5,6 -->
- [x] badge emblem visual polish 구현 <!-- omo:id=delivery-badge-emblems;stage=4;scope=frontend;review=5,6 -->
- [x] hygienic runner grade visual 구현 <!-- omo:id=delivery-runner-hygiene;stage=4;scope=frontend;review=5,6 -->
- [x] artisan grade visual 차별화 구현 <!-- omo:id=delivery-artisan-grade;stage=4;scope=frontend;review=5,6 -->
- [x] soft-fail isolation 유지 <!-- omo:id=delivery-soft-fail;stage=4;scope=frontend;review=5,6 -->
- [x] 320/390/1440/1920 screenshot evidence + authority report <!-- omo:id=delivery-authority-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] exploratory QA/eval evidence <!-- omo:id=delivery-exploratory-qa;stage=4;scope=frontend;review=6 -->

## Implementation Evidence

- `MypageGrowthProfile` now owns identity, server `grade.label`, level/XP progress, representative badges, and active quest summary inside one profile header.
- `GrowthArchiveSurface` is rendered outside the profile header, so archive list height cannot stretch the profile card.
- `GrowthGradeMark` separates all 7 grade motifs. `homecook_runner` uses clean bowl/motion/timer treatment with no footwear or sprout, and `homecook_artisan` uses seal/tool/steam treatment instead of a plain pot.
- `GrowthBadgeIcon` keeps the 7 shape families but adds rim/depth/symbol layers so guide and representative badges read as collectible emblems.
- Codex image generation concept v2 is recorded at `ui/designs/evidence/34e-growth-profile-visual-polish/profile-growth-concept-v2-collectible-grades.png`.
- Authority report: `ui/designs/authority/MYPAGE_GROWTH_PROFILE_POLISH-authority.md`, verdict `pass`, blocker 0 / major 0.
- Screenshot evidence:
  - `ui/designs/evidence/34e-growth-profile-visual-polish/mobile-390.png`
  - `ui/designs/evidence/34e-growth-profile-visual-polish/mobile-320.png`
  - `ui/designs/evidence/34e-growth-profile-visual-polish/desktop-1440.png`
  - `ui/designs/evidence/34e-growth-profile-visual-polish/desktop-1920.png`
  - `ui/designs/evidence/34e-growth-profile-visual-polish/badge-guide-polished.png`
  - `ui/designs/evidence/34e-growth-profile-visual-polish/runner-grade-no-footwear.png`
  - `ui/designs/evidence/34e-growth-profile-visual-polish/soft-fail-progress.png`
  - `ui/designs/evidence/34e-growth-profile-visual-polish/soft-fail-gamification.png`
  - `ui/designs/evidence/34e-growth-profile-visual-polish/soft-fail-archive.png`
- Verification passed:
  - `pnpm exec tsc --noEmit --pretty false`
  - `pnpm vitest run tests/mypage-growth-profile.test.tsx tests/mypage-gamification-card.test.tsx tests/mypage-screen.test.tsx tests/user-gamification-api-client.test.ts`
  - `pnpm exec playwright test tests/e2e/slice-34e-growth-profile-visual-polish.spec.ts tests/e2e/slice-34d-mypage-growth-profile.spec.ts tests/e2e/slice-33c-gamification.spec.ts`
  - `CI=1 pnpm verify:frontend:pr`
  - `pnpm qa:eval -- --checklist .artifacts/qa/34e-growth-profile-visual-polish/2026-06-12T07-22-29-606Z/exploratory-checklist.json --report .artifacts/qa/34e-growth-profile-visual-polish/2026-06-12T07-22-29-606Z/exploratory-report.json --fail-under 90` — score 98
  - `pnpm validate:source-of-truth-sync`
  - `pnpm validate:workflow-v2`
  - `pnpm validate:workpack -- --slice 34e-growth-profile-visual-polish`
  - `git diff --check`
- Local note: the final `verify:frontend:pr` exited 0. An unrelated `slice-05` mobile-ios-small guest planner smoke retried once and then passed.

## Contract Evolution Candidates

| 후보 | 현재 계약 | 제안 계약 | 기대 사용자 가치 | 영향 문서 | 승인 상태 |
| --- | --- | --- | --- | --- | --- |
| 대표 배지 선택 | 서버 `featured_badges` 대표/최근 목록만 소비 | 사용자가 대표 배지 직접 선택 | 자기표현 강화 | 요구사항/API/DB/화면/flow | 미승인 |
| profile 성장 header 서버 summary | progress/gamification/archive를 client가 각각 호출 | profile용 read model API 추가 | 호출/soft-fail 단순화 | API/DB/요구사항 | 미승인 |
| 등급명 재브랜딩 | 34a 계약의 7개 등급명 고정 | 더 수집욕구 있는 homecook grade naming set으로 교체 또는 A/B 후보화 | 성장 단계의 재미와 badge/quest 확장성 강화 | 요구사항/API/DB/화면/flow | 미승인 |
