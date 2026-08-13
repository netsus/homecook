# Acceptance: full-local-supabase-production

Official tuple: `v1.7.32/v1.5.36/v1.3.34/DB v1.3.34/API v1.2.39`

Production domain tuple: `https://app.mumeok.kr`, `https://auth.mumeok.kr`, `https://app.mumeok.kr/auth/callback`, `https://app.mumeok.kr/auth/link/callback`.

## Runtime fail-closed

- [ ] Auth/Data authority는 명시적 `local`만 허용하고 missing/remote/local-shadow/unknown을 거부한다.
- [ ] `.env.example` 전체가 실제 Auth/Data parser를 통과한다.
- [ ] loopback HTTP와 승인된 self-hosted Auth HTTPS만 허용하며 hosted Supabase와 non-loopback HTTP를 거부한다.
- [ ] launchd/full-local env loader가 같은 local-only 계약을 보존한다.

## Complete backup and isolated restore

- [ ] DB dump와 Storage volume snapshot은 같은 consistent cut 안에서 생성된다.
- [ ] DB/Storage source는 mode `0600` production config의 exact Compose project, healthy digest-pinned PostgreSQL container, labeled named volumes로 일치하며 dev CLI stack 또는 ambiguous/missing label은 fail closed한다.
- [ ] encrypted immutable archive는 Storage payload를 반드시 포함하고 count/bytes/hash/reference/source identity를 인증 manifest로 묶는다.
- [ ] `storage_payload_included=false`, payload 누락, 불일치, unsafe path는 readiness를 fail closed한다.
- [ ] `supabase@2.110.0` exact version이 실행 전에 검증·기록된다.
- [ ] clean disposable namespace restore가 DB metadata와 object bytes/hash/reference exact 일치를 증명한다.
- [ ] 운영 DB reset, 운영 volume 삭제, 기존 backup overwrite는 0이다.
- [ ] isolated drill은 production-compatible labels를 쓰고 dev stack 공존 반례에서도 production fixture만 선택했다는 evidence를 남긴다.
- [ ] `restore-platform` actual restore만 replacement-held Ed25519 issuer key로 recovery manifest+sidecar를 발급하며, backup-key-HMAC-valid fabricated manifest는 거부한다. `validate`/`start`/`status`는 signed clean restore, `isolated_replacement_environment_verified`, actual escrow exact path/hash/HMAC/device를 검사하고 fail closed한다.

## Semantic gate

- [ ] active package/CI/runbook/workpack의 remote command/credential consumer는 0이다.
- [ ] historical remote path는 explicit FORBIDDEN/N/A appendix와 allowlist 안에서만 남는다.
- [ ] local security/Postgres/Data API gate와 full test/lint/typecheck/build/validators가 통과한다.
- [ ] independent reviewer Findings 0과 current-head CI pending/failure 0이다.

## Manual only

- [ ] production Keychain/off-Mac target, `FULL_LOCAL_BACKUP_READINESS_PATH` 및 24시간 이내 실제 운영 backup+restore schedule 설정
- [ ] actual full-local controlled restore/recovery와 provider login/RLS/reboot 확인
- [ ] first production mutation 또는 rollback 승인

## Historical appendix / FORBIDDEN N/A

remote final backup, hosted S3 credential 생성·copy·revoke, linked DB push, remote security baseline, remote session migration과 remote-default/local-shadow 안정화는 현재 acceptance가 아니다. 실행 금지이며 완료 증거로 재사용하지 않는다.
