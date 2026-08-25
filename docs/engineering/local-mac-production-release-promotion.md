# Homecook 서버 Mac release promotion runbook

상태: **canonical / active**
범위: 서버 Mac의 `homecook` release 승격 governance
기준 SHA: `origin/master`의 exact approved commit

이 문서는 Homecook 서버 Mac production release를 어떻게 승인하고, 어떤 작업만 승격 authority가 수행할 수 있는지 정의한다.
`master` merge는 통합 evidence일 뿐 release approval이 아니다.
release 승격은 항상 exact SHA, annotated `prod-*` tag, release manifest, attestation이 모두 일치할 때만 가능하다.

## 핵심 원칙

- production release는 `app`, `full-local`, `YouTube worker`를 하나의 release bundle로 본다.
- ordinary task는 release bundle의 production-changing command를 실행하지 않는다.
- only `release-promoter` role may mutate the production checkout, production pointer, or production LaunchAgent surfaces.
- development checkout에서의 direct `/bin/launchctl`, plist write, checkout mutation은 drift로 취급한다.
- docs와 validator는 cooperative boundary를 강제할 수는 있지만, same-user direct shell access 자체를 OS 수준으로 막았다고 과장하지 않는다.
- `master` merge는 다음 release 후보를 준비할 뿐, deployment approval을 자동으로 만들지 않는다.

## Release identity

release identity는 다음을 함께 만족해야 한다.

| field | meaning |
| --- | --- |
| `master_sha_at_approval` | 승인 시점의 `origin/master` exact full SHA |
| `release_sha` | 실제 승격 대상 exact full SHA |
| `release_tag` | `prod-YYYYMMDD.N` 형식의 annotated tag |
| `release_tree` | tag가 가리키는 tree SHA |
| `release_manifest_path` | 비밀이 없는 release manifest 경로 |
| `attestation_digest` | GitHub attestation digest |
| `promotion_id` | 단일 승격 시도 식별자 |
| `expected_running_release_sha` | 승격 후 실제 돌아야 하는 SHA |

Release SHA는 반드시 `origin/master`의 approved SHA와 같아야 한다.
사후에 master가 더 앞으로 나가도 이미 승인된 release identity는 바뀌지 않는다.

## 승격이 허용되는 역할

### coordinator

- 현재 상태를 읽고 승인 대상 SHA를 정리한다.
- release manifest와 handoff fields를 준비한다.
- merge / review / status evidence를 수집한다.
- 직접 production-changing command를 실행하지 않는다.

### release-promoter

- exact approved SHA를 확인한다.
- manifest와 attestation을 다시 검증한다.
- lock을 획득한 뒤 only one bundle을 승격한다.
- readiness, verify, reboot-verify를 같은 release identity로 닫는다.

### ordinary task

- status, read-only smoke, diagnostics, report, review만 수행한다.
- release bundle을 install, restart, stop, uninstall, rollback, repoint 하지 않는다.

## Promotion lifecycle

Stage B implementation target command family는 다음과 같다.

- `pnpm release:production:plan`
- `pnpm release:production:prepare`
- `pnpm release:production:promote`
- `pnpm release:production:status`
- `pnpm release:production:verify`

`status`는 read-only다.

### 1. plan

read-only validation 단계다.

- exact `origin/master` SHA를 읽는다.
- current running release와 candidate release의 차이를 기록한다.
- manifest preview만 만든다.
- production-changing action은 하지 않는다.

### 2. prepare

immutable checkout과 build readiness 단계다.

- exact SHA의 detached checkout을 만든다.
- clean tracked source만 승격 대상이다.
- build, offline install, isolated validation을 실행한다.
- 실패하면 production pointer를 건드리지 않는다.

### 3. promote

실제 mutation 단계다.

- promotion lock을 획득한다.
- running release가 preflight 동안 바뀌지 않았는지 재확인한다.
- exact checkout root와 manifest digest를 재검증한다.
- app/full-local/worker LaunchAgent를 같은 release bundle로 설치한다.
- current release descriptor를 readiness 이후에만 갱신한다.

### 4. verify

post-deploy evidence 단계다.

- app, full-local, worker가 같은 SHA/tree/build ID를 보고 있는지 확인한다.
- local-only Supabase, Docker, auth, JWKS, volume identity, migration head를 재확인한다.
- repository-managed verification이 failure를 보면 previous release로 되돌리고 이유를 남긴다.

### 5. reboot-verify

reboot evidence 단계다.

- FileVault와 login boundary를 먼저 확인한다.
- manual unlock이 필요한 경우 operator presence를 먼저 받는다.
- reboot 후 동일 release identity가 유지되는지 확인한다.

## Release manifest

manifest는 non-secret이며 only approved release evidence를 담는다.

필수 필드는 다음과 같다.

- `schema`
- `promotion_id`
- `release_tag`
- `release_sha`
- `release_tree`
- `master_sha_at_approval`
- `approved_at`
- `approved_by_task_id`
- `migration_head`
- `build_id`
- `backup_readiness_evidence`
- `previous_release_sha`
- `required_check_summary`
- `attestation_digest`
- `app_launch_agent_enabled`
- `full_local_launch_agent_enabled`
- `youtube_worker_launch_agent_enabled`

manifest와 current descriptor는 credentials, provider payload, secret path, raw backup path를 포함하지 않는다.

## Handoff fields

release-promoter나 release-aware coordinator는 handoff에 다음 필드를 반드시 적는다.

```text
production_mutation: false | release-promoter
approved_release_sha: <full SHA or N/A>
approved_release_tag: <prod tag or N/A>
promotion_id: <id or N/A>
release_lock_mode: read | write | none
operator_approval_attestation: <artifact reference or N/A>
expected_running_release_sha: <full SHA or N/A>
```

`production_mutation: false`는 ordinary task를 뜻하고, `release-promoter`는 production-changing authority를 뜻한다.

## Lock and drift rules

- lock acquisition은 create-only directory 방식으로 다룬다.
- 두 번째 promoter는 mutation 전에 종료한다.
- stale lock은 자동 삭제하지 않는다.
- status command는 현재, 이전, 준비 중, lock holder만 보여 준다.
- any unexpected release change during preflight aborts the promotion.
- direct `launchctl` or plist drift is blocker evidence, not a hidden recovery path.

## FileVault and login boundary

- FileVault 상태는 canonical macOS status command로 읽는다.
- FileVault가 enabled면 unattended reboot은 금지다.
- FileVault가 unknown이면 reboot을 중단한다.
- manual unlock이 필요한 경우 operator가 실제 presence를 attest해야 한다.
- Docker Desktop과 LaunchAgent readiness는 authenticated GUI login 이후에만 성공으로 본다.

## GitHub ruleset delivery

Stage C는 두 단계로 분리한다.

1. C1: desired-state docs, read-only validator, attestation workflow를 PR로 반영한다.
2. C2: explicit operator-approved admin apply와 GitHub REST API readback을 수행한다.

`master`와 `prod-*`는 force update / delete가 막혀야 하고, tag creation은 restricted actor만 가능해야 한다.
PR merge만으로 ruleset activation을 주장하지 않는다.

## Legacy local-first commands

`docs/engineering/current-mac-production-plan.md`의 다음 절차는 active-server deployment instruction이 아니다.

- `./scripts/run-local-mac-production.sh build`
- `./scripts/run-local-mac-production.sh install`
- `./scripts/run-local-mac-production.sh restart`
- `./scripts/run-local-mac-production.sh uninstall`
- `pnpm dlx supabase@2.110.0 db reset --local --yes`

위 절차는 새 머신 bootstrap, disposable isolated rehearsal, 또는 future promotion flow의 prepare-only 참고다.
운영 중인 서버 Mac의 active release에는 canonical promotion command만 쓴다.

## Canonical references

- `AGENTS.md`
- `docs/engineering/current-mac-production-plan.md`
- `docs/engineering/git-workflow.md`
- `docs/engineering/agent-workflow-overview.md`
- `docs/engineering/codex-task-handoff.md`
- `docs/engineering/supabase-local-only-operations.md`
