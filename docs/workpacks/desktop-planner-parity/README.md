# Slice: desktop-planner-parity

## Goal

데스크톱 웹 프로토타입의 플래너 화면(`DesktopPlanner`)에 모바일 프로토타입이 이미 제공하는 주간 요약 정보(총 계획 수, 요리 완료, 장보기 완료, 등록)를 추가하고, 날짜 범위를 seed 데이터와 일치시킨다.
사용자가 데스크톱에서 플래너를 볼 때 모바일과 동일한 진행 상황 요약을 한눈에 확인할 수 있게 된다.

## Branches

- 문서: `docs/desktop-planner-parity`
- 프론트엔드: `feature/fe-desktop-planner-parity`

## In Scope

- 화면: `DesktopPlanner` (prototype `screens/desktop-screens.jsx`, `index.html`)
- API: 없음 (프로토타입 전용 — production API 소비 없음)
- 상태 전이: 없음
- DB 영향: 없음
- Schema Change:
  - [x] 없음 (프로토타입 전용)
  - [ ] 있음

### 구현 범위

1. **주간 요약 카드 추가**: 모바일 `PlannerScreen`이 제공하는 4개 통계를 데스크톱 플래너 상단에 추가
   - `이번 주 {total}개 음식 계획 중` 타이틀
   - `요리 완료 {cooked}개` (mint 배경 카드)
   - `장보기 완료 {shopped}개` (gold 배경 카드)
   - `등록 {total - cooked - shopped}개` (surface 배경 카드)
2. **날짜 범위 수정**: `DesktopPlanner`의 하드코딩된 "2026년 4월 14일 ~ 4월 20일"을 seed 데이터 `WEEK_START`(2026-04-20) 기반으로 동적 계산
3. **데스크톱 밀도 유지**: 요약 카드를 데스크톱 가로 밀도에 맞게 인라인/가로 배치 (모바일 세로 스택 대신)
4. **기존 데스크톱 grid/CTA 보존**: 7일 grid, 요리하기/장보기 CTA 버튼, 셀 클릭 동작 변경 없음
5. **`index.html`과 split source 동기화**: prototype split files(`screens/desktop-screens.jsx`)와 `index.html`의 해당 구간을 동기 상태로 유지

## Out of Scope

- 데스크톱 마이페이지, 홈, 팬트리 parity
- backend/API/schema 변경
- product Next.js 런타임 코드 변경 (프로토타입 전용 슬라이스)
- 모바일 플래너 동작 변경
- `homecook-baemin-prototype.html` 외부의 production 컴포넌트
- 새 npm 의존성 추가
- 데스크톱 플래너 정보 구조(grid 레이아웃, 네비게이션) 변경
- 데스크톱 플래너의 간식 슬롯 추가 (현재 3슬롯 grid는 데스크톱 밀도 선택이며 이 슬라이스에서 변경하지 않음)

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `baemin-prototype-planner-week-parity` | merged | [x] |
| `05-planner-week-core` | merged | [x] |

> 모든 선행 슬라이스가 merged 상태다.

## Backend First Contract

이 슬라이스에 백엔드 구현이 없다. 프로토타입 전용이며 production API를 소비하지 않는다.
기존 프로토타입 데이터 레이어(`makeInitialPlanner`, `mealItems`, `slotStatusSummary`)를 그대로 사용한다.

## Frontend Delivery Mode

- Stage 4에서 `DesktopPlanner` 프로토타입 컴포넌트에 주간 요약 카드를 추가하고 날짜를 수정한다
- 필수 상태 (프로토타입 맥락):
  - `loading`: N/A — 프로토타입은 동기 seed 데이터 사용
  - `empty`: 프로토타입 seed에 meals 0건 주간이 없으므로 별도 처리 불필요. 요약 카드의 count가 0으로 표시되면 충분
  - `error`: N/A — 프로토타입은 fetch 없음
  - `read-only`: N/A — 프로토타입 전용
  - `unauthorized`: N/A — 프로토타입은 인증 없음
- 프로토타입이므로 5개 필수 상태의 엄격한 적용 대상이 아니다. 프로토타입 seed 데이터에서 자연스럽게 파생되는 상태만 다룬다.

## Design Authority

- UI risk: `low-risk` (기존 데스크톱 프로토타입 컴포넌트에 이미 모바일에 존재하는 데이터 표시를 추가)
- Anchor screen dependency: 없음 (프로토타입 전용 — production PLANNER_WEEK 코드 변경 없음)
- Visual artifact: 불필요 — 아래 생략 근거 참조
- Authority status: `not-required`
- Notes: 이 슬라이스는 production 앱 코드를 변경하지 않는 프로토타입 전용 변경이다. 모바일 프로토타입에 이미 존재하는 요약 정보를 데스크톱 레이아웃에 맞게 배치하는 것이므로, 디자인 참조는 모바일 `PlannerScreen` 자체가 된다.

### Design artifact 생략 근거

- `ui/designs/DESKTOP_PLANNER_WEEK.md` 생성을 생략한다
- 근거: (1) 프로토타입 전용 변경으로 production 코드에 영향 없음 (2) 추가하는 UI 요소는 이미 모바일 프로토타입에 구현되어 있어 참조가 명확함 (3) 데스크톱 레이아웃 조정은 기존 `DesktopPlanner` 패턴(가로 배치, 데스크톱 밀도)을 따름 (4) low-risk UI change에 해당하여 `docs/engineering/agent-workflow-overview.md`의 Design Review Intensity 기준으로 설계 산출물 생략 가능

## Design Status

- [x] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed)
- [ ] N/A

> 프로토타입 전용 low-risk 변경이므로 Stage 4 완료 후 low-risk design check로 Stage 6에서 흡수 가능.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/baemin-prototype-planner-week-parity/README.md`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/planner.jsx` (모바일 요약 참조)
- `ui/designs/prototypes/claude-design-260505-wave1/screens/desktop-screens.jsx` (데스크톱 플래너)
- `ui/designs/prototypes/claude-design-260505-wave1/data.jsx` (`WEEK_START`, `makeInitialPlanner`)
- `ui/designs/prototypes/claude-design-260505-wave1/COVERAGE_REVIEW.md`

## QA / Test Data Plan

- fixture baseline: 프로토타입 seed 데이터 (`makeInitialPlanner` — 10 meals: 2 cooked, 2 shopped, 6 registered)
- real DB smoke 경로: N/A — 프로토타입 전용
- seed / reset 명령: 브라우저에서 `index.html` 새로고침
- bootstrap 시스템 row: N/A — 프로토타입 전용
- blocker 조건: 없음

### 이 슬라이스의 검증

- `index.html`을 브라우저에서 열어 데스크톱 모드로 전환
- DesktopPlanner에 주간 요약 카드 4개가 표시되는지 확인
- 날짜 범위가 "2026년 4월 20일 ~ 4월 26일"로 표시되는지 확인
- 요약 카드 수치가 seed 데이터와 일치하는지 확인 (total=10, cooked=2, shopped=2, registered=6)
- 기존 7일 grid, CTA 버튼, 셀 클릭 동작이 정상인지 확인
- `index.html`과 `screens/desktop-screens.jsx`가 동기 상태인지 확인
- `homecook-baemin-prototype.html`이 `index.html`과 byte-identical인지 확인 (`diff -q`)
- `git diff --check` 통과

## Key Rules

1. **프로토타입 전용**: production 앱 코드(`app/`, `components/`, `lib/`)를 변경하지 않는다.
2. **Split source 동기화**: `screens/desktop-screens.jsx` 수정 시 `index.html`의 해당 `// ===== screens/desktop-screens.jsx =====` 마커 구간도 동기화한다. `homecook-baemin-prototype.html`도 `index.html`과 byte-identical로 유지한다.
3. **모바일 참조 유지**: 요약 카드의 데이터 계산 로직은 모바일 `PlannerScreen`의 `stats` useMemo와 동일한 방식을 사용한다.
4. **데스크톱 밀도**: 요약 카드를 데스크톱 가로 레이아웃에 맞게 배치한다. 모바일의 세로 스택을 그대로 복사하지 않는다.
5. **기존 구조 보존**: 7일 grid, 3슬롯(아침/점심/저녁), CTA 버튼 위치와 동작을 변경하지 않는다.
6. **Seed 데이터 정합성**: 날짜 범위는 하드코딩이 아니라 `WEEK_START` 상수에서 동적으로 계산한다.

## Contract Evolution Candidates

없음. 프로토타입 전용 변경이며 공식 문서 계약에 영향이 없다.

## Primary User Path

1. 사용자가 프로토타입(`index.html`)을 브라우저에서 열고 상단 토글로 '데스크톱 웹' 모드를 선택한다
2. 플래너 탭으로 이동하면 DesktopPlanner 상단에 "이번 주 10개 음식 계획 중" 타이틀과 요리 완료/장보기 완료/등록 요약 카드가 표시된다
3. 날짜 범위가 seed 데이터와 일치하는 "2026년 4월 20일 ~ 4월 26일"로 표시된다
4. 기존 7일 grid에서 셀 클릭, CTA 버튼 등 모든 상호작용이 정상 동작한다

## Delivery Checklist

> 이 체크리스트는 Stage 4~6 동안 갱신하는 living closeout 문서다.
> 이 슬라이스는 BE 구현 없음(Stage 2/3 N/A), Stage 4에서 프로토타입 DesktopPlanner parity를 구현한다.

- [x] DesktopPlanner에 주간 요약 통계 계산 추가 (total/cooked/shopped) <!-- omo:id=dp-stats-compute;stage=4;scope=frontend;review=6 -->
- [x] 요약 카드 4개 UI 렌더링 (요리 완료, 장보기 완료, 등록, 전체 타이틀) <!-- omo:id=dp-summary-cards;stage=4;scope=frontend;review=6 -->
- [x] 날짜 범위를 WEEK_START 기반 동적 계산으로 수정 <!-- omo:id=dp-date-range-fix;stage=4;scope=frontend;review=6 -->
- [x] 데스크톱 밀도에 맞는 가로 배치 적용 <!-- omo:id=dp-desktop-density;stage=4;scope=frontend;review=6 -->
- [x] 기존 7일 grid/CTA/셀 클릭 동작 regression 없음 확인 <!-- omo:id=dp-no-regression;stage=4;scope=frontend;review=6 -->
- [x] `index.html`과 `screens/desktop-screens.jsx` 동기화 <!-- omo:id=dp-split-sync;stage=4;scope=frontend;review=6 -->
- [x] `homecook-baemin-prototype.html`과 `index.html` byte-identical 확인 <!-- omo:id=dp-html-identical;stage=4;scope=frontend;review=6 -->
- [x] `git diff --check` 통과 <!-- omo:id=dp-diff-check;stage=4;scope=frontend;review=6 -->
