# legacy-product-compat

## Goal

기존 완제품 계획과 v1/v2 cooking reader를 파괴적 정리 없이 호환 가능하게 유지한다. legacy product row는 pinned 과거 값을 read-only로 읽고 사용자가 삭제할 수 있으며, v1 stable key와 dormant v2 drain은 관측 가능한 단계별 gate로만 전환한다. 한 release 경과나 telemetry 0만으로 endpoint, row, parser 또는 cursor decoder를 제거하지 않는다.

## Branches

- tracked/current Stage 1 relock: official remote branch `docs/legacy-product-compat-stage1-relock-20260815`
- predecessor author branch/SHA는 historical review evidence일 뿐 active projection으로 사용하지 않는다.
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
- 상태 전이: v1 optional-key phase, full-release no-key 0 telemetry 뒤 별도 승인된 exact required-key activation을 거친 required-key phase, stored `contract_version` dispatch, seeded v2 drain과 rollback을 검증한다.
- DB 영향: 기존 row, pinned version, idempotency ledger와 telemetry를 읽고 검증한다. Stage 2는 기존 공개 계약을 구현하는 narrow additive migration과 scoped `SECURITY DEFINER` RPC 보정만 허용한다. 새 table/column, public API, generic ledger table access, RLS 완화, service-role/direct DML은 허용하지 않는다.
- Schema Change:
  - [x] public schema change 없음. narrow additive migration은 기존 ledger와 legacy v1 mutation 경로의 scoped RPC만 create/replace할 수 있으며, no new table or column이다. Stage 2 fixture mutation은 isolated-local create/reset에서만 허용하고 merged-exact target은 read-only다.

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
- retention 기간, background auto-delete, generic schema expansion, production cleanup job
- product planner add/edit/copy/shop/cook/leftover/XP/status/meal-log migration 또는 새 detail route
- snapshot-v2 creation, personal recipe write, capability, R/R+1/R+2 또는 activation
- PLANNER_WEEK, COOK_MODE, LEFTOVERS, HOME, MEAL_LOG composition 변경
- no new API, field, status, error, action, or screen; 새 table/column, generic RPC, RLS 완화와 direct DML은 금지한다. 단, 기존 공개 계약을 수행하는 아래의 narrow additive migration과 scoped `SECURITY DEFINER` RPC 보정만 Stage 2 범위다.

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
- optional phase의 missing key: `pre-gate missing Idempotency-Key remains compatible success with the existing v1 response shape`이며 response와 `consumed_ingredient_ids` semantics를 그대로 유지한다.
- `full-release no-key 0 is telemetry evidence only; missing Idempotency-Key remains compatible success until a separately approved exact required-key activation`이다.
- 별도 승인된 exact gate 뒤에만 전환한다. 즉 `only after separately approved exact required-key activation following full-release no-key 0 may missing Idempotency-Key return 428 IDEMPOTENCY_KEY_REQUIRED mutation 0`이다.
- required-key 전환은 v1 route/body/parser 제거 승인이 아니다. strict removal은 new v1 start block, active v1 terminal 0, 별도 user-approved contract-evolution/tombstone가 모두 필요하다.
- 이 범위의 existing `400/401/403/404/409/422/428/503 error floor`는 공식 API v1.2.39의 cross-slice 오류를 그대로 소비한다. 이 보정은 `official API v1.2.39 cross-slice contract; not a public contract change`이며 그 밖의 새 error를 만들지 않는다.

### Narrow internal idempotency repair

- Stage 2는 narrow additive migration으로 no new table or column을 유지한 채, planner complete와 standalone complete의 기존 공개 경로를 위한 scoped `SECURITY DEFINER` RPC/core만 보정한다. existing planner and standalone public endpoint/body/response는 그대로 유지한다. 정확한 identity signature는 `public.complete_cooking_session(uuid, timestamptz, text, integer, timestamptz, uuid, uuid[], uuid, timestamptz)`와 `public.complete_standalone_cooking(uuid, timestamptz, text, integer, timestamptz, uuid, integer, uuid[], uuid, timestamptz)`다. 전자는 `(p_owner_uuid, p_auth_identity_created_at_snapshot, p_session_key_hash, p_hmac_key_version, p_session_issued_at, p_session_id, p_consumed_ingredient_ids, p_idempotency_key, p_now)`, 후자는 같은 authority prefix 뒤 `(p_recipe_id, p_cooking_servings, p_consumed_ingredient_ids, p_idempotency_key, p_now)`만 받는다. `p_now`는 DB default이며 public request가 owner, generation, time authority를 주입하는 경로는 없다.
- Mutation 0 ordering: `header/body/canonical payload and server-verified session/lifecycle authority before ensurePublicUserRow, ensureUserBootstrapState, ledger, completion, progress or any writer`가 planner/standalone 모두에 적용된다. route-level bootstrap writers are removed from planner and standalone completion paths. route의 authority preflight가 꼭 필요하면 read-only여야 하고 RPC 안에서 다시 검증해 TOCTOU를 막는다. 두 RPC는 `auth.role() = service_role`인 server-only call만 허용하고, `public.assert_recipe_future_session_authority`에 쓸 server-verified JWT sub/session_id/iat evidence를 내부 client에서 전달한다. 함수는 이 evidence와 auth identity epoch, active expected account generation을 같은 DB transaction에서 재검증하고 generation을 결과에서만 취한다. owner + account generation + stored legacy_v1 predicate는 caller owner/generation만으로 신뢰하지 않으며, request JWT/role·session binding 또는 `iat`가 stale/revoked/mismatched이면 claim 전 write 0이다.
- One DB atomic RPC performs every rejectable authority/idempotency/version check first, then bootstrap + completion + progress + durable finish. DB transaction atomicity only covers claim/bootstrap/completion/progress/finish; route deploy, old-server drain, fence, grant revoke/drop은 이 DB transaction의 일부가 아니며 같은 cross-system transaction이라고 주장하지 않는다.
- Stage 2 fixture는 `MAINTENANCE/QUARANTINED/DELETING and malformed/reused/missing-post-exact-required-key-activation-following-full-release-no-key-0/version/owner rejection`마다 `checksum/delta 0 across users, recipe_books, meal_plan_columns, ledger, completion, progress events/summaries`를 planner와 standalone에 각각 확인한다. full-release no-key 0만 관측된 중간 상태와 pre-gate missing key는 거부 집계에 넣지 않고 compatible success로 별도 검증한다. `users`/recipe books/meal columns bootstrap writer를 포함해 reject 전에 어떤 writer도 실행하지 않음을 증명한다.
- Stage 2 non-manual ownership: `Stage 2 non-manual owns additive scoped RPC/core + planner and standalone route implementation + isolated-local fixtures + activation-block guard`. additive DB phase creates new scoped RPC/core while old overload remains only for existing optional-key/no-key compatibility. 해당 old overload는 `public.complete_cooking_session(uuid, uuid, uuid[])`와 `public.complete_standalone_cooking(uuid, uuid, integer, uuid[])`다. controlled full-local/current-head deploy, old-server drain, maintenance/write fence, old overload revoke/drop, callable inventory/negative privilege evidence, server-Mac/OAuth와 activation은 Manual Only다.
- Rollback boundary: `rollback before old-overload revoke keeps the maintenance/write fence closed`; `traffic resumes only after a last-known-safe route/RPC version satisfying session+lifecycle authority and mutation 0 is deployed/proven and old instances are drained`. `rollback never returns to bootstrap-before-authority or any optional-key writer ordering`. `after old-overload revoke, rollback never restores legacy grants or bypass`; legacy execute grant를 복원하지 않고 같은 fenced last-known-safe forward route/RPC만 사용한다. required-key transition cannot activate until old overload revoke/drain evidence. all remote application/fence/activation remains Manual pending and is not executed by Stage2 automation. 여기서 application deploy/fence/activation은 별도 운영 증거를 뜻하며 Supabase remote target은 `supabase-local-only-operations.md`에 따라 계속 forbidden이다.
- `cooking_sessions.contract_version`은 `legacy_v1`으로만 lock한다 (stored contract_version=legacy_v1). `snapshot_v2 session ID`는 legacy RPC가 claim/mutate/fallback하지 않고 mutation 0으로 거절한다. strict stored-version legacy_v1 guard와 legacy cooking other-owner `403 FORBIDDEN fields=[]`를 DB authority로 유지한다. planner product other-owner keeps documented scope-filtered 404 RESOURCE_NOT_FOUND fields=[]; 이는 product planner의 기존 nondisclosure boundary이며 legacy cooking에 새 404를 발명하는 근거가 아니다. existing v2 drain/rollback은 기존 v2 namespace와 계약으로 계속 동작한다.
- security-function inventory는 두 exact RPC 각각에 `control_class=application-controlled; effect=mutation; exposure=service-internal; allowed_principals=service_role; owner=postgres`를 기록한다. 모두 `SECURITY DEFINER`, safe search path `pg_catalog, public, private, pg_temp`, `auth.role() = service_role`와 session authority guard를 사용한다. `REVOKE ALL FROM PUBLIC, anon, authenticated` 뒤 `GRANT EXECUTE only to service_role`만 허용한다. 이 좁은 RPC execute는 service-role direct DML이 아니며 generic ledger direct table access is forbidden. service-role direct DML is forbidden. app-memory receipt is forbidden. route-level claim followed by a separate legacy RPC is forbidden. RLS relaxation is forbidden.
- transaction 순서는 canonical payload/key validation → authority + stored-version/owner lock → idempotency ledger claim/finish 경계 안의 claim -> legacy completion -> cooking_completed user_progress_events + user_progress_summary -> durable finish다. SQL writer는 `awardUserProgressEvent`와 동등한 `cooking_completed:{leftover_dish_id}` event/XP-policy/summary side effect를 남기고, event 또는 summary 실패 시 legacy completion과 claim/telemetry/finish까지 모두 rollback한다. route의 best-effort post-RPC progress writer is removed; 성공 response 뒤 별도 progress write 또는 soft-fail은 없다.
- callable inventory/negative privilege evidence는 Manual Only cutover 증거다. 새 두 signature의 service_role execute만 허용하고 old authenticated self-call is denied with mutation 0이어야 하며, PUBLIC/anon/authenticated/service_role의 old overload execute와 direct DML을 각각 거절하고 old direct-call/replay/rollback mutation 0을 남겨야 한다. Stage 2는 이를 실행 완료로 주장하지 않고 activation-block guard로 차단한다.
- exact error mapping은 public wrapper와 existing fields[]를 바꾸지 않는다: unauthenticated는 `401 UNAUTHORIZED fields=[]`; malformed Idempotency-Key -> 400 INVALID_IDEMPOTENCY_KEY fields[]=[Idempotency-Key:invalid_uuid] mutation 0; `pre-gate missing Idempotency-Key remains compatible success with the existing v1 response shape`; `full-release no-key 0 is telemetry evidence only; missing Idempotency-Key remains compatible success until a separately approved exact required-key activation`; `only after separately approved exact required-key activation following full-release no-key 0 may missing Idempotency-Key return 428 IDEMPOTENCY_KEY_REQUIRED mutation 0`, 그때 fields[]=[Idempotency-Key:required]다. reused Idempotency-Key -> 409 IDEMPOTENCY_KEY_REUSED fields=[] mutation 0. legacy planner의 missing 또는 snapshot_v2 session ID -> 404 RESOURCE_NOT_FOUND fields=[] mutation 0, legacy cooking other-owner keeps 403 FORBIDDEN fields=[], stale session/account generation -> 409 ACCOUNT_SESSION_STALE|ACCOUNT_GENERATION_STALE fields=[] mutation 0, malformed body는 existing `422 VALIDATION_ERROR` fields[]다. `POST /cooking/sessions/{id}/complete`와 `POST /cooking/standalone-complete`는 session authority에서 `{"success":false,"data":null,"error":{"code":"ACCOUNT_LIFECYCLE_MAINTENANCE","message":"계정 정비 작업 중이에요. 잠시 후 다시 시도해 주세요.","fields":[]}}` (503), `{"success":false,"data":null,"error":{"code":"ACCOUNT_CUTOVER_QUARANTINED","message":"계정 복구가 필요해요.","fields":[]}}` (409), `{"success":false,"data":null,"error":{"code":"ACCOUNT_DELETING","message":"계정 삭제가 진행 중이에요.","fields":[]}}` (409)만 반환한다. all three lifecycle outcomes have mutation 0; 이는 `public.assert_recipe_future_session_authority`와 existing account authority가 이미 고정한 공식 cross-slice 오류다. 이 경우 외 새 public status/code/field는 만들지 않는다.

### Stage 2 server barriers

- cursor barrier: v1 in-flight cursor 의미 보존과 새 first-page v2 issuance를 분리한다.
- idempotency barrier: planner and standalone에서 key/no-key/replay/mismatch/required 전환을 mutation count와 함께 검증한다. pre-gate와 full-release no-key 0 뒤 activation 전 missing-key compatibility success, post-exact-activation 428 mutation 0을 서로 다른 test target으로 둔다. concurrent same-key replay와 concurrent mismatch는 각각 최초 durable result 또는 409만 반환하며 DB-side mutation 0을 검증한다. concurrent/replay/mismatch/rollback mutation counters include user_progress_events and user_progress_summary as well as claim, legacy completion, durable receipt/finish; replay/rejection/rollback은 모두 progress event/summary mutation 0이다.
- activation-block barrier: Stage 2 자동 검증은 scoped RPC/core와 route가 rejectable check-before-writer ordering을 지키고 Manual cutover evidence 없이는 activation되지 않음을 고정한다. callable inventory와 negative privilege의 controlled full-local evidence는 Manual Only가 수집한다.
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

- [x] 임시 UI (temporary)
- [ ] 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed)
- [ ] N/A — BE-only

#10/#7/#11의 세 final authority reference는 predecessor evidence로만 유지한다. `authority_required=false`는 새 visual composition이 없는 #13 범위에 그대로 적용하지만, Stage 1의 현재 Design Status는 `temporary`이며 #13 runtime, Stage 5/6, Manual, Ready, merge, production 또는 activation을 승인하지 않는다.

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
- Stage 2 fixture는 concurrent same-key, concurrent mismatch, no-key phase와 rollback을 planner/standalone 각각에서 재현한다. pre-gate와 full-release no-key 0 뒤 activation 전 missing-key compatible success, post-exact-activation required-key 거부의 DB-side mutation 0을 별도 검증한다. owner A/B fixture는 strict stored-version legacy_v1 guard와 other-owner nondisclosure를 함께 검증한다.
- current and immediate-previous clients fixture: 동일 stored `contract_version`을 명시적으로 dispatch하고 body-shape fallback을 금지한다.
- seeded v2 read/cancel/complete and rollback fixture: creation flag-off에서도 existing attempt drain을 보존하고 rollback이 신규 write만 닫는지 검증한다.
- v1 cursor와 telemetry outage fixture: in-flight v1 page와 unavailable/partial/stale/query-error를 각각 재현한다.
- pinned isolated Supabase reset baseline은 `pnpm verify:local-supabase-runtime:isolated`가 소유하며 실제 runner는 `scripts/run-isolated-local-supabase-runtime-gate.mjs`다. 이 runner가 임시 project에서 전체 migration과 `supabase/seed.sql`을 `db reset --local --yes`로 적용하고 종료 시 owned resource를 정리한다.
- 기존 owner A/B product planner fixture baseline은 `pnpm test:prepared-food-planner-entry:postgres`와 `tests/prepared-food-planner-entry-postgres.integration.test.ts`, `tests/fixtures/prepared-food-planner-entry-postgres-harness.ts`다. #13 Stage 2는 이를 재사용하되 v1 key/cursor/telemetry matrix를 이 fixture가 이미 제공한다고 간주하지 않는다.
- bootstrap owning flow는 authenticated request의 `lib/server/user-bootstrap.ts` `ensureUserBootstrapState`와 full-local OAuth callback의 `bootstrap_legacy_auth_callback_identity` (`supabase/migrations/20260730140000_hybrid_internal_operations_facades.sql`)다. owner A/B 각각 `meal_plan_columns` 기본 3개가 자기 `user_id`로 준비되고 product planner column의 `user_id`가 요청 owner와 owner match인지 검증한다.
- mutation-capable fixture는 위 pinned isolated stack의 isolated-local create/reset에서만 생성/초기화한다. isolated-local reset은 narrow migration을 포함한 전체 migration replay 뒤에 실행하며, 운영 full-local target에서 `pnpm local:reset:demo`를 실행하지 않는다.
- Stage 2 전용 4개 test target 또는 owner A/B·key/no-key/replay/mismatch·seeded-v2·cursor·telemetry fixture가 없으면 `fixture absent blocks Stage 2`로 판정한다. 일반 demo seed나 predecessor fixture green으로 대체하지 않는다.
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
- independent design-impact review는 current Stage 1 gate다. predecessor task `01a00203-3c1d-78b3-ac78-fbb63b960c60`의 APPROVE 0/0/0은 historical evidence이며 successor exact commit은 fresh independent re-review가 필요하다.
- fresh independent internal 1.5와 이후 security/compatibility, five-axis, Stage 3/5/6 review는 별도 task가 소유한다. 이 author task는 자기 변경을 승인하지 않는다.

## Delivery Checklist

Stage 1 exact-six docs and semantic relock test authored 사실은 이 문단과 Stage 1 evidence에만 남긴다. Stage 2/4 runtime checklist metadata로 투영하지 않는다.

- [ ] Stage 2 v1 cursor compatibility barrier implemented and tested <!-- omo:id=delivery-legacy-compat-stage2-cursor;stage=2;scope=backend;review=3,6 -->
- [ ] Stage 2 planner/standalone idempotency phases and mutation-zero cases implemented and tested <!-- omo:id=delivery-legacy-compat-stage2-idempotency;stage=2;scope=backend;review=3,6 -->
- [ ] Stage 2 additive scoped RPC/core and planner/standalone route callers implemented with authority-before-writer ordering <!-- omo:id=delivery-legacy-compat-stage2-atomic-route;stage=2;scope=backend;review=3,6 -->
- [ ] Stage 2 activation-block guard prevents activation until separately owned Manual cutover evidence is complete <!-- omo:id=delivery-legacy-compat-stage2-activation-block;stage=2;scope=backend;review=3,6 -->
- [ ] Stage 2 telemetry freshness and fail-closed tombstone/removal barrier implemented and tested <!-- omo:id=delivery-legacy-compat-stage2-telemetry-barrier;stage=2;scope=backend;review=3,6 -->
- [ ] Stage 2 owner/pinned-version and isolated-local fixture boundaries verified <!-- omo:id=delivery-legacy-compat-stage2-owner-fixtures;stage=2;scope=shared;review=3,6 -->
- [ ] Stage 4 current/immediate-previous clients send optional key and preserve pre-gate no-key decode <!-- omo:id=delivery-legacy-compat-stage4-optional-key;stage=4;scope=frontend;review=5,6 -->
- [ ] Stage 4 loading/empty/error/read-only/unauthorized and version-dispatch states verified <!-- omo:id=delivery-legacy-compat-stage4-states;stage=4;scope=frontend;review=5,6 -->
- [ ] Stage 4 owner delete pending/error retention and no extra product action verified <!-- omo:id=delivery-legacy-compat-stage4-delete;stage=4;scope=frontend;review=5,6 -->
- [ ] Stage 4 focus/Escape/restore and 390px/320px/desktop responsive evidence verified <!-- omo:id=delivery-legacy-compat-stage4-focus-responsive;stage=4;scope=frontend;review=5,6 -->

Stage 1 review bookkeeping is prose/evaluator handoff, not a Stage 2-owned checklist item. Runtime review checkboxes begin only with the Stage 2 and Stage 4 implementation ownership shown above.
