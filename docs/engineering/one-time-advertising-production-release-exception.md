# 광고 캠페인 일회성 production release 예외

- 상태: **canonical / one-time / expires**
- 승인된 release candidate: `4817b8b213b264485d75939ec764596727d1131c`
- 만료: `2026-09-15T15:00:00Z` 이후 사용 금지

이 문서는 2026-09-15 광고 캠페인을 위한 단 한 번의 수동 release-promoter 절차다. 장기 production release v3를 활성화하거나 완화하지 않으며, closed PR [#1505](https://github.com/netsus/homecook/pull/1505)의 별도 campaign command, manifest, workflow 또는 adapter를 되살리지 않는다. 새 framework, script, schema, workflow, tag 체계와 제품 변경을 만들지 않는다.

## 고정 승인 기록

이 예외가 참조할 수 있는 사용자 승인은 아래 exact tuple 하나뿐이다.

| 항목 | 값 |
| --- | --- |
| source orchestrator task | `019ff12c-dc8b-7752-9319-398a68cacb6e` |
| authorized actor | `netsus` |
| release SHA | `4817b8b213b264485d75939ec764596727d1131c` |
| release tree | `0f3fe8069e52887170a3878ebddd22b8a83b118d` |
| scope | app, full-local Supabase, YouTube worker의 production mutation 1회 |
| expires after | `2026-09-15T15:00:00Z` |

일반적인 “campaign 승인” 문구, 다른 task/actor/SHA/tree/scope/expiry는 authority가 아니다. 작성 작업은 자기 변경을 승인할 수 없다. 독립 외부 검증이 끝날 때까지 `master`를 동결하며, 그 전에 `origin/master`가 움직이거나 candidate identity가 달라지면 즉시 중단하고 새 exact identity에 대한 사용자 승인과 문서 갱신을 다시 받아야 한다.

## 변하지 않는 경계

- 실행자는 `release-promoter` 역할이어야 한다. 일반 작업과 이 문서 작성 작업은 server, production, DB, Docker, LaunchAgent, tag를 변경하지 않는다.
- 기존 [`local-mac-production-release-promotion.md`](./local-mac-production-release-promotion.md)의 v3 activation은 계속 `activation_blocked: true`다. 이 예외 통과를 v3 readiness, tag/attestation authority 또는 반복 가능한 일반 release 증거로 해석하지 않는다.
- app, full-local Supabase, YouTube worker는 하나의 bundle이며 모두 같은 candidate SHA에서 설치한다. 일부만 새 candidate로 남기는 mixed state는 성공이 아니다.
- Supabase Cloud, linked root, remote DB/credential은 사용하지 않는다. destructive DB reset, production volume 삭제, schema 변경은 금지한다.
- 만료 시각 이후에는 시작하지도 재개하지도 않는다. 이 문서를 다른 campaign, SHA, 환경 또는 후속 release에 복사·재사용하지 않는다.
- 이 문서는 기존 command의 v3 manifest/lock 검증을 우회하지 않는다. 아래 mutation command가 정상 guard에서 거부되면 release는 blocked다. direct `/bin/launchctl`, plist write, raw `docker compose`, validator 우회 또는 임의 flag 추가로 진행하지 않는다.

## 허용 명령과 target

아래 목록만 pre-approved다. `<...>`는 production mutation 전에 승인 기록에 실제 absolute path·UID·기존 release 값으로 치환해 command 전체를 고정한다. 값 누락, 새 option, 다른 entrypoint 또는 field 추정은 금지한다.

| 목적 | exact command/target |
| --- | --- |
| candidate install | `pnpm install --frozen-lockfile --offline` |
| candidate build | `pnpm mac-production:build` |
| isolated rehearsal | `pnpm release:rehearsal:run -- --candidate <completed-candidate-root-or-candidate.json> --production-env-authority <absolute-private-env-authority> --json` |
| app status/health | `pnpm mac-production:status`; `curl -I http://127.0.0.1:3100`; `curl -I http://127.0.0.1:3100/manifest.webmanifest`; `curl -I 'http://127.0.0.1:3100/api/v1/recipes?limit=1'` |
| app switch/start | candidate checkout에서 `pnpm mac-production:install -- --release-manifest <absolute-release-manifest> --lock-token <production-lock-token>` |
| app restart | `pnpm mac-production:restart -- --release-manifest <absolute-release-manifest> --lock-token <production-lock-token>` |
| app stop/absent | `pnpm mac-production:uninstall -- --release-manifest <absolute-release-manifest> --lock-token <production-lock-token>`; target `gui/<uid>/com.homecook.production`과 `~/Library/LaunchAgents/com.homecook.production.plist` |
| full-local status/health | `pnpm full-local-production:status -- --config <absolute-frozen-full-local-config>` |
| full-local start | `pnpm full-local-production:start -- --config <absolute-frozen-full-local-config> --release-manifest <absolute-release-manifest> --lock-token <production-lock-token> --bundle <absolute-attestation-bundle> --subject-manifest <absolute-subject-manifest> --trusted-root <absolute-trusted-root>` |
| full-local stop | `pnpm full-local-production:stop -- --config <absolute-frozen-full-local-config> --release-manifest <absolute-release-manifest> --lock-token <production-lock-token> --bundle <absolute-attestation-bundle> --subject-manifest <absolute-subject-manifest> --trusted-root <absolute-trusted-root>`; named volumes는 보존 |
| worker preflight | [`youtube-extraction-worker-runbook.md`](./youtube-extraction-worker-runbook.md)의 exact `preflight` command와 사전 고정한 6개 absolute input path |
| worker switch/start | 같은 runbook의 exact `install --execute --confirm-production LOCAL_FULL_PRODUCTION_WORKER_INSTALL` command에 `--release-manifest <absolute-release-manifest> --lock-token <production-lock-token>`을 추가; target `gui/<uid>/com.homecook.youtube-extraction-worker` |
| worker status/health | 같은 runbook의 exact `status`와 `health` command; capture target `gui/<uid>/com.homecook.youtube-extraction-worker` |
| worker stop/absent | 같은 runbook의 `stop`/`uninstall`은 dry-run rehearsal만 허용되므로 actual stop은 기존 guarded promotion transaction adapter 안에서만 수행 |

`pnpm release:production:promote`, `pnpm release:github:rulesets:apply`, `db reset`, `restore-platform`의 production target 실행, volume delete, direct `launchctl`/plist/Docker mutation은 금지한다. 특히 위 command에 필요한 기존 v3 authority가 없거나 current guard가 `activation_blocked`를 반환하면 이 docs-only 예외는 실행 가능하지 않으며 release-promoter는 중단한다.

## 시작 조건

release-promoter는 production mutation 전에 아래 항목을 한 기록에 남기고 서로 대조한다. 하나라도 불명확하면 중단한다.

- candidate SHA와 tree, 현재 `origin/master`, 사용자 승인 기록, 실행자 identity/role, UTC 시작 시각
- candidate SHA의 현재 required CI가 모두 완료·green이고 pending, rerun, failure, cancelled가 없다는 URL/ID 기반 증거
- 독립 검토자가 이 문서, exact candidate, campaign 기한과 외부 운영 준비 상태를 확인한 기록
- production 운영 checkout과 분리된 fresh clean detached server checkout
- 기존 app/full-local/YouTube worker 각각의 `running | absent`, 실제 경로·식별자·SHA와 read-only health 상태
- 각 component의 기존 상태로 돌아갈 **실행 가능한 exact rollback command**. 기존 상태가 `absent`면 candidate를 stop/uninstall하고 absent를 확인하는 exact command를 기록한다.
- Caddy의 config absolute path, service target, config SHA-256, public hostname, listener와 upstream `127.0.0.1:3100`. 저장소에는 승인된 Caddy mutation command가 없으므로 이 값은 read-only snapshot이며 Caddy reload/install/restart는 허용하지 않는다.

시작 조건을 기록한 뒤 candidate와 rollback 대상 bytes/config를 고정한다. 이후 source, lockfile, build output 또는 rollback command가 바뀌면 같은 시도를 계속하지 않는다.

## atomic one-time consume

첫 production mutation 직전에 release-promoter는 기존 canonical private `~/.homecook/releases/locks` ancestor를 no-follow로 검증한 뒤 exact create-only directory `~/.homecook/releases/locks/one-time-advertising-4817b8b213b264485d75939ec764596727d1131c.attempt`를 mode `0700`으로 원자 생성한다. 이 directory가 production lock이며 동시에 one-time attempt marker다.

- ancestor와 marker는 current release-promoter UID 소유의 실제 directory여야 하고 symlink가 아니어야 한다. marker는 mode `0700`, 생성 직후 nlink `2`여야 한다.
- `mkdir -m 700`의 already-exists, concurrent lock, owner/mode/nlink drift 또는 path의 symlink segment는 mutation 전에 fail closed한다. stale/partial marker도 자동 삭제하거나 재사용하지 않는다.
- marker 생성 성공 순간 사용 횟수는 소진된다. 성공, 실패, timeout, process crash, rollback 모두 재시도를 허용하지 않는다.
- 성공 또는 실패의 rollback이 끝나면 attempt directory 안에 exact create-only child directory `consumed`를 mode `0700`으로 생성한다. parent nlink `3`, child nlink `2`, 같은 UID와 no-symlink를 확인한다.
- attempt/consumed directory는 release 종료 뒤에도 audit evidence로 영구 보존한다. 자동 cleanup, rename, chmod, delete는 금지하며 post-campaign retirement도 authority 문서만 retired로 표시하고 marker는 지우지 않는다.

## 일회성 실행 순서

아래 순서를 바꾸거나 성공 단계를 생략하지 않는다. 각 단계 직전 현재 UTC가 만료 전인지 다시 확인한다.

1. **install/build 1회** — fresh detached checkout에서 lockfile 고정 install을 한 번 실행하고 같은 checkout에서 build를 한 번만 만든다. 이후 rehearsal이나 production 설치를 위해 rebuild하지 않는다.
2. **격리 rehearsal 1회** — production과 겹치지 않는 unique namespace와 high port를 사용한다. production checkout, production port, LaunchAgent, Caddy, DB data/volume을 변경하지 않는다. candidate app과 worker synthetic path가 같은 SHA/build에서 동작하는지 확인한 뒤 격리 자원만 정리한다.
3. **production read-only snapshot** — app/full-local/worker의 `running | absent`, 실제 SHA/경로, Caddy config/listener/upstream, port 3100 listener PID/process, local DB health와 persistence 기준을 다시 읽어 기록한다. 시작 조건의 rollback 대상과 달라졌으면 중단한다.
4. **DB backup/restore proof** — `pnpm full-local-production:platform-backup -- --config <absolute-frozen-full-local-config> --output <absolute-new-.tar.gz.enc>`로 fresh create-only encrypted archive를 만들고 `pnpm full-local-production:platform-backup:verify -- --archive <same-archive>`로 Keychain key access, HMAC/authentication, decryptability, manifest와 dump/storage structure를 검증한다. 이어 `pnpm verify:full-local-backup-restore-drill -- --execute --external-archive <same-archive> --escrow-envelope <absolute-envelope> --recovery-credential-file <absolute-mode-0600-file> --recovery-issuer-private-key <absolute-mode-0600-key> --restore-manifest <absolute-new-restore-manifest> --recovery-manifest <absolute-new-recovery-manifest>`를 실행해 isolated non-production namespace에서 restore/readback까지 PASS해야 한다. archive와 replacement recovery medium은 서로 다른 device여야 한다. production restore/reset/volume delete로 검증하지 않는다.
5. **최종 승인 고정** — 현재 조정 작업의 사용자 승인 결정, 독립 검토 결과, candidate SHA/tree, build checksum, rehearsal 결과, snapshot, backup checksum, exact rollback commands를 release-promoter가 한 번 대조한다. 작성자 self-approval은 금지한다.
6. **bundle 설치** — 기록된 순서와 명령으로 app, full-local, YouTube worker를 같은 candidate SHA/build에서 설치한다. 다른 commit, 별도 worker artifact 또는 새 build를 섞지 않는다.
7. **live 검증** — 아래 검증이 모두 성공한 뒤에만 release 성공을 선언한다.

### Caddy와 app cutover/rollback 증명

Caddy 자체는 변경하지 않는다. exact cutover는 Caddy의 사전 확인된 upstream `127.0.0.1:3100`을 유지한 채 위 guarded app install command로 그 port의 app LaunchAgent를 candidate로 교체하는 것이다. rollback은 mutation 전 기록한 previous checkout/manifest/lock authority에서 같은 guarded app install command를 실행하며, 이전 상태가 absent면 위 guarded app uninstall command를 실행한다.

cutover와 rollback 뒤에는 다음 proof chain을 모두 같은 시점에 기록한다.

1. `https://app.mumeok.kr/`, `/beta`, `/privacy`의 fresh response와 certificate/hostname
2. read-only Caddy config SHA-256와 public site block이 가리키는 exact upstream `127.0.0.1:3100`
3. port 3100의 exactly one listener PID/process와 `com.homecook.production`의 PID가 같다는 증거
4. 그 PID의 cwd가 candidate checkout이고 cwd의 Git SHA/tree가 승인 tuple과 exact 일치한다는 증거
5. cwd `.next/BUILD_ID`가 1회 build 직후 기록한 build marker와 exact 일치한다는 증거

1~5를 모두 만족해야 public URL 응답을 candidate health로 인정한다. URL 응답만 성공하거나 old PID/cwd/build marker가 응답한 경우는 실패다.

## 필수 live 검증

- Caddy/HTTPS의 public root, `/beta`, `/privacy`가 올바른 hostname과 certificate로 응답한다.
- auth health가 정상이며 보호 경로의 인증 경계가 유지된다.
- landing submit이 성공하고 제출 결과가 full-local DB에 실제로 남는다.
- analytics canary가 exact campaign/variant로 한 번 수집되고 비밀정보나 허용되지 않은 PII를 포함하지 않는다.
- YouTube worker synthetic job이 enqueue부터 terminal success까지 완료되고 app과 같은 candidate SHA로 실행된다.
- app/full-local/worker의 최종 `running | absent`, SHA/경로와 health를 다시 기록하며 candidate 외 mixed state가 없다.

실제 paid-ad 유입을 열기 전에 위 결과와 외부 준비 항목(운영 privacy 정보, `/privacy`, Turnstile production 설정/hostname, origin/rate-limit, retention, sender domain, 자산 권리)을 독립 검토자가 확인해야 한다. lead 보호 조건이 하나라도 없으면 기존 fail-closed 동작을 유지한다.

## 실패와 rollback

install 이후 어느 단계든 실패하거나 timeout, drift, expiry가 발생하면 새 진행을 멈춘다.

1. candidate app/full-local/worker를 안전하게 stop한다.
2. 시작 전에 기록한 exact rollback commands로 세 component 전체를 이전 `running` 상태로 복구한다. 이전 상태가 `absent`였거나 안전한 복구가 입증되지 않으면 candidate를 제거한 safe stopped/absent 상태를 유지한다.
3. DB backup은 보존하고 destructive reset, volume 삭제 또는 즉흥적인 production restore를 하지 않는다.
4. 최종 component 상태, health, 실패 지점, 실행한 rollback command와 결과를 기록한다. 일부 candidate가 남아 있으면 성공으로 닫지 않는다.

## 종료와 후속 작업

성공 기록에는 candidate SHA/tree, CI, 승인, build/rehearsal/snapshot/backup, live 검증과 최종 bundle 상태를 포함한다. 실패 기록에는 같은 identity와 rollback 결과를 포함한다. 어느 쪽이든 이 예외의 사용 횟수는 소진된다.

`2026-09-15T15:00:00Z` 이후 이 문서는 역사 기록만 남으며 release authority가 아니다. 캠페인 종료 뒤 별도 승인된 docs-governance 작업에서 이 예외를 retired로 표시하고, PR #1505에서 드러난 범위 팽창을 반복하지 않는 장기 release pipeline 재설계와 정리를 수행한다.
