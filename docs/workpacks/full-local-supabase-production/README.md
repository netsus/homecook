# Slice: full-local-supabase-production

## Goal

현재 Mac에서 self-hosted Supabase Auth, PostgreSQL, PostgREST와 Storage를 하나의 production authority로 운영한다. Google/Naver/Kakao 로그인, 기존 사용자 UUID, `auth.uid()` RLS, account-generation과 owner/read-only/delete/recreate 경계를 유지하면서 remote Auth identity mirror와 two-system barrier를 안정화 뒤 제거 가능한 dormant 경로로 전환한다.

## Branches

- Stage -1 contract: `docs/full-local-supabase-contract`
- runtime/secret/S3: `feature/full-local-supabase-runtime`
- DB/session/flow ledger: `feature/full-local-auth-db-foundation`
- app callback/client: `feature/full-local-auth-app-adapter`
- restore/cutover automation: `chore/full-local-supabase-restore-cutover`

한 PR이 다른 단계의 gate를 우회하지 않는다. Stage -1 문서가 master에 merge되기 전 product code/schema를 변경하지 않으며, final cutover는 PR merge가 아닌 Manual Only 운영자 gate다.

## In Scope

- pinned self-hosted Supabase Auth/API gateway/PostgREST/Storage runtime
- production-only social Auth policy와 public `/auth/v1/*` allowlist reverse proxy
- Keychain → repo 밖 mode 제한 file → read-only secret mount → entrypoint 전달
- Google/Kakao provider와 Naver `custom:naver` isolated HTTPS login/link 검증
- `HOMECOOK_AUTH_AUTHORITY=remote|local` remote-default adapter와 fail-closed env guard
- server-issued `/auth/flow/start|cancel`, private `auth_flow_attempts`, 900초 TTL/960초 drain/epoch rotation
- local issuer용 app-owned session authority binding과 pre-expiry revoke
- stable Auth UUID restore, transient remote session 제외, account lifecycle/delete/recreate 보호
- official S3/rclone Storage copy, semantic manifest, off-Mac encrypted backup/restore
- Cloudflare app/Auth hostname, public path 차단, rate limit/forwarded IP/cache 정책
- provider별 login/link, RLS/Storage A/B, reboot/recovery, pre/post-floor rollback rehearsal

Schema Change:
- [x] 있음. 과거 migration은 수정하지 않고 additive migration으로 flow ledger, local session binding와 compatibility transition을 추가한다.

## Out of Scope

- OAuth, PKCE, refresh token 또는 session 서버를 Homecook 코드로 직접 구현
- browser direct PostgREST/Storage 또는 user path service-role fallback
- remote session/refresh token/flow state 이관
- hosted Storage 내부 파일이나 Docker volume 직접 복사
- PostgreSQL, Studio, Docker socket, `/rest/v1`, `/storage/v1` public 노출
- official contract/restore/provider evidence 없이 first local production Auth mutation 실행
- 14일 안정화와 dependency 0 이전 hybrid migration/history 삭제
- 운영자 별도 승인 없는 remote project 삭제 또는 env-only post-floor rollback

## Dependencies

| Gate | 상태 | 의미 |
| --- | --- | --- |
| official tuple v1.7.28/v1.5.32/v1.3.30/DB v1.3.30/API v1.2.33 | Stage -1 | 본 workpack 구현 전 merge 필수 |
| `account-session-generation-foundation` | merged, relock required | local issuer/session binding으로 의미 재검증 |
| `recipe-visibility-read-hardening` | merged, relock required | owner/private Storage와 delete/recreate 보호 유지 |
| hybrid runtime/data migration | historical implementation | reusable infra는 선별 재사용하고 remote-only authority는 dormant 처리 |
| domain/Cloudflare/provider consoles | Manual Only | 실제 public callback/live OAuth에 필요 |
| off-Mac encrypted backup target | Manual Only | final cutover 전 실제 restore 2회 필요 |

현재 deployment에는 hybrid final cutover와 local application write가 없었다. 따라서 remote Auth·application DB·Storage가 하나의 migration source-of-record이며, 기존 local rehearsal 데이터는 fresh restore 전에 폐기하고 source와 merge하지 않는다.

## Backend First Contract

### Auth and flow authority

- public URL contract는 `SUPABASE_PUBLIC_URL=https://auth.<owned-domain>`, `API_EXTERNAL_URL=https://auth.<owned-domain>/auth/v1`, callback `${API_EXTERNAL_URL}/callback`, site `https://app.<owned-domain>`이다.
- OAuth SDK는 `/auth/flow/start`가 ledger insert와 `__Host-homecook-auth-flow` HttpOnly cookie를 발급한 뒤에만 호출한다.
- callback/link callback은 ledger provider/flow/authority/epoch와 local Auth identity를 exact 비교한다. query provider와 client-written cookie는 authority가 아니다.
- local JWT `sub`는 existing `auth.uid()`와 exact 일치해야 하며 callback/refresh는 `session_id` HMAC binding을 멱등 갱신한다.
- logout/delete/quarantine/identity replacement는 binding을 즉시 revoke하고 pre-expiry stale JWT mutation을 차단한다.

### Runtime and secret boundary

- Docker images는 exact digest로 pin하고 Postgres → Auth → PostgREST/Storage → gateway → Next.js ordered health를 사용한다.
- social-only production config는 email/password, OTP, SMS와 anonymous signup을 차단하고 Studio/public DB/Storage port를 열지 않는다.
- secret은 Keychain에서 repo 밖 `0700`/`0600` file로 materialize하고 `/run/secrets` read-only mount로 전달한다. Compose/Docker `Config.Env`, Git, bundle, build와 log의 raw/base64/URL-encoded secret match는 0이다.

### Data and rollback authority

- `auth.users.id`와 identity UUID를 보존하고 remote transient session/refresh/flow row는 local promote count 0이어야 한다.
- Auth/application DB/Storage는 같은 maintenance attempt의 remote snapshot만 source로 사용하고 기존 local rehearsal row/object의 승격·병합은 0이어야 한다.
- Storage는 matching bucket을 준비한 뒤 source hosted S3 → pinned rclone → loopback local S3로 복사한다. path/count/bytes/MIME/SHA-256/DB reference/owner prefix mismatch는 0이다.
- rollback floor는 첫 local session, identity link 또는 user-scoped write 중 최초 성공이다. floor 뒤에는 Auth/application/Storage delta 없는 env-only rollback을 거부한다.

## Frontend Delivery Mode

- 기존 LOGIN, callback/link callback, SETTINGS/MYPAGE와 return-to-action을 재사용한다.
- 신규 제품 화면·navigation·layout은 없다. maintenance, re-login, provider error/retry 상태를 기존 surface에 연결한다.
- 320/390/desktop에서 중복 제출, CTA 가림, focus loss와 horizontal overflow가 없어야 한다.

## Design Authority

- UI risk: `low-risk`
- 신규 화면: 없음
- 기존 로그인 상태 연결만 변경하므로 Stage 1 design artifact는 N/A다. Stage 4는 실제 320/390/desktop screenshot과 accessibility regression evidence를 요구한다.

## QA / Test Data Plan

- isolated fresh/replay PostgreSQL with stable A/B UUID, linked identities, revoked/stale sessions와 G1/G2 recreate fixture
- Google/Naver/Kakao login/link success, cancel, conflict, wrong provider/flow/epoch, replay, expiry
- Auth/DB/Storage down, stale key, 429, Cloudflare reconnect와 Mac reboot fault injection
- hosted/local Storage count/digest/reference/owner-prefix manifest와 temporary credential cleanup
- production mutation은 merged exact SHA, restore/provider/manual evidence와 별도 운영자 승인 전 0이다.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/engineering/full-local-supabase-production-plan.md`
- `docs/요구사항기준선-v1.7.28.md`
- `docs/화면정의서-v1.5.32.md`
- `docs/유저flow맵-v1.3.30.md`
- `docs/db설계-v1.3.30.md`
- `docs/api문서-v1.2.33.md`

## Manual Only

- 실제 소유 domain, Cloudflare named tunnel과 app/Auth HTTPS hostname 설정
- Google/Kakao/Naver 개발자 console callback·secret 변경과 실제 계정 smoke
- remote `auth.*`/Storage inventory, temporary hosted S3 key 생성·revoke
- Keychain production secret, off-Mac backup key/target와 실제 restore 2회
- final maintenance window, 960초 drain, provider callback 전환과 first local Auth mutation 승인
- 14일 안정화 뒤 remote/hybrid cleanup 또는 장기 보존 결정
