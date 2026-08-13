# Hybrid Supabase Runtime — Historical Tombstone

상태: **FORBIDDEN / N/A**

이 디렉터리는 과거 remote Auth + local Data 전환 설계의 감사·rollback archaeology를 위해서만 보존한다. 현재 production, staging, development, CI, release, backup, restore 또는 security gate로 실행하지 않는다.

- `pnpm hybrid-production:*` entrypoint는 제거됐다.
- `.env.production.example`은 복사하거나 채우지 않는다.
- Supabase Cloud project, linked root, remote DB/credential을 만들거나 찾거나 복사하지 않는다.
- 이 디렉터리의 Compose, migration, mirror, backup, restore script를 current fallback으로 호출하지 않는다.

현재 canonical 계약과 운영 경로:

1. `docs/engineering/supabase-local-only-operations.md`
2. `docs/engineering/current-mac-production-plan.md`
3. `docs/engineering/full-local-supabase-production-plan.md`
4. `docs/engineering/full-local-session-lifecycle-runbook.md`

hybrid 또는 managed/hosted Supabase로 돌아가려면 사용자 명시 승인, 새 contract-evolution, 공식 5종과 CSoT 갱신이 먼저 필요하다.
