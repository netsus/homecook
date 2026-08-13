# MEAL_LOG — day-first 실제 식사 기록

> Design Status: `temporary`
>
> 작성 역할: Homecook #12 `meal-log-ui` Stage 1 generator/repair lineage. 현재 successor repair author는 reviewer가 아니며 자기 변경을 승인하지 않는다.
>
> 작성 기준: upstream Draft PR #1349 exact head `cb68ade3d834e137b7d9ad72c49701370794c5a6`, base `origin/master@c12afbccd15f4935a1a52b9f2c2c23882a5033ff`
>
> 공식 authority: 요구사항 `v1.7.32` / 화면정의서 `v1.5.36` / 유저 Flow `v1.3.34` / DB `v1.3.34` / API `v1.2.39`
>
> 계획 authority: `docs/workpacks/planner-shell/evidence/cooking-meal-log-and-product-search-master-plan-20260722.md`, SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d`, 1,018 lines
>
> repair lineage: `P1-ML-01`~`P1-ML-04`는 resolved 상태를 보존한다. latest fresh critic task `019ffbb4-28ab-7410-b1c1-369c7848342e`, HOLD commit/tree `497faaab314e3c864eaf4f6b0d0f3179c16e58c0` / `89869c8b5caa924e2523cb843e04c9476f1bedf3`의 `P1-ML-05`만 current-contract 경로로 최소 수정한다. 새 API/field/action/route 또는 Contract Evolution을 만들지 않는다.
>
> canonical prerequisite provenance: generator task `019ffb5f-b4be-7153-84b8-e4f341bd5ae5`, content head/tree `1b44bb7238cc6d0381805585f371fe12e0cb90f0` / `851ceaa34835b7f5288590a3f0b74f7666e50eb7`; repair task `019ffb73-1f48-7832-8d18-b043209f208a`, content head/tree `910d14e99e71c9a05aa623cbf0a9c3b6f1f9456b` / `a578bf1d8da21a3bce230051399c6be1fd9da78c`; fresh re-review task `019ffb81-4bad-7353-b92b-add4924a4a40`, critique content head/tree `1da1a186b99044d12fc9a940321a9bbefe44ae07` / `c09dd364c8523ffc975836ab5df2c9db9388e3fe`, verdict `APPROVE 0/0/0`. Normalized PR integrations are `d3f76711f98439cd2f4279a53b06775f28d948d8`, `f07367a3109b2651d83e4f382b78dc2b85cd96b9`, `ac188b6e4aa590cac35f5f6df873f5c654a69330`.
>
> 독립성: 이 문서는 작성 산출물이며 critic, product-design-authority 또는 Stage 승인 산출물이 아니다. 작성자는 자기 변경을 승인하지 않는다.

## 1. 목적과 소유권

MEAL_LOG는 사용자가 선택한 하루에 실제로 먹은 음식과 양을 빠르게 기록하고, 끼니 소계와 하루 합계를 결측 상태까지 정직하게 확인하는 화면이다.

### Planner shell 안의 정확한 위치

```text
기존 하단 탭
└─ 플래너                         # 새 bottom tab 없음
   └─ 기존 Planner route          # 새 parallel route 없음
      ├─ 요리 계획                # #10 PLANNER_WEEK 소유
      └─ 식사 기록                # #12 MEAL_LOG 본문 소유
```

- Planner 내부 segment는 정확히 `요리 계획 | 식사 기록` 두 개다.
- #10이 이미 제공하는 route, segment tab semantics, selected date, deep-link/history/back, segment별 scroll/input/focus 복원 계약을 재사용한다.
- #12는 `planner-log-panel`의 본문만 소유한다. shell tablist를 복제하거나 새 navigation state를 만들지 않는다.
- #10 PR #1331은 `2185b59d1b460dac916aa4a4a4a5e061c8b795f0`으로 merge됐으며, MEAL_LOG는 merged shell에 붙는다.
- `PLANNER_WEEK`는 공식 anchor screen이지만 MEAL_LOG 자체는 신규 high-risk required screen이며 공식 anchor screen은 아니다. #10 shell의 segment 구조를 변경하지 않는다.

### 책임 경계

| 소유자 | 책임 | MEAL_LOG에서 금지되는 확장 |
| --- | --- | --- |
| #10 Planner shell | route, bottom tab, outer segment, selected-date/history/focus 복원 | 새 route/tab, outer tab semantics 재정의 |
| #9 meal-log core | day read, recent, create/edit/delete, exact evidence, aggregate, replay/conflict | client total, source/evidence 추정 |
| #8 cooked batch | batch projection, remaining/weight authority, ledger | direct batch/event mutation |
| #11 batch weight UI | eligible weight/lifecycle 안내와 action presentation | MEAL_LOG 안의 새 weight action/API |
| #12 MEAL_LOG | day rail, summary, sections, entry, add/edit/delete UI | 계획 row/status/action, HOME 검색 변경 |

### 공식 out of scope

- 주간 영양 분석, 목표, 달성률, calorie budget, 의료·질환 조언
- Recipe Meal 계획 row, `registered | shopping_done | cook_done`, 계획 영양, 장보기·요리 action
- HOME의 제품·재료 검색, barcode/OCR, free-text external food
- 새 source, API, field, status, error code, DB schema, migration, capability, activation
- client가 entry를 합산해 만드는 authoritative total 또는 두 검색 API의 client merge
- batch 중량 변경, 버림, 조정, unweighed close 자체

## 2. 정보 구조와 day-first 원칙

```text
MEAL_LOG panel
├─ 7-day range controls + date rail
│  ├─ 이전 7일 / 다음 7일
│  ├─ 정확히 한 날짜 선택
│  └─ 기록 유무만 표시
├─ 선택한 하루 heading
├─ day nutrition summary
│  ├─ 열량
│  ├─ 탄수화물 · 단백질 · 지방
│  ├─ 나트륨
│  └─ 일부 정보 없음 N건
├─ active meal sections
│  ├─ meal_plan_columns의 label/order
│  ├─ subtotal + incomplete count
│  ├─ non-deleted entries
│  └─ + {끼니}에 먹은 음식 추가
└─ deleted-column history
   ├─ 삭제된 끼니 · {slot_name_snapshot}
   ├─ 과거 non-deleted entries
   └─ add CTA/new target만 없음; existing entry edit/delete 유지
```

- rail은 현재 7일 범위를 탐색하고, 44px `이전 7일`/`다음 7일` control로 인접 범위에 도달한다. 본문은 선택한 하루만 표시한다.
- 범위 이동은 현재 범위의 시작·끝과 선택일에 같은 `-7일` 또는 `+7일`을 적용한다. 따라서 선택일의 범위 내 상대 위치가 유지되고 새 선택일은 항상 새 rail 안에 보인다.
- grouping authority는 저장된 `consumed_local_date`다. 현재 device/profile timezone으로 과거 `consumed_at`을 다시 계산하거나 다른 날짜로 옮기지 않는다.
- rail의 dot/mark는 `기록 있음/없음`만 뜻한다. 수치, 추세, 주간 합계, 비교, 목표 달성 의미를 넣지 않는다.
- 새 범위의 mark는 각 날짜에 기존 `GET /meal-log?date=YYYY-MM-DD`만 bounded·deduplicated하게 호출해 non-deleted entry 존재 여부로 만든다. 선택일 response는 본문에도 재사용하고, 나머지 response의 entry/total을 주간 값으로 합치거나 표시하지 않는다.
- day total은 active section과 deleted-column snapshot section을 포함한 모든 visible non-deleted entry/section subtotal의 `GET /meal-log` server projection이다. partial/unavailable incomplete count도 포함하며 client가 active-only로 다시 계산하지 않는다.
- soft-deleted entry는 day read와 aggregate에서 보이지 않는다.
- `partial`과 `unavailable`은 0이 아니다. 아는 최소값은 `최소`, 값이 없으면 `정보 준비 중`, 합계에는 `일부 정보 없음 N건`을 함께 표시한다.

### 영양 위계

1. 열량
2. 탄수화물 · 단백질 · 지방
3. 나트륨
4. `예상 | 최소 | 정보 준비 중`과 incomplete count

좋음/나쁨 판정이나 목표 대비 표현은 사용하지 않는다.

## 3. 390px mobile-first wireframe

모바일 page gutter는 좌우 16px이며 모든 조작 target은 최소 44×44px다.

```text
┌──────────────────────────────────────┐ 390px
│ 플래너                               │ #10 shell
│ [ 요리 계획 ] [ 식사 기록 ]          │ selected: 식사 기록
├──────────────────────────────────────┤
│ [‹]       7월 20일–7월 26일       [›]│ 44px range controls
│ 날짜 rail viewport · 한 줄           │ local x-scroll only
│ [월20][화21][수22][목23][금24][토25][일26]│
│              └ 선택 · 기록 있음      │
├──────────────────────────────────────┤
│ 7월 22일 수요일 식사 기록            │ visible h1/panel heading
│ 오늘 먹은 영양                       │
│ 1,620 kcal                           │
│ 탄수 190g · 단백질 82g · 지방 54g   │
│ 나트륨 2,100mg                       │
│ 일부 정보 없음 1건                   │
├──────────────────────────────────────┤
│ 아침                          420 kcal│
│ ──────────────────────────────────── │
│ 닭가슴살 샐러드                      │
│ 120g · [요리한 음식] · 예상          │
│ 210 kcal · 탄수 12g · 단백질 28g…   │
│                         [수정] [삭제] │
│ ──────────────────────────────────── │
│ 연세우유 생크림빵 초코               │
│ 연세우유 · 0.5봉 · [사용자 등록]     │
│ 최소 210 kcal · 일부 정보 없음       │
│                         [수정] [삭제] │
│ [ + 아침에 먹은 음식 추가 ]          │
├──────────────────────────────────────┤
│ 점심                          680 kcal│
│ 어제 요리한 김치찌개 · 300g          │
│ [요리한 음식] · 남은 양 740g         │
│                         [수정] [삭제] │
│ [ + 점심에 먹은 음식 추가 ]          │
├──────────────────────────────────────┤
│ 삭제된 끼니 · 야식       새 추가 없음│
│ 과거 기록 120g · 정보 준비 중        │
│                         [수정] [삭제] │
└──────────────────────────────────────┘
 bottom tab + env(safe-area-inset-bottom) clearance
```

- range control row는 rail 바로 위에 붙고 양쪽 control은 각각 44×44px이다. accessible name은 `이전 7일`/`다음 7일`이며 가운데 visible range label은 분석 summary가 아니다.
- 390px content 폭 안에서 7개 date target은 한 줄 non-wrapping track을 유지한다. 공간이 충분하면 전부 보이고, 200% text/localization에서만 rail 내부가 overflow할 수 있다.
- section 안에 card를 반복 중첩하지 않는다. header + compact list row + divider 구조로 첫 viewport에 summary와 실제 entry가 함께 보이게 한다.
- entry 이름은 최대 2행까지 자연스럽게 줄바꿈한다. 전체 accessible name은 손실하지 않는다.
- source/evidence badge는 CTA보다 약한 시각 무게를 쓴다. badge와 nutrition state를 색만으로 구분하지 않는다.
- `수정` 뒤에 destructive tertiary `삭제`를 둔다. 각각 별도 44×44px target이다.
- deleted-column row에서 `수정`을 열면 origin snapshot과 필수 active-column selector를 quantity/source/date/timezone field보다 먼저 이해할 수 있게 배치한다. placeholder는 선택값이 아니며 save는 명시 선택 전 disabled다.

## 4. 320px narrow wireframe

390px과 정보·DOM 순서는 같고, font/target을 줄이지 않고 세로로 쌓는다.

```text
┌──────────────────────────────┐ 320px
│ 플래너                       │
│ [요리 계획] [식사 기록]      │ 44px min; 200%에서는 reflow
├──────────────────────────────┤
│ [‹]  7월20일–7월26일    [›]  │ 44px each
│ 날짜 rail viewport · 한 줄   │
│ [월20][화21][수22][목23]…    │ rail만 x-scroll
├──────────────────────────────┤
│ 7월 22일 수요일 식사 기록    │
│ 오늘 먹은 영양               │
│ 1,620 kcal                   │
│ 탄수 190g · 단백질 82g       │
│ 지방 54g                    │
│ 나트륨 2,100mg               │
│ 일부 정보 없음 1건           │
├──────────────────────────────┤
│ 아주 긴 사용자 지정 브런치   │
│ 최소 420 kcal                │
│ 일부 정보 없음 1건           │
│                              │
│ 연세우유 생크림빵 초코       │
│ 연세우유                     │
│ 0.5봉 · 사용자 등록 · 최소   │
│ [수정]                       │
│ [삭제]                       │
│                              │
│ [ + 브런치에 먹은 음식 추가 ]│
├──────────────────────────────┤
│ 삭제된 끼니 · 아주 긴 야식   │
│ 새 음식 추가 없음            │
│ 과거 기록                    │
│ [수정]                       │
│ [삭제]                       │
└──────────────────────────────┘
```

- page content 폭은 288px이며 page 자체에는 horizontal overflow가 없어야 한다.
- 7개 44px target은 rail 내부의 한 줄 track에서만 overflow한다. 둘째 줄로 wrap하지 않는다.
- rail 양 끝의 fade/peek는 장식이고 pointer target이 아니다. 바로 위의 range control 한 쌍만 이동 action이며 rail 안에는 이전/다음 control을 중복하지 않는다.
- 선택 날짜가 rail 밖이면 rail의 inline scroll만 `nearest`로 움직인다. page x/y scroll과 focus는 움직이지 않는다.
- section header가 한 줄에 맞지 않으면 `label → subtotal → incomplete` 순서로 쌓는다.
- row action과 sheet footer는 primary/secondary/destructive 우선순서를 DOM과 시각 순서에서 함께 유지한다. label을 줄이거나 target을 압축하지 않는다.
- deleted-column edit에서는 `기존 위치 → 옮길 끼니(필수) → 나머지 편집 field → 저장/취소` 순서를 유지한다. 320px에서 selector, linked error, CTA를 세로로 쌓고 active-column 이름을 말줄임으로 숨기거나 silent default로 대체하지 않는다.

## 5. Desktop adaptation

```text
┌──────────────────────────────────────────────────────────────┐
│ 기존 desktop Planner shell / [요리 계획] [식사 기록]         │
├──────────────────────────────────────────────────────────────┤
│ centered existing content-width system                       │
│ [이전 7일]        7월 20일–7월 26일        [다음 7일]          │
│ 월20 화21 [수22] 목23 금24 토25 일26                          │
│ 7월 22일 수요일 식사 기록                                    │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 오늘 먹은 영양  1,620 kcal                              │ │
│ │ 탄수 190g · 단백질 82g · 지방 54g · 나트륨 2,100mg     │ │
│ │ 일부 정보 없음 1건                                      │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────┬─────────────────────────────┐ │
│ │ 아침 420 kcal              │ 점심 680 kcal               │ │
│ │ ordered entry list         │ ordered entry list          │ │
│ │ + 음식 추가                │ + 음식 추가                 │ │
│ └────────────────────────────┴─────────────────────────────┘ │
│ 삭제된 끼니 history · full-width · no add · edit/delete rows │
└──────────────────────────────────────────────────────────────┘
```

- mobile과 같은 route, segment, date rail, heading, summary, section DOM 순서를 유지한다.
- active sections는 충분한 폭에서 2열로 배치할 수 있으나 configured order와 reading order를 바꾸지 않는다. 한 section의 entry를 여러 열로 쪼개지 않는다.
- 새 dashboard, weekly analytics, side rail 또는 desktop-only navigation을 만들지 않는다.
- add/edit는 mobile의 full-height sheet mental model을 유지하되 가운데 제한 폭 dialog surface로 표현할 수 있다. header/body/footer와 focus contract는 동일하다.
- deleted-column edit의 desktop dialog도 mobile과 같은 read-only origin, 미선택 placeholder, current `active_columns[]` selector, disabled-save 계약을 사용한다. 넓은 화면에서 첫 active column을 자동 선택하거나 origin/target을 한 행으로 축약하지 않는다.
- hover에만 의존하는 정보나 action을 만들지 않는다.

### Deleted-column entry accessibility

- deleted section heading은 snapshot label, subtotal, incomplete count를 programmatic name에 포함하고 section row를 `aria-labelledby`로 연결한다. section 자체를 read-only로 announce하지 않는다.
- 각 기존 row의 action name은 `{slot_name_snapshot}의 {display_name} 기록 수정` / `{slot_name_snapshot}의 {display_name} 기록 삭제`처럼 entry와 snapshot 끼니를 함께 식별한다. 두 action은 44×44px 이상이며 색만으로 destructive 의미를 전달하지 않는다.
- add CTA는 DOM에 없고 keyboard/screen reader focus order에도 새 target이 없다. edit/delete는 section의 server order 안에서 row 다음에 오며, stale/error에서는 기존 scoped fail-closed 규칙에 따라 disabled reason과 retry를 연결한다.
- deleted-column `수정` dialog의 origin은 `기존 위치: 삭제된 끼니 {slot_name_snapshot}` read-only text로 announce한다. `옮길 끼니 (필수)` selector는 현재 owner의 `active_columns[]`만 server order로 제공하고 placeholder에는 selected semantics를 주지 않는다. `required`, linked help/error, 현재 선택 여부를 programmatically 노출하며 첫 active column을 preselect하지 않는다.
- active column이 0개이거나 read가 error면 selector의 empty/error reason과 취소를 제공하고 save를 fail closed한다. authorization을 잃으면 private 값은 가리되 correctable draft와 return-to-action을 폐기하지 않고 로그인/취소만 허용한다. 어느 경우에도 null, 삭제된 이전 UUID, 첫 active column을 payload로 대체하지 않는다.

## 6. 음식 추가 full-height sheet

### Scroll과 context

```text
dialog / viewport boundary
├─ fixed header: 음식 추가 · 7월 22일 · 아침 / 닫기
├─ source tablist: 요리한 음식 | 제품·재료
├─ scroll body: recent/frequent/search/results/selection
└─ sticky footer: quantity confirmation + save/cancel + safe area
```

- active section의 add button을 누르면 invoking date와 active `meal_plan_column_id`가 선선택된다.
- sheet를 여는 순간 route/segment/date/section/scroll/invoker를 capture한다.
- body만 세로 스크롤한다. background page scroll은 lock하고 header/footer가 결과와 validation을 가리지 않게 body에 scroll padding을 둔다.
- 탐색 중 선택이 없으면 빈 sticky footer로 화면을 가리지 않는다. 선택 뒤 실제 양 확인 단계에서 footer를 노출한다.
- 320px과 virtual keyboard 환경에서는 active input, linked error, primary CTA가 동시에 도달 가능해야 한다.
- source switch는 정확히 `요리한 음식 | 제품·재료` 두 tab뿐이다.

### Source switch semantics

- accessible name은 `음식 출처 선택`인 inner `tablist`다.
- 각 control은 `tab`, 각 결과 surface는 연결된 `tabpanel`이다. `aria-selected`, `aria-controls`, `aria-labelledby`를 사용한다.
- selected tab만 `tabindex=0`인 roving tabindex를 쓴다.
- `ArrowLeft/Right`, `Home/End`, `Enter/Space`로 focus와 selection을 명확히 이동한다.
- source를 바꿔도 sheet를 닫거나 다시 열지 않으며 focus는 selected tab에 남는다.
- 이미 사용자가 확인한 quantity를 source switch가 묵시적으로 변경하지 않는다. 다른 item을 명시적으로 선택하면 새 quantity/unit 확인 단계가 시작된다. product는 public direct basis relation을 적용하고, ingredient는 public `default_unit`을 suggestion으로만 채운 뒤 mutation evidence 판정 전까지 허용 단위라고 단정하지 않는다.
- outer Planner tablist와 ID, label, history 또는 panel state를 공유하지 않는다.

### Query empty — one server-ordered recent/frequent list

```text
┌──────────────────────────────────────┐
│ 음식 추가 · 7월 22일 · 아침    [닫기]│
│ [ 요리한 음식 ] [ 제품·재료 ]        │
├──────────────────────────────────────┤
│ 최근·자주 먹은 음식                  │
│ 김치찌개                              │
│ 최근 300g · 3회 기록                 │
│ 연세우유 생크림빵 초코               │
│ 연세우유 · 최근 0.5봉 · 5회 기록     │
│ [더 불러오기]                         │ single cursor
├──────────────────────────────────────┤
│ 선택한 음식                          │
│ 실제 양 [ 0.5 ] [봉]                 │
│ 제안된 양을 확인해 주세요             │
│ [기록 저장]                          │ 320: primary first
│ [취소]                               │
└──────────────────────────────────────┘
```

- `GET /meal-log/recent`의 한 `items[]`를 server 순서 그대로 하나의 `최근·자주 먹은 음식` list에 렌더링한다.
- `frequency`는 `{N}회 기록` metadata로만 표시한다. client threshold, `최근`/`자주` 분리, 중복 row, local re-sort를 만들지 않는다.
- pagination은 response의 한 `next_cursor`와 한 `has_next`만 사용한다. 이전 page와 다음 page는 도착 순서대로 append하고 source별 cursor를 만들지 않는다.
- safe label/brand와 `last amount/unit`은 제안값이다. 선택만으로 저장하지 않고 사용자가 실제 양을 확인해야 save가 활성화된다.
- recent item에는 batch finished/remaining/weight/lifecycle 정보가 없다. cooked-batch source의 rich copy나 gram-save eligibility는 existing `GET /cooked-batches?availability=all`에서 matching `CookedBatchProjection`을 실제로 읽은 경우에만 표시한다. 아직 matching projection이 없으면 recent item의 이름·최근 양·frequency로 추론하지 않고 gram confirmation/save를 fail closed한다.
- 다른 owner/private/deleted/hidden source는 row, count, placeholder, timing copy로도 노출하지 않는다.

### Product/ingredient typed-union search

```text
┌──────────────────────────────────────┐
│ [ 제품·재료 ]                        │
│ [ 연세크림빵__________________ ]     │
├──────────────────────────────────────┤
│ 연세우유 생크림빵 초코               │
│ 연세우유 · [제품] [사용자 등록]      │
│ label basis / 공식 허용 unit         │
│                                      │
│ 식빵                                 │
│ [재료] · 기본 단위 제안: g           │ non-authoritative
│                                      │
│ [더 불러오기]                        │ same opaque cursor
├──────────────────────────────────────┤
│ 실제 양 [____] [단위____]            │ quantity/unit correctable
│ [기록 저장]                          │
│ [취소]                               │
└──────────────────────────────────────┘
```

- `GET /food-catalog/search`의 `ingredient | food_product` discriminated union `items[]`를 server 순서 그대로 렌더링한다.
- pagination은 하나의 `next_cursor`와 `has_next`만 사용한다. source별 API/page/array merge, local re-sort, `브랜드 제품 더보기`는 금지한다.
- no-space brand+product coverage와 relevance는 server authority다. client popularity/source 우선 정렬을 더하지 않는다.
- product는 pin된 exact nutrition version의 direct basis relation으로 허용되는 단위만 제시한다.
- ingredient search row의 public field는 `id`, `standard_name`, `category`, `default_unit`뿐이다. `default_unit`은 입력을 돕는 non-authoritative suggestion이며 approved profile/conversion/piece evidence 또는 허용 단위 목록으로 표현하지 않는다.
- ingredient 선택 뒤 quantity와 unit은 모두 사용자가 교정할 수 있다. client는 `default_unit`, 이름, category 또는 hard-coded table로 g/mL/개/장/스푼 환산 가능성을 선판정하지 않는다.
- ingredient mutation이 기존 approved profile + exact conversion/piece evidence를 최종 검증·pin하는 authority다. exact 환산이 없으면 입력한 quantity/unit과 현재 search result/cursor context를 그대로 보존하고 linked field error `422 UNIT_CONVERSION_MISSING`을 표시하며 row/event를 만들지 않는다. 새 search field나 evidence lookup API를 요구하지 않는다.

### Cooked batch cards

```text
known + available + enough remaining
┌──────────────────────────────────────┐
│ 김치찌개 · 7월 21일                  │
│ 완성 1,480g · 남은 740g              │
│ 영양 예상                            │
│ 실제 양 [300] g                      │
│ [기록 저장]                          │
└──────────────────────────────────────┘

missing + available
┌──────────────────────────────────────┐
│ 김치찌개 · 7월 21일                  │
│ 무게 입력 필요                       │
│ g 식사 기록을 저장할 수 없어요       │
│ [eligible #11 중량 안내]             │ only when eligible
│ 저장 불가                            │
└──────────────────────────────────────┘

unrecoverable + available
┌──────────────────────────────────────┐
│ 김치찌개 · 7월 21일                  │
│ 원래 무게 확인 불가                  │
│ 중량 입력과 g 식사 기록을 제공하지 않음│
│ 저장 불가                            │
└──────────────────────────────────────┘

depleted · read-only
┌──────────────────────────────────────┐
│ 김치찌개 · 7월 21일                  │
│ 무게 없이 모두 버림                  │ exact #11 reason copy
│ action 없음                          │
└──────────────────────────────────────┘

legacy-null · read-only
┌──────────────────────────────────────┐
│ 김치찌개 · 7월 21일                  │
│ 이전 기록 · 중량 상태를 확인할 수 없음│ exact #11 copy
│ 이전 기록이라 중량과 잔량 상태를     │ exact #11 copy
│ 추정하지 않아요                      │
│ 영양 상태를 확인할 수 없음           │ exact #11 copy
│ action 없음                          │
└──────────────────────────────────────┘
```

- card는 공식 `CookedBatchProjection`에서 `cooked_at`, `recipe_title`, `finished_weight_g`, `remaining_weight_g`, `weight_status`, `batch_status`, `nutrition_calculation_status`, `revision`을 소비한다.
- only `known + available + remaining_weight_g > 0`이고 입력량이 authoritative remaining 이하일 때 gram save가 가능하다.
- missing에서 실제 #11 eligibility가 있을 때만 기존 #11 surface/action으로 안내한다. MEAL_LOG가 새 weight mutation, route, status, error 또는 action을 정의하지 않는다.
- unrecoverable은 weight/known 복원과 g meal-log를 제공하지 않는다.
- missing/unrecoverable의 비-g 종료는 nutrition/meal-log entry를 만들지 않으며 #12의 action이 아니다.
- `availability=all` page의 item을 client가 상태별로 제거하거나 다시 정렬하지 않는다. `items[]`를 server 순서대로 모두 소비하고 `next_cursor`/`has_next`를 그대로 이어서, disabled row가 cursor boundary나 다음 page 도달을 바꾸지 않게 한다.
- `batch_status=depleted`는 `depleted_reason`의 기존 #11 여섯 문구 `다 먹음 | 모두 버림 | 먹음·버림으로 소진 | 무게 없이 다 먹음 | 무게 없이 모두 버림 | 무게 없이 먹고 버림` 중 exact one만 표시한다. finished/remaining/nutrition을 추정·재계산하지 않고 meal-log save, #11 lifecycle mutation, `방금 종료 취소` link를 모두 제공하지 않는다.
- `weight_status` 또는 `batch_status`가 legacy `null`이면 기존 #11 copy `이전 기록 · 중량 상태를 확인할 수 없음`, `이전 기록이라 중량과 잔량 상태를 추정하지 않아요.`, `영양 상태를 확인할 수 없음`만 사용한다. servings/name/legacy `status`로 gram, nutrition, missing 또는 depleted를 추론하지 않고 선택·save·weight/lifecycle action을 제공하지 않는다.

## 7. Add / edit / delete mutation wireframes

### Create confirmation

```text
선택한 음식  김치찌개 · 요리한 음식
기록 위치    7월 22일 · 아침
실제 양      [300] g
시간         기록 당시 값 / 모르면 과거 시각 없음

[기록 저장]
[취소]
```

- 한 deliberate create에 fresh UUID `Idempotency-Key`를 사용한다.
- network retry는 same key + same canonical payload를 재사용한다.
- server success entry와 refreshed subtotal/day total을 한 번만 반영한다.

### Edit sheet

```text
┌──────────────────────────────────────┐
│ 기록 수정 · 7월 22일                │
│ 삭제된 끼니 · 야식             [닫기]│
│ 김치찌개 · 요리한 음식               │
│ 기존 위치  삭제된 끼니 · 야식        │ read-only origin
│ 옮길 끼니 (필수)                     │
│ [ 선택해 주세요                 ▾ ]  │ no preselection
│ 실제 양 [300] g                      │
│ 날짜 [2026-07-22]                    │
│ 시간대 [Asia/Seoul]                  │
│ 실제 시각 [알 수 없음 / 값]          │
│                                      │
│ [수정 저장] disabled until selection │
│ [취소]                               │
└──────────────────────────────────────┘
```

- 시작값은 current entry의 pinned source/evidence와 current `revision`이다.
- request는 `expected_revision`을 포함한다.
- deleted/null column의 기존 entry도 이 editor를 열지만, 그 row에서 시작한 **모든 edit save**는 quantity/source/date/timezone 중 무엇을 바꾸는지와 무관하게 현재 `active_columns[]` 중 하나를 사용자가 명시적으로 선택하고 확인해야 한다. selector는 열릴 때 항상 미선택이며 current snapshot, 삭제된 이전 UUID 또는 첫 active column을 preselect하지 않는다.
- 선택 전 save는 disabled다. 선택 뒤 기존 official PATCH full body에 quantity/source/date/timezone field, current `expected_revision`, 선택한 active owner `meal_plan_column_id`를 함께 보낸다. `slot_name_snapshot`은 client request field가 아니며 server가 선택된 active column의 current name snapshot으로 교체한다. null/snapshot 위치 보존 PATCH, partial PATCH, 새 relocation action을 약속하지 않는다.
- active column이 없거나 list read가 실패하면 입력을 보존하고 save를 disabled한 채 retry와 cancel을 제공한다. unauthorized에서는 private 값을 숨기고 draft/return context를 보존해 login 또는 cancel만 제공한다. list refresh, stale revision 또는 선택한 column의 삭제/권한 실패 뒤에는 다른 편집값을 유지하되 selection을 clear하고 linked selector/error에 focus한 뒤 explicit reselection을 요구한다.
- corrected payload는 fresh UUID의 새 deliberate operation이다. identical payload의 network retry만 same key를 재사용한다. pending은 duplicate submit/dismiss를 잠그고 stored replay는 선택된 destination과 server result를 한 번만 반영한다.
- batch edit는 자기 active consumed event만 reversal하고 replacement를 append한다. 같은 양의 다른 entry는 건드리지 않는다.
- product/ingredient edit는 새 exact evidence가 필요한 경우 그 evidence를 pin하며 current mutable product/profile로 조용히 repin하지 않는다.
- `consumed_local_date`, IANA `timezone_name_snapshot`, nullable `consumed_at`을 함께 저장한다. 과거 시각을 모르면 `consumed_at=null`을 유지한다.

### Delete confirmation

```text
┌──────────────────────────────────────┐
│ 식사 기록을 삭제할까요?              │
│ 김치찌개 · 300g · 7월 22일 아침      │
│ 요리한 음식이면 이 기록의 섭취 event만│
│ 되돌리고 기록은 목록에서 사라져요.   │
│                                      │
│ [취소]                               │ safe first
│ [삭제]                               │ destructive last
└──────────────────────────────────────┘
```

- delete는 current `expected_revision`과 fresh UUID key를 보낸다.
- 모든 source에서 `deleted_at` soft delete다. batch는 자기 event reversal + pointer null + soft delete를 한 transaction에서 수행한다.
- deleted-column row의 delete는 active-column selection이나 relocation을 요구하지 않는다. origin snapshot context에서 그대로 확인하고 official DELETE만 호출한다.
- hard delete, 다른 same-amount entry 변경, client-side optimistic aggregate 확정은 없다.
- 취소/성공/오류 뒤 invoking edit/delete control로 focus를 복원한다. soft delete로 invoker가 사라지면 같은 deleted section heading, 그것도 없으면 panel heading을 사용한다.

## 8. Required state matrix

| State | 화면 표현 | 허용 action | Fail-closed 기준 |
| --- | --- | --- | --- |
| `default` | selected date, day total, ordered sections/entries | add/edit/delete | server projection만 표시 |
| `loading` | rail/summary/section geometry skeleton | safe segment/back only | mutation disabled, row/total 추정 없음 |
| `empty` | active sections와 각 add CTA, `기록된 음식 없음` | active section add | fake `0 kcal` total 금지 |
| `error` | safe loaded rows 유지 + scope retry + alert | retry, safe navigation | stale data mutation disabled |
| `unauthorized` | private row 숨김 + login guidance | login, safe back | segment/date/meal/pending action 보존 |
| `partial` | known minimum + incomplete count + `최소` | 정상 탐색/정정 | minimum을 complete로 표현하지 않음 |
| `unavailable` | number 없이 `정보 준비 중` | 정상 탐색/정정 | 0 보충/current repin 금지 |
| deleted column | snapshot label + subtotal/incomplete + past entries; edit origin은 read-only | existing entry edit/delete; edit는 active column explicit selection, delete는 origin에서 그대로 | add/new target 0; edit save는 미선택/active 0/read error/unauthorized에서 disabled, null-preserve·silent default 없음 |
| missing batch | `무게 입력 필요`, disabled reason | eligible #11 안내만 | g save 없음 |
| unrecoverable batch | `원래 무게 확인 불가` | safe close/back | weight/g save 없음 |
| depleted batch | exact #11 six-reason copy + read-only | none | gram/nutrition 추정, meal-log save, lifecycle action 없음 |
| legacy-null batch | exact #11 unknown-history + nutrition-unknown copy | none | status/servings/name에서 gram·nutrition·action 추정 없음 |
| `pending` | retained input + `저장 중` status | none | duplicate submit/dismiss 차단 |
| stored replay | authoritative first result, one feedback | safe continuation | duplicate row/toast/remaining change 없음 |
| stale conflict | retained input + refreshed authority + focused alert | correct/retry | stale success projection 없음 |
| correctable 422 | retained field + exact server error + linked help | correct/retry | invalid row/event 0 |

### Loading

```text
[date rail skeleton ─────────────]
[day summary skeleton            ]
아침 [entry row skeleton         ]
점심 [entry row skeleton         ]
```

- skeleton은 interactive control처럼 보이지 않는다.
- active panel만 loading되며 plan panel cache/scroll을 지우지 않는다.

### Empty

```text
오늘 먹은 영양
기록된 음식이 없어요

아침   기록 없음
[ + 아침에 먹은 음식 추가 ]
점심   기록 없음
[ + 점심에 먹은 음식 추가 ]
```

- empty와 complete zero를 혼동하지 않는다. day total number를 꾸며 만들지 않는다.
- active sections는 사라지지 않으며 add target은 명확히 보인다.

### Scoped error

```text
아침의 최신 기록을 불러오지 못했어요  role=alert
[다시 시도]

이전에 안전하게 읽은 entry는 유지
수정/삭제는 최신 authority 전까지 disabled
```

- already-loaded entry는 안전할 때 유지한다. 전체 panel을 빈 화면으로 바꾸지 않는다.
- error scope와 retry target을 연결하고 announcement를 한 번만 낸다.

### Unauthorized / return-to-action

```text
식사 기록은 로그인이 필요해요
[로그인]
[플래너로 돌아가기]
```

- private label, brand, source ID, count, date history를 먼저 렌더링하지 않는다.
- return context는 existing Planner route, `식사 기록` segment, selected date, meal, pending add/edit action과 invoker를 보존한다.
- 로그인 뒤 latest authority를 reload하고 원래 invoker, 없으면 panel heading에 focus한다.

### Partial / unavailable

```text
partial
오늘 먹은 영양  최소 1,620 kcal
탄수 최소 190g · 단백질 82g · 지방 54g
일부 정보 없음 1건

unavailable
오늘 먹은 영양  정보 준비 중
일부 정보 없음 1건
```

- `최소`와 incomplete count를 함께 보여준다.
- unavailable nutrient는 숫자나 `0`을 표시하지 않는다.
- entry는 숨기지 않으며 source의 evidence 상태를 그대로 보존한다.

### Pending / replay / conflict

```text
pending: [기록 저장 중…] disabled + role=status

replay: same key + same payload
        → stored result one apply
        → duplicate entry/event/remaining change 없음

conflict: 입력 유지
          최신 entry/batch authority refresh
          focused role=alert
          사용자가 교정 후 새 deliberate operation
```

- pending 중 Escape, close, browser back으로 동일 operation을 애매하게 중복 시작하지 않는다. safe cancellation 계약이 없는 in-flight mutation은 dismiss를 잠근다.
- same key + different payload는 성공처럼 반영하지 않는다.
- stale `expected_revision`은 server conflict를 표시하고 correctable input을 보존한다.
- deleted-column edit의 stale revision, active-column list refresh 또는 선택 column 소실은 quantity/source/date/timezone draft를 보존하되 prior selection을 authority로 재사용하지 않는다. 최신 entry와 `active_columns[]`를 refresh하고 selector/error에 focus한 뒤 explicit reselection을 받아 fresh key의 corrected payload를 만든다. identical in-flight payload replay만 기존 key/result를 한 번 적용한다.
- ingredient의 `UNIT_CONVERSION_MISSING`은 client prevalidation 결과가 아니라 mutation의 evidence 판정이다. 사용자가 입력한 quantity/unit을 유지하고 해당 field group과 error를 programmatically 연결한다. `CONSUMED_DATE_TIMEZONE_MISMATCH`도 관련 field group과 연결한다.

## 9. Focus, keyboard, screen reader

### Outer Planner segment

- #10 `PlannerSegmentTabs`의 `tablist`/roving tabindex/history 계약을 그대로 사용한다.
- ordinary `요리 계획 ↔ 식사 기록` 전환은 panel heading으로 focus를 강제하지 않는다.
- deep-link, auth-return, invoker-loss fallback일 때만 restored panel heading을 focus target으로 쓴다.

### 7-day rail

- accessible name `식사 기록 날짜 선택`인 single-selection `radiogroup`을 사용한다.
- rail 바로 앞의 `이전 7일`/`다음 7일`은 각각 44×44px 이상인 ordinary button이다. activation은 현재 범위와 선택일 모두를 정확히 7 calendar days 이동하고, selected date를 새 range 안의 같은 상대 위치에 둔다.
- 최초 진입, cold deep-link, Back/Forward 복원의 7일 범위는 URL selected date를 포함하는 월요일~일요일이다. range 자체를 새 query parameter로 저장하지 않고 existing `date`만으로 동일 범위를 결정한다.
- range/date 선택은 기존 `/planner?segment=log&date=YYYY-MM-DD`와 #10 `buildPlannerShellHref` 의미를 사용해 unrelated Planner query context를 보존하며 deliberate change마다 history에 한 번만 `push`한다. 동일 destination은 no-op이다.
- browser Back/Forward와 cold deep-link는 URL의 `date`를 authority로 삼아 그 날짜를 포함하는 7일 range와 selected radio를 복원하고, sync 과정에서 `push`/`replace`를 추가 호출하지 않는다.
- pointer/keyboard로 range button을 누른 뒤 focus는 invoked button에 남는다. data가 도착해도 page x/y scroll이나 focus를 옮기지 않고, selected radio가 rail 밖에 있을 때만 rail inline scroll을 `nearest`로 조정한다. Back/Forward의 ordinary sync도 강제 heading focus를 만들지 않으며 #10의 deep-link/auth-return/invoker-loss fallback만 예외다.
- 7개 target은 `radio`, 정확히 하나만 `aria-checked=true`이며 selected radio만 `tabindex=0`이다.
- accessible name은 `2026년 7월 22일 수요일, 기록 있음`처럼 full date/day와 presence만 포함한다.
- `ArrowLeft/Right`는 현재 7일 안의 이전/다음 날짜, `Home/End`는 현재 range의 처음/마지막 날짜로 focus와 selection을 함께 이동한다. edge에서는 cyclic wrap하거나 암묵적으로 range를 바꾸지 않으며, 인접 range는 명명된 44px range button으로 이동한다. `Space/Enter`는 멱등 선택이다.
- selected target이 rail 밖이면 rail만 최소 거리로 스크롤하며 44×44px focus target 전체가 보인다.
- 선택 후 visible heading과 day body를 갱신한다. 새 range의 mark read가 진행 중이거나 일부 date read가 실패하면 해당 mark만 unknown/loading/error로 두고 기록 없음으로 단정하지 않는다. stale/aborted range response가 현재 range mark를 덮지 못한다. 중복 history push나 동일 문구의 중복 live announcement는 없다.

### Sheet/dialog focus lifecycle

1. opener와 route/segment/date/section/scroll context를 저장한다.
2. background를 inert 처리하고 scroll을 lock한다.
3. dialog title을 인식할 수 있게 한 뒤 첫 meaningful field/control로 focus한다. deleted-column edit에서는 read-only origin을 먼저 읽을 수 있게 연결하고 최초 focus를 미선택 `옮길 끼니 (필수)` selector에 둔다.
4. `Tab/Shift+Tab`을 enabled header/body/footer control 안에 trap한다.
5. pending이 아닐 때 `[닫기]`, `[취소]`, Escape, platform back은 같은 close contract를 사용한다.
6. validation/authority error는 dialog와 입력을 유지하고 linked selector/error에 focus한다. 이후 cancel/close하면 invoker와 scroll을 복원한다. successful deleted-column edit로 origin row가 destination으로 이동하면 selected active destination의 updated entry action, 없으면 destination section heading에 focus한다. delete로 invoker가 사라지면 deleted section heading, 그것도 없으면 restored panel heading을 쓴다.
7. 409/422는 focused `role=alert`로 이동하고 linked input이 `aria-describedby`로 message를 참조한다.

### Announcements

- read error/validation error/delete failure는 `role=alert`.
- loading/pending/replay success는 concise `role=status` 또는 polite live region.
- source tab change와 date heading change는 각각 한 번만 알린다.
- source type, nutrition completeness, disabled reason, selected state는 text와 programmatic state를 함께 사용한다.
- raw UUID, opaque cursor, event ID, operation key, payload hash, account generation은 보이거나 읽히지 않는다.

### Reduced motion and text scaling

- `prefers-reduced-motion`에서는 sheet transition과 rail smooth scroll을 제거한다. 상태 의미를 animation에 의존하지 않는다.
- 200% text에서도 date target, source tab, entry/source association, quantity/unit, error, footer CTA가 잘리거나 겹치지 않는다.
- 긴 한국어 meal label, product name, brand는 wrap한다. font를 줄여 맞추지 않는다.

## 10. Exact API / source / evidence binding

### Public API authority

아래 7개 existing endpoint만 소비한다. 모든 response는 `{ success, data, error }`, error는 `{ code, message, fields[] }` shape다.

| UI 책임 | Existing endpoint | Official authority | UI binding / 금지 |
| --- | --- | --- | --- |
| selected day read | `GET /meal-log?date=YYYY-MM-DD` | API v1.2.39 §H | stored date exact match, ordered active/deleted sections, subtotal/day total; client regroup/re-total 금지 |
| recent projection | `GET /meal-log/recent` | API v1.2.39 §H | one server-ordered `최근·자주 먹은 음식` list + one cursor; `frequency` metadata only, suggestion requires confirmation |
| batch picker | `GET /cooked-batches?availability=all` | API v1.2.39 §0-CBW, §G | owner-only `CookedBatchProjection`; cursor/filter 해석 금지 |
| create | `POST /meal-log/entries` | API v1.2.39 §H | fresh UUID key, exact-one source, date/timezone/nullable instant |
| edit | `PATCH /meal-log/entries/{id}` | API v1.2.39 §H | full body + expected revision + exact evidence; deleted origin은 user-selected active owner column UUID 필수, server가 slot snapshot 교체 |
| delete | `DELETE /meal-log/entries/{id}` | API v1.2.39 §H | expected revision, soft delete, own batch event reversal |
| product/ingredient search | `GET /food-catalog/search` | API v1.2.39 §I | single typed union/order/cursor; no visibility param/client merge |

MEAL_LOG는 `PATCH /cooked-batches/{id}/weight`, discard, adjust, close-unweighed 또는 직접 DB/RPC를 호출하지 않는다.

- 7-day range의 presence mark도 위 selected-day endpoint를 날짜별로 bounded reuse한다. range/weekly endpoint를 추가하지 않고 seven responses를 합산·분석하지 않는다.
- range 전환 중 request identity는 owner/generation + exact date에 묶고 현재 range 밖 response는 화면 mark에 반영하지 않는다.

### Day and entry projection

Current #9 consumer spelling은 `types/meal-log.ts`의 아래 projection을 사용한다. 이 파일은 merged implementation evidence이며 public contract를 확장하는 authority가 아니다. 공식 문서와 충돌하면 HOLD 후 Contract Evolution을 먼저 처리한다.

| UI datum | Current projection field | 표시 규칙 |
| --- | --- | --- |
| selected date | `MealLogDayData.date` | `consumed_local_date` grouping 결과 |
| active order | `active_columns[]`, `active_sections[]` | server order 그대로 |
| deleted history | `deleted_column_sections[]` | active 뒤 표시; add/new target 없음, existing entry edit/delete 유지 |
| section truth | `subtotal`, `incomplete_count` | partial/unavailable 유지 |
| day truth | `day_total`, `day_total.incomplete_count` | client 재합산 금지 |
| entry identity | `id`, `revision` | raw ID 미노출, revision mutation에만 사용 |
| stored context | `consumed_local_date`, `timezone_name_snapshot`, `consumed_at`, `meal_plan_column_id`, `slot_name_snapshot` | nullable instant 보존; deleted snapshot은 read-only origin label, edit success는 selected active column/server snapshot으로 이동 |
| exact source | `source.type`, `source.id` | type은 `cooked_batch | food_product | ingredient` exact-one |
| actual intake | `quantity.amount`, `quantity.unit` | product public relation 또는 ingredient mutation evidence가 검증한 단위; ingredient prevalidation claim 금지 |
| display snapshot | `display_name`, nullable `display_brand` | current source로 조용히 교체 금지 |
| nutrition compact | `nutrition.calculation_status`, 5 nutrient values | complete/partial/unavailable과 null 유지 |

핵심 5종은 `calories_kcal`, `carbohydrate_g`, `protein_g`, `fat_g`, `sodium_mg`다. null을 0으로 바꾸지 않는다.

### Cooked batch projection

공식 `CookedBatchProjection` exact 15 keys는 다음과 같다.

`id`, `recipe_id`, `recipe_title`, `recipe_thumbnail_url`, `status`, `cooked_at`, `cooking_servings`, `finished_weight_g`, `remaining_weight_g`, `weight_status`, `batch_status`, `depleted_reason`, `revision`, `nutrition_calculation_status`, `current_unweighed_closure_event_id`.

- MEAL_LOG picker는 name/date/finished/remaining/weight/batch/nutrition state만 표시한다.
- legacy `status`를 새 authority로 사용하지 않는다. 신규 authority는 `weight_status`, `batch_status`, `depleted_reason`이다.
- `availability=all`의 server order와 single cursor를 보존한다. known+available만 gram 후보이며 missing/unrecoverable+available은 기존 차단/eligible #11 안내, depleted와 legacy-null은 read-only/no-action row로 disposition한다.
- depleted는 exact six-reason copy 외 gram/nutrition/action을 만들지 않는다. legacy null에서는 servings/name/legacy `status`로 g, nutrition, missing/depleted 또는 action을 추론하지 않는다.
- content snapshot ID, generation, event/operation metadata는 public/UI에 노출하지 않는다.

### Mutation and evidence rules

- source는 exact-one `cooked_batch | food_product | ingredient`다.
- batch는 `known + available + enough remaining`을 server가 lock한 경우만 entry + consumed event + active pointer + remaining projection을 한 transaction에서 만든다.
- product는 pinned exact nutrition version의 direct basis relation만 쓴다.
- ingredient search의 `default_unit`은 non-authoritative suggestion일 뿐이다. mutation만 approved profile + exact conversion/piece evidence를 검증·pin하며 client는 evidence 존재나 허용 단위를 선판정하지 않는다.
- product/ingredient edit는 current mutable source로 silent repin하지 않는다.
- date/timezone/nullable instant는 함께 저장하며 불일치는 `422 CONSUMED_DATE_TIMEZONE_MISMATCH`다.
- exact conversion 부재는 입력 quantity/unit을 보존하는 row/event 0의 `422 UNIT_CONVERSION_MISSING`이다.
- same key/same payload는 최초 durable result, same key/different payload는 `409 IDEMPOTENCY_KEY_REUSED`다.
- key 누락은 `428 IDEMPOTENCY_KEY_REQUIRED`, UUID 형식 오류는 `400 INVALID_IDEMPOTENCY_KEY`다.
- current implementation의 stale revision은 `409 CONFLICT`, missing/other-owner entry는 nondisclosing `404 RESOURCE_NOT_FOUND`다. UI는 server `code/message/fields[]`를 표시하며 새 public alias를 만들지 않는다.
- deleted-column PATCH도 별도 endpoint/action 없이 같은 full mutation shape를 쓴다. current implementation parser는 non-null UUID `meal_plan_column_id`를 요구하고 RPC는 active owner column을 확인한 뒤 `meal_plan_column_id`와 `slot_name_snapshot`을 그 column의 current ID/name으로 함께 쓴다. selector/list/authority failure를 null-preserve request나 client-authored snapshot으로 우회하지 않는다.

## 11. Scroll containment, tokens, visual hierarchy

### Containment

- page-level horizontal scroll은 390px, 320px, desktop 모두 금지다.
- day rail만 `overflow-x:auto`와 `overscroll-behavior-inline:contain`을 가진다.
- rail track은 `display:flex`, `flex-wrap:nowrap`, `inline-size:max-content`, `min-inline-size:100%`; date target은 shrink하지 않는다.
- page `scrollWidth === clientWidth`를 future runtime assertion으로 잠근다.
- sheet는 background/body scroll lock + internally scrollable body + safe-area footer 구조다.
- bottom tab과 `env(safe-area-inset-bottom)`만큼 마지막 content clearance를 둔다.

### Tokens

- app mobile-scoped current palette를 사용하고 MEAL_LOG 전용 hex를 만들지 않는다.
- selected/primary: `--brand-primary`, pressed: `--brand-primary-hover`, selected soft surface: `--brand-primary-soft`.
- surface/text/border: `--surface`, `--surface-fill`, `--surface-subtle`, `--text-2/3/4`, existing border token.
- shape: `--radius-control`, `--radius-card`, `--radius-panel`, `--radius-sheet`.
- spacing: `--space-1/2/3/4/5/6/8`; mobile gutter는 `--space-4`.
- default control은 `--control-height-md` 44px 이상, primary CTA는 `--control-height-lg` 48px을 우선한다.
- body/button/input은 16px readable text를 기본으로 하고 badge/meta만 작은 scale을 쓴다.

### Hierarchy

- day summary는 compact card/panel 하나로 묶고 actual entry보다 더 큰 장식 영역이 되지 않게 한다.
- add/save가 primary, edit/cancel/retry가 secondary, delete가 destructive tertiary다.
- danger는 existing danger token + text/icon을 함께 사용한다.
- recent/source/evidence badge가 primary CTA와 경쟁하지 않는다.

## 12. Future evidence contract

이 Stage 1 markdown/ASCII는 runtime evidence가 아니다. Stage 4는 exact implementation head에서 `ui/designs/evidence/meal-log-ui/` 아래 fresh evidence와 `manifest.json`을 생성해야 한다.

### Required visual captures

automation spec의 각 390px mobile-default, 320px mobile-narrow, desktop capture는 다음 17개 state를 모두 포함한다.

1. default
2. loading
3. empty
4. error
5. unauthorized
6. partial
7. unavailable
8. deleted-column
9. add-sheet-recent
10. add-sheet-search
11. missing-batch
12. unrecoverable-batch
13. edit
14. delete-confirm
15. pending
16. replay
17. conflict

manifest는 implementation head SHA, viewport, fixture/state, capture time을 기록한다.

위 17개 filename/state 계약은 automation spec과 동일하게 유지한다. 아래 repair는 새 artifact 이름을 발명하지 않고 `default`, `add-sheet-recent`, `add-sheet-search`, `missing-batch`, `unrecoverable-batch` capture의 fixture와 deterministic assertion에서 함께 증명한다.

### Evidence matrix

| Evidence | 390px | 320px | Desktop | Runtime assertion |
| --- | --- | --- | --- | --- |
| default | one-row rail, selected day/summary/entry | rail-local overflow, stacked action | same IA, centered width | one selected date, no weekly analytics |
| rail geometry | 7 targets same top, 44px min | `scrollWidth > clientWidth`, no wrap | all seven visible when possible | page no overflow; rail only moves |
| loading/empty/error/auth | panel-scoped states | text/action reflow | same state semantics | mutations fail closed; safe rows preserved |
| partial/unavailable | minimum/missing truth | no clipping/zero | same truth | null never becomes zero |
| deleted history | active 뒤 no-add + row edit/delete; origin/required target visible | actions/selector stack, 44px 유지 | full-width after active; same dialog contract | new entry impossible; PATCH requires explicit active target, DELETE needs no relocation |
| add recent/search | header/body/footer boundaries | keyboard-safe stack | limited-width sheet | confirmation; one union/cursor |
| batch blocked | exact missing/unrecoverable copy | disabled reason visible | same behavior | no g save/new weight action |
| edit/delete | context and hierarchy | primary/cancel/destructive stack | visible focus | expected revision; own event only |
| pending/replay/conflict | retained input/status | error above keyboard/footer | same behavior | one in-flight/apply; refresh + preserve |
| `P1-ML-01` range movement | 44px controls + selected date visible | controls do not compress rail | same route/IA | ±7 days; one push; Back/Forward no extra history; existing day reads only |
| `P1-ML-02` `availability=all` | depleted/legacy-null read-only fixture | reason/unknown copy wraps | same order/cursor | exhaustive disposition; no guessed gram/nutrition/action; cursor preserved |
| `P1-ML-03` recent projection | one `최근·자주 먹은 음식` list | frequency metadata fits | same single list | server order + single cursor; no threshold/split/duplicate |
| `P1-ML-04` ingredient evidence | `default_unit` shown only as suggestion | quantity/unit + linked 422 reachable | same correction flow | mutation is evidence authority; input preserved; no pre-known approved-unit claim |
| `P1-ML-05` deleted edit target | origin snapshot + unselected required selector + disabled save | origin/selector/error/CTA stack; no clipping | same active-only selector and focus contract | every edit save has explicit active owner UUID; server replaces slot snapshot; no null/deleted UUID/silent default; active 0/error/unauthorized fail closed |

### Future deterministic/browser evidence

- route/deep-link/back이 same segment/date/section/scroll/focus를 복원하고 duplicate history를 만들지 않는다.
- `P1-ML-01`: range button click이 start/end/selected date를 exact ±7일 이동하고 selected date를 visible하게 유지하며 `/planner?segment=log&date=...`에 deliberate push exactly one을 만드는지 검증한다. Back/Forward/cold deep-link sync는 history write 0, page scroll/focus 이동 0, mark source는 seven bounded existing day reads뿐이어야 한다.
- 390/320/desktop에서 date radiogroup의 one checked radio, roving tabindex, Arrow/Home/End/Space, visible focus를 검증한다.
- selected radio 이동이 rail `scrollLeft`만 바꾸고 page x/y scroll을 바꾸지 않는지 검증한다.
- source tablist의 tab/panel 연결, keyboard 이동, active-tab focus 유지, sheet non-reopen을 검증한다.
- sheet open/close, Tab/Shift+Tab trap, Escape, pending dismiss lock, invoker restore를 검증한다.
- virtual keyboard에서 active input, linked error, primary CTA가 도달 가능한지 검증한다.
- pending duplicate block, same-key replay one-apply, stale revision refresh/input preservation를 검증한다.
- deleted-column fixture에서 add CTA/new target은 0이고 기존 row의 edit/delete는 각각 노출되는지 검증한다. edit open마다 origin snapshot은 read-only이고 active target은 미선택이며, quantity/source/date/timezone 변경을 포함한 모든 save가 explicit active owner column 선택 전 disabled인지 확인한다. payload는 existing full PATCH field와 selected UUID만 사용하고 server response의 selected-column ID/name snapshot을 반영하며 null/삭제 UUID/silent default/새 field는 0이어야 한다.
- `P1-ML-05`: active column 0, list error, authorization loss, 선택 column 소실, stale revision fixture에서 correctable draft/return context를 보존하고 save를 fail closed하는지 검증한다. refresh 뒤 selection은 clear되고 selector/error focus + explicit reselection이 필요하다. corrected payload는 fresh key, identical retry는 same key/replay one-apply이며 batch는 own active event만 replacement한다. error는 dialog 안 linked selector/error, 이후 cancel/close는 invoking edit action, successful move는 destination entry/section heading, DELETE success는 deleted section heading/panel heading으로 focus를 복원한다.
- typed union request/response가 single list/cursor이며 client dual-API merge가 없는지 검증한다.
- `P1-ML-02`: `availability=all` fixture의 known+available, missing+available, unrecoverable+available, six depleted reasons, legacy-null을 같은 server order/cursor로 통과시키고 depleted/legacy-null의 select/save/weight/lifecycle action이 0인지 검증한다.
- `P1-ML-03`: recent pages를 한 server order와 한 cursor로 append하고 `frequency`가 metadata로만 렌더링되며 client section split, threshold, duplicate, re-sort가 0인지 검증한다.
- `P1-ML-04`: ingredient `default_unit`이 approved evidence로 announce되지 않고 quantity/unit이 교정 가능하며 mutation `422 UNIT_CONVERSION_MISSING` 뒤 두 입력과 cursor가 유지되고 row/event가 0인지 검증한다.
- `axe`와 keyboard-only flow에서 critical/serious finding 0과 name/role/value를 확인한다.

### Evidence 한계와 Manual Only

- static markdown/PNG는 keyboard focus order, focus trap/restore, Escape, live announcement, actual 44px DOM geometry를 증명하지 못한다.
- Playwright/axe만으로 VoiceOver/TalkBack 실제 읽기 순서, 물리 keyboard, real device safe-area/virtual-keyboard occlusion을 완전히 증명하지 못한다.
- server-Mac, OAuth, merged-exact production/local rehearsal, capability `R/R+1/R+2`, production, activation evidence는 #12 Stage 1 설계 범위 밖이며 pending이다.
- 이 문서는 runtime screenshot, final authority, WCAG conformance 또는 Stage 2 readiness를 주장하지 않는다.

## 13. Contract Evolution HOLD 기준

`P1-ML-01`~`P1-ML-04` resolved 계약과 이번 `P1-ML-05` repair는 existing route, `active_columns[]`, existing PATCH `meal_plan_column_id`, server-owned slot snapshot과 7개 read/mutation contract의 presentation binding만 명확히 하므로 Contract Evolution을 요구하지 않는다.

아래가 필요하면 이 파일에서 해결하거나 새 UI로 우회하지 않고 HOLD로 보고한다.

- 공식 7개 endpoint 밖의 API가 필요한 경우
- source type, quantity unit authority, public error, nutrition state, mutation action이 부족한 경우
- ingredient row에서 mutation 전 approved conversion/piece unit 전체를 반드시 확정 표시해야 하는 제품 요구가 다시 생기는 경우
- deleted column 기존 entry의 official PATCH/DELETE 밖 새 mutation action이 필요한 경우
- batch missing/unrecoverable에서 #11에 없는 새 weight action이 필요한 경우
- server projection 없이 client total/weekly analysis를 만들 필요가 생긴 경우
- public API와 merged #9 TypeScript projection이 충돌하는 경우

Contract Evolution은 사용자 승인 → 공식 5종 문서/CURRENT_SOURCE_OF_TRUTH 갱신 → workpack/acceptance relock 뒤에만 구현한다.

## 14. Current critic HOLD repair and pending authority handoff

- prior canonical prerequisite인 fresh re-review task `019ffb81-4bad-7353-b92b-add4924a4a40`의 `APPROVE 0/0/0`와 reviewed design head/tree `910d14e99e71c9a05aa623cbf0a9c3b6f1f9456b` / `a578bf1d8da21a3bce230051399c6be1fd9da78c`는 역사 provenance로 보존한다.
- latest reviewer-owned `ui/designs/critiques/MEAL_LOG-critique.md`는 fresh critic task `019ffbb4-28ab-7410-b1c1-369c7848342e`가 target head/tree `69965f5292792d8b4b4555a518d3bbb4c4860971` / `3f7fd32e88c238ccebba6fc537f242e102055c09`를 검토해 낸 `HOLD 0/1/0`, finding `P1-ML-05` artifact다. critique commit/tree는 `497faaab314e3c864eaf4f6b0d0f3179c16e58c0` / `89869c8b5caa924e2523cb843e04c9476f1bedf3`이며 이 repair author는 critique를 수정하지 않는다.
- 이번 successor는 deleted-column edit를 current #9 full PATCH에 맞춰 explicit active target + server snapshot replacement로 보수한다. push된 exact repair head/tree를 **다른 fresh critic task**가 전체 설계와 prior four finding regression까지 다시 읽고 reviewer-owned critique를 갱신하기 전에는 current-head design prerequisite를 complete/approved로 표시하지 않는다. 현재 author는 verdict를 선점하지 않는다.
- Stage 4 구현 뒤에는 fresh 390px/320px/desktop screenshot/Figma evidence와 이를 인용하는 별도 `ui/designs/authority/MEAL_LOG-authority.md`가 필요하다.
- Design Status는 계속 `temporary`다. latest HOLD repair 또는 prior approval provenance를 Stage 4 runtime evidence, Stage 5/final authority, Stage 6, Ready, merge, production 또는 activation 승인으로 투영하지 않는다.
