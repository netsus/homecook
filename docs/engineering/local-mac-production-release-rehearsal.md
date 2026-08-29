# Homecook 서버 Mac release rehearsal 계약

상태: **canonical / implementation split 2 in review**
변경 유형: `docs-governance`
production mutation: **금지 (`false`)**
제품 계약 영향: **N/A** — 공식 제품 5종, public API, DB schema 계약을 바꾸지 않는다.

이 문서는 사용자가 선택한 CI-green `origin/master`의 exact SHA를 production과 분리된 서버 Mac 환경에서 반복 가능하게 실행하고, 검증된 동일 bytes만 후속 production authority로 승격하기 위한 canonical 계약이다.

active production 승격의 역할·lock·tag immutability·manifest·attestation authority는 계속 [local-mac-production-release-promotion.md](./local-mac-production-release-promotion.md)가 가진다. 이 문서는 그보다 앞선 untagged exact-SHA candidate, isolated rehearsal, receipt, mixed-state read-only classification을 담당한다.

현재 구현 범위는 R0 inventory, mixed-state classify, receipt schema/JCS/offline verify와 R1 candidate build/seal, production surface snapshot foundation까지다. isolated run은 아직 구현되지 않았다. 따라서 이 구현만으로 rehearsal 또는 production promotion이 가능하다고 주장하지 않으며, 모든 split과 독립 검토가 끝날 때까지 기존 `release:production:promote` activation kill switch를 유지한다.

## 목표와 비목표

목표는 다음과 같다.

- 특정 `.17` prepared candidate를 배포하는 것이 아니라 임의의 CI-green `origin/master` exact SHA를 입력으로 받는다.
- production tag를 만들기 전에 candidate bytes를 build/seal하고 실제 Docker, Node, worker, migration을 isolated environment에서 실행한다.
- 같은 SHA를 최소 2회 rehearsal해 sealed bundle digest 재현성과 격리·cleanup을 증명한다.
- rehearsal을 통과한 exact sealed bundle digest를 rebuild 없이 production tag, manifest, attestation에 결합한다.
- rehearsal 전후 production surface가 변하지 않았다는 no-production-mutation evidence를 남긴다.
- 현재처럼 app, worker, full-local, descriptor, lock, migration evidence가 섞인 상태는 mutation 없이 분류하고 별도 recovery plan만 만든다.

비목표는 다음과 같다.

- production install, restart, stop, uninstall, rollback, pointer 변경, LaunchAgent 변경
- production full-local DB reset, migration apply, volume 삭제·복제, 실제 데이터 복사
- `prod-*` tag 생성·이동·삭제 또는 attestation 발급
- Phase A에서 확인된 `.17` candidate의 자동 promotion 또는 recovery
- 제품 workpack, 공식 제품 5종, public API, DB schema 계약 변경
- Supabase Cloud, linked root, remote DB, remote credential 또는 remote gate 사용

## 책임 단일 소스

| 책임 | canonical authority |
| --- | --- |
| rehearsal candidate lifecycle, isolation, receipt, repeatability | 이 문서 |
| production promotion 역할, tag immutability, manifest, attestation, lock | `local-mac-production-release-promotion.md` |
| Supabase target, isolated replay, production destructive-operation 금지 | `supabase-local-only-operations.md` |
| 새 머신 bootstrap와 historical local-first 절차 | `current-mac-production-plan.md` |
| change type별 required checks와 review | `agent-workflow-overview.md` |
| branch, commit, PR, current-head merge gate | `git-workflow.md` |
| 독립 Codex task handoff와 task ID 분리 | `codex-task-handoff.md` |
| deterministic QA, exploratory QA, eval 실행 기준 | `qa-system.md` |
| OMO의 현재 actor-free validation 경계 | `workflow-v2/README.md` |

상위 문서는 이 문서를 forward pointer로만 가리키고 아래 절차를 중복 정의하지 않는다.

## Phase A inventory evidence

2026-08-29 00:40~00:47 KST에 `CWJsui-MacBookPro.local`에서 production mutation 0으로 수집한 server task `019fe057-9f96-7251-917f-4f1a2eb67b7b` evidence를 설계 입력으로 사용한다.

server-only 원본 artifact는 다음과 같다. 비밀 또는 server-local artifact를 repository로 복사하지 않는다.

- `/Users/cwj/01_vibe_coding/homecook/.omx/plans/production-rehearsal-phase-a-inventory-20260829.json`
- `/Users/cwj/01_vibe_coding/homecook/.omx/plans/production-rehearsal-phase-a-report-20260829.md`

관측 사실:

- app은 `3bdd814da8f9849805185d1b3be5a6ee703133a0`, worker는 같은 SHA·schema v1·runtime generation 25다.
- full-local은 `.15`의 partial failed snapshot `391458a4abadb3142b4757cec6d8b9586476f7c6`다. Docker container는 healthy지만 LaunchAgent spawn은 scheduled/exit 1이다.
- DB credential authority는 `.17`의 `4237369df07ffbb0af6ab3faed62298116f56b82`, schema v2·generation 40이다.
- `current.json`, `previous.json`, active lock은 없고 `.10/.11/.12/.13/.15` recovered failed lock이 있다.
- `.17`은 attested+prepared일 뿐 promoted/verified가 아니다.
- exact global migration ledger가 없고 catalog marker만 있다.

이 관측은 production을 고치거나 `.17`을 승인하는 근거가 아니다. 현재 promote 구현이 mixed state를 완전하게 모델링하지 못하고 full isolated rehearsal/receipt gate가 없다는 문제 정의다.

## 채택한 격리 설계

### A. 기존 promote에 임시 home 주입 — 금지

production과 같은 Docker project, container name, volume, port 또는 LaunchAgent label을 재사용할 수 있다. 임시 home만으로는 name collision과 production surface mutation을 배제하지 못한다.

### B. mock-only fixture — 불충분

빠른 unit test에는 사용할 수 있지만 실제 Docker image, Node production build, worker entry, migration replay와 process lifecycle을 증명하지 못한다.

### C. 독립 root + port + Docker project/volume + isolated DB + foreground supervisor — 채택

같은 sealed artifact를 별도 root에서 실제 실행한다. launchd는 사용하지 않고 foreground supervisor가 app, full-local, worker를 시작·감시·종료한다. production root, pointer, lock, descriptor, LaunchAgent, Docker project, volume, port, DB, env file과 이름·경로·inode를 공유하지 않는다.

## Lifecycle

### R0. read-only inventory

planned command:

```text
pnpm release:rehearsal:inventory -- --json
```

- production app/full-local/worker identity, pointer/descriptor/lock, Docker resource, port, LaunchAgent, migration marker를 read-only로 수집한다.
- active canonical promotion lock은 `getLocalMacProductionReleasePaths(homeDir).lockPath`, 즉 `~/.homecook/locks/production-promotion.lock` 하나다. `releases/` 아래 recovered/stale lock evidence와 별도 exact-kind artifact/probe로 기록한다. 성공 probe의 evidence count는 1이고 absent artifact는 canonical zero sentinel과 digest가 모두 일치해야 하며, active lock 존재·malformed artifact·probe failure는 항상 promotion-unsafe다.
- secret contents, raw env, provider payload, DB row data를 출력하지 않는다.
- inventory probe 자체의 tool identity와 production pre-digest를 기록한다.
- 각 required probe는 `success|failed|skipped`, non-secret reason code, evidence count를 기록한다. 실패를 빈 성공 array로 축약하지 않는다.
- command result의 `error`, signal, timeout/status null, output overflow와 generic nonzero는 probe failure다. 예외는 정확히 문서화된 resource-absent exit뿐이며 현재는 `lsof`의 `exit 1 + empty stdout/stderr` no-listener만 successful empty evidence로 허용한다.
- required trusted tool identity set은 exact `docker,git,launchctl,lsof` 4개다. 이름 누락/중복/extra, unsafe owner/mode/realpath 또는 tool probe failure는 promotion-unsafe다.
- pointer/descriptors/workloads, LaunchAgent plist+print, Docker image/mount/full-label digest, listener, opaque config, migration marker/ledger/catalog 중 required evidence가 없으면 inventory는 수집될 수 있어도 classification은 `unknown`이다.
- inconsistent state는 분류만 하고 자동 복구하지 않는다.

### R1. candidate build and seal

planned command:

```text
pnpm release:rehearsal:candidate -- --release-sha <full-origin-master-sha> --json
```

- candidate는 실행 시점 `origin/master`가 가리키는 exact full SHA여야 하고 current head에서 시작된 CI check 전체가 terminal success여야 한다.
- 이 단계에서는 `prod-*` tag, production manifest, production attestation을 요구하거나 만들지 않는다.
- exact SHA/tree의 clean detached source, `pnpm-lock.yaml`, pinned Node/pnpm/Supabase CLI, exact Docker image digest와 build tool identity를 고정한다.
- frozen lockfile과 승인된 local package store/image cache만 사용한다. 필요한 dependency/image가 없으면 external fetch로 보완하지 않고 fail closed한다.
- build output, worker artifact, migration set, runtime descriptors를 content-addressed create-only bundle로 seal한다.
- bundle manifest는 contained symlink의 dereferenced bytes, executable mode, owner/mode, build ID, tool/image digest를 포함한다. 외부 realpath, hard-link alias, group/world-writable executable은 거부한다.
- seal 뒤 원본 checkout을 다시 읽어 실행하지 않는다. 이후 rehearsal과 production authority는 sealed bundle bytes만 소비한다.

split 2 구현 상태:

- CLI와 closed schema는 각각 `scripts/local-mac-production-rehearsal.mjs candidate`, `scripts/schemas/local-mac-production-rehearsal-candidate.schema.json`이다.
- public command는 minimal built-in-only `scripts/local-mac-production-rehearsal-candidate-bootstrap.mjs`를 trust launcher로 사용한다. launcher는 trusted Git/tar/Node와 자기 bytes를 first/last snapshot하고, fetched exact `origin/master` Git archive를 private read-only root에 materialize한 뒤 그 root의 CLI/module/config/tool lock만 동적 import한다. worktree candidate module을 직접 실행하거나 immutable-bootstrap verification 없이 CLI candidate branch를 호출하면 실패한다.
- candidate root는 repository 밖 `<home>/.homecook/rehearsal/attempts/<UUID-v4>`를 `mkdir` create-only로 한 번 예약한다. caller path 조각을 받지 않고 parent/run root의 realpath·owner·mode·device/inode containment를 terminal marker와 failure cleanup 직전에 다시 검증한다. global destination rename/replace 없이, 모든 검증 뒤 `complete.json`을 `wx`로 쓰며 실패 시 다른 내용을 제거하고 fixed-schema `failed.json`만 `wx`로 남긴다. 두 marker가 함께 있거나 marker가 없는 root는 reusable candidate가 아니다.
- source는 실행 직전 fetch한 `origin/master` exact SHA/tree를 trusted Git의 immutable `ls-tree`/`cat-file` blob에서 직접 materialize한다. system/global config, replace object, checkout/index/smudge filter/hook를 authority로 사용하지 않으며 blob OID, Git mode, executable bit, symlink target/containment을 build 전후와 copy 시점에 다시 검증한다. tracked allowlist 밖의 untracked script/migration은 bundle에 들어가지 않고 `.next`/`node_modules`만 run-owned generated output으로 별도 inventory한다.
- current-head GitHub check-runs와 commit statuses 및 remote `origin/master`는 trusted read-only adapter가 full pagination으로 build 전후 두 번 읽는다. 각 REST item의 actual `head_sha`/`sha`, run ID, suite ID, trusted GitHub Actions integration ID를 보존하고 expected context를 포함한 started check 전체가 계약상 terminal success여야 한다. normalized projection과 suite/run set이 전후 exact match할 때만 create-only `ci-evidence.json`과 digest를 candidate에 묶으며 provider raw payload는 저장하지 않는다. completed candidate reader도 이 evidence file 하나만 허용하고 fatal UTF-8/JCS, closed identity/state, candidate의 세 CI digest를 다시 검증한다.
- `ci_check_summary_digest`는 normalized summary만, `ci_snapshot_digest`는 전체 safe projection만 각각 독립 hashing한다. 두 field를 같은 projection digest의 alias로 사용하지 않는다.
- completed reader는 `complete.json`, `candidate.json`, `candidate-identity.json`, `ci-evidence.json`, physical manifest, bundle authority manifest를 모두 private owner/mode/nlink-1 `O_NOFOLLOW` FD로 읽고 lstat/open/fstat/read/fstat/path-post identity와 containment를 검증한다. stored CI summary는 check/status array에서 재계산하며 candidate와 bundle의 repository/source ref/SHA/tree/build/toolchain/images/migration/artifacts/file inventory/physical·provenance·input digest를 exact 교차 비교한다.
- build env source는 `<home>/.homecook/rehearsal/build-env.json` 하나다. exact `homecook.release-rehearsal-build-env.v1` JCS, current-user owner, `0600`, link count 1, parent/target non-symlink, `O_NOFOLLOW` FD pre/post identity를 요구한다. 허용값은 public build-time key allowlist만 child env에 새로 구성하며 raw value는 manifest/log에 남기지 않는다.
- dependency lifecycle/install과 Next build는 absolute trusted argv를 macOS `sandbox-exec` deny-default profile에서 실행한다. signal/process inspection/control과 unrestricted Mach lookup은 허용하지 않는다. exact Git source는 read-only이고, 별도 `build-work`에 복제한 tracked path도 write-deny하며 `.next`, `node_modules`, private home/tmp 같은 run-owned generated root만 쓸 수 있다. production releases/locks/config/logs, LaunchAgents, production env/config, Docker socket과 network는 read/write deny하고 fallback은 없다. child stderr/exit는 denial authority가 아니다. exact execution window의 macOS unified kernel Sandbox deny event를 별도 trusted `log` reader로 수집하며, attribution 누락을 피하려고 그 window의 denial event가 하나라도 있으면 candidate를 실패시킨다. child가 EPERM을 삼키고 exit 0/stderr empty여도 동일하다.
- build 전후 split1 complete production surface snapshot을 수집해 exact `surface_digest` equality와 DB connection/mutation count 0을 요구한다. incomplete probe 또는 외부 drift는 candidate 발급을 막고 원인을 추정·복구하지 않는다.
- tool identity는 Git/GitHub/Node/pnpm/Docker/Supabase/launchctl/lsof/unified-log/sandbox/candidate builder와 Next CLI를 first use 전에 owner/mode/realpath/bytes로 snapshot하고 마지막 use 뒤 재검증한다. candidate builder/CLI/config/tool lock은 exact immutable Git root에서만 사용한다. `scripts/config/local-mac-production-rehearsal-toolchain-lock.json`은 darwin-arm64 Node `v22.13.1`, direct pnpm `10.32.1` artifact entrypoint와 1,078-file tree digest `e3fcc81f6fb60f174a5fd7eac980c178f95af456c395bb2b30ec28113f9d71df`, 공식 npm integrity와 Supabase CLI `2.110.0` binary digest, full-local exact service/image set을 canonical JCS로 고정한다. Corepack shim/acquisition은 candidate execution authority가 아니다.
- Compose `services` 전체를 strict closed subset으로 열거해 각 service가 exact `image@sha256`와 platform expression을 가지는지 lock과 비교한다. quoted key, flow style, anchor/alias/merge/extension, env interpolation, tab, multiline scalar, duplicate key/section처럼 완전한 열거가 모호한 문법은 fail closed한다. tag-only/mixed/build/missing/extra service는 거부하며, candidate Docker 호출은 exact version 및 local `image inspect` argv allowlist뿐이다. pull 경로는 없다.
- app/full-local/worker는 한 번 만든 bytes를 기존 production execution-tree copier/mode normalizer와 existing worker artifact materializer로 같은 bundle에 복사한다. `sealed_bundle_digest`는 file bytes, executable mode, contained symlink target+dereferenced bytes인 physical execution bytes만 뜻한다. final provenance inventory는 uid/gid/nlink/device/inode/size/ctime을 묶고 owner mismatch, hardlink, read 중 identity drift를 거부하되 이 ephemeral metadata는 physical digest에서 제외한다. `bundle_manifest_digest`는 provenance inventory에 build ID, CI projection, source manifest, sandbox audit policy, tool lock/toolchain, image/service, final sealed migration, build-env override, production guard를 결합한다. `candidate_identity_digest`는 두 digest를 묶는다.
- 이 구현은 Docker rehearsal runner, foreground supervisor, synthetic DB/canary, repeatability receipt, production tag/manifest/attestation binding, promote unlock을 포함하지 않는다.

### R2. isolated rehearse

planned command:

```text
pnpm release:rehearsal:run -- --candidate <absolute-sealed-candidate-manifest> --json
```

- 매 실행은 cryptographically random `run_id`와 create-only private root를 가진다.
- Docker project, container, network, volume, port, DB name/user, app/worker state root와 log root는 `run_id` namespace로 분리한다.
- production label 또는 reserved prefix를 생성 인수로 받지 않는다. collision은 임의 suffix로 우회하지 않고 실패한다.
- launchd/LaunchAgent를 사용하지 않는다. foreground supervisor가 동일 bundle의 app/full-local/worker를 실제로 시작하고 모든 child PID/container identity를 기록한다.
- local DB는 production data를 복사하지 않는다. repository migration 전체와 synthetic fixtures만 fresh isolated PostgreSQL에 적용한다.
- exact ordered global migration ledger와 catalog head를 둘 다 생성하고 서로 일치해야 한다. catalog marker만 있는 상태는 pass가 아니다.
- app/worker canary는 같은 SHA/tree/build/bundle/migration identity를 보고해야 한다.
- 테스트 종료 시 supervisor가 자신이 생성한 exact run-owned child/resource만 역순 정리한다.

### R3. receipt verify

planned command:

```text
pnpm release:rehearsal:verify -- --receipt <absolute-create-only-receipt> --json
```

- receipt schema, issuer/tool identity, cryptographic digest, expiry, exact SHA/tree/build/bundle, image, migration, canary, cleanup, no-production-mutation evidence를 offline으로 재검증한다.
- receipt path와 parent는 `lstat`/`realpath`, owner, private mode, device/inode를 검증한다. symlink, repository 내부 secret alias, mutable overwrite, duplicate receipt ID를 거부한다.
- receipt의 `issued_at <= completed_at <= now`는 zero clock-skew로 강제한다. future member/run/repeatability claim은 발급과 검증 모두에서 거부한다.
- verify는 Docker, process, production pointer/descriptor/lock/LaunchAgent/DB를 변경하지 않는다.
- production pre/post digest가 다르거나 inventory 중 drift가 있었으면 receipt는 생성하지 않는다.

### R4. repeatability gate

동일 candidate SHA로 R2~R3을 최소 2회 독립 실행한다.

- 두 실행의 source SHA/tree, build ID, sealed artifact digest, bundle manifest digest가 같아야 한다.
- `run_id`, root, Docker project/network/container/volume, DB identity와 port는 서로 달라야 한다.
- 두 실행 모두 cleanup 성공, run-owned residue 0, production pre/post digest 동일이어야 한다.
- canary와 migration ledger 결과가 같아야 한다. timestamp, run ID, ephemeral port처럼 허용된 volatile field만 normalization에서 제외한다.
- 두 receipt를 묶는 create-only repeatability receipt가 production authority 입력이다.

### R5. production authority tag and attestation

R4 통과 전에는 production authority tag를 만들지 않는다.

- `prod-*` tag creation과 production attestation은 기존 production approval environment와 `release-promoter` 경계를 따른다.
- tag/manifest/attestation은 exact rehearsal `release_sha`, `release_tree`, `build_id`, `sealed_bundle_digest`, `repeatability_receipt_digest`를 포함해야 한다.
- rehearsal 후 rebuild, dependency reinstall, image re-resolution, migration rewrite, bundle copy mutation은 금지한다.
- production tag immutability는 그대로 유지한다. tag/attestation 생성 실패 시 기존 tag를 이동·삭제하지 않고 다음 tag 번호로 새 authority attempt를 만든다.

### R6. production promote receipt gate

기존 `release:production:promote`의 후속 구현은 첫 production mutation 전에 다음을 모두 확인해야 한다.

- repeatability receipt가 valid하고 만료되지 않음
- tag/manifest/attestation의 exact bundle·receipt digest 일치
- candidate sealed bytes가 receipt와 byte-for-byte 동일함
- production state가 새 R0 inventory와 모순되지 않음
- mixed-state classification이 `promotion_safe`이고 unresolved recovery finding이 0임
- 기존 release-promoter authority, confirmation, lock, operator approval 충족

하나라도 빠지면 pointer, LaunchAgent, Docker, DB를 건드리기 전에 fail closed한다.

## Production surface non-mutation contract

각 R2 실행은 시작 전과 cleanup 후 아래 production surface의 canonical digest를 계산한다.

| surface | evidence |
| --- | --- |
| release root와 `current.json`/`previous.json` | 존재 여부, lstat identity, normalized metadata/content digest |
| active/recovered promotion locks | ordered path, owner/mode, lstat identity, content digest |
| app/full-local/worker descriptors와 sealed snapshot roots | ordered identity와 normalized digest |
| LaunchAgent plist/loaded job | file identity/digest + read-only launchctl print projection |
| Docker project/container/network/volume | ordered ID, label, image, mount, generation projection |
| bound production ports | listener PID/process identity projection |
| production DB/config/env | verified authority identity와 opaque digest only |

규칙:

- production surface를 create, chmod, touch, rename, delete, restart, stop, load, unload, migrate, connect-write 하지 않는다.
- production evidence를 읽기 전에 expected trusted base부터 모든 ancestor segment를 BigInt `lstat`로 검증한다. existing ancestor는 current-user-owned canonical directory, non-symlink, non-group/world-writable, traversable mode여야 하며 probe 전후 identity가 같아야 한다. dangling symlink도 거부하고, probe 전 absent였던 ancestor가 probe 중 생성되면 race로 실패한다. `~/.homecook`, releases/locks/config roots와 `~/Library/LaunchAgents`의 intermediate symlink는 probe failure다.
- final artifact target도 `existsSync`가 아니라 BigInt `lstat`로 판정한다. exact `ENOENT`만 canonical absent sentinel을 만들 수 있고, dangling symlink·unsafe type/owner/mode는 probe failure다. absent target은 probe 종료 전에 다시 `lstat`해 absent→created race를 거부한다. 이 규칙은 active canonical lock과 모든 release/snapshot/recovered artifact target에 공통 적용한다.
- directory/snapshot/lock digest는 immediate child 이름만 사용하지 않는다. contained tree를 bounded recursive traversal하며 file bytes, mode, uid/gid, BigInt dev/ino/nlink/size/ctime/mtime, contained symlink target과 dereferenced digest를 canonical order로 묶는다. path escape, cycle, entry/depth/byte limit 초과는 fail closed한다.
- identity-sensitive `lstat`/`fstat`는 `{ bigint: true }`로 수집하고 decimal string으로 canonicalize한다. Number 변환 뒤의 inode/device/size를 identity 근거로 사용하지 않는다.
- JSON Number로 남는 count/mode/pid/port/sequence field는 runtime과 schema 모두 `Number.MAX_SAFE_INTEGER` 이하를 강제한다. 더 큰 identity 값은 decimal string만 사용한다.
- receipt/inventory JSON file은 fatal UTF-8 decoding을 통과하고 canonicalized UTF-8 bytes가 원본 file bytes와 exact equality여야 한다.
- secret/env contents는 receipt, log, manifest에 포함하지 않는다. digest는 프로세스 내부에서만 계산하고 값은 redacted identity와 SHA-256으로만 남긴다.
- DB는 credential을 사용해 row를 읽는 대신 canonical config/DB container/volume/migration identity의 read-only evidence만 사용한다. 별도 approved probe가 없다면 production DB 접속 0이 기본값이다.
- pre/post snapshot 사이 production의 외부 drift가 감지되어도 rehearsal이 원인을 자동 판정하거나 복구하지 않는다. receipt를 폐기하고 mixed-state classify로 전환한다.

## Environment and secret handling

- env source는 canonical resolver가 허용한 exact allowlist의 regular file 또는 approved secret provider만 가능하다.
- file source는 parent부터 `lstat`/`realpath`로 containment를 확인하고 `open(..., O_RDONLY | O_NOFOLLOW)`한 FD에서 snapshot한다.
- open 전후 device/inode/mode/ctime/mtime/size와 FD `fstat`가 같아야 한다. symlink, hard-link count 이상, group/world writable, race는 거부한다.
- contents는 argv, inherited environment, log, receipt, manifest, temp filename에 노출하지 않는다.
- snapshot은 private memory 또는 run-owned mode `0600` anonymous/unlinked FD에만 두고 child에 필요한 FD만 명시적으로 전달한다.
- production endpoint, port, Docker project, DB name/user, storage root, app/worker root는 rehearsal 전용 값으로 강제 override한다. source env가 override를 재정의할 수 없다.
- child env는 key allowlist로 새로 구성한다. 전체 `process.env` 상속은 금지한다.
- cleanup 후 secret FD와 child를 닫고 secret-bearing persistent file 0을 확인한다.

## Network contract

- rehearsal external network는 기본 차단이다.
- app/full-local/worker는 run-owned Docker network, loopback, approved Unix socket만 사용한다.
- DNS, public IP, registry, package manager, hosted Supabase, provider API 요청은 차단하고 attempt count를 receipt에 기록한다.
- synthetic fixture canary는 외부 provider 성공을 mock하지 않는다. 외부 의존 경로는 명시적 deny/failure behavior를 검증한다.
- 향후 실제 provider smoke가 필요하면 별도 사용자 승인, egress allowlist, non-production credential, redaction/evidence 계약을 docs-governance로 먼저 추가한다. 현재 receipt에는 사용할 수 없다.

## Receipt schema

receipt는 create-only non-secret JSON artifact다. canonicalization은 exact `RFC 8785 JSON Canonicalization Scheme (JCS)` UTF-8 bytes이고 digest는 lowercase hex SHA-256이다. local receipt와 repeatability receipt의 self digest는 accidental corruption과 exact binding을 검출하지만 production authority signature가 아니다.

### Individual run receipt exact schema

`homecook.local-mac-production-rehearsal-run-receipt.v1`의 top-level field는 아래 순서와 이름을 정확히 사용한다. unknown field, duplicate JSON key, non-canonical number/string은 거부한다.

| field | exact rule |
| --- | --- |
| `schema` | exact `homecook.local-mac-production-rehearsal-run-receipt.v1` |
| `canonicalization` | exact `RFC8785-JCS+SHA256` |
| `repository` | exact `netsus/homecook` |
| `source_ref` | exact `refs/heads/master` |
| `release_sha` | exact 40-hex CI-green candidate SHA |
| `release_tree` | exact Git tree SHA |
| `ci_head_sha` | `release_sha`와 exact match |
| `ci_check_summary_digest` | current head에서 시작된 전체 terminal check summary의 canonical SHA-256 |
| `build_id` | sealed build의 nonempty exact ID |
| `sealed_bundle_digest` | app/full-local/worker same bytes를 묶은 lowercase 64-hex SHA-256 |
| `bundle_manifest_digest` | canonical sealed bundle manifest의 lowercase 64-hex SHA-256 |
| `run_id` | cryptographically random unique run ID |
| `issued_at` | UTC RFC3339 issuance instant |
| `completed_at` | cleanup과 production post snapshot 뒤 UTC RFC3339 instant |
| `toolchain` | exact keys `node,pnpm,supabase_cli,git,docker_client,docker_daemon,candidate_builder,rehearsal_runner`; 각 tool identity는 `version,realpath,device,inode,mode,ctime,size,sha256` |
| `images` | digest 오름차순 array; 각 entry exact keys `digest,platform,local_cache_provenance_digest`; mutable tag-only 금지 |
| `migration` | exact keys `ordered_migration_files_digest,applied_global_ledger_digest,migration_head,catalog_head,schema_identity_digest` |
| `fixtures` | exact keys `fixture_set_id,fixture_set_digest,production_derived_row_count`; count는 0 |
| `isolation` | exact keys `resource_identity_digest,root_identity_digest,docker_project_id,network_ids,container_ids,volume_ids,db_identity,ports,collision_preflight_digest` |
| `runtime` | exact keys `app,full_local,worker,foreground_supervisor`; 각 runtime은 PID/container와 reported SHA/tree/build/bundle을 포함 |
| `canaries` | canary ID 오름차순 array; 각 entry exact keys `canary_id,started_at,completed_at,exit_code,normalized_result_digest` |
| `network` | exact keys `default_deny_policy_digest,allowed_endpoints,denied_attempt_count,unexpected_successful_egress_count`; unexpected count는 0 |
| `cleanup` | exact keys `completed,owned_resource_ids,removed_resource_ids,residue_resource_ids,cleanup_errors`; completed true, owned/removed exact equality, residue/error empty |
| `production_guard` | exact keys `surface_allowlist_version,production_snapshot_pre_digest,production_snapshot_post_digest,equal,mutation_attempt_count,production_db_connection_count,production_db_write_count`; equal true, counts 0 |
| `environment_snapshot` | exact keys `source_allowlist_id,opaque_source_identity_digest,override_policy_digest,exposed_value_count`; exposed count 0 |
| `threat_controls` | exact keys `symlink_toctou,namespace_collision,digest_substitution,stale_receipt,cleanup_ownership`; 각 result pass |
| `issuer_task_id` | 감사 metadata only; production authority 또는 trusted issuer가 아님 |
| `receipt_digest` | 이 field를 제외한 전체 object의 JCS bytes SHA-256 |

### Repeatability receipt exact schema

두 individual receipt를 결합한 `homecook.local-mac-production-rehearsal-repeatability-receipt.v1`만 GitHub production approval/attestation 입력 후보가 된다.

| field | exact rule |
| --- | --- |
| `schema` | exact `homecook.local-mac-production-rehearsal-repeatability-receipt.v1` |
| `canonicalization` | exact `RFC8785-JCS+SHA256` |
| `repository` | 두 member와 exact `netsus/homecook` |
| `source_ref` | 두 member와 exact `refs/heads/master` |
| `release_sha` | 두 member가 공유하는 exact SHA |
| `release_tree` | 두 member가 공유하는 exact tree |
| `build_id` | 두 member가 공유하는 exact build ID |
| `sealed_bundle_digest` | 두 member가 공유하는 exact same-bytes bundle digest |
| `member_receipt_digests` | exact 2 unique lowercase 64-hex digest를 bytewise ascending 순서로 저장 |
| `member_run_ids` | `member_receipt_digests`와 같은 positional order의 exact 2 unique run ID |
| `member_resource_identity_digests` | 같은 positional order의 exact 2 unique resource-set digest; 서로 달라야 함 |
| `toolchain_digest` | 두 member의 canonical toolchain object digest가 exact match |
| `image_set_digest` | 두 member의 ordered images array digest가 exact match |
| `migration_ledger_digest` | 두 member의 ordered global ledger digest가 exact match |
| `canary_set_digest` | volatile field normalization 뒤 두 member canary set digest가 exact match |
| `cleanup_evidence_digests` | 같은 positional order의 exact 2 digest; 각 member cleanup completed/residue 0 |
| `production_guard_digests` | 같은 positional order의 exact 2 digest; 각 member pre/post equal 및 mutation 0 |
| `completed_at` | 두 member `completed_at` 중 더 늦은 UTC RFC3339 instant |
| `valid_until` | 두 member 각각의 `completed_at + 24h` 중 더 이른 instant; 더 긴 값, timezone ambiguity, missing expiry 금지 |
| `status` | exact `repeatable` |
| `issuer_task_id` | 감사 metadata only; production authority 또는 trusted issuer가 아님 |
| `repeatability_receipt_digest` | `repeatability_receipt_digest 제외` 전체 object의 JCS bytes SHA-256 |

각 member digest를 먼저 재계산한 뒤 `member_receipt_digests`의 length, uniqueness, bytewise ascending order와 aligned array 위치를 검증한다. 두 member의 completion interval은 24시간 이하여야 하고, 발급·검증 시점에 두 member 모두 각자의 24시간 expiry 이전이어야 한다. missing field, stale member, expiry 누락/연장, member order 오류, 동일 run/resource ID, bundle/tool/image/migration/canary mismatch는 repeatability receipt 발급을 차단한다.

### Trusted production authority chain

- local run/repeatability receipt의 `issuer_task_id`, local file owner, local self digest 또는 임의 local self-signature는 production authority가 아니다. 같은 사용자에게 다시 쓰기 가능한 local key/signature를 trusted issuer로 취급하지 않는다.
- GitHub `production-release-approval` workflow는 두 member receipt와 repeatability receipt를 다시 canonicalize/hash/validate한 뒤 exact SHA/tree/`sealed_bundle_digest`/`repeatability_receipt_digest`/`valid_until`을 production manifest, subject, predicate와 annotated tag message에 묶는다.
- server verifier는 pinned GitHub attestation trusted root를 먼저 검증한 뒤 manifest/subject/predicate/tag remote readback과 local sealed bytes/repeatability receipt를 exact 비교한다. GitHub attestation 밖의 local claim은 비교 입력일 뿐 trust anchor가 아니다.
- receipt artifact는 감사 기록으로 만료 뒤에도 immutable 보존하지만 production authority는 strict `now < valid_until`인 final pre-mutation check에서만 유효하다. equality는 expired다.
- receipt 내용 변경, member 재정렬, re-sign, rebuild, dependency/image/migration 변화, production pre/post drift 또는 cleanup residue는 기존 authority를 재사용하지 않고 두 isolated run부터 새 rehearsal을 요구한다.
- expiry가 promotion 도중 다가오면 첫 production mutation 전에 중단한다. 이미 mutation을 시작한 뒤의 임의 자동 rollback 근거로 expiry를 사용하지 않는다.

## Fail-closed conditions

다음 중 하나면 receipt를 발급·재사용하지 않는다.

- candidate가 exact CI-green `origin/master` SHA가 아님
- clean source/tree, tool, image, migration, sealed bundle digest 중 하나라도 불명확함
- mock-only 실행 또는 app/full-local/worker 중 하나라도 실제 sealed bytes로 시작되지 않음
- production/rehearsal namespace, port, Docker resource, volume, root, env/DB가 겹침
- production data copy, Cloud/linked/remote Supabase, unexpected external network 사용
- raw env/secret/provider payload가 log/manifest/receipt에 나타남
- migration global ledger가 없거나 catalog marker와 불일치
- canary failure, identity mismatch, supervisor orphan, cleanup 실패 또는 residue
- production pre/post digest 불일치나 mutation attempt가 1 이상
- local receipt digest/path/owner/mode/expiry 또는 GitHub attestation signature/trusted-root binding 불일치
- 두 반복 실행의 sealed bundle digest 불일치 또는 run resources가 distinct하지 않음
- mixed-state finding이 unresolved이거나 `promotion_safe` 분류가 아님

## Mixed-state classify and recovery-plan contract

planned command:

```text
pnpm release:rehearsal:classify -- --inventory <absolute-read-only-inventory> --json
```

분류 입력은 read-only inventory뿐이다. 최소 상태 vocabulary:

- `coherent_running`: exact app/full_local/worker component set, pointer/descriptor digest alignment, required probe success, LaunchAgent/Docker/listener/config completeness, approved migration global ledger와 catalog head가 한 release identity로 일치
- `coherent_prepared`: 모든 `coherent_running` 요구를 먼저 만족한 뒤 running identity와 다른 exact attested prepared identity가 있고, canonical `prepared_descriptor` artifact digest가 그 identity의 `descriptor_digest`와 일치하며 promotion되지 않음. output은 `coherent_running + coherent_prepared` 조합이며, prepared-only, identity-only 또는 단순 descriptor self-claim은 promotion-safe가 아니다.
- `mixed_running`: running app/worker/full-local/DB authority가 서로 다른 release identity
- `partial_failed_install`: Docker/process 일부만 healthy이고 LaunchAgent/descriptor/readiness가 실패
- `orphaned_lock_or_descriptor`: active authority 없이 recovered/stale lock 또는 descriptor만 존재
- `migration_authority_incomplete`: exact global ledger 없이 catalog marker만 존재
- `unknown`: identity 또는 evidence가 부족해 안전 분류 불가

classification output은 `promotion_safe: boolean`, finding ID, evidence path digest, confidence, missing evidence와 recovery-plan 후보만 기록한다.

- `release_artifacts.kind`는 전체 array에서 unique여야 한다. current authority는 exactly one `current_descriptor`, prepared identity가 있으면 exactly one matching `prepared_descriptor`만 허용한다. duplicate match/mismatch 조합은 ambiguity로 거부한다.

- `mixed_running`, `partial_failed_install`, `orphaned_lock_or_descriptor`, `migration_authority_incomplete`, `unknown`은 모두 `promotion_safe: false`다.
- recovery plan은 가능한 순서, 사전 backup, operator authority, 예상 mutation, rollback/forward-fix 경계를 설명할 뿐 실행하지 않는다.
- 자동 복구, stale lock 삭제, descriptor 생성, volume/container 삭제, LaunchAgent restart/uninstall, DB migration, rollback은 금지한다.
- 실제 recovery는 별도 사용자 승인과 `release-promoter` 또는 더 좁은 recovery authority를 가진 새 Codex task에서 수행한다.

Phase A facts는 적어도 `mixed_running + partial_failed_install + orphaned_lock_or_descriptor + migration_authority_incomplete + unknown`으로 분류해야 한다. required completeness가 닫히지 않은 `unknown`은 다른 구체 finding과 함께 남을 수 있다. 이는 `.17` promotion 승인이나 실제 recovery plan 확정이 아니다.

## Threat model

| threat | required control |
| --- | --- |
| production Docker/port/LaunchAgent name collision | reserved production namespace denylist + create-only distinct run namespace + preflight |
| symlink/path traversal/TOCTOU | `lstat`/`realpath`, `O_NOFOLLOW`, FD snapshot, pre/post identity, contained sealed tree |
| same-user candidate mutation | content-addressed seal, create-only receipt, execution 직전·직후 digest 재검증 |
| secret disclosure | key allowlist env, FD handoff, redacted digest, argv/log/manifest/receipt value 0 |
| network exfiltration | external network default deny, DNS/public route 차단, attempt evidence |
| production data leakage | schema+migrations+synthetic fixtures only, production DB connection/copy 0 |
| stale or substituted receipt | 24시간 expiry, issuer/tool/path identity, receipt digest, exact tag/manifest binding |
| cleanup over-delete | run ownership token + exact resource ID/labels 모두 일치할 때만 삭제 |
| cleanup under-delete | residue inventory 0 gate; 실패 시 manual cleanup finding, receipt 미발급 |
| migration false positive | ordered global ledger + catalog head + schema identity 동시 일치 |
| mock-only false confidence | real sealed app/full-local/worker processes와 Docker images 실행 |
| production drift during rehearsal | production pre/post digest equality; drift 시 원인 추정 없이 receipt 폐기 |

cooperative same-user boundary를 OS sandbox라고 과장하지 않는다. implementation은 가능하면 별도 macOS user/container/VM hard boundary를 추가할 수 있지만, 이를 추가해도 이 문서의 digest, namespace, receipt gate를 생략할 수 없다.

## TDD acceptance

implementation PR은 test-first RED → GREEN → refactor evidence를 남긴다.

### Unit / schema tests

- receipt required field, canonical serialization, digest, expiry, unknown field policy
- exact SHA/tree/build/bundle/tool/image/migration mismatch 각각의 fail-closed test
- env allowlist, `O_NOFOLLOW`, symlink/hard-link/mode/TOCTOU rejection
- production/rehearsal namespace·port·Docker resource collision rejection
- cleanup ownership token과 exact identity 불일치 시 delete 0
- mixed-state classifier vocabulary와 recovery mutation 0

### Integration tests

- fresh run-owned Docker project/volume/DB에 migration+synthetic fixture replay
- same sealed app/full-local/worker foreground execution과 identity canary
- external network deny 및 hosted/linked/remote Supabase access 0
- partial start failure 보상 cleanup과 preexisting/decoy resource 보존
- receipt verify read-only behavior
- production promote adapter가 missing/expired/mismatched receipt에서 first mutation 전 종료

### Disposable server rehearsal

- production과 같은 server Mac class에서 production mutation 0으로 실행한다.
- 동일 SHA 최소 2회, artifact digest 동일, run IDs/resources distinct, cleanup 성공, production pre/post digest 동일을 증명한다.
- reboot/LaunchAgent production behavior를 rehearsal 성공으로 과장하지 않는다. launchd 없이 foreground supervisor 경계만 닫는다.

## Implementation PR split and independent review

문서 승인 뒤 구현은 작은 PR로 분리한다.

1. receipt/classifier schema, parser, validator, read-only inventory와 RED/GREEN tests
2. candidate build/seal, trusted tool/image resolver, FD env snapshot과 tests
3. isolated Docker/DB/foreground supervisor, synthetic fixtures, canary, owned cleanup과 integration tests
4. repeatability receipt, production tag/manifest binding, `release:production:promote` pre-mutation receipt gate

각 PR은 작성 task와 다른 task ID의 독립 Codex code review를 받는다. 2~4번은 별도 독립 Codex security review가 필수다. reviewer는 exact current head SHA, test evidence, threat model, production mutation 0을 확인한다. 작성·구현 task와 같은 작업의 subagent review는 이 독립 승인을 대신하지 않는다.

최종 disposable server rehearsal도 implementation task와 다른 verifier task가 exact artifact/receipt를 확인한다. 모든 PR current-head check green과 reviewer finding 0 전에는 Ready/merge/promotion으로 진행하지 않는다.

## Documentation and governance acceptance

- 이 문서가 rehearsal의 canonical 단일 소스이고 기존 release/bootstrap/workflow entry는 forward pointer만 가진다.
- `local-mac-production-release-promotion.md`의 tag immutability, manifest, attestation, release-promoter authority를 완화하지 않는다.
- `supabase-local-only-operations.md`의 remote forbidden과 production destructive reset 금지를 유지한다.
- Phase A server-only artifacts는 경로와 non-secret summary만 인용하고 repository에 복사하지 않는다.
- production action, tag, Discord notification은 이 docs-governance PR에서 0이다.
- 공식 제품 5종/API/DB schema 영향은 N/A다.
- 독립 docs review는 이 문서, forward pointers, contract test와 exact PR head를 읽고 verdict를 남긴다.

## Open implementation decisions

다음은 구현 PR에서 contract를 완화하지 않는 범위로 확정한다.

- run-owned high port allocator와 reserved production port denylist의 exact 값
- receipt JSON Schema 파일 위치와 canonical JSON implementation
- foreground supervisor process protocol과 canary command ID
- local Docker image cache provenance 형식과 supported platform matrix
- migration global ledger의 canonical query/output schema

위 결정을 이유로 production mutation, external network, production data copy, receipt gate 또는 독립 review를 생략할 수 없다.
