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
- [ ] planner and standalone pre-gate no-key v1 shape와 generic `consumed_ingredient_ids`를 보존한다 <!-- omo:id=accept-legacy-compat-no-key-server;stage=2;scope=backend;review=3,6 -->
- [ ] full-release no-key 0 뒤에만 missing key가 428 IDEMPOTENCY_KEY_REQUIRED mutation 0으로 바뀐다 <!-- omo:id=accept-legacy-compat-required-key-server;stage=2;scope=backend;review=3,6 -->
- [ ] elapsed release나 telemetry 0만으로 row/endpoint/parser/cursor를 숨기거나 제거하지 않는다 <!-- omo:id=accept-legacy-compat-no-expiry;stage=2;scope=shared;review=3,6 -->
- [ ] v1 route/body/parser removal은 new-start block, active terminal 0과 별도 approved contract-evolution/tombstone를 요구한다 <!-- omo:id=accept-legacy-compat-removal-prerequisites;stage=2;scope=shared;review=3,6 -->

## Error / Permission

- [ ] malformed UUID key는 400 INVALID_IDEMPOTENCY_KEY mutation 0이다 <!-- omo:id=accept-legacy-compat-invalid-key;stage=2;scope=backend;review=3,6 -->
- [ ] same key + same canonical payload는 durable replay이며 additional mutation 0이다 <!-- omo:id=accept-legacy-compat-idempotent-replay;stage=2;scope=backend;review=3,6 -->
- [ ] same key + different canonical payload는 409 IDEMPOTENCY_KEY_REUSED mutation 0이다 <!-- omo:id=accept-legacy-compat-key-mismatch;stage=2;scope=backend;review=3,6 -->
- [ ] 기존 401/403/404/409/422/428과 malformed-key 400 외 새 public status/error를 만들지 않는다 <!-- omo:id=accept-legacy-compat-existing-errors-only;stage=2;scope=shared;review=3,6 -->
- [ ] other-owner row/private telemetry는 nondisclosed이고 mutation 0이다 <!-- omo:id=accept-legacy-compat-owner-boundary;stage=2;scope=backend;review=3,6 -->
- [ ] client에 loading/empty/error/read-only/unauthorized 상태가 각각 존재한다 <!-- omo:id=accept-legacy-compat-client-states;stage=4;scope=frontend;review=5,6 -->
- [ ] delete pending은 중복 destructive action을 막고 error는 pinned row/detail을 유지한다 <!-- omo:id=accept-legacy-compat-delete-recovery;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [ ] legacy product identity/name/brand/quantity/nutrition version은 pinned old version이며 current repin이 없다 <!-- omo:id=accept-legacy-compat-pinned-version;stage=2;scope=shared;review=3,6 -->
- [ ] `GET /planner` product entry와 recipe meal은 중복되지 않는다 <!-- omo:id=accept-legacy-compat-planner-separation;stage=2;scope=backend;review=3,6 -->
- [ ] body-shape inference/parser sharing 없이 stored contract version과 route predicate를 사용한다 <!-- omo:id=accept-legacy-compat-version-server;stage=2;scope=backend;review=3,6 -->
- [ ] telemetry unavailable, telemetry partial, telemetry stale, telemetry query-error는 모두 tombstone/removal fail-closed with mutation/removal 0이다 <!-- omo:id=accept-legacy-compat-telemetry-fail-closed;stage=2;scope=backend;review=3,6 -->
- [ ] no new API, field, status, error, action, or screen이며 migration/RPC/RLS/direct DML도 추가하지 않는다 <!-- omo:id=accept-legacy-compat-no-invention;stage=2;scope=shared;review=3,6 -->

## Data Setup / Preconditions

- [ ] owner A legacy row + pinned old version과 owner B legacy row + pinned old version fixture가 분리된다 <!-- omo:id=accept-legacy-compat-owner-fixtures;stage=2;scope=shared;review=3,6 -->
- [ ] v1 key/no-key/replay/mismatch fixture가 planner and standalone을 모두 포함한다 <!-- omo:id=accept-legacy-compat-key-fixtures;stage=2;scope=backend;review=3,6 -->
- [ ] current and immediate-previous clients fixture가 동일 stored version을 명시적으로 dispatch한다 <!-- omo:id=accept-legacy-compat-client-fixtures;stage=4;scope=frontend;review=5,6 -->
- [ ] seeded v2 read/cancel/complete and rollback fixture가 신규 write 0과 existing drain을 구분한다 <!-- omo:id=accept-legacy-compat-v2-fixtures;stage=2;scope=shared;review=3,6 -->
- [ ] v1 cursor와 telemetry outage fixture가 unavailable/partial/stale/query-error를 각각 재현한다 <!-- omo:id=accept-legacy-compat-telemetry-fixtures;stage=2;scope=backend;review=3,6 -->
- [ ] mutation fixture는 isolated-local create/reset에서만 만들고 controlled full-local은 merged-exact read-only inventory로 제한한다 <!-- omo:id=accept-legacy-compat-local-only-fixtures;stage=2;scope=shared;review=3,6 -->
- [ ] #10 PR #1331 merge `2185b59d1b460dac916aa4a4a4a5e061c8b795f0`와 #12 PR #1361 merge `4264fe6bd5b3429029ba895a6b79cd32a5d3fa35`의 runtime dependency fulfilled 상태를 입력으로 사용한다 <!-- omo:id=accept-legacy-compat-runtime-predecessors;stage=2;scope=shared;review=3,6 -->

## Manual QA

- verifier: Stage 2/4 author와 다른 fresh Codex reviewer 및 후속 Manual verifier
- environment: current/immediate-previous clients, owner A/B, seeded v2, 390px/320px/desktop, pinned isolated local, controlled merged-exact read-only local target
- scenarios: legacy read/detail/delete, optional/no-key/replay/mismatch/428, stored-version dispatch, seeded drain/rollback, v1 cursor, telemetry outage
- boundary: Manual/server-Mac/OAuth/device/AT/full WCAG, capability, R/R+1/R+2, production/activation은 pending이다.

## Automation Split

### Vitest / Stage 2

- [ ] server tests가 cursor/idempotency/telemetry barrier와 mutation/removal 0을 deterministic하게 잠근다 <!-- omo:id=accept-legacy-compat-vitest-server;stage=2;scope=backend;review=3,6 -->
- [ ] isolated-local fixtures와 merged-exact read-only inventory의 쓰기 경계가 분리된다 <!-- omo:id=accept-legacy-compat-local-smoke-split;stage=2;scope=shared;review=3,6 -->

### Vitest and Playwright / Stage 4

- [ ] optional-key client와 pre-gate no-key decode, current/immediate-previous dispatch를 component test가 잠근다 <!-- omo:id=accept-legacy-compat-component-client;stage=4;scope=frontend;review=5,6 -->
- [ ] read/detail/delete, loading/empty/error/read-only/unauthorized를 browser test가 잠근다 <!-- omo:id=accept-legacy-compat-playwright-states;stage=4;scope=frontend;review=5,6 -->
- [ ] delete confirmation, keyboard focus trap, Escape, focus restore, 390px/320px/desktop responsive/overflow를 browser evidence가 잠근다 <!-- omo:id=accept-legacy-compat-playwright-focus;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [ ] physical keyboard, VoiceOver/TalkBack, real device safe-area/virtual-keyboard와 full WCAG evidence
- [ ] server-Mac/OAuth와 merged-exact server-production/local-rehearsal의 승인된 실행
- [ ] capability, R/R+1/R+2, production/activation 결정과 실행
- [ ] destructive tombstone/removal을 위한 새 explicit user approval, official contract-evolution, retention/privacy, rollback/recovery evidence

Stage 1 독립 review bookkeeping은 이 acceptance의 Stage 2 checkbox가 아니다. fresh internal 1.5와 후속 review 결과는 evaluator handoff에서 별도로 기록하며 author는 자기 변경을 승인하지 않는다.
