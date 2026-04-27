# Slice: baemin-prototype-home-parity

## Goal

HOME 화면의 시각적 구현을 Baemin prototype 기준 near-100% parity로 끌어올린다.
h7 direction gate가 정의한 3-way capture, visual-verdict scoring, required-state matrix에 따라 HOME body 점수 >= 95, authority blocker 0을 달성한다.
기존 HOME 정보 구조(공통 헤더, 검색, 재료 필터 행, 테마 carousel, 모든 레시피 섹션 + 정렬, 레시피 그리드)와 API/상태/권한 계약은 변경하지 않으며, skin·layout·interaction·assets/copy·state fidelity 5축의 시각 처리만 prototype에 맞춘다.

## Branches

- 문서/기반: `docs/baemin-prototype-home-parity`
- 프론트엔드: `feature/fe-baemin-prototype-home-parity`

## In Scope

- 화면: `HOME` body (app/page.tsx, components/home/*)
- API: 없음 (기존 `GET /recipes`, `GET /recipes/themes`, `GET /ingredients` 계약 그대로 소비)
- 상태 전이: 없음
- DB 영향: 없음
- Schema Change:
  - [x] 없음 (읽기 전용)
  - [ ] 있음

### Parity 구현 범위

1. **Skin**: prototype 기준 색상 토큰 적용, typography scale 조정, radius/shadow/spacing tone 정합
2. **Layout**: 섹션 순서, 카드/리스트/헤더 geometry, viewport first impression, scroll affordance를 prototype에 맞춤
3. **Interaction affordance**: sort sheet 열기/닫기, ingredient filter 모달, 검색, carousel scroll snap — 기존 동작 유지하되 시각 표현을 prototype에 맞춤
4. **Assets/Copy**: 아이콘, 라벨, empty copy, CTA copy, placeholder tone을 prototype 수준으로 조정 (production scope 내)
5. **State fidelity**: 7개 required states (initial, scrolled-to-recipes-entry, sort-open, filter-active, loading, empty, error) 각각이 prototype과 시각적으로 일치

### Visual evidence 산출물

- 3-way capture: foundation `capture-recipe.md` 규칙에 따라 7 states × 2 viewports × 3 layers = 42 captures
- `ui/designs/evidence/baemin-prototype-home-parity/visual-verdict.md` + `.json`
- Authority report: `ui/designs/authority/HOME-parity-authority.md`

## Out of Scope

- HOME 정보 구조(섹션 위계, 네비게이션 흐름) 변경
- API endpoint, field, table, status value 추가
- `Jua` 또는 새 폰트 의존성 도입
- Prototype-only hero greeting ("오늘은 뭐 해먹지?") — prototype demo copy, production에 해당 섹션 없음
- Prototype-only promo strip (플래너 안내 배너) — prototype marketing asset
- Prototype-only bottom tab bar, Pantry/MyPage 링크
- Prototype-only ingredient filter inline chips (production은 모달 기반 `INGREDIENT_FILTER_MODAL`)
- `RECIPE_DETAIL` tabs/reviews
- 새 npm 의존성 추가
- 공식 source-of-truth 문서 변경

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `h7-baemin-prototype-parity-direction` | merged | [x] |
| `baemin-prototype-parity-foundation` | merged | [x] |
| `baemin-style-tokens-additive` | merged | [x] |
| `baemin-style-token-values` | merged | [x] |
| `baemin-style-shared-components` | merged | [x] |
| `baemin-style-home-retrofit` | merged | [x] |

> 모든 선행 슬라이스가 merged 상태다.

## Backend First Contract

이 슬라이스에 백엔드 구현이 없다. 기존 API 계약을 그대로 소비한다:

- `GET /recipes?sort=&q=&ingredient_ids=` → `{ success, data: { items: RecipeCardItem[] }, error }`
- `GET /recipes/themes` → `{ success, data: { themes: RecipeTheme[] }, error }`
- `GET /ingredients` → `{ success, data: { categories: IngredientCategory[] }, error }`
- API response envelope: `{ success, data, error }`
- error shape: `{ code, message, fields[] }`
- 권한: HOME 조회는 비로그인 가능
- 상태 전이: 없음
- visual parity를 위해 endpoint, field, table, status value를 추가하지 않음

## Frontend Delivery Mode

- Stage 4에서 HOME body의 시각적 구현을 prototype parity 수준으로 변경
- 필수 상태: `loading` / `empty` / `error` (이미 구현됨, parity 수준으로 시각 조정)
- `read-only`: 해당 없음 (HOME에 mutation 없음)
- `unauthorized`: 해당 없음 (HOME 조회는 비로그인 가능)
- 로그인 보호 액션: 해당 없음 (HOME에서 직접적인 보호 액션 없음, 재료 필터는 비로그인 가능)

## Design Authority

- UI risk: `anchor-extension` (HOME anchor screen의 시각 처리 전면 변경)
- Anchor screen dependency: `HOME`
- Visual artifact: `ui/designs/authority/HOME-parity-authority.md` (Stage 4에서 screenshot evidence 포함)
- Authority status: `required`
- Notes: h7 parity program의 scored body slice. Stage 4 완료 시 390px + 320px screenshot evidence 기반 authority review 필수. Blocker 0 + score >= 95 달성 후 confirmed 가능.

## Design Status

- [x] 임시 UI (temporary) — 현재 h6 retrofit 결과물이 production baseline
- [ ] 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed)
- [ ] N/A

> Stage 4 완료 후 `temporary → pending-review`. Stage 5 + final authority gate 통과 후 `confirmed`.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/h7-baemin-prototype-parity-direction/README.md`
- `docs/workpacks/baemin-prototype-parity-foundation/README.md`
- `ui/designs/evidence/baemin-prototype-parity-foundation/capture-recipe.md`
- `ui/designs/evidence/baemin-prototype-parity-foundation/fixture-route-matrix.md`
- `ui/designs/evidence/baemin-prototype-parity-foundation/visual-verdict-schema.json`
- `ui/designs/evidence/baemin-prototype-parity-foundation/token-material-mapping.md`
- `ui/designs/evidence/baemin-prototype-parity-foundation/prototype-exclusion-inventory.md`
- `ui/designs/prototypes/homecook-baemin-prototype.html`
- `ui/designs/prototypes/baemin-redesign/screens/home.jsx`
- `docs/화면정의서-v1.5.1.md` §1 HOME
- `docs/요구사항기준선-v1.6.4.md` §1-1

## QA / Test Data Plan

- fixture baseline: 기존 HOME fixture 유지 (>= 6 recipes, >= 1 theme with recipes, ingredient categories). Foundation의 `fixture-route-matrix.md` HOME 섹션 참조.
- real DB smoke 경로: `pnpm dev` 또는 `pnpm dev:local-supabase`로 브라우저에서 HOME 실제 동작 확인
- seed / reset 명령: 기존 seed 데이터 사용
- bootstrap 시스템 row: 해당 없음 (HOME은 bootstrap 의존 없음)
- blocker 조건: 없음 (모든 선행 슬라이스 merged)

### 이 슬라이스의 검증

- `pnpm verify:frontend`
- `pnpm validate:workflow-v2`
- `pnpm validate:workpack`
- `git diff --check`
- 390px + 320px screenshot evidence (7 states × 2 viewports)
- visual-verdict score >= 95, blocker count 0

## Key Rules

1. **정보 구조 불변**: HOME의 공통 헤더, 검색, 재료 필터 행, 테마 carousel, 모든 레시피 섹션 + 정렬, 레시피 그리드 구조를 변경하지 않는다.
2. **API/DB/status 불변**: endpoint, field, table, status value를 추가하지 않는다.
3. **h7 direction gate 상속**: h7에서 정의한 Near-100% Definition, Prototype-Only Exclusions, Supersession Matrix, Visual Verdict Method를 그대로 따른다.
4. **Prototype-only exclusions 보존**: hero greeting, promo strip, Jua 폰트, inline ingredient chips, bottom tab bar, Pantry/MyPage 링크는 제외 상태를 유지한다. 이들이 prototype capture에 보이더라도 after layer에서 부재를 deficit으로 채점하지 않는다.
5. **Foundation 규칙 준수**: `capture-recipe.md`, `fixture-route-matrix.md`, `visual-verdict-schema.json`의 규칙에 따라 evidence를 생성한다.
6. **Token mapping 준수**: `token-material-mapping.md`에 정의된 prototype→production 토큰 매핑을 따른다. Approved production divergences (brand color, background tone, foreground tone, font stack, olive vs teal)는 deficit으로 채점하지 않는다.
7. **Authority review 필수**: Stage 4 완료 시 390px + 320px screenshot evidence 기반 authority report를 생성한다. Authority blocker 0 확인 후 pending-review로 전환한다.

## Contract Evolution Decision

**Visual implementation, no contract-evolution required.**

분석:
- Stage 4 계획은 공식 HOME 정보 구조(화면정의서 v1.5.1 §1)를 보존한다: 공통 헤더, 검색바, 재료 필터 버튼, 테마 carousel strip, "모든 레시피" 섹션 + 정렬, 레시피 그리드.
- Prototype의 HOME (`home.jsx`)도 동일한 섹션을 동일한 순서로 가진다.
- 차이는 skin·layout·interaction affordance의 시각 처리에 한정된다.
- Prototype-only 요소(hero greeting, promo strip, inline ingredient chips)는 exclusion inventory에 의해 제외된다.
- 공식 문서 변경 없이 Stage 4를 진행할 수 있다.

## Primary User Path

1. 사용자가 HOME (`/`)에 진입한다
2. 테마 carousel, 검색, 재료 필터, 정렬을 통해 레시피를 탐색한다 — 모든 시각 요소가 prototype과 near-100% 일치한다
3. 레시피 카드를 탭하여 `RECIPE_DETAIL`로 이동한다

## Delivery Checklist

> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> 이 슬라이스는 BE 구현 없음(Stage 2/3 스킵), Stage 4에서 HOME body parity를 구현한다.

- [ ] HOME body skin parity (색상, typography, radius, shadow, spacing) <!-- omo:id=home-parity-skin;stage=4;scope=frontend;review=5,6 -->
- [ ] HOME body layout parity (섹션 geometry, card size, first viewport impression) <!-- omo:id=home-parity-layout;stage=4;scope=frontend;review=5,6 -->
- [ ] HOME body interaction affordance parity (sort, filter, carousel, search 시각 표현) <!-- omo:id=home-parity-interaction;stage=4;scope=frontend;review=5,6 -->
- [ ] HOME body assets/copy parity (아이콘, 라벨, placeholder, CTA copy) <!-- omo:id=home-parity-assets-copy;stage=4;scope=frontend;review=5,6 -->
- [ ] HOME body state fidelity (7 required states 각각 prototype 시각 일치) <!-- omo:id=home-parity-state-fidelity;stage=4;scope=frontend;review=5,6 -->
- [ ] 3-way capture evidence 완성 (7 states × 2 viewports × 3 layers) <!-- omo:id=home-parity-capture-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] Visual-verdict artifact 생성 (visual-verdict.md + .json) <!-- omo:id=home-parity-verdict-artifact;stage=4;scope=frontend;review=5,6 -->
- [ ] Authority report 생성 (screenshot evidence 기반) <!-- omo:id=home-parity-authority-report;stage=4;scope=frontend;review=5,6 -->
- [ ] Slice score >= 95, blocker count 0 <!-- omo:id=home-parity-score-threshold;stage=4;scope=frontend;review=5,6 -->
- [ ] Prototype-only exclusions가 deficit으로 채점되지 않음 확인 <!-- omo:id=home-parity-exclusions-check;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 HOME 기능 regression 없음 (검색, 필터, 정렬, 테마 carousel, 카드 탭) <!-- omo:id=home-parity-no-regression;stage=4;scope=frontend;review=5,6 -->
- [ ] Runtime app code에서 API/DB/status 변경 없음 확인 <!-- omo:id=home-parity-no-contract-change;stage=4;scope=frontend;review=5,6 -->
