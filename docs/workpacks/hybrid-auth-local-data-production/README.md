# Slice: hybrid-auth-local-data-production

## Goal

원격 Supabase는 Google/Naver/Kakao Auth만 계속 담당하고, Homecook application DB와 Storage는 현재 Mac의 self-hosted Supabase로 이전한다. remote Auth가 발급한 ES256 JWT를 local PostgREST/Storage가 JWKS로 검증해 기존 `auth.uid()` RLS와 owner boundary를 유지한다. 이 workpack은 public API shape를 바꾸지 않고, `auth.users` 직접 의존을 private remote identity mirror로 대체하며, account-generation safeguard를 약화하지 않는 production cutover 기반을 잠근다.

## Branches

- 문서: `docs/hybrid-auth-local-data-production`
- 백엔드/인프라: `feature/be-hybrid-auth-local-data-production`
- 프론트엔드: `feature/fe-hybrid-auth-local-data-production`

## In Scope

- 화면:
  - 신규 화면 없음
  - 기존 LOGIN, `/auth/callback`, SETTINGS account action, MYPAGE, ACCOUNT_QUARANTINE 상태 연결만 유지/검증
- API:
  - 신규 public endpoint 없음
  - 기존 `/api/v1/*` route의 runtime authority를 remote Auth + local Data/Storage로 분리
  - browser 비노출 internal maintenance/reconciler는 public endpoint count에 포함하지 않음
  - 모든 user/public/admin/internal route와 helper를 inventory하고, user route의 service role 우선순위/fallback은 0으로 고정
  - browser direct local Storage 접근은 0이며, Storage user traffic은 loopback claim-verifying gateway만 통과
- 상태 전이:
  - `HOMECOOK_DATA_AUTHORITY=remote -> local-shadow -> local`
  - account-generation capability는 `legacy` 유지
  - first local write 뒤 rollback floor 고정
  - deletion/rejoin/Before User Created Hook은 attempt UUID, monotonic revision, fencing token, remote/local ack, lease, quiet window, abort/resume state를 갖는 two-system maintenance barrier 뒤에만 local write 허용
  - provider linking은 remote freeze를 주장하지 않고 barrier 전후 user/identity population+revision digest CAS와 callback reconcile로 충돌 시 cutover abort
- DB 영향:
  - PII 없는 private `remote_auth_identity_epochs` mirror 추가
  - `auth.users` direct dependency inventory 및 mirror authority replacement matrix 작성
  - local self-hosted PostgREST는 combined local+remote verify JWKS, `PGRST_JWT_AUD=authenticated`, DB pre-request exact claim guard를 사용
  - local Storage는 `JWT_JWKS`와 loopback claim-verifying gateway를 사용하고 upstream port는 Docker internal network only
  - restore 순서: pre-data schema -> hybrid compatibility/FK 교체 -> application data -> post-data validate
  - local `auth.users=0`은 의도된 invariant이며 `pg_constraint`/`pg_depend`/`pg_proc`/policy의 `auth.users` 잔존은 0이어야 함
  - DB dump/restore, Storage copy, count/digest manifest, off-Mac backup evidence, rollback rehearsal evidence
- Schema Change:
  - [ ] 있음 -> `supabase/migrations/<timestamp>_hybrid_auth_local_data_identity_mirror.sql` 생성 필요

## Out of Scope

- self-hosted Supabase Auth를 Google/Naver/Kakao provider authority로 전환하지 않는다.
- remote Auth provider callback, OAuth app 설정, provider secret을 변경하지 않는다.
- remote/local DB dual-write를 만들지 않는다.
- local Postgres `5432`, Studio, Data API, Storage admin endpoint를 LAN/인터넷에 공개하지 않는다.
- public endpoint, request/response field, HTTP status, public error code를 추가하지 않는다.
- account-generation `generation_active` promote, canonical lifecycle/watermark backfill, #3 joint activation을 이 workpack 단독으로 열지 않는다.
- 첫 local write 뒤 env toggle만으로 remote data authority에 rollback하지 않는다.
- user-scoped local Data/Storage client에 service role/secret key를 넣지 않는다.
- remote application DB/Storage를 cutover 직후 삭제하지 않는다.

## Dependencies

| 선행 gate | 상태 | 확인 |
| --- | --- | --- |
| `hybrid-supabase-production-plan` | approved draft | [ ] |
| official 5 contract-evolution v1.7.26/v1.5.30/v1.3.28/v1.3.27/v1.2.30 | required before implementation | [ ] |
| `account-session-generation-foundation` | merged | [ ] |
| `recipe-visibility-read-hardening` | not activation prerequisite, but generation/image activation predecessor | [ ] |
| off-Mac backup/rollback rehearsal | required before final cutover | [ ] |
| storage capacity gate | current evidence pass: target free space 약 120GiB, current DB+Storage 약 4MiB; final 직전 재검증 필요 | [ ] |

## Backend First Contract

### Auth / Data client split

- Auth client:
  - browser/server OAuth, callback, logout, provider linking, refresh는 remote Supabase Auth URL/key만 사용한다.
  - access token과 refresh token은 local Data/Storage에 저장하지 않는다.
  - maintenance 중 provider linking은 Hook으로 막을 수 없으므로 Homecook UI를 닫고 barrier 전후 remote identity digest CAS와 in-flight callback reconcile로 race를 탐지한다.
- Data client:
  - server route request마다 local Data client를 만든다.
  - `apikey`는 local publishable key다.
  - `Authorization`은 remote user JWT다.
  - user-scoped client는 service role/secret key를 절대 사용하지 않는다.
  - user route에서 service role priority/fallback은 0이며, internal allowlist에 없는 service role 사용은 CI blocker다.
- Admin/internal client:
  - migration, reconciler, backup, internal maintenance만 local secret/service key를 사용한다.
  - user response 생성이나 owner-scoped mutation fallback에 사용하지 않는다.
  - local anon/service token은 내부 경로에서만 별도 허용하고 user-scoped gateway는 거부한다.

### JWT / JWKS

- remote Auth issuer는 exact URL로 고정한다.
- local PostgREST는 combined local+remote verify JWKS를 사용하되 `PGRST_JWT_AUD=authenticated`와 DB pre-request exact claim guard를 함께 둔다.
- local Storage는 `JWT_JWKS`를 사용하되 외부에서 우회 불가능한 loopback claim-verifying gateway를 단일 user entrypoint로 둔다. Storage upstream port는 Docker internal network에만 둔다.
- authenticated Data/Storage request마다 gateway가 remote `/auth/v1/user`의 `(iss, sub, session_id, user.created_at)`를 current active mirror epoch와 결합한다.
- PostgREST mutation은 gateway HMAC attestation을 DB pre-request가 active mirror와 같은 transaction에서 재검증한다. Storage mutation은 owner fence와 epoch를 바로 전에 다시 확인한다.
- 검증 항목: allowlisted `alg`/`kid`, remote exact `iss`, `aud=authenticated`, `role=authenticated`, UUID `sub`, UUID `session_id`, `iat`/`nbf`/`exp` time claims.
- remote private signing key는 Mac/local container/env에 복사하지 않는다.
- JWKS sync는 atomic replace, reload/recreate, canary RLS read, stale alert를 포함한다.

### Identity mirror

- private mirror는 remote verified session 또는 Auth Admin read-only reconciler 결과만 받는다.
- mirror 저장 허용: active epoch 단일성, `issuer`, `owner_uuid`, `identity_created_at`, `remote_revision`, `remote_identity_digest`, `verified_at`/`deleted_terminal_at`, `evidence_revision`.
- 저장 금지: raw/profile PII, raw email, raw provider subject, raw token, refresh token, OAuth code, provider payload, cookie, unbounded JSON.
- profile bootstrap은 검증된 remote session/Admin 결과의 exact allowlist 입력만 일회성 internal RPC로 local profile 생성에 전달하고 mirror에는 저장하지 않는다.
- `auth.users` direct read/FK/digest/created_at authority는 mirror read로 대체하며 FK/함수/digest/lock별 replacement matrix를 작성한다.
- historical audit actor는 set-null 또는 write-time snapshot policy로 처리한다.
- mirror stale/duplicate/conflict/deleted-recreated ambiguity는 personal write와 cutover를 fail closed한다.
- missing/stale/deleted/replaced session-epoch binding과 `iat < identity_created_at` token은 DB/Storage personal write에서 fail closed한다.

### Public API

- 기존 `{ success, data, error }` wrapper와 `error { code, message, fields[] }`를 유지한다.
- 신규 public endpoint/field/status/error 없음.
- local DB/Storage 장애는 기존 endpoint별 unauthorized/internal/error wrapper 범위 안에서 처리한다.
- client body의 owner/generation/provider/email/capability 값은 authority가 아니다.

### Cutover and rollback

- `remote`: 기존 remote Data authority.
- `local-shadow`: production response/write는 remote, safe GET digest만 local 비교.
- `local`: local DB/Storage가 write authority.
- remote Supabase에는 Auth Hook용 최소 control-plane table/function만 writable 예외로 남기고 application public DB/Storage는 read-only recovery copy로 둔다.
- provider identity set은 local owner/epoch authority가 아니다. barrier 전후 remote population/revision digest CAS가 바뀌면 cutover attempt를 abort/restart한다.
- deletion은 local owner fence/cleanup → remote Admin exact epoch delete → terminal readback → mirror terminal → lifecycle complete의 멱등 saga다.
- 첫 local write 전에는 `remote`로 복귀 가능하다.
- 첫 local write 뒤 단순 env rollback 금지. write freeze + local delta export + remote restore 검증 또는 forward-fix만 허용한다.
- pre-write rollback rehearsal과 post-write rollback rehearsal을 분리해 evidence를 남긴다.
- DB+Storage cut line은 마지막 remote app write ack, final DB digest, final Storage manifest, local barrier ack가 모두 같은 attempt/revision/fencing token을 가리킬 때만 확정한다.

## Frontend Delivery Mode

- 신규 화면 없음.
- 기존 LOGIN/provider buttons/callback/SETTINGS/MYPAGE/ACCOUNT_QUARANTINE을 그대로 사용한다.
- 필수 상태: `loading / empty / error / read-only / unauthorized`.
- local Data/Storage 내부 정보, JWKS key id, service key, token, project id는 화면에 표시하지 않는다.
- provider login return-to-action은 기존 동작을 유지한다.
- Design Status: N/A.

## Design Authority

- UI risk: `not-required`
- Anchor screen dependency: 없음
- Visual artifact: N/A
- Authority status: `not-required`
- Notes: runtime authority 변경이며 신규 화면/anchor extension 없음.

## Design Status

- [ ] 임시 UI (temporary)
- [ ] 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed)
- [x] N/A — 신규 FE 화면 없음

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/engineering/hybrid-supabase-production-plan.md`
- `docs/workpacks/account-session-generation-foundation/README.md`
- `docs/요구사항기준선-v1.7.26.md`
- `docs/화면정의서-v1.5.30.md`
- `docs/유저flow맵-v1.3.28.md`
- `docs/db설계-v1.3.27.md`
- `docs/api문서-v1.2.30.md`
- Supabase official: JWT, signing keys, self-hosted auth keys, Storage config, S3 session token

## QA / Test Data Plan

- deterministic fixtures:
  - Google/Naver/Kakao remote JWT samples with valid/expired/wrong issuer/wrong audience/unknown kid
  - User A/B private rows and Storage paths
  - remote deleted/recreated same UUID epoch pair
  - provider linking same-user/different-user conflict
  - direct/automatic linking race가 barrier digest CAS mismatch를 만드는 fixture
  - deletion exact-epoch retry/duplicate/identity-replaced fixture
  - mirror stale/duplicate provider subject/conflicting epoch
  - local DB down, local Storage down, JWKS stale
  - local Auth token, local legacy token, remote service_role token, missing audience, malformed `session_id`, wrong issuer는 user-scoped path에서 모두 fail closed
  - known semantic fixture: `public.users=5`, `admin missing=1`, `audit missing=99`; 교정 전 fail, 교정 후 pass
- real DB smoke:
  - local PostgREST receives remote JWT and `auth.uid()` equals remote `sub`
  - session-authority gateway가 remote verified `(iss, sub, session_id, created_at)`를 active mirror epoch와 결합
  - deleted/recreated same UUID의 이전 token/session은 DB와 Storage write 모두 거부
  - DB pre-request guard rejects non-remote exact `iss`, non-`authenticated` audience/role, non-UUID `sub`/`session_id`, invalid time claims, non-allowlisted alg/kid
  - User A cannot read/write User B rows
  - local Storage owner policy applies only through loopback claim-verifying gateway
  - browser bundle direct Storage URL/key/SDK write/delete path count is 0
  - route/helper inventory proves user route service-role priority/fallback count is 0 and internal allowlist is exact
  - remote application DB/Storage write count remains 0 after local cutover
- migration/rehearsal:
  - remote dump restore into isolated local DB in order: pre-data schema -> hybrid compatibility/FK 교체 -> application data -> post-data validate
  - local `auth.users=0` remains invariant
  - `pg_constraint`/`pg_depend`/`pg_proc`/policy `auth.users` residual count is 0
  - table count/digest and owner count/digest
  - Storage object count/bytes/MIME/hash/reference manifest
  - replay idempotency
  - off-Mac encrypted backup evidence schema, key separation recovery, DB+Storage cut line, pre/post-write rollback rehearsal
  - current capacity evidence: target free space 약 120GiB and current DB+Storage 약 4MiB pass the capacity gate; final preflight revalidates before cutover
- external/manual:
  - real Google/Naver/Kakao login
  - Mac reboot/Docker ordered recovery
  - off-Mac encrypted backup restore drill

## Key Rules

- Remote Auth only; local DB/Storage only.
- local Data/Storage is loopback-only.
- remote Auth JWT ES256/JWKS verification plus exact claim guard is mandatory for local RLS.
- Storage user access must go through loopback claim-verifying gateway; browser direct local Storage access is 0.
- private signing key and refresh token never enter local Data/Storage.
- private remote identity mirror replaces application-owned `auth.users` direct dependency without raw/profile PII.
- local `auth.users=0` after restore is intended, not a failure.
- account-generation capability remains `legacy`.
- two-system maintenance barrier is required for deletion/rejoin/Before User Created Hook safety; provider linking은 before/after remote digest CAS로 race를 탐지한다.
- no public API shape change.
- no service role in any user-scoped local Data/Storage path; exact internal allowlist only.
- no remote/local dual-write.
- no env-only rollback after first local write.
- no backup-free production cutover.
- remote application public DB/Storage is read-only after cutover except minimal Auth Hook control-plane table/function.

## Role Separation

이 Stage는 사용자 요청에 따라 역할 분리된 별도 GPT Codex 작업만 사용한다. Claude 또는 Claude 기반 리뷰/승인은 이 workpack의 evidence로 인정하지 않는다.

## Contract Evolution Candidates

없음. 사용자가 이미 승인한 hybrid contract-evolution을 공식 5종에 먼저 반영한 뒤 이 workpack은 해당 계약을 소비한다. 문서에 없는 public endpoint/field/status/error 후보는 이번 scope에 넣지 않는다.

## Primary User Path

1. 사용자가 기존 Google/Naver/Kakao 버튼으로 로그인한다.
2. remote Auth callback이 완료되고 Homecook server가 remote session을 검증한다.
3. server가 private identity mirror를 멱등 갱신하고 local Data client를 만든다.
4. 사용자가 recipe/planner/pantry/shopping/recipebook/image 기능을 기존 화면과 API shape 그대로 사용한다.
5. local PostgREST와 Storage gateway가 remote JWT 서명과 exact claims를 검증하고 기존 RLS로 본인 데이터만 허용한다.
6. 운영자는 shadow read, final cutover, first local write, 14일 remote read-only retention을 순서대로 검증한다.

## Delivery Checklist

> 이 체크리스트는 Stage 2 이후 implementation evidence가 생긴 뒤에만 체크한다.

- [ ] official 5 + SOT contract-evolution이 merge되어 implementation 기준이 된다 <!-- omo:id=delivery-hybrid-official-contract;stage=2;scope=shared;review=3,6 -->
- [ ] Auth/Data/Storage env와 client factory가 분리된다 <!-- omo:id=delivery-hybrid-client-split;stage=2;scope=backend;review=3,6 -->
- [ ] user-scoped local Data client에 service role/secret key가 들어가지 않음을 테스트로 고정한다 <!-- omo:id=delivery-hybrid-no-service-role-user-client;stage=2;scope=backend;review=3,6 -->
- [ ] local PostgREST가 combined local+remote verify JWKS, `PGRST_JWT_AUD=authenticated`, DB pre-request exact claim guard로 remote `iss`/`aud`/`role`/UUID `sub`/UUID `session_id`/time claims/allowlisted alg/kid를 검증하고 `auth.uid()`를 remote `sub`로 적용한다 <!-- omo:id=delivery-hybrid-postgrest-jwks;stage=2;scope=backend;review=3,6 -->
- [ ] local Storage가 `JWT_JWKS`와 loopback claim-verifying gateway 단일 진입점으로 remote JWT owner RLS를 적용하고 upstream port가 Docker internal network only임을 증명한다 <!-- omo:id=delivery-hybrid-storage-jwks;stage=2;scope=backend;review=3,6 -->
- [ ] private remote identity mirror가 raw/profile PII 없이 active epoch, issuer/owner/created_at, remote revision/digest, verified/deleted terminal, evidence revision만 저장하고 `auth.users` dependency replacement matrix가 완료된다 <!-- omo:id=delivery-hybrid-identity-mirror;stage=2;scope=backend;review=3,6 -->
- [ ] deletion/rejoin/Before User Created Hook barrier와 provider linking before/after remote digest CAS가 attempt UUID, monotonic revision, fencing token, remote/local ack, lease/quiet window/abort-resume state로 fail-closed 검증된다 <!-- omo:id=delivery-hybrid-two-system-barrier;stage=2;scope=backend;review=3,6 -->
- [ ] account-generation capability가 `legacy`이고 safeguard가 약화되지 않음을 remote/local smoke로 증명한다 <!-- omo:id=delivery-hybrid-generation-legacy;stage=2;scope=shared;review=3,6 -->
- [ ] local DB/Storage/Studio/Postgres가 loopback-only임을 네트워크 스캔으로 검증한다 <!-- omo:id=delivery-hybrid-loopback-only;stage=2;scope=backend;review=3,6 -->
- [ ] user/public/admin/internal route/helper inventory와 exact internal service-role allowlist, AST/static CI gate, browser direct Storage count 0이 통과한다 <!-- omo:id=delivery-hybrid-route-authority-inventory;stage=2;scope=backend;review=3,6 -->
- [ ] remote DB dump restore와 Storage copy rehearsal이 pre-data schema -> hybrid compatibility/FK 교체 -> application data -> post-data validate 순서로 수행되고 `auth.users=0`, dependency residual 0, known fixture `public.users=5/admin missing=1/audit missing=99` 교정 전 fail·교정 후 pass를 증명한다 <!-- omo:id=delivery-hybrid-migration-rehearsal;stage=2;scope=backend;review=3,6 -->
- [ ] `local-shadow` 24시간 safe GET semantic digest mismatch 0을 기록한다 <!-- omo:id=delivery-hybrid-shadow-read;stage=2;scope=shared;review=3,6 -->
- [ ] final cutover 전 off-Mac encrypted backup evidence schema, restore drill, DB+Storage cut line, key 분리 복구, pre/post-write rollback rehearsal이 있다 <!-- omo:id=delivery-hybrid-backup-restore;stage=2;scope=shared;review=3,6 -->
- [ ] first local write rollback floor와 no-env-rollback guard가 문서/검증/운영 runbook에 반영된다 <!-- omo:id=delivery-hybrid-rollback-floor;stage=2;scope=shared;review=3,6 -->
- [ ] current capacity evidence는 target free space 약 120GiB/current DB+Storage 약 4MiB로 gate pass이며 final 직전 재검증을 수행한다 <!-- omo:id=delivery-hybrid-current-capacity-evidence;stage=2;scope=shared;review=3,6 -->
- [ ] Google/Naver/Kakao real login 후 local CRUD/Storage smoke가 통과한다 <!-- omo:id=delivery-hybrid-provider-smoke;stage=4;scope=shared;review=6 -->
- [ ] independent Codex architecture/security review가 blocker 0으로 닫힌다 <!-- omo:id=delivery-hybrid-independent-review;stage=2;scope=shared;review=3,6 -->
