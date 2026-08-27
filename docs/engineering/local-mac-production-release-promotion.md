# Homecook 서버 Mac release promotion runbook

상태: **canonical / active**
범위: 서버 Mac의 `homecook` release 승격 governance
기준 SHA: `origin/master`의 exact approved commit

이 문서는 Homecook 서버 Mac production release를 어떻게 승인하고, 어떤 작업만 승격 authority가 수행할 수 있는지 정의한다.
`master` merge는 통합 evidence일 뿐 release approval이 아니다.
release 승격은 항상 exact SHA, annotated `prod-*` tag, release manifest, attestation이 모두 일치할 때만 가능하다.
즉, tag + attestation + manifest가 함께 맞아야 한다.

## 핵심 원칙

- production release는 `app`, `full-local`, `YouTube worker`를 하나의 release bundle로 본다.
- ordinary task는 release bundle의 production-changing command를 실행하지 않는다.
- only `release-promoter` role may mutate the production checkout, production pointer, or production LaunchAgent surfaces.
- development checkout에서의 direct `/bin/launchctl`, plist write, checkout mutation은 drift로 취급한다.
- docs와 validator는 cooperative boundary를 강제할 수는 있지만, same-user direct shell access 자체를 OS 수준으로 막았다고 과장하지 않는다.
- `master` merge는 다음 release 후보를 준비할 뿐, deployment approval을 자동으로 만들지 않는다.
- 일반 development PR의 `master` 통합에는 mandatory human approval을 요구하지 않는다. PR-only flow, required status checks, review-thread resolution은 계속 필수다.
- human approval은 actual production release environment/tag promotion 단계에서만 요구한다. `production-release-approval`의 exact human reviewer와 admin bypass 차단은 그대로 유지한다.

## Release identity

release identity는 다음을 함께 만족해야 한다.

GitHub release identity는 repository `netsus/homecook`, source ref `refs/heads/master`, signer workflow `netsus/homecook/.github/workflows/production-release-attestation.yml`, signer digest `release_sha`로 고정한다. CLI 인수는 이 identity를 바꿀 수 없다. offline `gh attestation verify`는 release-tagged code에 pin된 custom trusted-root SHA-256 `65ca537f6ed8a47fd0e560c421baa1f6c1efb8b25fc200d8c5c02c0e92eb2b9c`와 먼저 일치해야 한다.

| field | meaning |
| --- | --- |
| `master_sha_at_approval` | 승인 시점의 `origin/master` exact full SHA |
| `release_sha` | 실제 승격 대상 exact full SHA |
| `release_tag` | `prod-YYYYMMDD.N` 형식의 annotated tag |
| `release_tag_object_sha` | remote readback으로 확인한 immutable annotated tag object의 exact SHA |
| `release_tree` | tag가 가리키는 tree SHA |
| `release_manifest_path` | 비밀이 없는 release manifest 경로 |
| `attestation_digest` | GitHub attestation으로 검증되는 subject manifest SHA-256 |
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
- validated candidate와 별도 worker artifact를 promotion lock 보유 중 create-only
  `content-addressed sealed execution snapshot`으로 복제한다. app/full-local/worker의
  executable 및 plist WorkingDirectory는 이후 원본 candidate가 아니라 이 snapshot만 사용한다.
- snapshot은 inode, normalized content digest, owner/mode를 각 spawn/install 직전과
  readiness 이후, descriptor commit 직전에 다시 검증한다.
- snapshot은 실패 시 자동 삭제하지 않는다. lock, snapshot evidence, partial install state를
  manual recovery 근거로 함께 보존한다. 성공한 snapshot도 running release의 immutable root이므로
  자동 정리하지 않으며 별도 승인된 lifecycle 작업만 제거할 수 있다.
- app/full-local/worker LaunchAgent를 같은 release bundle로 설치한다.
- current release descriptor를 readiness 이후에만 갱신한다.

위 snapshot은 same-user 공격자가 writable prepared candidate를 잠깐 바꿨다가 복원하는
TOCTOU를 실행 바이트에서 분리하기 위한 cooperative hardening이다. 같은 사용자의 OS 권한 자체를
제거하지는 않으므로 snapshot 변조가 보이면 자동 복구하지 않고 promotion을 중단한다.
running descriptor는 non-secret artifact root/manifest와 content digest/identity만 기록하며
credential/config/policy 경로를 저장하지 않는다. 해당 경로는 매 promotion마다 canonical trusted
home/config resolver 또는 explicit operator input으로 다시 해석하고, descriptor에는 SHA-256만 비교
근거로 남긴다.

### 4. verify

post-deploy evidence 단계다.

- app, full-local, worker가 같은 SHA/tree/build ID를 보고 있는지 확인한다.
- local-only Supabase, Docker, auth, JWKS, volume identity, migration head를 재확인한다.
- repository-managed verification이 failure를 보면 먼저 migration compatibility gate와 rollback plan 유무를 확인한다.
- migration compatibility gate가 없으면 previous release로 자동 rollback 하지 않고 forward-fix 또는 operator review로 전환한다.
- rollback은 migration compatibility gate가 명시된 경우에만 수행한다.

### 5. reboot-verify

reboot evidence 단계다.

- FileVault와 login boundary를 먼저 확인한다.
- manual unlock이 필요한 경우 operator presence를 먼저 받는다.
- reboot 후 동일 release identity가 유지되는지 확인한다.

## Release manifest

manifest는 non-secret이며 only approved release evidence를 담는다.

필수 필드는 다음과 같다.

- `schema`
- `repository` (`netsus/homecook`)
- `source_ref` (`refs/heads/master`)
- `signer_workflow` (`netsus/homecook/.github/workflows/production-release-attestation.yml`)
- `signer_digest` (`release_sha`와 exact match)
- `expected_release_integration_id` (`15368`)
- `promotion_id`
- `release_tag`
- `release_tag_object_sha`
- `release_manifest_path`
- `release_sha`
- `release_tree`
- `master_sha_at_approval`
- `approved_at`
- `approved_by_task_id`
- `migration_head`
- `build_id`
- `backup_readiness_evidence`
- `previous_release_sha`
- `expected_release_contexts`
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
release_manifest_path: <path or N/A>
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

`production-release-master`의 routine attributed PR 정책은 `required_approving_review_count=0`, `require_last_push_approval=false`, `dismiss_stale_reviews_on_push=false`다. 이는 일반 Codex development PR을 human approval 없이 required CI로 통합하기 위한 계약이다. `require_extra_approval_for_unattributed_changes=true`는 별개의 readback-only unattributed Copilot 전용 설정으로 유지한다. GitHub의 현재 규칙상 base approval count가 0이면 이 설정도 실제 추가 승인을 만들지 않으므로 attributed Codex PR과 unattributed Copilot PR 모두 routine approval 때문에 차단되지 않는다. 즉, 현재는 향후 base approval 정책이 바뀌는 경우를 위한 보존된 안전 의도이며, 작성자 attribution이 있는 Codex PR의 routine approval count를 1로 되돌리는 설정이 아니다. broad bypass actor도 추가하지 않는다. 이 readback-only 필드가 누락되거나 `false`이면 C2는 기존처럼 UI 수동 복구를 요구하고 fail closed한다.

C1 validator는 `.github/rulesets/*.json` desired-state와 optional local actual snapshot만 읽는다.
즉, `pnpm release:github:rulesets:verify`는 actual snapshot이 없으면 `activation_blocked: true`로 fail-closed pending 상태를 기록하지만, network나 admin token 없이도 desired-state drift를 검증할 수 있다.
C2에서만 GitHub REST readback snapshot을 받아 `--actual-dir <path>` 비교로 `actual_state: matched`를 닫는다.

C1 activation_blocked는 actual readback이 없으면 계속 `true`다. desired state의 exact Integration actor는 GitHub App ID `4724458`, environment reviewer는 `User` ID `57648890`으로 확정하지만, resolved desired state만으로 activation을 주장하지 않는다. environment `can_admins_bypass`가 누락되거나 `true`이면 fail-closed blocker다.

C2 admin readback snapshot은 runtime release workflow와 분리된 별도 evidence다.
C2 operator만 별도 admin credential로 snapshot을 만들고 local verifier gate를 통과시킨 뒤 activation할 수 있다. runtime workflow는 GitHub Administration API를 호출하지 않는다. `GITHUB_TOKEN`은 `actions:read`, `checks:read`, `statuses:read`, `contents:read`로 exact ref/SHA/tree와 전체 started checks만 검증한다. runtime은 C2 actual settings를 self-administer하거나 self-readback했다고 주장하지 않는다.

C2 admin-visible snapshot은 다음 파일을 모두 포함해야 한다.

- `production-release-master.json`: `refs/heads/master`만 pin하고 `bypass_actors`를 명시한 ruleset detail
- `production-release-tag-creation.json`: `refs/tags/prod-*`의 creation rule과 단일 resolved `Integration` actor만 명시한 ruleset detail
- `production-release-tag-immutability.json`: 같은 tag pattern의 update / deletion / non-fast-forward rule과 빈 `bypass_actors`를 명시한 ruleset detail
- `production-release-approval-environment.json`: `can_admins_bypass: false`, exact `wait_timer: 0`, required reviewer, prevent-self-review, custom branch policy readback
- `production-release-approval-deployment-branch-policies.json`: pagination을 닫은 exact `[{"type":"branch","name":"master"}]`; tag/wildcard/extra policy 금지
- `production-release-approval-environment-secrets.json`: pagination을 닫은 exact secret-name inventory `HOMECOOK_RELEASE_ATTESTATION_APP_ID`, `HOMECOOK_RELEASE_ATTESTATION_APP_PRIVATE_KEY`; legacy `HOMECOOK_RELEASE_ATTESTATION_APP_TOKEN` 또는 extra secret 금지
- `production-release-repository-rulesets.json`: `includes_parents: false`, `scope: repository`, repository mutation target의 full detail inventory
- `production-release-effective-rulesets.json`: `includes_parents: true`, `scope: effective`, organization/parent inheritance까지 포함한 full detail inventory
- `production-release-snapshot-completion.json`: 모든 required snapshot 파일의 ordered SHA-256 inventory, exact head/remote master, canonical repository, App/reviewer identity를 묶은 final `status: verified` marker

독립 `verify --actual-dir`도 위 repository/effective inventory 두 파일을 필수 evidence로 읽는다. 파일 누락, scope/includes_parents 불일치, summary-only entry, duplicate ID/name, canonical ruleset 누락/중복/mismatch, unknown canonical-ref overlap, inherited parent conflict 중 하나라도 있으면 `activation_blocked: true`이며 기존 individual ruleset 3개만으로 matched를 주장하지 않는다.

completion marker는 snapshot 저장 뒤 full actual state 재독, semantic equality, remote master 불변, marker 없는 preliminary verifier가 모두 성공한 뒤에만 `wx`, mode `0600`으로 생성한다. 독립 verifier는 marker 누락, identity/head 불일치, required file 순서/목록 불일치, SHA-256 mismatch를 모두 차단한다. 실패한 attempt의 기존 snapshot 파일은 삭제하지 않지만 marker가 없으므로 activation evidence가 아니다.

C2 execute의 trust boundary는 worktree 파일이나 package script가 아니다. operator는 먼저 exact `C2_HEAD`를 `/usr/bin/git`으로 고정하고 `/usr/bin/git show "$C2_HEAD":scripts/bootstrap-production-release-rulesets.mjs`로 immutable blob을 stdout에 얻는다. Node는 PATH에서 찾지 않고 operator가 realpath까지 확인한 absolute regular executable `C2_NODE`만 사용하며, symlink·non-executable·group/world-writable mode를 사전에 거부한다. bootstrap도 `process.execPath`의 absolute realpath, regular executable, safe mode를 다시 검증한 뒤 child를 시작한다. bootstrap은 `/usr/bin/git archive`로 같은 exact head의 C2 구현과 desired policy blobs만 private mode-0700 temp root에 materialize하고, object format에 맞는 blob ID·symlink·executable mode를 전부 재검증한 뒤 그 code root에서만 execute entry를 시작한다. worktree의 direct `apply --execute`는 local implementation import 전에 authoritative 명령을 출력하고 거부한다. temp root는 child 종료 뒤 삭제하며 private key 값은 archive, argv, env, log에 복사하지 않는다.

source repository Git root와 immutable code root는 분리한다. desired-state JSON과 C2 module은 immutable archive에서만 읽고, source repository worktree는 Git HEAD/origin/master·remote master·hidden drift 확인에만 사용한다. 방어 심층화로 HEAD tree의 모든 tracked blob을 열거하고 worktree bytes, symlink target, executable mode를 Git object ID와 직접 비교해 desired-state parsing 전과 first mutation 직전에 다시 닫는다. completion marker는 archive를 만든 exact HEAD tree와 desired policy blob IDs를 함께 묶는다.

모든 inventory full-detail entry는 `source`와 `source_type`을 명시한다. repository-origin entry는 source가 exact `netsus/homecook`, source_type이 `Repository`이고 `bypass_actors`까지 읽혀야 한다. parent-origin에서만 unreadable `bypass_actors` omission과 official `exempt` bypass mode를 허용한다. Organization inherited conditions는 `repository_name | repository_id | repository_property` 중 정확히 하나를 허용한다. Enterprise inherited conditions는 `organization_name | organization_id | organization_property` 중 하나와 `repository_name | repository_property` 중 하나를 조합하며 enterprise `repository_id`는 허용하지 않는다. 현재 [GitHub Organization Rules REST endpoint](https://docs.github.com/en/rest/orgs/rules?apiVersion=2026-03-10)의 actor enum은 `Integration | OrganizationAdmin | RepositoryRole | Team | DeployKey | User`만 허용한다. `EnterpriseOwner`/`EnterpriseRole`은 [Enterprise Rules endpoint](https://docs.github.com/en/enterprise-cloud@latest/rest/enterprise-admin/rules?apiVersion=2026-03-10)에서만 허용하고 Organization/Repository source에서는 fail closed한다. Integration/RepositoryRole/Team/User는 positive ID, DeployKey는 null ID, EnterpriseRole ID는 optional positive다. OrganizationAdmin/EnterpriseOwner ID는 해당 source의 공식 schema에서 ignored이므로 null 또는 integer를 입력받되 stable comparison에서는 null로 materialize한다. `pull_request` bypass는 branch-only이며 DeployKey에는 금지한다. ambiguous union/unknown nested field는 fail closed한다. C2 execute는 first mutation 전에 existing environment admin bypass, `includes_parents=true` effective inventory, repository↔effective canonical ID/source/detail consistency를 닫는다. repository/push target은 ref_name omission 자체로 branch/tag release conflict가 아니며 branch/tag matcher는 include/exclude를 함께 평가한다.

명시적 C2 admin apply는 clean exact `origin/master` checkout에서만 실행한다. 기본 `apply`는 계속 dry-run이고, 실제 변경은 exact confirmation·canonical repo·ADMIN 권한·resolved desired state·create-only absolute snapshot·0600 이하의 nonempty valid RSA private-key file gate가 모두 통과할 때만 허용한다. CLI는 first mutation 직전 canonical GitHub `refs/heads/master`를 exact local HEAD와 비교하고, snapshot 전후 full actual state에도 같은 remote master 검증을 포함한다. private key는 `O_NOFOLLOW` 단일 open으로 얻은 FD에서 fstat/mode/read/RSA parse를 끝내고, 같은 in-memory Buffer만 secret stdin에 사용한다. mutation 뒤 path를 다시 열지 않으며 JSON/log/snapshot에는 경로나 값이 남지 않는다.

같은 in-memory RSA Buffer로 `iss=4724458`, `alg=RS256`, 안전한 iat skew와 10분 이하 expiry의 short-lived GitHub App JWT를 만들고, TLS가 고정된 `https://api.github.com/app`에 직접 GET한다. API version, User-Agent, timeout을 고정하고 response `id=4724458` readback 전에는 mutation하지 않는다. JWT/private key는 argv, child env, result JSON, log, snapshot에 남기지 않는다.

```bash
C2_ACTUAL_DIR="$(mktemp -d)"
rmdir "$C2_ACTUAL_DIR"
C2_RESULT_FILE="${C2_ACTUAL_DIR}.result.json"
C2_NODE="/absolute/realpath/to/trusted/node"
case "$C2_NODE" in /*) ;; *) exit 1 ;; esac
test -f "$C2_NODE" && test ! -L "$C2_NODE" && test -x "$C2_NODE"
C2_NODE_MODE="$(/usr/bin/stat -f '%Lp' "$C2_NODE")"
case "$C2_NODE_MODE" in *[2367][0-7]|*[0-7][2367]) exit 1 ;; esac
C2_HEAD="$(/usr/bin/git rev-parse HEAD)"
/usr/bin/git show "$C2_HEAD":scripts/bootstrap-production-release-rulesets.mjs | \
  /usr/bin/env -u NODE_OPTIONS "$C2_NODE" --input-type=module - \
  --source-repo "$(/usr/bin/git rev-parse --show-toplevel)" \
  --expected-head "$C2_HEAD" \
  apply --execute \
  --confirm APPLY_PRODUCTION_RELEASE_GITHUB_CONTROLS \
  --repo netsus/homecook \
  --snapshot-dir "$C2_ACTUAL_DIR" \
  --app-id 4724458 \
  --app-private-key-file /absolute/path/to/homecook-release-attestation.private-key.pem \
  --json > "$C2_RESULT_FILE"
jq -e '.activation_blocked == false and .actual_state == "matched"' \
  "$C2_RESULT_FILE" > /dev/null
```

CLI는 exact-name ruleset 3개만 POST/PUT하고, 모르는 ruleset은 삭제하지 않는다. repository mutation inventory는 `includes_parents=false`, effective safety inventory는 `includes_parents=true`로 분리한다. canonical ref와 충돌하거나 canonical 이름을 재사용하는 organization/parent ruleset, repository canonical name 중복, extra environment branch/tag policy, extra environment secret 이름은 fail closed한다. 두 exact environment secret은 매 execute마다 stdin으로 다시 upsert한다. CLI는 environment/policies/secrets/repository/effective rulesets/remote master를 하나의 full actual state로 읽어 snapshot을 저장하고, 저장 직후 전체를 다시 읽어 semantic equality와 master 불변을 증명한다. REST API/secret/readback/snapshot 실패 뒤에는 자동 삭제·완화·rollback하지 않고 `partial_state: true`로 종료한다.

CLI의 모든 `gh api` REST 호출은 `--hostname github.com`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2026-03-10`을 고정한다. environment secret target도 `github.com/netsus/homecook`으로 고정한다.

production tool은 PATH에서 탐색하지 않는다. Git/tar는 supported macOS의 `/usr/bin/git`, `/usr/bin/tar`만 허용하고 realpath target이 각각 `/usr/bin/git`, `/usr/bin/bsdtar` 또는 `/usr/bin/tar`인지 확인한다. `gh`는 `/opt/homebrew/bin/gh`, `/usr/local/bin/gh`, `/usr/bin/gh` 순서의 absolute candidate만 확인하며 Homebrew Cellar 또는 동일 system path로 realpath한 regular executable만 사용한다. 모든 executable은 execute bit가 있고 group/world write bit가 없어야 하며, 조건을 만족하는 `gh`가 없으면 private key를 읽거나 network/mutation을 시작하기 전에 fail closed한다.

Environment PUT에는 GitHub REST가 문서화하지 않은 `can_admins_bypass`를 보내지 않는다. 다른 environment 필드를 create/update한 뒤 readback의 `can_admins_bypass`가 누락되거나 `true`이면 CLI는 `manual_action_required: true`로 fail closed한다. 이때 repository **Settings → Environments → production-release-approval**에서 **Allow administrators to bypass**를 끄고, 기존 snapshot 경로를 재사용하지 말고 새 create-only 경로로 같은 apply를 다시 실행한다. `can_admins_bypass: false` REST readback 전에는 matched snapshot이나 activation을 주장하지 않는다.

Environment wait timer의 effective 값은 REST `protection_rules`에 wait-timer rule이 0개면 `0`, 1개면 그 rule의 값이다. 2개 이상은 invalid/mismatch다. 따라서 PUT `wait_timer: 0` 뒤 GitHub가 wait-timer rule을 생략해도 exact desired state로 수렴하지만 nonzero 또는 duplicate rule은 activation blocker다.

Raw `gh api` readback은 troubleshooting에만 사용할 수 있다. 그 출력은 apply가 마지막에 만드는 `production-release-snapshot-completion.json`과 결합할 수 없으므로 C2 evidence directory에 저장하거나 `verify --actual-dir`에 넘기지 않는다. operator는 completion marker를 수동 작성하지 않는다. authoritative C2 evidence는 위 immutable `git show ... | node - ... apply --execute` 명령이 새 create-only snapshot directory에 생성한 결과만 인정한다.

C2 operator는 다음을 admin readback으로 함께 닫아야 한다.

- `production-release-master`의 공통 required context는 `build`, `changes`, `dependency-audit`, `policy`, `quality`, `security-function-authorization`, `security-smoke`이며 모두 GitHub Actions App integration id `15368`에 묶인다. `dependency-audit`는 secret 없이 실행되는 security floor다.
- `snyk`는 trusted `push` / `schedule` / `workflow_dispatch`에서만 실행하는 optional additional started check다. pull request에서는 secret-free `dependency-audit`만 실행하며 `SNYK_TOKEN`은 pinned Snyk action step에만 주입한다. `SNYK_TOKEN`이 없다는 사실이 required release context 성공으로 대체되거나 `dependency-audit`를 우회할 수 없다.
- required context 이름은 모든 PR/master SHA에서 항상 생성한다. lightweight scope job은 항상 시작하고, required job은 `if: always()`로 시작한다. scope가 실패하거나 취소되면 첫 gate가 실패하며, scope가 성공하고 관련 출력이 `false`일 때만 explicit `N/A` 성공을 보고하고 heavy step을 건너뛴다. workflow-level `paths`는 required-check deadlock 때문에 사용하지 않는다.
- `production-release-tag-creation`의 단일 `Integration` bypass actor id는 `HOMECOOK_RELEASE_ATTESTATION_APP_ID`와 같아야 한다. 이 ruleset에는 creation 외 rule을 두지 않는다.
- `production-release-tag-immutability`는 update / deletion / non-fast-forward만 포함하고 bypass를 누구에게도 부여하지 않는다. `update`가 fast-forward tag 이동까지 막으므로 exact App을 포함한 어떤 actor도 기존 `prod-*` tag를 이동하거나 삭제할 수 없다.
- environment `production-release-approval`은 `can_admins_bypass: false`, required reviewer와 prevent-self-review를 갖고 deployment policy가 exact master branch 하나인 master-only여야 한다. admin bypass readback 누락 또는 `true`는 activation blocker다.
- environment secrets는 App ID와 private key 두 개뿐이다. workflow는 `actions/create-github-app-token`으로 short-lived token을 만들고 tag App token은 `contents:write`만 요청한다. Administration permission과 고정 `HOMECOOK_RELEASE_ATTESTATION_APP_TOKEN`은 사용하지 않는다.
- workflow 승인 전후 check-runs는 quoted `filter=all&per_page=100` URL과 `--paginate`로 모든 page를 읽는다. 7개 expected context의 latest trusted GitHub Actions App result는 각각 정확히 `success`여야 하며 `skipped`/`neutral`은 expected context를 충족하지 못한다. 추가 non-required check의 `skipped`/`neutral`은 intended skip으로 기록할 수 있다.
- `self-referential suite exception`은 canonical `production-release-attestation.yml`의 exact `workflow_dispatch` event와 exact release SHA에 속한 현재/이전 retry `check_suite_id`에만 적용한다. workflow-specific Actions REST를 full pagination으로 읽고 path, workflow id, event, head SHA를 모두 검증한 nonempty unique positive ID 목록만 제외한다. pre/post approval 목록은 evidence JSON으로 업로드하며 exact equality가 깨지면 concurrent drift로 실패한다. 목록 밖의 external bad/pending/rerun, failed, cancelled, queued check는 항상 0이어야 하며 그대로 fail-closed한다.
- workflow 승인 뒤 `github.ref`, `github.workflow_ref`, exact `origin/master`, tree, 전체 check-runs와 `/statuses` 모든 page를 다시 읽고 preflight subject/predicate evidence와 비교한다. tag push 직전에도 `origin/master`를 다시 확인한다. deterministic raw annotated tag object를 App token으로 먼저 push한 뒤 GitHub ref API가 exact `release_tag_object_sha`와 object type `tag`를 반환해야만 `actions/attest`를 실행한다. remote readback 전 attestation은 금지한다.

attestation workflow artifact baseline은 다음 세 가지다.

- `production-release-subject.json`
- `production-release-predicate.json`
- `production-release-tag-object.raw`와 exact SHA
- `release-workflow-suite-ids.json`
- `actions/attest@v4`가 만든 JSON bundle

server-side verifier는 위 subject manifest SHA-256, repository, tag, `release_tag_object_sha`, release SHA, tree, normalized terminal check summary를 함께 다시 확인한다.

remote tag push/readback 뒤 attestation 생성이 실패하면 해당 immutable tag는 attestation이 없는 상태로 남는다. 이 tag는 production deployment authority가 아니며 승격에 사용할 수 없다. immutability ruleset 때문에 삭제·이동하지 않고, 재시도는 반드시 다음 `prod-YYYYMMDD.N` 번호를 사용한다.

## Legacy local-first commands

`docs/engineering/current-mac-production-plan.md`의 다음 절차는 active-server deployment instruction이 아니다.

- `./scripts/run-local-mac-production.sh build`
- `./scripts/run-local-mac-production.sh install`
- `./scripts/run-local-mac-production.sh restart`
- `./scripts/run-local-mac-production.sh uninstall`
- `pnpm dlx supabase@2.110.0 db reset --local --yes`

위 절차는 새 머신 bootstrap, disposable isolated rehearsal, 또는 future promotion flow의 prepare-only 참고다.
운영 중인 서버 Mac의 active release에는 canonical promotion command만 쓴다.
legacy build / install / restart / uninstall / db reset은 active-server release가 아니라 bootstrap/rehearsal 전용이다.

## Canonical references

- `AGENTS.md`
- `docs/engineering/current-mac-production-plan.md`
- `docs/engineering/git-workflow.md`
- `docs/engineering/agent-workflow-overview.md`
- `docs/engineering/codex-task-handoff.md`
- `docs/engineering/supabase-local-only-operations.md`
