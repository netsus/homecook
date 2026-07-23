# Acceptance Checklist: account-session-generation-foundation

> 이 문서는 F0 additive dark-ship의 living closeout이다. 체크는 실패 테스트의 RED, 구현, local/remote evidence, 독립 Codex review가 생긴 뒤에만 한다. Stage 1 author는 자기 문서를 승인하지 않으며 별도 Codex internal 1.5 reviewer가 5개 core artifact(README/acceptance/automation/work-item/status)와 2개 design gate artifact(wireframe/critique) 전체를 먼저 승인해야 한다.
>
> `Manual Only`를 제외한 모든 체크박스는 `omo` metadata를 유지한다. F0 완료는 production `generation_active` 전환이 아니라 `legacy` 안전 배포다. #3 joint activation 항목은 local deterministic harness로 검증하되 실제 production transition은 이 slice의 완료 신호로 요구하지 않는다.

## Happy Path

정상 경로는 `legacy` additive 배포와 기존 동작 보존, local cutover harness의 stage→digest→atomic promote, auth-present quarantine의 exact-session 복구/삭제, 그리고 merged exact SHA remote dark-ship 검증이다. 아래 세부 절이 각 경로의 상태·데이터·권한·UI 증거를 1:1로 잠근다.

## State / Policy

### Stage Boundary / Dark Ship

- [x] F0 migration과 Route/UI adapter는 additive이며 기존 migration을 수정하지 않는다 <!-- omo:id=accept-f0-additive-only;stage=2;scope=shared;review=3,6 -->
- [x] F0-only production capability는 정확히 `legacy`이고 revision/current attempt가 일관된다 <!-- omo:id=accept-f0-production-legacy;stage=2;scope=backend;review=3,6 -->
- [x] F0 deploy 전후 canonical `user_account_generation_watermarks`와 `user_account_lifecycles` count가 0이다 <!-- omo:id=accept-f0-canonical-zero;stage=2;scope=backend;review=3,6 -->
- [x] `legacy`에서 기존 signup/bootstrap/personal writer/delete response 의미가 유지된다 <!-- omo:id=accept-f0-legacy-compat;stage=2;scope=shared;review=3,6 -->
- [x] #3 joint gate 전 generation writer, canonical backfill, auth deletion consumer, direct DB/Storage grant revoke가 production에서 활성화되지 않는다 <!-- omo:id=accept-f0-no-joint-activation;stage=2;scope=shared;review=3,6 -->
- [x] F0와 #3의 서로 다른 authority가 한 request path에서 혼용되지 않는다 <!-- omo:id=accept-f0-single-authority;stage=2;scope=shared;review=3,6 -->

## Data Integrity

### Schema / Authority Tables

- [x] watermark는 owner별 append-only monotonic `last_account_generation > 0`이고 decrement/reuse/delete/FK cascade가 없다 <!-- omo:id=accept-f0-watermark-append-only;stage=2;scope=backend;review=3,6 -->
- [x] lifecycle은 `(owner_uuid, account_generation)`과 exact origin/status/identity-epoch/quarantine/delete durable fields를 갖고 owner당 active partial unique 1개를 강제한다 <!-- omo:id=accept-f0-lifecycle-shape;stage=2;scope=backend;review=3,6 -->
- [x] session binding은 raw JWT session ID 대신 versioned HMAC/key version/owner/generation/identity epoch를 저장하고 client direct read/write를 거부한다 <!-- omo:id=accept-f0-session-binding-shape;stage=2;scope=backend;review=3,6 -->
- [x] capability singleton은 정확히 1행이고 `legacy|cutover_maintenance|generation_active`, monotonic revision, nullable attempt ID만 protected transition이 변경한다 <!-- omo:id=accept-f0-capability-singleton;stage=2;scope=backend;review=3,6 -->
- [x] cutover attempt와 owner staging이 canonical lifecycle/watermark와 별도 table로 유지된다 <!-- omo:id=accept-f0-staging-separate;stage=2;scope=backend;review=3,6 -->
- [x] legacy delete receipt는 exact identity epoch/time/random receipt ID+hash를 append-only로 보존하고 client access/FK cascade가 없다 <!-- omo:id=accept-f0-legacy-receipt-shape;stage=2;scope=backend;review=3,6 -->
- [x] legacy external write attempt는 owner/path/token/state/120초 deadline/lease를 보존한다 <!-- omo:id=accept-f0-external-attempt-shape;stage=2;scope=backend;review=3,6 -->
- [x] auth identity outbox는 exact owner/generation/identity epoch, lease, retry/dead-letter와 `deleted|already_absent|identity_replaced` terminal을 구분한다 <!-- omo:id=accept-f0-auth-outbox-shape;stage=2;scope=backend;review=3,6 -->
- [x] lifecycle initiation/quarantine result와 watermark는 일반 idempotency cleanup이나 account cascade로 삭제되지 않는다 <!-- omo:id=accept-f0-permanent-security-tombstones;stage=2;scope=backend;review=3,6 -->

## Personal Writer / FK / Exposure Inventory

- [x] recipe·recipe book·save/like/follow·settings·meal column·progress/XP·pantry·Meal/planner·shopping·cooking·meal-log·batch·report의 existing/new mutation Route를 전수 inventory한다 <!-- omo:id=accept-f0-route-writer-inventory;stage=2;scope=backend;review=3,6 -->
- [x] application mutation RPC exact signature와 direct PostgREST INSERT/UPDATE/DELETE call site를 전수 inventory한다 <!-- omo:id=accept-f0-rpc-dml-inventory;stage=2;scope=backend;review=3,6 -->
- [x] authenticated Storage policy와 service-role external Storage write call site를 분리해 inventory한다 <!-- omo:id=accept-f0-storage-writer-inventory;stage=2;scope=backend;review=3,6 -->
- [x] local/remote `pg_constraint`에서 `auth.users(id)` inbound FK와 delete action을 모두 추출·분류한다 <!-- omo:id=accept-f0-auth-fk-inventory;stage=2;scope=backend;review=3,6 -->
- [x] inventory의 모든 writer가 owning Route/RPC/table/policy, guard mode, expected generation, activation phase와 1:1 대응한다 <!-- omo:id=accept-f0-inventory-coverage;stage=2;scope=backend;review=3,6 -->
- [x] 누락 writer/guard trigger/Storage predicate/service wrapper/미분류 RESTRICT FK가 있으면 validator와 release gate가 실패한다 <!-- omo:id=accept-f0-inventory-fail-closed;stage=2;scope=backend;review=3,6 -->
- [x] auth hook exact signature는 effect `auth-hook`, exposure `auth-hook-internal`, exact principal set으로 일반 service-only와 구분된다 <!-- omo:id=accept-f0-hook-inventory-class;stage=2;scope=backend;review=3,6 -->

## Shared / Exclusive Fence and Guards

- [x] mutation guard는 safe-path `VOLATILE SECURITY DEFINER`이며 shared advisory xact lock 뒤 capability `FOR KEY SHARE`를 읽는다 <!-- omo:id=accept-f0-mutation-guard-order;stage=2;scope=backend;review=3,6 -->
- [x] mutation guard와 Hook guard는 `READ COMMITTED` 외 isolation을 mutation 없이 거부한다 <!-- omo:id=accept-f0-isolation-fail-closed;stage=2;scope=backend;review=3,6 -->
- [x] existing/new RPC, direct DML BEFORE trigger, authenticated Storage predicate가 같은 capability/fence 계약을 사용한다 <!-- omo:id=accept-f0-guard-surface-parity;stage=2;scope=backend;review=3,6 -->
- [x] exclusive transition이 먼저 시작된 shared writer transaction의 commit/rollback을 기다린 뒤 state를 바꾼다 <!-- omo:id=accept-f0-exclusive-drain;stage=2;scope=backend;review=3,6 -->
- [x] maintenance commit 전에 query를 시작한 old MVCC statement가 이후 mutation을 commit하지 못한다 <!-- omo:id=accept-f0-old-snapshot-denied;stage=2;scope=backend;review=3,6 -->
- [x] service-role external write는 shared fence 아래 start row 없이는 실행되지 않고 maintenance 신규 start가 거부된다 <!-- omo:id=accept-f0-external-write-start-guard;stage=2;scope=backend;review=3,6 -->
- [x] 120초 deadline 이후 late success는 attach되지 않고 cleanup 대상으로만 전환된다 <!-- omo:id=accept-f0-external-write-late-cleanup;stage=2;scope=backend;review=3,6 -->

## Auth Before User Created Hook / ACL

- [x] exact Hook wrapper는 `SECURITY INVOKER`, internal guard만 dedicated NOLOGIN owner의 hardened `SECURITY DEFINER`다 <!-- omo:id=accept-f0-hook-wrapper-definer-split;stage=2;scope=backend;review=3,6 -->
- [x] Hook guard는 same-key shared advisory xact lock 뒤 capability plain SELECT를 사용하고 `FOR KEY SHARE`를 사용하지 않는다 <!-- omo:id=accept-f0-hook-plain-select-order;stage=2;scope=backend;review=3,6 -->
- [x] `supabase_auth_admin`의 wrapper/guard schema USAGE와 exact wrapper/guard EXECUTE가 true다 <!-- omo:id=accept-f0-hook-supabase-auth-admin-positive;stage=2;scope=backend;review=3,6 -->
- [x] `PUBLIC|anon|authenticated|service_role`의 wrapper/guard EXECUTE가 모두 false다 <!-- omo:id=accept-f0-hook-public-principals-negative;stage=2;scope=backend;review=3,6 -->
- [x] guard owner의 schema USAGE와 capability table SELECT만 true다 <!-- omo:id=accept-f0-hook-owner-select-only;stage=2;scope=backend;review=3,6 -->
- [x] guard owner의 table INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER와 모든 capability column UPDATE가 false다 <!-- omo:id=accept-f0-hook-owner-dml-negative;stage=2;scope=backend;review=3,6 -->
- [x] 비관리 역할의 transitive membership이 0이고 `PUBLIC|anon|authenticated|service_role|supabase_auth_admin`의 actual SET ROLE이 실패한다 <!-- omo:id=accept-f0-hook-owner-set-role-negative;stage=2;scope=backend;review=3,6 -->
- [x] 실제 `supabase_auth_admin` payload 호출이 local에서 legacy allow, maintenance deny, active allow를 보인다 <!-- omo:id=accept-f0-hook-three-state-smoke;stage=2;scope=backend;review=3,6 -->
- [x] pre-started Hook과 exclusive transition/final promote race가 same advisory key에서 직렬화된다 <!-- omo:id=accept-f0-hook-transition-race;stage=2;scope=backend;review=3,6 -->
- [x] Hook health/remote configuration/admin freeze/auth consumer-off evidence가 없으면 maintenance preflight가 실패한다 <!-- omo:id=accept-f0-hook-health-gate;stage=2;scope=backend;review=3,6 -->

## Cutover Staging / Quarantine / Promote / Abort

- [x] `auth∩public`은 active candidate로 분류되고 auth-only는 exact delete/recovery evidence에 따라 cleanup/active/quarantine으로 분리된다 <!-- omo:id=accept-f0-auth-public-intersection-classification;stage=2;scope=backend;review=3,6 -->
- [x] public-only와 identity 없는 personal owner는 exact cleanup evidence가 없으면 삭제하지 않고 G1 quarantine proposal로 남는다 <!-- omo:id=accept-f0-orphan-quarantine-preserved;stage=2;scope=backend;review=3,6 -->
- [x] 한 owner가 exact-one action을 가지며 evidence conflict/duplicate epoch/owner ambiguity만 `classification_unresolved`다 <!-- omo:id=accept-f0-classification-exact-one;stage=2;scope=backend;review=3,6 -->
- [x] quarantine row는 전체 activation을 막지 않지만 unresolved row는 한 건이라도 promote를 막는다 <!-- omo:id=accept-f0-quarantine-vs-unresolved;stage=2;scope=backend;review=3,6 -->
- [x] staging population과 proposed generation을 만들어도 canonical lifecycle/watermark는 0이다 <!-- omo:id=accept-f0-staging-canonical-zero;stage=2;scope=backend;review=3,6 -->
- [x] final promote는 exclusive fence와 `auth.users SHARE ROW EXCLUSIVE` lock 또는 검증된 provider barrier 아래 수행된다 <!-- omo:id=accept-f0-auth-barrier;stage=2;scope=backend;review=3,6 -->
- [x] ordered auth/public/personal count+digest/revision을 staging과 CAS하고 mismatch/lock timeout/권한 부족은 canonical mutation 0으로 abort한다 <!-- omo:id=accept-f0-authoritative-digest-cas;stage=2;scope=backend;review=3,6 -->
- [x] active/cleanup/quarantine lifecycle, watermark, outbox와 capability active가 한 transaction에서만 commit된다 <!-- omo:id=accept-f0-atomic-promote;stage=2;scope=backend;review=3,6 -->
- [x] promote 전 failure는 adapter/policy를 legacy로 복구하고 staging/external attempt를 purge하며 canonical 0을 확인한다 <!-- omo:id=accept-f0-abort-restores-legacy;stage=2;scope=backend;review=3,6 -->
- [x] abort 뒤 legacy signup/delete/write가 정상 동작하고 두 번째 cutover attempt가 처음부터 성공할 수 있다 <!-- omo:id=accept-f0-second-cutover-after-abort;stage=2;scope=backend;review=3,6 -->
- [x] promote 뒤 legacy bootstrap/delete/writer rollback attempt가 fail closed한다 <!-- omo:id=accept-f0-no-post-promote-legacy-rollback;stage=2;scope=backend;review=3,6 -->

## Session Generation / Bootstrap / Personal Mutation

- [x] bind RPC가 server-verified session/identity epoch/owner/expected generation을 고정하고 current identity와 다른 session을 거부한다 <!-- omo:id=accept-f0-bind-server-verified;stage=2;scope=backend;review=3,6 -->
- [x] active capability의 pre-cutover identity는 staged/promoted lifecycle 없이는 `ACCOUNT_CUTOVER_UNCLASSIFIED`로 bootstrap이 거부된다 <!-- omo:id=accept-f0-precutover-unclassified-denied;stage=2;scope=backend;review=3,6 -->
- [x] true post-cutover identity만 first generation을 만들고 동일 UUID 재가입은 prior cleanup 뒤 새 identity epoch+새 session만 watermark+1을 만든다 <!-- omo:id=accept-f0-new-identity-generation;stage=2;scope=backend;review=3,6 -->
- [x] delayed/refresh G1 session과 UUID-only/binding-less implicit bootstrap은 `ACCOUNT_SESSION_STALE`로 mutation 0이다 <!-- omo:id=accept-f0-stale-session-denied;stage=2;scope=backend;review=3,6 -->
- [x] concurrent double-bootstrap은 한 active generation만 만들고 같은 valid session replay는 같은 generation을 반환한다 <!-- omo:id=accept-f0-double-bootstrap-single-generation;stage=2;scope=backend;review=3,6 -->
- [x] 모든 inventoried personal mutation이 shared fence+owner lock 안에서 expected=current generation을 같은 transaction에 재검증한다 <!-- omo:id=accept-f0-writers-check-generation;stage=2;scope=backend;review=3,6 -->
- [x] background writer는 user session 위조 없이 allowlisted actor+expected generation을 요구한다 <!-- omo:id=accept-f0-background-actor-contract;stage=2;scope=backend;review=3,6 -->
- [x] G1 delayed mutation→delete→G2 race에서 G1 write가 G2 row로 기록되지 않는다 <!-- omo:id=accept-f0-g1-g2-isolation;stage=2;scope=backend;review=3,6 -->
- [x] mutation-first면 delete가 commit을 기다린 뒤 그 row까지 삭제하고 delete-first면 후속 mutation이 409다 <!-- omo:id=accept-f0-delete-mutation-serialization;stage=2;scope=backend;review=3,6 -->

## Legacy Delete / Generation Delete / Auth Outbox

- [x] legacy delete success와 exact epoch receipt가 같은 transaction에 commit된다 <!-- omo:id=accept-f0-legacy-delete-receipt-atomic;stage=2;scope=backend;review=3,6 -->
- [x] legacy cleanup failure는 개인 row와 receipt를 함께 rollback한다 <!-- omo:id=accept-f0-legacy-delete-receipt-rollback;stage=2;scope=backend;review=3,6 -->
- [x] generation delete는 UUID key, exact session HMAC/key version, payload hash, durable `202 cleanup_pending`을 lifecycle에 영구 기록한다 <!-- omo:id=accept-f0-generation-delete-durable;stage=2;scope=backend;review=3,6 -->
- [x] delete initiation이 모든 G1 binding revoke, lifecycle deleting, DB cleanup, auth outbox enqueue를 owner-lock transaction으로 묶는다 <!-- omo:id=accept-f0-generation-delete-transaction;stage=2;scope=backend;review=3,6 -->
- [x] same session/key/payload replay는 최초 result를 반환하고 다른 session/key/payload/G2는 fail closed한다 <!-- omo:id=accept-f0-delete-replay-boundary;stage=2;scope=backend;review=3,6 -->
- [x] auth consumer는 Storage terminal/expected-owner union-zero가 아니면 F0 skeleton에서 deleteUser를 호출하지 않는다 <!-- omo:id=accept-f0-auth-delete-storage-barrier;stage=2;scope=backend;review=3,6 -->
- [x] delete 직전 identity created-at exact match만 삭제하고 absent/newer identity를 각각 `already_absent|identity_replaced`로 끝낸다 <!-- omo:id=accept-f0-auth-delete-identity-cas;stage=2;scope=backend;review=3,6 -->
- [x] Admin delete 실패/process crash 뒤에도 revoked binding과 lifecycle gate가 신규 personal write를 막고 next tick retry가 가능하다 <!-- omo:id=accept-f0-auth-delete-retry-safe;stage=2;scope=backend;review=3,6 -->
- [x] admin membership 제거→granted_by/audit actor SET NULL→operational identifier scrub 뒤 Auth delete 순서를 지킨다 <!-- omo:id=accept-f0-admin-audit-cleanup;stage=2;scope=backend;review=3,6 -->
- [x] 미분류 `auth.users` RESTRICT FK가 있으면 auth consumer가 호출되지 않는다 <!-- omo:id=accept-f0-auth-fk-blocks-delete;stage=2;scope=backend;review=3,6 -->

## Error / Permission

### API Contract / Permissions

- [x] 모든 F0 response가 `{ success, data, error }`, error `{ code, message, fields[] }`를 유지한다 <!-- omo:id=accept-f0-api-envelope;stage=2;scope=backend;review=3,6 -->
- [x] `POST /users/me/cutover-quarantine-resolution`은 Authorization과 UUID `Idempotency-Key`를 요구한다 <!-- omo:id=accept-f0-quarantine-resolution-auth-key;stage=2;scope=backend;review=3,6 -->
- [x] activate가 exact auth-present G1 identity/session을 검증하고 같은 lifecycle을 active로 전환하며 profile/binding을 원자 생성한다 <!-- omo:id=accept-f0-quarantine-activate;stage=2;scope=backend;review=3,6 -->
- [x] delete가 같은 검증 뒤 durable account-delete initiation으로 전환한다 <!-- omo:id=accept-f0-quarantine-delete;stage=2;scope=backend;review=3,6 -->
- [x] auth-absent quarantine은 `ACCOUNT_QUARANTINE_MANUAL_RECOVERY_REQUIRED`로 자동 연결/삭제 없이 거부된다 <!-- omo:id=accept-f0-quarantine-auth-absent;stage=2;scope=backend;review=3,6 -->
- [x] quarantined 일반 bootstrap/read-write는 resolution allowlist 외 `ACCOUNT_CUTOVER_QUARANTINED`로 mutation 0이다 <!-- omo:id=accept-f0-quarantine-general-write-denied;stage=2;scope=backend;review=3,6 -->
- [x] same key/payload resolution replay는 최초 result이고 different payload는 `IDEMPOTENCY_KEY_REUSED`다 <!-- omo:id=accept-f0-quarantine-replay;stage=2;scope=backend;review=3,6 -->
- [x] `DELETE /users/me`는 capability legacy/maintenance/active를 exact status/error 계약으로 분기한다 <!-- omo:id=accept-f0-delete-dual-dispatch;stage=2;scope=backend;review=3,6 -->
- [x] service-role key/config 부재 시 user client fallback 없이 `500 INTERNAL_ERROR`/internal `ACCOUNT_DELETE_CONFIGURATION_ERROR`로 실패한다 <!-- omo:id=accept-f0-no-user-client-fallback;stage=2;scope=backend;review=3,6 -->
- [x] client의 owner/generation/session/capability 주입이 authority가 되지 않는다 <!-- omo:id=accept-f0-client-authority-injection-denied;stage=2;scope=backend;review=3,6 -->
- [x] 다른 사용자 lifecycle/binding/quarantine/delete를 읽거나 변경할 수 없다 <!-- omo:id=accept-f0-cross-owner-denied;stage=2;scope=backend;review=3,6 -->

## `ACCOUNT_QUARANTINE` UI / State / Accessibility

- [ ] auth callback/MYPAGE gate가 quarantined lifecycle이면 일반 app content보다 interstitial을 먼저 표시한다 <!-- omo:id=accept-f0-ui-interstitial-first;stage=4;scope=frontend;review=5,6 -->
- [ ] auth-present 화면에는 `계정 복구 | 삭제`만 있고 recovery와 destructive action의 위계가 명확하다 <!-- omo:id=accept-f0-ui-auth-present-actions;stage=4;scope=frontend;review=5,6 -->
- [ ] auth-absent 화면에는 임의 activate/delete CTA가 없고 지원·Manual Only 안내만 있다 <!-- omo:id=accept-f0-ui-auth-absent-support-only;stage=4;scope=frontend;review=5,6 -->
- [ ] loading 상태가 있다 <!-- omo:id=accept-f0-ui-loading;stage=4;scope=frontend;review=5,6 -->
- [ ] empty/not-applicable 상태가 있다 <!-- omo:id=accept-f0-ui-empty;stage=4;scope=frontend;review=5,6 -->
- [ ] error와 안전한 retry 상태가 있다 <!-- omo:id=accept-f0-ui-error-retry;stage=4;scope=frontend;review=5,6 -->
- [ ] restricted/read-only와 auth-absent 상태가 일반 MYPAGE를 우회해 열지 않는다 <!-- omo:id=accept-f0-ui-restricted;stage=4;scope=frontend;review=5,6 -->
- [ ] unauthorized/session stale은 로그인/auth callback 뒤 같은 resolution intent로 return-to-action한다 <!-- omo:id=accept-f0-ui-unauthorized-return;stage=4;scope=frontend;review=5,6 -->
- [ ] in-progress/same-key replay는 중복 mutation 없이 pending 상태와 retry timing을 표시한다 <!-- omo:id=accept-f0-ui-pending-replay;stage=4;scope=frontend;review=5,6 -->
- [ ] 다른 session/payload 충돌과 maintenance 503이 일반 로그인 오류로 숨겨지지 않는다 <!-- omo:id=accept-f0-ui-conflict-maintenance;stage=4;scope=frontend;review=5,6 -->
- [ ] production legacy 상태의 일반 사용자에게 quarantine 화면이 잘못 노출되지 않는다 <!-- omo:id=accept-f0-ui-legacy-hidden;stage=4;scope=frontend;review=5,6 -->
- [ ] 390px/320px/desktop에서 page horizontal scroll, CTA 가림, 44px 미만 touch target, focus loss가 없다 <!-- omo:id=accept-f0-ui-responsive-accessible;stage=4;scope=frontend;review=5,6 -->
- [ ] 별도 Codex design author/critic의 Stage 1 Round 4 final PASS를 유지하고, Stage 4 screenshot-based authority report까지 blocker 0이다 <!-- omo:id=accept-f0-ui-authority-pass;stage=4;scope=frontend;review=5,6 -->

## Launchd / Operational Skeleton

- [x] product worker skeleton이 label `com.homecook.account-maintenance`, `RunAtLoad=true`, `StartInterval=300`을 고정한다 <!-- omo:id=accept-f0-launchd-interval;stage=2;scope=backend;review=3,6 -->
- [x] install/verify/uninstall dry-run이 기존 OMO scheduler와 별도 surface이며 production secret을 artifact에 쓰지 않는다 <!-- omo:id=accept-f0-launchd-separate-secret-safe;stage=2;scope=backend;review=3,6 -->
- [x] ordered tick contract가 scanner→terminal tombstone scan→quarantine recheck→normal drain→owner-signal-zero→auth delete→complete 순서를 보존한다 <!-- omo:id=accept-f0-launchd-ordered-tick;stage=2;scope=backend;review=3,6 -->
- [x] F0-only feature-off에서 Storage/owner-signal evidence가 없으면 auth delete/complete 단계가 fail closed한다 <!-- omo:id=accept-f0-launchd-dark-ship-closed;stage=2;scope=backend;review=3,6 -->
- [x] heartbeat 15분, 3회 호출 실패, oldest pending 15분, dead-letter alert, JSON 10MB×5 rotation과 next-tick recovery를 configuration test로 고정한다 <!-- omo:id=accept-f0-launchd-slo-config;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions

- [x] Stage -1 closeout evidence와 contract PR #1072가 base에 존재한다 <!-- omo:id=accept-f0-predecessor-evidence;stage=2;scope=shared;review=3,6 -->
- [x] active A/B, G1/G2 same UUID, revoked/missing/expired session, quarantine 3분류, unresolved conflict fixture가 준비된다 <!-- omo:id=accept-f0-fixture-identities;stage=2;scope=shared;review=3,6 -->
- [x] long writer/Hook/external PUT/Auth insert-delete/digest mismatch/lock timeout을 결정적으로 주입하는 fixture가 준비된다 <!-- omo:id=accept-f0-fixture-races;stage=2;scope=shared;review=3,6 -->
- [x] admin membership/audit/operational event와 inbound auth FK fixture가 준비된다 <!-- omo:id=accept-f0-fixture-admin-fk;stage=2;scope=shared;review=3,6 -->
- [x] local existing upgrade, clean fresh migration, exact replay DB가 서로 분리되고 사용자 기존 DB/container/volume을 삭제하지 않는다 <!-- omo:id=accept-f0-local-db-isolation;stage=2;scope=shared;review=3,6 -->
- [x] remote preflight는 read-only inventory이며 migration apply는 merged exact SHA 이후에만 수행한다 <!-- omo:id=accept-f0-remote-merged-sha-only;stage=2;scope=shared;review=3,6 -->
- [x] remote apply 뒤 capability legacy/canonical 0/Hook ACL/legacy Route compatibility를 검증하고 maintenance/active로 바꾸지 않는다 <!-- omo:id=accept-f0-remote-dark-ship-smoke;stage=2;scope=shared;review=3,6 -->
- [x] secrets/raw JWT/session/auth payload/API keys/user identifiers가 logs, fixture report, PR evidence에 없다 <!-- omo:id=accept-f0-evidence-secret-free;stage=2;scope=shared;review=3,6 -->

## Automation Split

### Vitest / Route / Service

- [x] capability mapping, wrapper/errors, session HMAC binding, key replay, no-fallback behavior를 실패 테스트 RED부터 고정한다 <!-- omo:id=accept-f0-vitest-contract;stage=2;scope=backend;review=3,6 -->
- [ ] auth callback/MYPAGE quarantine gate와 loading/error/restricted/unauthorized/pending 상태를 component test로 고정한다 <!-- omo:id=accept-f0-vitest-ui-states;stage=4;scope=frontend;review=5,6 -->

### PostgreSQL / Security

- [x] existing/fresh/replay에서 schema/constraint/RLS/trigger/grant/search_path/append-only invariants를 검증한다 <!-- omo:id=accept-f0-pg-schema-security;stage=2;scope=backend;review=3,6 -->
- [x] role matrix가 `PUBLIC|anon|authenticated|service_role|supabase_auth_admin|NOLOGIN owner`의 exact positive/negative privileges를 증명한다 <!-- omo:id=accept-f0-pg-role-matrix;stage=2;scope=backend;review=3,6 -->
- [x] shared/exclusive fence, Hook plain-SELECT race, staging digest CAS, abort/second cutover, mutation/delete serialization을 실제 concurrent connection으로 검증한다 <!-- omo:id=accept-f0-pg-concurrency;stage=2;scope=backend;review=3,6 -->
- [x] legacy delete success/rollback receipt와 admin/FK/Auth outbox identity CAS를 실제 DB fixture로 검증한다 <!-- omo:id=accept-f0-pg-delete-cleanup;stage=2;scope=backend;review=3,6 -->

### Playwright / Exploratory / Authority

- [ ] auth-present activate/delete/replay와 auth-absent support-only를 desktop/mobile 브라우저에서 검증한다 <!-- omo:id=accept-f0-playwright-quarantine;stage=4;scope=frontend;review=5,6 -->
- [ ] callback return-to-action, 일반 MYPAGE 우회 금지, legacy non-exposure를 브라우저에서 검증한다 <!-- omo:id=accept-f0-playwright-routing;stage=4;scope=frontend;review=5,6 -->
- [ ] exploratory QA report와 qa eval이 required device coverage와 copy/CTA/error recovery finding을 닫는다 <!-- omo:id=accept-f0-exploratory-qa;stage=4;scope=frontend;review=5,6 -->
- [ ] authority report의 evidence block이 390/320/desktop과 activate/delete/error/pending variant를 참조한다 <!-- omo:id=accept-f0-authority-artifacts;stage=4;scope=frontend;review=5,6 -->

### Independent Review / Merge Gate

- [x] 별도 Codex internal 1.5 reviewer가 Stage 1의 5개 core artifact와 2개 design gate artifact 전체를 승인하고 unresolved required finding이 0이다 <!-- omo:id=accept-f0-doc-gate-independent;stage=2;scope=shared;review=3,6 -->
- [x] 구현 세션과 분리된 Codex security/DB reviewer가 principal/lock/cutover/delete/outbox 범위를 승인한다 <!-- omo:id=accept-f0-security-review-independent;stage=2;scope=shared;review=3,6 -->
- [x] 구현 세션과 분리된 Codex 5축 reviewer가 correctness/security/test/performance/maintainability finding을 0으로 닫는다 <!-- omo:id=accept-f0-code-review-independent;stage=2;scope=shared;review=3,6 -->
- [ ] current PR head에서 시작된 모든 check가 terminal success 또는 정상 skip이고 pending/absent/stale/fail/cancel이 없다 <!-- omo:id=accept-f0-current-head-green;stage=4;scope=shared;review=6 -->

## Manual QA

아래 항목은 production operator 판단이나 실제 외부 provider/host가 필요한 시나리오다. 자동화·PR merge gate가 대신 체크하지 않으며, F0 Stage 1/구현 완료를 위해 실행하지 않는다.

### Manual Only

- [ ] #3 준비 뒤 production `cutover_maintenance` 진입, Auth Admin/import/dashboard create/delete freeze, quiet window, Storage inventory 2회와 final `generation_active` promote
- [ ] remote provider가 `auth.users SHARE ROW EXCLUSIVE` lock을 허용하지 않을 때 provider-supported maintenance barrier의 운영자 증거
- [ ] auth-absent quarantine identity 복구 또는 backup/Storage/personal-owner inventory를 포함한 cleanup 승인
- [ ] MacBook `com.homecook.account-maintenance` 실제 설치와 production `HOMECOOK_MAINTENANCE_WORKER_SECRET` 주입/교체
- [ ] 실제 email/OAuth provider 가입 smoke와 production 외부 dead-man heartbeat 수신 확인
