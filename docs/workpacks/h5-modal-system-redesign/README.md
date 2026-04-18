# Slice: h5-modal-system-redesign

> **Gate**: `h5-modal-system-direction` ✅ 승인 2026-04-17  
> **Contract**: 화면정의서 v1.5.0 (PR #143 merged 2026-04-17)

## Goal

`PlannerAddSheet`, `SaveModal`, `IngredientFilterModal`, `SortSheet` 네 모달을 **Quiet Kitchen Sheets** 공통 modal system으로 통일한다. 기능은 유지하고 chrome과 hierarchy를 정리해, 네 모달이 한 제품의 같은 계열 인터랙션처럼 느껴지도록 만든다. 이 슬라이스가 끝나면 사용자는 어떤 모달을 열든 같은 조용하고 정갈한 선택 경험을 얻게 된다.

### 잠긴 결정 (재탐색 금지)

| # | 결정 |
|---|------|
| D1 | accent = `olive base + thin orange highlight` |
| D2 | 인터랙션 모달 eyebrow 기본 제거 |
| D3 | close = icon-only 원형 버튼 (`44×44`, `aria-label="닫기"`) |
| D4 | 날짜 chip = `요일 + 4/17` (PlannerAdd) |
| D5 | Save 제목 = `레시피 저장` |
| D6 | 네 모달을 하나의 modal family로 통일 |

### Copy Lock

재협의 없이 구현에서 그대로 사용한다.

| Modal | Title | Helper | Primary CTA |
|------|-------|--------|-------------|
| Planner Add | `플래너에 추가` | `날짜와 끼니를 선택해 주세요` | `플래너에 추가` |
| Save | `레시피 저장` | `저장할 레시피북을 선택하세요` | `저장` |
| Ingredient Filter | `재료로 검색` | `원하는 재료를 골라 레시피를 좁혀요` | `N개 적용` / `적용` |
| Sort | `정렬 기준` | `모든 레시피 순서를 바꿔요` | 없음 (즉시 적용) |

---

## Branches

- 백엔드: 해당 없음 (FE-only slice)
- 프론트엔드: `feature/fe-h5-modal-system-redesign`

---

## In Scope

- **화면**: `RECIPE_DETAIL` (PlannerAdd, Save), `HOME` (IngredientFilter, Sort)
- **API**: 없음 (기존 계약 그대로 소비)
- **상태 전이**: 없음 (기존 플로우 유지)
- **DB 영향**: 없음
- **Schema Change**:
  - [x] 없음 (읽기 전용 / 기존 API 소비)

### 변경 대상 컴포넌트

| 컴포넌트 | 파일 | 주요 변경 |
|---------|------|---------|
| `PlannerAddSheet` | `components/recipe/planner-add-sheet.tsx` | eyebrow 제거, 날짜 chip `요일 + 4/17`, 인분 hierarchy (`2` + 작은 `인분`) |
| `SaveModal` | `components/recipe/save-modal.tsx` | eyebrow 제거, 제목 `레시피 저장`, close icon-only, create block 무게 축소 |
| `IngredientFilterModal` | `components/home/ingredient-filter-modal.tsx` | eyebrow 제거, close icon-only, category rail scrollbar 억제 + fade |
| `SortSheet` / sort dropdown | `components/home/home-screen.tsx` | eyebrow 제거, `현재 {label}` badge 제거, selected → olive tint |

### 신규 Shared 컴포넌트

| 컴포넌트 | 파일 | 책임 |
|---------|------|------|
| `ModalHeader` | `components/shared/modal-header.tsx` | title + optional description + icon close |
| `ModalFooterActions` | `components/shared/modal-footer-actions.tsx` | secondary + primary CTA (44px 이상) |
| `OptionRow` | `components/shared/option-row.tsx` | selected/idle row (olive tint, dark fill 없음) |
| `SelectionChipRail` | `components/shared/selection-chip-rail.tsx` | localized horizontal scroll + fade affordance |
| `NumericStepperCompact` | `components/shared/numeric-stepper-compact.tsx` | 숫자 + 단위 hierarchy 분리 |

---

## Out of Scope

- 로그인 게이트 / 에러 상태 셸 전체 재설계
- API/DB 계약 변경
- 기능 플로우 변경 (정렬 즉시 적용 유지, 플래너 추가 성공 후 동작 유지)
- full-page form 또는 non-modal 구조 변경
- 새로운 modal primitive 라이브러리 도입
- 비교안 재탐색 또는 D1~D6 방향 재실험

---

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
|-------------|------|------|
| `h5-modal-system-direction` (Gate) | merged | ✅ |
| `06-recipe-to-planner` (PlannerAdd 기반) | merged | ✅ |
| `04-recipe-save` (SaveModal 기반) | merged | ✅ |
| `02-discovery-filter` (IngredientFilter 기반) | merged | ✅ |

> contract-evolution PR #143 (화면정의서 v1.5.0) merge 완료. FE 구현 착수 가능.

---

## Backend First Contract

이 슬라이스는 **FE-only**다. API/DB 계약은 변경하지 않으며 기존 계약을 그대로 소비한다.

| 소비 API | 변경 여부 | 비고 |
|---------|---------|------|
| `GET /ingredients` | 없음 | IngredientFilter 재료 목록 |
| `GET /recipes` | 없음 | 기존 recipe 조회 |
| `POST /meals` | 없음 | PlannerAdd 결과 저장 |
| `POST /recipes/{id}/save` | 없음 | Save 저장 |
| `GET /recipe-books` | 없음 | Save 책 목록 |

**기능 플로우 불변 원칙:**
- 정렬: 즉시 적용형 유지 (탭 → 적용 → sheet 닫힘)
- PlannerAdd 성공: 기존 성공 후 동작 유지 (toast만 표시)
- Save 성공: 기존 성공 후 동작 유지
- IngredientFilter: 적용 버튼 → 필터 반영 흐름 유지

---

## Frontend Delivery Mode

- **디자인 확정 상태**: 화면정의서 v1.5.0 + h5-modal-system-direction 결정이 잠겨 있으므로 임시 UI 단계 없이 바로 확정 방향으로 구현한다.
- **필수 상태**: `loading` / `empty` / `error` — 각 modal이 이미 처리 중인 상태는 그대로 유지
- **로그인 보호**: 기존 return-to-action 흐름 유지 (변경 없음)

### 구현 Pass 순서

#### Pass 1 — Chrome 통일 (4개 modal 전체)
- close button: icon-only 원형 ghost (`44×44`)
- header: eyebrow 제거, title 짧은 명사형, helper 1줄 optional
- footer: primary olive, secondary surface

#### Pass 2 — Selection Language 통일
- selected row: olive tint (dark fill / orange fill 제거)
- chip selected: olive fill
- rail: fade/peek affordance (초기 scrollbar 억제)
- badge: title 옆 또는 CTA 한 군데만

#### Pass 3 — Density Polish
- PlannerAdd 날짜(`요일 + 4/17`) + 인분(`2` + 작은 `인분`) 균형
- Save create block 무게 축소
- IngredientFilter rail/검색/목록 spacing 정리
- Sort option compactness

### 스타일 토큰 기준

| 요소 | 기준 |
|------|------|
| Close button | `44×44` circle ghost, border 없음, hover: surface tint |
| Header title | `text-xl`~`text-2xl`, `font-extrabold` |
| Header helper | `text-sm`, `text-[var(--muted)]` |
| Option row | min-height `44px`, selected: olive tint, meta: `text-xs` |
| Date chip (weekday) | `text-xs` |
| Date chip (date) | `text-xs`~`text-sm`, selected: olive fill |

**Orange 허용 위치**: 작은 `+` affordance, tiny count accent, 얇은 underline/focus ring, today dot  
**Orange 금지 위치**: 주요 CTA 전체 fill, 선택 row 전체 배경, modal header title

---

## Design Authority

- **UI risk**: `anchor-extension` (RECIPE_DETAIL + HOME 앵커 화면 수정)
- **Anchor screen dependency**: `RECIPE_DETAIL`, `HOME`
- **Visual artifact**: `ui/designs/evidence/h5-modal-system-redesign/` (E1~E10, Stage 4 캡처)
- **Authority status**: `required`

### 화면별 Design 문서 linkage

H5는 HOME / RECIPE_DETAIL 화면 **구조**(레이아웃, 섹션, primary actions)를 바꾸지 않는다. 변경 범위는 이 화면들 위에 overlay되는 **modal chrome**만이다. 따라서 화면-수준 design 문서는 기존 파일을 재사용하고, modal-수준 design 문서는 H5 전용 wireframe을 사용한다.

#### HOME

| 역할 | 문서 | 기준 버전 | H5 유효성 |
|------|------|---------|---------|
| 화면 설계 | `ui/designs/HOME.md` | v1.4.0 (H1 반영 완료) | ✅ — 화면 구조 변경 없음. H5 후 modal 섹션 갱신 예정 (Delivery Checklist) |
| 설계 critique | `ui/designs/critiques/HOME-critique.md` | 🟡 (2026-03-21, v1.2.3 기준) | ✅ — 화면 구조 수준 검토 유효. H5 modal chrome 변화는 미포함 (아래 modal critique로 보완) |

#### RECIPE_DETAIL

| 역할 | 문서 | 기준 버전 | H5 유효성 |
|------|------|---------|---------|
| 화면 설계 | `ui/designs/RECIPE_DETAIL.md` | v1.2.3 기준 | ✅ — 화면 구조 변경 없음. H5 후 modal 섹션 갱신 예정 (Delivery Checklist) |
| 설계 critique | `ui/designs/critiques/RECIPE_DETAIL-critique.md` | 🟢 (2026-04-16, v1.2.3 기준) | ✅ — 화면 구조 수준 검토 유효. H5 modal chrome 변화는 미포함 (아래 modal critique로 보완) |

#### Modal System (H5 전용)

| 역할 | 문서 | H5 유효성 |
|------|------|---------|
| modal 설계 | `ui/designs/MODAL_SYSTEM-wireframes.md` | ✅ — 4개 modal chrome + copy lock 전체를 담은 H5 전용 design 산출물 |
| modal critique | `docs/design/modal-system-redesign-draft/acceptance.md` | ✅ — Codex가 draft 단계에서 작성한 modal-level critique 역할. D1~D6 방향을 포함해 모든 acceptance 기준이 🟢 통과 |

#### 기존 화면 설계 문서 재사용 근거

H5에서 HOME / RECIPE_DETAIL 기존 design 문서를 새로 실행하지 않고 재사용하는 근거:

1. **변경 범위 격리**: H5는 modal이 열린 상태의 chrome만 바꾼다. 화면이 닫혀 있을 때의 HOME / RECIPE_DETAIL 레이아웃, 섹션 구조, primary CTA는 전혀 바뀌지 않는다.
2. **modal-level design 산출물 존재**: `MODAL_SYSTEM-wireframes.md`가 H5 변경 범위 전체를 커버하는 purpose-built design 산출물이다. screen-level 설계 재실행 없이 이 문서만으로 구현 기준이 잠긴다.
3. **critique 커버리지 보완**: 기존 critiques가 화면 구조를 검토하고, Codex의 modal-level draft acceptance가 modal chrome을 검토했으므로, 두 계층을 합치면 H5 변경 전체가 review된 상태다.
4. **Stage 4 후 갱신 계획**: `HOME.md`와 `RECIPE_DETAIL.md`의 modal 관련 섹션은 Stage 4 완료 후 H5 기준으로 갱신한다 (Delivery Checklist 포함).

### Authority 판정 기준

| # | 기준 |
|---|------|
| A1 | 네 modal이 한 제품의 같은 계열 인터랙션처럼 느껴지는가 |
| A2 | 장식성 카피가 줄고 핵심 선택 UI가 더 빨리 읽히는가 |
| A3 | 색 사용이 더 정돈되었지만 칙칙해지지 않았는가 |
| A4 | PlannerAdd 날짜/끼니/인분 밀도 균형이 개선됐는가 |
| A5 | 네 modal 모두 eyebrow 없이 읽히고, close button이 같은 패밀리로 보이는가 |

---

## Design Status

- [ ] 임시 UI (temporary) — Stage 1 기본값
- [x] 리뷰 대기 (pending-review) — Stage 4 완료 ✅ (2026-04-17)
- [ ] 확정 (confirmed) — authority evidence E1~E10 + A1~A5 통과 후

> Design Status 전이: `temporary` → `pending-review` (Stage 4 완료) → `confirmed` (authority gate 통과)  
> High-Risk Redesign이므로 `confirmed` 전에 authority evidence 필수.

---

## Source Links

### 공식 계약

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md` — v1.5.0 반영 완료 ✅ (PR #143)
- `docs/화면정의서-v1.5.0.md` — 공식 계약 (H5 modal chrome 계약 포함)
- `docs/workpacks/README.md`
- `docs/workpacks/h5-modal-system-direction/README.md` — Gate 결정 (D1~D6)

### Design 문서 (화면 수준)

- `ui/designs/HOME.md` — HOME 화면 설계 (v1.4.0 기준, H5 후 modal 섹션 갱신 예정)
- `ui/designs/RECIPE_DETAIL.md` — RECIPE_DETAIL 화면 설계 (H5 후 modal 섹션 갱신 예정)

### Critique 문서 (화면 수준)

- `ui/designs/critiques/HOME-critique.md` — 🟡 (화면 구조 수준 검토, 2026-03-21)
- `ui/designs/critiques/RECIPE_DETAIL-critique.md` — 🟢 (화면 구조 수준 검토, 2026-04-16)

### Design 문서 (Modal System, H5 전용)

- `ui/designs/MODAL_SYSTEM-wireframes.md` — 4개 modal wireframe + copy lock (H5 핵심 설계 산출물)
- `ui/designs/MODAL_SYSTEM-principles.md` — 공통 원칙 12개
- `docs/design/modal-system-redesign-draft/acceptance.md` — modal-level critique 역할 (🟢, D1~D6 전체 통과)

### 구현 참조

- `docs/design/modal-system-redesign-draft/implementation-playbook.md` — 구현 플레이북
- `docs/design/modal-system-redesign-draft/shared-component-api.md` — 공통 컴포넌트 API props

---

## QA / Test Data Plan

- **fixture baseline**: 기존 `planner-add`, `save-modal`, `ingredient-filter`, `sort` 관련 fixture 그대로 사용
- **real DB smoke**: `pnpm dev` → 각 modal을 직접 열어 E1~E10 evidence 기준으로 확인
- **seed / reset**: 기존 seed 사용 (신규 seed 불필요)
- **bootstrap**: 기존 시스템 row 사용 (신규 불필요)
- **blocker 조건**: 없음 (기존 API/DB 계약 유지, 신규 테이블/row 없음)

### Evidence 캡처 기준

E1~E10은 Stage 4 완료 후 현행(after) UI 기준으로 캡처한다. `scripts/capture-h5-evidence.mjs` 실행.

---

## Key Rules

1. **API/DB 계약 불변**: 기존 endpoint, response shape, DB 구조를 바꾸지 않는다.
2. **기능 플로우 불변**: 정렬 즉시 적용, PlannerAdd 성공 동작, Save 성공 동작을 바꾸지 않는다.
3. **D1~D6 재탐색 금지**: accent, eyebrow, close, 날짜 chip, save 제목, modal family 방향을 다시 실험하지 않는다.
4. **공통 컴포넌트 필수**: `ModalHeader`를 공통 컴포넌트로 먼저 만들고 4개 modal에 적용한다.
5. **orange 허용 범위 준수**: large fill / CTA fill / header fill에 orange를 쓰지 않는다.
6. **Authority evidence 필수**: E1~E10 전체 없으면 closeout 금지.
7. **터치 타겟**: close button, CTA, chip, option row 전체 44px 이상.

---

## Primary User Path

### PlannerAdd
1. RECIPE_DETAIL 화면에서 `플래너에 추가` 버튼 탭
2. bottom sheet 열림 — 제목 `플래너에 추가`, eyebrow 없음, icon close
3. 날짜 chip (`금 4/17`) 선택 → 끼니 선택 → 인분 조정 (`2` + 작은 `인분`)
4. `플래너에 추가` CTA 탭 → 성공 toast → sheet 닫힘

### Save
1. RECIPE_DETAIL 화면에서 `저장` 버튼 탭
2. modal 열림 — 제목 `레시피 저장`, eyebrow 없음, icon close
3. 레시피북 row 선택 (olive tint) 또는 새 책 만들기
4. `저장` CTA 탭 → 성공 toast → modal 닫힘

### IngredientFilter
1. HOME 화면에서 `재료로 검색` 버튼 탭
2. bottom sheet 열림 — 제목 `재료로 검색`, eyebrow 없음, icon close
3. 카테고리 rail (fade affordance) 선택 → 재료 checkbox 선택
4. `N개 적용` CTA 탭 → 필터 반영 → sheet 닫힘

### Sort
1. HOME 화면에서 `정렬▾` 버튼 탭
2. bottom sheet 열림 — 제목 `정렬 기준`, eyebrow 없음
3. 옵션 row 탭 → 즉시 적용 + olive tint 선택 상태 → sheet 닫힘

---

## Delivery Checklist

> Stage 4~6 동안 계속 갱신하는 living closeout 문서다.  
> Stage 6 merge 시점에는 In Scope인데도 남아 있는 unchecked 항목이 없어야 한다.

- [x] 백엔드 계약 고정 (기존 API 계약 무변경 확인) <!-- omo:id=delivery-backend-contract;stage=2;scope=backend;review=3,6 -->
- [x] API 또는 adapter 연결 (기존 연결 변경 없음 확인) <!-- omo:id=delivery-api-adapter;stage=2;scope=backend;review=3,6 -->
- [x] 타입 반영 (shared component props 타입 정의) <!-- omo:id=delivery-types;stage=2;scope=shared;review=3,6 -->
- [x] UI 연결 (4개 modal + 5개 shared 컴포넌트 구현, helper copy 전체 반영) <!-- omo:id=delivery-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [x] 상태 전이 / 권한 / 멱등성 테스트 <!-- omo:id=delivery-state-policy-tests;stage=2;scope=shared;review=3,6 -->
- [x] 이 슬라이스의 `Vitest` / `Playwright` 자동화 범위 구분 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [x] fixture와 real DB smoke 경로 구분 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [x] seed / bootstrap / system row 준비 여부 점검 (기존 재사용 확인) <!-- omo:id=delivery-bootstrap-readiness;stage=2;scope=shared;review=3,6 -->
- [x] `loading / empty / error / read-only` 상태 점검 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [x] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
- [x] authority evidence E1~E10 캡처 완료 <!-- omo:id=delivery-authority-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] `ui/designs/RECIPE_DETAIL.md` planner add / save modal 섹션 갱신 (v1.5.0 기준 확인) <!-- omo:id=delivery-recipe-detail-wireframe;stage=4;scope=frontend;review=6 -->
- [x] `ui/designs/HOME.md` ingredient filter / sort sheet 섹션 갱신 (v1.5.0 기준 확인) <!-- omo:id=delivery-home-wireframe;stage=4;scope=frontend;review=6 -->
