# Local Worktree and Generated Output Cleanup Receipt

상태: **completed / cleanup steps 6–7**

기준일: 2026-09-05

기준 repository: Homecook `origin/master@b6b11c9f24cfd0d2d5a39f5891b87405d7116f2c`

## Cleanup plan and safeguards

정리 전 각 후보에 대해 path 존재, clean tracked 상태, exact HEAD, merged PR 또는
`origin/master` 복구 근거, open PR 부재, working-directory process 부재를 다시 확인했다.
worktree 제거는 `git worktree remove <exact-path>`만 사용하고 `--force`를 사용하지 않았다.
브랜치는 삭제하지 않았다.

다음 경계는 자동 삭제 금지로 유지했다.

- active Codex task 또는 live process의 working directory
- dirty, unmerged, closed-without-merge, open PR worktree
- production/server Mac checkout과 release runtime
- tracked source와 tracked evidence
- `.artifacts`의 DB backup, ops, release, security, QA evidence
- `.omx/state`, session, tracked plan과 artifact
- secret 또는 credential 가능 경로

## Step 6 — worktree cleanup

### Before and after

| 지표 | 정리 전 | 정리 후 | 변화 |
| --- | ---: | ---: | ---: |
| 등록 worktree entry | 28 | 17 | -11 |
| 실제 존재 worktree | 25 | 17 | -8 |
| 끊어진 prunable entry | 3 | 0 | -3 |
| 실제 worktree allocated bytes | 39,333,249,024 | 28,671,541,248 | -10,661,707,776 |
| 실제 worktree allocated size | 36.63 GiB | 26.70 GiB | **-9.93 GiB** |

### 제거한 clean worktree

아래 8개는 제거 직전 tracked change 0, live CWD process 0을 다시 확인했다.

| 식별자 | exact HEAD | allocated KiB | 복구 근거 |
| --- | --- | ---: | --- |
| `2387` | `4b9a936fd4b037275a776c3df28c4474d5f7672d` | 1,802,680 | merged PR #1498 exact head |
| `5c76` | `9a9bece38cf7baf1947c06716df94ac1f623a7ef` | 1,118,924 | merged PR #1497 exact head + local branch retained |
| `90d9` | `e9130e9b29e964ae5b0c939340a81acbef6853d1` | 460,516 | `origin/master` history에서 재생성 가능 |
| `b88d` | `4b9a936fd4b037275a776c3df28c4474d5f7672d` | 1,795,808 | merged PR #1498 exact head + local branch retained |
| `be0a` | `9a9bece38cf7baf1947c06716df94ac1f623a7ef` | 1,118,724 | merged PR #1497 exact head |
| `ci-run-attempt-contract` | `0ccec6ed0828034f6d84718b2cdd4d4a1fc8759a` | 1,155,740 | merged PR #1503 exact head + local branch retained |
| `mumeok-v2-stage4-homecook` | `d12493a0c0c6debdc4eed52d0023cd59c5ad04d1` | 1,814,488 | merged PR #1500 exact head + local branch retained |
| `rehearsal-macos-evidence-final2` | `b3ed7920931820678855eb90131113ac15753c00` | 1,144,944 | merged PR #1496 exact head + local branch retained |

제거한 worktree 합은 10,411,824 KiB다. 필요하면 retained branch, merged PR exact head
또는 commit SHA로 새 `git worktree add`를 수행할 수 있다.

### prune한 관리 기록

`git worktree prune --dry-run --verbose --expire=now`이 아래 이미 사라진 임시 경로 3개만
제시한 것을 확인한 뒤 같은 exact scope로 prune했다.

- `/private/tmp/homecook-full-verify.1FRMwd/repo`
- `/private/tmp/homecook-pr1496-final-review-b3ed`
- `/private/tmp/mdv2-red-t6778B`

이 작업은 실제 user file을 추가로 삭제하지 않고 common Git directory의 끊어진 admin record만
제거했다.

### 보호한 주요 worktree

- 현재 오케스트레이터 worktree와 일반 checkout
- live process가 사용하는 `16bf`, `62da`, `ec3d`, `fa9f`
- active marketing runtime이 있는 `homecook-mumeok-funnel-alignment`
- 15개 tracked/untracked change가 있는 `6078`
- open PR #1489의 `rehearsal-selection-contract-20260831`
- merge되지 않았거나 ownership이 불명확한 `3f8c`, `5cb7`, `d7ed`,
  `marketing-validation-preview-ops`, `rehearsal-macos-evidence-final`,
  `rehearsal-macos-normalized`, `rehearsal-macos-sandbox-store-index`,
  `homecook-funnel-integration`
- active remote-less `mumeok-funnel` repository

## Step 7 — ignored generated output cleanup

worktree 8개를 정상 제거하면서 그 안의 재생성 가능한 ignored output도 함께 제거됐다.
별도의 broad `rm`, cache root 삭제, tracked file 삭제는 실행하지 않았다.

| 지표 | 정리 전 | 정리 후 | 변화 |
| --- | ---: | ---: | ---: |
| inactive worktree ignored output | 13,765,783,552 bytes | 6,715,301,888 bytes | **-7,050,481,664 bytes** |
| GiB 환산 | 12.82 GiB | 6.25 GiB | **-6.57 GiB** |

정리 전 worktree root-level inactive output의 주 구성은 `.next` 5,090,701,312 bytes,
`node_modules` 8,550,662,144 bytes, `test-results`·`playwright-report` 약 2.17 MB였다.
여기에 `homecook-funnel-integration/marketing/mumeok-funnel-prototype-v2/` 아래의 중첩
`node_modules` 122,245,120 bytes와 `test-results` 4,096 bytes를 포함했다.
project-local `.pnpm-store` 1,282,113,536 bytes는 active main checkout에 있어 제외했다.

정리 후 남은 inactive output은 6,715,301,888 bytes다. 모두 조사 시점 기준 최근 1~5일이거나
dirty/unmerged/open worktree에 속하므로 추가 삭제하지 않았다. 디스크 여유도 약 671 GiB라
보존기간을 무시할 긴급 사유가 없다.

### 보존기간과 size policy

| 종류 | 최소 보존기간 | 추가 조건 |
| --- | ---: | --- |
| `.next` | 7일 | no-CWD, clean/closed 또는 stale worktree 확정; 개별 1 GiB 초과 경고 |
| `node_modules` | 14일 | no-CWD, task 종료, lockfile 재생성 가능; inactive 합 10 GiB 초과 시 검토 |
| `test-results`, `playwright-report` | 14일 | current-head/PR artifact 업로드 확인; 실패·visual evidence는 PR close 후 90일 |
| project-local pnpm store | 30일 | pnpm process 0; raw 삭제 대신 `pnpm store prune` |
| `.artifacts` cache | 30일 | QA/PR evidence는 90일; DB/ops/release/security/manual/source evidence 자동 삭제 금지 |
| `.omx/tmp`, `.omx/logs` | task 완료 후 30일 | state/session/tracked plan·artifact 자동 삭제 금지 |

삭제 직전에는 `git check-ignore`, `git ls-files` 결과 0, allowed basename, denylist를 함께
확인한다. denylist에는 `db-backups`, `ops`, `release`, `security`, `secret`, `evidence`, `qa`를
포함한다.

## Verification

- 제거한 8개 path가 더 이상 worktree inventory에 없음을 확인
- 끊어진 admin record 3개가 prune되었음을 확인
- 남은 worktree 17개 path가 모두 실제 존재함을 확인
- 제거 대상의 local branch 5개가 그대로 남아 있음을 확인
- dirty `6078`의 change 15개가 보존됐음을 확인
- active marketing, current task, production 제외 경로가 모두 존재함을 확인
- step 6 전후 allocated bytes 및 step 7 ignored output bytes 재계산
- commit 전 working tree change는 untracked receipt 문서 1개뿐이며 product/runtime 변경 없음
