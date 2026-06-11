# Acceptance: 34d MYPAGE Growth Profile Assets

> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Manual Only 항목은 자동화 불가/운영 환경 확인 전용이며, merge blocker가 아니라 follow-up으로 남길 수 있다.

## Happy Path

- [ ] 로그인 사용자가 MYPAGE 프로필 영역 안에서 서버 grade label, level, XP progress, 대표 배지를 함께 본다 <!-- omo:id=accept-profile-growth-summary;stage=4;scope=frontend;review=5,6 -->
- [ ] 대표 배지 row는 mobile 최대 3개, desktop 최대 4개만 첫 viewport에 표시한다 <!-- omo:id=accept-featured-badge-limit;stage=4;scope=frontend;review=5,6 -->
- [ ] badge guide modal/bottom sheet에서 shape별 badge icon과 locked hint를 확인할 수 있다 <!-- omo:id=accept-badge-guide-hints;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 active quest/tutorial quest/최근 성장 기록 secondary surface가 profile 통합 후에도 사라지지 않는다 <!-- omo:id=accept-secondary-surfaces-retained;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [ ] client가 grade label, XP curve, badge unlock, quest completion을 계산하지 않고 서버 응답만 표시한다 <!-- omo:id=accept-server-authority;stage=4;scope=frontend;review=5,6 -->
- [ ] progress API 실패 시 XP row만 축소되고 MYPAGE core와 gamification 대표 배지/quest surface는 유지된다 <!-- omo:id=accept-progress-soft-fail;stage=4;scope=frontend;review=5,6 -->
- [ ] gamification API 실패 시 grade/badge/quest 영역만 축소되고 MYPAGE core와 progress compact state는 유지된다 <!-- omo:id=accept-gamification-soft-fail;stage=4;scope=frontend;review=5,6 -->
- [ ] 0 XP/new user 상태에서 빈 배지 row가 layout을 깨지 않고 tutorial quest 또는 시작 안내가 보인다 <!-- omo:id=accept-empty-new-user;stage=4;scope=frontend;review=5,6 -->
- [ ] read-only 성장 UI에 reward claim, loot box, competitive rank CTA가 없다 <!-- omo:id=accept-read-only-no-reward;stage=4;scope=frontend;review=5,6 -->
- [ ] locked badge 대형 grid가 MYPAGE 첫 viewport에 노출되지 않는다 <!-- omo:id=accept-locked-grid-not-first-viewport;stage=4;scope=frontend;review=5,6 -->

## Visual / Accessibility

- [ ] `plate`, `shield`, `ribbon`, `bookmark`, `pot`, `leaf`, `bowl` shape가 색상만 다른 동일 모양이 아니라 구분 가능한 SVG/CSS silhouette를 가진다 <!-- omo:id=accept-shape-variety;stage=4;scope=frontend;review=5,6 -->
- [ ] badge/grade visual은 집밥 앱 톤이며 게임 랭크, 전투, loot 보상처럼 보이지 않는다 <!-- omo:id=accept-homecook-tone;stage=4;scope=frontend;review=5,6 -->
- [ ] mobile 320px에서 프로필 성장 summary, 대표 배지, tab entry가 겹치거나 잘리지 않는다 <!-- omo:id=accept-mobile-320;stage=4;scope=frontend;review=5,6 -->
- [ ] desktop 1440px에서 profile header는 account header처럼 보이고 game dashboard처럼 과장되지 않는다 <!-- omo:id=accept-desktop-tone;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [ ] 비로그인 사용자는 기존 MYPAGE auth gate를 보고 progress/gamification API를 호출하지 않는다 <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [ ] 401/500/network mock에서 MYPAGE 전체 fatal error로 번지지 않는다 <!-- omo:id=accept-error-isolation;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [ ] fixture에 grade band 3종, all shape_key badges, locked_hint badge, empty featured badges, progress-only fail, gamification-only fail 상태가 준비되어 있다 <!-- omo:id=accept-fixture-baseline;stage=4;scope=frontend;review=5,6 -->
- [ ] Codex image generation concept artifact가 design doc과 evidence path에 연결되어 있다 <!-- omo:id=accept-image-concept-artifact;stage=4;scope=frontend;review=5,6 -->

## Test Coverage

- [ ] profile growth summary, shape component, locked hint, soft-fail state가 Vitest로 고정되어 있다 <!-- omo:id=accept-vitest;stage=4;scope=frontend;review=5,6 -->
- [ ] MYPAGE 34d E2E가 mobile/desktop에서 profile integration과 badge guide를 검증한다 <!-- omo:id=accept-e2e;stage=4;scope=frontend;review=5,6 -->
- [ ] 33b/33c/34c regression path가 깨지지 않는다 <!-- omo:id=accept-regression;stage=4;scope=frontend;review=5,6 -->

## Manual Only

- [ ] production Vercel/Supabase에서 source action 후 profile header grade/badge state가 조용히 갱신되는지 확인한다
- [ ] 제품/디자인 최종 판단으로 badge/grade concept tone이 집밥 서비스에 적합한지 확인한다
