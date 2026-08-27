# Stage 2 Phase A/B — DB/RPC evidence

## Scope

- additive `youtube_extraction_jobs` progress snapshot columns
- private five-stage event table
- fenced worker-only `report_youtube_extraction_progress(...)`
- enqueue queued snapshot and owner-only source projection
- expected-schema/catalog/security authorization `schema-v2`

Worker IPC, ETA/API public shape, frontend, release promotion, production rollout은 이 evidence 범위가 아니다.

## TDD RED

실제 isolated PostgreSQL/PostgREST에서 구현 전 다음 결손을 확인했다.

- progress columns `0/5`
- private event table 없음
- report RPC 없음
- worker schema identity `v1`
- RPC PostgREST `404`

## GREEN

- `node scripts/run-youtube-async-extraction-postgres-integration.mjs`
  - PostgreSQL 15 + pinned local PostgREST
  - `2 files passed`, `78 tests passed`
  - migration replay, enqueue queued snapshot, five forward stages, duplicate idempotency, retrograde/stale/terminal write 0, new-attempt source reset, duration bounds, direct private access 0 포함
- targeted release/schema suite
  - `7 files passed`, `130 tests passed`
- `node scripts/validate-security-function-authorization.mjs --contract-only`
  - YouTube authorization manifest `36` functions valid
- `pnpm typecheck`
  - pass
- `pnpm lint`
  - pass
- `git diff --check`
  - pass

## Independent review

- code review: `APPROVE`, Findings 0
- security review: Findings 0
- 보안 검토 범위: SECURITY DEFINER/search_path, exact worker ACL, JWT pre-request, job/lease/permit/attempt fence, lock order, private table direct access, PII 0, catalog fail-closed, admin quota preservation

## Boundaries and remaining work

- Supabase Cloud/linked/remote 사용 0
- operational full-local destructive reset 0
- production migration/apply/rollout 0
- PostgreSQL 17 compatibility와 current-head CI는 PR gate에서 확인한다.
- Phase C worker IPC, Phase D ETA/API, Phase E frontend는 pending이다.
