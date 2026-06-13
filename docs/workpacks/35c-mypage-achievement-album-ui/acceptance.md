# Acceptance: 35c MYPAGE Achievement Album UI

> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, screenshot evidence, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.

## Happy Path

- [ ] MYPAGE profile header 안에서 등급, 레벨, XP, 주요 기록, 상세 버튼이 한 덩어리로 보인다 <!-- omo:id=accept-profile-header-integrated;stage=4;scope=frontend;review=5,6 -->
- [ ] `등급` 버튼이 7단계 Clay→Titanium 목록과 현재 등급 highlight를 연다 <!-- omo:id=accept-grade-modal;stage=4;scope=frontend;review=5,6 -->
- [ ] `업적` 버튼이 category tab, stamp grid, earned/active/locked 상태를 연다 <!-- omo:id=accept-achievement-modal;stage=4;scope=frontend;review=5,6 -->
- [ ] `튜토리얼` 버튼이 6개 튜토리얼 단계와 전체 완료 stamp 상태를 연다 <!-- omo:id=accept-tutorial-modal;stage=4;scope=frontend;review=5,6 -->
- [ ] `알림` 버튼이 archive filter와 최신순 성장 기록을 연다 <!-- omo:id=accept-notification-modal;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [ ] 업적/튜토리얼/알림 UI에는 reward claim CTA가 없다 <!-- omo:id=accept-no-claim-reward;stage=4;scope=frontend;review=5,6 -->
- [ ] 클라이언트가 achievement unlock, XP, grade를 계산하지 않고 서버 projection만 표시한다 <!-- omo:id=accept-server-authority;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 `GET /users/me/progress` progress-only boundary를 UI 타입/호출에서 침범하지 않는다 <!-- omo:id=accept-progress-boundary;stage=4;scope=frontend;review=5,6 -->
- [ ] leaderboard, rank, streak penalty, loot/random reward 표현이 없다 <!-- omo:id=accept-forbidden-game-patterns;stage=4;scope=frontend;review=5,6 -->
- [ ] 잠긴 업적 hint가 짧고 압박 없는 다음 행동 문구로 표시된다 <!-- omo:id=accept-locked-hints;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [ ] progress loading은 MYPAGE 전체 loading을 막지 않는다 <!-- omo:id=accept-progress-loading-isolated;stage=4;scope=frontend;review=5,6 -->
- [ ] gamification loading은 header/action 영역만 skeleton 또는 fallback으로 처리한다 <!-- omo:id=accept-gamification-loading;stage=4;scope=frontend;review=5,6 -->
- [ ] 신규 사용자 empty 상태가 `Clay · Lv.1`, XP 0, 첫 튜토리얼 active로 보인다 <!-- omo:id=accept-new-user-empty;stage=4;scope=frontend;review=5,6 -->
- [ ] gamification fetch failure가 MYPAGE core를 깨지 않고 soft-fail로 격리된다 <!-- omo:id=accept-gamification-soft-fail;stage=4;scope=frontend;review=5,6 -->
- [ ] archive fetch failure가 알림 modal 내부 error로 격리된다 <!-- omo:id=accept-archive-soft-fail;stage=4;scope=frontend;review=5,6 -->
- [ ] 비로그인 사용자는 기존 MYPAGE auth gate를 유지한다 <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->

## Responsive / Design

- [ ] 320px mobile에서 텍스트와 버튼이 잘리거나 겹치지 않는다 <!-- omo:id=accept-mobile-320-fit;stage=4;scope=frontend;review=5,6 -->
- [ ] 390px mobile에서 action buttons와 XP bar가 안정적으로 배치된다 <!-- omo:id=accept-mobile-390-fit;stage=4;scope=frontend;review=5,6 -->
- [ ] desktop에서 profile header가 long achievement/archive content 때문에 과도하게 늘어나지 않는다 <!-- omo:id=accept-desktop-header-stable;stage=4;scope=frontend;review=5,6 -->
- [ ] 모바일은 bottom sheet, desktop은 modal 또는 popover로 상세를 표시한다 <!-- omo:id=accept-responsive-modal-mode;stage=4;scope=frontend;review=5,6 -->
- [ ] spoon grade asset이 레이아웃 overflow 없이 표시된다 <!-- omo:id=accept-spoon-assets-fit;stage=4;scope=frontend;review=5,6 -->
- [ ] first viewport에 locked stamp grid를 크게 노출하지 않는다 <!-- omo:id=accept-no-locked-grid-first-viewport;stage=4;scope=frontend;review=5,6 -->

## Automation Split

### Vitest

- [ ] `tests/mypage-achievement-album.test.tsx`가 profile header, modal, achievement state를 고정한다 <!-- omo:id=accept-vitest-achievement-album;stage=4;scope=frontend;review=5,6 -->
- [ ] `tests/mypage-growth-profile.test.tsx` 기존 성장 profile regression이 통과한다 <!-- omo:id=accept-vitest-growth-profile;stage=4;scope=frontend;review=5,6 -->
- [ ] `tests/user-gamification-api-client.test.ts` additive fields와 archive 소비가 통과한다 <!-- omo:id=accept-vitest-api-client;stage=4;scope=shared;review=5,6 -->

### Playwright

- [ ] `tests/e2e/slice-35c-mypage-achievement-album.spec.ts`가 주요 modal/sheet 흐름을 검증한다 <!-- omo:id=accept-playwright-35c;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 `slice-33c-gamification` 회귀 흐름이 통과한다 <!-- omo:id=accept-playwright-33c-regression;stage=4;scope=frontend;review=5,6 -->

### Evidence

- [ ] mobile 320/390 screenshot evidence가 남는다 <!-- omo:id=accept-evidence-mobile;stage=4;scope=frontend;review=5,6 -->
- [ ] desktop 1440/1920 screenshot evidence가 남는다 <!-- omo:id=accept-evidence-desktop;stage=4;scope=frontend;review=5,6 -->
- [ ] grade/achievement/tutorial/notification modal screenshot evidence가 남는다 <!-- omo:id=accept-evidence-modals;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [ ] 운영 기존 유저 backfill 실행과 spot check는 35c UI PR 범위 밖 운영 follow-up으로 남긴다.
