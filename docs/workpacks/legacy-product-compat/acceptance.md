# Acceptance Checklist

> 이 Stage 1 relock은 공식 tuple `v1.7.32 / v1.5.36 / v1.3.34 / DB v1.3.34 / API v1.2.39`와 primary tracked plan SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d` (1,018 lines)를 잠근다. `45f02013fbc1c3af1936d596605230d0cbac7839a783224aa9535844e4bda7dc` (1,056 lines)는 historical local-first overlay only이며, current operations authority는 `docs/engineering/supabase-local-only-operations.md`다.

> 체크는 해당 Stage의 실제 자동화/evidence가 생긴 뒤에만 한다. 현재 implementation/evaluation은 `not_started`, verification은 `pending`, auto-merge는 `false`이며 Manual/activation/tombstone authority는 없다.

## Happy Path

- [ ] owner A의 legacy row가 recipe meal과 분리되어 read-only card로 보이고 pinned old version detail을 유지한다 <!-- omo:id=accept-legacy-compat-planner-read;stage=4;scope=frontend;review=5,6 -->
- [ ] 같은 화면의 existing owner delete만 동작하고 성공 시 row가 제거된다 <!-- omo:id=accept-legacy-compat-owner-delete;stage=4;scope=frontend;review=5,6 -->
- [ ] planner and standalone current/immediate-previous clients가 stored `contract_version`으로 v1 또는 seeded v2 reader를 선택한다 <!-- omo:id=accept-legacy-compat-version-dispatch;stage=4;scope=frontend;review=5,6 -->
- [ ] seeded v2 read/cancel/complete and rollback drain이 creation flag-off에서도 보존된다 <!-- omo:id=accept-legacy-compat-seeded-v2-client-drain;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [ ] v1 cursor page는 기존 의미로 완료되고 새 first page만 v2 cursor를 발급할 수 있다 <!-- omo:id=accept-legacy-compat-cursor-server;stage=2;scope=backend;review=3,6 -->
- [ ] planner and standalone에서 `pre-gate missing Idempotency-Key remains compatible success with the existing v1 response shape`이며 generic `consumed_ingredient_ids`를 보존한다 <!-- omo:id=accept-legacy-compat-no-key-server;stage=2;scope=backend;review=3,6 -->
- [ ] `only after exact required-key activation following full-release no-key 0 may missing Idempotency-Key return 428 IDEMPOTENCY_KEY_REQUIRED mutation 0`이다 <!-- omo:id=accept-legacy-compat-required-key-server;stage=2;scope=backend;review=3,6 -->
- [ ] elapsed release나 telemetry 0만으로 row/endpoint/parser/cursor를 숨기거나 제거하지 않는다 <!-- omo:id=accept-legacy-compat-no-expiry;stage=2;scope=shared;review=3,6 -->
- [ ] v1 route/body/parser removal은 new-start block, active terminal 0과 별도 approved contract-evolution/tombstone를 요구한다 <!-- omo:id=accept-legacy-compat-removal-prerequisites;stage=2;scope=shared;review=3,6 -->

## Error / Permission

- [ ] malformed UUID key는 400 INVALID_IDEMPOTENCY_KEY mutation 0이다 <!-- omo:id=accept-legacy-compat-invalid-key;stage=2;scope=backend;review=3,6 -->
- [ ] same key + same canonical payload는 durable replay이며 additional mutation 0이다 <!-- omo:id=accept-legacy-compat-idempotent-replay;stage=2;scope=backend;review=3,6 -->
- [ ] same key + different canonical payload는 409 IDEMPOTENCY_KEY_REUSED mutation 0이다 <!-- omo:id=accept-legacy-compat-key-mismatch;stage=2;scope=backend;review=3,6 -->
- [ ] narrow additive migration의 scoped `SECURITY DEFINER` RPC가 exact identity signature `public.complete_cooking_session(uuid, timestamptz, text, integer, timestamptz, uuid, uuid[], uuid, timestamptz)`와 `public.complete_standalone_cooking(uuid, timestamptz, text, integer, timestamptz, uuid, integer, uuid[], uuid, timestamptz)`로만 존재한다. `header/body/canonical payload and server-verified session/lifecycle authority before ensurePublicUserRow, ensureUserBootstrapState, ledger, completion, progress or any writer`이며 route-level bootstrap writers are removed from planner and standalone completion paths. 필요 시 route preflight는 read-only이고 RPC 안에서 재검증한다. server-verified JWT sub/session_id/iat, auth identity epoch와 active expected account generation을 `public.assert_recipe_future_session_authority`로 같은 transaction에 재검증하고 caller owner/generation만 신뢰하지 않는다. 모든 rejectable authority/idempotency/version check 뒤 한 DB RPC가 bootstrap + claim -> legacy completion -> cooking_completed user_progress_events + user_progress_summary -> durable finish를 처리하고 best-effort post-RPC progress writer is removed다. DB transaction atomicity only covers claim/bootstrap/completion/progress/finish이며 existing planner and standalone public endpoint/body/response는 유지한다 <!-- omo:id=accept-legacy-compat-atomic-v1-rpc;stage=2;scope=backend;review=3,6 -->
- [ ] 두 exact RPC의 Stage 2 declared metadata/ACL implementation은 `control_class=application-controlled; effect=mutation; exposure=service-internal; allowed_principals=service_role; owner=postgres`, `SECURITY DEFINER`, `auth.role() = service_role`, safe `pg_catalog, public, private, pg_temp`다. 새 RPC 생성 시 `REVOKE ALL FROM PUBLIC, anon, authenticated` 후 `GRANT EXECUTE only to service_role`; generic ledger direct table access, app-memory receipt, route-level claim followed by a separate legacy RPC, RLS relaxation은 forbidden이며 service-role direct DML is forbidden이다. deployed callable inventory evidence는 Manual Only다 <!-- omo:id=accept-legacy-compat-rpc-boundary;stage=2;scope=backend;review=3,6 -->
- [ ] `Stage 2 non-manual owns additive scoped RPC/core + planner and standalone route implementation + isolated-local fixtures + activation-block guard`. additive DB phase creates new scoped RPC/core while old overload remains only for existing optional-key/no-key compatibility. old overload `public.complete_cooking_session(uuid, uuid, uuid[])`와 `public.complete_standalone_cooking(uuid, uuid, integer, uuid[])`는 Manual cutover 전 optional-key/no-key compatibility를 위해 남고, activation-block guard는 external smoke가 완료되기 전 required-key activation을 막는다 <!-- omo:id=accept-legacy-compat-legacy-overload-cutover;stage=2;scope=backend;review=3,6 -->
- [ ] public fields[]/status mapping은 existing `400/401/403/404/409/422/428/503 error floor`만 사용한다. malformed Idempotency-Key -> 400 INVALID_IDEMPOTENCY_KEY fields[]=[Idempotency-Key:invalid_uuid] mutation 0; `pre-gate missing Idempotency-Key remains compatible success with the existing v1 response shape`; `only after exact required-key activation following full-release no-key 0 may missing Idempotency-Key return 428 IDEMPOTENCY_KEY_REQUIRED mutation 0`이고 그때 fields[]=[Idempotency-Key:required]다. reused Idempotency-Key -> 409 IDEMPOTENCY_KEY_REUSED fields=[] mutation 0; stale session/account generation -> 409 ACCOUNT_SESSION_STALE|ACCOUNT_GENERATION_STALE fields=[] mutation 0. `POST /cooking/sessions/{id}/complete`와 `POST /cooking/standalone-complete`는 `{"success":false,"data":null,"error":{"code":"ACCOUNT_LIFECYCLE_MAINTENANCE","message":"계정 정비 작업 중이에요. 잠시 후 다시 시도해 주세요.","fields":[]}}` (503), `{"success":false,"data":null,"error":{"code":"ACCOUNT_CUTOVER_QUARANTINED","message":"계정 복구가 필요해요.","fields":[]}}` (409), `{"success":false,"data":null,"error":{"code":"ACCOUNT_DELETING","message":"계정 삭제가 진행 중이에요.","fields":[]}}` (409)를 exact wrapper로 반환하고 all three lifecycle outcomes have mutation 0이다. 이는 official API v1.2.39 cross-slice contract; not a public contract change다. malformed body는 422 `VALIDATION_ERROR fields[]`, unauthenticated는 401 `UNAUTHORIZED fields=[]`이며 새 public status/error/field는 만들지 않는다 <!-- omo:id=accept-legacy-compat-existing-errors-only;stage=2;scope=shared;review=3,6 -->
- [ ] `stored contract_version=legacy_v1`만 complete한다. snapshot_v2 session ID -> 404 RESOURCE_NOT_FOUND fields=[] mutation 0; legacy cooking other-owner keeps 403 FORBIDDEN fields=[]; planner product other-owner keeps documented scope-filtered 404 RESOURCE_NOT_FOUND fields=[]이며 legacy cooking에 404를 새로 발명하지 않는다 <!-- omo:id=accept-legacy-compat-owner-boundary;stage=2;scope=backend;review=3,6 -->
- [ ] client에 loading/empty/error/read-only/unauthorized 상태가 각각 존재한다 <!-- omo:id=accept-legacy-compat-client-states;stage=4;scope=frontend;review=5,6 -->
- [ ] delete pending은 중복 destructive action을 막고 error는 pinned row/detail을 유지한다 <!-- omo:id=accept-legacy-compat-delete-recovery;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [ ] legacy product identity/name/brand/quantity/nutrition version은 pinned old version이며 current repin이 없다 <!-- omo:id=accept-legacy-compat-pinned-version;stage=2;scope=shared;review=3,6 -->
- [ ] `GET /planner` product entry와 recipe meal은 중복되지 않는다 <!-- omo:id=accept-legacy-compat-planner-separation;stage=2;scope=backend;review=3,6 -->
- [ ] body-shape inference/parser sharing 없이 stored contract version과 route predicate를 사용한다 <!-- omo:id=accept-legacy-compat-version-server;stage=2;scope=backend;review=3,6 -->
- [ ] strict stored-version legacy_v1 guard와 other-owner nondisclosure를 RPC 안에서 재검증하고 existing v2 drain/rollback은 기존 namespace에서 유지한다 <!-- omo:id=accept-legacy-compat-strict-v1-and-v2-drain;stage=2;scope=backend;review=3,6 -->
- [ ] telemetry unavailable, telemetry partial, telemetry stale, telemetry query-error는 모두 tombstone/removal fail-closed with mutation/removal 0이다 <!-- omo:id=accept-legacy-compat-telemetry-fail-closed;stage=2;scope=backend;review=3,6 -->
- [ ] no new API, field, status, error, action, or screen 및 no new table or column을 유지한다. narrow additive migration의 scoped `SECURITY DEFINER` RPC 외 generic RPC/RLS/direct DML은 추가하지 않는다 <!-- omo:id=accept-legacy-compat-no-invention;stage=2;scope=shared;review=3,6 -->

## Data Setup / Preconditions

- exact isolated-local reset baseline: `pnpm verify:local-supabase-runtime:isolated` → `scripts/run-isolated-local-supabase-runtime-gate.mjs`가 임시 Supabase project에 migration + `supabase/seed.sql`을 적용하고 owned resource를 정리한다.
- existing owner fixture baseline: `pnpm test:prepared-food-planner-entry:postgres` → `tests/prepared-food-planner-entry-postgres.integration.test.ts` + `tests/fixtures/prepared-food-planner-entry-postgres-harness.ts`를 사용한다.
- bootstrap owning flow: authenticated route의 `lib/server/user-bootstrap.ts` `ensureUserBootstrapState`와 full-local OAuth callback RPC `bootstrap_legacy_auth_callback_identity` (`supabase/migrations/20260730140000_hybrid_internal_operations_facades.sql`)가 owner별 `meal_plan_columns` 기본 3개를 만든다.
- owner readiness: owner A/B의 `public.users`와 `meal_plan_columns.user_id`가 각 auth owner와 일치하고, product planner entry가 참조하는 column도 request owner와 owner match여야 한다. other-owner column은 기존 403/nondisclosure 계약을 유지한다.
- #13 전용 Stage 2 test target 4개와 exact compatibility matrix fixture 중 하나라도 없으면 `fixture absent blocks Stage 2`다. 기존 prepared-food fixture는 bootstrap/owner baseline이지 v1 key/cursor/telemetry 완료 evidence가 아니다.
- exact matrix는 planner/standalone 각각의 concurrent same-key replay, concurrent mismatch, no-key phase, rollback, owner A/B nondisclosure와 `MAINTENANCE/QUARANTINED/DELETING and malformed/reused/missing-after-full-release-no-key-0/version/owner rejection`을 포함한다. pre-gate missing key는 compatible success target으로 별도 검증한다. reject case마다 `checksum/delta 0 across users, recipe_books, meal_plan_columns, ledger, completion, progress events/summaries`를 확인한다. 모든 mutation fixture는 narrow migration을 적용한 isolated-local reset에서 시작한다.
- `pnpm local:reset:demo`는 운영 full-local target에서 금지한다. mutation fixture는 위 pinned isolated-local runner 또는 같은 소유권·cleanup을 증명한 후속 #13 isolated harness에서만 만든다.

- [ ] owner A legacy row + pinned old version과 owner B legacy row + pinned old version fixture가 분리된다 <!-- omo:id=accept-legacy-compat-owner-fixtures;stage=2;scope=shared;review=3,6 -->
- [ ] v1 key/no-key/replay/mismatch fixture가 planner and standalone을 모두 포함한다 <!-- omo:id=accept-legacy-compat-key-fixtures;stage=2;scope=backend;review=3,6 -->
- [ ] concurrent same-key와 concurrent mismatch fixture가 durable replay/409 및 DB-side mutation 0을 planner and standalone에 대해 각각 검증하고, concurrent/replay/mismatch/rollback mutation counters include user_progress_events and user_progress_summary다 <!-- omo:id=accept-legacy-compat-concurrent-key-fixtures;stage=2;scope=backend;review=3,6 -->
- [ ] no-key phase와 rollback fixture가 required-key 전환의 mutation 0, strict stored-version legacy_v1 guard, existing v2 drain을 분리해 검증한다 <!-- omo:id=accept-legacy-compat-no-key-rollback-fixtures;stage=2;scope=backend;review=3,6 -->
- [ ] current and immediate-previous clients fixture가 동일 stored version을 명시적으로 dispatch한다 <!-- omo:id=accept-legacy-compat-client-fixtures;stage=4;scope=frontend;review=5,6 -->
- [ ] seeded v2 read/cancel/complete and rollback fixture가 신규 write 0과 existing drain을 구분한다 <!-- omo:id=accept-legacy-compat-v2-fixtures;stage=2;scope=shared;review=3,6 -->
- [ ] v1 cursor와 telemetry outage fixture가 unavailable/partial/stale/query-error를 각각 재현한다 <!-- omo:id=accept-legacy-compat-telemetry-fixtures;stage=2;scope=backend;review=3,6 -->
- [ ] mutation fixture는 `pnpm verify:local-supabase-runtime:isolated` 소유의 isolated-local create/reset에서만 만들고 controlled full-local/current-head target 접근을 차단한다 <!-- omo:id=accept-legacy-compat-local-only-fixtures;stage=2;scope=shared;review=3,6 -->
- [ ] #10 PR #1331 merge `2185b59d1b460dac916aa4a4a4a5e061c8b795f0`와 #12 PR #1361 merge `4264fe6bd5b3429029ba895a6b79cd32a5d3fa35`의 runtime dependency fulfilled 상태를 입력으로 사용한다 <!-- omo:id=accept-legacy-compat-runtime-predecessors;stage=2;scope=shared;review=3,6 -->

## Manual QA

- verifier: Stage 2/4 author와 다른 fresh Codex reviewer 및 후속 Manual verifier
- environment: current/immediate-previous clients, owner A/B, seeded v2, 390px/320px/desktop, pinned isolated local, controlled merged-exact read-only local target
- scenarios: legacy read/detail/delete, optional/no-key/replay/mismatch/428, stored-version dispatch, seeded drain/rollback, v1 cursor, telemetry outage
- boundary: Manual/server-Mac/OAuth/device/AT/full WCAG, capability, R/R+1/R+2, production/activation은 pending이다.

## Automation Split

### Vitest / Stage 2

- [ ] server tests가 additive scoped RPC/core, planner/standalone route implementation, cursor/idempotency/telemetry barrier, isolated-local fixtures와 activation-block guard를 deterministic하게 잠근다. pre-gate missing-key compatible success와 post-activation missing-key 428을 분리하며, `MAINTENANCE/QUARANTINED/DELETING and malformed/reused/missing-after-full-release-no-key-0/version/owner rejection`의 `checksum/delta 0 across users, recipe_books, meal_plan_columns, ledger, completion, progress events/summaries`를 확인한다. Stage 2 automated target은 cutover external smoke를 실행하거나 activation 완료를 주장하지 않는다 <!-- omo:id=accept-legacy-compat-vitest-server;stage=2;scope=backend;review=3,6 -->
- [ ] isolated-local fixtures가 owned ephemeral stack만 사용하고 controlled full-local/current-head target에는 접근하지 않는다 <!-- omo:id=accept-legacy-compat-local-smoke-split;stage=2;scope=shared;review=3,6 -->

### Vitest and Playwright / Stage 4

- [ ] optional-key client와 pre-gate no-key decode, current/immediate-previous dispatch를 component test가 잠근다 <!-- omo:id=accept-legacy-compat-component-client;stage=4;scope=frontend;review=5,6 -->
- [ ] read/detail/delete, loading/empty/error/read-only/unauthorized를 browser test가 잠근다 <!-- omo:id=accept-legacy-compat-playwright-states;stage=4;scope=frontend;review=5,6 -->
- [ ] delete confirmation, keyboard focus trap, Escape, focus restore, 390px/320px/desktop responsive/overflow를 browser evidence가 잠근다 <!-- omo:id=accept-legacy-compat-playwright-focus;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [ ] physical keyboard, VoiceOver/TalkBack, real device safe-area/virtual-keyboard와 full WCAG evidence
- [ ] controlled full-local/current-head deploy와 old-server drain; `rollback before old-overload revoke keeps the maintenance/write fence closed`, `traffic resumes only after a last-known-safe route/RPC version satisfying session+lifecycle authority and mutation 0 is deployed/proven and old instances are drained`, `rollback never returns to bootstrap-before-authority or any optional-key writer ordering`을 증명한다
- [ ] maintenance/write fence 아래 old overload revoke/drop과 `REVOKE EXECUTE on both old exact signatures from PUBLIC, anon, authenticated, service_role`; `after old-overload revoke, rollback never restores legacy grants or bypass`를 증명한다
- [ ] callable inventory/negative privilege evidence: old exact signatures absent, new two exact signatures만 service_role execute, old authenticated self-call과 old overload replay/rollback mutation 0
- [ ] server-Mac/OAuth와 merged-exact server-production/local-rehearsal의 승인된 실행
- [ ] capability, R/R+1/R+2, production/activation 결정과 실행
- [ ] destructive tombstone/removal을 위한 새 explicit user approval, official contract-evolution, retention/privacy, rollback/recovery evidence

`required-key transition cannot activate until old overload revoke/drain evidence`. `all remote application/fence/activation remains Manual pending and is not executed by Stage2 automation`.

Stage 1 독립 review bookkeeping은 이 acceptance의 Stage 2 checkbox가 아니다. fresh internal 1.5와 후속 review 결과는 evaluator handoff에서 별도로 기록하며 author는 자기 변경을 승인하지 않는다.
