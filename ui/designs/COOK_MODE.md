# COOK_MODE — whole-board + cooked batch completion

> 기준: 요구사항 `v1.7.29`, 화면정의서 `v1.5.33`, 유저 flow `v1.3.31`, DB `v1.3.31`, API `v1.2.35`
> 대상: `cooked-batch-weight-ledger` #8 fresh Stage 1 design source
> 분류: `prototype-derived design`, high-risk UI change, authority required
> 상태: `temporary` — fresh independent critic/authority/internal1.5 pending

## 목적과 계약 경계

사용자는 요리 중 전체 재료와 전체 조리순서를 한 화면의 whole-board로 읽고, 완료할 때 실제 사용한 pantry row와 음식만의 완성 중량을 명시적으로 결정한다.

- 기존 whole-board interaction model을 유지한다. 재료/과정을 좌우 swipe나 단계 이동 화면으로 되돌리지 않는다.
- COOK_MODE 안에 인분 stepper나 인분 변경 action을 두지 않는다.
- snapshot-v2 완료 body는 기존 `consumed_pantry_item_ids`, `weight_action`, `finished_weight_g`만 사용한다.
- 새 endpoint, field, status, public error, action, screen을 만들지 않는다.
- #7의 recipe/Meal `revision`, owner-only `edit_context`, server-only joint capability projection은 entrypoint 경계다. #8 completion body를 확장하지 않는다.
- creation-off에서는 새 personal edit와 새 snapshot-v2 start를 막되 seeded/existing v2 read/cancel/complete drain은 유지한다.

## 화면 구조

```text
┌────────────────────────────────────┐
│ 김치찌개                    4인분   │  읽기 전용
│ 오늘 저녁 · 요리 중                │
├────────────────────────────────────┤
│ 재료                               │
│ 돼지고기 300g · 김치 400g · …      │
│                                    │
│ 조리순서                           │  whole-board 내부 세로 스크롤
│ 1  볶기  돼지고기와 김치를 볶아요  │
│ 2  끓이기  물을 넣고 끓여요        │
│ 3  마무리  간을 맞춰요              │
├────────────────────────────────────┤
│ [취소]                 [요리 완료] │  safe-area 고정, 44px+
└────────────────────────────────────┘
```

- 일반 AppBar와 하단 탭은 숨긴다.
- 제목, 읽기 전용 인분, 전체 재료, 전체 조리순서를 한 scroll context에서 보여준다.
- 하단 action bar만 고정하며 본문 마지막을 가리지 않는다.
- 긴 레시피는 whole-board 내부만 세로 스크롤한다. page-level horizontal scroll은 금지한다.
- 실제 wake lock이 활성화된 경우에만 `화면 안 꺼짐` 상태를 표시한다.

## 요리 완료 sheet

초기값은 pantry row 선택 0개, weight action 미선택이다. 어느 항목도 자동 선택하지 않는다.

```text
┌────────────────────────────────────┐
│ 요리 완료                          │
│ 실제 사용한 팬트리 항목과          │
│ 완성된 음식 전체 무게를 확인해요   │
├────────────────────────────────────┤
│ 사용한 팬트리 항목                 │
│                                    │
│ 닭가슴살                           │  pinned ingredient group
│ ☐ 닭가슴살 오리지널                │  제품명
│   하림 · 냉장고                     │  브랜드 · row context
│   pantry_item_id: row-a             │  구현 식별자, 사용자에게 raw UUID 비노출
│ ☐ 담백 닭가슴살                    │  equivalent row
│   무브랜드 · 냉동실                 │
│   pantry_item_id: row-b             │
│                                    │
│ 양파                               │
│ ☐ 양파                             │  generic row
│   일반 재료 · 팬트리                │
│   pantry_item_id: row-c             │
├────────────────────────────────────┤
│ 완성 직후 음식 전체 중량           │
│ ○ 음식만 무게(g)   [            ]  │
│ ○ 나중에 입력                      │
│ 용기·그릇 무게는 제외해 주세요     │
├────────────────────────────────────┤
│ [돌아가기]          [완료 저장]     │
└────────────────────────────────────┘
```

### Exact pantry row 규칙

- 각 선택 항목의 authority는 `pantry_item_id`다. client가 ingredient 이름이나 브랜드로 row를 다시 찾지 않는다.
- product row는 실제 제품명과 브랜드를 주 정보로, generic row는 표준 재료명을 주 정보로 보여준다.
- 같은 effective ingredient에 여러 row가 있어도 모두 별도 선택 항목이다.
- 초기 선택은 항상 0개이며 동등 row, 첫 row, 최근 row를 자동 선택하지 않는다.
- 선택하지 않은 row는 삭제하지 않는다.
- eligible row가 없으면 `사용할 팬트리 항목이 없어요` Empty를 보여주고 `consumed_pantry_item_ids=[]`로 둔다. 사용자는 weight action을 명시적으로 고른 뒤 완료할 수 있다.

### Weight 규칙

- `음식만 무게(g)`와 `나중에 입력`은 exact-one radio다. 초기에는 둘 다 미선택이다.
- `음식만 무게(g)`를 고르면 positive `finished_weight_g`가 필요하다.
- 입력값은 완성 직후 음식 전체 중량이며 현재 남은 양이나 용기 포함 중량이 아니다.
- `나중에 입력`은 `weight_action=weigh_later`, `finished_weight_g=null`이다.
- servings→grams 추정, 이전 값 추측, 선택 자동 전환을 하지 않는다.
- pantry 선택 0개는 허용하지만 weight action 미선택/invalid g에서는 완료 CTA를 disabled로 둔다.

## 상태 설계

### Loading

- session/pinned content/pantry candidates 중 하나라도 unresolved면 whole-board 또는 sheet skeleton을 표시한다.
- sheet Loading에서는 checkbox와 완료 CTA를 disabled로 두고 row나 weight action을 추측하지 않는다.
- 재시도 중 기존 사용자의 명시 선택이 있다면 유지하되 server 응답으로 사라진 row는 선택에서 제거하고 Error로 알린다.

### Empty

- pantry candidate `[]`는 오류가 아니다.
- `사용할 팬트리 항목이 없어요. 음식 무게만 선택해 완료할 수 있어요.`를 표시한다.
- `consumed_pantry_item_ids=[]`를 유지하고 weight action이 valid하면 완료를 허용한다.
- session/content가 없거나 접근 불가한 경우는 Empty로 숨기지 않고 기존 404/unauthorized 경계를 사용한다.

### Error

- whole-board read 실패: `요리 정보를 불러오지 못했어요` + `[다시 시도]` + `[이전 화면]`.
- complete의 기존 409/422: sheet를 닫지 않고 선택한 exact row IDs와 weight action/input을 보존한다.
- 오류 요약에 focus를 옮기고 fields가 가리키는 control과 연결한다.
- other-owner/private resource는 상세를 노출하지 않고 기존 404 non-disclosure를 유지한다.
- 새 public error copy/code를 발명하지 않으며 server wrapper의 기존 code/message/fields를 소비한다.

### Pending / duplicate submit

- 첫 submit 직후 모든 sheet action을 잠그고 단일 progress label을 보여준다.
- 추가 tap, Enter, touch submit을 차단한다.
- 네트워크 재시도는 같은 UUID Idempotency-Key와 같은 canonical payload를 사용한다.

### stored replay

- same key+same payload는 server의 최초 stored replay result를 그대로 소비한다.
- sheet는 한 번만 닫고 pantry/batch/cook count/XP 성공 animation이나 toast를 반복하지 않는다.
- same key+different payload는 기존 409를 표시하고 아무 effect도 완료로 투영하지 않는다.

### Read-only / terminal

- completed/cancelled v2 session을 재열면 pinned content를 read-only로 보여주고 새 completion control을 만들지 않는다.
- creation-off에서도 existing in-progress v2 session의 read/cancel/complete control은 유지한다.
- v1 session은 기존 `legacy_v1` parser/body/UI를 사용하며 v2 sheet를 섞지 않는다.

### Unauthorized

- owner session completion은 로그인/owner authority가 필요하다.
- auth가 없으면 기존 로그인 안내와 return-to-action으로 동일 session COOK_MODE에 복귀한다.
- return 뒤 최신 session/pantry state를 다시 읽으며 과거 client selection을 authority로 강제하지 않는다.

## 390px evidence frame 계획

```text
width 390
┌──────────────────────────────────┐
│ title · servings                 │
│ ingredients summary             │
│ steps list                       │
│                                  │
├──────────────────────────────────┤
│ cancel             complete      │
└──────────────────────────────────┘

completion sheet cases in one evidence set:
default no-selection / multiple product rows / Empty [] /
known g / weigh-later / Loading / 409·422 / Pending / stored replay /
creation-off existing-v2 drain
```

- planned artifact: `ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-design-mobile-default-390.png`
- verify whole-board hierarchy, sheet max height/internal scroll, visible primary CTA and product/brand hierarchy.

## 320px evidence frame 계획

```text
width 320
┌────────────────────────────┐
│ title wraps at most 2 lines│
│ ingredient / steps board   │
├────────────────────────────┤
│ cancel        complete     │
└────────────────────────────┘

sheet row:
☐ product name
  brand · storage context
weight radio + input stay readable without horizontal overflow
```

- planned artifact: `ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-design-mobile-narrow-320.png`
- no page-level overflow, CTA clipping, fixed-bar overlap or touch target below 44px.
- product name may wrap; brand/context remains subordinate and must not collapse into raw identifiers.

## Interaction and accessibility

| Action | Result |
| --- | --- |
| `[요리 완료]` | owner v2 session이면 completion sheet open; legacy v1이면 기존 UI |
| pantry checkbox | exact `pantry_item_id` membership toggle only |
| weight radio | exact-one action selection; known 선택 시 g input enabled |
| `[완료 저장]` | valid weight action일 때 existing complete request submit |
| 409/422 retry | selections/input/focus context retained |
| `[취소]` | existing cancel contract; return context preserved |

- sheet open 시 title로 focus, focus trap, background inert, Escape/돌아가기 시 opener focus restore.
- checkbox, radio, input, CTA는 label/programmatic name을 갖고 최소 44×44px target을 유지한다.
- color alone으로 선택/error/pending을 표현하지 않는다.
- screen reader는 제품명 → 브랜드/context → 선택 상태 순서로 읽는다. raw UUID는 읽지 않는다.
- bottom safe-area를 포함하고 virtual keyboard가 g input/error/CTA를 가리지 않게 한다.

## Design token boundary

- app surface는 current app token layer의 `--brand-primary`, `--surface`, `--surface-fill`, `--text-2/3`, `--border`, `--radius-card`, `--radius-sheet`, `--control-height-md/lg`를 사용한다.
- whole-board의 기존 dark treatment와 cooking method accent는 현재 구현/공식 whole-board 계약을 유지한다.
- 직접 hex 추가나 legacy coral `--brand` 복귀로 #11의 final polish를 선점하지 않는다.
- `COOK_MODE`는 h8 matrix상 `prototype-derived design`이며 parity로 자동 승격하지 않는다.

## Fresh independent review gates

- critic path: `ui/designs/critiques/COOK_MODE-cooked-batch-weight-ledger-critique.md`
- authority path: `ui/designs/authority/COOK_MODE-cooked-batch-weight-ledger-authority.md`
- 기존 `ui/designs/critiques/COOK_MODE-critique.md`, `ui/designs/authority/COOK_MODE-authority.md`, 15a v1.5.1 screenshots은 역사 artifact이며 #8 evidence로 재사용하지 않는다.
- Stage 2 진입 전 fresh independent critic과 390/320 screenshot/Figma product-design-authority가 이 exact design head를 검토해 blocker/major 0을 남겨야 한다.
- 이 Stage 1 author는 critic/authority/internal1.5를 작성하거나 승인하지 않는다.
- Stage 4 implementation은 별도 390/320 evidence와 Stage 5/final authority를 다시 거친다.

## Successor boundary

- #8: exact pantry completion, finished-weight/weigh-later functional UI, batch/ledger/XP, R/R+1 gate.
- #9: meal-log linked consumed event/pointer and arbitrary-order entry reversal.
- #11: LEFTOVERS 및 COOK_MODE final visual polish, delayed-weight/unrecoverable/discard/adjust presentation, container helper와 full accessibility completion.
- R+2 production capability activation: Manual Only; #8 R/R+1 evidence와 service-owner 공동 승인 전 금지.
