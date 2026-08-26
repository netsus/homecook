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
- app/full-local/worker LaunchAgent를 같은 release bundle로 설치한다.
- current release descriptor를 readiness 이후에만 갱신한다.

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
- `production-release-approval-environment.json`: `can_admins_bypass: false`, required reviewer, prevent-self-review, custom branch policy readback
- `production-release-approval-deployment-branch-policies.json`: pagination을 닫은 exact `[{"type":"branch","name":"master"}]`; tag/wildcard/extra policy 금지
- `production-release-approval-environment-secrets.json`: pagination을 닫은 exact secret-name inventory `HOMECOOK_RELEASE_ATTESTATION_APP_ID`, `HOMECOOK_RELEASE_ATTESTATION_APP_PRIVATE_KEY`; legacy `HOMECOOK_RELEASE_ATTESTATION_APP_TOKEN` 또는 extra secret 금지

명시적 C2 admin apply는 clean exact `origin/master` checkout에서만 실행한다. 기본 `apply`는 계속 dry-run이고, 실제 변경은 exact confirmation·canonical repo·ADMIN 권한·resolved desired state·create-only absolute snapshot·0600 이하 private-key file gate가 모두 통과할 때만 허용한다. private key는 CLI 인수의 파일 경로로만 지정되고 secret 등록 시 stdin으로 전달되며, JSON/log/snapshot에는 경로나 값이 남지 않는다.

```bash
C2_ACTUAL_DIR="$(mktemp -d)"
rmdir "$C2_ACTUAL_DIR"
C2_RESULT_FILE="${C2_ACTUAL_DIR}.result.json"
pnpm release:github:rulesets:apply -- \
  --execute \
  --confirm APPLY_PRODUCTION_RELEASE_GITHUB_CONTROLS \
  --repo netsus/homecook \
  --snapshot-dir "$C2_ACTUAL_DIR" \
  --app-id 4724458 \
  --app-private-key-file /absolute/path/to/homecook-release-attestation.private-key.pem \
  --json > "$C2_RESULT_FILE"
jq -e '.activation_blocked == false and .actual_state == "matched"' \
  "$C2_RESULT_FILE" > /dev/null
```

CLI는 exact-name ruleset 3개만 POST/PUT하고, 모르는 ruleset은 삭제하지 않는다. canonical ref와 충돌하는 unknown ruleset, canonical name 중복, extra environment branch/tag policy, extra environment secret 이름은 mutation 전에 차단한다. API/secret/readback/snapshot 실패 뒤에는 자동 삭제·완화·rollback하지 않고 `partial_state: true`로 종료하므로, operator는 생성된 설정을 read-only로 확인한 뒤 같은 명령을 새 create-only snapshot 경로로 재실행한다. exact state 재실행은 mutation 없이 성공한다.

아래 명령은 apply 결과를 독립적으로 다시 수집해야 할 때 사용하는 수동 admin snapshot 예시다. runtime workflow나 tag App token으로 실행하지 않는다.

```bash
C2_ACTUAL_DIR="$(mktemp -d)"

gh api repos/netsus/homecook/rulesets --paginate --jq '.[].id' |
  while read -r rule_id; do
    rule_name="$(gh api "repos/netsus/homecook/rulesets/$rule_id" --jq '.name')"
    case "$rule_name" in
      production-release-master|production-release-tag-creation|production-release-tag-immutability)
        gh api "repos/netsus/homecook/rulesets/$rule_id" > "$C2_ACTUAL_DIR/$rule_name.json"
        ;;
    esac
  done
gh api repos/netsus/homecook/environments/production-release-approval \
  > "$C2_ACTUAL_DIR/production-release-approval-environment.json"
gh api "repos/netsus/homecook/environments/production-release-approval/deployment-branch-policies?per_page=100" \
  --paginate --jq '.branch_policies[]' > "$C2_ACTUAL_DIR/deployment-branch-policies.jsonl"
jq -s '{branch_policies: .}' "$C2_ACTUAL_DIR/deployment-branch-policies.jsonl" \
  > "$C2_ACTUAL_DIR/production-release-approval-deployment-branch-policies.json"
gh api "repos/netsus/homecook/environments/production-release-approval/secrets?per_page=100" \
  --paginate --jq '.secrets[]' > "$C2_ACTUAL_DIR/environment-secrets.jsonl"
jq -s '{secrets: .}' "$C2_ACTUAL_DIR/environment-secrets.jsonl" \
  > "$C2_ACTUAL_DIR/production-release-approval-environment-secrets.json"
node scripts/manage-production-release-rulesets.mjs verify --json \
  --actual-dir "$C2_ACTUAL_DIR" > "$C2_ACTUAL_DIR/verify.json"
jq -e '.activation_blocked == false and .actual_state == "matched"' \
  "$C2_ACTUAL_DIR/verify.json" > /dev/null
```

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
