# Unresolved Blocker

- storage disk capacity blocker는 stale로 제거한다. 최신 evidence 기준 target free space는 약 120GiB이고 current DB+Storage data는 약 4MiB라서 `max(80GiB, DB+Storage used*3)` disk gate를 통과한다. 그러나 2026-07-30 격리 production runtime의 encrypted swap free `650,840,637` bytes가 conservative service peak `907,214,848` bytes보다 작으므로 전체 capacity gate는 현재 **BLOCKED**다. swap headroom을 확보하고 final cutover 직전 전체 capacity preflight를 다시 통과하기 전에는 24시간 shadow/cutover를 시작하지 않는다.
- local PostgREST가 combined local+remote verify JWKS, `PGRST_JWT_AUD=authenticated`, DB pre-request exact claim guard로 remote exact `iss`, `aud=authenticated`, `role=authenticated`, UUID `sub`, UUID `session_id`, `iat`/`nbf`/`exp`, allowlisted `alg`/`kid`를 검증한다는 canary 전 application write 금지.
- local Storage가 `JWT_JWKS`와 loopback claim-verifying gateway 단일 user entrypoint를 사용하고 upstream port가 Docker internal network only라는 증거 전 application Storage write 금지. local anon/service token은 internal allowlist에서만 허용하며 user-scoped gateway에서는 거부되어야 한다.
- remote Auth와 local DB가 한 transaction이 아니므로 deletion/rejoin/Before User Created Hook을 보호할 structured barrier와 provider linking before/after digest CAS 구현·검증 전 local write cutover 금지. barrier는 attempt UUID, monotonic revision, fencing token, remote/local ack, lease, quiet window, abort/resume state를 포함해야 한다.
- remote Supabase writable scope가 Auth Hook용 최소 control-plane table/function을 넘거나, application public DB/Storage read-only recovery copy 원칙이 깨지면 cutover 금지.
- hosted Auth provider linking은 Hook으로 막히지 않으므로 remote freeze를 주장하지 않는다. maintenance UI block, barrier 전후 user/identity population+revision digest CAS, in-flight callback reconcile, direct/automatic race 시 attempt abort/restart 증거 전 local write cutover 금지.
- deletion exact-epoch saga의 local owner fence/cleanup, remote Admin `id+created_at` verify/delete, terminal readback, retry/duplicate/identity-replaced, mirror terminal/lifecycle complete 증거 전 local write cutover 금지.
- `auth.users` direct dependency inventory와 private mirror replacement matrix가 완료되기 전 account-generation 관련 migration/activation 금지. replacement matrix는 세 FK, 함수, digest, lock을 항목별로 포함해야 한다.
- private mirror가 raw/profile PII를 저장하거나 `private.remote_auth_identity_epochs` 최소 필드(active epoch 단일성, issuer/owner/created_at, remote revision/digest, verified/deleted terminal, evidence revision)를 넘으면 cutover 금지.
- profile bootstrap이 검증된 remote session/Admin 결과의 exact allowlist 입력을 일회성 internal RPC로 전달하지 않거나 mirror에 profile PII를 저장하면 cutover 금지.
- remote `/auth/v1/user` 검증 결과의 `(iss, sub, session_id, user.created_at)`와 current active mirror epoch binding이 모든 personal DB/Storage request에 강제되지 않으면 cutover 금지.
- `/auth/v1/user`와 epoch binding만으로 logout/revocation 탐지를 완료했다고 주장하면 cutover 금지. session-liveness HMAC binding 생성/폐기/재검증/TTL, logout/deletion/quarantine/identity replacement/maintenance abort revoke/delete, remote outage fail-closed가 모든 user-scoped DB/Storage request에 강제되어야 한다.
- missing/stale/deleted/identity-replaced binding, `iat < identity_created_at`, deleted/recreated same UUID의 old token/session이 DB 또는 Storage write를 통과하면 즉시 cutover 금지.
- stale session/epoch/generation에 신규 public status/error code를 만들면 즉시 blocker다. public mapping은 기존 `409 ACCOUNT_SESSION_STALE`, `409 ACCOUNT_GENERATION_STALE`, `503 ACCOUNT_LIFECYCLE_MAINTENANCE`만 사용한다.
- 모든 user route에서 service role priority/fallback count가 0이 아니거나 user/public/admin/internal inventory, exact internal allowlist, AST/static CI gate, browser direct Storage 0 증거가 없으면 cutover 금지.
- restore 순서가 pre-data schema -> hybrid compatibility/FK 교체 -> application data -> post-data validate가 아니면 cutover 금지. local `auth.users=0`은 의도된 invariant이며 `pg_constraint`/`pg_depend`/`pg_proc`/policy 잔존 0과 known fixture `public.users=5/admin missing=1/audit missing=99` 교정 전 fail·교정 후 pass를 증명해야 한다.
- off-Mac encrypted backup evidence schema, DB+Storage cut line, key 분리 복구, pre-write rollback rehearsal, post-write rollback rehearsal 전 final cutover 금지.
- `recipe-visibility-read-hardening`/Storage registry 계열 보호가 준비되지 않은 상태에서 generation_active, image cleanup/auth deletion complete barrier를 활성화 금지.

# 구현·cutover 금지선

- official 5 + SOT + 이 workpack의 Stage 1 merge와 independent re-review PASS 전 implementation/migration apply 금지.
- Stage 2 이후에도 isolated/local rehearsal 외 production application write는 Stage 7 gate 전 금지.
- Google/Naver/Kakao callback을 self-hosted Auth로 옮기기 금지.
- public endpoint/request/response field/status/error 추가 금지.
- local Data/Storage/Studio/Postgres LAN 또는 인터넷 공개 금지.
- remote/private signing key, refresh token, OAuth code/provider payload 저장 금지.
- user-scoped local Data client에 service role/secret key 사용 금지.
- user-scoped local Storage gateway에 local anon/service token 또는 service role/secret key 사용 금지.
- service role 누락 시 user client fallback 금지.
- browser direct local Storage 접근 금지.
- remote/local dual-write 금지.
- account-generation capability `legacy` 외 전환 금지.
- 기존 RLS/owner/session-generation/delete/rejoin/provider-linking safeguard 완화 금지.
- 첫 local write 뒤 단순 env rollback 금지.
- remote application DB/Storage 14일 read-only retention 전 폐기 금지.
- final cutover 뒤 remote Supabase application public DB/Storage writable 유지 금지. 예외는 Auth Hook용 최소 control-plane table/function뿐이다.
- Claude 또는 Claude 기반 리뷰/승인을 이 Stage evidence로 사용 금지. 이 Stage는 역할 분리된 별도 GPT Codex 작업만 사용한다.
