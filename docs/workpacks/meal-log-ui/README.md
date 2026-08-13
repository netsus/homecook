# Slice: meal-log-ui

## Goal

기존 Planner route의 `식사 기록` segment 안에 day-first `MEAL_LOG`를 구현할 계약을 잠근다. 저장 당시 local date와 exact source/evidence를 기준으로 실제 섭취 entry, 끼니 소계, 하루 합계와 결측을 표시하고 cooked batch·제품·재료 add/edit/delete를 #9 backend에 연결한다. 계획 카드·계획 영양·HOME 검색과 섞지 않는다.

## Branches

- Stage 1 문서: `docs/meal-log-ui-stage1-relock-current`
- 백엔드: N/A — #12 owns UI only; merged #9 API/DB authority를 변경하지 않는다.
- 프론트엔드: `feature/fe-meal-log-ui`

## In Scope

- 화면: #10 기존 Planner shell의 `요리 계획 | 식사 기록` segment 안 `MEAL_LOG` day-first 화면과 full-height 음식 추가 sheet
- API: 기존 `GET /meal-log`, `GET /meal-log/recent`, `GET /cooked-batches`, `POST /meal-log/entries`, `PATCH /meal-log/entries/{id}`, `DELETE /meal-log/entries/{id}`, `GET /food-catalog/search` 소비
- 상태 전이: create/edit/delete idempotency, expected revision conflict, own cooked-batch event reversal/replacement, soft delete, nullable historical instant 보존
- DB 영향: 없음. #9가 소유하는 기존 meal-log/cooked-batch/product/ingredient projection을 UI에서 읽고 기존 mutation API를 호출한다.
- Schema Change:
  - [x] 없음 (기존 #9 계약 소비)
  - [ ] 있음 → 이 슬라이스에서는 금지

### Day-first screen

- 7-day horizontal strip은 하루만 선택하며 record presence만 표시하고 weekly analysis를 제공하지 않는다.
- 저장된 `consumed_local_date`가 grouping authority다. 현재 device/profile timezone으로 history를 다시 묶지 않는다.
- energy, carbohydrate, protein, fat을 먼저, sodium을 다음에 표시한다. goal, achievement rate, medical/disease guidance는 표시하지 않는다.
- day total은 non-deleted entry의 active column subtotal 합이다. `partial/unavailable`은 zero가 아니며 `일부 정보 없음 N건`을 표시한다.

### Meal sections and entries

- active `meal_plan_columns`의 label/order를 display setting으로 재사용하되 Recipe Meal row나 plan status chip과 섞지 않는다.
- 삭제된 column history는 read-only `삭제된 끼니 · {slot_name_snapshot}` section으로 보존하고 새 entry를 받지 않는다.
- section header는 subtotal과 incomplete count를 표시한다.
- entry는 display name, optional brand/source badge, actual quantity/unit, core nutrition, `예상 | 최소 | 정보 준비 중`, edit/delete를 표시한다.
- empty active section은 단일 add-food CTA를 제공하고 deleted section은 history-only로 유지한다.

### Add-food full-height sheet

- section에서 열면 date와 active meal column을 preselect한다. back/close는 같은 date, section, scroll/focus context를 복원한다.
- source switch는 정확히 `요리한 음식 | 제품·재료`다.
- empty query는 owner/generation recent/frequent source의 safe label/brand와 last amount/unit을 표시하며, suggested amount는 저장 전 반드시 확인한다.
- cooked batch card는 cooked date, name, finished weight, remaining g, nutrition availability를 표시한다. known+available+enough remaining만 gram-loggable이다.
- missing/unrecoverable batch는 save를 막고 `무게 입력 필요 | 원래 무게 확인 불가`와 eligible #11 weight action만 연결한다.
- product/ingredient search는 server typed-union `items[]`, one global order, one opaque cursor를 그대로 소비한다. client가 두 API/page group을 합치거나 `브랜드 제품 더보기`를 추가하지 않는다.
- ingredient/product/source badge와 no-space brand+product coverage ordering은 server authority를 그대로 표시한다.

### Quantity and evidence

- source는 exact-one `cooked_batch | food_product | ingredient`다.
- batch quantity는 g이며 authoritative remaining weight를 넘지 않는다.
- product는 exact pinned nutrition version/direct basis relation만, ingredient는 approved profile과 exact conversion/piece evidence만 사용한다.
- exact conversion이 없으면 input을 correctable로 유지하고 `UNIT_CONVERSION_MISSING`을 표시하며 estimate/persist하지 않는다.
- `partial/unavailable` source는 official evidence state를 유지한 채 기록할 수 있지만 complete 또는 zero로 표시하지 않는다.

## Out of Scope

- weekly nutrition analysis, goals, medical advice, barcode/OCR, free-text external food, 새 bottom tab 또는 parallel route
- Planner Recipe Meal plan rows/status/actions 또는 plan nutrition
- 새 endpoint, source type, field, status, nutrition evidence, client-authored authoritative total
- HOME product/ingredient search, batch weight mutation UI, legacy product planner migration
- #9/#10 broader Manual/server-Mac/OAuth, physical-device/AT, capability `R/R+1/R+2`, production 또는 activation의 완료 주장

## Dependencies

| 선행/연관 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `meal-log-core` #9 / PR #1319 | runtime merged; broader Manual/activation pending | [x] |
| `planner-shell` #10 / PR #1331 | Stage 4~6 runtime and OMO merged-green; broader Manual/activation pending | [x] |
| `prepared-food-search-relevance` #1 | typed-union search contract authority | [x] |
| `cooked-batch-weight-ledger` #8 | cooked batch authority | [x] |
| `cooked-batch-weight-ui` #11 | eligible weight-action sibling | [x] |
| `legacy-product-compat` #13 / cross-slice release QA #14 | successors | [ ] |

- #9 exact source head `be93bfc47281e2795c59c0fd1052a4ecf6085837` merged as `8ba3fa5a2a198eb4f9c19d59cea5f6ccc52fdd4f`; checkpoint projection `4597ca835ba81307d0bdf9e1b1c41806b17e7a68`, security repair `16cfce44d32d5b618742a0e20460df4772a19142`, historical post-merge raw 14/14 success는 backend predecessor evidence다.
- #10 merged as `2185b59d1b460dac916aa4a4a4a5e061c8b795f0`; Stage 4~6 merged-green runtime와 OMO completion은 `docs/workpacks/planner-shell/omo-report.md`에 기록돼 있다.
- Stage 2 implementation dependency is available after Stage 1 independent reviews and the design prerequisite. #9/#10의 Manual/server-Mac/OAuth와 capability `R/R+1/R+2`/production/activation pending은 #12가 승격하지 않는다.

## Backend First Contract

- request/query/path와 response/error shape는 기존 #9 계약을 그대로 소비하며 모든 response는 `{ success, data, error }`, error는 `{ code, message, fields[] }`를 유지한다.
- server는 owner/generation, visibility, exact evidence, slot snapshot, nutrition compact snapshot, event replay와 total authority다. other-owner/private/deleted/hidden source는 nondisclosed이며 `visibility`는 client search filter가 아니다.
- deliberate create/edit/delete마다 fresh UUID `Idempotency-Key`를 만들고 retry는 같은 key/payload를 사용하며 stored result를 한 번만 반영한다.
- edit/delete는 current expected revision을 보내고 conflict 시 authority를 refresh하면서 correctable input을 보존하고 message에 focus한다.
- cooked batch edit는 자기 active event만 reverse하고 replacement를 append한다. delete는 자기 event reversal과 entry soft-delete를 한 transaction에서 수행한다.
- product/ingredient edit는 새 exact evidence를 pin하며 mutable current product/profile을 silently repin하지 않는다.
- editor는 `consumed_local_date`, IANA `timezone_name_snapshot`, nullable `consumed_at`을 함께 저장하며 unknown historical time을 fabricate하지 않는다.
- direct batch/event/entry hard delete 또는 cached total mutation을 추가하지 않는다.

## Frontend Delivery Mode

- 디자인 확정 전에는 기능 가능한 temporary UI로 구현하고, Stage 4 완료 후 `pending-review`, Stage 5와 final authority 이후에만 `confirmed`로 전환한다.
- 필수 상태는 `loading / empty / error / read-only / unauthorized`이며 `partial / unavailable / pending / replay / conflict`를 별도 상태로 구분한다.
- 비로그인 보호 action은 private data를 숨기고 login guidance와 return-to-action을 보존한다.

| State | Required UI |
| --- | --- |
| loading | day/section skeleton; mutation CTA fail-closed |
| empty | active meal sections with add CTA; no fake totals |
| error | safe한 loaded entry는 보존하고 scoped retry 제공 |
| unauthorized | login guidance와 return-to-action; private data hidden |
| partial | known minimum과 missing count/reason |
| unavailable | number 없이 `정보 준비 중` |
| deleted meal column | snapshot label/history read-only; no add |
| missing/unrecoverable batch | no gram save; eligible weight guidance only |
| pending/replay | duplicate submit disabled; stored result applied once |
| stale revision/422 | input retained, authority refreshed, error focused |

### Interaction wireframe

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

## Design Authority

- UI risk: `high-risk` — 신규 required screen `MEAL_LOG`; official anchor screen은 아니다.
- Anchor screen dependency: 없음. 기존 #10 Planner shell 안 segment만 소비한다.
- Visual artifact: `ui/designs/MEAL_LOG.md`; Stage 4 screenshot evidence는 `ui/designs/evidence/meal-log-ui/`의 390px, 320px, desktop state set과 `manifest.json`이다.
- Authority status: `required`
- Notes: fresh design-generator task 뒤 fresh independent design critic이 `ui/designs/critiques/MEAL_LOG-critique.md`를 검토하고, runtime evidence 이후 별도 product-design-authority가 `ui/designs/authority/MEAL_LOG-authority.md`를 작성한다. 이 Stage 1 author does not approve its own changes.

- Stage 4 evidence는 default, loading, empty, error, unauthorized, partial, unavailable, deleted-column, add-sheet recent/search, missing/unrecoverable batch, edit, delete confirmation, pending, replay, conflict를 각 viewport에서 포함한다.
- fresh manifest는 implementation head SHA와 capture times를 기록한다. legacy/unrelated evidence는 이 계약으로 refresh되지 않으면 #12 evidence가 아니다.
- day-first density, visible date/meal context, 44px targets, horizontal strip containment, sheet focus trap/restoration, error announcement, destructive hierarchy, reduced motion, no page overflow를 보존한다.
- 320px에서는 label/touch target을 압축하지 않고 DOM/visual priority order로 action을 stack한다.

## Design Status

- [x] 임시 UI (temporary) — Stage 1 계약 상태
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후
- [ ] 확정 (confirmed) — Stage 5와 required final authority 통과 후
- [ ] N/A — FE 화면이 있으므로 해당 없음

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.32.md`
- `docs/화면정의서-v1.5.36.md`
- `docs/유저flow맵-v1.3.34.md`
- `docs/db설계-v1.3.34.md`
- `docs/api문서-v1.2.39.md`
- approved plan: `docs/workpacks/planner-shell/evidence/cooking-meal-log-and-product-search-master-plan-20260722.md`, SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d`, 1,018 lines

### Stage 1 relock lineage

- initial fetch는 expected `origin/master` `16cfce44d32d5b618742a0e20460df4772a19142`와 일치했다. Draft PR 생성 전 base drift로 `origin/master`가 `c12afbccd15f4935a1a52b9f2c2c23882a5033ff`로 이동했고 normal merge로 통합했다. rebase, reset, force-push는 사용하지 않았다.
- drifted tuple은 full-local Supabase local-only operating authority만 추가한다. #12 product UI, public endpoint/status/error/field, DB schema, user flow는 바꾸지 않으므로 Contract Evolution은 N/A다.
- 이 Stage 1 author는 docs만 작성한다. fresh independent internal1.5, security/API, five-axis, fresh design-generator task와 fresh independent design critic이 별도 task로 남는다.

## QA / Test Data Plan

- Stage 1 current gate: SOT/workflow/workpack/automation/bookkeeping validator, actual `evaluateDocGate`와 checklist error 0을 호출하는 `tests/meal-log-ui-stage1-relock.test.ts`, focused workflow-doc tests, lint, typecheck, dependency audit, JSON/diff/branch/commit policy만 실행한다.
- Stage 4 fixture baseline: selected day, deleted column history, soft-deleted absence, total/incomplete, recent/search, three source types, create/edit/delete/replay/conflict와 모든 required UI state를 deterministic fixture로 제공한다.
- isolated local: schema/security/API integration이 필요하면 pinned isolated-local stack에서만 실행하며 운영 full-local volume/port/env를 공유하지 않는다.
- controlled full-local: runtime smoke가 필요할 때 exact target identity와 read-only 여부를 기록하고 기본 `BEGIN READ ONLY` 및 checksum before/after 동일성을 사용한다. 현재 Stage 1은 이 runtime evidence를 수행하거나 주장하지 않는다.
- seed/reset: #12는 schema/seed를 추가하지 않는다. isolated-local fixture seed만 허용하며 실제 full-local target에는 destructive reset/volume delete를 실행하지 않는다.
- blockers: design-generator/critic 미완료, independent review finding 잔존, #9/#10 contract drift, required fixture/bootstrap 부재, current-head check pending/fail, local-only target boundary 또는 exact-head evidence 부재.
- Manual Only: physical keyboard/screen reader/device, server-Mac/OAuth, capability `R/R+1/R+2`, production/activation evidence는 future pending이며 #12 Stage 1이 닫지 않는다.

## Key Rules

- #12 owns UI only. 기존 #9 API/DB authority를 #10 shell 안에서 소비하고 endpoint, schema, migration, capability, activation을 추가하지 않는다.
- stored local date authority, active subtotal/day total/incomplete truth, deleted-column read-only와 soft-deleted absence를 보존한다.
- `unavailable`을 zero/complete로 표시하지 않는다.
- client-side product/ingredient merge, unofficial source/field/status/total, mutable-current evidence repin, 다른 event reversal을 금지한다.
- missing/unrecoverable batch의 gram save를 막고 eligible #11 weight action만 연결한다.
- local-only authority는 pinned isolated-local deterministic gate와 controlled full-local read-only verification으로만 소비하며 Supabase Cloud/linked/remote credential은 요구하거나 사용하지 않는다.

## Primary User Path

1. 사용자가 기존 Planner route에서 `식사 기록` segment와 하루를 선택한다.
2. active meal section의 add CTA로 full-height sheet를 열고 `요리한 음식` 또는 `제품·재료` source를 찾는다.
3. actual quantity와 exact evidence를 확인한 뒤 idempotent create를 저장한다.
4. 화면은 meal subtotal/day total/incomplete state를 갱신하고, edit/delete/conflict/replay에서도 같은 date/section/focus context를 보존한다.

## Delivery Checklist

> Stage 1 exact-six artifacts와 roadmap/status projection은 작성됐지만, 아래 runtime closeout 항목은 evidence가 생기기 전까지 unchecked다.

- [ ] 기존 #9 API와 typed adapter 계약 및 shared policy tests 고정 <!-- omo:id=delivery-meal-log-ui-shared-contract;stage=2;scope=shared;review=3,6 -->
- [ ] idempotency/revision/own-event/history 회귀 TDD RED와 GREEN 증거 <!-- omo:id=delivery-meal-log-ui-policy-tests;stage=2;scope=shared;review=3,6 -->
- [ ] 기존 #10 Planner shell 안 MEAL_LOG와 add sheet UI 연결 <!-- omo:id=delivery-meal-log-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [ ] required states, focus, 44px, 390/320/desktop 접근성 검증 <!-- omo:id=delivery-meal-log-ui-state-accessibility;stage=4;scope=frontend;review=5,6 -->
- [ ] fresh design evidence와 independent critic/final authority 승인 <!-- omo:id=delivery-meal-log-ui-design-authority;stage=4;scope=frontend;review=5,6 -->
- [ ] local-only target evidence, current-head checks와 post-merge closeout 동기화 <!-- omo:id=delivery-meal-log-ui-closeout;stage=4;scope=shared;review=6 -->
