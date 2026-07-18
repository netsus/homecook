# FOOD_PRODUCT_CREATE — 사용자 등록 완제품 만들기·수정

> 기준: 화면정의서 v1.5.27 §8-b / 요구사항기준선 v1.7.21 / 유저flow맵 v1.3.24 §③-e / API v1.2.26 §5-6~5-8
>
> current workpack: `community-prepared-food-catalog`
>
> 생성일: 2026-07-18
>
> 상태: Stage 1 design-generator artifact. 독립 design-critic과 구현 후 authority 승인이 필요하며, 작성자는 자기 설계를 승인하지 않는다.

## 역사적 기준과 이번 확장

- 선행 `prepared-food-planner-entry`의 private manual 등록 화면과 390/320/1280 evidence는 `ui/designs/authority/PLANNER_WEEK-prepared-food-planner-entry-authority.md`에 Stage 5·final authority·Stage 6 통과 기록으로 남아 있다.
- 그 판정은 당시 private 등록과 picker 복귀 UX에 대한 역사적 증거다. 이번 v1.5.27의 shared `public/manual`, g/mL 기준, 공개·소유권 안내, owner 수정/삭제, moderation lock을 승인한 증거로 재사용하지 않는다.
- 기존 form body scroll, sticky header/footer, picker 선택 복귀 mental model은 유지하고 계약 문구와 상태만 additive 확장한다.

## Design Intent

- 공공 catalog에 없는 제품을 다른 로그인 사용자도 검색·플래너 추가할 수 있는 `사용자 등록` 공동 제품으로 만든다.
- 신규 기준량은 `g` 또는 `mL`만 받는다. wireframe의 `100`은 입력 예시이며 create prefill 공식 계약이 아니다. 원 라벨 표기는 optional `label_basis_text`로 보존한다.
- `다른 로그인 사용자도 검색하고 식단에 추가할 수 있어요`와 `등록자만 수정·삭제할 수 있어요`를 submit 전에 보이게 한다.
- optional 영양 빈칸은 missing이며 0이 아니다. 기존 immutable version을 덮어쓰지 않는다.
- client가 owner, source, visibility, moderation, public key, relation을 정하는 control을 두지 않는다.

## Authority Classification

- UI risk: `high-risk-ui-change`
- anchor extension: `PLANNER_WEEK -> MEAL_SCREEN -> MENU_ADD -> FOOD_PRODUCT_PICKER -> FOOD_PRODUCT_CREATE`
- mobile evidence: `390×844`
- narrow sentinel: `320×568`
- desktop evidence: `1280×900`
- familiar pattern: picker 위 nested form sheet/modal. 긴 입력이므로 body만 세로 스크롤하고 header/footer는 sticky다.
- primary CTA: create `[등록하고 선택]`, edit `[변경 내용 저장]`; delete는 danger secondary action이다.
- page-level horizontal scroll은 금지하며 모든 input/action은 44px 이상이다.

## 레이아웃 와이어프레임 — 390px Create

```text
┌──────────────────────────────────────┐
│ ←  완제품 직접 등록                  │  sticky header / 44px back
├──────────────────────────────────────┤
│ [사용자 등록] 공동 제품              │  --brand-primary-soft / --radius-chip
│ 다른 로그인 사용자도 검색하고        │
│ 식단에 추가할 수 있어요               │  --text-2
│ 등록자만 수정·삭제할 수 있고,         │
│ 다른 사용자는 읽기와 추가만 가능해요  │
│                                      │  form body only scroll
│ 제품명 *                             │
│ [                                   ]│  --surface-fill / --radius-control
│ 업체/브랜드                          │
│ [                                   ]│
│                                      │
│ 영양 계산 기준량 *                   │
│ [ 100 ] [ g ▾ ]                     │  unit은 g / mL만
│ 원 라벨 기준량                       │
│ [ 예: 1회(40g)                      ]│  optional label_basis_text
│                                      │
│ 열량(kcal) * [                      ]│
│ 탄수화물(g) [                       ]│
│ 단백질(g)   [                       ]│
│ 지방(g)     [                       ]│
│ 나트륨(mg)  [                       ]│
│ 추가 영양성분 ▾                      │
│ 당류 / 포화지방 / 식이섬유           │
├──────────────────────────────────────┤
│ [등록하고 선택]                      │  --brand-primary, sticky primary CTA
└──────────────────────────────────────┘
```

## 레이아웃 와이어프레임 — 390px Owner Edit

```text
┌──────────────────────────────────────┐
│ ←  사용자 등록 제품 수정             │  sticky header
├──────────────────────────────────────┤
│ [사용자 등록]                        │
│ 이 변경은 새 영양 version으로 저장돼요│
│ 기존 식단의 영양 정보는 바뀌지 않아요 │
│                                      │
│ 제품명 * [나의 그래놀라             ]│
│ 업체/브랜드 [무먹푸드               ]│
│ 기준량 * [100] [g ▾]                 │
│ 원 라벨 [1봉(40g)                   ]│
│ 열량 * [410] ...                     │
│                                      │
│ [제품 삭제]                          │  --danger, owner-only secondary
├──────────────────────────────────────┤
│ [변경 내용 저장]                     │  --brand-primary, sticky primary CTA
└──────────────────────────────────────┘
```

- edit entry는 picker가 `editable=true`로 받은 본인 visible manual 제품에만 노출한다.
- public dataset, 다른 사용자/owner 익명화 shared manual에는 edit/delete 진입이 없다.
- legacy private owner edit는 선행 owner-only 경계를 유지하되 공개 전환 toggle을 제공하지 않는다.

## 좁은 모바일 와이어프레임 — 320px

```text
┌──────────────────────────────┐
│ ← 완제품 직접 등록           │
├──────────────────────────────┤
│ [사용자 등록] 공동 제품      │
│ 다른 로그인 사용자도         │
│ 검색하고 식단에 추가할 수    │
│ 있어요                       │
│ 등록자만 수정·삭제할 수 있고 │
│ 다른 사용자는 읽기·추가만    │
│                              │
│ 제품명 *                     │
│ [                           ]│
│ 업체/브랜드                  │
│ [                           ]│
│ 기준량 *                     │
│ [ 100 ]                     │
│ [ g ▾ ]                     │  부족하면 한 열, 44px 유지
│ 원 라벨 기준량               │
│ [ 예: 1회(40g)             ]│
│ 열량(kcal) *                 │
│ [                           ]│
│ ...                          │  body vertical scroll
├──────────────────────────────┤
│ [등록하고 선택]              │  keyboard/safe-area 위 sticky
└──────────────────────────────┘
```

- header/form body/sticky footer의 모바일 좌우 gutter는 모두 `--space-4`(16px)다. 320px에서도 공개 안내의 `로그인 사용자`와 `식단` 의미를 줄이지 않고 줄바꿈한다.
- label/input은 한 열이다. basis amount/unit은 공간이 부족하면 두 행으로 나누고 control을 축소하지 않는다.
- validation은 해당 field 바로 아래 최대 두 줄로 둔다. 상단 summary와 field error를 중복해 form을 밀어내지 않는다.
- sticky CTA와 keyboard가 마지막 nutrient field, error, delete confirm을 가리면 blocker다.

## 데스크톱 와이어프레임 — 1280px

```text
┌──────────────────────── FOOD_PRODUCT_PICKER context ─────────────────┐
│             ┌──── 사용자 등록 제품 modal 680px ────┐                │
│             │ ← 완제품 직접 등록                    │ sticky header │
│             │ [사용자 등록] 공동 공개 안내          │               │
│             ├──────────────────┬─────────────────────┤               │
│             │ 제품명/브랜드    │ 기준량/영양값       │ body only     │
│             │ 원 라벨 기준량   │ optional 영양       │ scroll        │
│             ├──────────────────┴─────────────────────┤               │
│             │ [목록으로]          [등록하고 선택]    │ sticky footer │
│             └────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
```

- 2-column을 사용해도 DOM/focus order는 mobile의 제품→basis→핵심 영양→optional→CTA 순서다.
- `1280×900` 첫 viewport에 안내, form 시작, primary CTA와 `목록으로`가 함께 보이도록 body만 scroll한다.
- background scroll lock, focus trap, opener focus return을 적용한다.

## 공식 입력 계약

| UI field | API field | 규칙 |
| --- | --- | --- |
| 제품명 | `name` | 필수 |
| 업체/브랜드 | `brand` | 선택/nullable |
| 기준량 amount | `nutrition.basis.amount` | 필수, finite `>0`; prefill은 공식 계약으로 고정하지 않음 |
| 기준량 unit | `nutrition.basis.unit` | `g / ml`만; UI는 `g / mL` |
| 원 라벨 기준량 | `nutrition.label_basis_text` | 선택, 예: `1회(40g)`, `1병(250mL)` |
| 열량 | `nutrition.values.energy_kcal` | 필수, finite `>=0` |
| 탄수화물/단백질/지방/나트륨 | 공식 nutrient key | 선택, finite `>=0` 또는 null |
| 당류/포화지방/식이섬유 | 공식 nutrient key | 선택, finite `>=0` 또는 null |

- 신규 shared manual은 `serving/package` basis를 받지 않는다. 원 라벨의 회/병/봉 표기는 text로만 보존한다.
- optional blank는 null/missing이다. 실제 0은 사용자가 숫자 0을 입력했을 때만 observed zero다.
- create/PATCH body에 `visibility`, `source_type`, `owner_user_id`, `moderation_status`, `external_product_key`, public stable key, `basis_relations` 입력을 만들지 않는다.
- 등록 화면은 public stable key, relation, 공공 source attribution, 운영 검수 상태를 사용자가 꾸미는 UI를 제공하지 않는다.

## 공개·소유권 안내 계약

- create CTA 바로 전까지 `다른 로그인 사용자도 검색하고 식단에 추가할 수 있어요`가 보인다.
- 보조 안내는 `등록자만 수정·삭제할 수 있고, 다른 사용자는 읽기와 플래너 추가만 가능해요`다.
- source badge는 저장 전/후 모두 `사용자 등록`이다. `내가 등록`이라고 쓰지 않는다.
- 공개 여부 toggle은 없다. 신규 manual은 서버가 shared `public/manual`로 결정한다.
- 본인 legacy private 제품에는 `비공개 보관`을 표시하며 이 화면에서 자동 공개하거나 shared product로 복제하지 않는다.
- 탈퇴 후 owner가 익명화된 public manual은 read-only로 남지만, 이 form에 edit/delete 진입을 제공하지 않는다.

## Create / Edit / Delete 흐름

### Create

1. picker의 `[직접 등록]`에서 form을 연다.
2. 필드 검증 후 `POST /food-products`를 한 번만 보낸다.
3. 성공하면 새 shared manual product와 첫 immutable nutrition version을 받는다.
4. picker의 새 제품 selected state로 돌아가고 search/source/date/column context를 보존한다.
5. 사용자가 수량을 확정하고 `[완제품 추가]`를 눌러야만 ProductPlannerEntry가 생긴다. 제품 저장만으로 entry/Meal/status/XP를 만들지 않는다.

### Edit

- 본인 visible manual `editable=true`에서만 진입한다.
- nutrition을 수정하면 전체 basis/value/label text를 보내 새 immutable version을 만든다. 과거 version과 기존 planner entry를 덮어쓰지 않는다.
- metadata만 바꾸면 current nutrition version은 유지한다.
- 저장 성공 후 picker로 돌아와 같은 product를 최신 current state로 명시적으로 다시 확인한다.

### Delete

- 본인 visible manual에만 `[제품 삭제]`를 제공하고 기존 modal pattern의 확인 dialog를 사용한다.
- 성공은 soft-delete이며 search result에서 제거한다. 기존 planner entry와 pin된 version은 보존한다.
- 중복 delete는 API의 멱등 성공을 그대로 완료로 처리한다. pending 중 CTA/ESC/backdrop 중복 실행을 막는다.

## Required States

### Loading / Submitting

- initial field shell과 공개 안내는 즉시 보인다.
- submit 중 primary CTA만 pending/disabled 처리하고 form draft를 유지한다.
- create/edit/delete를 double submit하지 않는다.

### Generic Mutation Error

- create/edit의 network/5xx/공통 오류는 form을 닫지 않고 모든 field draft와 picker의 search/source/date/column return context를 보존한다. sticky CTA 바로 위에 inline `저장하지 못했어요` + `[다시 시도]`를 두고 동일 create/edit submit을 다시 보낸다.
- delete의 network/5xx/공통 오류는 confirm dialog와 제품 card를 모두 유지한다. dialog 안에 inline `삭제하지 못했어요` + `[다시 시도]`를 두고 같은 delete confirm을 다시 보내며, 성공 응답 전에는 picker 결과에서 제품을 제거하지 않는다.
- 각 retry는 pending 동안 같은 mutation의 중복 실행을 막는다. validation, moderation lock, permission/not-found, version conflict는 generic retryable 오류와 분리해 해당 전용 recovery를 유지한다.

### Empty

- 초기 form은 empty state다. placeholder를 저장값처럼 보이게 하지 않고 optional nutrient를 0으로 채우지 않는다.

### Validation Error

- name, basis amount/unit, energy, negative/non-finite nutrient를 각 input과 연결한다.
- `422 UNSUPPORTED_NUTRIENT` 또는 `422 VALIDATION_ERROR`에서 draft와 picker return context를 보존한다.
- server가 `UNSUPPORTED_FIELD`로 거부한 field를 client가 숨겨 재전송하지 않고, 공식 body만 다시 구성한다.

### Read-only

- 다른 사용자, owner 익명화, public dataset은 picker card에서 read-only이며 이 edit form으로 들어오지 않는다.
- legacy private는 owner-only지만 이 화면에서 공개 전환은 불가하다.

### Unauthorized

- login gate 뒤 search/source/date/column과 안전한 form draft를 return-to-action으로 복원한다.
- raw provider data, credential, owner ID, moderation/key/relation 값은 draft storage에 없다.

### Nutrition Version Conflict

- `409 NUTRITION_VERSION_CONFLICT`: `제품 영양 정보가 바뀌었어요. 다시 확인해 주세요.`를 표시하고 draft를 유지한다.
- current version을 조용히 바꾸거나 자동 overwrite하지 않는다. 명시적 refresh 뒤 사용자가 다시 비교·submit한다.

### Moderation Lock

- owner가 edit/delete form을 연 뒤 제품이 hidden된 race에서 `409 PRODUCT_MODERATION_LOCKED`를 받으면 `현재 검토 또는 운영 제한 상태라 수정하거나 삭제할 수 없어요`를 표시한다. client가 `hidden_by_report`와 `hidden_by_operator` 중 원인을 추정하지 않는다.
- primary save/delete를 비활성화하고 picker 최신 검색으로 돌아가는 recovery를 제공한다.
- client가 moderation status를 바꾸거나 unlock/retry loop를 만들지 않는다. 기존 planner entry/pin은 유지된다.

### Deleted / Permission Race

- 이미 삭제된 owner delete는 성공으로 종료한다.
- edit 시 `403 FORBIDDEN` 또는 scope-filtered `404 RESOURCE_NOT_FOUND`면 draft를 별도 제품으로 자동 생성하지 않고 picker로 안전하게 복귀한다.
- hidden/deleted product는 새 search/add에 다시 넣지 않는다.

### Partial / Unavailable

- optional nutrient blank가 있으면 `입력하지 않은 영양성분은 0이 아니라 정보 없음으로 표시돼요`를 안내한다.
- energy 필수 이외 일부 값 누락은 partial일 수 있다. null을 0으로 변환하지 않는다.

## Interaction과 접근성

- open focus → product name, next 순서 → brand → basis amount → unit → label basis → energy/core → optional → primary CTA다.
- validation error focus는 첫 invalid field로 이동하고 `aria-describedby`로 field error를 연결한다.
- numeric input은 decimal과 observed zero를 허용한다. basis는 `>0`, nutrient는 `>=0` 차이를 validator와 안내에서 함께 지킨다.
- optional 영양 영역은 실제 button과 expanded state를 가진다.
- unsaved draft가 있는 back/ESC는 기존 discard confirmation을 사용한다. dialog가 열려 있으면 가장 안쪽 dialog부터 닫는다.
- success focus는 picker의 selected product heading, delete success focus는 picker search/result heading으로 반환한다.
- sticky footer는 safe-area/keyboard 위에 있고 body 마지막 field와 error를 가리지 않는다.

## Layout / Action 토큰

- 390px와 320px의 header, form body, sticky footer 좌우 padding은 `--space-4`(16px), desktop modal 내부 padding은 `--space-6`(24px)다.
- create `[등록하고 선택]`과 edit `[변경 내용 저장]`은 `--brand-primary`, pressed/hover는 `--brand-primary-hover`, 주요 CTA 높이는 `--control-height-lg`를 사용한다.
- `[제품 삭제]`와 delete confirm은 `--danger`를 기본 action 색으로, 필요 시 `--danger-soft`/`--danger-border`를 보조 면·테두리로 사용한다. primary CTA와 danger action에 임의 hex를 추가하지 않는다.
- 입력은 `--surface-fill`/`--line`/`--radius-control`, source badge는 `--brand-primary-soft`/`--brand-primary`/`--radius-chip`을 유지한다.

## Out-of-Scope UI Guard

- 공개/비공개 toggle 또는 legacy private 자동 공개
- client owner/source/moderation/public stable key 지정
- `basis_relations` 입력, 밀도/관계 추정, serving/package shared basis
- 바코드/OCR/이미지 라벨 import
- 외식/밀키트/실제 섭취/의료 목표
- generic 손질·크기·가식 상태 field
- 일반 사용자 moderation 상태 변경/숨김 해제 control

## 화면 정의서 매핑

| 정의서 항목 | 구현 설계 | 비고 |
| --- | --- | --- |
| shared manual 공개 등록 | ✅ | toggle 없이 server authority |
| g/mL 양수 기준 | ✅ | serving/package 불가, wireframe 100은 예시 |
| optional `label_basis_text` | ✅ | 원 라벨 text 보존 |
| 공개/owner-only 안내 | ✅ | submit 전 노출 |
| owner 수정/soft-delete | ✅ | `editable=true` visible manual만 |
| immutable version/pin 보존 | ✅ | edit/delete가 과거 entry를 바꾸지 않음 |
| moderation lock/conflict | ✅ | 409 두 상태 분리 |
| legacy private 비자동 공개 | ✅ | owner-only historical row 유지 |
| client authority 금지 | ✅ | owner/source/moderation/key/relation 입력 없음 |

## 새 Community Extension Authority Evidence 계획

- 새 evidence root는 `community-prepared-food-catalog` workpack이 확정한 경로를 사용하며 선행 `prepared-food-planner-entry` evidence를 덮어쓰지 않는다.
- 390/320/1280 create: initial, filled 100g, filled 100mL, optional label text, optional blank, observed zero, field validation, submitting, success picker return.
- 390/320/1280 edit: owner action, immutable-version 안내, nutrition edit, metadata-only edit, delete confirm/success/failure.
- recovery: unauthorized draft return, create/edit network·5xx draft 보존 retry, delete dialog/card 보존 retry, nutrition conflict refresh, 원인 중립 moderation lock, forbidden/not-found race.
- focus/scroll: keyboard가 CTA/마지막 field를 가리지 않는 320, desktop first-viewport CTA, modal focus trap과 picker focus return.
- anchor evidence: PLANNER_WEEK/MEAL_SCREEN/MENU_ADD/picker before+after에서 기존 scroll/CTA/day-card mental model이 유지되는지 비교한다.
- authority blocker: private 안내 잔존, 공개 toggle, owner/source/moderation/key/relation 입력, hidden owner 수정 허용, 과거 pin 변경, optional blank→0, 320px CTA 가림 중 하나라도 있으면 `confirmed` 금지다.

## design-critic 검토 필요 항목

- [ ] 공동 공개와 owner-only 수정/삭제 안내가 첫 submit 전에 이해되는가
- [ ] 100g/100mL 기본값과 원 라벨 text가 서로 다른 역할로 보이는가
- [ ] create/edit/delete가 owner/source/moderation 값을 client에 새로 요구하지 않는가
- [ ] create/edit/delete generic 오류가 draft/dialog/card를 보존하고 같은 action retry를 제공하는가
- [ ] moderation lock copy가 report/operator 원인을 추정하지 않는가
- [ ] 320px keyboard/CTA, 1280px first viewport, form body scroll이 안정적인가
- [ ] 선행 private 등록 authority와 새 shared community extension pending authority가 명확히 분리되는가
