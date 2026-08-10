# PR #1321 final fresh independent code rereview

## Verdict

- verdict: **APPROVE**
- final rereviewer task ID: `019fe9f4-1706-7ca2-944e-069f0741e2ca`
- reviewer role: final fresh independent `code-reviewer`
- model/runtime: `GPT-5.6-Sol`, high reasoning; Claude 미사용
- Critical: **0**
- Important: **0**
- Suggestion: **0**
- unresolved required findings: **none**

승인 기준인 `Critical 0 / Important 0`을 충족한다. I-001~I-004는 모두 코드, 회귀 테스트, 독립 RED/GREEN 재현으로 닫혔다. 이 판정은 exact reviewed implementation head에 대한 code-review approval이며 reviewer는 Ready 전환, merge, 구현 repair, Discord, 제품 `#11` authority 판정을 수행하지 않았다.

## Exact reviewed snapshot

| 항목 | 값 |
| --- | --- |
| PR | `#1321` (`fix/authority-evidence-mixed-artifacts`, Draft) |
| exact reviewed implementation head | `01af1ca4be749063147adb1e49fc25912b19af1d` |
| reviewed implementation tree | `affffe928cf40fd517a4b9d9eda9f41417e36a43` |
| current fetched `origin/master` | `ac9332ba41ad0a83ed3911bea6a27bba7dd8c012` |
| PR merge-base | `11883fb790dbe4664ed5f409fd0b5cf55ee02f41` |
| exact implementation/test files | `scripts/lib/validate-authority-evidence-presence.mjs`, `tests/authority-evidence-presence.test.ts` |
| existing report in PR history | `docs/engineering/evidence/2026-08-10-authority-evidence-mixed-artifact-validator-rereview.md` |

시작 시 fetch 뒤 local HEAD, local tree, remote PR branch, pull ref, GitHub PR head를 모두 대조했다. head는 `01af1ca4...`, tree는 `affffe928...`로 일치했고 원격 master도 지정된 `ac9332ba...`와 일치했다. GitHub의 PR `baseRefOid`는 merge-base `11883fb7...`를 가리키며, current remote base는 `ac9332ba...`다. 두 base 사이에서 reviewed implementation/test 파일은 변경되지 않았다.

exact reviewed implementation head에서 PR diff의 파일은 정확히 3개다.

1. `scripts/lib/validate-authority-evidence-presence.mjs`
2. `tests/authority-evidence-presence.test.ts`
3. `docs/engineering/evidence/2026-08-10-authority-evidence-mixed-artifact-validator-rereview.md`

이 중 구현 변경은 앞의 2개뿐이며 3번째는 predecessor rereview evidence다. 첫 독립 review report는 별도 reviewer commit `f1d3949c32c308dc5b83e6035bd20de3af2bd448`의 `docs/engineering/evidence/2026-08-10-authority-evidence-mixed-artifact-validator-review.md`에서 `git show`로 읽었다. 이 commit은 PR ancestor가 아니다. 후속 rereview report는 PR ancestor `2c5b2bf029d0d244d5f8d6d08a99508d5cab1b6c`에 additive로 들어 있다.

## Required finding disposition

| ID | 최종 판정 | 독립 근거 |
| --- | --- | --- |
| `I-001` | **resolved** | nonvisual requirement는 safe repo-relative lowercase `.json` exact ref만 허용하며 directory, final symlink, internal/external parent symlink, traversal, absolute/backslash path, arbitrary extension, realpath escape를 fail-closed한다. |
| `I-002` | **resolved** | runtime completeness는 nonvisual JSON requirement에만 적용된다. 기존 visual runtime refs는 report visual refs의 부분집합이면 통과하며 report의 모든 visual requirement를 runtime에 새로 강제하지 않는다. |
| `I-003` | **resolved** | PR body의 base RED `6/14`, repair RED `8/20`, I-004 RED `1/28`, GREEN `29/29`과 case inventory를 임시 detached worktree에서 독립 재현했다. |
| `I-004` | **resolved** | candidate의 모든 repo-relative parent component를 `lstat`하고 symlink 또는 non-directory면 즉시 거부한다. repository 내부 target을 가리키는 parent symlink fixture가 pre-fix에서 실패하고 current head에서 통과한다. |

## Filesystem and security matrix

| 입력 | 결과 |
| --- | --- |
| ordinary repo-relative `.json` regular file | pass |
| directory named `manifest.json` | fail: exact regular-file error |
| final symlink to existing external JSON | fail: exact regular-file error |
| parent symlink escaping repository | fail: exact regular-file error |
| parent symlink targeting repository-internal directory | fail: exact regular-file error |
| non-directory parent component | fail-closed |
| missing parent or metadata lookup failure | catch에서 fail-closed |
| missing JSON file | 기존 exact `file is missing` wording 유지 |
| absolute, traversal, dot-segment, empty-segment, backslash path | unsupported/fail-closed |
| `.log`, `.pem`, `.ts` requirement | unsupported; `.json`으로 오인하지 않음 |
| external JSON URL | local artifact requirement를 만족하지 못함 |
| realpath outside repository | containment 검사에서 fail |
| secret-like external artifact content | artifact body를 읽거나 error에 출력하지 않음 |

`isRegularRepoLocalJsonFile()`은 다음 순서로 검사한다.

1. syntax gate를 통과한 repo-relative `.json` ref만 진입한다.
2. root 아래 첫 segment부터 final candidate의 parent까지 각 component를 `lstat`한다.
3. parent가 symlink이거나 directory가 아니면 즉시 `false`다.
4. final candidate를 `lstat`해 symlink/directory를 거부하고 regular file만 허용한다.
5. `stat` regular-file 확인과 `realpath(root)` 대비 `realpath(candidate)` containment를 유지한다.
6. filesystem metadata 예외는 catch에서 `false`다.

따라서 parent symlink target이 repository 내부인지 외부인지에 관계없이 parent `lstat` 단계에서 먼저 거부된다. final realpath containment는 symlink가 아닌 다른 escape/해석 이상에 대한 방어층으로 유지된다. 이 함수는 JSON 내용을 parse/read하지 않으므로 secret non-output 성질도 보존된다.

## Nonvisual runtime completeness and visual compatibility

- authority report의 `> evidence:` block에서 safe local JSON refs와 visual refs를 별도 set으로 수집한다.
- safe local JSON requirement는 report exact ref, filesystem regular-file/containment, runtime exact ref를 각각 검증한다.
- runtime state가 존재하고 `authority_required=true`일 때 모든 nonvisual JSON requirement가 `design_authority.evidence_artifact_refs`에 exact-match로 있어야 한다.
- runtime의 각 visual ref가 authority report visual ref에 존재해야 하는 기존 subset sync는 유지된다.
- report가 default/narrow/desktop visual을 모두 만족하고 runtime이 default/narrow만 가진 fixture는 pass한다.
- PNG/image matcher, Figma URL matcher, `mobile-default` / `mobile-narrow` alias와 screenshot suffix normalization은 유지된다.
- 여러 authority report의 slice-level evidence aggregation은 유지된다.
- `generator_artifact` / `critic_artifact` nullable semantics와 automation schema는 변경하지 않았다.
- authority-required Draft skip, non-authority slice skip, closeout branch 재사용 semantics도 유지된다.

즉 이 PR은 기존 visual/Figma/default-narrow 계약을 넓히지 않고, 기존에 visual로 잘못 처리되던 nonvisual JSON requirement만 exact runtime completeness 대상으로 분리한다.

## TDD and PR body verification

PR body의 RED/GREEN story를 이전 report에서 복사하지 않고 임시 detached worktree에서 독립 재구성했다.

| 조합 | 독립 결과 |
| --- | --- |
| merge-base implementation + initial 20-test diff | expected RED: `6 failed / 14 passed` |
| initial implementation head `29086e6c...` + final predecessor 28-test diff | expected repair RED: `8 failed / 20 passed` |
| report-only head `2c5b2bf...` implementation + I-004 29th test | expected I-004 RED: `1 failed / 28 passed` |
| exact reviewed implementation head focused test | GREEN: `29 passed / 0 failed` |

base RED 6개는 mixed success, report JSON omission, referenced JSON missing, external JSON URL safety, runtime JSON omission, runtime JSON mismatch다. repair RED 8개는 directory, final symlink, external parent symlink, unsupported extension/path 4개, visual runtime subset 회귀다. I-004 RED는 repository-internal parent symlink 단 1개다. PR body의 수치와 case inventory가 모두 재현 결과와 일치한다.

## Independent verification

| 검증 | 결과 |
| --- | --- |
| `pnpm install --frozen-lockfile` | pass; tracked file/lockfile 변경 없음 |
| focused authority validator | `1 file / 29 tests` pass |
| workflow/OMO focused 8-file bundle | `8 files / 95 tests` pass |
| `pnpm lint` | pass |
| `pnpm typecheck` | pass |
| `pnpm validate:workpack` | pass |
| `pnpm validate:workflow-v2` | pass |
| `pnpm validate:omo-bookkeeping` | pass |
| `pnpm validate:source-of-truth-sync` | pass |
| `git diff --check origin/master...HEAD` | pass |
| full `pnpm test` run 1 | `535 files passed / 28 skipped`, `5,687 passed / 372 skipped`, 0 failed |
| full `pnpm test` run 2 | 같은 집계, 0 failed |

browser/device/E2E/production/remote writes는 제품 UI/runtime/외부 서비스 변경이 없는 local engineering validator review이므로 N/A다. 새 dependency와 제품 계약 변경은 없다.

## Affected slice simulations

현재 authority-required이면서 nonvisual local JSON requirement를 가진 slice 3개를 각각 Draft/non-Draft로 호출했다.

| slice | Draft | non-Draft fail-closed result |
| --- | --- | --- |
| `cooked-batch-weight-ui` | result 0, intended skip | error 14: visual 11 + exact JSON ref 3 |
| `meal-log-ui` | result 0, intended skip | error 53: missing report file 1 + visual 51 + exact JSON ref 1 |
| `cooking-meal-log-cross-slice-release-qa` | result 0, intended skip | error 26: missing report file 1 + visual 24 + exact JSON ref 1 |

non-Draft simulation은 현재 master에 아직 생성되지 않은 Stage 4 authority evidence를 의도대로 누락 보고한다. JSON requirement는 visual error로 섞이지 않고 exact artifact-ref omission으로 보고된다.

## Reviewed implementation-head checks

Snapshot: `2026-08-10 13:46 KST`

raw GitHub Checks API가 exact implementation head `01af1ca4...`에서 check run 20개를 반환했다.

- completed success: **15**
  - `quality`, `build`, `hybrid-authority-runtime`, `security-function-authorization`, `changes`, `GitGuardian Security Checks`
  - `policy` ×3, `template-check` ×3, `labeler` ×3
- completed intended skip: **5**
  - `smoke`, `accessibility`, `visual`, `lighthouse`, `full-regression`
- pending / queued / failed / cancelled: **0 / 0 / 0 / 0**

PR은 Draft다. 이 report publication commit은 implementation head 뒤의 additive successor가 되므로 위 snapshot을 publication successor head의 current-head merge evidence로 재사용해서는 안 된다. successor SHA/tree와 그 head에서 시작된 check 전체의 terminal 집계는 push 뒤 final handoff에서 별도로 기록한다.

## Five-axis review

### Correctness

mixed visual/JSON 분리, report exact JSON ref, missing-file wording, runtime exact completeness, visual subset 보존이 code/test와 독립 simulation에서 일치한다. I-004 parent component 검사는 내부/외부 target 모두 같은 fail-closed path를 탄다.

### Readability and simplicity

기존 parser → evidence set → requirement matcher 구조를 유지하고 filesystem 보장을 작은 helper 하나에 모았다. parent loop는 path depth에 비례하며 의도가 직접적이다. `statSync`는 `lstatSync().isFile()` 뒤 방어적으로 중복되지만 오동작이나 승인 차단 finding은 아니다.

### Architecture

새 dependency, schema, public contract, 제품 runtime coupling이 없다. visual matcher와 nonvisual exact matcher의 경계가 분리되어 I-002와 같은 scope 확대가 회귀 테스트로 고정됐다.

### Security

syntax, parent `lstat`, final `lstat`, realpath containment의 다층 검사로 directory/symlink/traversal/escape/arbitrary extension gate 우회를 닫는다. artifact body를 읽지 않아 secret content가 결과에 노출되지 않는다.

### Performance

작은 requirement/evidence set과 짧은 path depth에 대한 동기 metadata 조회만 추가된다. 제품 hot path는 아니며 유의미한 성능 위험은 없다.

## Final handoff

- final code-review verdict: **APPROVE**
- Critical / Important / Suggestion: **0 / 0 / 0**
- unresolved required findings: **none**
- implementation repair performed by this reviewer: **none**
- Ready / merge / `#11` authority / Discord: **not performed**
- remaining risk: browser/device/E2E/production 검증은 이 local validator 변경에 N/A이며, report publication successor의 current-head checks는 push 후 새로 집계해야 한다.
