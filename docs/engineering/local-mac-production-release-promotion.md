# Homecook 서버 Mac release promotion runbook

상태: **canonical / active**
범위: 서버 Mac의 `homecook` release 승격 governance
기준 SHA: `origin/master`의 exact approved commit

현재 activation: **`activation_blocked: true` for `release:production:promote`**

rehearsal repeatability receipt와 GitHub attestation binding 구현이 merge되고 독립 code/security review를 통과하기 전까지 `pnpm release:production:promote`는 adapter 생성, lock 획득, Docker/LaunchAgent/DB/runtime 접근보다 먼저 무조건 fail closed한다. command가 `package.json`에 존재한다는 사실은 activation evidence가 아니다. `plan`, `prepare`, `status`, `verify`는 기존 read-only/prepare 경계에서 계속 사용할 수 있으며 이 kill switch가 불필요하게 막지 않는다.

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

GitHub release identity는 repository `netsus/homecook`, source ref `refs/heads/master`, signer workflow `netsus/homecook/.github/workflows/production-release-attestation.yml`로 고정한다. signer digest는 selected payload의 `release_sha`가 아니라 실제 workflow/verifier bytes가 실행된 immutable `workflow_head_sha`다. CLI 인수는 이 identity를 바꿀 수 없다. offline `gh attestation verify`는 release-tagged code에 pin된 custom trusted-root SHA-256 `65ca537f6ed8a47fd0e560c421baa1f6c1efb8b25fc200d8c5c02c0e92eb2b9c`와 먼저 일치해야 한다.

| field | meaning |
| --- | --- |
| `master_sha_at_approval` | 승인 시점의 `origin/master` exact full SHA |
| `master_tree_at_approval` | 승인 시점 master commit의 exact tree SHA |
| `release_sha` | 실제 승격 대상 exact full SHA |
| `workflow_head_sha` / `workflow_head_tree` | `GITHUB_RUN_ID`가 실행하는 workflow/verifier commit과 tree |
| `workflow_run_id` / `workflow_run_attempt` / `workflow_check_suite_id` | current self-run control-plane authority; `workflow_run_attempt`는 exact `1` |
| `release_tag` | `prod-YYYYMMDD.N` 형식의 annotated tag |
| `release_tag_object_sha` | remote readback으로 확인한 immutable annotated tag object의 exact SHA |
| `release_tree` | tag가 가리키는 tree SHA |
| `release_manifest_path` | 비밀이 없는 release manifest 경로 |
| `attestation_digest` | GitHub attestation으로 검증되는 subject manifest SHA-256 |
| `promotion_id` | 단일 승격 시도 식별자 |
| `expected_running_release_sha` | 승격 후 실제 돌아야 하는 SHA |
| `all_check_suite_count` | selected release의 self-suite를 포함한 complete check-suite count. `1000` 미만이어야 함 |
| `all_check_suite_ids_digest` | selected release의 sorted unique complete check-suite ID set SHA-256. current self-suite도 포함 |
| `all_check_suite_authority_digest` | ID 오름차순 exact closed `{app_id,app_name,app_slug,head_sha,id,repository}` suite authority digest; Actions zero-check suite도 workflow run과 1:1 결합 |
| `all_actions_workflow_run_provenance_digest` | self-suite를 제외한 exact-head Actions workflow run의 run/suite/workflow/path/event/attempt/repository provenance digest |
| `all_context_check_run_instances_digest` | self-suite만 제외한 모든 external context의 sorted unique `(check_run_id, check_suite_id)` instance set digest |
| `all_context_check_suite_ids` | 위 external instance set의 sorted unique suite IDs |
| `all_context_commit_statuses_digest` | selected release의 normalized `/statuses` 전체 digest |

current-tip 경로는 `release_sha == master_sha_at_approval`을 요구한다. approved ancestor selection 경로에서는 Release SHA/tree가 full selection의 `selected_sha/tree`와 같아야 한다. 두 경로 모두 `release_sha → workflow_head_sha → master_sha_at_approval → current origin/master` descendant lineage와 각 tree를 exact Git evidence로 재검증한다.
사후에 master가 정상 descendant로 더 앞으로 나가도 이미 승인된 release identity는 바뀌지 않지만 divergence/force-push는 tag 전과 attestation 발급 직전 모두 fail closed한다.

### Rehearsal authority binding exact fields

아래 field가 구현된 production manifest v3, attestation subject/predicate v3, annotated tag message, server verifier에 모두 exact binding되기 전에는 promote activation을 열 수 없다.

| field | exact comparison rule |
| --- | --- |
| `rehearsal_receipt_schema` | manifest, subject, predicate, tag message가 exact repeatability schema를 기록하고 server verifier가 모두 비교 |
| `selection_digest` | manifest, subject, predicate, annotated tag message, server verifier와 sealed candidate/repeatability authority가 same digest 또는 explicit current-tip `null`을 exact 비교 |
| `selected_sha` | selected 경로에서 manifest, subject, predicate, server verifier가 exact release SHA와 비교하고 current-tip은 explicit `null` |
| `selected_tree` | selected 경로에서 manifest, subject, predicate, server verifier가 exact release tree와 비교하고 current-tip은 explicit `null` |
| `observed_master_sha` | manifest, subject, predicate, server verifier가 full selection authority와 exact 비교하고 GitHub trusted verifier가 observed→current ancestry를 재검증 |
| `observed_master_tree` | manifest, subject, predicate, server verifier가 full selection authority와 exact 비교하고 GitHub trusted verifier가 exact Git tree를 재검증 |
| `selected_at` | manifest, subject, predicate, server verifier가 full selection authority UTC instant와 exact 비교 |
| `expires_at` | manifest, subject, predicate, server verifier가 full selection authority expiry와 exact 비교하고 GitHub trusted verifier가 fresh clock으로 재검증 |
| `approver_role` | manifest, subject, predicate, server verifier가 exact `human-release-approver` selection authority와 비교 |
| `approver_id` | manifest, subject, predicate, server verifier가 nonempty immutable selection approver identity와 exact 비교 |
| `approval_digest` | manifest, subject, predicate, server verifier가 full selection approval digest와 exact 비교 |
| `sealed_bundle_digest` | manifest, subject, predicate, tag message가 lowercase 64-hex same-bytes digest를 기록하고 server verifier가 실행 snapshot bytes와 모두 비교 |
| `repeatability_receipt_digest` | manifest, subject, predicate, tag message가 validated JCS receipt digest를 기록하고 server verifier가 local receipt 재계산값과 모두 비교 |
| `rehearsal_receipt_valid_until` | manifest, subject, predicate, tag message가 exact UTC RFC3339 expiry를 기록하고 server verifier가 첫 mutation 직전 현재 시각과 모두 비교 |

annotated tag object message는 rehearsal authority에 더해 `workflow_head_sha/tree`와 `master_sha/tree_at_approval`을 canonical order로 포함한다. current-tip 경로의 `selection_digest`는 tag text에서 `none`으로 materialize하지만 manifest/subject/predicate/receipt authority에서는 explicit JSON `null`로 cross-bind한다. remote readback tag object의 raw bytes와 SHA를 검증한 뒤에만 attestation을 발급한다. production manifest, subject, predicate, tag 중 하나라도 field가 없거나 값/order/expiry가 다르면 tag가 존재해도 deployment authority가 아니다.

local task/session ID는 감사 metadata일 뿐 trusted issuer가 아니다. local receipt self digest나 same-user local self-signature도 trust anchor가 아니다. trust chain은 `두 run receipt 검증 → deterministic repeatability receipt → production-release-approval GitHub attestation → pinned trusted root server verifier` 순서다.

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

Untagged exact-SHA candidate의 isolated build/run, repeatability receipt, mixed-state read-only classification은 `docs/engineering/local-mac-production-release-rehearsal.md`가 canonical authority다. production promote의 receipt gate는 `docs/engineering/local-mac-production-release-rehearsal.md`를 따르며, implementation이 merge되기 전에는 현재 promote 경로가 그 receipt gate를 충족한다고 주장하지 않는다.

rehearsal 통과 뒤에도 rebuild는 금지한다. production tag, manifest, attestation은 exact `sealed_bundle_digest`, `repeatability_receipt_digest`, `selection_digest`를 묶어야 하며 기존 `prod-*` tag immutability를 완화하지 않는다. selection은 candidate의 조상 SHA 선택 authority일 뿐 promote unlock이 아니며, activation kill switch와 receipt·attestation·classification·release-promoter gate를 대체하지 않는다.
protected tag push 직전에는 receipt 전체를 fresh clock으로 다시 검증하고 `rehearsal_receipt_valid_until`까지 strict 900초 초과 여유를 요구한다. equality 또는 더 짧은 여유는 tag push와 attestation을 모두 0으로 유지한다.

Stage B implementation target command family는 다음과 같다.

- `pnpm release:production:plan`
- `pnpm release:production:prepare`
- `pnpm release:production:promote`
- `pnpm release:production:status`
- `pnpm release:production:verify`

`status`는 read-only다.
`promote`는 현재 activation blocked이고 CLI help도 이를 명시해야 한다.

### 1. plan

read-only validation 단계다.

- exact `origin/master` SHA를 읽는다.
- current running release와 candidate release의 차이를 기록한다.
- manifest preview만 만든다.
- production-changing action은 하지 않는다.

### 2. prepare

legacy/reference checkout과 build readiness 단계다. split 4 production promote는 이 단계의 rebuild bytes를 execution source로 소비하지 않는다.

- exact SHA의 detached checkout을 만든다.
- clean tracked source만 승격 대상이다.
- build, offline install, isolated validation을 실행한다.
- 실패하면 production pointer를 건드리지 않는다.

### 3. promote

향후 receipt/attestation gate 구현 완료 뒤의 실제 mutation 단계다. 현재 CLI는 아래 어떤 단계에도 진입하지 않고 `activation_blocked`로 종료한다.

- lock 또는 adapter 생성 전 pre-adapter authority digest를 보존하고 initial/final-pre-mutation fresh read와 exact 비교한다. `classified_at`은 stable digest에서 제외하되 각 read의 expiry/freshness 검증은 생략하지 않는다.
- candidate/R2가 descriptor 또는 listener absent 상태의 complete/equal production snapshot을 관측했더라도 이는 actual promotion authority가 아니다. promote pre-mutation gate는 validated canonical `current.json`, 그 descriptor identity와 manifest 및 실제 component bytes에 결합된 exactly one deep-verified `referenced_snapshot:current:*`, port 3100 exact `present:true` non-absent listener, canonical app/full-local/worker LaunchAgent authority, `promotion_safe:true`, finding/recovery 0을 fresh inventory/classification에서 모두 요구한다. retained unreferenced snapshot 내부 cache 변화는 이 active authority에 포함하지 않지만 retained child name/lstat/known manifest metadata ambiguity와 active surface drift는 계속 fail closed한다.
- final authority read 뒤 exact sealed candidate component root와 manifest/receipt/physical digest를 다시 검증하면서 `~/.homecook/rehearsal/promotion-scratch/<random-UUID>` 아래 private create-only non-production scratch를 완전히 materialize한다. trusted parent와 attempt root는 non-symlink directory FD의 owner/mode/nlink/dev/inode/realpath identity 및 ancestor chain으로 create 전후 고정하고, snapshot release root도 같은 containment를 요구한다. app destination digest는 sealed app과 full-local `infra` overlay를 합친 expected tree로 미리 계산하고 app/full-local/worker/authority copy 뒤와 sealing 뒤 각각 exact 비교한다.
- preflight가 읽은 full-local config를 먼저 exact parse하고 `FULL_LOCAL_SECRET_DIR`을 approved home ancestor 아래 private root로 해석한다. social-provider enablement에 맞는 core/OAuth exact closed secret name set만 허용하고 root/ancestor와 각 file의 `O_NOFOLLOW` FD identity, owner/private mode, nlink/dev/inode/size/ctime/mtime/digest를 create 전후 고정한다. full-local secret set과 worker config/credential/token/provider secret root를 scratch의 private `runtime-inputs`에 freeze하고 frozen config의 `FULL_LOCAL_SECRET_DIR`을 새 private root로 create-only rewrite한다. 원본 source identity와 frozen inventory digest만 prelock authority에 넣으며 raw secret bytes/source path는 receipt/manifest/metadata/log에 기록하지 않는다. lock 이후 start/install/readiness/final probe와 resume-current는 frozen config/secret path만 소비하고 original external path를 다시 열지 않는다.
- external production release manifest bytes와 tag/attestation bundle/subject/trusted-root도 pre-lock에 `lstat → O_NOFOLLOW open → fstat → FD read → fstat → path lstat` 순서로 읽고 exact owner/mode/nlink/dev/inode/size/ctime/mtime와 private ancestor-chain identity를 freeze한다. create-only scratch에는 이 FD bytes만 쓰고 source/ancestor identity digest를 prelock authority에 포함한다. production lock을 만든 뒤 manifest source를 다시 열거나 original-path attestation verifier를 호출하지 않으며 lock acquisition, mutation authority, child installer는 frozen manifest path와 sealed authority files/cached trusted verification만 소비한다. same-byte A→B→A, delete/recreate, symlink/hardlink/path swap을 포함해 pre-lock source identity가 바뀌면 lock 0이고 lock 직후 original path가 valid-to-valid로 바뀌거나 복원되어도 frozen authority 결과에는 영향이 없다.
- frozen source ancestor authority는 full-local config/secret tree에만 한정하지 않는다. worker config/credential/token/provider-secret tree와 attestation bundle/subject/trusted-root 각각에 approved authority root를 지정하고, 모든 source file의 lexical root→parent chain을 정렬·중복 제거한 closed record로 만든다. 각 directory는 current-user-owned, non-symlink, non-group/world-writable, exact realpath여야 하며 `O_DIRECTORY|O_NOFOLLOW` FD를 열어 owner/mode/nlink/dev/inode/ctime/mtime/realpath digest를 기록한다. directory FD는 source file FD 재검증과 scratch copy 완료까지 유지하고 pre/post identity를 비교한다. overlapping root는 canonical path 하나로만 dedupe하며 parent rename/symlink/bind replacement/A→B→A가 보이면 file bytes/inode가 복원됐어도 production lock 0이다.
- sealed scratch의 digest와 device/inode identity, frozen runtime input authority를 pre-adapter/initial/final authority digest, `sealed_bundle_digest`, `repeatability_receipt_digest`에 묶는다. scratch 완료 뒤 production lock root를 만들기 직전에 fresh clock으로 `pre-lock` authority를 한 번 더 검증해 receipt expiry, inventory 5분 freshness, future claim과 tag/attestation을 재확인하고 mutable candidate는 다시 읽지 않는다. 이 단계가 실패하면 sealed scratch/private inputs는 private recovery evidence로 보존하되 promotion lock, adapter, install, Docker, LaunchAgent, DB, pointer mutation은 0이다.
- promotion lock을 획득하고 running release가 preflight 동안 바뀌지 않았는지 재확인한다.
- production `content-addressed sealed execution snapshot`은 frozen scratch의 app/full-local/worker/authority bytes만 입력으로 사용한다. lock 획득 뒤에는 원본 candidate, prepared checkout, 별도 worker artifact를 다시 읽지 않으며 production copy 뒤에도 prelock scratch authority와 각 component expected digest를 exact 비교한다. app/full-local/worker의 executable 및 plist WorkingDirectory는 이 snapshot만 사용한다.
- 별도 prepared checkout의 install/build 결과나 별도 worker artifact bytes는 execution snapshot 입력으로 사용하지 않는다.
- snapshot은 inode, normalized content digest, owner/mode를 각 spawn/install 직전과
  readiness 이후, descriptor commit 직전에 다시 검증한다.
- execution tree digest는 contained symlink의 dereferenced bytes와 executable metadata를
  포함한다. 외부 target은 거부하고, 내부 absolute symlink는 snapshot 내부의 equivalent
  relative target으로 다시 작성한 뒤 모든 final realpath containment를 재검증한다.
- 완전히 seal되기 전 scratch 실패는 anchored reservation identity가 같은 exact private attempt만 제거한다. seal된 scratch와 private frozen runtime inputs는 이후 실패 시 자동 삭제하지 않고 lock/snapshot evidence와 함께 manual recovery 근거로 보존한다. production snapshot도 실패 시 자동 삭제하지 않는다. lock, snapshot evidence, partial install state를
  manual recovery 근거로 함께 보존한다. 성공한 snapshot도 running release의 immutable root이므로
  자동 정리하지 않으며 별도 승인된 lifecycle 작업만 제거할 수 있다.
- app/full-local/worker LaunchAgent를 같은 release bundle로 설치한다.
- current release descriptor를 readiness 이후에만 갱신한다.
- app은 live process cwd의 execution snapshot evidence, full-local은 7개 running container의 immutable `homecook.release.sealed-bundle-digest`/`homecook.release.repeatability-receipt-digest` labels, worker는 launchd PID의 exact artifact cwd와 그 sealed execution snapshot evidence에서 `sealed_bundle_digest`와 `repeatability_receipt_digest`를 각각 관측해 readiness에 반환한다. adapter가 expected snapshot/manifest 값을 observation에 채우거나 덮어쓰는 것은 금지한다. canonical v2 `resume-current` LaunchAgent args에는 기존대로 `--release-identity`를 넣지 않되, read-only status/identity probe는 sealed `prepare.json` path를 별도 인수로 항상 전달한다. 세 observed 값이 모두 frozen authority와 exact 일치한 뒤에만 descriptor를 commit하며 running descriptor도 같은 digest를 보존한다.
- full-local config/secret freeze의 native filesystem 오류는 trust boundary에서 `runtime_input_freeze_failed` stable public message로 바꾼다. CLI stderr, JSON, receipt, manifest, PR evidence에는 source absolute path, secret basename/value, raw syscall message를 기록하지 않는다. 상세 native cause는 process-internal cause로만 유지할 수 있으며 직렬화하지 않는다.
- initial freeze 이후 final/pre-lock source file·directory·manifest identity revalidation에서 발생한 `lstat/open/fstat/realpath/ENOENT/EACCES/mode/nlink/digest` 오류는 모두 exact `runtime_input_source_changed: frozen runtime input source authority changed.`로 축약한다. CLI stderr/JSON/PR evidence에는 absolute/relative source path, basename/secret filename, raw syscall 또는 secret content를 기록하지 않으며 opaque internal cause만 process 안에 남길 수 있다.
- promotion authority verifier의 public boundary는 runtime input보다 넓다. pre-adapter, initial, final-pre-mutation, post-scratch pre-lock마다 release manifest, completed candidate authority, 두 individual receipt, repeatability receipt, R0 inventory/classification, attestation bundle/subject/trusted-root, git annotated-tag/remote readback과 `gh attestation verify`, component physical digest를 다시 검증한다. 이 boundary 안의 source/path/identity/parser/semantic/command failure는 exact `promotion_authority_source_changed: production promotion authority source changed.` 하나로 축약한다. CLI stderr/JSON/failure evidence에는 absolute·relative path, basename/receipt filename, raw JSON/payload, receipt identifier, `gh`/`git` stderr, syscall/ENOENT/EACCES 또는 secret value를 기록하지 않는다. internal cause는 직렬화하지 않는 process-local state로만 유지할 수 있다. pre-adapter failure는 adapter 생성 0, 이후 세 phase failure는 production lock/install/Docker/LaunchAgent/DB/pointer mutation 0이다.
- `promoteLocalMacProductionRelease` 자체도 dependency wiring 같은 non-source configuration guard 다음의 첫 manifest path normalization/read부터 production lock 획득이 성공해 boundary를 닫을 때까지 outer promotion-authority boundary 안에서 실행한다. manifest JSON/schema/git/attestation, initial returned shape/digest, sealed candidate identity, current descriptor/preflight, final valid-to-valid substitution와 candidate root equality, scratch reservation/materialization, frozen runtime input source error, pre-lock authority postcondition, manifest/scratch/component revalidation과 lock-root precondition 중 어느 branch가 실패해도 public output은 같은 `promotion_authority_source_changed` exact message다. `runtime_input_source_changed`는 adapter를 독립 호출할 때만 public일 수 있고 promotion flow 안에서는 outer code로 다시 정규화한다.
- production lock root를 건드리기 직전 frozen private scratch의 app/full-local/worker component root와 authority root를 lexical realpath·uid·mode·dev/inode가 stored snapshot과 같은 `O_DIRECTORY|O_NOFOLLOW` FD로 다시 연다. authority regular files도 각각 `O_NOFOLLOW` FD로 열어 file identity를 고정한다. FD를 유지한 채 세 component physical tree를 실제 bytes에서 각각 재다이제스트하고 authority tree를 다시 읽어 stored component/authority digest와 combined frozen-scratch authority를 비교한다. prelock scratch authority digest에는 이 fresh actual digest만 사용한다. re-digest 중 filesystem/identity 오류도 outer promotion code로 정규화하며 mutable candidate/source path는 다시 읽지 않는다.
- macOS Node/libuv는 `/dev/fd/<directoryFd>/relative` directory traversal을 지원하지 않으므로 그 경로를 authority로 사용하지 않는다. 대신 held component/authority root FD와 same dev/inode인 directory를 private snapshot parent의 unguessable sibling anchor로 원자 이동하고, original pathname을 비운 상태에서 anchor root를 다시 FD identity로 확인한다. anchor 아래 모든 nested directory는 `O_DIRECTORY|O_NOFOLLOW`, 모든 regular file은 `O_NOFOLLOW`로 열며 directory FDs는 traversal 종료까지 유지하고 file bytes는 열린 file FD에서만 읽는다. pre/post fstat+lstat과 parent identity를 비교하고 path replacement/restore, nested substitution, symlink/special/external node를 fail closed한다. deterministic sorted inventory는 relative path/type/mode/size/content digest/executable metadata를 포함하며 component/authority digest와 combined scratch authority는 이 FD-anchored inventory와 bytes에서만 계산한다.
- FD walker는 기존 `digestExecutionTree` physical digest byte grammar와 exact 호환돼야 한다. contained directory symlink를 dereference할 때 `target-dir\0` 뒤 각 sorted child마다 `target-name\0<name>\0`을 먼저 hash한 후 child target bytes를 이어 붙인다. empty/nonempty/nested directory symlink, contained file symlink와 duplicate alias의 digest는 기존 path implementation과 같아야 하며 cycle, external target, Git metadata와 special node rejection도 동일하게 유지한다.

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

canonical 실행 형식은 다음과 같다.

```bash
pnpm release:production:verify -- \
  --release-manifest /absolute/path/to/release.json \
  --bundle /absolute/path/to/attestation-bundle.jsonl \
  --subject-manifest /absolute/path/to/production-release-subject.json \
  --trusted-root /absolute/path/to/trusted-root.jsonl \
  --home-dir /absolute/server/home \
  --root-dir /absolute/homecook/repository \
  --json
```

`verify`는 production lock, descriptor, LaunchAgent, Docker, checkout을 변경하지 않는 read-only 명령이다.
offline attestation을 다시 확인한 뒤 `current.json`, sealed execution snapshot, app/full-local/worker
identity, canonical plist/process cwd, Docker/Auth/JWKS/volume provenance, database catalog migration
head를 같은 manifest와 대조한다. 검증 도중 promotion lock이나 descriptor/snapshot drift가 보이면
자동 복구·재시작·rollback 없이 fail closed한다.

- sealed snapshot은 canonical `~/.homecook/releases/execution-snapshots/<digest>` root와 current-user
  ownership/private mode에 다시 묶는다.
- canonical full-local config의 digest/dev/inode/ctime/mtime를 probe 전후로 비교하고
  `current.json.full_local_config_sha256`와 exact match해야 한다.
- app/full-local/worker probe 전후의 exact Docker container ID와 named-volume provenance generation,
  migration query의 PostgreSQL container ID가 모두 같아야 한다.
- promotion lock root generation을 probe 전후로 비교해 lock이 잠깐 생겼다가 사라진 경우도 거부한다.
- `gh`, `git`, `docker`, `node`는 fixed trusted resolver의 absolute executable만 사용하고,
  실행 전후 inode/mode/ctime/size/SHA-256 snapshot이 같아야 한다.

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
- `signer_digest` (`workflow_head_sha`와 exact match)
- `expected_release_integration_id` (`15368`)
- `promotion_id`
- `release_tag`
- `release_tag_object_sha`
- `release_manifest_path`
- `release_sha`
- `release_tree`
- `workflow_head_sha`
- `workflow_head_tree`
- `workflow_run_id`
- `workflow_run_attempt`
- `workflow_check_suite_id`
- `master_sha_at_approval`
- `master_tree_at_approval`
- `approved_at`
- `approved_by_task_id`
- `migration_head`
- `build_id`
- `rehearsal_receipt_schema`
- `selected_sha` (current-tip이면 `null`)
- `selected_tree` (current-tip이면 `null`)
- `observed_master_sha` (current-tip이면 `null`)
- `observed_master_tree` (current-tip이면 `null`)
- `selected_at` (current-tip이면 `null`)
- `expires_at` (current-tip이면 `null`)
- `approver_role` (current-tip이면 `null`)
- `approver_id` (current-tip이면 `null`)
- `approval_digest` (current-tip이면 `null`)
- `selection_digest`
- `sealed_bundle_digest`
- `repeatability_receipt_digest`
- `rehearsal_receipt_valid_until`
- `backup_readiness_evidence`
- `previous_release_sha`
- `expected_release_contexts`
- `required_check_summary`
- `all_check_suite_count`
- `all_check_suite_ids_digest`
- `all_check_suite_authority_digest`
- `all_actions_workflow_run_provenance_digest`
- `all_context_check_run_instances_digest`
- `all_context_check_suite_ids`
- `all_context_commit_statuses_digest`
- `attestation_digest`
- `app_launch_agent_enabled`
- `full_local_launch_agent_enabled`
- `youtube_worker_launch_agent_enabled`

manifest와 current descriptor는 credentials, provider payload, secret path, raw backup path를 포함하지 않는다.

기존 `homecook.local-mac-production-release.v1|v2` manifest와 v1/v2 subject/predicate/tag는 current workflow-run provenance binding이 없으므로 prepare/read-only 참고 evidence일 수는 있어도 production promote authority가 아니다. current authority는 production manifest v3와 GitHub workflow·subject/predicate v3·server verifier가 `all_actions_workflow_run_provenance_digest`까지 교차 결합해야 하고, canonical tag raw message의 기존 rehearsal/workflow/master binding도 그대로 만족해야 한다. fresh independent review, current-head CI와 merge 전에는 activation kill switch를 유지한다. receipt를 바꿔 끼우거나 attestation만 다시 발급하거나 sealed bundle을 rebuild하는 repair는 금지하며 두 isolated run부터 새 authority를 만든다.

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
- historical `com.homecook.full-local.production` LaunchAgent label은 rehearsal inventory의 read-only mixed-state alias일 뿐이다. release-promoter도 이를 rename/load/unload/restart하는 implicit recovery로 사용할 수 없고, actual promotion mutation과 readiness authority는 canonical `com.homecook.full-local-production`이 완전하게 복구·승인된 뒤에만 열린다.

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
- required context 이름은 모든 PR/master SHA에서 항상 생성한다. lightweight scope job은 항상 시작하고, required job은 `if: always()`로 시작한다. scope가 실패하거나 취소되면 첫 gate가 실패하며, scope가 성공하고 관련 출력이 `false`일 때만 explicit `N/A` 성공을 보고하고 heavy step을 건너뛴다. 내부 job ID와 `needs.scope` 참조는 `scope`를 유지하되 표시 context는 CI의 `ci-scope`, Security Review의 `security-review-scope`, Security Smoke의 `security-smoke-scope`로 고정하고, release-relevant workflow 사이의 동일한 표시 context 재사용을 금지한다. 이 lightweight 표시 context들은 merge gate가 요구하는 7개 공통 context가 아니므로 ruleset required context에 추가하지 않는다. workflow-level `paths`는 required-check deadlock 때문에 사용하지 않는다.
- `production-release-tag-creation`의 단일 `Integration` bypass actor id는 `HOMECOOK_RELEASE_ATTESTATION_APP_ID`와 같아야 한다. 이 ruleset에는 creation 외 rule을 두지 않는다.
- `production-release-tag-immutability`는 update / deletion / non-fast-forward만 포함하고 bypass를 누구에게도 부여하지 않는다. `update`가 fast-forward tag 이동까지 막으므로 exact App을 포함한 어떤 actor도 기존 `prod-*` tag를 이동하거나 삭제할 수 없다.
- environment `production-release-approval`은 `can_admins_bypass: false`, required reviewer와 prevent-self-review를 갖고 deployment policy가 exact master branch 하나인 master-only여야 한다. admin bypass readback 누락 또는 `true`는 activation blocker다.
- environment secrets는 App ID와 private key 두 개뿐이다. workflow는 `actions/create-github-app-token`으로 short-lived token을 만들고 tag App token은 `contents:write`만 요청한다. Administration permission과 고정 `HOMECOOK_RELEASE_ATTESTATION_APP_TOKEN`은 사용하지 않는다.
- workflow 승인 전, 환경 승인 직후, attestation 발급 직전의 세 snapshot은 먼저 quoted `check-suites?per_page=100` URL과 `--paginate --slurp`로 complete check-suite page authority를 읽는다. 모든 page의 `total_count`가 같고, page 수와 각 page 길이가 `per_page=100` 계산과 exact 일치하며, suite ID가 unique이고 모든 `head_sha`가 selected release SHA여야 한다. 모든 GitHub Actions App `15368` suite는 started check 수와 무관하게 suite repository가 exact `netsus/homecook`이고 exact 하나의 workflow run에 1:1 결합돼야 한다. orphan/missing/multi-map/wrong-repository Actions suite는 fail closed한다. [GitHub의 commit check-runs endpoint](https://docs.github.com/en/rest/checks/runs#list-check-runs-for-a-git-reference)가 최신 1,000 suite로 제한되므로 `total_count >= 1000`, page 누락/중복, count 불일치 또는 완전성 미증명은 protected tag/attestation 전에 fail closed한다.
- suite count가 1,000 미만인 정상 경로에서 quoted `check-runs?filter=all&per_page=100`와 `actions/runs?head_sha=<release_sha>&per_page=100`를 각각 한 번 full pagination한다. check-run/workflow-run page는 stable `total_count`, exact page 수/길이와 unique ID를 요구하며 workflow-run search의 1,000-result boundary는 fail closed한다. non-excluded started check는 trusted GitHub Actions App integration `15368`이거나 exact GitGuardian tuple `(app.id=46505, app.slug=gitguardian, app.name=GitGuardian, check name=GitGuardian Security Checks)` 1개여야 한다. Actions check는 같은 App의 complete suite와 exact 하나의 workflow run에 `check_suite_id`로 결합하고 workflow run은 repository/head repository `netsus/homecook`, exact release SHA, nonempty event/path, `run_attempt=1`, terminal `success`여야 한다. GitGuardian check는 check/suite App identity, empty `external_id`, exact release head와 suite repository `netsus/homecook`, `completed/success`가 모두 일치해야 한다. duplicate GitGuardian, tuple/name/repository/SHA/suite drift, unknown non-Actions started check는 거부한다. commit statuses는 current contract에서 exact empty다. 모든 raw check instance는 terminal `success` 또는 optional context의 exact `skipped`만 허용하며 expected 7개 context의 모든 instance와 allowlisted GitGuardian은 `success`여야 한다. `neutral`, pending/queued, failure/cancelled는 거부한다.
- 같은 context 이름의 복수 check-run은 각각 distinct check-run/suite/run ID이고, 모두 `run_attempt=1`이며, 동일한 `workflow_id + path` owner에서 나온 서로 다른 workflow run일 때만 허용한다. 따라서 같은 SHA의 정상 `push`와 후속 `schedule` first attempt는 `rerun=0`이고, 같은 run/suite 내부 중복, `run_attempt>1`, cross-workflow/path owner collision, missing/duplicate/incomplete metadata는 fail closed한다.
- complete sorted suite ID set의 `all_check_suite_count`와 `all_check_suite_ids_digest`, suite ID/App owner/repository/head의 `all_check_suite_authority_digest`, normalized external workflow provenance의 `all_actions_workflow_run_provenance_digest`, GitGuardian owner/repository/head/state를 포함한 sorted check-run instance set의 `all_context_check_run_instances_digest`를 subject/predicate v3, production manifest v3, server readback에 exact cross-bind한다. workflow run 없이 존재할 수 있는 zero-check external suite는 canonical repository/head와 unique owner tuple이 exact `Netlify(13473/netlify)`, `GitGuardian(46505/gitguardian)`, `Vercel(8329/vercel)`, `Claude(1236702/claude)` 중 하나인 경우뿐이다. 여기서 Claude tuple은 installed GitHub App의 zero-check suite evidence일 뿐 actor 호출 권한이 아니다. 그 밖의 external suite, duplicate owner, started non-GitGuardian check는 fail closed한다. `self-referential suite exception`은 exact `GITHUB_RUN_ID`의 current `workflow_check_suite_id` 하나뿐이다. complete suite count/digest에는 self-suite를 포함하되 external terminal-result/provenance set에서만 exact current suite를 제외한다. self workflow와 manifest/schema는 `workflow_run_attempt=1`을 exact 요구한다. exact run API readback은 workflow id/path, event, master ref, repository, `workflow_head_sha`, `run_id`, `run_attempt`을 모두 검증한다. `release_sha != workflow_head_sha`이면 selected release check set에 self-suite가 없으므로 exclusion은 empty다. 과거 retry suite나 동일 context name 전체를 제외하지 않는다.
- workflow 승인 전에는 selected release의 external check/status evidence와 current self-run control-plane evidence만 분리 보존한다. 환경 승인 직후 `master_sha_at_approval/tree`를 fresh capture한 다음에만 tag object와 subject/predicate를 만든다. tag push 직전과 attestation 발급 직전에 exact run, approval authority, external evidence, live master lineage를 각각 다시 확인한다.
- 두 workflow job은 selected release checkout을 executable authority로 사용하지 않는다. `github.sha`와 exact run API가 함께 증명한 `workflow_head_sha/tree`를 `trusted-current-master/`에 full-history immutable checkout하고 verifier, attestation builder, desired-state reader, tag-object builder를 모두 그 bytes에서 실행한다. selected SHA/tree는 같은 repository의 verified Git object와 subject artifact로만 소비한다.
- non-null selection은 raw canonical selection artifact를 별도 input으로 받아 digest 기반 basename/private file authority를 닫고, current master trusted verifier가 full selection field·expiry·approval과 selected→observed/current, observed→current ancestry 및 exact trees를 검증한다. protected tag push 직전과 `actions/attest` 바로 전마다 live current master ref를 readback하고 trusted checkout→live current master lineage와 full selection authority를 다시 검증한다.

attestation workflow artifact baseline은 다음 산출물이다.

- `production-release-subject.json`
- `production-release-predicate.json`
- `production-release-tag-object.raw`와 exact SHA
- `release-workflow-suite-ids.json`
- `workflow-authority.json`
- `approval-authority.json`
- `external-check-evidence.json`
- `check-suite-pages.json`
- `check-run-pages.json`
- `workflow-run-pages.json`
- `actions/attest@v4`가 만든 JSON bundle

server-side verifier는 위 subject manifest SHA-256, repository, tag, `release_tag_object_sha`, selected release SHA/tree, workflow head/run/suite authority, approval-time master SHA/tree, complete suite count/digest, all-context instance/status digests, external suite IDs, normalized terminal summary와 complete Git lineage를 함께 다시 확인한다.

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
- `docs/engineering/local-mac-production-release-rehearsal.md`
- `docs/engineering/git-workflow.md`
- `docs/engineering/agent-workflow-overview.md`
- `docs/engineering/codex-task-handoff.md`
- `docs/engineering/supabase-local-only-operations.md`
