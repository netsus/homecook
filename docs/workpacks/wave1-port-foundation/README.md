# Slice: wave1-port-foundation

## Goal

공통 shell, 공용 UI 프리미티브(Button, Chip, Card, Modal/Sheet, Dropdown), CTA 위계, app-wide spacing/safe-area/sticky-bottom 규칙을 Wave1 프로토타입 기준으로 정비해, 후속 Wave1 포팅 슬라이스(B~F)가 일관된 UI foundation 위에서 작업할 수 있게 한다. API/DB/status 변경 없이 기존 승인 토큰과 컴포넌트 구조를 additive하게 보강하는 UI-only 슬라이스다.

## Branches

- 프론트엔드: `feature/fe-wave1-port-foundation`

## In Scope

- 화면: 없음 (화면 단위 변경 아님, 공용 primitive/shell 정비)
- API: 없음 (기존 API 변경 없음)
- 상태 전이: 없음
- DB 영향: 없음
- Schema Change:
  - [x] 없음 (읽기 전용)
  - [ ] 있음

### 공용 Shell 정비

- `components/layout/app-shell.tsx`: Wave1 기준 spacing/gap 조정, `bottomTabsMode` / `headerMode` 안정화
- `components/layout/app-header.tsx`: 단순화 준비 (헤더 액션 제거/이동은 Slice B~F에서 적용)
- `components/layout/bottom-tabs.tsx`: 현재 shared tab 구조 유지, `baemin-prototype-home-porting`의 HOME 전용 bottom tab과 conflict 정리

### 공용 UI Primitive 정비

- `components/ui/button.tsx`: variant/size 정리, CTA 위계 명확화 (primary/secondary/neutral/destructive)
- `components/ui/chip.tsx`: filter/selection variant spacing/radius 정합
- `components/ui/card.tsx`: interactive/loading 변형 일관성 점검
- `components/ui/badge.tsx`: variant 일관성 점검
- `components/ui/empty-state.tsx`, `components/ui/error-state.tsx`, `components/ui/skeleton.tsx`: 변경 없음 (이미 안정)

### 공용 Shared Primitive 정비

- `components/shared/modal-header.tsx`, `components/shared/modal-footer-actions.tsx`: Modal/Sheet footer label 정합
- `components/shared/content-state.tsx`: variant/tone 일관성 점검
- `components/shared/selection-chip-rail.tsx`: horizontal scroll 안정화
- Sort dropdown primitive 신규 도입 (HOME 실적용은 Slice B에서)

### App-wide Spacing / Safe-area / Sticky Bottom

- `app/globals.css`: 기존 승인 토큰 유지, `.bottom-safe` / `.action-safe-bottom-panel` 값 검증, utility class 보강 (필요 시)

## Out of Scope

- HOME, RECIPE_DETAIL, PLANNER_WEEK 화면 자체 변경 (Slice B 이후)
- API/DB/status/endpoint/field 추가 또는 변경
- `baemin-prototype-home-porting`에서 도입한 HOME 전용 mint token alias (`#2AC1BC`, `#20A8A4`, `#E6F8F7` 등) — 이 슬라이스는 production 승인 토큰 기준
- Jua 폰트 또는 prototype-only asset 도입
- 새 npm dependency 추가
- AppShell `bottomTabsMode="hidden"` 이외의 새 모드 추가
- 화면별 헤더 액션 제거/이동 (각 화면 slice에서 처리)
- Sort dropdown의 HOME 적용 (Slice B)

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `01-discovery-detail-auth` ~ `19-youtube-import` | merged | [x] |
| `planner-column-customization` | merged | [x] |
| `baemin-prototype-home-porting` | merged | [x] PR #297 merge 확인 |

### baemin-prototype-home-porting 충돌 분석

- **현재 상태**: `merged` (PR #297, 2026-04-29). HOME에 prototype AppBar, hero, search pill, inline chip rail, theme carousel, promo strip, HOME 전용 bottom tab이 도입됐다.
- **AppShell 영향**: `baemin-prototype-home-porting`은 `/`에서 shared header/bottom tab을 숨기고 HOME 전용 bottom tab을 쓴다. `AppShell.bottomTabsMode="hidden"` 옵션을 추가했다.
- **충돌 위험**: 이 슬라이스(wave1-port-foundation)는 `AppShell`의 기존 `bottomTabsMode` / `headerMode` 인터페이스를 변경하지 않고 안정화만 한다. HOME 전용 bottom tab은 `baemin-prototype-home-porting`의 ownership이다.
- **잠금 규칙**: wave1-port-foundation은 `bottom-tabs.tsx`의 shared tab(4탭: 홈/플래너/팬트리/마이) 구조만 다루고, HOME 전용 bottom tab(`baemin-prototype-home-porting` 소유)은 건드리지 않는다. 양쪽이 동시에 `AppShell` props를 변경하면 merge conflict가 발생할 수 있으므로, `baemin-prototype-home-porting`이 merge된 이후에 wave1-port-foundation의 AppShell 관련 변경을 rebase한다.
- **HOME 전용 mint token alias**: production scope 밖. wave1-port-foundation은 `docs/design/design-tokens.md`와 `app/globals.css`의 승인 값만 사용한다.

## Backend First Contract

이 슬라이스는 UI-only이며 backend 변경이 없다.

- API 변경: 없음
- 기존 `{ success, data, error }` 래퍼: 유지 (소비측 변경 없음)
- 권한 / 소유자 검증: 해당 없음
- 상태 전이: 해당 없음
- 멱등성: 해당 없음
- Stage 2: N/A — UI-only slice. 근거: 공용 shell/primitive 정비만 수행하며 route handler, DB, status transition 변경이 없다.

## Frontend Delivery Mode

- 기존 공용 컴포넌트의 additive 보강이므로 각 컴포넌트의 소비자가 기존 5개 상태를 이미 처리한다.
- 필수 상태: `loading / empty / error / read-only / unauthorized` — 각 상태의 ownership은 소비자(화면 컴포넌트)에 있다. 이 슬라이스는 primitive가 각 상태에서 올바르게 렌더되는지만 확인한다.
- Sort dropdown primitive 신규 도입 시: dropdown 자체는 stateless UI이며, 상태 관리는 소비자 책임.
- 로그인 보호 액션: 해당 없음 (primitive 수준)

## Design Authority

- UI risk: `high-risk` — 새 공용 primitive 도입(sort dropdown)과 기존 shared primitive의 시각적 정비가 후속 모든 화면에 영향을 주므로.
- Anchor screen dependency: 없음 (직접 수정하지 않음). 단, 변경된 primitive를 anchor screen이 소비하므로 간접 영향 있음.
- Visual artifact: Stage 4/5에서 mobile 390px/320px screenshot evidence를 생성하고 dev overlay 없이 재캡처했다.
  - `ui/designs/evidence/wave1-port-foundation/primitives-mobile.png`
  - `ui/designs/evidence/wave1-port-foundation/primitives-mobile-narrow.png`
- Authority status: `reviewed`
- Notes:
  - Codex Stage 5 authority report와 Claude final authority gate가 blocker 0개로 통과했다.
  - `design-generator` / `design-critic`은 화면 단위 도구이며, 이 슬라이스는 화면이 아닌 공용 primitive 정비다. 화면 설계 산출물(`ui/designs/<SCREEN_ID>.md`)은 생성하지 않는다.
  - **생략 근거**: 이 슬라이스는 신규 화면이 아니다. In Scope의 변경은 기존 공용 컴포넌트의 additive 보강과 새 dropdown primitive 하나 도입이다. 화면 단위 `design-generator` / `design-critic` 대상이 아니다. 대신 Stage 4에서 primitive 단위 screenshot evidence를 생성하고, authority review에서 후속 화면 적용 전에 primitive 품질을 확인한다.
  - raw prototype mint/Jua/asset은 production scope 밖이다. `BAEMIN_STYLE_DIRECTION.md`의 `out of prototype scope` 용어를 적용한다.

## Design Status

- [ ] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review)
- [x] 확정 (confirmed) - Codex Stage 5 review + Claude final authority gate 통과
- [ ] N/A

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/wave1-service-porting-plan.md`
- `docs/design/design-tokens.md`
- `docs/design/mobile-ux-rules.md`
- `docs/design/anchor-screens.md`
- `ui/designs/BAEMIN_STYLE_DIRECTION.md`
- `docs/engineering/product-design-authority.md`

## QA / Test Data Plan

- **fixture baseline**: 공용 primitive는 fixture/mock 없이 순수 컴포넌트 단위 테스트 가능. Storybook이 없으므로 Vitest + React Testing Library로 렌더 테스트.
- **real DB smoke 경로**: N/A — UI primitive는 DB 의존 없음.
- **seed / reset 명령**: 해당 없음.
- **bootstrap 시스템 row**: 해당 없음.
- **blocker 조건**: `baemin-prototype-home-porting`이 `AppShell` props interface를 변경한 경우 rebase 필요.

## Key Rules

- production 토큰은 `docs/design/design-tokens.md` 승인 값을 기본으로 쓴다.
- prototype mint/Jua/asset은 별도 승인 없이 공통 foundation으로 승격하지 않는다.
- 기존 컴포넌트의 public API(props interface)를 breaking하게 바꾸지 않는다. additive 보강만 허용한다.
- `AppShell` props 변경이 `baemin-prototype-home-porting`과 conflict하면 해당 slice merge 후 rebase한다.
- Sort dropdown은 stateless primitive로 도입한다. 상태 관리와 화면 적용은 소비자 slice(B~F) 책임이다.
- 카드 border-radius 16px, 터치 타겟 44px, 모달/바텀시트 20px radius 기준을 준수한다.

## Contract Evolution Candidates (Optional)

없음. 이 슬라이스는 기존 승인 토큰과 공식 컴포넌트 규칙 범위 안에서 작업한다.

## Primary User Path

1. 사용자가 어떤 화면이든 진입한다.
2. 공용 shell(AppShell, header, bottom tabs)과 공용 UI primitive(Button, Chip, Card, Modal 등)가 일관된 spacing, radius, CTA 위계로 렌더된다.
3. 후속 Wave1 슬라이스(B~F)에서 각 화면별 포팅 시 foundation primitive를 import해서 사용한다.
4. 예: Slice B에서 HOME에 sort dropdown을 적용할 때 foundation에서 도입한 `SortDropdown` primitive를 소비한다.

## Delivery Checklist

> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> Stage 2는 N/A (UI-only slice). Stage 4~6에서 프론트/QA/디자인/closeout 항목을 닫는다.

- [x] AppShell spacing/gap Wave1 기준 조정 <!-- omo:id=foundation-appshell-spacing;stage=4;scope=frontend;review=5,6 -->
- [x] AppShell bottomTabsMode/headerMode 안정화 <!-- omo:id=foundation-appshell-modes;stage=4;scope=frontend;review=5,6 -->
- [x] BottomTabs shared tab 구조 정합 확인 <!-- omo:id=foundation-bottom-tabs;stage=4;scope=frontend;review=5,6 -->
- [x] Button variant/size CTA 위계 정리 <!-- omo:id=foundation-button-cta;stage=4;scope=frontend;review=5,6 -->
- [x] Chip filter/selection variant spacing 정합 <!-- omo:id=foundation-chip-variants;stage=4;scope=frontend;review=5,6 -->
- [x] Card interactive/loading 변형 일관성 확인 <!-- omo:id=foundation-card-variants;stage=4;scope=frontend;review=5,6 -->
- [x] Modal/Sheet footer label 정합 <!-- omo:id=foundation-modal-footer;stage=4;scope=frontend;review=5,6 -->
- [x] Sort dropdown primitive 도입 <!-- omo:id=foundation-sort-dropdown;stage=4;scope=frontend;review=5,6 -->
- [x] SelectionChipRail horizontal scroll 안정화 <!-- omo:id=foundation-chip-rail-scroll;stage=4;scope=frontend;review=5,6 -->
- [x] globals.css safe-area/bottom-safe 값 검증 <!-- omo:id=foundation-globals-safe-area;stage=4;scope=frontend;review=5,6 -->
- [x] 공용 primitive Vitest 렌더 테스트 <!-- omo:id=foundation-vitest-primitives;stage=4;scope=frontend;review=5,6 -->
- [x] mobile 390/320 screenshot evidence 생성 <!-- omo:id=foundation-screenshot-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] no horizontal overflow spot check <!-- omo:id=foundation-no-overflow;stage=4;scope=frontend;review=5,6 -->
- [x] `loading / empty / error / read-only` primitive 렌더 확인 <!-- omo:id=foundation-state-ui;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm verify:frontend` 통과 <!-- omo:id=foundation-verify-frontend;stage=4;scope=frontend;review=6 -->

## Stage 6 Closeout Evidence

- Design authority: `ui/designs/authority/WAVE1_FOUNDATION-authority.md` - pass, blocker 0
- Claude final authority gate: `.omx/artifacts/claude-delegate-3f4ca745-db71-4392-a3f1-4e3c4493e9bc-wave1-port-foundation-final-authority-gate-response-20260509T204619Z.md` - pass, blocker 0
- Exploratory QA: `.artifacts/qa/wave1-port-foundation/2026-05-09T20-50-stage6/exploratory-report.json` and `eval-result.json` - score 100
- Verification: `pnpm verify:frontend`, `pnpm validate:workflow-v2`, `pnpm validate:workpack`, `PR_IS_DRAFT=false pnpm validate:authority-evidence-presence`, `git diff --check` passed
- Targeted browser check: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 PLAYWRIGHT_REUSE_EXISTING_SERVER=1 pnpm exec playwright test tests/e2e/slice-wave1-port-foundation.spec.ts --project=desktop-chrome --project=mobile-chrome --project=mobile-ios-small` passed
