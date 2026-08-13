# Slice: full-local-supabase-production

## Goal

현재 Mac의 self-hosted Supabase Auth, PostgreSQL, PostgREST, Storage, Realtime를 Homecook의 단일 production authority로 운영한다. canonical target 계약은 `docs/engineering/supabase-local-only-operations.md`다.

## Current official tuple

- 요구사항 `v1.7.32`
- 화면정의서 `v1.5.36`
- 유저 Flow맵 `v1.3.34`
- DB v1.3.34
- API v1.2.39

이 tuple은 public API 또는 DB schema shape를 바꾸지 않고 target authority와 운영 안전 gate를 local-only로 고정한다.

## Active scope

Production domain tuple: `https://app.mumeok.kr`, `https://auth.mumeok.kr`, `https://app.mumeok.kr/auth/callback`, `https://app.mumeok.kr/auth/link/callback`.

- app/runtime/worker/data/Auth/Storage/Realtime/PostgREST는 `HOMECOOK_AUTH_AUTHORITY=local`, `HOMECOOK_DATA_AUTHORITY=local`만 허용한다.
- Auth public origin은 exact loopback HTTP 또는 승인된 self-hosted HTTPS이고, 내부/Data origin은 exact loopback이다. hosted Supabase URL은 fail closed한다.
- pinned local CLI/runtime, isolated migration replay, local security negative smoke만 required gate다.
- complete encrypted backup은 DB metadata와 Storage payload를 같은 consistent cut 안에서 묶고 object count/bytes/SHA-256/DB reference/source identity를 manifest에 기록한다.
- production backup은 `infra/full-local-supabase/.env.production.local`의 exact Compose project와 PostgreSQL/Storage volume names, Compose labels, reviewed image digest, running+healthy state를 모두 검증한 뒤 그 PostgreSQL container에서만 `pg_dump`한다. Supabase CLI dev project id나 `db dump --local` stack으로 fallback하지 않는다.
- production `validate`/`start`/`status`는 HMAC 인증된 mode `0600` readiness와 canonical owner/mode-`0700` parent를 required gate로 사용한다. 24시간 안의 인증·복호화된 primary/off-Mac archive, signed clean restore, archive와 다른 두 번째 매체의 signed replacement-Mac key recovery, exact production identity가 하나라도 없으면 fail closed한다. `start`는 offline preflight 뒤에만 writer를 기동하고 live identity 2차 실패 시 그 attempt가 새로 올린 writer만 정지한다.
- restore gate는 운영 volume을 건드리지 않는 clean isolated namespace에서 DB metadata와 실제 object bytes/hash/reference의 일치를 증명한다.
- 운영 데이터의 `db reset`, volume 삭제, 기존 archive overwrite는 금지한다.
- public internet에는 승인된 app/Auth surface만 허용하고 PostgreSQL/PostgREST/Storage/Realtime/internal RPC는 loopback/private boundary에 둔다.

## Required evidence

- `.env.example` 전체가 실제 Auth/Data parser를 통과한다.
- 미설정, `remote`, `local-shadow`, hosted URL, non-loopback HTTP 조합이 runtime에서 거부된다.
- `supabase@2.110.0` exact version과 repository migration SHA를 기록한다.
- `pnpm verify:full-local-backup-restore-drill`이 production-compatible Compose-label fixture에서 complete backup/clean restore를 통과하고, 공존하는 dev stack을 선택하지 않았음을 증명한다.
- active package/CI/runbook/workpack에서 remote command/credential consumer가 0이고 historical allowlist 밖 match가 0이다.
- independent review findings 0과 current-head checks pending/fail 0 전에는 Ready/merge하지 않는다.

## Source links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/engineering/supabase-local-only-operations.md`
- `docs/engineering/full-local-supabase-production-plan.md`
- `docs/요구사항기준선-v1.7.32.md`
- `docs/화면정의서-v1.5.36.md`
- `docs/유저flow맵-v1.3.34.md`
- `docs/db설계-v1.3.34.md`
- `docs/api문서-v1.2.39.md`

## Manual only

- 실제 소유 domain과 full-local public HTTPS reverse proxy 변경
- provider console callback/secret 변경과 실제 계정 smoke
- Keychain production secret, off-Mac backup target, production maintenance window
- first production mutation, bounded production restore 또는 rollback 실행

## Historical appendix / FORBIDDEN N/A

2026-08-01 이전의 remote-default adapter, local-shadow, remote migration source-of-record, hosted S3 credential/rclone copy, linked DB/security gate와 remote rollback은 감사 기록일 뿐이다. 신규 task의 prerequisite, package entrypoint, runtime fallback, recovery source 또는 required gate로 실행하면 안 된다. 과거 migration과 evidence 문서는 삭제하지 않되 explicit historical allowlist 밖에서 executable하게 노출하지 않는다.
