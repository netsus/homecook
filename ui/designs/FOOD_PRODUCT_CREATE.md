# FOOD_PRODUCT_CREATE — 내 완제품 직접 등록

> 기준: 화면정의서 v1.5.26 §8-b, 유저flow맵 v1.3.23 §③-e, API v1.2.25 §5-6
>
> workpack: `prepared-food-planner-entry`
>
> 상태: Stage 1 design-generator artifact. 독립 design-critic/authority 승인 대기이며 이 문서 작성자는 자기 설계를 승인하지 않는다.

## Design Intent

- search empty에서 사용자가 제품 label 정보를 private manual 제품으로 저장하고 원래 picker selection으로 돌아간다.
- optional nutrient의 빈칸을 0으로 바꾸지 않고, 공개 전환·공유·OCR·바코드 같은 범위 밖 기능을 암시하지 않는다.
- 길이가 있는 form이므로 입력 순서, keyboard, validation, sticky CTA가 320px에서도 안정적이어야 한다.

## Authority Classification

- UI risk: `high-risk-ui-change` in `PLANNER_WEEK` anchor extension flow
- anchor dependency: `PLANNER_WEEK -> MEAL_SCREEN -> MENU_ADD -> FOOD_PRODUCT_PICKER -> FOOD_PRODUCT_CREATE`
- mobile baseline: 390px implementation evidence, 375px document compatibility
- narrow sentinel: 320px
- desktop: 1280px centered modal/panel
- primary CTA: `[내 제품으로 저장]`
- scroll containment: form body만 vertical scroll, header/footer sticky, page-level horizontal scroll 금지

## Mobile Baseline 390px / 375px

```text
┌─────────────────────────────────────┐
│ ←  내 완제품 등록                   │ sticky header
├─────────────────────────────────────┤
│ 나만 볼 수 있는 제품으로 저장돼요   │
│                                     │
│ 제품명 *                            │
│ [                              ]    │
│ 브랜드                              │
│ [                              ]    │
│                                     │
│ 영양표 기준량 *                     │
│ [ 1 ] [회 ▾]                        │
│                                     │
│ 열량(kcal) * [                 ]    │
│ 탄수화물(g) [                  ]    │
│ 단백질(g)   [                  ]    │
│ 지방(g)     [                  ]    │
│ 나트륨(mg)  [                  ]    │
│                                     │
│ 추가 영양성분 ▾                     │
│ 당류 / 포화지방 / 식이섬유          │
├─────────────────────────────────────┤
│ [내 제품으로 저장]                  │ primary CTA, sticky footer
└─────────────────────────────────────┘
```

## Narrow 320px

- label/input을 한 열로 둔다. numeric suffix를 input 내부에 과밀 배치하지 않는다.
- basis amount/unit은 2-column이어도 각 control 44px 이상, 부족하면 2행으로 분리한다.
- sticky CTA는 keyboard/safe-area 위에 있고 마지막 optional field를 가리지 않는다.
- validation은 각 field 바로 아래 한두 줄, summary만 별도 top alert로 중복하지 않는다.
- 320px에서 긴 영양명과 unit이 잘리지 않게 input label을 줄이지 않는다.

## Desktop 1280px

- 600~680px centered panel. 기본 정보와 nutrition을 2-column으로 나눌 수 있으나 DOM tab order는 mobile 순서를 유지한다.
- modal body만 scroll하고 focus trap/background lock을 적용한다.
- save success는 modal을 닫고 picker selected product heading으로 focus를 반환한다.

## Official Fields Only

- product name: 필수
- brand: 선택/nullable
- nutrition basis amount: 필수, `>0`
- nutrition basis unit: `serving / package / g / ml`
- energy kcal: 필수, finite `>=0`
- optional finite `>=0`: carbohydrate g, protein g, fat g, sodium mg, sugars g, saturated fat g, fiber g
- 빈 optional field는 null/missing이다. 숫자 0은 사용자가 실제로 0을 입력했을 때만 observed zero다.
- visibility/source/owner/current version/relation/public key는 입력받지 않는다. 항상 owner-only `private/manual`, `basis_relations=[]`다.

## Required States

### Loading / Submitting

- initial field shell은 즉시 보이고 submit 중 CTA만 pending/disabled다.
- double submit과 뒤로가기로 duplicate product/version이 생기지 않는다.

### Empty

- form 자체의 empty는 초기 입력 상태다. placeholder가 값처럼 보이지 않으며 optional blank가 0으로 채워지지 않는다.

### Validation Error

- name/amount/unit/energy/negative/non-finite/unsupported field를 해당 input에 연결한다.
- error 후 작성값과 picker return context를 보존한다.

### Read-only

- 이 surface는 새 private create 전용이다. public edit mode를 추가하지 않는다.

### Unauthorized

- login gate 후 search/date/column + 작성 중인 안전한 form draft를 return-to-action으로 복원한다.
- 민감하지 않은 label draft만 session-safe storage에 두며 raw provider/credential은 없다.

### Partial / Unavailable

- optional nutrient blank가 있으면 저장 결과가 partial일 수 있음을 짧게 안내한다.
- `나중에 채울 수 있어요`는 기존 catalog edit path를 의미할 뿐 blank를 0으로 만든다는 뜻이 아니다.

## Success Return

1. `POST /food-products` 성공으로 private product + first immutable version 생성.
2. `FOOD_PRODUCT_PICKER`로 돌아가 새 product를 selected state로 표시.
3. plan date, column, search text, selected product context 보존.
4. 사용자가 quantity/unit을 확정해야만 `POST /product-planner-entries` 호출.
5. product 저장 성공만으로 Recipe Meal/entry/status/XP/activity를 만들지 않는다.

## Out-Of-Scope UI Guard

- public 공개/공유 toggle 없음
- barcode scan/OCR/image label import 없음
- 외식/밀키트 type 없음
- generic prep/size/edible fields 없음
- density or basis relation input 없음
- medical target/actual consumption copy 없음

## Interaction And Accessibility

- 각 input에 visible label, required indicator와 `aria-describedby` error를 연결한다.
- numeric keyboard를 쓰되 decimal과 0을 허용해야 하는 nutrient field를 막지 않는다.
- amount는 `>0`; energy/optional nutrients는 `>=0` 차이를 copy와 validator 모두 반영한다.
- collapsed optional section은 button expanded state를 제공한다.
- back/ESC는 unsaved draft가 있으면 기존 modal pattern의 확인을 사용하고 임의 새 status를 만들지 않는다.
- focus order는 product info → basis → energy/core → optional → primary CTA다.

## Stage 4 Evidence

- 390/320/desktop: initial, filled, optional blank, observed zero, field error, unauthorized return, submitting, success picker return
- primary CTA visibility, keyboard overlap, footer scroll containment, field focus/error announcement을 포함한다.
- final authority는 기존 `MENU_ADD`/picker visual family와의 일관성, 정보 과적층, optional blank 의미를 검사한다.
