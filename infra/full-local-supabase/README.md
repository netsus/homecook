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
