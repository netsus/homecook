# Full-local Supabase runtime

This directory defines the isolated self-hosted Supabase foundation for the current Mac. It is feature-off until the later DB restore, OAuth provider, application adapter, backup, and Manual Only cutover gates pass.

## Safety boundary

- PostgreSQL, GoTrue, PostgREST, and Storage have no host ports.
- The internal Kong gateway is published only on `127.0.0.1` for the same-Mac Next.js server and S3 migration tools.
- The second loopback port is an Auth-only proxy. Every path outside `/auth/v1/*` returns `404`.
- Production secrets are generated into macOS Keychain, materialized outside the repository with directory mode `0700` and file mode `0600`, then mounted read-only under `/run/secrets`.
- `docker inspect .Config.Env`, Compose output, application logs, and repository files must contain no secret value.
- Named PostgreSQL and Storage volumes are preserved by the normal stop command.

## Operator sequence

The first two commands create non-secret config and the initial Keychain bundle. `bootstrap-secrets` refuses existing items unless `--replace` is explicitly supplied. Replacement is allowed only before the persistent PostgreSQL volume exists; live password rotation requires the later audited rotation runbook so Keychain and database roles cannot diverge.

```sh
pnpm full-local-production:init-config
pnpm full-local-production:bootstrap-secrets
pnpm full-local-production:validate
pnpm full-local-production:start
pnpm full-local-production:status
```

Stop containers without deleting data:

```sh
pnpm full-local-production:stop
```

Do not start the persistent production volumes before the restore/cutover runbook says the same-maintenance Auth, application DB, and Storage snapshot is ready. The Docker integration test always uses disposable names and removes its volumes:

```sh
pnpm test:full-local-production:runtime
```

## Session lifecycle canary

Session refresh hotfix의 production T+65분/24시간/7일 검증은
`docs/engineering/full-local-session-lifecycle-runbook.md`를 따른다. 실제 로그인과 최소 planner write는 Manual Only이며, write 성공은 같은 run의 cleanup 성공까지 포함한다.

```sh
pnpm verify:full-local-session-refresh-lifecycle
pnpm verify:full-local-session-refresh-lifecycle:json
FULL_LOCAL_SESSION_CANARY_ADAPTER=/absolute/operator/path/session-canary-adapter.mjs \
  pnpm verify:full-local-session-production-canary -- --json --phase milestone-a-t65
```

adapter는 저장소 밖 canonical absolute path의 현재 사용자 소유 `0600` regular file이어야 한다. immediate parent도 현재 사용자 소유 canonical real directory이며 exact `0700`이어야 한다. child에는 최소 runtime allowlist만 전달하고 ambient token/app secret은 전달하지 않는다. adapter는 token/cookie/session/user ID를 반환하거나 출력하면 안 된다. 운영 stale count는 전체 로그 누적값이 아니라 deploy 시작 이후 delta로만 입력한다. post-deploy evidence는 `com.homecook.production` LaunchAgent가 exact implementation checkout을 실행 중일 때만 기록된다.
배포 관찰 시작 전 생성된 binding은 거부한다. `milestone-a-t65`/`milestone-a-24h`/`milestone-b-7d`는 각각 배포 후 binding부터 65분, deploy 관찰 시작부터 24시간, 7일 경계를 runner가 검증하며 adapter 무응답은 최대 20분 안에 fail closed한다.
후속 24h/7d phase는 같은 implementation root의 exact `milestone-a-t65.json`이 같은 implementation SHA와 T+65/canary PASS를 증명해야 한다. symlink·alias·missing·invalid prior evidence는 거부한다. `milestone-b-7d`는 Stage 5 policy merge 전 `verify:full-local-gotrue-session-policy`가 의도적으로 없어서 실행 불가/fail closed가 정상이다.
