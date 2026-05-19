# Acceptance Checklist

> 이 슬라이스는 FE-only visual polish다. 백엔드 항목은 N/A로 명시한다.
> acceptance는 living closeout 문서다. 체크는 테스트, screenshot, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 자동화할 수 없는 것만 허용한다.

## Happy Path
- [x] RECIPE_DETAIL 재료 탭 인분 stepper의 `−`/`+` visible circle이 prototype 비례(28~32px)로 축소되어 있다 <!-- omo:id=accept-stepper-size;stage=4;scope=frontend;review=5,6 -->
- [x] planner-add 모달 인분 stepper의 `−`/`+` visible circle이 prototype 비례(28px)로 축소되어 있다 <!-- omo:id=accept-modal-stepper-size;stage=4;scope=frontend;review=5,6 -->
- [x] `−` 글리프와 `+` 글리프가 시각적으로 균형 잡혀 있다 (크기, 두께 유사) <!-- omo:id=accept-glyph-balance;stage=4;scope=frontend;review=5,6 -->
- [x] 모바일 히어로 좋아요/저장/요리완료 메트릭 숫자의 font-weight가 경량화되었다 (extrabold → bold) <!-- omo:id=accept-metric-weight;stage=4;scope=frontend;review=5,6 -->
- [x] 인분 `+` 버튼, 인분 아이콘, 메트릭 컨트롤의 색상이 wave1 prototype 역할과 정합되어 있다. 단, exact mint `#2AC1BC`는 contrast 회귀 방지를 위해 전역 토큰 변경 없이 앱 brand 역할 토큰으로 유지한다 <!-- omo:id=accept-color-parity;stage=4;scope=frontend;review=5,6 -->
- [x] RECIPE_DETAIL 화면이 정상 렌더링되고 시각적 위계가 자연스럽다 <!-- omo:id=accept-rendering;stage=4;scope=frontend;review=5,6 -->

## State / Policy
- [x] 웹 `--web-*` 토큰과 1024px 미디어 블록 내 스타일이 변경되지 않는다 <!-- omo:id=accept-web-tokens-unchanged;stage=4;scope=frontend;review=5,6 -->
- [x] Jua 브랜드 폰트가 복원되지 않는다 <!-- omo:id=accept-jua-absent;stage=4;scope=frontend;review=6 -->
- [x] 글로벌 `--brand-primary` 등 앱 전역 토큰 값이 변경되지 않는다 <!-- omo:id=accept-global-tokens-unchanged;stage=4;scope=frontend;review=5,6 -->
- [x] 터치 타겟이 최소 44×44px를 유지한다 <!-- omo:id=accept-touch-target;stage=4;scope=frontend;review=5,6 -->

## Error / Permission
- [x] 기존 loading 상태 UI가 유지된다 <!-- omo:id=accept-loading-preserved;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 empty 상태 UI가 유지된다 <!-- omo:id=accept-empty-preserved;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 error 상태 UI가 유지된다 <!-- omo:id=accept-error-preserved;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 unauthorized 처리 흐름이 유지된다 <!-- omo:id=accept-unauthorized-preserved;stage=4;scope=frontend;review=5,6 -->

## Data Integrity
- 백엔드 항목 N/A (FE-only 슬라이스, API/DB 변경 없음)

## Data Setup / Preconditions
- [x] 기존 fixture / mock 데이터로 RECIPE_DETAIL 화면이 정상 렌더링된다 (신규 데이터 불필요) <!-- omo:id=accept-fixture-renders;stage=4;scope=frontend;review=6 -->

## Manual QA
- verifier: 사용자 (수동 시각적 확인)
- environment: mobile default (390px), `pnpm dev:demo`
- scenarios:
  - RECIPE_DETAIL 재료 탭에서 인분 `−`/`+` 버튼 크기가 적절한지 확인
  - `−`와 `+` 글리프의 시각적 균형이 맞는지 확인
  - 히어로 이미지 위 좋아요/저장/요리완료 메트릭 숫자 굵기가 적절한지 확인
  - 플래너에 추가 바텀시트의 인분 stepper 버튼 크기가 적절한지 확인
  - 인분 아이콘, stepper 버튼, 메트릭 컨트롤의 색상이 prototype과 맞는지 확인
  - 데스크톱에서도 메트릭/stepper 영역에 regression이 없는지 확인

## Automation Split

### Vitest
- [x] 기존 컴포넌트/유틸 테스트가 전부 통과한다 (regression gate) <!-- omo:id=accept-vitest-regression;stage=4;scope=frontend;review=6 -->

### Playwright
- [x] 기존 E2E 테스트가 전부 통과한다 (regression gate) <!-- omo:id=accept-playwright-regression;stage=4;scope=frontend;review=6 -->

### Manual Only
- [ ] RECIPE_DETAIL 인분 stepper 영역 + 히어로 메트릭 영역 mobile (390px) before/after screenshot 비교
- [ ] planner-add 모달 인분 stepper 영역 mobile (390px) before/after screenshot 비교
- [ ] 색상 정합 주관적 확인 (prototype reference 대비)
