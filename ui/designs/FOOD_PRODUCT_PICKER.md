# FOOD_PRODUCT_PICKER — 공동 완제품 검색·수량 선택

> 기준: 화면정의서 v1.5.27 §8-a / 요구사항기준선 v1.7.21 / 유저flow맵 v1.3.24 §③-e / API v1.2.26 §5-5, §5-9~5-10
>
> current workpack: `community-prepared-food-catalog`
>
> 생성일: 2026-07-18
>
> 상태: Stage 1 design-generator artifact. 독립 design-critic과 구현 후 authority 승인이 필요하며, 작성자는 자기 설계를 승인하지 않는다.

## 역사적 기준과 이번 확장

- 선행 `prepared-food-planner-entry`는 화면정의서 v1.5.26의 `공공 데이터 / 내가 등록 / private manual` 계약으로 구현됐고, `ui/designs/authority/PLANNER_WEEK-prepared-food-planner-entry-authority.md`에서 Stage 5·final authority·Stage 6을 통과했다.
- 그 선행 evidence와 판정은 삭제하거나 소급 변경하지 않는다. 이번 문서는 기존 검색→선택→수량→추가 modal/sheet mental model 위에 v1.5.27 공동 catalog 계약만 덧붙인다.
- 선행 evidence의 public/private label은 역사적 당시 계약이다. 새 `공공 영양DB / 사용자 등록 / 비공개 보관`, source filter, 신고, owner action, moderation, 100g/100mL 화면은 새 screenshot과 독립 authority 판정이 있어야 승인된다.

## Design Intent

- 사용자는 `MENU_ADD` 맥락을 잃지 않고 승인 공공 제품, 다른 사용자가 공유한 제품, 본인 공유 제품, 본인 legacy private 제품을 한 picker에서 찾는다.
- source와 소유권을 과장하지 않는다. `공공 영양DB`, `사용자 등록`, `비공개 보관` 세 badge와 실제 가능한 action만 보여준다.
- `nutrition.basis`가 g/mL이거나 같은 row의 approved direct `basis_relations[]`가 g/mL를 증명하는 제품만 `100g`/`100mL` 비교값을 먼저 보여준다. 관계 없는 legacy `serving/package` 제품은 원 basis만 표시해 추정값을 만들지 않는다. g/mL planner 수량은 기본 `100`, step `1g/1mL`로 직접 조절한다.
- hidden/deleted 제품은 새 검색·새 planner 추가에서 제외하지만, 이미 만든 planner entry와 pin된 이름·영양 version은 지우거나 current product로 바꾸지 않는다.
- 완제품을 Recipe Meal처럼 보이게 하거나 Meal status, 장보기, 요리, 남은요리, XP action을 만들지 않는다.

## Authority Classification

- UI risk: `high-risk-ui-change`
- anchor extension: `PLANNER_WEEK -> MEAL_SCREEN -> MENU_ADD -> FOOD_PRODUCT_PICKER`
- 이유: PLANNER_WEEK anchor 흐름에 source filter, 공동 catalog 소유권 action, 신고, 100g/100mL 수량 표준을 추가한다.
- mobile evidence: `390×844`
- narrow sentinel: `320×568`
- desktop evidence: `1280×900`
- familiar pattern: 기존 modal/sheet 안에서 검색→선택→수량→추가 순서를 유지한다. 별도 full-page catalog로 바꾸지 않는다.
- scroll containment: sticky header/search/filter와 sticky CTA 사이의 결과/선택 body만 세로 스크롤한다. page-level horizontal scroll은 금지한다.

## 레이아웃 와이어프레임 — 390px

```text
┌──────────────────────────────────────┐
│ ←  완제품 추가                  닫기  │  sticky header / 44px target
├──────────────────────────────────────┤
│ [ 완제품 이름·업체 검색         🔍 ]  │  --surface-fill / --radius-control
│ [전체] [공공 영양DB] [사용자 등록]   │  source filter, localized wrap
├──────────────────────────────────────┤
│ 결과 body                              │  이 영역만 vertical scroll
│ ┌──────────────────────────────────┐ │
│ │ 플레인 요거트     [공공 영양DB]  │ │  --surface / --radius-card
│ │ 무먹유업                          │ │
│ │ 100g 기준 · 70 kcal              │ │  기본 비교 기준
│ │ 라벨 1회(150g) · 영양 5/5        │ │  원 라벨 text가 있을 때만
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ 단백 두유          [사용자 등록] │ │
│ │ 식품회사                          │ │
│ │ 100mL 기준 · 52 kcal             │ │
│ │ 라벨 1팩(190mL)        [신고]    │ │  다른 사용자/익명화 visible manual
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ 나의 그래놀라      [사용자 등록] │ │
│ │ 100g 기준 · 410 kcal             │ │
│ │                         [수정][삭제]│ │  editable=true인 본인 visible manual
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ 예전 간식          [비공개 보관] │ │
│ │ 1회 기준 · 180 kcal              │ │  relation 없는 legacy 원 basis
│ │ 100g 비교 불가         [수정][삭제]│ │  추정 환산 금지
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘

제품 선택 후
┌──────────────────────────────────────┐
│ 단백 두유 · 식품회사 [사용자 등록]   │
│ 100mL 기준 52 kcal · 라벨 1팩(190mL) │
│                                      │
│ 식단에 추가할 양                     │
│ [ − ] [ 100 ] [ mL ] [ + ]          │  amount step=1, 44px controls
│ 100mL · 열량 52 kcal · 탄/단/지/나   │  pinned version preview
├──────────────────────────────────────┤
│ [완제품 추가]                        │  --brand-primary, sticky footer
└──────────────────────────────────────┘
```

## 좁은 모바일 와이어프레임 — 320px

```text
┌──────────────────────────────┐
│ ← 완제품 추가           닫기 │
├──────────────────────────────┤
│ [제품 이름·업체 검색   🔍 ]  │
│ [전체] [공공 영양DB]         │  chip은 내부 wrap
│ [사용자 등록]                │
├──────────────────────────────┤
│ 단백 두유                    │
│ [사용자 등록]                │  badge를 metadata 행으로 내림
│ 식품회사                     │
│ 100mL 기준 · 52 kcal         │
│ 라벨 1팩(190mL)       [신고] │
├──────────────────────────────┤
│ 식단에 추가할 양             │
│ [ − ] [ 100 mL ] [ + ]      │  각 target 44×44 이상
├──────────────────────────────┤
│ [완제품 추가]                │  keyboard/safe-area 위 sticky
└──────────────────────────────┘
```

- 제품명은 최대 2행, 브랜드·basis·영양 상태는 짧은 metadata 행으로 배치한다.
- source badge와 action이 제목과 한 줄을 억지로 나누지 않는다. action이 겹치면 별도 마지막 행으로 내린다.
- quantity와 validation copy는 두 행으로 바꿀 수 있지만 CTA, 단위, 오류 문구를 자르지 않는다.
- filter chip은 전체 페이지가 아니라 filter 내부에서 줄바꿈한다. 가로 swipe-only 필터로 만들지 않는다.
- header/search/filter/result body/sticky footer의 모바일 좌우 gutter는 모두 `--space-4`(16px)다. 320px에서도 gutter나 44px target을 줄이지 않는다.

## 데스크톱 와이어프레임 — 1280px

```text
┌──────────────────────── MEAL_SCREEN context ────────────────────────┐
│                  ┌──── 완제품 추가 modal 640px ────┐               │
│                  │ ← 완제품 추가               닫기 │ sticky header │
│                  │ [검색] [전체][공공][사용자]     │               │
│                  ├────────────────┬────────────────┤               │
│                  │ 결과 list      │ 선택 상세      │ modal body     │
│                  │ 공공 영양DB    │ 100g 비교      │ only scroll    │
│                  │ 사용자 등록    │ 수량 100g      │               │
│                  │ 비공개 보관    │ 영양 preview   │               │
│                  ├────────────────┴────────────────┤               │
│                  │              [완제품 추가]      │ sticky footer │
│                  └─────────────────────────────────┘               │
└────────────────────────────────────────────────────────────────────┘
```

- background scroll lock과 modal focus trap을 적용한다.
- 2-pane은 desktop에서만 허용하며 DOM/focus 순서는 mobile의 검색→결과→선택→수량→CTA와 같다.
- action을 hover에만 숨기지 않는다. keyboard focus와 touch 환경에서도 같은 기능을 찾을 수 있어야 한다.

## Source Filter와 Badge 계약

| UI | API `source` | 결과 | badge |
| --- | --- | --- | --- |
| 전체 | `all` | visible public dataset + visible shared manual + 본인 active legacy private | row별 세 badge 중 하나 |
| 공공 영양DB | `public_dataset` | visible public dataset | `공공 영양DB` |
| 사용자 등록 | `manual` | visible shared manual + 본인 active legacy private | public은 `사용자 등록`, private은 `비공개 보관` |

- `공공 데이터`, `내가 등록` copy는 새 화면에 사용하지 않는다.
- source filter는 URL/API enum을 그대로 노출하지 않고 위 한국어 label로 표시한다.
- 검색 card와 action은 API v1.2.26 §5-5의 아래 response projection만 exact path로 소비한다.
  - 식별/action: `id`, `name`, nullable `brand`, `visibility`, `source_type`, `editable`
  - pin/basis: `nutrition_version_id`, nullable `label_basis_text`, top-level `basis_relations[]`, `nutrition.basis.amount`, `nutrition.basis.unit`
  - 영양 표시: `nutrition.values.<nutrient>.amount`, `.known_amount`, `.status`, `.display_mode`, `nutrition.calculation_status`, `nutrition.calculation_quality`
- `nutrition.status`라는 top-level field는 공식 응답에 없으므로 소비하거나 새로 만들지 않는다. 전체 상태는 `nutrition.calculation_status`, 각 영양소 상태는 `nutrition.values.<nutrient>.status`로만 구분한다.
- report/edit/delete/add target에는 같은 row의 `id`를 사용한다. 수량 단위 option과 호환 계산에는 그 row의 `nutrition_version_id`와 top-level `basis_relations[]`만 함께 사용하며 다른 row/current version의 relation으로 대체하지 않는다.
- client는 owner ID, `moderation_status`, `external_product_key`, public stable key, `basis_relations`를 생성·변조하지 않는다. relation은 응답의 pin된 version 값을 읽을 뿐이다.

### Filter / Source Badge 토큰

| 요소·상태 | 배경 | 텍스트/테두리 | 규칙 |
| --- | --- | --- | --- |
| filter normal | `--surface-fill` | `--text-3` / `--line` | 44px target, `--radius-chip` |
| filter selected | `--brand-primary-soft` | `--brand-primary` / `--brand-primary-border` | 선택은 색 외에도 상태 속성으로 전달 |
| `공공 영양DB` read-only badge | `--surface-fill` | `--text-3` / `--line` | source label이며 action처럼 보이지 않음 |
| `사용자 등록` read-only badge | `--brand-primary-soft` | `--brand-primary` / `--brand-primary-border` | public/manual source label |
| `비공개 보관` read-only badge | `--surface-fill` | `--text-3` / `--line` | legacy private source label |

- filter와 badge에 임의 hex를 추가하지 않는다. badge는 read-only label이므로 hover/pressed affordance를 주지 않고, filter의 selected/normal과 시각·접근성 상태를 분리한다.

## 소유권·Read-only·Action 계약

| 결과 종류 | 수정/삭제 | 신고 | 플래너 추가 |
| --- | --- | --- | --- |
| `public_dataset/public` | 없음(read-only) | 없음 | 가능 |
| 본인 visible `manual/public`, `editable=true` | 표시 | 없음 | 가능 |
| 다른 사용자 visible `manual/public`, `editable=false` | 없음(read-only) | 표시 | 가능 |
| owner 익명화 visible `manual/public`, `editable=false` | 없음(read-only) | 표시 | 가능 |
| 본인 active legacy `manual/private` | 표시 | 없음 | 가능 |
| 다른 사용자 private | 존재 자체 비노출 | 없음 | 불가 |
| hidden/deleted | 새 검색 결과 비노출 | 없음 | 새 추가 불가 |

- 신고 action은 visible shared manual 중 본인 소유가 아닌 read-only card에만 둔다. 자기 제품, public dataset, legacy private, hidden/deleted에는 노출하지 않는다.
- 신고 sheet는 API v1.2.26의 `reason_code`와 `detail_text`만 보낸다. `reason_code`는 아래 6개 중 하나를 반드시 선택하고, `detail_text`는 선택값이다.

| `reason_code` | 사용자 label |
| --- | --- |
| `spam` | 스팸·광고예요 |
| `incorrect_nutrition` | 영양 정보가 달라요 |
| `duplicate` | 중복 제품이에요 |
| `rights` | 권리 침해가 있어요 |
| `unsafe` | 안전 문제가 있어요 |
| `other` | 기타 |

- 위 label은 정확히 해당 code 하나로만 전송한다. 새 enum을 만들지 않으며, 공식 계약에 없는 blocking maxlength로 `detail_text` 제출을 막지 않는다.
- 신고 성공 후 card는 그대로 두고 `신고했어요` feedback을 준다. 일반 사용자가 moderation 상태를 바꾸는 control은 없다.
- 같은 사용자의 재신고 `409 PRODUCT_ALREADY_REPORTED`는 `이미 신고한 제품이에요` inline feedback으로 표시하고 중복 report를 만들지 않는다.
- stale/non-eligible 대상의 `409 PRODUCT_REPORT_NOT_ALLOWED` 또는 자기 제품 `403 FORBIDDEN`은 신고 sheet를 닫지 않은 채 이유와 재시도 불가를 알리고, client가 상태를 추정해 action을 다른 제품으로 옮기지 않는다.

## 100g/100mL 비교와 수량 계약

- `nutrition.basis.unit='g'`이면 같은 단위 비례로 `100g`, `nutrition.basis.unit='ml'`이면 `100mL` 비교값을 계산한다. 원 라벨 기준은 `label_basis_text`가 있을 때 보조 행으로 보존한다.
- legacy `nutrition.basis.unit='serving' | 'package'`는 같은 row의 top-level `basis_relations[]`에 g 또는 ml를 직접 연결하는 approved immutable relation이 있을 때만 그 관계의 정·역방향 산술로 `100g` 또는 `100mL` 비교값을 만든다.
- 위 direct relation이 없으면 `nutrition.basis.amount/unit`의 원 basis와 해당 basis 영양만 표시하고 `100g/100mL 비교 불가`를 보조 상태로 표시한다. 비교 열량·영양 숫자는 비워 두며, `label_basis_text`, 이름, 브랜드, 제품 종류로 g/mL를 추정하지 않는다.
- g/mL 제품 선택 시 planner 수량 기본값은 `100`, 증감 step과 직접 입력 단위는 `1g/1mL`다. 양수만 허용한다.
- relation 없는 legacy serving/package 제품의 초기 수량·단위는 응답의 원 `nutrition.basis.amount/unit`이며, 같은 단위 배수만 제공한다. g/mL option이나 기본값 100을 임의로 추가하지 않는다.
- 같은 `g` 또는 같은 `ml` 차원의 배수 계산은 허용한다. `100g → 101g`, `100mL → 99mL`처럼 1단위로 조절한다.
- `serving/package/g/ml` 사이의 교차 단위는 선택된 `nutrition_version_id`에 귀속된 approved direct `basis_relations[]`가 정확히 연결할 때만 option으로 보여준다.
- relation chaining, 다른 version relation, 이름·브랜드·밀도 기반 추정, 임의 `g↔mL`는 금지한다.
- `422 NUTRITION_BASIS_MISMATCH`는 `이 기준으로는 수량을 바꿀 수 없어요`를 invalid control에 연결하고 제품·날짜·끼니·검색어를 보존한다.
- partial 값은 가능한 값만 최소 의미로 표시하고 unavailable/null은 `영양 정보 준비 중`으로 표시한다. 결측을 `0 kcal`로 채우지 않는다.

## Cursor와 검색 Race 계약

- 기존 `GET /food-products?q&source&cursor&limit`만 사용한다. 첫 요청, 검색어 변경, source filter 변경에는 cursor를 보내지 않는다.
- query/filter 변경 즉시 items, `next_cursor`, `has_next`를 reset한다.
- 응답의 opaque `next_cursor`를 파싱하지 않고 그대로 다음 요청에 전달한다. server order로 append하고 stable product ID 중복은 뒤의 row만 버린다.
- `has_next=false` 또는 `next_cursor=null`이면 observer/더 불러오기를 종료한다.
- request generation 또는 `AbortController`로 오래된 query/filter/page 응답이 최신 결과·선택·오류를 덮지 못하게 한다.
- pagination loading은 기존 결과를 유지하고 끝에만 표시한다. initial loading과 pagination loading을 구분한다.

## Required States

### Loading

- initial: search/filter는 유지하고 card skeleton 3행을 표시한다.
- pagination: 기존 결과 하단에만 spinner를 둔다.
- report/add mutation: 해당 action과 CTA만 pending 처리해 중복 submit을 막는다.

### Empty

- `찾는 완제품이 없어요` + `[직접 등록]`.
- 검색어 없음, 특정 source filter 결과 0, 검색어 결과 0을 같은 장애 copy로 가장하지 않는다.

### Error

- 검색 실패: list 영역 inline `[다시 시도]`; 검색어와 filter 유지.
- 수량/추가 실패: selected detail의 invalid control 또는 CTA 위 inline feedback; 날짜·끼니 유지.
- 신고 network/5xx/공통 오류: sheet를 열어 둔 채 선택한 `reason_code`와 optional `detail_text` draft를 보존한다. submit 자리의 inline `신고를 보내지 못했어요` + `[다시 시도]`가 동일 report 요청을 다시 보내며 pending 중 중복 submit은 막는다.
- 신고 성공, `PRODUCT_ALREADY_REPORTED`, `PRODUCT_REPORT_NOT_ALLOWED`, `FORBIDDEN`은 generic retryable 오류와 분리한다. 성공만 완료 feedback으로 닫을 수 있고, duplicate/not-allowed/forbidden에는 무의미한 자동 재시도를 제공하지 않는다.
- `409 NUTRITION_VERSION_CONFLICT`: `제품 영양 정보가 바뀌었어요. 다시 확인해 주세요.` + 명시적 refresh. 조용한 재시도나 다른 current version 대체 금지.

### Read-only

- public dataset, 다른 사용자 shared manual, owner 익명화 shared manual은 수정/삭제 affordance가 없다.
- read-only는 선택 불가가 아니다. visible public 제품의 planner 추가는 가능하다.

### Unauthorized

- login gate 뒤 검색어, source filter, plan date, column, selected product, quantity/unit을 return-to-action으로 복원한다.
- 복원 시 제품이 hidden/deleted/private 권한 상실이면 selection만 안전하게 해제하고 검색·날짜·끼니는 유지한다.

### Hidden / Deleted / Pinned History

- hidden/deleted는 새 검색 결과와 새 add 대상에서 제외한다.
- stale selection add의 `409 PRODUCT_HIDDEN` 또는 `409 PRODUCT_DELETED`는 selection을 해제하고 사유를 알린다.
- 이미 존재하는 planner entry는 pin된 제품명·영양 version을 계속 표시한다. picker에서 과거 entry를 지우거나 current catalog row로 repin하지 않는다.

### Report Duplicate / Moderation Race

- `PRODUCT_ALREADY_REPORTED`: 동일 신고를 추가하지 않고 완료형 안내.
- `PRODUCT_REPORT_NOT_ALLOWED`: card가 stale이면 최신 검색을 명시적으로 갱신하고 action을 제거한다.
- hidden 상태를 client가 응답에 덧붙이거나 일반 사용자용 moderation control을 만들지 않는다.

## Interaction과 접근성

- modal open focus → search input, filter 변경 → 결과 heading, card 선택 → quantity input, validation → invalid control, 성공 → `MEAL_SCREEN`의 새 product entry로 이동한다.
- 수정/삭제 후 돌아오면 원래 query/filter/scroll 위치를 복원하되 삭제 성공 제품은 결과에서 제거한다.
- report/edit/delete는 card 선택과 분리된 각각 최소 44×44px 독립 target이다. `제품명 신고`, `제품명 수정`, `제품명 삭제`처럼 서로 다른 접근성 이름을 제공하고 pointer/keyboard event propagation을 막아 card 선택이 함께 실행되지 않게 한다.
- delete는 독립 target 활성화 뒤 제품명을 포함한 확인 dialog를 열며, 확인 전에는 card/result를 제거하지 않는다. dialog 닫기 후 focus는 해당 삭제 target으로 돌아간다.
- result list는 선택 상태, search result count 변화, pagination append를 screen reader가 과도하게 반복 낭독하지 않도록 live region을 제한한다.
- ESC/back은 이전 `MENU_ADD`로 focus를 반환한다. report/edit/delete dialog가 열려 있으면 먼저 가장 안쪽 overlay만 닫는다.
- sticky footer는 virtual keyboard와 safe-area 위에 있고 body 마지막 row를 가리지 않는다. 모든 control은 최소 44×44px다.

## 화면 정의서 매핑

| 정의서 항목 | 구현 설계 | 비고 |
| --- | --- | --- |
| source filter | ✅ | `all/public_dataset/manual` ↔ 한국어 3종 |
| source badge | ✅ | `공공 영양DB/사용자 등록/비공개 보관` exact copy |
| owner/read-only action | ✅ | `editable`, source, visibility만 소비 |
| other-user shared manual report | ✅ | 자기/public/private/hidden/deleted 제외 |
| 100g/100mL + 1g/1mL | ✅ | g/mL 또는 direct relation만; legacy relation 부재는 원 basis로 fail-closed |
| hidden/deleted 신규 제외 + pin 보존 | ✅ | 새 picker와 과거 entry 경계 분리 |
| loading/empty/error/read-only/unauthorized | ✅ | conflict/report duplicate 포함 |
| client authority 금지 | ✅ | owner/source/moderation/key/relation 입력 없음 |

## 새 Community Extension Authority Evidence 계획

- 새 evidence root는 `community-prepared-food-catalog` workpack이 확정한 경로를 사용하며 선행 `prepared-food-planner-entry` PNG를 덮어쓰지 않는다.
- 390/320/1280: 전체 filter, public dataset, other-user shared manual, owner shared manual, legacy private가 함께 있는 default 결과.
- 390/320/1280: selected `100g`와 `100mL`, amount `100→101→1`, sticky CTA, keyboard/focus/scroll containment.
- state evidence: loading, empty, search error, read-only, unauthorized return, partial, unavailable, direct relation 없는 legacy serving/package의 원 basis·비교 불가, basis mismatch, nutrition conflict.
- ownership/moderation evidence: owner 수정/삭제 독립 target, other-user/익명화 신고, 자기/public/private report 미노출, report success/duplicate/not-allowed, network/5xx draft 보존·inline retry, hidden/deleted stale selection.
- anchor evidence: PLANNER_WEEK/MEAL_SCREEN/MENU_ADD before+after와 기존 planner day-card/vertical scroll 구조가 유지되는지 비교한다.
- authority blocker: page-level horizontal overflow, 320px CTA/validation 가림, source/owner 오표시, hidden 신규 추가, pinned history 훼손, 신고 action 오노출, Recipe Meal action 혼입 중 하나라도 있으면 `confirmed` 금지다.

## design-critic 검토 필요 항목

- [ ] `manual` filter 안에서 `사용자 등록` public과 `비공개 보관` legacy private가 badge로 명확히 구분되는가
- [ ] API §5-5의 `id`, `nutrition_version_id`, top-level `basis_relations[]`, `nutrition.calculation_status`, nutrient별 `status`를 exact path로 소비하고 `nutrition.status`를 만들지 않는가
- [ ] 응답에 owner/moderation field를 새로 요구하지 않고 `editable/source_type/visibility`로 action을 안전하게 결정하는가
- [ ] direct relation 없는 legacy serving/package가 원 basis만 표시하고 100g/100mL 숫자를 추정하지 않는가
- [ ] 320px에서 filter wrap, card action, 수량 stepper, sticky CTA가 겹치지 않는가
- [ ] 신고 6종 mapping, 필수 reason, optional detail, generic retry가 새 enum/status/maxlength 없이 동작하는가
- [ ] 선행 confirmed evidence와 새 community extension의 pending authority가 명확히 분리되는가
