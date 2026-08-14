# legacy-product-compat

## Goal

기존 완제품 계획과 v1/v2 cooking reader를 파괴적 정리 없이 호환 가능하게 유지한다. legacy product row는 pinned 과거 값을 read-only로 읽고 사용자가 삭제할 수 있으며, v1 stable key와 dormant v2 drain은 관측 가능한 단계별 gate로만 전환한다. 한 release 경과나 telemetry 0만으로 endpoint, row, parser 또는 cursor decoder를 제거하지 않는다.

## Branches

- Stage 1 relock author: `docs/legacy-product-compat-stage1-relock-author-20260815`
- Stage 2 backend: 별도 fresh Codex task/branch에서 시작
- Stage 4 frontend: 별도 fresh Codex task/branch에서 시작

## Official Sources

- `docs/요구사항기준선-v1.7.32.md`
- `docs/화면정의서-v1.5.36.md`
- `docs/유저flow맵-v1.3.34.md`
- `docs/db설계-v1.3.34.md`
- `docs/api문서-v1.2.39.md`

## Plan Authority

- primary tracked plan: `docs/workpacks/planner-shell/evidence/cooking-meal-log-and-product-search-master-plan-20260722.md`
- primary tracked bytes: SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d`, 1,018 lines
- SHA-256 `45f02013fbc1c3af1936d596605230d0cbac7839a783224aa9535844e4bda7dc`, 1,056 lines is a historical local-first overlay only. 저장소 primary plan이나 현재 운영 authority가 아니다.
- current operations authority: `docs/engineering/supabase-local-only-operations.md`

## In Scope

- 화면: 기존 `PLANNER_WEEK`의 `과거 완제품 계획` read-only card, 같은 화면의 pinned detail, owner delete와 기존 `COOK_MODE`의 stored-version dispatch를 회귀 검증한다.
- API: 공식 API v1.2.39에 이미 있는 planner/product/v1 cooking/snapshot-v2 drain/food-products cursor 계약만 보존한다.
- 상태 전이: v1 optional-key phase, full-release no-key 0 뒤 required-key phase, stored `contract_version` dispatch, seeded v2 drain과 rollback을 검증한다.
- DB 영향: 기존 row, pinned version, idempotency ledger와 telemetry를 읽고 검증한다. 새 table/column/RPC/RLS/migration/direct DML은 없다.
- Schema Change:
  - [x] 없음. Stage 2 fixture mutation은 isolated-local create/reset에서만 허용하고 merged-exact target은 read-only다.

### Legacy product planner retention

- `GET /planner`의 additive legacy `product_entries`와 recipe-only `meals[]`는 서로 분리하며 한 row를 두 collection에 중복시키지 않는다.
- card/detail은 저장 당시 pinned product name, brand, quantity, nutrition version을 사용한다. product soft delete나 current version 변화가 과거 row를 repin하지 않는다.
- 기존 `DELETE /product-planner-entries/{entry_id}` owner delete만 UI mutation으로 사용한다. add/edit/copy/shop/cook/leftover/XP/status/meal-log migration action은 없다.
- 다른 owner의 row와 private telemetry는 존재를 노출하지 않는다. elapsed release는 auto-hide/auto-delete 근거가 아니다.

### Compatibility floor

- `GET /planner`, `GET /planner/nutrition`, product planner server compatibility contracts와 `/food-products` v1 cursor dual decode는 각자의 별도 approved tombstone 전까지 유지한다.
- v1 cursor로 시작한 page는 기존 의미로 끝까지 진행하고 새 first page만 v2 cursor를 발급할 수 있다.
- planner and standalone v1 clients 모두 기존 body/response와 generic `consumed_ingredient_ids` semantics를 보존한다.
- current and immediate-previous clients는 stored contract_version 값 `legacy_v1|snapshot_v2`만으로 dispatch한다. body shape 추론이나 parser 공유는 금지한다.

## Out of Scope

- legacy row, endpoint, parser, cursor decoder 또는 `GET /planner/nutrition`의 삭제/tombstone
- retention 기간, background auto-delete, migration, production cleanup job
- product planner add/edit/copy/shop/cook/leftover/XP/status/meal-log migration 또는 새 detail route
- snapshot-v2 creation, personal recipe write, capability, R/R+1/R+2 또는 activation
- PLANNER_WEEK, COOK_MODE, LEFTOVERS, HOME, MEAL_LOG composition 변경
- no new API, field, status, error, action, or screen; 새 migration/direct DML도 금지

## Dependencies

| 선행 슬라이스 | runtime dependency | broader lifecycle boundary |
| --- | --- | --- |
| #10 `planner-shell` | runtime dependency fulfilled: PR #1331 merge `2185b59d1b460dac916aa4a4a4a5e061c8b795f0`, Stage 4~6 merged-green | Manual/server-Mac/OAuth, device/AT, capability, R/R+1/R+2, production/activation pending |
| #12 `meal-log-ui` | runtime dependency fulfilled: PR #1361 merge `4264fe6bd5b3429029ba895a6b79cd32a5d3fa35`, runtime closeout merged-green | Manual/server-Mac/OAuth, device/AT/full WCAG, R/R+1/R+2, production/activation pending |
| #7 `recipe-content-snapshot-future-propagation` | stored-version dispatch and existing-v2 drain contract available | Manual/server-Mac/OAuth, #8 gate and R+2 activation pending |
| #11 `cooked-batch-weight-ui` | existing COOK_MODE/LEFTOVERS runtime and final authority evidence merged-green | actual-device/AT/full-WCAG, server-Mac/OAuth, R/R+1/R+2 activation pending |

#10/#12의 runtime dependency fulfilled 상태는 #13 Stage 2 진입을 막지 않는다. 그러나 위 broader Manual/activation pending 항목은 별도 evidence이며 #13 Stage 1이나 runtime 구현 완료로 승격하지 않는다. #14 `cooking-meal-log-cross-slice-release-qa`가 successor release QA를 소유한다.

## Backend First Contract

### Existing endpoints only

- `GET /planner`, `GET /planner/nutrition`, existing product-planner compatibility GET/POST/PATCH/delete contracts
- legacy v1 planner: `POST /cooking/sessions`, `GET /cooking/sessions/{id}/cook-mode`, `POST /cooking/sessions/{id}/complete`, `POST /cooking/sessions/{id}/cancel`
- legacy v1 standalone: `POST /cooking/standalone-complete`
- seeded snapshot-v2 drain: existing `GET/POST /cooking/session-attempts/{id}/cook-mode|cancel|complete`
- `/food-products` existing v1 cursor dual decode
- response wrapper는 `{ success, data, error }`, error는 `{ code, message, fields[] }`를 유지한다.

### Exact stable-key behavior

- malformed UUID key: 400 INVALID_IDEMPOTENCY_KEY mutation 0.
- same key + same canonical payload: 최초 durable status/data를 durable replay하며 additional mutation 0.
- same key + different canonical payload: 409 IDEMPOTENCY_KEY_REUSED mutation 0.
- optional phase의 missing key: pre-gate no-key v1 shape, response와 `consumed_ingredient_ids` semantics를 그대로 유지한다.
- 한 complete compatibility release에서 full-release no-key 0을 관측한 뒤에만 missing key는 428 IDEMPOTENCY_KEY_REQUIRED mutation 0이 된다.
- required-key 전환은 v1 route/body/parser 제거 승인이 아니다. strict removal은 new v1 start block, active v1 terminal 0, 별도 user-approved contract-evolution/tombstone가 모두 필요하다.
- 이 범위에서 사용하는 기존 public HTTP/error floor는 400의 malformed-key 계약과 401/403/404/409/422/428뿐이다. 그 밖의 새 error를 만들지 않는다.

### Stage 2 server barriers

- cursor barrier: v1 in-flight cursor 의미 보존과 새 first-page v2 issuance를 분리한다.
- idempotency barrier: planner and standalone에서 key/no-key/replay/mismatch/required 전환을 mutation count와 함께 검증한다.
- telemetry barrier: release ID, head SHA, observation window, current/immediate-previous client, active v1 terminal count, seeded-v2 drain/rollback을 함께 기록한다.
- telemetry unavailable, telemetry partial, telemetry stale, telemetry query-error 중 하나라도 있으면 tombstone/removal fail-closed with mutation/removal 0이다.

## Frontend Delivery Mode

- 새 화면이나 새 visual composition을 만들지 않고 기존 #10/#7/#11 surface를 소비한다.
- current/immediate-previous client 모두 optional stable key를 보내되 pre-gate no-key v1 response를 decode한다.
- 필수 상태는 `loading / empty / error / read-only / unauthorized`이며 legacy detail/delete에는 pending/error 상태를 별도로 둔다.
- delete pending 중 destructive action을 잠그고, 실패하면 pinned row/detail을 유지하며 오류를 표시한다.
- bottom sheet/dialog는 keyboard focus trap, Escape, invoker focus restore를 보존한다. 390px/320px/desktop에서 touch target, safe-area, virtual-keyboard occlusion과 horizontal overflow를 검증한다.
- 현재 UI에는 product POST/PATCH producer, `GET /planner/nutrition` call, auto-migration, current repin이 없다.

## Design Authority

- UI risk: `low-risk` regression on existing authorities
- Anchor screen dependency: `PLANNER_WEEK`, `COOK_MODE`, `LEFTOVERS`
- Visual artifact: existing predecessor evidence only; #13 creates no new design-generator/critic artifact
- Authority status: `not-required` (`authority_required=false`)
- Final references:
  - `ui/designs/authority/PLANNER_WEEK-authority.md`
  - `ui/designs/authority/recipe-content-snapshot-future-propagation-authority.md`
  - `docs/workpacks/cooked-batch-weight-ui/evidence/2026-08-10-final-authority-p2-repair-rereview.md`
- generic COOK_MODE precheck는 #13 final authority가 아니다. #11의 exact 2026-08-10 final-authority evidence를 사용한다.

## Design Status

- [ ] 임시 UI (temporary)
- [ ] 리뷰 대기 (pending-review)
- [x] 확정 (confirmed) — #10/#7/#11의 기존 final authority를 회귀 기준으로 소비
- [ ] N/A — BE-only

이 `confirmed`는 predecessor design evidence의 상태다. #13 runtime, Stage 5/6, Manual, Ready, merge, production 또는 activation을 승인하지 않는다.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/engineering/slice-workflow.md`
- `docs/engineering/agent-workflow-overview.md`
- `docs/engineering/qa-system.md`
- `docs/engineering/product-design-authority.md`
- `docs/engineering/workflow-v2/README.md`
- `docs/engineering/supabase-local-only-operations.md`
- primary tracked plan and three final authority references listed above

## QA / Test Data Plan

- owner A: legacy row와 pinned old version을 가진 owner fixture; current product version은 달라야 한다.
- owner B: 별도 legacy row와 pinned old version을 가지며 owner A read/delete/telemetry에서 nondisclosed여야 한다.
- v1 key/no-key/replay/mismatch fixture: malformed key, same-key same-payload replay, same-key different-payload mismatch와 missing-key phase 전환을 planner/standalone 모두 검증한다.
- current and immediate-previous clients fixture: 동일 stored `contract_version`을 명시적으로 dispatch하고 body-shape fallback을 금지한다.
- seeded v2 read/cancel/complete and rollback fixture: creation flag-off에서도 existing attempt drain을 보존하고 rollback이 신규 write만 닫는지 검증한다.
- v1 cursor와 telemetry outage fixture: in-flight v1 page와 unavailable/partial/stale/query-error를 각각 재현한다.
- mutation-capable fixture는 pinned isolated stack의 isolated-local create/reset에서만 생성/초기화한다.
- merged-exact read-only inventory는 controlled full-local target에서 row/endpoint/caller/cursor/telemetry 존재만 읽고 mutation/reset을 수행하지 않는다.
- remote Supabase/Vercel/production/server-Mac/OAuth/capability/activation write는 이 workpack의 자동화 대상이 아니다.

## Key Rules

- server가 owner, pinned version, stored contract version, canonical payload, idempotency replay, terminal state와 telemetry freshness의 authority다.
- v1과 v2 ID는 각 version route로만 처리하며 cross-version ID는 기존 404/409를 반환하고 parser fallback을 하지 않는다.
- telemetry 0과 elapsed release는 evidence일 뿐 deletion authority가 아니다.
- tombstone/removal은 새 explicit user approval, official contract-evolution, retention/privacy, rollback/recovery와 독립 security/compatibility review가 있어야 한다.
- Stage 1 implementation/evaluation은 `not_started`, verification은 `pending`, auto-merge는 `false`다.

## Primary User Path

1. 사용자가 기존 `PLANNER_WEEK` 날짜에서 legacy product card를 read-only로 본다.
2. 같은 화면의 detail에서 pinned old version을 확인하고, 원하면 기존 owner delete를 confirmation 후 실행한다.
3. current/immediate-previous cooking client는 stored version에 맞는 v1 또는 seeded-v2 reader를 사용한다.
4. verifier는 key/no-key/replay/mismatch, seeded drain/rollback, cursor와 telemetry freshness를 확인하고 불완전하면 removal을 fail closed한다.

## Stage 1 Current Gate

- 현재 author task는 exact-six docs와 semantic relock test, SOT/workflow/workpack/automation/OMO validators, lint, typecheck, high audit, diff/branch/commit policy만 검증한다.
- implementation, component/integration/E2E/browser, telemetry observation, isolated-local mutation, merged-exact inventory, Manual/device/server evidence는 아직 실행하지 않는다.
- fresh independent internal 1.5와 이후 security/compatibility, five-axis, Stage 3/5/6 review는 별도 task가 소유한다. 이 author task는 자기 변경을 승인하지 않는다.

## Delivery Checklist

- [x] Stage 1 exact-six docs and semantic relock test authored <!-- omo:id=delivery-legacy-compat-stage1-docs;stage=2;scope=shared;review=3,6 -->
- [ ] Stage 2 v1 cursor compatibility barrier implemented and tested <!-- omo:id=delivery-legacy-compat-stage2-cursor;stage=2;scope=backend;review=3,6 -->
- [ ] Stage 2 planner/standalone idempotency phases and mutation-zero cases implemented and tested <!-- omo:id=delivery-legacy-compat-stage2-idempotency;stage=2;scope=backend;review=3,6 -->
- [ ] Stage 2 telemetry freshness and fail-closed tombstone/removal barrier implemented and tested <!-- omo:id=delivery-legacy-compat-stage2-telemetry-barrier;stage=2;scope=backend;review=3,6 -->
- [ ] Stage 2 owner/pinned-version and isolated-local fixture boundaries verified <!-- omo:id=delivery-legacy-compat-stage2-owner-fixtures;stage=2;scope=shared;review=3,6 -->
- [ ] Stage 4 current/immediate-previous clients send optional key and preserve pre-gate no-key decode <!-- omo:id=delivery-legacy-compat-stage4-optional-key;stage=4;scope=frontend;review=5,6 -->
- [ ] Stage 4 loading/empty/error/read-only/unauthorized and version-dispatch states verified <!-- omo:id=delivery-legacy-compat-stage4-states;stage=4;scope=frontend;review=5,6 -->
- [ ] Stage 4 owner delete pending/error retention and no extra product action verified <!-- omo:id=delivery-legacy-compat-stage4-delete;stage=4;scope=frontend;review=5,6 -->
- [ ] Stage 4 focus/Escape/restore and 390px/320px/desktop responsive evidence verified <!-- omo:id=delivery-legacy-compat-stage4-focus-responsive;stage=4;scope=frontend;review=5,6 -->

Stage 1 review bookkeeping is prose/evaluator handoff, not a Stage 2-owned checklist item. Runtime review checkboxes begin only with the Stage 2 and Stage 4 implementation ownership shown above.
