# LEFTOVERS — cooked-batch-weight-ui exact-cancel 최종 독립 재크리틱

## 판정

- Screen verdict: **APPROVE**
- P0 / P1 / P2: **0 / 0 / 0**
- unresolved required finding: **0**
- Combined unique gate: **APPROVE — 0 / 0 / 0, unresolved 0**
- Contract Evolution Candidate: **없음**

`P1-LO-RR-01`은 exact repaired head에서 닫혔다. ordinary depleted state에는 weight/discard/adjust/close/consume CTA가 없고, 오직 `current_unweighed_closure_event_id != null`인 exact current active terminal `closed_unweighed` projection에만 secondary `[방금 종료 취소]`가 존재한다. 요청은 projected event ID와 current revision을 사용한 `action=cancel_current`뿐이며 generic reopen, non-current cancel, later-event reversal, `marked_unrecoverable` reversal은 허용하지 않는다.

README scope, Frontend Delivery Mode, State/Error Matrix, acceptance, semantic regression, LEFTOVERS design, automation required state와 공식 API v1.2.37 `0-CBW`가 이제 같은 규칙을 말한다. original unique finding 7건도 계속 closed이므로 LEFTOVERS와 전체 #11 design-critic gate를 unresolved 0으로 승인한다.

이 판정은 Stage 1 정적 design gate에 한정한다. Design Status는 계속 `temporary`이며 Stage 4 구현, fresh runtime screenshots, final product-design-authority, Stage 5/6, Manual 또는 activation을 승인하지 않는다.

## 독립성 및 exact target

- 역할: Homecook #11 `cooked-batch-weight-ui` fresh independent final design-critic rereviewer
- critic task ID: `019fe78e-f5a4-7662-b89a-8bdc9ee98269`
- exact-cancel repair author task ID: `019fe786-0f81-7c80-9238-d6088ae3d924`
- prior critic task ID: `019fe77a-69a8-74d2-a11a-e79e7afa39ce`
- original critic task ID: `019fe752-e4f6-7cc1-99b2-c57b438b069a`
- 모델/effort: GPT-5.6-Sol / high
- Claude CLI/app/API: 사용하지 않음
- reviewed head: `413d8ffa151e799ba2dd7eabf94bbb2cc385f58f`
- reviewed tree: `51c79e12ad4ff76a62676b686698978519479bf6`
- reviewed parent: `856d27001c8c87b85cc9f457ecb23944b43eecc3`
- reviewed lineage: `e52aa5c5583635c849c74c084337e702a3f58060` integration → `23c980c3c99450ce31d01437e2c2d4885702c0c4` prior design reports → `856d27001c8c87b85cc9f457ecb23944b43eecc3` historical internal APPROVE report cherry-pick → `413d8ffa151e799ba2dd7eabf94bbb2cc385f58f` exact-cancel repair

이 task는 generator, repair author, prior critics, internal reviewer와 다른 fresh task다. historical report는 finding provenance로만 사용하고 exact repaired bytes를 공식 API, design, workpack, automation, regression, current code/tests와 직접 대조했다. 기존 design/docs/tests/original reports는 수정하지 않는다.

## `P1-LO-RR-01` exact closure

### 허용 상태

공식 API v1.2.37 `0-CBW`는 다음 조건이 모두 참일 때만 `current_unweighed_closure_event_id`를 event UUID로 반환한다.

1. owner-authorized exact row다.
2. current active terminal event가 `closed_unweighed`다.
3. 그 뒤 later event가 없다.
4. 같은 event ID로 `cancel_current`가 가능하다.

다른 상태, other-owner/private row, legacy all-null, available non-closure, later-event state, `marked_unrecoverable`에서는 null이다. UI가 eligibility를 추론하거나 event history를 별도 조회하지 않는다.

### 노출 및 요청 규칙

- 모든 depleted card에서 weight, discard, adjust, close, consume CTA는 absent다.
- non-null exact projection에서만 secondary `[방금 종료 취소]`를 노출한다.
- request는 same existing `POST /cooked-batches/{id}/close-unweighed`에 `{ action:"cancel_current", reverses_event_id, expected_revision }`만 보낸다.
- `reverses_event_id`는 projected `current_unweighed_closure_event_id`, revision은 current server projection 값이다.
- success는 existing exact `{ action, batch, event_id }` wrapper를 소비하고 returned projection만 렌더한다.
- label은 `다시 열기`가 아니며 generic reopen, non-current closure cancel, later-event cancel, unrecoverable/marked-event reversal을 제공하지 않는다.

README의 LEFTOVERS scope, Frontend Delivery Mode, State/Error Matrix와 acceptance `accept-batch-weight-ui-empty-depleted`가 위 한 규칙으로 일치한다. semantic regression은 세 README section과 acceptance exact item에서 ordinary action absence, exact cancel presence, forbidden reversal을 동시에 요구하며 과거 `every depleted state removes mutation CTAs` 문구를 거부한다.

### TDD 및 stale handoff

Repair evidence와 diff를 대조했다.

- semantic test 추가 뒤 문서 수리 전: `1 failed / 6 passed`
- repair 후 focused single: `7/7` pass
- repaired exact focused range: `14 files / 142 tests` pass
- 초기 runner exit 254는 missing `vitest` 환경 bootstrap이며 semantic RED가 아니다.

README의 stale handoff도 current repair-complete 상태다. COOK_MODE `legacy-null`/depleted는 LEFTOVERS-only N/A이고, LEFTOVERS legacy/v2 two-section과 cursor pagination repair는 완료됐다고 기록한다. 이제 이 fresh report가 남아 있던 exact-cancel design rereview를 unresolved 0으로 닫는다. lifecycle/internal/final authority 상태를 자동 승격하지는 않는다.

## Exact repair와 no-new-contract audit

`856d2700...` 대비 `413d8ffa...`의 변경은 README, acceptance, semantic test, exact repair evidence 네 경로뿐이다. LEFTOVERS design, COOK_MODE design, original/prior critic reports, automation, work item/status, official API, current product code/types/server/routes, schema/migration, dependencies는 변경되지 않았다.

따라서 새 endpoint, request/response field, status, error code, action enum, route, RPC, migration, direct DML, client-invented eligibility 또는 public contract가 없다. current types/server parser도 15-field projection, `cancel_current`, exact `reverses_event_id`, positive `expected_revision`과 existing route/RPC binding을 보존한다.

## Original unique finding 7건 재확인

| Original unique finding | exact repaired head 결과 | Disposition |
| --- | --- | --- |
| lineage evidence role 혼합 (`P1-CM-01`, `P1-LO-01`) | 두 design header가 reviewed input, internal HOLD, critic HOLD/repair base를 분리하고 HOLD를 비승인 evidence로 명시한다. | **closed** |
| two-design/two-critic lock (`P1-CM-02`, `P1-LO-02`) | supported index와 regression이 두 design/두 exact critic을 exact order로 잠그고 single/generic path를 거부한다. | **closed** |
| legacy LEFTOVERS 기능 소실 (`P1-LO-03`) | `/leftovers`와 `/cooked-batches`를 독립 section/identity/action group으로 분리하고 planner-add, 다먹음, ATE_LIST/덜먹음, stale-review/계속 보관을 보존한다. | **closed** |
| cursor pagination 부재 (`P1-LO-04`) | `더 보기`, filter-bound opaque cursor, pending/error/retry/422 refresh, stable append, overlap suppression, focus/live announce가 정의돼 있다. | **closed** |
| COOK_MODE unreachable legacy/depleted (`P2-CM-01`) | LEFTOVERS-only N/A이며 hidden read/new field/guessed status가 금지돼 있다. | **closed** |
| unsupported `[상세 확인]` (`P2-LO-01`) | action을 제거하고 15-field legacy-null card 자체로 read-only truth를 완결한다. | **closed** |
| nonexistent `--border` (`P2-LO-02`) | canonical `--line`과 existing `--danger-border`만 사용하며 새 global token/hex를 금지한다. | **closed** |

Prior rereview의 유일한 추가 finding `P1-LO-RR-01`도 위 exact semantic closure로 **closed**다.

## 두 source와 #9 / #12 경계

- Section A는 existing `/leftovers` identity `leftover_id`만 사용하며 planner-add, 다먹음, ATE_LIST/덜먹음, stale-review/계속 보관을 보존한다.
- Section B는 `/cooked-batches?availability=all`의 `batch_id`, revision, projected current event ID만 사용한다.
- 두 source는 title, recipe, date, servings, position 또는 ID similarity로 join/merge/cross-route하지 않는다. local key namespace 외 guessed relation이 없다.
- #9는 meal-log DB/API/write/events/pointers owner다. #11은 meal-log route/schema/server writer를 수정하지 않는다.
- #12는 cooked-batch consumed-amount add/edit/delete CTA와 sheet owner다. #11 Section B에는 consumed CTA가 없다. Section A의 legacy `다먹음`은 gram consumption action이 아니다.
- discard/adjust/close/cancel은 existing #8 contract만 사용하며 meal entry나 임의 XP를 만들지 않는다.

## 390px / 320px, mobile UX와 접근성

- 390px에서 `남은요리 관리`와 `중량·잔량 기록` 두 section heading, source-specific action hierarchy, known/missing/unrecoverable/legacy-null/depleted truth가 한 vertical scroll journey로 읽힌다.
- 320px에서 section heading과 action group은 유지되고 buttons, pagination/retry/refresh는 full-width stack이다. target은 44px 이상, numeric input은 16px 이상이다.
- page-level horizontal scroll과 nested list scroll이 없다. action은 familiar bottom sheet를 사용하고 body internal scroll, fixed footer, safe area, keyboard reachability를 요구한다.
- destructive/irreversible confirmation은 safe cancel을 danger confirm보다 DOM/visual order에서 먼저 두고 initial focus를 danger action에 놓지 않는다.
- focus trap/restore/Escape/pending lock, alert/status/live append, no-color-only meaning, recipe-context action name, cursor/event ID 비노출이 명시돼 있다.
- exact cancel은 secondary이며 terminal reason hierarchy를 깨거나 generic reopen처럼 보이지 않는다.

이번 task에서 직접 검사한 LEFTOVERS 390px/320px predecessor screenshots는 legacy mobile hierarchy reference다. #11 two-section/exact-cancel 구현 증거가 아니며 current Stage 1 approval의 runtime proof로 사용하지 않았다. Fresh implementation screenshot/manifest는 Stage 4가 별도로 생성해야 한다.

## Artifact lock

Supported `frontend.artifact_assertions`와 dedicated regression은 다음 exact order를 고정한다.

1. `ui/designs/COOK_MODE.md`
2. `ui/designs/LEFTOVERS.md`
3. `ui/designs/critiques/COOK_MODE-cooked-batch-weight-ui-critique.md`
4. `ui/designs/critiques/LEFTOVERS-cooked-batch-weight-ui-critique.md`

Original critic artifacts는 historical HOLD input이다. 이 report가 repaired exact head의 fresh LEFTOVERS 판정을 제공하며 기존 report path나 automation index를 변경하지 않는다.

## 검증 결과

| 검증 | 결과 |
| --- | --- |
| exact focused design/API/compatibility/completion/LEFTOVERS/workflow Vitest | `14 files / 142 tests` pass |
| additional current-code superset Vitest | `14 files / 162 tests` pass |
| source-of-truth/workflow-v2/workpack/automation/OMO/authority-presence/closeout validators | `7/7` pass |
| `pnpm lint` | pass |
| `pnpm typecheck` | pass |
| `pnpm audit --audit-level high` | exit 0; high/critical 0, residual low 1 / moderate 1 |
| `git diff --check` | pass |
| exact repair scope | README/acceptance/test/evidence only |
| unchanged-surface audit | design/API/automation/work item/status/product/schema/package diff 0 |

## 최종 결론과 evidence limits

LEFTOVERS는 original unique finding 7건과 prior 추가 finding `P1-LO-RR-01`이 모두 닫혔다. exact current closure만 취소할 수 있고 ordinary depleted actions, generic reopen, non-current cancel, unrecoverable reversal은 노출되지 않는다. **Screen APPROVE 0/0/0**, combined design-critic gate도 **APPROVE 0/0/0**이다.

Static Markdown/ASCII와 predecessor PNG는 runtime focus, virtual keyboard, safe-area geometry, computed overflow/target/font/contrast, screen-reader announcement 또는 WCAG conformance를 증명하지 않는다. Stage 4는 fresh 390px/320px/desktop implementation evidence와 manifest, DOM/runtime tests를 만들고 final authority가 이를 별도로 판정해야 한다. physical keyboard, VoiceOver/TalkBack, real device와 full WCAG는 Manual pending이다.
