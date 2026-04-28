# Slice: baemin-prototype-modal-overlay-parity

## Goal

Modal/sheet overlay 패밀리(PlannerAddSheet, SaveModal, IngredientFilterModal, SortSheet, LoginGateModal)의 시각적 구현을 Baemin prototype 기준 near-100% parity로 끌어올린다.
h7 direction gate가 정의한 3-way capture, visual-verdict scoring, required-state matrix에 따라 modal overlay family 점수 >= 93, authority blocker 0을 달성한다.
기존 H5 modal family chrome(ModalHeader, ModalFooterActions, icon-only close, olive accent)과 baemin-style-modal-system-fit의 토큰 정합 결과를 기반으로, skin·layout·interaction·assets/copy·state fidelity 5축의 시각 처리만 prototype에 맞추며, modal 동작(open/close/dismiss), API 계약, 상태 전이, 권한 흐름은 변경하지 않는다.

## Branches

- 문서/기반: `docs/baemin-prototype-modal-overlay-parity`
- 프론트엔드: `feature/fe-baemin-prototype-modal-overlay-parity`

## In Scope

- 화면: Modal/sheet overlay family (각 host 화면 위의 overlay로 캡처)
  - `PlannerAddSheet` — host: RECIPE_DETAIL (`/recipe/[id]`)
  - `SaveModal` — host: RECIPE_DETAIL (`/recipe/[id]`)
  - `IngredientFilterModal` — host: HOME (`/`)
  - `SortSheet` — host: HOME (`/`)
  - `LoginGateModal` — host: RECIPE_DETAIL (`/recipe/[id]`)
- API: 없음 (기존 API 계약 그대로 소비)
- 상태 전이: 없음
- DB 영향: 없음
- Schema Change:
  - [x] 없음 (읽기 전용)
  - [ ] 있음

### Parity 구현 범위

1. **Skin**: prototype 기준 modal/sheet surface 토큰 적용 (background `--panel`, border-top accent, shadow `--shadow-3`, radius `--radius-xl`), ModalHeader/ModalFooterActions typography scale, close button 스타일, chip/option/radio 색상 정합
2. **Layout**: sheet container geometry (maxHeight, padding, grabber bar), header 배치, content area 간격, footer sticky 배치, chip rail/option list/book list geometry를 prototype에 맞춤
3. **Interaction affordance**: date chip 선택, meal type 선택, servings stepper, book 선택/생성, ingredient category 전환/search/체크, sort option 즉시 적용, login gate 소셜 버튼, backdrop tap-to-close, ESC close — 기존 동작 유지하되 시각 표현을 prototype에 맞춤
4. **Assets/Copy**: 아이콘 (close X, chip 체크, radio, stepper +/-, category), 라벨, CTA copy를 prototype 수준으로 조정 (production scope 내)
5. **State fidelity**: 5개 required states (planner-add-open, save-open, ingredient-filter-open, sort-open, login-gate-open) 각각이 prototype과 시각적으로 일치

### Visual evidence 산출물

- 3-way capture: foundation 규칙에 따라 30 evidence slots (5 states × 2 viewports × 3 layers): capture files + documented prototype N/A slots (해당 시)
- `ui/designs/evidence/baemin-prototype-modal-overlay-parity/visual-verdict.md` + `.json`
- Authority report: `ui/designs/authority/MODAL_OVERLAY-parity-authority.md`

## Out of Scope

- Modal 동작 변경 (open/close/dismiss 로직, focus trap, ESC 처리, backdrop behavior)
- H5 copy lock 변경 (PlannerAdd 제목 "플래너에 추가", Save 제목 "레시피 저장", Sort 제목 "정렬 기준" 등)
- API endpoint, field, table, status value 추가
- `Jua` 또는 새 폰트 의존성 도입
- Prototype-only SortSheet tab-like control semantic (production은 sheet overlay per H5)
- Prototype-only LoginGateModal social button asset (production은 자체 OAuth provider asset)
- Prototype-only illustration, image, emoji, or marketing asset
- 공식 source-of-truth 문서 변경
- `HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK` body 화면 변경 (body parity는 선행 슬라이스에서 완료)
- `PantryReflectionPopup` 또는 H5 family 외의 modal/popup
- 새 npm 의존성 추가
- `DELETE /recipes/{id}/save` 복원

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `h7-baemin-prototype-parity-direction` | merged | [x] |
| `baemin-prototype-parity-foundation` | merged | [x] |
| `baemin-prototype-home-parity` | merged | [x] |
| `baemin-prototype-recipe-detail-parity` | merged | [x] |
| `baemin-prototype-planner-week-parity-contract` | merged | [x] |
| `baemin-prototype-planner-week-parity` | merged | [x] |
| `baemin-style-modal-system-fit` | merged | [x] |
| `h5-modal-system-redesign` | merged | [x] |
| `04-recipe-save` | merged | [x] |
| `02-discovery-filter` | merged | [x] |

> 모든 선행 슬라이스가 merged 상태다.

## Backend First Contract

이 슬라이스에 백엔드 구현이 없다. 기존 API 계약을 그대로 소비한다:

- `POST /meals` → `{ success, data: Meal, error }` (PlannerAddSheet)
- `POST /recipes/{id}/save` → `{ success, data, error }` (SaveModal)
- `GET /ingredients?category=&q=` → `{ success, data: Ingredient[], error }` (IngredientFilterModal)
- `GET /recipes?sort=` → `{ success, data, error }` (SortSheet — 정렬 적용)
- Supabase Auth (LoginGateModal — 소셜 로그인)
- API response envelope: `{ success, data, error }`
- error shape: `{ code, message, fields[] }`
- 권한: PlannerAdd/Save는 로그인 필요. IngredientFilter/Sort는 비로그인 사용 가능. LoginGate는 비로그인 시 표시.
- 로그인 게이트: 보호 액션 탭 → LoginGateModal → 로그인 성공 후 return-to-action
- 상태 전이: 없음
- visual parity를 위해 endpoint, field, table, status value를 추가하지 않음

## Frontend Delivery Mode

- Stage 4에서 5개 modal/sheet overlay의 시각적 구현을 prototype parity 수준으로 변경
- 필수 상태:
  - `loading`: PlannerAddSheet 컬럼 로딩, SaveModal 책 목록 로딩, IngredientFilterModal 재료 로딩 — skeleton 표시 (기존 동작 유지)
  - `empty`: IngredientFilterModal 검색 결과 없음 — empty state (기존 동작 유지)
  - `error`: 각 modal의 fetch 실패 시 error state (기존 동작 유지)
  - `read-only`: N/A — modal은 read-only 대상이 아님
  - `unauthorized`: LoginGateModal이 unauthorized 처리 자체임 (기존 동작 유지)
- 로그인 보호 액션: 좋아요/저장/플래너 추가 → LoginGateModal → return-to-action (기존 동작 유지)

## Design Authority

- UI risk: `anchor-extension` (anchor screen HOME, RECIPE_DETAIL 위의 overlay 시각 처리 전면 변경)
- Anchor screen dependency: `HOME`, `RECIPE_DETAIL`
- Visual artifact: `ui/designs/authority/MODAL_OVERLAY-parity-authority.md` (Stage 4에서 screenshot evidence 포함)
- Authority status: `reviewed`
- Notes: h7 parity program의 scored overlay slice. Stage 5 public review와 Claude final authority gate 통과 필요. 기존 H5 modal family design docs, baemin-style-modal-system-fit authority 결과를 base로 활용.
- Design addendum: 기존 `ui/designs/INGREDIENT_FILTER_MODAL.md`, `ui/designs/LOGIN.md`, `ui/designs/RECIPE_DETAIL.md` (PlannerAdd/Save 섹션), `ui/designs/HOME.md` (Sort 섹션) 활용
- Design critique: 기존 critique 활용. 이 슬라이스는 이미 confirmed된 modal family의 시각 parity이므로 design-generator/design-critic 신규 실행 불필요. 근거: H5 + baemin-style-modal-system-fit에서 modal chrome이 확정됨. 이 슬라이스는 확정된 chrome 위에 prototype skin/layout 미세 정합만 수행.

## Design Status

- [ ] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review)
- [x] 확정 (confirmed)
- [ ] N/A

> Design Status 전이: `temporary` → `pending-review` (Stage 4 완료 후) → `confirmed` (Stage 5 + final authority gate 통과 후)
> Final authority gate passed: 2026-04-28. Score 95.2 >= 93, blocker 0, all invariants verified.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/h7-baemin-prototype-parity-direction/README.md`
- `docs/workpacks/baemin-prototype-parity-foundation/README.md`
- `docs/workpacks/baemin-style-modal-system-fit/README.md` (선행 modal style 슬라이스)
- `docs/workpacks/h5-modal-system-redesign/README.md` (H5 modal family chrome 기준)
- `ui/designs/INGREDIENT_FILTER_MODAL.md`
- `ui/designs/LOGIN.md`
- `ui/designs/RECIPE_DETAIL.md` (PlannerAdd/Save 섹션)
- `ui/designs/HOME.md` (Sort 섹션)
- `ui/designs/evidence/baemin-prototype-parity-foundation/capture-recipe.md`
- `ui/designs/evidence/baemin-prototype-parity-foundation/fixture-route-matrix.md`
- `ui/designs/evidence/baemin-prototype-parity-foundation/visual-verdict-schema.json`
- `ui/designs/evidence/baemin-prototype-parity-foundation/token-material-mapping.md`
- `ui/designs/evidence/baemin-prototype-parity-foundation/prototype-exclusion-inventory.md`
- `ui/designs/prototypes/homecook-baemin-prototype.html`
- `ui/designs/prototypes/baemin-redesign/screens/modals.jsx`
- `ui/designs/prototypes/baemin-redesign/HANDOFF.md` (§4.6 Sheet/Modal)
- `docs/화면정의서-v1.5.1.md`

## QA / Test Data Plan

- fixture baseline: 기존 modal fixture 유지. Foundation의 `fixture-route-matrix.md` Modal Family 섹션 참조:
  - PlannerAddSheet: Recipe fixture + planner columns (logged-in)
  - SaveModal: Recipe fixture + recipe books (logged-in)
  - IngredientFilterModal: Ingredient categories (logged-in)
  - SortSheet: Recipes to sort (logged-in)
  - LoginGateModal: Recipe fixture (logged-out)
- real DB smoke 경로: `pnpm dev` 또는 `pnpm dev:local-supabase`로 브라우저에서 각 modal 실제 동작 확인
- seed / reset 명령: 기존 seed 데이터 사용
- bootstrap 시스템 row: `meal_plan_columns` ×4 (PlannerAddSheet에 필요, 이미 선행 슬라이스에서 해결됨)
- blocker 조건: 없음 (모든 선행 슬라이스 merged)

### 이 슬라이스의 검증

- `pnpm verify:frontend`
- `pnpm validate:workflow-v2`
- `pnpm validate:workpack`
- `git diff --check`
- 390px + 320px screenshot evidence (5 states × 2 viewports)
- visual-verdict score >= 93, blocker count 0

## Key Rules

1. **Modal 동작 불변**: open/close/dismiss, focus trap, ESC, backdrop tap-to-close, keyboard avoidance 동작을 변경하지 않는다.
2. **H5 copy lock 보존**: PlannerAdd "플래너에 추가", Save "레시피 저장", Sort "정렬 기준", IngredientFilter "재료 필터", LoginGate "로그인이 필요한 작업이에요" 등 H5에서 확정된 copy를 변경하지 않는다.
3. **API/DB/status 불변**: endpoint, field, table, status value를 추가하지 않는다.
4. **h7 direction gate 상속**: h7에서 정의한 Near-100% Definition, Prototype-Only Exclusions, Supersession Matrix, Visual Verdict Method를 그대로 따른다.
5. **Prototype-only exclusions 보존**: SortSheet tab-like semantic, LoginGateModal prototype social asset, Jua font는 제외 상태를 유지한다. 이들이 prototype capture에 보이더라도 after layer에서 부재를 deficit으로 채점하지 않는다.
6. **Foundation 규칙 준수**: `fixture-route-matrix.md`, `visual-verdict-schema.json`의 규칙에 따라 evidence를 생성한다.
7. **Token mapping 준수**: `token-material-mapping.md`에 정의된 prototype→production 토큰 매핑을 따른다. Approved production divergences (brand color coral vs mint, background warm cream vs white, olive vs teal accent, font stack)는 deficit으로 채점하지 않는다.
8. **Authority review 필수**: Stage 4 완료 시 390px + 320px screenshot evidence 기반 authority report를 생성한다. Authority blocker 0 확인 후 pending-review로 전환한다.
9. **로그인 게이트 보존**: LoginGateModal의 return-to-action, auth flow는 기존 동작을 그대로 유지한다.
10. **저장 대상 제한 보존**: SaveModal에서 saved/custom 레시피북만 저장 대상으로 허용한다.
11. **IngredientFilter 계약 보존**: `전체`는 UI-only sentinel, category 전환 시 search query 보존, debounce 300ms, `exclude → uncheck` 규칙 보존.
12. **PlannerAdd 계약 보존**: 날짜 chip `요일 + M/D`, 성공 토스트 `N월 D일 끼니에 추가됐어요`, 이동 없음 정책 보존.

## Contract Evolution Decision

**Visual implementation, no contract-evolution required.**

분석:
- Stage 4 계획은 5개 modal의 기존 기능 계약(H5 copy lock, modal chrome 구조, API 계약)을 모두 보존한다.
- Prototype의 modal (`screens/modals.jsx`)은 같은 핵심 구조를 포함하되 mint/teal accent, Jua font 등 production divergence가 있다. 이는 token mapping의 approved divergence로 처리된다.
- 차이는 skin·layout·interaction affordance의 시각 처리에 한정된다.
- h7 direction gate에서 이 슬라이스를 "visual-only parity slice"로 분류했다 (공식 문서 변경 불필요).
- 공식 문서 변경 없이 Stage 4를 진행할 수 있다.

## Primary User Path

1. 사용자가 RECIPE_DETAIL에서 `[플래너에 추가]`를 탭하면 PlannerAddSheet가 prototype과 near-100% 일치하는 시각으로 열린다
2. 날짜 chip, 끼니 선택, 인분 stepper가 prototype 스타일로 표시되며 기존 동작이 그대로 유지된다
3. HOME에서 `[정렬▾]`을 탭하면 SortSheet가 prototype 스타일로 열리고, 옵션 선택 시 즉시 적용된다
4. HOME에서 `[재료 필터]`를 탭하면 IngredientFilterModal이 prototype 스타일로 열리고, 카테고리/검색/체크/적용 흐름이 유지된다
5. 비로그인 상태에서 보호 액션을 탭하면 LoginGateModal이 prototype 스타일로 열리고 return-to-action이 정상 동작한다

## Delivery Checklist

> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> 이 슬라이스는 BE 구현 없음(Stage 2/3 스킵), Stage 4에서 modal overlay parity를 구현한다.

- [x] Modal overlay family skin parity (surface, shadow, radius, typography, color token 정합) <!-- omo:id=mo-parity-skin;stage=4;scope=frontend;review=5,6 -->
- [x] Modal overlay family layout parity (sheet geometry, header, content, footer, grabber, chip rail, option list) <!-- omo:id=mo-parity-layout;stage=4;scope=frontend;review=5,6 -->
- [x] Modal overlay family interaction affordance parity (chip/option/radio 선택, stepper, search, backdrop, close 시각 표현) <!-- omo:id=mo-parity-interaction;stage=4;scope=frontend;review=5,6 -->
- [x] Modal overlay family assets/copy parity (아이콘, 라벨, CTA copy) <!-- omo:id=mo-parity-assets-copy;stage=4;scope=frontend;review=5,6 -->
- [x] Modal overlay family state fidelity (5 required states 각각 prototype 시각 일치) <!-- omo:id=mo-parity-state-fidelity;stage=4;scope=frontend;review=5,6 -->
- [x] 3-way capture evidence 완성 (30 evidence slots) <!-- omo:id=mo-parity-capture-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] Visual-verdict artifact 생성 (visual-verdict.md + .json) <!-- omo:id=mo-parity-verdict-artifact;stage=4;scope=frontend;review=5,6 -->
- [x] Authority report 생성 (screenshot evidence 기반) <!-- omo:id=mo-parity-authority-report;stage=4;scope=frontend;review=5,6 -->
- [x] Slice score >= 93, blocker count 0 <!-- omo:id=mo-parity-score-threshold;stage=4;scope=frontend;review=5,6 -->
- [x] Prototype-only exclusions가 deficit으로 채점되지 않음 확인 <!-- omo:id=mo-parity-exclusions-check;stage=4;scope=frontend;review=5,6 -->
- [x] 기존 modal 기능 regression 없음 (PlannerAdd 날짜/끼니/인분, Save 책 선택/생성, IngredientFilter 카테고리/검색/체크/적용, Sort 즉시 적용, LoginGate return-to-action) <!-- omo:id=mo-parity-no-regression;stage=4;scope=frontend;review=5,6 -->
- [x] Runtime app code에서 API/DB/status 변경 없음 확인 <!-- omo:id=mo-parity-no-contract-change;stage=4;scope=frontend;review=5,6 -->
- [x] H5 copy lock이 변경되지 않음 확인 <!-- omo:id=mo-parity-h5-copy-lock;stage=4;scope=frontend;review=5,6 -->
