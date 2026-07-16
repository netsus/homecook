# FOOD_PRODUCT_PICKER — 완제품 검색·수량 선택

> 기준: 화면정의서 v1.5.26 §8-a, 유저flow맵 v1.3.23 §③-e, API v1.2.25 §5-9~5-11
>
> workpack: `prepared-food-planner-entry`
>
> 상태: Stage 1 design-generator artifact. 독립 design-critic/authority 승인 대기이며 이 문서 작성자는 자기 설계를 승인하지 않는다.

## Design Intent

- `MENU_ADD` 안에서 public + 본인 private 완제품을 찾고, 한 제품을 선택해 호환되는 수량만 입력한 뒤 현재 날짜·끼니에 추가한다.
- Recipe Meal 생성 흐름처럼 보이거나 status를 만들지 않는다.
- missing nutrient와 환산 불가를 숨기지 않으며, 선택 context를 잃지 않고 회복할 수 있어야 한다.

## Authority Classification

- UI risk: `high-risk-ui-change` inside a `PLANNER_WEEK` anchor-extension flow
- anchor dependency: `PLANNER_WEEK -> MEAL_SCREEN -> MENU_ADD -> FOOD_PRODUCT_PICKER`
- mobile baseline: 390px 구현 evidence, 375px 문서 baseline compatibility
- narrow sentinel: 320px
- desktop: 1280px nested centered sheet/panel
- primary CTA: 제품 선택 전에는 검색/결과 선택, 선택 후에는 `[완제품 추가]`
- scroll containment: app shell/page가 아니라 결과 list와 sheet body만 세로 스크롤한다. page-level horizontal scroll은 금지한다.

## Mobile Baseline 390px / 375px

```text
┌─────────────────────────────────────┐
│ ←  완제품 추가                  닫기 │  sticky header, 44px targets
├─────────────────────────────────────┤
│ [ 완제품 이름 검색             🔍 ] │  sticky search
│ 공공 데이터와 내가 등록한 제품만 보여요 │
├─────────────────────────────────────┤
│ 제품 결과 list                      │  scroll containment boundary
│ ┌─────────────────────────────────┐ │
│ │ 플레인 요거트             공공  │ │
│ │ 브랜드 · 1회 · 105 kcal        │ │
│ │ 영양 정보 5/5                  │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ 내가 먹는 요거트       내가 등록│ │
│ │ 브랜드 · 150g · 영양 일부      │ │
│ └─────────────────────────────────┘ │
│                                     │
│ 찾는 제품이 없나요? [직접 등록]     │
└─────────────────────────────────────┘

제품 선택 후
┌─────────────────────────────────────┐
│ 플레인 요거트 · 브랜드              │
│ 표시 기준 1회                        │
│ [−] [ 1 ] [회 ▾] [+]                │
│ 호환 단위: 회 / 150g                 │
│ 계획 영양 미리보기                   │
│ 105 kcal · 탄/단/지 ...              │
│ [완제품 추가]                         │  primary CTA, sticky footer
└─────────────────────────────────────┘
```

## Narrow 320px

- header/search/result card는 한 열이다.
- source badge는 제목과 경쟁하지 않게 2행 오른쪽 또는 metadata 행으로 내려간다.
- quantity input과 unit selector가 겹치면 두 행으로 분리하되 모든 control은 44×44px 이상이다.
- sticky primary CTA와 keyboard가 겹치지 않도록 visual viewport/safe area를 반영한다.
- 320px에서 product name은 최대 2행, 브랜드·basis·영양 상태는 짧은 metadata로 압축한다.
- 좌우 overflow나 잘린 단위/validation copy는 blocker다.

## Desktop 1280px

- `MEAL_SCREEN` context를 배경에 보존하고 560~640px centered modal 또는 nested panel로 연다.
- 검색 결과와 선택 상세를 2-pane으로 만들 수 있으나 mobile과 동일한 검색→선택→수량→추가 순서를 유지한다.
- modal body만 scroll하고 header/footer는 고정한다. background scroll lock과 focus trap을 적용한다.

## Product Card Contract

- 공식 field만 표시한다: name, nullable brand, public/private source label, label basis, core nutrition state, expected energy.
- public은 `공공 데이터`, private owner는 `내가 등록`으로 구분한다.
- public 제품의 read-only는 수정 불가 의미다. 선택/entry 추가는 가능하다.
- 다른 사용자 private와 soft-deleted product는 card/empty count/search hint 어디에도 나타나지 않는다.
- 현재 approved public promotion artifact와 운영 public row는 0이므로 actual Stage 4 local data에서는 private manual path가 정상 기본이다. synthetic public card는 isolated QA fixture로만 표시하고 evidence caption에 이를 명시한다.

## Selection And Quantity Contract

- quantity amount는 양수만 허용한다.
- unit은 `serving / package / g / ml`만 사용한다. 사용자 표시 `회`, `팩`, `g`, `mL`는 API enum으로 안정적으로 매핑한다.
- label basis와 같은 unit은 직접 배수로 노출한다.
- 다른 unit은 선택 순간 pin 대상 immutable version의 approved direct `basis_relations[]` 정확히 1개가 정/역방향으로 연결할 때만 선택 option으로 노출한다.
- relation chaining, 다른 product/version/current version substitute, 제품명·브랜드, 밀도, 임의 `g↔ml` option을 만들지 않는다.
- `422 NUTRITION_BASIS_MISMATCH`면 `이 기준으로는 수량을 바꿀 수 없어요`를 quantity 영역 아래에 표시하고 선택/검색/날짜/끼니를 보존한다.
- `409 NUTRITION_VERSION_CONFLICT`는 새 current로 조용히 재시도하지 않고 현재 제품 선택을 유지한 채 `제품 영양 정보가 바뀌었어요. 다시 확인해 주세요.`와 명시적 refresh를 제공한다.
- `409 PRODUCT_DELETED`는 선택을 해제하고 삭제 제품을 search result에서 제거하되 날짜·끼니·검색어를 유지한다.

## Nutrition State

- complete: 계산 가능한 값과 basis를 표시한다.
- partial: 가능한 값은 `최소` 의미로 표시하고 결측 count/reason을 0으로 채우지 않는다.
- unavailable: amount null은 `영양 정보 준비 중`이며 `0 kcal`로 표시하지 않는다.
- direct/estimated/mixed와 `약/예상` 의미는 pinned response를 그대로 소비한다.
- sources/raw provider 행은 펼치지 않는다. 공식 안전 attribution 외 secret/raw/internal path가 UI에 들어오지 않는다.

## Required States

### Loading

- 검색 skeleton 3행. 이전 Recipe Meal/MEAL_SCREEN 배경 context를 fatal loading으로 가리지 않는다.

### Empty

- `찾는 완제품이 없어요` + primary recovery `[직접 등록]`.
- public actual row 0을 장애처럼 가장하지 않는다. 검색어가 비어 있을 때와 결과 0을 구분한다.

### Error

- search error는 list 영역 inline retry.
- create mutation error는 quantity footer 위 inline feedback; double submit을 막는다.

### Read-only

- public product에 edit/delete affordance 없음. 선택/추가 CTA는 유지한다.

### Unauthorized

- login gate 뒤 검색어, plan date, column, selected product, quantity/unit을 return-to-action으로 복원한다.
- 복원 시 product가 삭제/권한 상실이면 안전하게 selection만 해제하고 이유를 알린다.

### Partial / Unavailable

- card와 선택 상세 모두 missing을 0과 구분한다.
- missing nutrition 자체가 entry create를 막는 새 오류는 만들지 않되 pinned 공식 payload를 그대로 표시한다.

## Interaction And Accessibility

- search label, result option role, selected state, quantity input name, unit select name, error association을 제공한다.
- keyboard: ESC/back은 이전 `MENU_ADD`; Enter는 선택 결과에서 동작하되 quantity validation을 우회하지 않는다.
- focus: open → search, select → quantity, validation error → invalid control, create success → new product selection, entry success → `MEAL_SCREEN` new card.
- 중복 submit 방지, response race에서 latest query만 표시, abort된 검색 결과로 선택 상태를 덮어쓰지 않는다.
- 결과 card 전체를 44px 이상 target으로 사용하고 내부 read-only label이 별도 오작동 target이 되지 않게 한다.

## Stage 4 Evidence

- before flow context: `MENU_ADD` 390/320/desktop
- after picker: default/scroll/selected/quantity/empty/error/read-only/unauthorized/partial/unavailable/basis mismatch
- exact paths는 workpack `Design Authority`와 automation-spec의 `stage4_evidence_requirements`를 따른다.
- authority 질문:
  - Recipe Meal과 product 선택이 혼동되지 않는가
  - 320px에서 primary CTA와 validation이 보이는가
  - scroll containment와 focus return이 익숙한 sheet 패턴인가
  - missing을 0으로 오해할 표현이 없는가
