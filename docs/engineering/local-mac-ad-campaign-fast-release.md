# Homecook 광고 캠페인 경량 release 계약

상태: **canonical / implementation authoring approved / production activation blocked until independent approval**

변경 유형: `docs-governance`

만료: **`2026-09-15T15:00:00.000Z` (2026-09-16 00:00:00 KST)**

이 문서는 사용자가 광고 캠페인 기간에만 승인한 별도 `release:campaign:*` release lane의 단일 authority다. 기존 `release:production:*` v3는 그대로 `activation_blocked` 상태로 보존한다. 기존 v3에 `--fast` 분기를 넣거나 v3 rehearsal/schema/attestation을 삭제하지 않는다.

공식 제품 문서 5종, public API와 DB schema 영향은 N/A다. Supabase target은 `supabase-local-only-operations.md`의 full-local/isolated-local 계약만 사용한다.

## 역할과 activation

- author task는 문서, 코드, 테스트, workflow, Draft PR만 작성한다.
- author task는 Ready 전환, self-approval, merge, `prod-*` tag 생성, server 접속, production/DB/Docker/LaunchAgent mutation을 수행하지 않는다.
- actual production-changing command는 independent review와 current-head checks가 닫힌 뒤 `release-promoter` task만 실행한다.
- production human gate는 GitHub environment `production-release-approval`의 prevent-self-review approval 정확히 한 번이다. CLI confirmation은 두 번째 human approval이 아니다.
- 기존 `release:production:promote` activation은 계속 닫혀 있다. 캠페인 lane의 activation 여부는 별도 manifest와 만료 gate로만 판단한다.

## 만료와 kill switch

`CAMPAIGN_RELEASE_EXPIRES_AT`은 `2026-09-15T15:00:00.000Z`로 고정한다. `now >= expires_at`이면 다음을 adapter 생성, production lock, Docker, LaunchAgent, filesystem mutation 또는 network call보다 먼저 거부한다.

- `plan`의 새 promotion authority 발급
- `prepare`
- `rehearse`
- `promote`
- 기존 attestation을 사용한 새 promotion

만료 뒤 허용되는 command는 read-only `status`, read-only `verify`, 그리고 만료 전에 같은 promotion transaction에서 이미 시작된 failure recovery `rollback`뿐이다. `rollback`은 새 배포를 시작할 권한이 아니며 exact active transaction token과 previous bundle authority를 요구한다.

## 필수 흐름

```text
exact origin/master SHA + latest required CI success
  -> clean isolated checkout
  -> frozen offline install/build exactly once
  -> one app/full-local/worker sealed bundle
  -> one isolated high-port rehearsal
     (candidate health + immediate previous bundle rollback)
  -> read-only production snapshot
  -> fresh encrypted backup + independent verify
  -> one production-release-approval human gate
  -> annotated prod-* tag + minimal manifest/attestation
  -> existing production lock + transactional install/recovery helpers
  -> internal/public/marketing/worker verification
  -> automatic rollback on any failed deploy or verification step
```

Steady-state 목표는 human approval 대기 시간을 제외하고 10~20분이다. 시간 목표 때문에 안전 검증을 생략하지 않는다.

## Source와 CI authority

- `release_sha`는 실행 직전 fetch한 `refs/remotes/origin/master`의 exact 40자 lowercase SHA와 같아야 한다.
- repository와 source ref는 `netsus/homecook`, `refs/heads/master`로 고정한다.
- 해당 SHA의 최신 check-run 중 `build`, `changes`, `dependency-audit`, `policy`, `quality`, `security-function-authorization`, `security-smoke`가 모두 trusted GitHub Actions App integration id `15368`의 `completed/success`여야 한다.
- 같은 context의 정상 rerun은 가장 최신 `completed_at`, 그 다음 numeric run/check ID 순으로 하나를 선택한다. 선택된 최신 결과가 success가 아니거나 owner/SHA/repository metadata가 다르면 실패한다.
- 모든 과거 attempt와 all-history digest는 수집하지 않는다. optional check는 promotion blocker가 아니다.

## Prepare와 단일 bundle

- source repository 자체를 build directory로 사용하지 않는다. clean isolated checkout을 create-only private output root 아래 만든다.
- checkout은 exact release SHA의 detached HEAD이고 tracked/untracked drift가 없어야 한다.
- `pnpm install --frozen-lockfile --offline --package-import-method=copy`를 한 번 실행하고 production app, full-local overlay와 YouTube worker artifact를 한 번 build한다.
- build 뒤 checkout source를 다시 실행하거나 production을 위해 rebuild하지 않는다.
- sealed bundle은 `app/`, `full-local/`, `worker/`, `authority/manifest.json`을 포함하며 전체 canonical tree digest 하나를 `release_bundle_sha256`으로 사용한다.
- app/full-local/worker의 `release_sha`, `build_id`, `release_bundle_sha256`는 exact 같아야 한다. 같은 의미의 component digest를 manifest/tag/predicate에 중복해서 권위화하지 않는다.
- secret, credential value, raw env, provider payload, absolute private path는 bundle, manifest, attestation, stdout/stderr에 포함하지 않는다.

## 단일 isolated rehearsal

- production과 다른 private run root, Docker project/labels/volumes, fresh isolated DB, foreground process, OS가 예약한 `20000..60999` high port를 사용한다.
- production port `3000`, `3100`, `5432`, `54321..54324`, production Docker project/volume과 LaunchAgent를 사용하지 않는다.
- production surface는 rehearsal 전후 read-only snapshot이 완전하고 exact 같아야 하며 mutation attempt count는 0이다.
- candidate app/full-local/worker를 같은 sealed bundle로 시작해 health, migration head, local Auth/Data API, marketing API/state/DB analytics canary, worker synthetic identity를 검증한다.
- candidate 종료 뒤 immediate previous app/worker bundle을 candidate additive migration head 위에서 시작해 rollback health를 검증한다. DB migration history는 되감지 않는다.
- owned isolated resource cleanup이 완료되고 residue가 0이어야 한다.
- 이 한 번의 receipt가 `candidate_health=pass`, `previous_bundle_rollback=pass`, `production_guard=unchanged`, `cleanup=complete`를 모두 묶는다.

기존 v3의 2회 independent rehearsal과 `pnpm test:local-mac-production-release` 전체 suite는 삭제하지 않는다. 캠페인 lane에서는 새 lane과 재사용한 critical helper의 focused test만 blocking author gate이며 전체 suite와 두 번째 rehearsal은 scheduled/non-blocking assurance다.

## Snapshot, backup, tag와 attestation

- promote 전 current app/full-local/worker descriptor, listener, Docker/LaunchAgent identity, migration head를 read-only snapshot으로 고정한다. mixed/unknown state는 실패한다.
- fresh backup은 existing create-only encrypted full-local backup helper로 생성하고 별도 verify 결과를 manifest에 digest로 연결한다. 기존 backup을 덮어쓰지 않는다.
- manifest에는 secret이 없는 최소 identity만 둔다: schema, expires_at, repository, source_ref, release_sha, release_tree, build_id, release_bundle_sha256, required CI evidence digest, rehearsal receipt digest, production snapshot digest, backup receipt digest, approval authority digest, previous bundle identity, release tag, manifest digest. `fresh/encrypted/verified=true` 같은 manifest 자기 주장은 authority가 아니다.
- manifest는 workflow input으로 받지 않는다. exact SHA의 GitHub Actions App `15368` 최신 필수 7 check-run, 실제 `bundle.tar` bytes와 bundle authority, 단일 rehearsal receipt, complete production snapshot, fresh encrypted+verified backup receipt, environment approval authority 원본을 내려받아 각 digest를 재계산한 뒤 생성한다.
- promotion 직전에는 위 원본과 GitHub attestation bundle bytes를 다시 읽어 source → bundle → rehearsal → manifest/tag/attestation → promotion의 `release_bundle_sha256` 및 서로 다른 receipt digest 결합을 재검증한다. 원본이 없거나 self digest·manifest binding·actual bytes가 다르면 manifest 모양이 맞아도 authority가 아니다.
- annotated `prod-YYYYMMDD.N` tag는 exact release SHA와 manifest digest를 기록하며 이동/삭제하지 않는다.
- attestation subject는 exact manifest bytes이고 repository/source ref/release SHA/tag/manifest digest/approval identity를 검증한다.
- custom attestation은 nonempty `predicate-path`와 campaign predicate type을 사용한다. 발급 뒤 `gh attestation verify` 결과와 attestation bundle SHA-256을 campaign attestation authority에 결합한 다음에만 promotion input으로 인정한다.

## Promotion transaction과 rollback

- campaign CLI가 자체 low-level mutation을 새로 구현하지 않는다. 기존 production promotion lock과 app/full-local/YouTube worker transactional install/recovery helper를 호출한다.
- first mutation 직전에 expiry, exact origin/master SHA, manifest/attestation, backup freshness, rehearsal receipt, current production snapshot equality를 다시 검증한다.
- install과 postdeploy 검증은 같은 production lock과 promotion transaction 안에서 수행한다.
- install, readiness 또는 postdeploy 검증 중 하나라도 실패하면 candidate worker를 먼저 중지하고 previous worker/app LaunchAgent와 previous full-local `resume-current`를 복구한다. additive DB schema는 유지한다.
- rollback 후 previous internal/public health를 다시 확인한다. rollback도 실패하면 maintenance 상태를 유지하고 `manual_recovery_required`로 종료한다.
- rollback helper의 정상 반환만으로 복구 성공으로 보지 않는다. exact `{ recovered: true }`, previous app/full-local/worker의 release SHA/build ID/bundle digest 일치, internal/public health pass를 독립 readback으로 다시 확인한다. `false`, `undefined`, identity drift 또는 health failure는 `manual_recovery_required`다.
- 자동 backup restore와 destructive DB reset/volume delete는 이 lane에 포함하지 않는다.

## Postdeploy required checks

- app/full-local/worker의 `release_sha`, `build_id`, `release_bundle_sha256` parity
- full-local 7 service health, Auth/JWKS, volume provenance, migration head, authorization contract
- worker PID/cwd/artifact/policy identity
- internal app readiness
- `https://app.mumeok.kr/`, `/beta`, `/privacy` status 200
- `https://auth.mumeok.kr/auth/v1/health` canonical status 401
- PII 없는 `release_canary_<promotion_id>` UTM session을 통한 marketing API/state/DB 연결
- release canary를 실제 광고 집계에서 제외한 analytics query의 정상 count/rate 결과

실제 email 또는 Turnstile 제출은 자동 postdeploy canary에 포함하지 않는다. 광고 시작 전 실제 브라우저 제출은 별도 manual prerequisite다.

## Deferred cleanup

캠페인 종료 뒤 별도 승인 PR에서 `release:campaign:*` workflow, scripts, package commands와 임시 schema를 제거한다. 기존 receipt와 release evidence는 감사 기록으로 보존한다. 그 뒤 최신 필수 CI, 단일 bundle manifest, 한 번의 rehearsal과 transaction rollback을 permanent v4로 채택할지는 별도 contract-evolution에서 다시 결정한다.
