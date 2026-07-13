# Slice: service-brand-home-lockup

## Goal

HOME에서 짧은명 `무먹`과 정식명 `무엇을 먹든`의 관계를 한눈에 이해할 수 있도록, 큰 `무먹` 아래 작은 `무엇을 먹든`을 두는 세로 2단 서비스명 lockup을 제공한다. 적용 범위는 HOME의 mobile `HomeAppBar`와 desktop HOME `WebTopNav` 브랜드 영역뿐이며, 다른 AppBar·좁은 내비게이션은 기존 `무먹` 단독 표시를 유지한다.

## Approval And Ownership

- 사용자 승인: 2026-07-13. HOME에서 `무먹` 아래 작은 `무엇을 먹든`을 표시하고 오른쪽 inline 배치는 사용하지 않는 방향을 명시 승인했다.
- change type: `contract-evolution` + 후속 FE-only product slice.
- 기존 Claude 담당 Stage 1/4/final authority는 사용자의 Claude 미사용 지시에 따라 역할 분리된 새 Codex 세션이 대신한다. Stage 1 문서 작성 세션과 Stage 4 구현 세션은 자기 변경을 최종 승인하지 않는다.
- 이 Stage 1 변경은 공식 계약과 workpack/runtime metadata만 잠근다. 제품 코드·테스트·기존 screenshot/evidence는 수정하지 않는다.

## Branches

- 문서: `docs/mumeok-home-lockup-contract`
- 백엔드: N/A — API/DB 변경 없는 FE-only slice
- 프론트엔드: `feature/fe-service-brand-home-lockup`

## In Scope

- 화면:
  - mobile HOME `HomeAppBar`: 큰 `무먹` 아래 작은 `무엇을 먹든`
  - desktop HOME `WebTopNav` brand area: 큰 `무먹` 아래 작은 `무엇을 먹든`
  - HOME 외 공통 AppBar/WebTopNav/좁은 내비게이션: `무먹` 단독 유지
- 배치/위계:
  - 두 이름은 세로 2단이며 오른쪽 inline 배치를 허용하지 않는다.
  - `무먹`이 primary, `무엇을 먹든`이 더 작은 supporting name이다.
  - 작은 정식명도 320px에서 한 줄과 WCAG AA 본문 대비를 유지한다.
- 접근성:
  - 기존 HOME link/heading semantics, focus, 클릭 영역을 보존한다.
  - 읽기 순서는 `무먹` 다음 `무엇을 먹든`이며 숨김 label과 시각 text의 중복 낭독을 만들지 않는다.
- 상태:
  - loading / empty / error / filter-active를 포함한 HOME 상태에서 같은 lockup을 유지한다.
  - route, 검색/필터/rail/card, auth, return-to-action, read-only 의미와 도메인 상태 전이는 바꾸지 않는다.
- API: 신규·변경 endpoint/field/request/response/error 없음.
- DB 영향: 없음. schema, migration, seed, stored row 변화 없음.
- Schema Change:
  - [x] 없음
  - [ ] 있음 → migration 필요
- 공식 문서: 요구사항 v1.7.13, 화면정의서 v1.5.20, `CURRENT_SOURCE_OF_TRUTH`, 이 workpack/runtime metadata 동기화.

## Out of Scope

- HOME 외 AppBar/WebTopNav/텍스트 워드마크/좁은 내비게이션에 정식명 보조 줄 추가
- 오른쪽 inline lockup, 한 줄 병기, 두 이름의 동등 크기 처리
- desktop web nav 전체 높이, tab 위치, active state, right slot, interaction 변경
- HOME route, 정보 구조, 검색/필터/rail/card, theme 상태, 하단 탭 변경
- API/DB/schema/migration/seed/stored row/auth/도메인 상태 전이 변경
- 새 dependency, font/color/token, 이미지 로고, 마스코트, brand asset
- 기술 식별자, 사용자 콘텐츠, 일반명사 `집밥`, 과거 공식 버전, merged prototype/evidence 수정

## Dependencies

| 선행 항목 | 상태 | 확인 |
| --- | --- | --- |
| `service-brand-rebrand` | merged | [x] docs #985 / backend #987 / frontend #988 merge, 정식명·짧은명 계약 확정 |
| HOME current authority baseline | confirmed | [x] 기존 `ui/designs/HOME.md`와 service-brand-rebrand authority/evidence는 historical baseline으로 보존 |
| HOME lockup contract-evolution | docs | [x] 사용자 승인과 공식 문서 v1.7.13/v1.5.20 작성 |

> Stage 4는 이 docs PR merge와 internal 1.5 docs gate pass 후 시작한다. 기존 evidence 파일은 baseline으로만 읽고 덮어쓰지 않는다.

## Backend First Contract

- Stage 2/3: N/A. 이 slice는 FE-only다.
- request/path/query/response/error: 변화 없음. 기존 `{ success, data, error }`와 모든 타입을 그대로 유지한다.
- auth/owner/read-only/idempotency/state transition: 변화 없음. lockup은 표시 전용이며 새 action이나 write를 만들지 않는다.
- API route, DB migration, seed, runtime identifier가 diff에 들어오면 scope 위반으로 차단한다.

## Frontend Delivery Mode

- 기존 HOME component와 web navigation primitive를 재사용하고 HOME 호출부/variant에만 2단 lockup을 한정한다.
- mobile-first로 구현하되 desktop HOME에도 같은 세로 위계를 적용한다.
- 다른 route에서 공유 component의 기본값은 `무먹` 단독이어야 한다.
- loading / empty / error / read-only / unauthorized 동작과 화면 구조를 보존한다.
- RED/GREEN TDD로 HOME mobile/desktop lockup과 non-HOME 단독 표시 회귀를 먼저 실패시키고 최소 구현으로 통과시킨다.
- lockup 밖 spacing/token/geometry/interaction 변경은 금지한다. desktop nav height/tab 위치는 before/after에서 동일해야 한다.

## Design Authority

- UI risk: `anchor-extension` (시각 변경 자체는 low-risk지만 HOME direct modification)
- Anchor screen dependency: `HOME`
- Reused design artifact: `ui/designs/HOME.md`
- Generator/critic: 기존 confirmed HOME의 작은 텍스트 lockup 변경이므로 생략. authority evidence는 생략하지 않는다.
- Before evidence:
  - `ui/designs/evidence/service-brand-home-lockup/HOME-before-390.png`
  - `ui/designs/evidence/service-brand-home-lockup/HOME-before-320.png`
  - `ui/designs/evidence/service-brand-home-lockup/HOME-desktop-before-1280.png`
- Stage 4 after evidence:
  - `ui/designs/evidence/service-brand-home-lockup/HOME-after-390.png`
  - `ui/designs/evidence/service-brand-home-lockup/HOME-after-320.png`
  - `ui/designs/evidence/service-brand-home-lockup/HOME-desktop-after-1280.png`
  - `ui/designs/evidence/service-brand-home-lockup/HOME-accessibility-geometry-audit.json`
  - `ui/designs/evidence/service-brand-home-lockup/visual-verdict.json`
- Authority report: `ui/designs/authority/HOME-service-brand-home-lockup-authority.md`
- Authority status: `reviewed`
- Notes: 독립 Codex final authority `APPROVE`, blocker/major/minor `0/0/0`
- Evidence must prove: vertical placement, font-size hierarchy, 320px single-line fit, AA contrast, no duplicate accessible name, no page overflow, desktop nav height/tab position preservation, lockup 밖 visual drift 0.

## Design Status

- [ ] 임시 UI (temporary) — Stage 1 계약 잠금, Stage 4 구현 전
- [ ] 리뷰 대기 (pending-review) — Stage 4 구현/evidence 완료
- [x] 확정 (confirmed) — Stage 5와 독립 final authority blocker 0
- [ ] N/A — FE 화면 없음

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.13.md`
- `docs/화면정의서-v1.5.20.md`
- `docs/유저flow맵-v1.3.19.md`
- `docs/db설계-v1.3.16.md`
- `docs/api문서-v1.2.21.md`
- `docs/workpacks/service-brand-rebrand/README.md`
- `docs/engineering/slice-workflow.md`
- `docs/engineering/agent-workflow-overview.md`
- `docs/engineering/qa-system.md`
- `docs/engineering/product-design-authority.md`
- `docs/design/mobile-ux-rules.md`
- `docs/design/anchor-screens.md`
- `ui/designs/HOME.md`

## QA / Test Data Plan

### TDD / deterministic

- RED first: mobile HOME과 desktop HOME에 `무먹`/`무엇을 먹든` 두 줄이 없으면 실패하는 component test를 추가한다.
- RED first: non-HOME `AppHeader`/`WebTopNav`에 `무엇을 먹든` 보조 줄이 나타나면 실패하는 회귀 test를 추가한다.
- GREEN: 기존 component contract를 재사용한 최소 HOME-only variant로 통과시킨다.
- computed layout assertion: supporting name의 top이 primary name 아래이고 font-size가 작으며, 320px에서 한 줄·overflow 0이다.
- 접근성 assertion: 읽기 순서, accessible name 중복 없음, 기존 link/heading/focus semantics 보존, 작은 text contrast AA.

### Fixture / browser

- `pnpm dev:qa-fixtures`의 HOME guest/auth, theme loading/empty/error, filter-active fixture를 재사용한다.
- mobile 390px, narrow 320px, desktop 1280px을 동일 light-mode/device-scale-factor 조건에서 캡처한다.
- before screenshot을 구현 전에 새 workpack evidence 경로에 복사·캡처하고 이후 수정하지 않는다.
- API/DB/seed/bootstrap 변화가 없으므로 real DB write/reset은 필요하지 않다. 기존 HOME data smoke는 회귀 확인용 read-only다.

### Blocker conditions

- HOME 중 한 surface만 2단 lockup이거나 두 이름이 오른쪽 inline으로 배치됨
- non-HOME AppBar/WebTopNav/좁은 navigation에 `무엇을 먹든` 보조 줄이 확산됨
- 320px 보조 이름 줄바꿈·잘림·겹침, WCAG AA 미달, 중복 낭독 또는 focus 회귀
- page-level horizontal overflow, first viewport 검색/재료 버튼 가림
- desktop web nav height/tab 위치/right slot/interaction drift
- 기존 screenshot/evidence 수정, lockup 밖 HOME geometry/material/interaction drift
- API/DB/dependency/font/token/logo/mascot/technical identifier 변경
- 390/320/1280 before/after, audit, authority report 누락 또는 unresolved authority blocker

## Key Rules

1. HOME mobile과 desktop만 `무먹` 아래 작은 `무엇을 먹든` 세로 2단 lockup을 쓴다.
2. 다른 AppBar/WebTopNav/좁은 내비게이션은 `무먹` 단독을 유지한다.
3. `무엇을 먹든`은 smaller supporting name이며 오른쪽 inline 배치를 허용하지 않는다.
4. 320px 한 줄, AA 대비, 읽기 순서와 중복 낭독 방지를 테스트와 evidence로 잠근다.
5. desktop nav height/tab 위치/interaction과 HOME의 기존 기능·상태를 보존한다.
6. 기존 evidence와 과거 공식 버전은 수정하지 않고 새 버전/새 evidence 경로만 추가한다.
7. API/DB/dependency/logo/mascot/기술 식별자는 바꾸지 않는다.

## Contract Evolution Candidates

없음. 이 workpack은 사용자가 승인한 HOME lockup만 구현하며 전역 브랜드 표기 확장은 포함하지 않는다.

## Primary User Path

### Mobile HOME

1. 사용자가 HOME에 진입한다.
2. 상단에서 큰 `무먹`과 바로 아래 작은 `무엇을 먹든`을 함께 읽는다.
3. 짧은명과 정식명의 관계를 이해한 뒤 기존 검색/재료 필터/둘러보기 흐름을 그대로 사용한다.

### Desktop HOME

1. 사용자가 desktop HOME에 진입한다.
2. 기존 web nav brand area에서 같은 세로 2단 lockup을 본다.
3. nav 높이·탭 위치·프로필 동작 변화 없이 기존 메뉴와 탐색 흐름을 사용한다.

## Delivery Checklist

- [x] HOME mobile `HomeAppBar` 2단 lockup 구현 <!-- omo:id=home-lockup-delivery-mobile;stage=4;scope=frontend;review=5,6 -->
- [x] desktop HOME `WebTopNav` brand area 2단 lockup 구현 <!-- omo:id=home-lockup-delivery-desktop;stage=4;scope=frontend;review=5,6 -->
- [x] non-HOME `무먹` 단독 표시 회귀 보호 <!-- omo:id=home-lockup-delivery-non-home-guard;stage=4;scope=frontend;review=5,6 -->
- [x] vertical hierarchy와 320px single-line/overflow 보호 <!-- omo:id=home-lockup-delivery-responsive;stage=4;scope=frontend;review=5,6 -->
- [x] accessible reading order, contrast, 중복 낭독/focus 보호 <!-- omo:id=home-lockup-delivery-accessibility;stage=4;scope=frontend;review=5,6 -->
- [x] HOME loading/empty/error/filter-active 상태 회귀 점검 <!-- omo:id=home-lockup-delivery-state-regression;stage=4;scope=frontend;review=5,6 -->
- [x] TDD component/Playwright 자동화 범위 분리 <!-- omo:id=home-lockup-delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [x] 390/320/1280 before/after와 geometry/accessibility audit 생성 <!-- omo:id=home-lockup-delivery-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] HOME authority report blocker 0 확인 <!-- omo:id=home-lockup-delivery-authority;stage=4;scope=frontend;review=5,6 -->

### Stage 4 validation note (2026-07-13)

- 슬라이스 전용 Playwright는 390px/320px/1280 lockup, non-HOME 적용 경계, overflow, 첫 viewport, desktop nav geometry를 모두 통과했다.
- 공용 `test:e2e:a11y:core`, `test:e2e:visual:web-core` 4건, `test:e2e:visual:app-core` 8건이 모두 통과했다.
- `mobile-ios-small` HOME sort full-page 캡처의 변동 원인은 촬영기의 내부 스크롤 중 sticky 검색 영역과 fixed bottom navigation 좌표가 바뀌는 테스트 harness였다. 촬영 중에만 두 요소를 문서 좌표에 고정하고 동일 검사를 3회 연속 통과시켰다.
- 공용 visual 허용치는 완화하거나 skip하지 않았고, HOME Darwin/Linux 기준선은 실제 각 플랫폼 캡처로 갱신한다.
- [x] API/DB/dependency/logo/mascot/evidence-history out-of-scope guard 확인 <!-- omo:id=home-lockup-delivery-scope-guard;stage=4;scope=shared;review=6 -->
