# Acceptance Checklist

> 이 슬라이스는 FE-only visual/behavior polish다. 백엔드 항목은 N/A로 명시한다.
> acceptance는 living closeout 문서다. 체크는 테스트, screenshot, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 자동화할 수 없는 것만 허용한다.

## Happy Path

### GLOBAL::APP_SHELL
- [ ] 하단 탭이 4개 메인 화면(HOME, Planner, Pantry, MyPage) 전환 시 깜빡임 없이 지속된다 <!-- omo:id=accept-bottom-tab-persistence;stage=4;scope=frontend;review=5,6 -->
- [ ] 하단 탭 배경이 완전 불투명하며 하단 콘텐츠가 비치지 않는다 <!-- omo:id=accept-bottom-tab-opaque;stage=4;scope=frontend;review=5,6 -->
- [ ] 플래너 탭 활성 아이콘의 시각 밀도가 다른 탭 아이콘과 동일하다 <!-- omo:id=accept-planner-icon-density;stage=4;scope=frontend;review=5,6 -->
- [ ] 헤더 타이틀 정렬이 의도된 디자인과 일치한다 <!-- omo:id=accept-header-alignment;stage=4;scope=frontend;review=5,6 -->

### HOME
- [ ] 재료 필터 모달의 재료 항목이 모바일에서 2열 배치된다 (팬트리 추가 시트와 동일) <!-- omo:id=accept-ingredient-grid-2col;stage=4;scope=frontend;review=5,6 -->
- [ ] 재료 필터 모달의 시각적 스타일(칩 radius, padding, 선택 색상)이 팬트리 추가 시트 패밀리와 일관된다 <!-- omo:id=accept-ingredient-modal-family;stage=4;scope=frontend;review=5,6 -->
- [ ] `재료로 검색` 버튼 색상이 기존 역할 토큰을 사용하며 시각적으로 일관된다 <!-- omo:id=accept-ingredient-button-color;stage=4;scope=frontend;review=5,6 -->
- [ ] 컴포넌트 코드에서 `var(--olive)` 직접 참조가 0건이다 (Slice 1 결과 재확인) <!-- omo:id=accept-olive-zero;stage=4;scope=frontend;review=5,6 -->

## State / Policy
- [ ] 웹 `--web-*` 토큰과 1024px 미디어 블록 내 스타일이 변경되지 않는다 <!-- omo:id=accept-web-tokens-unchanged;stage=4;scope=frontend;review=5,6 -->
- [ ] 새로운 CSS 토큰이 도입되지 않는다 (기존 역할 토큰만 사용) <!-- omo:id=accept-no-new-tokens;stage=4;scope=frontend;review=5,6 -->
- [ ] 하단 탭 개별 렌더링 패턴(각 화면에서 `<Wave1MobileBottomTab>` 직접 렌더링)이 유지된다 <!-- omo:id=accept-bottom-tab-pattern;stage=4;scope=frontend;review=5,6 -->

## Error / Permission
- [ ] 기존 loading 상태 UI가 유지된다 <!-- omo:id=accept-loading-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 empty 상태 UI가 유지된다 <!-- omo:id=accept-empty-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 error 상태 UI가 유지된다 <!-- omo:id=accept-error-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 unauthorized 처리 흐름이 유지된다 <!-- omo:id=accept-unauthorized-preserved;stage=4;scope=frontend;review=5,6 -->

## Data Integrity
- 백엔드 항목 N/A (FE-only 슬라이스, API/DB 변경 없음)

## Data Setup / Preconditions
- [ ] 기존 fixture / mock 데이터로 HOME 화면과 재료 필터 모달이 정상 렌더링된다 (신규 데이터 불필요) <!-- omo:id=accept-fixture-renders;stage=4;scope=frontend;review=6 -->

## Manual QA
- verifier: 사용자 (수동 시각적 확인)
- environment: mobile default (390px) + narrow (320px), `pnpm dev:demo`
- scenarios:
  - HOME 화면에서 하단 탭이 안정적으로 표시되고 탭 전환 시 깜빡임 없는지 확인
  - 플래너 화면에서 CalendarIcon 활성 상태가 다른 탭 아이콘과 동일 밀도인지 확인
  - HOME `재료로 검색` 버튼 탭 후 열리는 모달에서 재료 항목이 2열로 배치되는지 확인
  - 재료 선택/해제 시 색상이 앱 브랜드 토큰과 일관되는지 확인
  - 좁은 모바일(320px)에서 2열 재료 항목이 잘리지 않는지 확인
  - 팬트리 추가 시트 열어서 재료 필터 모달과 시각적 패밀리 일관성 비교

## Automation Split

### Vitest
- [ ] 기존 컴포넌트/유틸 테스트가 전부 통과한다 (regression gate) <!-- omo:id=accept-vitest-regression;stage=4;scope=frontend;review=6 -->

### Playwright
- [ ] 기존 E2E 테스트가 전부 통과한다 (regression gate) <!-- omo:id=accept-playwright-regression;stage=4;scope=frontend;review=6 -->

### Manual Only
- [ ] HOME 재료 필터 모달 모바일 2열 배치 before/after screenshot 비교
- [ ] 하단 탭 4화면 전환 시 지속성 시각적 확인
- [ ] 팬트리 추가 시트와 재료 필터 모달의 패밀리 일관성 주관적 확인
