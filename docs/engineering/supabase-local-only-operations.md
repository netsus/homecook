# Supabase Local-Only Operations Contract

상태: **canonical / active**
승인 기준: `origin/master@4462ac8784e40478ad8be6bd35ff585fc01d68d4`
승인일: 2026-08-13 KST

이 문서는 Homecook의 Supabase 운영·개발·검증 target에 관한 단일 기준이다. 일반적인 Supabase SDK·CLI 명칭은 유지하지만 Supabase Cloud project, linked project root, remote database와 remote credential을 Homecook target으로 사용하는 것은 금지한다. 다른 문서는 이 계약을 링크하며 같은 규칙을 다시 정의하지 않는다.

## Canonical local-only contract

- app runtime, worker, PostgreSQL data, Auth, Storage, Realtime, PostgREST와 내부 Data API/RPC의 유일한 운영 target은 현재 운영 Mac의 full-local Supabase다.
- 개발·CI·릴리즈 게이트는 exact CLI/runtime version을 고정한 fresh isolated local Supabase를 사용한다. 운영 상태를 확인해야 하는 예외 게이트는 실제 full-local target에 read-only transaction 또는 사전에 승인된 controlled local mutation만 실행한다.
- Supabase Cloud project 생성·유지, `supabase link`, linked root 탐색, `--linked`, remote DB URL/비밀번호/API key 요구·생성·복사, remote migration/verifier/security gate, deploy 목적 `supabase db push`는 금지한다.
- 새 Codex task, 새 shell session, 새 worktree와 새 Mac 복구에서도 remote link 또는 remote credential을 prerequisite나 fallback으로 탐색하지 않는다. 없으면 정상이며, 발견하면 사용하지 않고 drift로 보고한다.
- schema 변경은 `supabase/migrations/`에 추가하고 isolated local replay로 검증한다. 적용 target은 명시적인 local runtime뿐이다. 운영 데이터가 있는 full-local target에서 `db reset` 또는 destructive replay를 실행하지 않는다.
- public internet에는 승인된 app/Auth surface만 둔다. PostgreSQL, PostgREST, Realtime, Storage, Studio와 내부 RPC/Data API는 loopback 또는 명시적 private boundary 밖에서 403/404 또는 연결 거부여야 한다.
- managed/hosted/remote Supabase로 돌아가려면 별도 사용자 승인, 새 contract-evolution, 공식 5종과 CSoT 갱신이 선행되어야 한다.

## Reference inventory and disposition

| surface | 확인된 reference | disposition |
| --- | --- | --- |
| 공식 기준 | 공식 5종의 2026-07-29 local-first, 2026-07-30 hybrid, 2026-08-01 full-local 문단 | 최신 addendum이 이 문서를 active authority로 지정한다. 과거 문단은 historical/superseded이며 실행 근거가 아니다. |
| 운영 계획 | `current-mac-production-plan.md`, `full-local-supabase-production-plan.md`, session/backup/recovery/runbook 문서 | 이 문서에 위임하고 local backup·restore·boundary gate를 유지한다. |
| migration 안내 | `supabase-migrations.md`의 `supabase link`, 무표시 `db push` | remote prerequisite를 제거하고 isolated `db reset --local` 및 controlled local apply만 허용한다. |
| security function | `verify:security-functions:remote`, `closeout:security-functions:remote`, `--linked-remote` | required/closeout surface에서 제거한다. historical helper를 실행하면 정책 위반이다. release gate는 isolated local PostgreSQL + local Data API negative smoke다. |
| full-local backup | 과거 `supabase db dump --linked` 또는 dev CLI `--local` stack 선택 | production command는 mode `0600` full-local config의 exact Compose project, healthy digest-pinned PostgreSQL container와 labeled PostgreSQL/Storage named volumes만 선택한다. DB dump는 그 verified container 내부 `pg_dump`; dev `supabase_db_homecook`/`supabase_storage_homecook` fallback은 금지한다. `--local` adapter는 disposable isolated fixture 내부에서만 허용한다. |
| CI | fresh `supabase start`/migration replay | 허용. URL placeholder는 네트워크 target이 아닌 build-only dummy임을 명시한다. secret 기반 Cloud Supabase live OAuth는 required gate가 아니며 local-only 전환 뒤 금지/N/A다. |
| env templates | root `.env.example`의 hosted URL/remote authority 기본값, hybrid production env template | root template을 loopback/local authority로 교체하고 hybrid template은 forbidden tombstone만 남긴다. |
| workpack | `youtube-async-extraction-notification`의 production/staging/remote write 0, security release gate | remote target 개념을 forbidden/N/A로 바꾸고 local isolated/rehearsal evidence로 잠근다. |
| historical hybrid artifacts | hybrid docs/scripts/tests/migrations, package `test:hybrid-supabase:runtime`, `test:hybrid-supabase:postgres`, `test:hybrid-supabase:storage`, CI `hybrid-authority-runtime` | rollback/audit history로만 보존한다. 세 package key와 CI job은 제거하고 `scripts/verify-hybrid-supabase.mjs`, `scripts/hybrid-remote-auth-mirror.mjs`, `scripts/run-hybrid-revoked-session-canary.mjs`, `scripts/sync-remote-auth-jwks.mjs` 같은 executable remote credential consumer는 network/env/file read·write 전에 unconditional forbidden tombstone으로 둔다. 신규 session prerequisite, release gate 또는 운영 fallback으로 호출하지 않는다. |
| 일반 용어 | Supabase SDK, git remote, rclone remote, 외부 URL | Cloud target 의미가 아니므로 변경하지 않는다. |

전체 검색은 다음 범위를 포함했다.

```bash
rg -n -i '(supabase cloud|remote supabase|remote db|linked root|supabase link|--linked|db push|project[-_ ]ref|remote security|hosted supabase)' \
  AGENTS.md docs package.json scripts .github
```

### Change list

- governing/CSoT: `AGENTS.md`, `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`, 이 canonical 문서
- 공식 5종: 요구사항 `v1.7.32`, 화면 `v1.5.36`, Flow `v1.3.34`, DB `v1.3.34`, API `v1.2.39`
- engineering entry/runbook: `agent-workflow-overview.md`, `slice-workflow.md`, `supabase-migrations.md`, `current-mac-production-plan.md`, `full-local-supabase-production-plan.md`, `full-local-session-lifecycle-runbook.md`, `playwright-e2e.md`, workflow-v2 Homecook profile와 공식 tuple을 소비하는 YouTube entry docs
- workpack: `youtube-async-extraction-notification` README, acceptance, automation spec, workflow-v2 work item
- config/tooling: root `.env.example`, hybrid env/verifier forbidden tombstone, `package.json`의 세 `test:hybrid-supabase:*` entrypoint 제거, CI `hybrid-authority-runtime` 제거, full-local backup/inventory, security-function release/Data API gate, Playwright/security-smoke local placeholder, Cloud-secret live OAuth workflow 제거
- regression locks: source-of-truth/production-domain/YouTube/workflow pointer tests, full-local backup/security/historical-hybrid exposure tests와 `tests/supabase-local-only-operations.test.ts`
- historical/N/A inventory: `docs/engineering/hybrid-*`, `docs/workpacks/hybrid-auth-local-data-production/*`, hybrid/remote migrations·scripts·tests와 이전 official version은 감사 기록으로 남긴다. package/CI/required gate에서의 executable entrypoint는 제거하며 canonical 계약 없이 다시 노출할 수 없다.

## Required local gate acceptance

### Isolated deterministic gate

- `supabase@2.110.0` pinned CLI exact version과 repository migration SHA를 실행 시작 전에 검증·기록한다. bare `PATH`의 `supabase`는 gate authority가 아니다.
- fresh isolated local stack은 운영 volume, 운영 port, 운영 env/secret mount를 공유하지 않는다.
- clean migration replay, seed/fixture, role/grant/RLS/ACL/function search path, owner A/B, anonymous denial, Data API/RPC public negative smoke를 통과한다.
- security-function PostgreSQL gate는 `postgresql:` URL의 exact `127.0.0.1` 또는 `::1`만 `psql` 전에 허용한다. Data API negative smoke도 exact loopback HTTP(S) origin을 client/JWT/fetch 전에 검증하며 hosted/non-loopback target으로 credential이나 request를 보내지 않는다.
- 같은 input으로 다시 실행해 schema identity와 결과가 재현되며 remote network·link·credential access가 0임을 증명한다.

### Controlled full-local gate

- 운영 target 확인이 필요한 경우 먼저 exact target identity, backup freshness, maintenance/owner fence와 read-only 여부를 기록한다.
- 기본은 `BEGIN READ ONLY`와 checksum before/after 동일성이다. mutation이 꼭 필요하면 별도 운영 승인, bounded fixture, idempotency와 rollback/forward-fix 증거가 있어야 한다.
- 실제 운영 데이터를 대상으로 `supabase db reset`, volume 삭제, 기존 backup 덮어쓰기, migration history rewrite를 하지 않는다.

### Backup and restore acceptance

- PostgreSQL의 `auth`, `public`, `storage` metadata와 Storage payload를 같은 cut line으로 백업하고, repository 밖 암호화된 off-Mac 매체에 보존한다.
- backup encryption key는 데이터와 분리한다. secret source는 Keychain 또는 repo 밖 `0700` directory의 `0600` read-only file이며 log, Git, browser bundle, Docker inspect에 원문 노출이 0이어야 한다.
- backup은 immutable output path, SHA-256와 HMAC/authentication metadata를 사용하고 기존 archive를 덮어쓰지 않는다.
- archive, sidecar, restore/readiness manifest와 상위 경계는 `lstat`/`realpath` 기준으로 검사해 symlink·repo 내부 alias를 거부한다. consistent cut 진입이 일부 writer stop 뒤 실패해도 실제 중지된 writer 집합을 역순 재시작하며 운영 writer를 중지 상태로 남기지 않는다.
- isolated clean target restore를 정기적으로 수행해 manifest, migration head, row/count/digest/owner semantics, Storage object count/bytes/hash/reference, Auth/provider login, RLS, stale/revoked session, reboot ordered recovery를 검증한다.
- executable fixture gate는 `pnpm verify:full-local-backup-restore-drill`이다. exact disposable namespace에 production-compatible Compose labels, pinned PostgreSQL image와 labeled named volumes를 만들고, dev stack이 동시에 있어도 production fixture만 선택해야 한다. DB metadata와 object payload를 backup/clean restore한 뒤 source identity, count, bytes, SHA-256와 DB reference가 모두 같아야 PASS다.
- RPO 목표는 24시간, RTO 목표는 4시간이다. `validate`, `start`, `status`는 symlink가 아닌 mode `0600` `FULL_LOCAL_BACKUP_READINESS_PATH`를 읽고 live Docker labels/image/health에서 exact production identity를 다시 해석한다. 매 gate마다 primary archive와 별도 filesystem의 off-Mac copy를 각각 sidecar+Keychain HMAC 인증·복호화하고 동일 metadata/SHA-256인지 검증하며, `restore-platform`이 fresh empty isolated target에 발급하고 같은 backup key로 HMAC 인증한 restore manifest만 승인한다. 이 manifest는 원본 roles/schema/data component digest, relation classification, DB/Auth relation count+digest, Storage object/reference count+bytes+digest를 함께 묶으며 하나라도 불일치하면 fail closed한다. backup 또는 restore age가 24시간을 넘거나 sidecar/key/copy가 unavailable/mismatch면 production readiness는 fail closed한다. readiness evidence는 `full-local-production:backup-readiness:record`만 immutable하게 생성하며 직접 덮어쓰지 않는다.
- rollback rehearsal은 schema/app immediate-previous 호환, local delta 보존, destructive reset 불사용을 확인한다. 첫 local user-scoped state mutation 뒤에는 env-only rollback을 금지하고 coherent restore 또는 forward-fix한다.

## Remote forbidden matrix

| action / input | status | required response |
| --- | --- | --- |
| Supabase Cloud project 또는 remote DB를 app/runtime/worker target으로 사용 | **FORBIDDEN** | 실행 중단, local target으로 재구성 |
| `supabase link`, linked root/project-ref 탐색·생성·복사 | **FORBIDDEN** | 요구하지 않으며 발견 시 drift 보고 |
| `--linked`, remote DB URL/password, Cloud API/service key를 required gate에 사용 | **FORBIDDEN** | isolated local env 또는 controlled full-local target 사용 |
| deploy 목적 `supabase db push` | **FORBIDDEN** | migration artifact + isolated local replay; 운영 apply는 별도 controlled local runbook |
| remote security/authorization verifier 또는 remote closeout | **N/A / FORBIDDEN** | local Postgres integration + local Data API negative smoke로 대체 |
| Cloud/remote production·staging write | **FORBIDDEN** | write count가 아니라 target 자체가 N/A임을 evidence에 기록 |
| Cloud Supabase live OAuth CI secret | **N/A / FORBIDDEN** | full-local Auth rehearsal 또는 실제 local controlled evidence 사용 |
| 운영 full-local DB의 destructive reset/volume delete | **FORBIDDEN** | immutable backup 뒤 isolated restore 또는 bounded forward migration |
| historical hybrid artifact 읽기 | **ALLOWED (read-only history)** | 실행/fallback/prerequisite로 승격 금지 |
| pinned local SDK/CLI, isolated local reset, controlled local read-only gate | **REQUIRED** | exact version/SHA/target/evidence 기록 |

## PR #1346 blocker disposition

PR #1346에서 remote/linked Supabase credential 또는 remote security gate가 없다는 이유로 발생한 blocker는 이 계약으로 해소된다. 그 입력은 더 이상 missing dependency가 아니라 **forbidden/N/A**다. PR #1346의 제품 코드는 이 docs-governance 작업에서 수정하거나 승인하지 않는다. 해당 PR은 successor/current head에서 local-only required gates, 독립 제품 review와 전체 PR checks를 별도로 통과해야 한다.

## Verification evidence contract

각 PR은 `Actual Verification`에 exact head SHA, pinned Supabase CLI/runtime, isolated 또는 controlled-local target, 실행 명령, checksum/restore/boundary 결과, remote link/credential access 0을 기록한다. remote verifier가 실행되지 않았다는 사실은 검증 누락이 아니라 이 matrix에 따른 `N/A`이며, 그 대신 대응 local gate의 성공 증거가 있어야 한다.
