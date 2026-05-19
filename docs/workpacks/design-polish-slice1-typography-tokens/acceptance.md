# Acceptance Checklist

> 이 슬라이스는 FE-only visual/token cleanup이다. 백엔드 항목은 N/A로 명시한다.
> acceptance는 living closeout 문서다. 체크는 테스트, screenshot, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 자동화할 수 없는 것만 허용한다.

## Happy Path
- [ ] 앱 전역 텍스트의 font-weight가 경량화되어 가독성이 개선된다 <!-- omo:id=accept-font-weight-readability;stage=4;scope=frontend;review=5,6 -->
- [ ] 화면 제목(text-xl, text-2xl)은 700 이하, 본문(text-base)은 400~500, 카드 메타(text-sm)는 400~500 weight를 따른다 <!-- omo:id=accept-weight-scale;stage=4;scope=frontend;review=5,6 -->
- [ ] HOME, RECIPE_DETAIL, PLANNER_WEEK 앵커 화면이 정상 렌더링되고 시각적 위계가 자연스럽다 <!-- omo:id=accept-anchor-rendering;stage=4;scope=frontend;review=5,6 -->
- [ ] 컴포넌트 코드에서 `var(--olive)` / `text-olive` / `bg-olive` 직접 참조가 0건이다 <!-- omo:id=accept-olive-zero;stage=4;scope=frontend;review=5,6 -->
- [ ] 컴포넌트 코드에서 하드코딩 hex 색상 대신 역할 토큰(`--brand`, `--brand-primary`, `--text-2` 등)을 사용한다 <!-- omo:id=accept-hex-to-token;stage=4;scope=frontend;review=5,6 -->

## State / Policy
- [ ] globals.css의 앱 font-weight 토큰(`--app-font-action`, `--app-font-strong`)이 목표값으로 재조정된다 <!-- omo:id=accept-global-weight-tokens;stage=4;scope=frontend;review=5,6 -->
- [ ] globals.css의 `--olive` alias가 유지되더라도 컴포넌트 직접 참조는 제거된다 <!-- omo:id=accept-olive-alias-strategy;stage=4;scope=frontend;review=5,6 -->
- [ ] 웹 `--web-*` 토큰과 1024px 미디어 블록 내 스타일이 변경되지 않는다 <!-- omo:id=accept-web-tokens-unchanged;stage=4;scope=frontend;review=5,6 -->
- [ ] Jua 브랜드 폰트가 복원되지 않는다 <!-- omo:id=accept-jua-absent;stage=4;scope=frontend;review=6 -->

## Error / Permission
- [ ] 기존 loading 상태 UI가 유지된다 <!-- omo:id=accept-loading-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 empty 상태 UI가 유지된다 <!-- omo:id=accept-empty-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 error 상태 UI가 유지된다 <!-- omo:id=accept-error-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 unauthorized 처리 흐름이 유지된다 <!-- omo:id=accept-unauthorized-preserved;stage=4;scope=frontend;review=5,6 -->

## Data Integrity
- 백엔드 항목 N/A (FE-only 슬라이스, API/DB 변경 없음)

## Data Setup / Preconditions
- [ ] 기존 fixture / mock 데이터로 모든 앵커 화면이 정상 렌더링된다 (신규 데이터 불필요) <!-- omo:id=accept-fixture-renders;stage=4;scope=frontend;review=6 -->

## Manual QA
- verifier: 사용자 (수동 시각적 확인)
- environment: mobile default (390px) + narrow (320px), `pnpm dev:demo`
- scenarios:
  - HOME 화면에서 텍스트 가독성이 개선되었는지 확인
  - RECIPE_DETAIL 화면에서 제목/본문/메타 텍스트 weight 위계가 자연스러운지 확인
  - PLANNER_WEEK 화면에서 날짜/끼니/식사명 텍스트가 과하게 굵지 않은지 확인
  - 모든 화면에서 레거시 olive 색상이 튀는 부분이 없는지 확인
  - 좁은 모바일(320px)에서 텍스트 잘림/줄바꿈 문제 없는지 확인

## Automation Split

### Vitest
- [ ] 기존 컴포넌트/유틸 테스트가 전부 통과한다 (regression gate) <!-- omo:id=accept-vitest-regression;stage=4;scope=frontend;review=6 -->

### Playwright
- [ ] 기존 E2E 테스트가 전부 통과한다 (regression gate) <!-- omo:id=accept-playwright-regression;stage=4;scope=frontend;review=6 -->

### Manual Only
- [ ] 앵커 화면 3곳의 font-weight 가독성 주관적 개선 확인 (mobile default + narrow before/after screenshot 비교)
- [ ] 색상 일관성 주관적 확인 (olive 잔재 없음, 브랜드 토큰 일관성)
