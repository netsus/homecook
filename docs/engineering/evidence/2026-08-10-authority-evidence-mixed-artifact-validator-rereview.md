# PR #1321 fresh independent code rereview

## Verdict

- verdict: **HOLD**
- rereview task ID: `019fe9d8-2268-7080-8339-cb6b9bb0ad8b`
- reviewer role: fresh independent `code-reviewer`
- predecessor review artifact: commit `f1d3949c32c308dc5b83e6035bd20de3af2bd448`, `docs/engineering/evidence/2026-08-10-authority-evidence-mixed-artifact-validator-review.md`
- Critical: **0**
- Important: **1**
- Suggestion: **0**
- unresolved required finding: `I-004`

승인 조건은 `Critical 0 / Important 0`이다. I-001의 외부 escape는 닫혔지만, 명시적으로 금지된 parent symlink가 저장소 내부를 가리키면 여전히 authority requirement를 만족시킨다. 따라서 이 rereview는 승인 근거가 아니며 reviewer는 Ready, merge, Discord, 제품/validator repair, #11 authority 판정을 수행하지 않는다.

## Exact reviewed snapshot

| 항목 | 값 |
| --- | --- |
| PR | `#1321` (`fix/authority-evidence-mixed-artifacts`, Draft) |
| exact reviewed implementation head | `bef2359f1686dc9d27f88a23b1853861bcb2935d` |
| reviewed tree | `c697097b0444e4594b7725d8c9dbd38b64fad565` |
| base / merge-base | `11883fb790dbe4664ed5f409fd0b5cf55ee02f41` |
| implementation changed files | `scripts/lib/validate-authority-evidence-presence.mjs`, `tests/authority-evidence-presence.test.ts` (exactly 2) |

review 시작 시 `git fetch origin --prune` 뒤 local HEAD, `origin/fix/authority-evidence-mixed-artifacts`, GitHub PR head가 모두 exact reviewed head와 일치했고 local/remote tree도 reviewed tree와 일치했다. base와 merge-base도 exact base였다. predecessor report는 PR ancestor가 아니라 지정된 독립 reviewer commit에서 `git show`로 읽었으며, 그 부재를 finding으로 취급하지 않았다.

## Previous required finding disposition

| ID | 판정 | 근거 |
| --- | --- | --- |
| `I-001` | **partially resolved; superseded by I-004** | directory, final symlink, external parent-symlink escape, repo escape, traversal, non-JSON extension은 새 code/tests가 fail-closed한다. 그러나 내부 parent symlink는 통과한다. |
| `I-002` | **resolved** | runtime completeness loop는 `isNonVisualArtifactRequirement()`인 JSON requirement에만 적용되고, runtime visual refs는 report refs의 부분집합이면 통과한다. focused regression이 이를 고정한다. |
| `I-003` | **resolved** | PR body가 base RED `6 failed / 14 passed`와 exact 6-case inventory, repair RED `8 failed / 20 passed`, GREEN `28/28`을 기록하며 독립 재현과 일치한다. |

## Required finding

### I-004 — 저장소 내부 parent symlink가 required JSON artifact로 승인된다 (Important)

위치:

- `scripts/lib/validate-authority-evidence-presence.mjs:120-145`
- `tests/authority-evidence-presence.test.ts:332-382`

`isRegularRepoLocalJsonFile()`은 최종 candidate만 `lstatSync()`하고, 이어 `statSync()`와 `realpathSync()` containment를 확인한다. 따라서 parent path component가 symlink여도 최종 realpath가 repository 내부이면 candidate는 regular file + contained path로 판정된다. 현재 regression test도 external directory를 가리키는 parent symlink escape만 다루며, repository 내부 directory를 가리키는 parent symlink는 없다.

독립 fixture에서 다음 구조를 만들었다.

```text
ui/designs/evidence/link -> <repo>/ui/designs/evidence/real
ui/designs/evidence/real/manifest.json
required ref: ui/designs/evidence/link/manifest.json
```

exact reviewed head validator 결과는 `[]`이어서 requirement를 승인했다. 이는 handoff가 명시한 “directory, final symlink, parent symlink, repo escape가 authority requirement를 만족시키지 못해야 한다” 중 parent-symlink 조건을 충족하지 않는다.

필수 수정:

1. root에서 candidate parent까지 각 path component를 `lstat`하여 symlink parent를 fail-closed한다.
2. repository 내부 target을 가리키는 parent symlink fixture를 RED로 추가하고 exact regular-file error를 확인한다.
3. 기존 external parent escape, final symlink, directory, missing-file wording, secret-content 비출력 test를 유지한다.

## Security and filesystem matrix

| 입력 | 결과 |
| --- | --- |
| repo-relative lowercase `.json` regular file, symlink parent 없음 | pass |
| directory named `manifest.json` | fail |
| final symlink | fail |
| parent symlink escaping repo | fail |
| parent symlink staying inside repo | **unexpected pass — I-004** |
| absolute / traversal / backslash path | fail |
| `.log`, `.pem`, `.ts` requirement | fail |
| external JSON URL | cannot satisfy local artifact requirement |
| missing JSON file | prior exact `file is missing` wording preserved |
| external secret content behind final symlink | error output does not expose content |

`lstatSync`, `statSync`, `realpathSync` failure는 catch에서 fail-closed하고 realpath containment는 외부 escape를 거부한다. artifact body를 읽지 않으므로 executable/secret-like non-JSON 파일의 내용도 출력하지 않는다. 단, parent component 자체를 검사하지 않는 I-004가 남는다.

## Runtime and visual compatibility

- report visual matching의 PNG/Figma 처리와 `mobile-default` / `mobile-narrow` alias는 유지된다.
- local nonvisual evidence는 report에서 exact repo-relative `.json` ref로 분리된다.
- runtime의 모든 ref가 report evidence에 포함되어야 하는 기존 subset sync는 유지된다.
- required completeness는 runtime loop의 `isNonVisualArtifactRequirement()` branch에만 적용된다.
- report가 default/narrow/desktop visual을 모두 포함하고 runtime이 default/narrow만 포함하는 fixture는 pass한다.
- 여러 authority report의 slice-level visual set aggregation과 Figma-only default/narrow fixture도 pass한다.

따라서 I-002의 visual runtime scope regression은 닫혔고 기존 default+narrow/Figma semantics의 추가 회귀는 발견하지 못했다.

## TDD and verification evidence

| 검증 | 결과 |
| --- | --- |
| `pnpm install --frozen-lockfile` | pass; tracked file 변경 없음 |
| focused current head | `28 passed / 0 failed` |
| exact base implementation + initial 20-test diff | expected RED `6 failed / 14 passed` |
| initial implementation head + final 28-test diff | expected repair RED `8 failed / 20 passed` |
| `pnpm lint` | pass |
| `pnpm typecheck` | pass |
| `pnpm validate:workpack` | pass |
| `pnpm validate:workflow-v2` | pass |
| `pnpm validate:omo-bookkeeping` | pass |
| `git diff --check <base>...<head>` | pass |
| full `pnpm test` | 535 files passed / 28 skipped; 5,686 passed / 372 skipped; 0 failed |
| cooked-batch-weight-ui Draft simulation | pass by intended Draft skip |
| cooked-batch-weight-ui non-Draft simulation | intended fail: 11 visual + 3 exact JSON artifact omissions |
| internal parent-symlink diagnostic | unexpected pass (`[]`) — I-004 |

Browser/device/E2E/production/remote writes are N/A because this is a local engineering validator rereview. No dependency or product contract changed.

## Reviewed-head raw started checks

Snapshot: `2026-08-10 13:12 KST`

GitHub Checks API returned exactly 17 check runs for reviewed head `bef2359f...`:

| check | conclusion |
| --- | --- |
| `quality` | success |
| `build` | success |
| `hybrid-authority-runtime` | success |
| `security-function-authorization` | success |
| `changes` | success |
| `GitGuardian Security Checks` | success |
| `policy` (CI run) | success |
| `policy` (PR governance rerun) | success |
| `template-check` (head run) | success |
| `template-check` (PR governance rerun) | success |
| `labeler` (head run) | success |
| `labeler` (PR governance rerun) | success |
| `smoke` | skipped |
| `accessibility` | skipped |
| `visual` | skipped |
| `lighthouse` | skipped |
| `full-regression` | skipped |

completed success 12, intended skipped 5, pending/queued/failed/cancelled 0이다. PR은 Draft다. report publication commit은 reviewed implementation head 뒤에 additive로 생기므로 이 snapshot을 새 PR head의 merge evidence로 재사용할 수 없다.

## Five-axis review

### Correctness

mixed visual/JSON 분리, report exact JSON ref, missing-file error, runtime exact sync, visual subset 보존은 의도대로 동작한다. 다만 parent-symlink 불허 acceptance가 I-004로 완결되지 않았다.

### Readability and architecture

기존 parser → evidence set → requirement matcher 구조를 재사용하고 새 dependency가 없다. visual matcher와 JSON exact matcher 분리는 명확하다. `isRegularRepoLocalJsonFile` 이름이 모든 path-component symlink를 거부하는 듯 보이지만 실제 구현은 최종 candidate만 `lstat`하므로 보장과 이름이 어긋난다.

### Security

외부 escape, final symlink, directory, traversal, non-JSON secret/executable-like extension은 차단된다. 내부 parent symlink alias는 evidence provenance를 canonical repo path가 아닌 alternate path로 만족시킬 수 있어 merge gate integrity 요구에 미달한다.

### Performance

작은 evidence/ref set과 동기 filesystem metadata 조회뿐이라 제품 runtime hot path 영향은 없다. parent component `lstat` 보강도 path depth에 비례하는 bounded 비용이다.

### Verification quality

focused, exact base RED, repair RED, full suite, lint/typecheck/validators와 PR body 수치가 일치한다. 현재 28-test suite는 I-004를 검출하지 못하므로 test completeness는 아직 승인 수준이 아니다.

## Required next action

1. 작성/repair task가 I-004를 code + regression test로 수정한다.
2. 새 implementation head에서 focused GREEN과 새 test의 pre-fix RED를 남긴다.
3. 새 exact head/tree, implementation diff, full required validators, raw current-head started check set을 fresh independent reviewer가 다시 확인한다.
4. `Critical 0 / Important 0` 전에는 이 report를 승인, Ready, merge, #11 authority 근거로 사용하지 않는다.
