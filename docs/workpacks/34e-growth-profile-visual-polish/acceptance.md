# Acceptance: 34e Growth Profile Visual Polish

> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Manual Only 항목은 자동화 불가/운영 환경 확인 전용이며, merge blocker가 아니라 follow-up으로 남길 수 있다.

## Happy Path

- [x] 로그인 사용자가 MYPAGE 상단에서 프로필, 등급/레벨/XP, 대표 배지, 진행 중 퀘스트를 하나의 통합 header로 본다 <!-- omo:id=accept-integrated-profile-header;stage=4;scope=frontend;review=5,6 -->
- [x] 최근 성장 기록은 profile header 바깥의 secondary surface로 보이며 header 높이를 늘리지 않는다 <!-- omo:id=accept-archive-secondary;stage=4;scope=frontend;review=5,6 -->
- [x] 대표 배지 또는 배지 안내 진입으로 badge guide modal/bottom sheet를 열 수 있다 <!-- omo:id=accept-badge-guide-entry;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 레시피북/장보기 기록/설정 진입이 성장 header 변경 후에도 유지된다 <!-- omo:id=accept-existing-mypage-actions;stage=4;scope=frontend;review=5,6 -->

## Layout Regression

- [x] desktop 1440px에서 production screenshot처럼 큰 빈 profile card가 생기지 않는다 <!-- omo:id=accept-desktop-no-empty-card;stage=4;scope=frontend;review=5,6 -->
- [x] desktop 1920px에서 profile/growth/quest가 card 하단에 흩어지지 않고 header 상단 구조로 읽힌다 <!-- omo:id=accept-desktop-wide-integrity;stage=4;scope=frontend;review=5,6 -->
- [x] archive list가 길어도 profile header와 stats/tabs 위치가 archive 높이에 끌려 내려가지 않는다 <!-- omo:id=accept-archive-height-isolated;stage=4;scope=frontend;review=5,6 -->
- [x] mobile 320px에서 header content, badge row, quest summary, bottom tab이 겹치거나 잘리지 않는다 <!-- omo:id=accept-mobile-320-fit;stage=4;scope=frontend;review=5,6 -->

## Visual / Hygiene

- [x] badge visuals는 작은 flat pictogram이 아니라 plate/shield/ribbon/bookmark/pot/leaf/bowl별 emblem silhouette와 depth를 가진다 <!-- omo:id=accept-badge-emblem-quality;stage=4;scope=frontend;review=5,6 -->
- [x] `집밥 러너` / `homecook_runner` visual에는 신발, 발, 양말, footwear, 바닥 오염물, 식기 위 이물질이 없다 <!-- omo:id=accept-runner-no-footwear;stage=4;scope=frontend;review=5,6 -->
- [x] runner grade는 `새싹 집밥러`와 겹치지 않도록 새싹 없이 깨끗한 밥그릇 + 움직임 선 + 타이머/forward mark 계열로 표현된다 <!-- omo:id=accept-runner-safe-concept;stage=4;scope=frontend;review=5,6 -->
- [x] `집밥 장인` / `homecook_artisan` visual은 plain pot 하나가 아니라 장인 도장, 나무 조리도구, 정교한 김/불 표현 중 2개 이상을 조합한다 <!-- omo:id=accept-artisan-craft-visual;stage=4;scope=frontend;review=5,6 -->
- [x] 성장 visual은 집밥 앱 톤이며 game rank, combat, loot reward처럼 보이지 않는다 <!-- omo:id=accept-homecook-tone;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [x] client가 grade label, XP curve, badge unlock, quest completion을 계산하지 않고 서버 응답만 표시한다 <!-- omo:id=accept-server-authority;stage=4;scope=frontend;review=5,6 -->
- [x] progress API 실패 시 XP row만 축소되고 profile core와 available gamification 정보는 유지된다 <!-- omo:id=accept-progress-soft-fail;stage=4;scope=frontend;review=5,6 -->
- [x] gamification API 실패 시 grade/badge/quest 영역만 축소되고 profile core와 progress compact state는 유지된다 <!-- omo:id=accept-gamification-soft-fail;stage=4;scope=frontend;review=5,6 -->
- [x] archive API 실패 시 recent archive만 error/empty 처리되고 profile header는 유지된다 <!-- omo:id=accept-archive-soft-fail;stage=4;scope=frontend;review=5,6 -->
- [x] 0 XP/new user 상태에서 layout이 깨지지 않고 tutorial quest 또는 시작 안내가 보인다 <!-- omo:id=accept-empty-new-user;stage=4;scope=frontend;review=5,6 -->
- [x] read-only 성장 UI에 reward claim, loot box, competitive rank CTA가 없다 <!-- omo:id=accept-read-only-no-reward;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [x] 비로그인 사용자는 기존 MYPAGE auth gate를 보고 progress/gamification/archive API를 호출하지 않는다 <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [x] 401/500/network mock에서 MYPAGE 전체 fatal error로 번지지 않는다 <!-- omo:id=accept-error-isolation;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [x] fixture에 rich user, runner grade, artisan grade, all shape_key badges, locked_hint badge, empty featured badges, progress-only fail, gamification-only fail, archive-only fail 상태가 준비되어 있다 <!-- omo:id=accept-fixture-baseline;stage=4;scope=frontend;review=5,6 -->
- [x] collectible concept v2 artifact가 design doc과 evidence path에 연결되어 있다 <!-- omo:id=accept-image-concept-artifact;stage=4;scope=frontend;review=5,6 -->

## Test Coverage

- [x] integrated profile header, archive separation, badge emblem, runner hygiene, soft-fail state가 Vitest로 고정되어 있다 <!-- omo:id=accept-vitest;stage=4;scope=frontend;review=5,6 -->
- [x] 34e E2E가 mobile/desktop에서 profile integration과 badge guide를 검증한다 <!-- omo:id=accept-e2e;stage=4;scope=frontend;review=5,6 -->
- [x] 33c/34d regression path가 깨지지 않는다 <!-- omo:id=accept-regression;stage=4;scope=frontend;review=5,6 -->
- [x] screenshot/authority evidence가 mobile 320/390, desktop 1440/1920, badge guide, soft-fail states를 포함한다 <!-- omo:id=accept-authority-evidence;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [ ] production Vercel/Supabase에서 logged-in `/mypage`가 배포 후 의도한 header 구조로 보이는지 확인한다
- [ ] 제품/디자인 최종 판단으로 revised badge/grade concept tone이 집밥 서비스에 적합한지 확인한다
