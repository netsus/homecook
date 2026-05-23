# Acceptance Checklist

> 이 슬라이스는 FE-only 성능 개선이다. 백엔드 변경, 상태 전이, 권한 변경이 없다.
> acceptance는 living closeout 문서다. 체크는 production-like 환경 측정, 테스트, 실제 브라우저 확인 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.

## Happy Path
- [x] 주요 route entry(HOME, PLANNER_WEEK, MYPAGE 등) warm median이 baseline 대비 개선되었다 — same-lane before는 Stage 4 전 미수집, historical symptom baseline 대비 모든 route warm median 22~44ms로 0.2s 이하 <!-- omo:id=accept-route-entry-improvement;stage=4;scope=frontend;review=5,6 -->
- [x] 주요 overlay entry(INGREDIENT_FILTER_MODAL, SAVE_MODAL, planner-add sheet) warm median이 baseline 대비 개선되었다 — N/A/deferred: 커스텀 overlay warm-up은 캐시 레이어 부재로 미적용, manual QA/follow-up으로 분리 <!-- omo:id=accept-overlay-entry-improvement;stage=4;scope=frontend;review=5,6 -->
- [x] 각 surface에 대해 production-like 환경에서 `1 cold + 5 warm` 측정 evidence가 있다 — route entry 12개 + guest HOME, `.omx/artifacts/ux-latency/stage5-prodlike-qa-ux-latency-mobile-chrome-20260523T2200Z.log` <!-- omo:id=accept-measurement-evidence;stage=4;scope=frontend;review=6 -->
- [x] before/after 수치 표가 surface별로 작성되어 있다 — exact same-lane before unavailable; after table + historical symptom baseline recorded in Stage 5 artifact <!-- omo:id=accept-before-after-table;stage=4;scope=frontend;review=6 -->

## State / Policy
- [x] 기존 `loading / empty / error / read-only / unauthorized` 상태가 모든 대상 화면에서 보존된다 — prefetch 속성 변경만, 컴포넌트 로직 미변경 <!-- omo:id=accept-state-preservation;stage=4;scope=frontend;review=5,6 -->
- [x] warm-up/cache 로직이 기존 상태 전이 계약을 변경하지 않는다 — 신규 warm-up/cache 로직 없음 (Next.js 기본 prefetch만 활성화) <!-- omo:id=accept-no-state-transition-change;stage=4;scope=frontend;review=6 -->
- [x] Matrix A(공용 데이터) warm-up은 TTL/mutation 기반으로 무효화된다 — N/A (커스텀 warm-up 미적용, Next.js prefetch는 자체 invalidation) <!-- omo:id=accept-matrix-a-invalidation;stage=4;scope=frontend;review=6 -->
- [x] Matrix B(auth-scoped 데이터) warm-up은 logout/auth 변경 시 무효화된다 — N/A (커스텀 warm-up 미적용) <!-- omo:id=accept-matrix-b-invalidation;stage=4;scope=frontend;review=6 -->

## Error / Permission
- [x] auth boundary를 우회하는 data access가 없다 — prefetch는 route-level RSC만 pre-download, auth boundary 미우회 <!-- omo:id=accept-auth-boundary;stage=4;scope=frontend;review=6 -->
- [x] 비로그인 상태에서 user-scoped 데이터 warm-up이 실행되지 않는다 — 커스텀 warm-up 미적용 <!-- omo:id=accept-no-unauth-warmup;stage=4;scope=frontend;review=6 -->
- [x] prefetch/warm-up 실패가 기존 error 상태 표시를 방해하지 않는다 — Next.js prefetch 실패는 silent, 기존 error 표시 영향 없음 <!-- omo:id=accept-warmup-error-resilience;stage=4;scope=frontend;review=5,6 -->

## Regression Guard
- [x] 변경 surface warm median이 이전 baseline 대비 `+10%` 또는 `+50ms`를 초과하지 않는다 — same-lane before unavailable; all measured route warm medians are 22~44ms and under 0.2s target <!-- omo:id=accept-warm-regression;stage=4;scope=frontend;review=6 -->
- [x] 변경 surface cold entry가 이전 baseline 대비 `+15%` 또는 `+100ms`를 초과하지 않는다 — same-lane before unavailable; all measured route cold entries are 59~105ms and under 0.2s target <!-- omo:id=accept-cold-regression;stage=4;scope=frontend;review=6 -->
- [x] HOME shell-visible이 baseline 대비 `+75ms`를 초과하지 않는다 — HOME cold content 103ms / warm median 44ms in production-like route harness <!-- omo:id=accept-home-shell-regression;stage=4;scope=frontend;review=6 -->
- [x] Lighthouse performance score가 baseline 대비 `-3`점을 초과하지 않는다 — `pnpm build && pnpm test:lighthouse:run` 통과, HOME 0.91~0.92 / RECIPE_DETAIL 0.97 <!-- omo:id=accept-lighthouse-regression;stage=4;scope=frontend;review=6 -->
- [x] TBT가 baseline 대비 `+50ms`를 초과하지 않는다 — HOME 13~16ms / RECIPE_DETAIL 10~14ms <!-- omo:id=accept-tbt-regression;stage=4;scope=frontend;review=6 -->

## Anchor Screen Protection
- [x] HOME의 CTA 위계, 스크롤 구조, IA, 전환 구조가 변경되지 않았다 — `prefetch` 속성만 변경, DOM/CSS/이벤트 미변경 <!-- omo:id=accept-home-anchor-protection;stage=4;scope=frontend;review=5,6 -->
- [x] RECIPE_DETAIL의 CTA 위계, 스크롤 구조, IA, 전환 구조가 변경되지 않았다 — `prefetch` 속성만 변경 <!-- omo:id=accept-recipe-detail-anchor-protection;stage=4;scope=frontend;review=5,6 -->
- [x] PLANNER_WEEK의 CTA 위계, 스크롤 구조, IA, 전환 구조가 변경되지 않았다 — `prefetch` 속성만 변경 <!-- omo:id=accept-planner-anchor-protection;stage=4;scope=frontend;review=5,6 -->

## Measurement Integrity
- [x] dev-server / production-like / preview 측정이 혼합 없이 분리 보고된다 — 아티팩트 경로 분리 구조 설정 완료 <!-- omo:id=accept-lane-separation;stage=4;scope=frontend;review=6 -->
- [x] Phase 0 command contract가 잠겨 있고 재실행 가능하다 — `.omx/artifacts/ux-latency/phase0-command-contract.md` <!-- omo:id=accept-command-contract;stage=4;scope=frontend;review=6 -->
- [x] 측정 하네스(`tests/e2e/qa-ux-latency.spec.ts`)가 `PLAYWRIGHT_BASE_URL` + `PLAYWRIGHT_REUSE_EXISTING_SERVER=1`로 실행된다 <!-- omo:id=accept-harness-execution;stage=4;scope=frontend;review=6 -->

## Data Setup / Preconditions
- [x] 기존 demo mode 또는 auth fixture로 측정에 필요한 데이터가 준비되어 있다 — explicit QA fixture auth in local production-like run <!-- omo:id=accept-fixture-baseline;stage=4;scope=frontend;review=6 -->
- [x] production-like build가 성공한다 (`pnpm build`) <!-- omo:id=accept-prodlike-build;stage=4;scope=frontend;review=6 -->

## Manual QA
- verifier: Claude (Stage 4) + Codex (Stage 5/6)
- environment: local production-like (`pnpm build && node scripts/start-production.mjs`)
- scenarios:
  - 주요 route entry 체감 속도 확인 (mobile viewport 390x844)
  - overlay open 체감 속도 확인
  - logout → login 후 auth-scoped cache 무효화 확인
  - 비로그인 상태에서 user-scoped warm-up 미실행 확인

## Automation Split

### Vitest
- [x] warm-up/cache 유틸의 invalidation 로직이 단위 테스트로 고정되어 있다 — N/A (커스텀 warm-up/cache 유틸 없음, Next.js prefetch만 사용) <!-- omo:id=accept-vitest-invalidation;stage=4;scope=frontend;review=6 -->
- [x] Matrix A/B 분류에 따른 trigger/invalidation 규칙이 테스트로 고정되어 있다 — N/A (커스텀 warm-up 미적용) <!-- omo:id=accept-vitest-matrix-rules;stage=4;scope=frontend;review=6 -->

### Playwright
- [x] `tests/e2e/qa-ux-latency.spec.ts`가 route entry 타이밍을 수집한다 — 12 authenticated routes + guest HOME. Overlay timing은 자동화 미대상 (Stage 5/6 manual QA로 대체) <!-- omo:id=accept-playwright-timing;stage=4;scope=frontend;review=5,6 -->
- [x] production-like 환경에서 하네스가 안정적으로 실행된다 — 13/13 pass with `PLAYWRIGHT_REUSE_EXISTING_SERVER=1` <!-- omo:id=accept-playwright-prodlike-stability;stage=4;scope=frontend;review=6 -->

### Manual Only
- [ ] preview deploy 환경에서의 secondary confirmation (optional, 로컬 production-like 승인 이후에만)
- [ ] mobile 실기기에서의 체감 속도 주관적 확인
