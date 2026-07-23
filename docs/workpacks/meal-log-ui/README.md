# meal-log-ui

## Goal

기존 Planner route의 `식사 기록` segment 안에 day-first `MEAL_LOG`를 구현할 계약을 잠근다. 저장 당시 local date와 exact source/evidence를 기준으로 실제 섭취 entry, 끼니 소계, 하루 합계와 결측을 표시하고 cooked batch·제품·재료 add/edit/delete를 #9 backend에 연결한다. 계획 카드·계획 영양·HOME 검색과 섞지 않는다.

## Official Sources

- `docs/요구사항기준선-v1.7.22.md`
- `docs/화면정의서-v1.5.28.md`
- `docs/유저flow맵-v1.3.25.md`
- `docs/db설계-v1.3.23.md`
- `docs/api문서-v1.2.27.md`
- approved plan SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d`, 1,018 lines

## Scope

### Day-first screen

- render `MEAL_LOG` inside #10 existing Planner shell and `요리 계획 | 식사 기록` segment; add no bottom tab or parallel route.
- a 7-day horizontal strip selects one day. The body shows only that day; the strip indicates record presence only and provides no weekly analysis.
- use stored `consumed_local_date` as grouping authority. Never regroup history from current device/profile timezone.
- show energy, carbohydrate, protein and fat first, sodium second. Do not show goals, achievement rate, medical or disease guidance.
- day total equals active column subtotals for non-deleted entries. `partial/unavailable` is not zero; show `일부 정보 없음 N건`.

### Meal sections and entries

- reuse active `meal_plan_columns` label/order as display settings without mixing Recipe Meal rows or plan status chips.
- preserve deleted-column history under read-only `삭제된 끼니 · {slot_name_snapshot}` sections. Deleted columns cannot receive new entries.
- section header shows subtotal and incomplete count.
- entry shows display name, optional brand/source badge, actual quantity/unit, core nutrition, `예상 | 최소 | 정보 준비 중`, edit and delete.
- empty active sections provide a single clear add-food CTA. Deleted sections remain read-only/history-only.

### Add-food full-height sheet

- opening from a section preselects date and active meal column. Back/close restores the same date, section and scroll/focus context.
- source switch is exactly `요리한 음식 | 제품·재료`.
- empty query shows owner/generation recent/frequent sources with safe label/brand and last amount/unit; every suggested amount must be confirmed before save.
- cooked batch cards show cooked date, name, finished weight, remaining g and nutrition availability. Only known+available+enough remaining is gram-loggable.
- missing/unrecoverable batch blocks save, shows `무게 입력 필요 | 원래 무게 확인 불가` and links only to an eligible #11 weight action.
- product/ingredient search consumes server typed-union `items[]` with one global order and one opaque cursor. Client must not merge two APIs, group source pages or add `브랜드 제품 더보기`.
- render ingredient/product/source badges faithfully. No-space brand+product coverage ordering remains server authority.

### Quantity / evidence

- source is exact-one `cooked_batch | food_product | ingredient`.
- batch quantity is g and cannot exceed authoritative remaining weight.
- product uses only exact pinned nutrition version/direct basis relation; ingredient uses approved profile plus exact conversion/piece evidence.
- if no exact conversion exists, keep input correctable and show `UNIT_CONVERSION_MISSING`; do not estimate or persist a row.
- `partial/unavailable` source may be recorded only with the official evidence state preserved, never as complete or zero.

### Create / edit / delete

- each deliberate create/edit/delete uses a fresh UUID `Idempotency-Key`; retry uses the same key/payload and renders the stored result once.
- edit/delete sends current expected revision. Conflict refreshes authority while preserving correctable input and focuses the message.
- cooked batch edit reverses only its own active event and appends replacement; delete reverses its own event and soft-deletes entry in one transaction.
- product/ingredient edit pins new exact evidence and never silently repins current mutable product/profile.
- date/timezone editor saves `consumed_local_date`, IANA `timezone_name_snapshot` and nullable `consumed_at` together. Unknown historical time stays null; it is not fabricated.

## State Matrix

| State | Required UI |
| --- | --- |
| loading | day/section skeleton; mutation CTA fail-closed |
| empty | active meal sections with add CTA; no fake totals |
| error | preserve already-loaded entries where safe and offer scoped retry |
| unauthorized | login guidance and return-to-action; private data hidden |
| partial | known minimum plus missing count/reasons |
| unavailable | no number; `정보 준비 중` |
| deleted meal column | snapshot label/history read-only; no add |
| missing/unrecoverable batch | no gram save; eligible weight guidance only |
| pending/replay | duplicate submit disabled; stored result applied once |
| stale revision/422 | input retained, authority refreshed, error focused |

## Interaction Wireframe

```text
플래너
[ 요리 계획 ] [ 식사 기록 ]

‹ 20  21 [22] 23  24  25  26 ›

오늘 먹은 영양
1,620 kcal  탄수 190g · 단백질 82g · 지방 54g
나트륨 2,100mg              일부 정보 없음 1건

아침                                    420 kcal
  닭가슴살 샐러드 120g                  [수정] [삭제]
  생크림빵 0.5봉 · 사용자 등록          [수정] [삭제]
  [+ 아침에 먹은 음식 추가]

삭제된 끼니 · 야식                      read-only
  과거 기록 · 정보 준비 중
```

```text
음식 추가 — 7월 22일 · 아침
[ 요리한 음식 ] [ 제품·재료 ]

query empty: 최근 / 자주 먹은 음식
김치찌개 · 완성 1480g · 남은 740g
연세크림빵 · 사용자 등록 · 최근 0.5봉

선택한 음식
실제 양 [ 300 ] [g]
[취소]                              [기록 저장]
```

## API / Security Contract

- consume only `GET /meal-log`, `GET /meal-log/recent`, `GET /cooked-batches`, `POST /meal-log/entries`, `PATCH /meal-log/entries/{id}`, `DELETE /meal-log/entries/{id}` and `GET /food-catalog/search`.
- server remains authority for owner/generation, visibility, exact evidence, slot snapshot, nutrition compact snapshot, event replay and totals.
- other-owner/private/deleted/hidden sources remain nondisclosed. `visibility` is not a client search filter.
- all responses retain `{ success, data, error }`; errors retain `{ code, message, fields[] }`.
- no direct batch/event/entry hard delete or cached total mutation is added.

## Dependencies / Successors

- implementation waits until #9 `meal-log-core` runtime and #10 `planner-shell` runtime are merged and green. Stage 1 docs may proceed now.
- #1 owns unified product search relevance; #8 owns batch ledger/weight authority; #11 owns batch weight/lifecycle presentation.
- #13 owns legacy product planner compatibility; #14 owns cross-slice release QA.

## Out of Scope

- weekly nutrition analysis, goals, medical advice, barcode/OCR, free-text external food or a new bottom tab.
- Planner Recipe Meal plan rows/status/actions or plan nutrition.
- new endpoint, source type, field, status, nutrition evidence or client-authored total.
- HOME product/ingredient search, batch weight mutation UI or legacy product planner migration.

## Design / Accessibility Authority

- UI risk: new high-risk required screen `MEAL_LOG`; it is not an official anchor screen.
- before Stage 2, create/refresh `ui/designs/MEAL_LOG.md` and obtain independent critique at `ui/designs/critiques/MEAL_LOG-critique.md`.
- Stage 4 requires separate 390px, 320px and desktop evidence for default, loading, empty, error, unauthorized, partial, unavailable, deleted-column, add-sheet recent, add-sheet search, missing batch, unrecoverable batch, edit, delete confirmation, pending, replay and conflict.
- legacy or unrelated evidence is not #12 evidence unless explicitly refreshed against this contract. Fresh manifest records implementation head SHA and capture times.
- authority report: `ui/designs/authority/MEAL_LOG-authority.md`, authored after and citing fresh evidence.
- preserve day-first density, visible date/meal context, 44px targets, horizontal strip containment, sheet focus trap/restoration, error announcements, destructive delete hierarchy, reduced motion and no page overflow.
- at 320px stack actions in DOM/visual priority order rather than compressing labels or touch targets.

## Design Status

`temporary`. Stage 1 locks structure, states and evidence only; canonical design, critic and product-design-authority remain required.

## Stage 1 Current Gate

- run SOT/workflow/workpack/automation/bookkeeping validators, focused workflow-doc tests, lint, typecheck, dependency audit and diff/parity only.
- component/E2E/visual/a11y/browser/remote/design-authority commands are future Stage 4/6 evidence.

## Delivery Checklist

- [x] Stage 1 exact-six docs authored
- [ ] internal1.5/security/five-axis/design reviews approved with zero findings
- [ ] every check started for the current head SHA terminal green or intended skip
- [ ] post-merge master QA/Policy/Security/Vercel green
- [ ] Stage 2 TDD RED before implementation
- [ ] 390/320/desktop MEAL_LOG authority approved
