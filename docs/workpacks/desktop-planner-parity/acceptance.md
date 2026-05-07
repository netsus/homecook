# Acceptance Checklist: desktop-planner-parity

> 이 acceptance file은 데스크톱 프로토타입 플래너의 주간 요약 parity 슬라이스를 검증한다.
> 프로토타입 전용 변경이며 production 코드에 영향이 없다.
> `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Happy Path

- [x] DesktopPlanner에 주간 요약 통계(total, cooked, shopped, registered)가 표시된다 <!-- omo:id=dp-accept-summary-visible;stage=4;scope=frontend;review=6 -->
- [x] 요약 카드 수치가 seed 데이터와 일치한다 (total=10, cooked=2, shopped=2, registered=6) <!-- omo:id=dp-accept-stats-correct;stage=4;scope=frontend;review=6 -->
- [x] 날짜 범위가 WEEK_START 기반으로 "2026년 4월 20일 ~ 4월 26일"을 표시한다 <!-- omo:id=dp-accept-date-range;stage=4;scope=frontend;review=6 -->
- [x] 기존 데스크톱 7일 grid, CTA 버튼, 셀 클릭 동작이 정상이다 <!-- omo:id=dp-accept-grid-intact;stage=4;scope=frontend;review=6 -->

## State / Policy

- [x] production 앱 코드(`app/`, `components/`, `lib/`)가 변경되지 않았다 <!-- omo:id=dp-accept-no-product-change;stage=4;scope=frontend;review=6 -->
- [x] API endpoint, DB schema, status value가 추가되지 않았다 <!-- omo:id=dp-accept-no-api-db-change;stage=4;scope=frontend;review=6 -->
- [x] 모바일 `PlannerScreen` 동작이 변경되지 않았다 <!-- omo:id=dp-accept-mobile-unchanged;stage=4;scope=frontend;review=6 -->

## Error / Permission

- [x] 프로토타입 seed 데이터가 0건인 경우에도 요약 카드가 0으로 표시된다 (에러 없음) <!-- omo:id=dp-accept-zero-state;stage=4;scope=frontend;review=6 -->

## Data Integrity

- [x] 통계 계산이 모바일 `PlannerScreen`의 `stats` useMemo와 동일한 로직을 사용한다 <!-- omo:id=dp-accept-stats-logic-match;stage=4;scope=frontend;review=6 -->
- [x] 날짜 계산이 `WEEK_START` 상수에서 동적으로 파생된다 (하드코딩 아님) <!-- omo:id=dp-accept-date-dynamic;stage=4;scope=frontend;review=6 -->

## Data Setup / Preconditions

- [x] 프로토타입 seed 데이터(`makeInitialPlanner`)가 요약 카드 검증에 충분하다 (10 meals: 2 cooked, 2 shopped, 6 registered) <!-- omo:id=dp-accept-seed-sufficient;stage=4;scope=frontend;review=6 -->

## Prototype File Synchronization

- [x] `screens/desktop-screens.jsx`와 `index.html`의 해당 마커 구간이 동기화되어 있다 <!-- omo:id=dp-accept-split-sync;stage=4;scope=frontend;review=6 -->
- [x] `homecook-baemin-prototype.html`이 `index.html`과 byte-identical이다 <!-- omo:id=dp-accept-html-identical;stage=4;scope=frontend;review=6 -->

## Automation Split

### Frontend (Stage 4)

- [x] `git diff --check` 통과 <!-- omo:id=dp-accept-diff-check;stage=4;scope=frontend;review=6 -->
- [x] 브라우저에서 데스크톱 모드 전환 후 DesktopPlanner 요약 카드 표시 확인 <!-- omo:id=dp-accept-browser-verify;stage=4;scope=frontend;review=6 -->
- [x] `diff -q index.html homecook-baemin-prototype.html` 통과 <!-- omo:id=dp-accept-diff-html;stage=4;scope=frontend;review=6 -->

### Manual Only

- [ ] 사용자 최종 taste approval (데스크톱 플래너에서 요약 카드의 시각적 밀도와 배치 확인)
