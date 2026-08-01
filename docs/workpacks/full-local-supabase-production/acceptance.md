# Acceptance Checklist: full-local-supabase-production

> 이 Stage -1 문서는 구현·migration·production cutover 완료를 주장하지 않는다. Manual Only 외 항목은 exact commit의 자동/독립 증거가 생긴 뒤에만 체크한다.

## Contract / Runtime

- [x] 공식 5종과 CURRENT_SOURCE_OF_TRUTH가 full-local authority를 active 계약으로 고정한다 <!-- omo:id=accept-full-local-official-contract;stage=1;scope=shared;review=1,6 -->
- [x] Auth/API gateway/PostgREST/Storage image digest와 ordered health가 고정된다 <!-- omo:id=accept-full-local-runtime-health;stage=2;scope=backend;review=3,6 -->
- [x] production email/password/OTP/SMS/anonymous signup과 Studio/public DB/Storage port가 fail closed된다 <!-- omo:id=accept-full-local-production-auth-surface;stage=2;scope=backend;review=3,6 -->
- [x] public Auth proxy는 `/auth/v1/*`만 허용하고 `/rest/v1`, `/storage/v1`, Studio/Postgres/direct origin을 차단한다 <!-- omo:id=accept-full-local-public-allowlist;stage=2;scope=backend;review=3,6 -->
- [x] Keychain→`0700`/`0600` file→read-only mount→entrypoint 주입과 secret scan이 통과한다 <!-- omo:id=accept-full-local-secret-mount;stage=2;scope=backend;review=3,6 -->

## OAuth / Session / RLS

- [ ] Google/Kakao/Naver login과 link가 local Auth에서 실제 통과한다 <!-- omo:id=accept-full-local-provider-live;stage=4;scope=shared;review=6 -->
- [x] `/auth/flow/start` 성공 전 OAuth SDK 호출과 client-side authority cookie write가 0이다 <!-- omo:id=accept-full-local-flow-start-before-sdk;stage=4;scope=frontend;review=5,6 -->
- [x] flow ledger는 HMAC attempt만 저장하고 TTL 900초, terminal, outstanding, 960초 drain과 epoch rejection을 지킨다 <!-- omo:id=accept-full-local-flow-ledger;stage=2;scope=backend;review=3,6 -->
- [x] callback/link callback은 ledger provider/flow를 sole authority로 사용하고 replay/wrong/expired/old remote flow를 거부한다 <!-- omo:id=accept-full-local-callback-authority;stage=2;scope=backend;review=3,6 -->
- [ ] local JWT `sub`와 `auth.uid()` mismatch가 0이고 User A로 User B row/object read/write/delete가 0이다 <!-- omo:id=accept-full-local-rls-owner;stage=2;scope=backend;review=3,6 -->
- [ ] callback/refresh가 local session binding을 갱신하고 logout/delete/quarantine/recreate 뒤 pre-expiry stale token mutation이 0이다 <!-- omo:id=accept-full-local-session-revoke;stage=2;scope=backend;review=3,6 -->
- [x] logout은 binding revoke → local Auth sign-out → cookie 만료 순서를 지키고 partial failure/retry에도 stale JWT mutation과 cross-session revoke가 0이다 <!-- omo:id=accept-full-local-logout-order;stage=2;scope=backend;review=3,6 -->
- [x] user path service-role priority/fallback과 browser direct Data/Storage mutation이 0이다 <!-- omo:id=accept-full-local-no-service-fallback;stage=2;scope=backend;review=3,6 -->

## Migration / Storage / Rollback

- [ ] stable Auth UUID와 owner semantic mismatch가 0이고 transient remote session/refresh/flow promote row가 0이다 <!-- omo:id=accept-full-local-auth-restore;stage=2;scope=backend;review=3,6 -->
- [ ] Auth relation/column manifest 미분류 항목이 0이고 fresh restore 2회가 같은 digest를 만든다 <!-- omo:id=accept-full-local-restore-replay;stage=2;scope=backend;review=3,6 -->
- [ ] S3/rclone copy 뒤 path/count/bytes/MIME/SHA-256/DB reference/owner prefix mismatch가 0이다 <!-- omo:id=accept-full-local-storage-copy;stage=2;scope=backend;review=3,6 -->
- [ ] direct file copy, public/direct-container S3 path와 temporary credential 잔존이 0이다 <!-- omo:id=accept-full-local-storage-boundary;stage=2;scope=backend;review=3,6 -->
- [ ] off-Mac encrypted restore와 Mac reboot/ordered recovery가 통과한다 <!-- omo:id=accept-full-local-disaster-recovery;stage=2;scope=shared;review=3,6 -->
- [ ] pre-floor와 post-floor rollback rehearsal이 모두 통과하고 floor 뒤 env-only rollback이 차단된다 <!-- omo:id=accept-full-local-rollback-floor;stage=2;scope=shared;review=3,6 -->
- [ ] dependency/image audit의 release blocker가 0이다 <!-- omo:id=accept-full-local-dependency-gate;stage=2;scope=backend;review=3,6 -->

## UI / Browser

- [ ] remote session 사용자는 기존 LOGIN에서 한 번 재로그인하고 return-to-action이 유지된다 <!-- omo:id=accept-full-local-relogin-return;stage=4;scope=frontend;review=5,6 -->
- [ ] login/link maintenance, loading, error, cancel, conflict와 retry 상태가 기존 화면에 안전하게 표시된다 <!-- omo:id=accept-full-local-auth-ui-states;stage=4;scope=frontend;review=5,6 -->
- [ ] 320/390/desktop에서 overflow, focus loss, CTA 가림과 44px 미만 touch target이 0이다 <!-- omo:id=accept-full-local-responsive;stage=4;scope=frontend;review=5,6 -->

## Independent Review / Merge Gate

- [x] 별도 Codex internal 1.5 reviewer가 Stage 1 contract artifact를 승인하고 unresolved contract finding이 0이다 <!-- omo:id=accept-full-local-doc-review;stage=1;scope=shared;review=1,6 -->
- [ ] 구현과 분리된 security/DB와 five-axis reviewer finding이 0이다 <!-- omo:id=accept-full-local-independent-review;stage=3;scope=shared;review=3,6 -->
- [ ] 현재 PR head의 모든 check가 success 또는 정책상 정상 skip이며 pending/missing/stale/fail이 0이다 <!-- omo:id=accept-full-local-current-head-green;stage=6;scope=shared;review=6 -->

## Manual Only

- [ ] 실제 domain/Cloudflare/app·Auth HTTPS와 외부 LTE/5G 접근 확인
- [ ] Google/Kakao/Naver 개발자 console callback과 production secret 변경
- [ ] remote final Auth/DB/Storage backup, hosted S3 key 생성·copy·revoke
- [ ] off-Mac target에서 complete restore 2회
- [ ] remote outstanding 0, epoch rotation, provider callback 전환과 first local Auth mutation 별도 승인
- [ ] 14일 안정화와 remote/hybrid cleanup 또는 보존 결정

## Stage 1 Review Evidence

- 2026-08-01 독립 Codex `code-reviewer` 1차: source-of-record, OAuth 시작 순서, logout revoke 계약 3건 `REQUEST CHANGES`.
- 같은 working tree에서 세 계약 항목 수정 후 contract diff 재검토: **PASS**, 해당 계약 finding의 unresolved/blocking 0. 이 기록은 provenance·secret 비노출 검토와 구분한다.
- 실행 검증: source-of-truth/workflow-v2/workpack/automation/bookkeeping validation, lint, typecheck, harness 594 tests, HTML 320/390/1280 Playwright overflow·console·request failure 0.
- 구현 중 발견한 callback ledger read 모순을 DB v1.3.30/API v1.2.33으로 교정하고 독립 `architect` 재검토 **PASS**, unresolved finding 0. public API shape와 browser 권한은 바뀌지 않는다.

## Stage 2 Runtime Evidence

- 2026-08-01 exact digest 7-container Docker smoke: ordered health 통과, raw Postgres/Auth/PostgREST/Storage host port 0, loopback gateway 2개만 노출.
- Auth-only proxy: `/auth/v1/health` 200, `/rest/v1`, `/storage/v1`, `/healthz` 404. OAuth callback `code` marker의 전체 container log match 0.
- secret 전달: 15개 논리 secret Keychain chunk 저장·왕복, repo 밖 `0700` directory/`0600` file, read-only `/run/secrets`, Compose·`Config.Env`·log raw/base64/URL-encoded match 0.
- 회귀 보호: repo 내부 경로와 내부를 가리키는 symlink 거부, 기존 PostgreSQL named volume이 있으면 `bootstrap-secrets --replace` 거부, `start` 180초 health poll.
- 실행 검증: focused 22 tests, disposable Docker integration 1 test, lint, typecheck, 전체 499 files(`474 passed`, `25 skipped`)와 5,028 tests(`4,787 passed`, `241 skipped`) 통과.
- 분리된 `code-reviewer`와 `security-reviewer` 재검토: 모두 **PASS**, critical/high/medium unresolved finding 0. dependency audit 잔여는 devDependency 경로 low 1건.

## Stage 3 App Adapter Evidence

- 2026-08-01 browser OAuth는 server ledger start 성공 뒤에만 실행되고, 반환 오류와 throw 모두 cancel을 시도한다. callback/link는 query·client cookie 대신 ledger provider/flow만 인증 authority로 사용한다.
- local callback/refresh/logout은 DB control의 active cutover epoch와 HMAC key version을 읽어 binding을 bootstrap/assert/revoke하며, SSR Auth는 public HTTPS origin, server-only admin client만 loopback을 사용한다.
- 요청 attestation HMAC은 Kong custom plugin이 process-only secret으로 검증하고 입력 서명 헤더를 제거한다. PostgreSQL catalog·backup에는 attestation secret을 저장하지 않는다.
- 실행 증거: lint, typecheck, production build, product 2,449 tests, focused 72 tests, PostgreSQL integration 6 tests, disposable 7-container Docker smoke와 invalid HMAC `401`/valid HMAC pass, inventory validators 통과.
- 독립 `code-reviewer` 4건과 `security-reviewer` 4건을 수정 후 보안 재검토 **PASS**. 추가 발견된 local V1 premature key requirement도 제거하고 dynamic V2/epoch 회귀 테스트를 통과했다. five-axis 전체 리뷰는 final cutover PR 전까지 미완료로 유지한다.
