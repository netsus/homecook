# Slice: account-session-generation-foundation

## Goal

동일한 auth UUID가 탈퇴 뒤 다시 사용되더라도 이전 세션의 개인 write가 새 계정 세대에 섞이지 않도록, JWT session과 auth identity epoch에 결합된 account generation 보안 기반을 먼저 배포한다. F0는 모든 기능을 additive dark-ship하고 production capability를 `legacy`로 유지해 기존 가입·bootstrap·writer·탈퇴 의미를 보존한다. `recipe-visibility-read-hardening`(#3)의 Storage/registry 준비가 끝난 joint activation 전에는 canonical lifecycle/watermark를 만들거나 generation writer와 legacy writer를 함께 활성화하지 않는다.

## Approved Plan Lock

- 승인 계획: `/Users/shj/2025/2026/homecook1/.omx/plans/cooking-meal-log-and-product-search-master-plan-20260722.md`
- SHA-256: `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d`
- line count: `1,018`
- successor order: F0를 먼저 닫은 뒤 독립 Train A, 이어 Train B→C→D→E→F
- Stage 1 author: 사용자 승인에 따라 Claude가 아닌 별도 Codex 문서 세션
- internal 1.5: 이 author 세션과 분리된 독립 Codex reviewer/repair-final 세션이 5개 core artifact(README, acceptance, automation spec, work-item, status)와 2개 design gate artifact(wireframe, critique) 전체를 함께 검토한다. author와 design author/critic은 자기 산출물을 승인하지 않는다.

## Branches

- 문서: `docs/account-session-generation-foundation`
- 백엔드: `feature/be-account-session-generation-foundation`
- 프론트엔드: `feature/fe-account-session-generation-foundation`

## In Scope

### 화면

- auth callback과 MYPAGE의 공통 lifecycle gate
- 신규 `ACCOUNT_QUARANTINE` interstitial의 최소 범위
  - auth-present: `계정 복구 | 삭제`
  - auth-absent: 임의 recovery/delete CTA 없이 지원·Manual Only 안내
  - exact session 재검증, UUID `Idempotency-Key`, same-key replay, pending/error/unauthorized 상태
- 일반 MYPAGE content보다 quarantine interstitial을 먼저 표시하는 route/auth guard

### API / Route

- 신규 public `POST /api/v1/users/me/cutover-quarantine-resolution`
- 기존 `DELETE /api/v1/users/me`의 capability별 dual-dispatch
  - `legacy`: 기존 개인 DB cleanup과 exact identity-epoch delete receipt를 같은 transaction에 기록
  - `cutover_maintenance`: 무변경 `503 ACCOUNT_LIFECYCLE_MAINTENANCE`
  - `generation_active`: session-bound generation delete initiation, binding revoke, DB cleanup, auth outbox enqueue, durable `202 cleanup_pending`
- 기존 auth callback/bootstrap과 모든 personal mutation Route의 capability/session-generation dual-dispatch adapter
- browser 비노출 `POST /internal/account-maintenance/tick`의 auth/Storage outbox consumer interface skeleton. F0는 auth identity outbox만 additive schema로 소유하고, #3 소유의 Storage registry/outbox가 아직 없으므로 Storage drain·owner-signal·lifecycle completion stage는 feature-off + fail-closed로 유지한다.
- server-verified bind/revoke, capability transition, cutover stage/abort/promote, quarantine resolve, legacy external-write lease RPC. client-callable DB RPC로 노출하지 않는다.

### 상태 전이

```text
F0 production: capability=legacy, canonical lifecycle/watermark rows=0

legacy --exclusive fence--> cutover_maintenance
cutover_maintenance --abort before promote--> legacy + staging purge + canonical 0
cutover_maintenance --atomic promote after #3 joint gate--> generation_active

lifecycle: active | quarantined | deleting | cleanup_pending | complete
quarantine resolution: quarantined --activate--> active
quarantine resolution: quarantined --delete--> deleting -> cleanup_pending
```

- F0-only release는 첫 줄의 `legacy` 상태만 production에서 유지한다.
- `generation_active` promote는 #3의 registry/outbox, browser `.remove()` 대체, DB/Storage revoke, owner-signal union-zero가 같은 capability revision에 준비된 joint activation에서만 허용한다.
- promote 뒤 legacy bootstrap/delete/writer로 rollback하지 않고 forward-fix만 허용한다.

### DB 영향

- 신규:
  - `user_account_generation_watermarks`
  - `user_account_lifecycles`
  - `user_session_generation_bindings`
  - `account_generation_capability_state`
  - `account_generation_cutover_attempts`
  - `account_generation_cutover_staging`
  - `legacy_account_delete_receipts`
  - `legacy_external_write_attempts`
  - `auth_identity_deletion_outbox`
- additive 변경:
  - `admin_audit_logs.actor_admin_user_id` nullable `ON DELETE SET NULL`; 신규 audit writer는 actor 필수 유지
  - `operational_events`의 account-cleanup identifier scrub 경로
  - inventory에 잡힌 personal writer table의 capability fence guard trigger/RPC
  - authenticated Storage policy의 generation capability predicate 선설치
- schema/inventory artifact:
  - 모든 existing/new personal mutation Route·RPC·direct PostgREST DML·Storage policy·service external write call site
  - local/remote `auth.users(id)` inbound FK와 delete action
  - guard exact signature, owner, `SECURITY DEFINER|INVOKER`, safe search path, exposure, exact principal allowlist
- Schema Change: **있음**. 기존 migration은 수정하지 않고 additive migration만 추가한다.

## Out of Scope

- F0 단독 production `cutover_maintenance` 진입 또는 `generation_active` promote
- canonical lifecycle/watermark production backfill과 legacy/generation writer 혼용
- #3이 소유하는 `recipe_image_objects`, image idempotency/quota, `storage_object_deletion_outbox`, private bucket, browser `.remove()` 대체, authenticated Storage/direct table grant 최종 회수
- legacy image visibility copy/swap, orphan GC, report candidate의 enqueue/delete
- 제품 전용 launchd의 실제 MacBook 설치와 production secret 주입. F0는 `com.homecook.account-maintenance` 300초/RunAtLoad skeleton과 검증 도구까지만 소유한다.
- quarantine interstitial 밖의 MYPAGE 정보 구조·성장·레시피북·설정 재설계
- `MEAL_LOG`, batch, personal recipe, snapshot-v2 기능 활성화
- 공식 문서에 없는 endpoint, field, status, error code 추가

## Dependencies

| 선행 gate | 상태 | 근거 |
| --- | --- | --- |
| `security-definer-mutation-authorization-hotfix` | merged/deployed | PR #1067~#1071, production 8개 anon mutation `42501`+checksum 무변경, provider Data API 비노출, Route smoke, closeout merge `9810406546120e047348d517b801aa2b2e16867e` |
| `cooking-meal-log-contract-evolution` | merged | PR #1072, merge `e239d94151bab4e504513cc197dad554bc4f6a01` |
| #3 joint activation | **implementation predecessor가 아니라 activation predecessor** | F0를 `legacy` dark-ship으로 먼저 merge한 뒤 #3과 같은 activation release에서만 promote |

## Backend First Contract

### Common authentication and generation authority

- request authority는 verified JWT의 owner UUID, `session_id`, `iat`와 server가 조회한 auth identity `created_at`이다. body의 owner/generation/session 입력은 authority가 아니다.
- raw `session_id`를 저장하지 않고 versioned server-secret HMAC, key version, owner, expected generation, identity epoch를 binding한다.
- personal mutation은 한 transaction에서 `global shared fence → owner lifecycle lock → resource lock`을 얻고 binding expected generation과 current active generation을 재검증한다.
- binding missing/revoked, identity epoch mismatch, stale generation, quarantine/delete state는 mutation 0으로 fail closed한다.
- resource가 recipe/Meal까지 잠그는 후속 writer는 `global shared fence → owner lifecycle → recipe UUID ascending → Meal UUID ascending → resource row` 순서를 이어받으며 lock RPC와 REST write를 분리하지 않는다.

### Capability, guard, and direct-write fence

- singleton state는 exact `legacy | cutover_maintenance | generation_active`와 monotonic revision/current attempt를 가진다.
- application mutation guard는 allowlisted `VOLATILE SECURITY DEFINER`, safe `search_path`(`pg_temp` last), transaction-scoped shared advisory lock, capability row `SELECT ... FOR KEY SHARE` 순서이며 `READ COMMITTED` 외 isolation을 거부한다.
- existing/new mutation RPC, direct DML `BEFORE INSERT OR UPDATE OR DELETE` trigger, authenticated Storage RLS predicate가 같은 state를 읽는다.
- `legacy`는 기존 의미를 허용하고, maintenance는 exact orchestrator만 허용하며, active는 session-generation을 검증한 allowlisted internal RPC만 허용한다.
- service-role external PUT은 Storage RLS로 보호된다고 가정하지 않는다. shared fence 아래 `legacy_external_write_attempts` start row를 먼저 만들고 120초 hard deadline과 token finalize/cleanup을 요구한다.

### Auth Before User Created Hook and role ACL

- Hook wrapper: `SECURITY INVOKER`, exposure `auth-hook-internal`, exact principal `supabase_auth_admin`.
- Hook minimal guard: dedicated NOLOGIN owner의 hardened `SECURITY DEFINER`, same-key shared advisory xact lock 뒤 capability **plain SELECT**. 공용 guard의 `FOR KEY SHARE`를 재사용하지 않는다.
- `supabase_auth_admin`: wrapper/guard schema `USAGE`, exact wrapper/guard function `EXECUTE`만 허용한다.
- `PUBLIC`, `anon`, `authenticated`, `service_role`: wrapper/guard `EXECUTE=false`.
- dedicated owner: schema `USAGE`, capability table `SELECT`만 true. table `INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER`, 모든 capability column `UPDATE`, 비관리 membership/`SET ROLE`은 false다.
- Hook은 legacy/active identity create를 허용하고 maintenance의 email/OAuth create를 fail closed한다. hook health와 remote configuration 증거가 없으면 maintenance에 진입하지 않는다.

### Cutover staging, quarantine, and atomic promote

- `auth ∩ public`, `auth \\ public`, `public \\ auth`, 전체 personal owner universe를 attempt-scoped staging에 exact-one action으로 분류한다.
- exact delete receipt/recovery/cleanup evidence만 active/cleanup 근거다. 증거 없는 auth-only/public-only/personal-only owner는 삭제 추정 없이 G1 quarantine으로 보존한다.
- owner conflict, duplicate identity epoch, evidence mismatch 등 안전한 단일 action이 없는 `classification_unresolved`만 promote blocker다.
- proposed generation은 staging에만 존재하며 final transaction 전 canonical lifecycle/watermark row count는 0이다.
- final promote는 exclusive global fence와 migration-owner `auth.users SHARE ROW EXCLUSIVE` lock 또는 검증된 provider barrier 아래 ordered auth/public/personal count+digest/revision을 staging과 CAS한다.
- same transaction에서만 active/cleanup/quarantine lifecycle, append-only watermark, 필요한 auth outbox, capability=`generation_active`를 commit한다.
- digest mismatch, lock timeout, 권한 부족, unresolved classification, owner-signal nonzero는 canonical mutation 0으로 abort한다.
- promote 전 abort는 adapter/policy를 legacy로 복구하고 staging/external attempt를 purge한 뒤 canonical 0을 확인한다. promote 뒤 legacy rollback은 금지한다.

### Legacy delete, generation delete, and auth outbox

- `legacy` delete success와 exact owner/auth identity epoch/deleted-at/random receipt ID+hash 기록은 같은 transaction이다. cleanup rollback이면 receipt도 rollback한다.
- generation delete는 owner lock 안에서 exact session HMAC/key version, UUID deletion key/payload hash, durable `202 cleanup_pending`을 lifecycle에 영구 저장하고 binding revoke→private DB cleanup→auth outbox enqueue를 한 transaction으로 수행한다.
- auth consumer는 expected owner/generation/identity epoch와 lease CAS를 확인하고, 삭제 직전 Admin lookup의 exact `created_at`이 같은 identity만 삭제한다. absent는 `already_absent`, newer same-UUID identity는 삭제 없이 `identity_replaced` terminal이다.
- #3 joint gate 전 F0 production은 auth deletion consumer를 활성화하지 않는다. skeleton은 Storage terminal/expected-owner signal union-zero가 없으면 fail closed한다.
- account cleanup은 admin membership을 먼저 제거하고 `granted_by`/audit actor를 null 처리하며 operational direct user identifiers를 scrub한다. 미분류 `auth.users` inbound RESTRICT FK가 있으면 auth delete를 호출하지 않는다.

### Public API request / response / errors

- `POST /users/me/cutover-quarantine-resolution`
  - headers: Authorization, UUID `Idempotency-Key`
  - body: `{ action: "activate" | "delete", profile?: { nickname: string } }`
  - activate: exact identity epoch/session을 검증해 같은 G1 lifecycle을 active로 전환하고 profile+restricted binding을 원자 생성
  - delete: account-delete durable initiation으로 넘겨 `cleanup_pending`
  - same key+payload: 최초 durable result; same key+different payload: `409 IDEMPOTENCY_KEY_REUSED`
  - auth-absent quarantine: `409 ACCOUNT_QUARANTINE_MANUAL_RECOVERY_REQUIRED`, 자동 identity 연결/삭제 없음
- `DELETE /users/me`
  - legacy: 기존 public response를 유지하되 exact receipt를 같은 transaction에 추가
  - maintenance: `503 ACCOUNT_LIFECYCLE_MAINTENANCE`
  - active: UUID key 필수, success `202 { deletion_status: "cleanup_pending" }`
- 모든 response는 `{ success, data, error }`, error는 `{ code, message, fields[] }`를 유지한다.
- F0 exact public errors: `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_KEY_REUSED`, `ACCOUNT_LIFECYCLE_MAINTENANCE`, `ACCOUNT_CUTOVER_UNCLASSIFIED`, `ACCOUNT_CUTOVER_QUARANTINED`, `ACCOUNT_QUARANTINE_MANUAL_RECOVERY_REQUIRED`, `ACCOUNT_DELETING`, `ACCOUNT_DELETION_PENDING`, `ACCOUNT_SESSION_STALE`, `ACCOUNT_GENERATION_STALE`. internal reason을 다른 public alias로 노출하지 않는다.

## Frontend Delivery Mode

- 최소 surface만 구현한다: auth callback 또는 MYPAGE 진입에서 quarantined lifecycle을 감지하면 일반 content보다 `ACCOUNT_QUARANTINE` interstitial을 먼저 렌더한다.
- auth-present 사용자는 `계정 복구`와 `삭제`만 선택할 수 있다. destructive delete는 명확한 확인 상태를 거친다.
- auth-absent 사용자는 지원 안내만 보며 임의 복구·삭제 CTA를 제공하지 않는다.
- 필수 상태: `loading`, `empty/not-applicable`, `error`, `read-only/restricted`, `unauthorized`, `pending replay`.
- protected action은 로그인/auth callback 뒤 같은 quarantine resolution intent로 복귀한다. 다른 MYPAGE tab이나 일반 앱 화면으로 우회하지 않는다.
- production capability가 `legacy`인 동안 일반 사용자는 이 화면을 보지 않는다. fixture/local seeded quarantine으로만 Stage 4 UI와 E2E를 검증한다.

## Design Authority

- UI risk: `new-screen` + account deletion을 포함한 `high-risk`
- Anchor screen dependency: 없음 (`MYPAGE` 최소 lifecycle gate만 사용하며 MYPAGE 정보 구조를 바꾸지 않음)
- Required screen: `ACCOUNT_QUARANTINE`
- Visual artifact: Stage 1은 아래 생성·검토·evidence 경로를 plan-lock했다. 별도 Codex design author/critic 세션이 wireframe과 critique를 생성했고, critique Round 4 final은 `PASS`, unresolved Blocker/Major/Minor `0/0/0`이다.
  - wireframe: `ui/designs/ACCOUNT_QUARANTINE.md`
  - critique: `ui/designs/critiques/ACCOUNT_QUARANTINE-critique.md`
  - before/current auth/MYPAGE capture: `ui/designs/evidence/account-session-generation-foundation/before/`
  - Stage 4 evidence: `ACCOUNT_QUARANTINE-mobile-390.png`, `ACCOUNT_QUARANTINE-mobile-320.png`, `ACCOUNT_QUARANTINE-desktop.png`, activate/delete/error/pending variants
  - authority report: `ui/designs/authority/ACCOUNT_QUARANTINE-authority.md`
- Authority status: `required`; Stage 1 markdown design critique는 통과했지만 구현 screenshot/Figma authority는 아직 미래 Stage 4 gate다. 별도 Codex authority 세션이 390px/320px/desktop과 상태별 screenshot evidence를 판정하기 전에는 `confirmed`로 승격하지 않는다.
- blocker: 320px CTA 잘림, recovery/delete 위계 혼동, destructive delete 오조작, auth-absent CTA 노출, 일반 content 우회, 전체 페이지 가로 스크롤, 44px 미만 터치 target.

## Design Status

`temporary`. Stage 1 wireframe/critique는 Round 4 final `PASS`로 잠겼다. Stage 4 구현과 screenshot authority evidence가 생기면 `pending-review`, 별도 Codex Stage 5/authority gate의 blocker 0 뒤에만 `confirmed`로 전환한다.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.7.22.md` A/H/I
- `docs/화면정의서-v1.5.28.md` 0-G `ACCOUNT_QUARANTINE`
- `docs/유저flow맵-v1.3.25.md` ⓱ account generation cutover·탈퇴·재가입
- `docs/db설계-v1.3.23.md` E/F/G/M/N/O/P
- `docs/api문서-v1.2.27.md` A/B/C/D/K/L
- `docs/engineering/slice-workflow.md`
- `docs/engineering/qa-system.md`
- `docs/engineering/product-design-authority.md`
- `docs/design/mobile-ux-rules.md`
- 승인 계획 SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d`

## QA / Test Data Plan

### Stage 1 gate와 구현 검증 명령의 수명주기

- 이 docs PR에서 실행 가능한 Stage 1 gate는 `validate:source-of-truth-sync`, `validate:workflow-v2`, `validate:workpack`, `validate-automation-spec`, `validate:omo-bookkeeping`, focused workflow-v2 Vitest, `lint`, `typecheck`, `git diff --check`다.
- `automation-spec.json`의 F0 전용 Vitest/PostgreSQL/remote verifier/scheduler 명령과 `.workflow-v2`의 전체 `required_checks`는 Stage 2/4가 생성하고 Stage 6까지 닫아야 하는 **planned implementation artifacts**다. Stage 1은 그 파일이나 package script가 이미 존재하거나 실행됐다고 주장하지 않는다.
- Stage 2는 production code 전에 먼저 해당 실패 테스트를 추가해 RED를 확인하고, `tests/account-session-generation-*`, `tests/account-quarantine-*`, `scripts/verify-account-session-generation-remote.mjs`, isolated PostgreSQL runner, `account-maintenance:scheduler:*` script를 `package.json`에 연결한다. 이 planned artifact 중 하나라도 누락되면 구현/closeout gate는 fail closed한다.
- 따라서 Stage 1 reviewer는 아래 미래 명령을 실행하는 대신 현재 docs gate와 명령·test target의 공식 계약 정합성을 검토하고, Stage 2/4 reviewer는 실제 파일 존재와 명령 실행 결과를 검증한다.

### Deterministic fixtures

- active A/B users, same UUID old G1/new G2 identity epoch/session pair, revoked/missing/expired binding, concurrent double-bootstrap
- `auth∩public`, exact delete receipt auth-only, signed recovery auth-only, evidence 없는 auth-only/public-only/personal-only, classification conflict
- `admin_members`, `admin_audit_logs`, `operational_events` identifier fixture와 local/remote `auth.users` inbound FK inventory
- long-running pre-maintenance writer, pre-started Hook, late service PUT/external lease, staging 뒤 Auth create/final digest 뒤 Auth delete race
- digest mismatch, lock timeout, guard-owner privilege missing, provider barrier unavailable, abort 후 legacy mutation과 second attempt
- auth-present quarantine activate/delete same-key replay/different-key·payload/session rejection, auth-absent Manual Only response

### Migration / DB / security gates

- production code 전에 실패 테스트를 먼저 작성하고 RED를 실제 확인한다.
- local existing upgrade, fresh database, exact migration replay를 각각 실행한다.
- state=`legacy`에서 existing writer/bootstrap/delete semantics 유지, receipt atomicity, canonical lifecycle/watermark count 0을 checksum으로 증명한다.
- every inventoried RPC/direct DML/Storage predicate가 shared fence/capability guard에 1:1 대응하는지 fail-closed lint한다.
- local/remote role matrix는 `PUBLIC`, `anon`, `authenticated`, `service_role`, `supabase_auth_admin`, dedicated NOLOGIN owner를 exact signature로 검사한다.
- Hook wrapper/guard ACL, owner SELECT-only/DML false/column UPDATE false/membership closure 0/actual `SET ROLE` failure를 검사한다.
- local에서 legacy allow→maintenance deny→active allow, long transaction/old snapshot, Hook/transition/promote race와 canonical atomic promote/abort를 검증한다.
- remote DB는 merged exact migration SHA에서만 적용한다. production에서는 F0 capability=`legacy`, canonical lifecycle/watermark=0, Hook legacy allow/ACL, writer·route compatibility를 검증하고 unmerged migration이나 production maintenance/active 전환을 하지 않는다.
- remote inventory에 미분류 writer/FK/trigger/grant/policy/hook가 있으면 release blocker다.

### Route / UI / browser gates

- Route unit/integration: wrapper/error shape, key parsing, no service-key fallback, capability mapping, generation mismatch mutation 0.
- Playwright: auth-present quarantine interstitial activate/delete/error/pending, auth-absent support-only, callback return-to-action, 일반 MYPAGE content 우회 금지.
- required viewport: desktop Chrome, Pixel 7급 mobile, 320px iOS-small sentinel.
- `pnpm verify:backend`, `pnpm verify:frontend:pr`, `pnpm verify:frontend`, exploratory QA+eval, authority evidence validator를 각 구현 stage에서 실행한다.

### Product maintenance worker skeleton

- `com.homecook.account-maintenance`, `RunAtLoad=true`, `StartInterval=300` skeleton과 install/verify/uninstall dry-run을 자동 검증한다.
- ordered tick contract는 `scanner → terminal tombstone scan → quarantine recheck → normal drain → expected-owner signal union-zero → auth delete → complete`를 선언하되 F0-only production에서 Storage/complete 단계는 fail closed한다.
- secret mode 600/Keychain, JSON log 10MB×5, heartbeat 15분, 3회 failure·oldest pending 15분·dead-letter alert, next-tick recovery를 configuration test로 고정한다.
- 실제 MacBook install과 production secret은 Manual Only이며 #3 joint activation 전 실행하지 않는다.

## Key Rules

- F0는 additive dark-ship이다. `legacy`, canonical lifecycle/watermark 0, 기존 writer/bootstrap/delete 의미 보존이 merge/deploy invariant다.
- #3 준비 전 generation account delete, auth deletion worker, direct grant revoke, canonical backfill을 활성화하지 않는다.
- UUID만으로 lifecycle/session ownership을 판단하지 않는다.
- quarantine은 데이터 보존 분류이며 삭제 추정이 아니다. classification conflict만 activation blocker다.
- public/user-owned quarantine content 비노출은 #3 read-hardening이 활성화할 때까지 feature-off projection으로만 준비한다.
- shared/exclusive global fence와 owner lifecycle lock을 우회하는 Route precheck+REST write 조합을 금지한다.
- Before User Created Hook의 `supabase_auth_admin`을 service role과 같은 exposure로 취급하지 않는다.
- NOLOGIN guard owner는 capability read/lock 최소권한만 갖는다.
- remote production migration은 merged exact SHA에서만 적용하고 state를 `legacy`로 유지한다.
- legacy receipt, lifecycle delete/quarantine durable result, append-only watermark는 cascade로 삭제하지 않는다.
- production secret, raw JWT/session ID, Auth payload, API key, user identifier를 artifact/log/PR/Discord에 남기지 않는다.

## Contract Evolution Candidates

없음. 구현은 공식 v1.7.22/v1.5.28/v1.3.25/v1.3.23/v1.2.27 계약을 확장하지 않는다. provider에서 `auth.users SHARE ROW EXCLUSIVE` lock을 안전하게 제공하지 않는다면 대체 barrier를 임의 구현하지 않고 provider-supported evidence 또는 별도 contract-evolution이 생길 때까지 activation을 중단한다.

## Primary User Path

1. F0 dark-ship 배포 뒤 기존 사용자는 capability `legacy`에서 이전과 같은 login/bootstrap/personal write를 사용한다.
2. 기존 사용자가 legacy 탈퇴하면 개인 DB cleanup과 exact identity-epoch receipt가 한 transaction에서 성공하거나 함께 rollback한다.
3. #3 joint gate가 끝난 뒤 maintenance staging에서 증거 없는 계정은 삭제되지 않고 G1 quarantine으로 보존된다.
4. auth-present quarantined 사용자는 로그인 뒤 일반 MYPAGE 대신 `ACCOUNT_QUARANTINE`에서 `계정 복구 | 삭제`를 선택하고, exact session/idempotency 검증 결과를 받는다.
5. auth-absent quarantine은 자동 처리되지 않고 지원·Manual Only 경로로 남는다.

## Delivery Checklist

> 이 Stage 1 문서는 구현 완료를 주장하지 않는다. 아래 non-Manual 항목은 evidence가 생기는 Stage 2/4와 독립 Codex review Stage 3/5/6에서만 체크한다.

- [x] additive F0 schema와 capability singleton을 migration으로 구현하고 existing/fresh/replay를 통과한다 <!-- omo:id=delivery-f0-additive-schema;stage=2;scope=backend;review=3,6 -->
- [x] production dark-ship에서 `state=legacy`, canonical lifecycle/watermark 0, existing behavior 보존을 증명한다 <!-- omo:id=delivery-f0-legacy-dark-ship;stage=2;scope=backend;review=3,6 -->
- [x] personal writer/direct DML/Storage/service external write와 local/remote auth inbound FK inventory를 100% 분류한다 <!-- omo:id=delivery-f0-writer-fk-inventory;stage=2;scope=backend;review=3,6 -->
- [x] shared/exclusive fence, volatile locking guard trigger, Storage predicate, external write lease를 구현한다 <!-- omo:id=delivery-f0-fence-guards;stage=2;scope=backend;review=3,6 -->
- [x] session HMAC binding과 generation-aware bind/revoke/dual-dispatch를 구현한다 <!-- omo:id=delivery-f0-session-binding;stage=2;scope=backend;review=3,6 -->
- [x] Hook invoker wrapper, NOLOGIN definer guard, exact `supabase_auth_admin` ACL과 negative role matrix를 구현한다 <!-- omo:id=delivery-f0-auth-hook-acl;stage=2;scope=backend;review=3,6 -->
- [x] staging/classification/digest CAS/quarantine/abort/atomic promote를 local testable state로 구현한다 <!-- omo:id=delivery-f0-cutover-core;stage=2;scope=backend;review=3,6 -->
- [x] legacy delete receipt, generation delete skeleton, auth outbox consumer, audit/FK cleanup을 구현한다 <!-- omo:id=delivery-f0-delete-outbox;stage=2;scope=backend;review=3,6 -->
- [x] `com.homecook.account-maintenance` 300초 launchd skeleton과 secret-free 검증 도구를 구현한다 <!-- omo:id=delivery-f0-launchd-skeleton;stage=2;scope=backend;review=3,6 -->
- [x] local existing/fresh/replay, lock race, exact principal role matrix와 read-only remote inventory를 통과한다 <!-- omo:id=delivery-f0-security-verification;stage=2;scope=shared;review=3,6 -->
- [ ] `ACCOUNT_QUARANTINE` API client/type와 auth callback/MYPAGE lifecycle gate를 연결한다 <!-- omo:id=delivery-f0-quarantine-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] loading/empty/error/restricted/unauthorized/pending replay UI와 return-to-action을 구현한다 <!-- omo:id=delivery-f0-quarantine-states;stage=4;scope=frontend;review=5,6 -->
- [ ] 390/320/desktop screenshot, exploratory QA/eval, separate Codex authority report를 남긴다 <!-- omo:id=delivery-f0-authority-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] backend Vitest/PostgreSQL/security smoke와 frontend Vitest/Playwright 범위를 분리해 자동화한다 <!-- omo:id=delivery-f0-test-split;stage=2;scope=shared;review=3,6 -->
- [x] 독립 Codex security/DB review와 5축 code review의 required finding을 0으로 닫는다 <!-- omo:id=delivery-f0-independent-reviews;stage=2;scope=shared;review=3,6 -->
