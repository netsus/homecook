# Acceptance Checklist: hybrid-auth-local-data-production

> 이 문서는 implementation 완료를 주장하지 않는다. 모든 구현 체크박스는 Stage 2/4 evidence가 생긴 뒤에만 체크한다.
> Manual Only를 제외한 모든 체크박스는 `omo` metadata를 유지한다.
> public endpoint, request/response field, HTTP status, public error code 추가는 acceptance 범위 밖이며 발견 즉시 blocker다.

## Happy Path

- [ ] Google 로그인 후 기존 화면/API shape 그대로 local DB CRUD가 동작한다 <!-- omo:id=accept-hybrid-google-crud;stage=4;scope=shared;review=6 -->
- [ ] Naver 로그인 후 기존 화면/API shape 그대로 local DB CRUD가 동작한다 <!-- omo:id=accept-hybrid-naver-crud;stage=4;scope=shared;review=6 -->
- [ ] Kakao 로그인 후 기존 화면/API shape 그대로 local DB CRUD가 동작한다 <!-- omo:id=accept-hybrid-kakao-crud;stage=4;scope=shared;review=6 -->
- [x] remote Auth JWT `sub`와 local PostgREST `auth.uid()`가 exact 일치한다 <!-- omo:id=accept-hybrid-auth-uid-sub;stage=2;scope=backend;review=3,6 -->
- [x] local Storage read/write/cancel/delete가 remote JWT owner policy를 따른다 <!-- omo:id=accept-hybrid-storage-owner;stage=2;scope=backend;review=3,6 -->
- [x] response wrapper `{ success, data, error }`와 error object shape가 기존 API 문서와 일치한다 <!-- omo:id=accept-hybrid-api-envelope;stage=2;scope=backend;review=3,6 -->

## State / Policy

- [x] `HOMECOOK_DATA_AUTHORITY=remote` 기본값에서 기존 remote-only 동작이 유지된다 <!-- omo:id=accept-hybrid-remote-default;stage=2;scope=backend;review=3,6 -->
- [x] `local-shadow`는 safe GET digest만 비교하고 사용자 response/write authority는 remote에 남긴다 <!-- omo:id=accept-hybrid-shadow-read-only;stage=2;scope=backend;review=3,6 -->
- [ ] `local` 전환 전 final count/digest와 Storage manifest mismatch가 0이다 <!-- omo:id=accept-hybrid-final-digest-zero;stage=2;scope=backend;review=3,6 -->
- [ ] 첫 local write 뒤 env-only rollback이 guard/runbook/verification에서 금지된다 <!-- omo:id=accept-hybrid-no-env-rollback;stage=2;scope=shared;review=3,6 -->
- [ ] remote application DB/Storage는 cutover 후 신규 app write 0이고 read-only recovery copy로 보존된다 <!-- omo:id=accept-hybrid-remote-readonly-retention;stage=2;scope=shared;review=3,6 -->
- [ ] remote Supabase writable 예외는 Auth Hook용 최소 control-plane table/function뿐이고 application public DB/Storage는 read-only recovery copy다 <!-- omo:id=accept-hybrid-remote-control-plane-only;stage=2;scope=backend;review=3,6 -->
- [x] local DB/Data API/Storage/Studio/Postgres는 loopback 또는 Docker internal network only다 <!-- omo:id=accept-hybrid-loopback-only;stage=2;scope=backend;review=3,6 -->
- [x] account-generation capability는 `legacy`이고 canonical generation activation이 열리지 않는다 <!-- omo:id=accept-hybrid-generation-legacy-only;stage=2;scope=shared;review=3,6 -->

## JWT / JWKS / RLS

- [x] local PostgREST가 combined local+remote verify JWKS, `PGRST_JWT_AUD=authenticated`, DB pre-request exact claim guard로 valid remote JWT를 검증한다 <!-- omo:id=accept-hybrid-postgrest-valid-jwt;stage=2;scope=backend;review=3,6 -->
- [x] local Storage가 `JWT_JWKS`와 loopback claim-verifying gateway 단일 user entrypoint로 valid remote JWT를 검증하며 upstream port는 Docker internal network only다 <!-- omo:id=accept-hybrid-storage-valid-jwt;stage=2;scope=backend;review=3,6 -->
- [x] remote exact `iss`, `aud=authenticated`, `role=authenticated`, UUID `sub`, UUID `session_id`, `iat`/`nbf`/`exp`, allowlisted `alg`/`kid`가 모두 통과 조건이다 <!-- omo:id=accept-hybrid-exact-claim-guard;stage=2;scope=backend;review=3,6 -->
- [ ] wrong issuer, wrong audience, wrong role, expired token, malformed token, unknown kid, local Auth token, local legacy token, remote service_role token, missing audience, malformed `session_id`가 fail closed된다 <!-- omo:id=accept-hybrid-jwt-negative;stage=2;scope=backend;review=3,6 -->
- [x] local anon/service token은 exact internal allowlist 경로에서만 허용되고 user-scoped gateway/Data path에서는 거부된다 <!-- omo:id=accept-hybrid-local-token-internal-only;stage=2;scope=backend;review=3,6 -->
- [x] remote private signing key가 local env/file/container/log/artifact에 없다 <!-- omo:id=accept-hybrid-no-private-key-local;stage=2;scope=shared;review=3,6 -->
- [x] JWKS sync는 size/timeout/alg/kty/kid/public-key allowlist와 atomic replace를 검증한다 <!-- omo:id=accept-hybrid-jwks-sync-guard;stage=2;scope=backend;review=3,6 -->
- [ ] JWKS stale/rotation rehearsal이 alert와 canary RLS verification을 남긴다 <!-- omo:id=accept-hybrid-jwks-rotation;stage=2;scope=backend;review=3,6 -->
- [ ] session-liveness HMAC binding은 callback/refresh remote liveness success에서만 생성/갱신되고 logout/deletion/quarantine/identity replacement/maintenance abort에서 revoke/delete된다 <!-- omo:id=accept-hybrid-session-liveness-create-revoke;stage=2;scope=backend;review=3,6 -->
- [x] 허용된 user-scoped DB mutation과 Storage read request가 remote liveness recheck, active mirror epoch, session-liveness HMAC binding, binding TTL, method/path attestation을 재검증하고 browser/user Storage mutation은 별도 deny 경계에서 upstream 전에 차단한다 <!-- omo:id=accept-hybrid-session-liveness-request-recheck;stage=2;scope=backend;review=3,6 -->
- [ ] 실제 hosted Auth에서 유효 JWT의 `/auth/v1/user` 성공 -> 해당 `session_id` logout/revoke -> 만료 전 같은 JWT의 `session_not_found` 계열 실패를 확인하고 gateway가 이를 `409 ACCOUNT_SESSION_STALE`로 매핑하며 local DB/Storage mutation이 0건임을 증명한다 <!-- omo:id=accept-hybrid-revoked-session-negative-canary;stage=2;scope=backend;review=3,6 -->
- [x] remote Auth outage에서는 binding TTL 연장, 신규 binding 생성, user-scoped mutation allow-until-exp가 모두 금지되고 기존 public mapping으로 fail closed된다 <!-- omo:id=accept-hybrid-remote-outage-fail-closed;stage=2;scope=backend;review=3,6 -->

## Identity Mirror / Account Lifecycle

- [x] private remote identity mirror가 remote verified session/Admin read-only result만 authority로 사용한다 <!-- omo:id=accept-hybrid-mirror-authority;stage=2;scope=backend;review=3,6 -->
- [x] `private.remote_auth_identity_epochs`는 active epoch 단일성, `issuer`, `owner_uuid`, `identity_created_at`, `remote_revision`, `remote_identity_digest`, `verified_at`, `deleted_terminal_at`, `deleted_terminal_reason`, `evidence_revision`, `created_at`, `updated_at`만 저장한다 <!-- omo:id=accept-hybrid-mirror-minimal-fields;stage=2;scope=backend;review=3,6 -->
- [x] mirror는 raw/profile PII, raw token, refresh token, OAuth code, provider payload, raw/hash email, raw/hash provider subject, unbounded JSON을 저장하지 않는다 <!-- omo:id=accept-hybrid-mirror-secret-free;stage=2;scope=backend;review=3,6 -->
- [ ] profile bootstrap은 검증된 remote session/Admin 결과의 exact allowlist 입력을 일회성 internal RPC로 전달하고 mirror에는 저장하지 않는다 <!-- omo:id=accept-hybrid-profile-bootstrap-rpc;stage=2;scope=backend;review=3,6 -->
- [x] application-owned `auth.users` direct read/FK/digest dependency inventory가 100% 분류된다 <!-- omo:id=accept-hybrid-auth-users-inventory;stage=2;scope=backend;review=3,6 -->
- [ ] 세 FK, 함수, digest, lock 항목별 `auth.users` replacement matrix가 구현 전 review 승인된다 <!-- omo:id=accept-hybrid-auth-users-replacement-matrix;stage=2;scope=backend;review=3,6 -->
- [x] historical audit actor는 set-null 또는 write-time snapshot policy로 처리되어 deleted/recreated epoch owner 권한으로 되살아나지 않는다 <!-- omo:id=accept-hybrid-historical-audit-policy;stage=2;scope=backend;review=3,6 -->
- [x] account-generation identity epoch 검증이 mirror authority로 대체되고 세대 보호가 약화되지 않는다 <!-- omo:id=accept-hybrid-generation-mirror-epoch;stage=2;scope=backend;review=3,6 -->
- [ ] remote deleted/recreated same UUID 또는 stale session이 이전 generation personal data를 쓰지 못한다 <!-- omo:id=accept-hybrid-deleted-recreated-stale;stage=2;scope=backend;review=3,6 -->
- [x] 모든 authenticated DB/Storage request는 remote `/auth/v1/user` 검증 결과의 `(iss, sub, session_id, user.created_at)`와 current active mirror epoch를 결합하는 session-authority gateway를 통과한다 <!-- omo:id=accept-hybrid-current-session-epoch-binding;stage=2;scope=backend;review=3,6 -->
- [ ] missing/stale/deleted/identity-replaced/revoked session-liveness 또는 epoch binding, expired binding TTL, remote liveness negative/outage, HMAC mismatch, old `iat < identity_created_at` token은 personal DB/Storage write에서 `409 ACCOUNT_SESSION_STALE`로 fail closed된다 <!-- omo:id=accept-hybrid-stale-binding-fail-closed;stage=2;scope=backend;review=3,6 -->
- [x] active generation mismatch는 `409 ACCOUNT_GENERATION_STALE`, maintenance는 `503 ACCOUNT_LIFECYCLE_MAINTENANCE`로 매핑되고 stale session/epoch 원인에 신규 public status/error code를 만들지 않는다 <!-- omo:id=accept-hybrid-existing-error-mapping-only;stage=2;scope=backend;review=3,6 -->
- [ ] provider identity set은 local owner/epoch authority가 아니다. maintenance는 linking UI를 막고 barrier 전후 remote identity population/revision digest CAS를 비교하며 direct/automatic linking race가 digest를 바꾸면 attempt를 abort/restart한다 <!-- omo:id=accept-hybrid-provider-linking-revision-cas;stage=2;scope=backend;review=3,6 -->
- [ ] provider link가 owner/epoch를 바꾸지 않으면 remote-only metadata로 reconcile하고, owner/epoch 또는 population digest가 바뀌면 local write 개방 전에 fail closed한다 <!-- omo:id=accept-hybrid-provider-linking-boundary;stage=2;scope=backend;review=3,6 -->
- [ ] deletion은 local owner fence/cleanup -> remote Admin exact id+created_at 확인/delete -> terminal readback -> mirror terminal -> lifecycle complete 순서이며 retry, duplicate, identity-replaced 분기가 멱등하다 <!-- omo:id=accept-hybrid-deletion-exact-epoch-saga;stage=2;scope=backend;review=3,6 -->
- [ ] Before User Created Hook, Auth Admin freeze, local fence, mirror digest가 attempt UUID, monotonic revision, fencing token, remote/local ack, lease, quiet window, abort/resume state를 갖는 two-system maintenance barrier로 묶인다 <!-- omo:id=accept-hybrid-two-system-barrier;stage=2;scope=backend;review=3,6 -->

## Error / Permission

- [x] user-scoped local Data client가 service role/secret key 없이 동작한다 <!-- omo:id=accept-hybrid-user-client-no-service-role;stage=2;scope=backend;review=3,6 -->
- [x] service role key 누락이 user client fallback으로 이어지지 않는다 <!-- omo:id=accept-hybrid-no-user-fallback;stage=2;scope=backend;review=3,6 -->
- [x] 모든 user route의 service role priority/fallback count가 0이다 <!-- omo:id=accept-hybrid-user-route-service-role-zero;stage=2;scope=backend;review=3,6 -->
- [x] user/public/admin/internal route와 helper inventory, exact internal service-role allowlist, AST/static CI gate가 통과한다 <!-- omo:id=accept-hybrid-route-helper-static-gate;stage=2;scope=backend;review=3,6 -->
- [x] Stage 2 route/helper/browser inventory는 client-reachable Supabase runtime entrypoint를 단일 Auth adapter 외에 금지하고, Auth-only facade/transport와 gateway/RLS deny를 주 권한 경계로 검증한다. direct Storage source/bundle AST 검사는 보조 canary다 <!-- omo:id=accept-hybrid-browser-direct-storage-static-gate;stage=2;scope=backend;review=3,6 -->
- [x] Stage 4 frontend implementation evidence에서 기존 browser direct Storage mutation 경로가 제거되고 기존 서버 image API 경유만 남는다 <!-- omo:id=accept-hybrid-browser-direct-storage-stage4-removal;stage=4;scope=frontend;review=5,6 -->
- [x] User A token으로 User B DB row read/write가 0이다 <!-- omo:id=accept-hybrid-cross-owner-db-denied;stage=2;scope=backend;review=3,6 -->
- [x] User A token으로 User B Storage object read/write/delete가 0이다 <!-- omo:id=accept-hybrid-cross-owner-storage-denied;stage=2;scope=backend;review=3,6 -->
- [x] local DB down 또는 Storage down이 기존 safe error 상태로 fail closed되고 partial write를 만들지 않는다 <!-- omo:id=accept-hybrid-local-down-fail-closed;stage=2;scope=shared;review=3,6 -->
- [x] 신규 public endpoint/field/status/error code가 추가되지 않는다 <!-- omo:id=accept-hybrid-no-public-shape-change;stage=2;scope=shared;review=3,6 -->

## Data Integrity / Migration

- [ ] remote DB restore 순서는 pre-data schema -> hybrid compatibility/FK 교체 -> application data -> post-data validate로 고정된다 <!-- omo:id=accept-hybrid-db-restore-order;stage=2;scope=backend;review=3,6 -->
- [x] local restore 뒤 `auth.users=0`은 의도된 invariant로 유지된다 <!-- omo:id=accept-hybrid-local-auth-users-zero;stage=2;scope=backend;review=3,6 -->
- [x] `pg_constraint`/`pg_depend`/`pg_proc`/policy에서 application-owned `auth.users` 잔존 count가 0이다 <!-- omo:id=accept-hybrid-auth-users-residual-zero;stage=2;scope=backend;review=3,6 -->
- [x] known fixture `public.users=5`, `admin missing=1`, `audit missing=99`가 교정 전 fail, 교정 후 pass한다 <!-- omo:id=accept-hybrid-known-semantic-fixture;stage=2;scope=backend;review=3,6 -->
- [x] remote DB roles/schema/data dump와 local restore rehearsal이 성공한다 <!-- omo:id=accept-hybrid-db-restore-rehearsal;stage=2;scope=backend;review=3,6 -->
- [ ] table별 row count와 stable digest가 일치한다 <!-- omo:id=accept-hybrid-table-digest;stage=2;scope=backend;review=3,6 -->
- [ ] owner별 private row count/digest가 일치한다 <!-- omo:id=accept-hybrid-owner-digest;stage=2;scope=backend;review=3,6 -->
- [ ] migration history, extension, RLS, trigger, grants inventory가 일치하거나 분류된다 <!-- omo:id=accept-hybrid-schema-inventory;stage=2;scope=backend;review=3,6 -->
- [x] Storage object count/bytes/MIME/hash/reference manifest mismatch가 0이다 <!-- omo:id=accept-hybrid-storage-manifest;stage=2;scope=backend;review=3,6 -->
- [ ] orphan/missing/owner-path mismatch는 report-only로 분류되고 미승인 delete/enqueue가 0이다 <!-- omo:id=accept-hybrid-orphan-report-only;stage=2;scope=backend;review=3,6 -->
- [ ] replay가 duplicate DB row 또는 duplicate Storage object를 만들지 않는다 <!-- omo:id=accept-hybrid-replay-idempotent;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions

- [ ] current capacity evidence는 disk gate(target free space 약 120GiB/current DB+Storage 약 4MiB)는 통과하지만 encrypted swap free `650,840,637` bytes가 conservative service peak `907,214,848` bytes보다 작아 전체 gate가 BLOCKED다. swap headroom 확보 후 전체 preflight를 통과한다 <!-- omo:id=accept-hybrid-capacity-gate;stage=2;scope=shared;review=3,6 -->
- [ ] final cutover 직전 capacity evidence를 재검증한다 <!-- omo:id=accept-hybrid-capacity-final-recheck;stage=2;scope=shared;review=3,6 -->
- [ ] off-Mac encrypted backup 1개 이상과 local separate backup 1개 이상이 있다 <!-- omo:id=accept-hybrid-offmac-backup;stage=2;scope=shared;review=3,6 -->
- [ ] off-Mac backup evidence schema가 DB dump, Storage manifest, encryption key id, restore host, restore command, digest, operator, timestamp를 기록한다 <!-- omo:id=accept-hybrid-offmac-evidence-schema;stage=2;scope=shared;review=3,6 -->
- [ ] DB+Storage cut line과 key 분리 복구 절차가 rehearsal evidence로 남는다 <!-- omo:id=accept-hybrid-cut-line-key-separation;stage=2;scope=shared;review=3,6 -->
- [ ] pre-write rollback rehearsal과 post-write rollback rehearsal이 별도 evidence로 남는다 <!-- omo:id=accept-hybrid-pre-post-rollback-rehearsal;stage=2;scope=shared;review=3,6 -->
- [ ] Mac reboot 뒤 local Supabase -> Next.js ordered recovery가 검증된다 <!-- omo:id=accept-hybrid-ordered-recovery;stage=2;scope=backend;review=3,6 -->
- [ ] Docker healthcheck/restart policy와 secret file mode가 검증된다 <!-- omo:id=accept-hybrid-runtime-health-secret-mode;stage=2;scope=backend;review=3,6 -->
- [ ] remote Auth provider settings 변경 없이 OAuth callback이 유지된다 <!-- omo:id=accept-hybrid-provider-settings-unchanged;stage=4;scope=shared;review=6 -->

## Automation Split

### Vitest / Unit

- [x] Auth/Data env split과 public/server-only exposure가 테스트된다 <!-- omo:id=accept-hybrid-vitest-env-split;stage=2;scope=backend;review=3,6 -->
- [x] issuer/audience/sub/session/expiry validation이 테스트된다 <!-- omo:id=accept-hybrid-vitest-token-validation;stage=2;scope=backend;review=3,6 -->
- [x] no service role user client fallback이 테스트된다 <!-- omo:id=accept-hybrid-vitest-no-service-role;stage=2;scope=backend;review=3,6 -->
- [x] mirror payload allowlist와 secret-free invariant가 테스트된다 <!-- omo:id=accept-hybrid-vitest-mirror-allowlist;stage=2;scope=backend;review=3,6 -->
- [x] route/helper service-role allowlist AST/static gate가 테스트된다 <!-- omo:id=accept-hybrid-vitest-service-role-static;stage=2;scope=backend;review=3,6 -->

### PostgreSQL / Storage / Integration

- [x] local PostgREST remote JWT RLS integration이 통과한다 <!-- omo:id=accept-hybrid-integration-postgrest-rls;stage=2;scope=backend;review=3,6 -->
- [x] local Storage remote JWT owner policy integration이 통과한다 <!-- omo:id=accept-hybrid-integration-storage-rls;stage=2;scope=backend;review=3,6 -->
- [ ] deleted 후 같은 UUID를 재생성한 fixture에서 이전 access token/session의 DB와 Storage write가 모두 거부된다 <!-- omo:id=accept-hybrid-integration-deleted-recreated-old-session;stage=2;scope=backend;review=3,6 -->
- [ ] direct/automatic provider linking race는 remote identity revision/population digest CAS mismatch로 cutover attempt를 abort한다 <!-- omo:id=accept-hybrid-integration-provider-link-race;stage=2;scope=backend;review=3,6 -->
- [ ] deletion exact-epoch terminal readback의 retry/duplicate/identity-replaced fixture가 모두 멱등하게 종료된다 <!-- omo:id=accept-hybrid-integration-deletion-saga;stage=2;scope=backend;review=3,6 -->
- [x] local/remote role matrix와 grant exposure가 검증된다 <!-- omo:id=accept-hybrid-integration-role-matrix;stage=2;scope=backend;review=3,6 -->
- [ ] JWKS old/new key overlap과 stale failure가 검증된다 <!-- omo:id=accept-hybrid-integration-jwks-rotation;stage=2;scope=backend;review=3,6 -->

### Playwright / Browser

- [ ] Google login -> private CRUD -> logout -> relogin smoke가 통과한다 <!-- omo:id=accept-hybrid-playwright-google;stage=4;scope=shared;review=6 -->
- [ ] Naver login -> private CRUD -> logout -> relogin smoke가 통과한다 <!-- omo:id=accept-hybrid-playwright-naver;stage=4;scope=shared;review=6 -->
- [ ] Kakao login -> private CRUD -> logout -> relogin smoke가 통과한다 <!-- omo:id=accept-hybrid-playwright-kakao;stage=4;scope=shared;review=6 -->
- [ ] recipe image upload/read/cancel/delete smoke가 local Storage에서 통과한다 <!-- omo:id=accept-hybrid-playwright-image;stage=4;scope=shared;review=6 -->
- [x] browser에서 Storage SDK direct write/delete가 호출되지 않고 existing server image API만 사용된다 <!-- omo:id=accept-hybrid-playwright-no-direct-storage;stage=4;scope=frontend;review=5,6 -->
- [x] 390px/320px/desktop에서 기존 login/error/account states가 깨지지 않는다 <!-- omo:id=accept-hybrid-playwright-viewports;stage=4;scope=frontend;review=6 -->

### Independent Review

- [ ] 별도 Codex architecture reviewer가 hybrid trust boundary를 승인한다 <!-- omo:id=accept-hybrid-architecture-review;stage=2;scope=shared;review=3,6 -->
- [ ] 별도 Codex security reviewer가 JWT/JWKS/service-role/mirror/backup 범위를 승인한다 <!-- omo:id=accept-hybrid-security-review;stage=2;scope=shared;review=3,6 -->
- [ ] Stage author와 구현 세션은 자기 산출물을 최종 승인하지 않는다 <!-- omo:id=accept-hybrid-separated-codex-roles;stage=2;scope=shared;review=3,6 -->
- [ ] Design Status N/A이므로 신규 visual authority는 요구하지 않지만 Stage 4 browser direct Storage 제거는 Stage 5 lightweight boundary review와 Stage 6 closeout을 통과한다 <!-- omo:id=accept-hybrid-design-status-na-stage5-boundary-review;stage=4;scope=frontend;review=5,6 -->

## Manual QA

아래 항목은 실제 외부 provider, 운영 host, backup/restore, 첫 local write 같은 운영 판단이 필요하다. 자동화 gate가 대신 체크하지 않는다.

### Manual Only

- [ ] 실제 Google/Naver/Kakao provider 로그인과 callback production smoke
- [ ] remote Auth provider dashboard 설정 무변경 확인
- [ ] 첫 local write 개방 운영자 승인
- [ ] 첫 local write 뒤 rollback floor 운영자 승인과 remote read-only retention 시작
- [ ] off-Mac encrypted backup restore drill
- [ ] Mac 전원/잠자기/재부팅/파일볼트/외장 SSD 운영 조건 확인
- [ ] 14일 안정화 뒤 remote application DB/Storage 폐기 또는 보존 연장 결정

## Stage 2 Evidence Passed in This PR

- Auth/Data/Storage 경계: `tests/hybrid-supabase-client-split.test.ts`, `tests/hybrid-supabase-env.test.ts`
- remote JWT/JWKS: `tests/hybrid-supabase-jwt.test.ts`, `tests/hybrid-jwks-sync.test.ts`
- liveness/binding/attestation/outage: `tests/hybrid-session-authority-gateway.test.ts`
- session-liveness lifecycle automation: callback/refresh binding 생성·갱신과 logout/deletion/quarantine revoke/delete 경로는 자동화됨
- local-shadow runtime: `tests/hybrid-shadow-read.test.ts`, `tests/supabase-server.test.ts`, `node scripts/verify-hybrid-supabase.mjs --mode shadow-read-runtime`
- mirror/migration/static gate: `tests/hybrid-supabase-identity-mirror.test.ts`, `tests/hybrid-supabase-migration.test.ts`, `tests/hybrid-supabase-static-gate.test.ts`, `tests/account-session-generation-security-function-inventory.test.ts`, `tests/hybrid-internal-operations-security-function-inventory.test.ts`, `docs/security/hybrid-internal-operations-security-function-authorization-manifest.json`, `node scripts/validate-security-function-authorization.mjs --contract-only`
- isolated runtime 계약: `tests/hybrid-isolated-runtime.test.ts`, `tests/hybrid-supabase-storage.integration.test.ts`, `infra/hybrid-supabase/docker-compose.integration.yml`
- historical runtime snapshot(측정 증거 아님): `tests/fixtures/hybrid-stage2-runtime-evidence.json`
- measured isolated runtime: `node scripts/verify-hybrid-supabase.mjs --mode isolated-runtime-measured` — PG 17.6.1.136/PostgREST 14.12/Storage 1.60.4/gateway를 host port 없이 기동하고 DB setting 주입, 역할·schema·extension init-complete healthcheck 뒤 remote-shaped ES256 `sub=auth.uid()`, 공식 익명 `/recipes/themes`·`/tags`·`/ingredients`·`/cooking-methods` downstream query와 `HEAD` 거부, User A/B DB RLS, `anon`/`authenticated` direct Storage mutation의 pre-upstream 409와 mutation policy count 0, exact internal recipe-image upload/sign/remove 200, Google/Naver/Kakao remote-shaped callback fixture의 RPC-only user/bootstrap 생성, callback RPC의 capability-race maintenance와 stale 오류 보존, admin member/비회원 조회, 404 feedback/operational event 실제 insert와 scope·method·path 오용 차단, revoke 후 동일 JWT DB/Storage mutation 0, 409/503 outage mapping을 실제 HTTP/DB 상태로 검증
- Storage cold-start 반복 측정(2026-07-30T03:30:43Z~03:37:38Z): `for runtime_iteration in 1 2 3; do node scripts/verify-hybrid-supabase.mjs --mode isolated-runtime-measured; done` — clean-volume 전체 no-port suite가 3회 연속 각각 `10 passed`, 소요 시간 139초/138초/138초, `evidence_scope=isolated-container-measured-runtime`, `production_writes=0`, `cutover_writes=0`
- GitHub CI evidence(implementation head `99f37a99818198f0d0ddb72a54cc4e3ebd3c4d98`): `CI / hybrid-authority-runtime` 2분 20초 PASS, current-head checks 15 success/2 정상 skip/0 fail/0 pending
- measured runtime은 locally signed fixture만 사용한다. 실제 hosted revoked-session canary, Google/Naver/Kakao OAuth, production network/cutover/write는 미실행 manual gate다
- 격리 복원 DB transaction: `HYBRID_SUPABASE_TEST_CONTAINER=homecook-hybrid-encrypted-restore-20260730 node scripts/verify-hybrid-supabase.mjs --mode migration-rehearsal`
- 격리 DB 결과: `auth.users=0`, `public.users=5`, `storage.objects=1`, invalid constraint/FK/procedure residual=0, session canary transaction rollback. Stage 2 초안이 이미 적용된 격리 DB에는 exact authority record/pre-request function과 internal operation facade migration을 적용했으며 두 RPC 모두 `service_role EXECUTE=true`, `authenticated EXECUTE=false`, production/cutover/data write는 0이다.
- inventory: `hybrid-browser-storage-direct-inventory.json`, `hybrid-service-role-inventory.json`, `auth-users-replacement-matrix.md`
- Stage 4 frontend image lifecycle + Stage 5 remediation: managed-only upload/cancel의 strict wrapper/status, same-key replay, upload-owned/create-owned 소유권 전환, mounted/unmounted create의 success/definitive `IMAGE_*`/unknown 결과별 cancel `0/1/0`, StrictMode와 later unmount의 exactly-once cleanup, interrupted expired read URL 재시도, upload/cancel/unmount/save/refresh/replace/remove stale completion, saving 중 navigation/image mutation guard를 유지한다. browser Auth call site는 raw client 대신 Auth-only facade를 사용한다.
- Stage 4 browser fixture: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3115 pnpm exec playwright test tests/e2e/slice-31-recipe-media-tags.spec.ts --grep hybrid-auth-local-data-production --project=desktop-chrome --project=mobile-chrome --project=mobile-ios-small --reporter=line` — `15 passed`; exact 320px/390px/1280px에서 server image API만 호출되고 `/storage/v1/object` mutation `0`, login return-to-action과 account error/unauthorized 상태, create pending 중 실제 `page.goBack()`/dismissed `page.reload()`에서 create 1회·cancel 0회·form/result 보존을 검증
- Stage 4 browser capability authority: `lib/supabase/browser.ts`는 실제 사용 중인 `getSession/getUserIdentities/linkIdentity/onAuthStateChange/signInWithOAuth/signInWithPassword/signUp`만 원래 Auth client에 bind한 frozen facade를 반환한다. runtime/type surface에는 `storage/from/rpc/functions/realtime`가 없다. 내부 custom fetch는 configured Supabase origin의 exact `/auth/v1` 또는 `/auth/v1/**`만 underlying network로 전달하고 같은 origin의 `/storage/v1`, `/rest/v1`, `/functions/v1` 및 타 origin은 호출 전 fail-closed한다. SSR cookie/PKCE/refresh 기본 설정은 override하지 않는다.
- Stage 4 source/runtime/data authority: client-reachable ESM runtime import/re-export, CommonJS free/unshadowed `require`와 거기서 증명된 direct identifier alias, `import = require`, literal dynamic import에서 `@supabase/ssr`, `@supabase/supabase-js`, `@supabase/storage-js`는 `lib/supabase/browser.ts` 한 파일 외 violation이다. CommonJS 판정은 lexical binding identity와 runtime declaration 여부를 함께 사용한다. 선언 자신뿐 아니라 SourceFile까지의 조상에서 ambient node/modifier, global augmentation, `.d.ts`, type-only import/export 컨텍스트를 확인하고 body 없는 `FunctionDeclaration` overload/signature도 emit 제거 선언으로 분류한다. 동일 symbol에 body가 있는 구현 선언이 있으면 실제 runtime function shadow로 인정하며 parameter/local const/local function/nested safe shadow만 loader에서 제외한다. 해석 불가능한 runtime dynamic import/require는 fail closed하며 dynamic import의 attributes/options 유무는 첫 specifier 판정을 바꾸지 않는다. client graph는 `.ts/.tsx/.mts/.cts/.js/.jsx/.mjs/.cjs`와 같은 확장자의 `index` 후보를 추적하고, TypeScript runtime specifier 대입(`.mjs -> .mts`, `.cjs -> .cts`, `.js -> .ts/.tsx`, `.jsx -> .tsx`) 때문에 같은 basename의 runtime 후보가 둘 이상이면 단일 resolver 우선순위를 가정하지 않고 가능한 repo-local 후보를 모두 검사한다. type-only edge는 runtime graph에서 제외한다. 이 bounded import inventory는 임의 JavaScript 전체의 형식 증명이 아니며 Auth-only facade, exact Auth transport allowlist, gateway/RLS deny와 독립된 CI 권한 경계다. local authority의 recipe image upload/read/manual ownership origin은 remote Auth URL이 아니라 normalized `DATA_SUPABASE_URL`이며 exact loopback HTTP를 허용하되 non-loopback HTTP, origin/path/query 불일치는 fail closed한다. loopback gateway의 `/storage/v1/**` mutation과 private recipe image object GET은 exact `DATA_SUPABASE_SECRET_KEY`와 `x-homecook-internal-scope: recipe-image` 및 기존 path/method allowlist가 모두 맞아야 upstream에 도달한다. public bucket이나 임의 path의 GET은 이 예외에 포함하지 않는다. recipe image object upload는 공식 5 MiB 상한까지 binary body를 그대로 전달하고 초과 body는 upstream 전에 거부하며, sign/control-plane body는 기존 1 MiB 상한을 유지한다. fresh isolated PostgreSQL에 legacy mutation policy를 심은 뒤 `20260730223000_hybrid_storage_browser_mutation_deny.sql`을 실제 적용해 `anon/authenticated x recipe-images/recipe-images-private` mutation policy count `0:0:0:0`을 측정한다. 같은 isolated runtime에서 server-only upload, 실제 Supabase Storage SDK의 byte-for-byte takeover download, sign, remove가 통과해 기존 idempotency/takeover lifecycle과 service-role bypass를 유지한다.
- Cleanup plan/result: 기존 alias fixture corpus는 보조 회귀 자료로 보존하고, 권한 판정은 Auth-only capability·client import entrypoint·gateway/runtime deny로 이동한다. arbitrary JavaScript data-flow 확장은 중단하고 직접 실행 canary만 남기며, 새 보안 경계를 약화하지 않는 범위에서 분석기 코드를 삭제한다.
- Stage 4 source/bundle 보조 canary: direct executable Storage SDK chain과 direct literal Storage REST mutation만 AST로 확인한다. arbitrary alias/data-flow를 권한 근거로 주장하지 않는다. 이전 97 positive/51 negative alias corpus는 `tests/fixtures/hybrid-static-bypasses/legacy-browser-alias-canaries.json`에 `authority:false`로 보존했고 신규 alias 문법 확장은 중단했다. cleanup은 scanner/inventory 관련 본체를 4,838줄에서 1,353줄로 줄였으며 generated inventory의 `browser_supabase_runtime_import_violations: []`가 source PASS authority다.
- Existing-contract boundary: create request 전송 직전에 managed image를 create-owned로 전환하여 unmount cleanup cancel과 attach의 경합을 제거하고, in-flight browser back/reload를 guard하며 unknown network outcome은 cancel/retry 없이 fail-closed한다. 현재 공식 create 계약에는 idempotency key 또는 결과 조회가 없으므로 OS 강제 종료·브라우저 프로세스 kill·응답 유실 뒤 새 세션의 exact result reconciliation은 이 PR 범위에서 완전 해결할 수 없고 별도 승인된 `contract-evolution`이 필요하다.
- migration: `supabase/migrations/20260730090000_hybrid_auth_remote_identity_epoch_mirror.sql`, `supabase/migrations/20260730140000_hybrid_internal_operations_facades.sql`, `supabase/migrations/20260730223000_hybrid_storage_browser_mutation_deny.sql`
- restore/backup evidence: `tests/fixtures/hybrid-stage01-restore-evidence.json`, `tests/fixtures/hybrid-stage2-migration-evidence.json`
- import-options/resolver correction TDD: `import(specifier, options)`의 forbidden/unknown specifier와 `.mjs` specifier가 production TypeScript `Bundler` 해석에서 unsafe `.mts`를 선택하는 same-basename 충돌을 구현 전 static gate `3 failed / 6 passed`로 재현했다. 수정 후 attributes/options 유무와 무관하게 첫 specifier를 판정하고 ambiguous runtime 후보를 모두 inventory하며, safe literal helper/safe same-basename/type-only edge는 violation 0이다.
- split-origin/CommonJS alias correction TDD: remote HTTPS Auth + local loopback HTTP Data/Storage 조합의 managed upload/read, recipe detail, recipe-book cover, manual ownership과 `const loader = require; loader("@supabase/supabase-js")`를 구현 전 `5 failed / 120 passed`로 재현했다. 수정 후 변경 집중 `130 passed`, static gate `9 passed`를 3회 반복했고 confirmed safe helper는 violation 0이다.
- CommonJS lexical-shadow correction TDD: name-only/global alias closure가 parameter/local const/local function/nested shadow의 safe loader 5건을 포함해 expected `20` 대신 `25` violations를 내는 RED를 재현했다. TypeScript lexical symbol identity로 좁힌 뒤 true global direct/assignment/nested alias `2`건은 계속 violation이고 safe shadow `5`건은 0이며, static gate `9 passed`를 3회 반복(`5.04s / 5.08s / 5.85s`)했다.
- CommonJS ambient-shadow correction TDD: ambient `declare const require` direct call과 `declare function require` direct alias가 emit 뒤 free CommonJS loader가 되는데도 inventory가 expected `22` 대신 `20` violations만 반환하는 RED를 재현했다. runtime declaration 판정을 추가한 뒤 두 경로를 차단하고 실제 parameter/local const/local function/nested shadow는 violation 0을 유지하며 static gate `9 passed`를 3회 반복(`5.91s / 5.56s / 5.79s`)했다.
- CommonJS global-augmentation correction TDD: `declare global` function/var의 direct/alias 4건이 emit 뒤 free loader가 되는데도 inventory가 expected `26` 대신 `22` violations만 반환하는 RED를 재현했다. declaration ancestor의 ambient/global augmentation/type-only context까지 판정한 뒤 네 경로를 차단하고 top-level ambient 및 실제 lexical shadow 회귀를 유지하며 static gate `9 passed`를 3회 반복(`5.97s / 5.53s / 10.35s`)했다.
- CommonJS erased-overload correction TDD: body 없는 `function require(...);` signature의 direct/alias가 JS emit에서 free loader로 남는데도 inventory가 expected `28` 대신 `26` violations만 반환하는 RED를 재현했다. `FunctionDeclaration`은 body가 있는 구현만 runtime shadow로 인정하고 동일 symbol의 overload+implementation 조합은 safe local shadow로 유지하며 static gate `9 passed`를 3회 반복(`5.59s / 5.75s / 5.62s`)했다.
- architecture-pivot correction regression: 변경 연관 `12 files`에서 `204 passed / 2 skipped`, fresh PostgreSQL/Storage isolated runtime `10 passed`(52.83초), source/import + bundle 보조 canary `20 passed`를 3회 반복(`4.43s / 4.20s / 4.87s`)
- full regression: `pnpm lint`, `pnpm typecheck`, `pnpm test` (`4718 passed / 226 skipped`), `pnpm test:product` (`2423 passed / 128 skipped`), `pnpm build`, `pnpm validate:workpack`, `pnpm validate:source-of-truth-sync`, `node scripts/validate-automation-spec.mjs --slice hybrid-auth-local-data-production`, `git diff --check`
- security browser regression: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3116 pnpm exec playwright test tests/e2e/qa-security.spec.ts --reporter=line` (12 passed)

## Stage 2 Live / Manual Gates Not Executed

- hosted disposable session revoke negative canary (credentials/operator approval required)
- exact self-hosted compose restart/persistence/ordered-recovery rehearsal
- JWKS rotation old/new overlap and stale-key live rehearsal
- Google/Naver/Kakao production login
- identity replacement/maintenance abort session-binding live 연동
- off-Mac encrypted backup upload/restore drill
- restore/cutover/first local write/production write/24시간 shadow-read mismatch 0 운영 증거

위 항목은 자동화 준비만 완료했으며 이 PR에서 통과한 것으로 체크하지 않는다. 기존 699KB encrypted archive는 JPEG payload가 없어 cutover evidence로 무효이고, complete v2만 local rehearsal evidence다.
