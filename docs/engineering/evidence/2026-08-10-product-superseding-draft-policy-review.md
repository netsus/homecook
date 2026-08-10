# Product Superseding Draft Policy Independent Review

- PR: `#1324` — `fix(workflow): preserve product gates for clean successor history`
- independent reviewer task: `019fe9fc-2f4b-78e2-ae26-01ef327ee14c`
- coordinator source task: `019fe028-be31-76f2-a5a7-986000a93374`
- reviewed base: `ac9332ba41ad0a83ed3911bea6a27bba7dd8c012`
- reviewed head: `b223ed8da862146084191709be762468a70f3b5c`
- reviewed tree: `3518791cd03d69cee11d5bd6e4d1f911339bb688`
- actor policy: fresh independent Codex review; Claude 사용 없음

## Verdict

`REQUEST_CHANGES`

Required unresolved findings: `3`.

- Critical: `0`
- Important: `3`
- Suggestion: `1`

Important finding이 남아 있으므로 `APPROVE`하지 않는다.

## Findings

### Critical

- 없음.

### Important

#### I-001 — Wave1 closeout branch가 evidence gate를 silent-skip한다

- `scripts/lib/validate-wave1-prototype-lock.mjs:60-61`은 이번 변경에서 shared `resolveSliceBranchContext()`를 사용한다.
- 그러나 `scripts/lib/validator-shared.mjs:7`의 closeout pattern은 `docs/omo-closeout-` 뒤에 숫자 두 자리로 시작하는 slice만 허용한다.
- Wave1 canonical slice는 `wave1-port-*`이므로 `docs/omo-closeout-wave1-port-discovery-detail`이 `{ kind: null, slice: null }`로 분류되고 validator가 빈 결과로 통과한다.
- base 구현의 Wave1 전용 branch regex는 이 non-numeric closeout slice를 인식했다. 따라서 공용화 과정의 실제 회귀다.
- 독립 재현:
  - `feature/fe-wave1-port-discovery-detail` → `wave1-prototype-lock` error `9`개
  - `feature/fe-wave1-port-discovery-detail-superseding-draft` → 동일 error `9`개
  - `docs/omo-closeout-wave1-port-discovery-detail` → `[]`
- required fix: shared closeout parser가 canonical closeout slice grammar 전체를 보존하게 고치고, Wave1 closeout regression test를 추가해야 한다.

#### I-002 — 공용 parser가 canonical branch grammar와 일치하지 않아 fail-closed 계약을 깨뜨린다

- `scripts/lib/product-branch-context.mjs:3`의 `(.+)` 때문에 유효한 Git ref인 `feature/fe-`와 `feature/be-`가 invalid product-like input으로 throw되지 않고 empty context가 된다.
- 그 결과 `scripts/check-workpack-docs.mjs`는 두 branch 모두 non-product로 보고 exit `0`으로 silent-skip한다.
- `scripts/lib/product-branch-context.mjs:4`의 slug regex는 double hyphen을 허용한다. 따라서 global branch policy가 거부하는 `feature/fe-cooked--batch-superseding-draft`에 recovery product context를 부여한다.
- 반대로 `scripts/lib/product-branch-context.mjs:34-50`의 substring `includes("superseding")` 판정은 global branch grammar가 허용하는 `feature/fe-supersedingly-simple`과 `feature/fe-menu-superseding-notes`까지 거부한다. 문서가 예약한 것은 exact `-superseding-draft` suffix이므로 canonical branch 회귀 없이 적용한다는 계약과 맞지 않는다.
- required fix: product prefix는 malformed empty slice까지 포착해 throw하고, canonical slug grammar를 repository branch grammar와 한 소스로 맞추며, exact recovery suffix와 malformed/nested suffix 경계를 명시적으로 검사해야 한다.
- required regression: empty `be|fe`, double-hyphen, valid canonical `superseding*` slug, backend successor, double/nested suffix를 모두 고정해야 한다.

#### I-003 — 변경된 product-gate consumer 일부가 successor regression으로 직접 잠기지 않았다

- `tests/product-branch-context.test.ts:5-10`은 changed consumer 중 `validateRealSmokePresence`와 OMO GitHub work-item inference를 import하지 않는다.
- 기존 `tests/real-smoke-presence.test.ts`와 `tests/omo-github.test.ts`에도 `-superseding-draft` branch case가 없다.
- dedicated test는 frontend successor만 직접 확인한다. backend successor가 `feature-be`를 유지해 non-Draft Ready/real-smoke gate에 들어가는 end-to-end case도 없다.
- 현재 code inspection과 독립 probe에서는 canonical/successor real-smoke 결과가 같다. 그러나 `11/11`, focused `118/118`, full suite green은 이 두 신규 successor integration과 backend Ready policy를 직접 증명하지 않는다.
- required fix: real-smoke canonical/successor parity, OMO `createPullRequest` canonical work-item inference, backend successor kind/Ready parity를 regression test로 추가해야 한다.

### Suggestion

- `tests/product-branch-context.test.ts`의 focused policy command를 package script로 고정하면 consumer 파일 누락 없이 동일 evidence를 재현하기 쉽다.

## Exact Tuple And Scope

- 시작 시 fetch 후 GitHub PR metadata, `refs/pull/1324/head`, 원격 `refs/heads/fix/product-superseding-draft-policy`, 로컬 input HEAD/tree를 대조했다.
- base/head/tree는 각각 `ac9332ba41ad0a83ed3911bea6a27bba7dd8c012`, `b223ed8da862146084191709be762468a70f3b5c`, `3518791cd03d69cee11d5bd6e4d1f911339bb688`로 모두 일치했다.
- PR은 `OPEN / Draft`; base는 `master`였다.
- base 대비 product policy 변경은 문서 2개, parser/consumer 5개, dedicated test 1개로 정확히 8파일이다.
- dependency, package manifest, lockfile, 공식 product contract, runtime/API/DB/UI 변경은 없다.

## Parser And Consumer Review

- exact canonical `feature/be-*`와 `feature/fe-*`는 각각 `feature-be` / `feature-fe` kind를 유지한다.
- exact single `-superseding-draft`는 canonical slice와 recovery metadata로 해석된다.
- malformed reserved suffix 3종, nested exact suffix는 throw한다.
- arbitrary `-draft`는 original canonical workpack을 빌리지 못하고 별도 slice workpack missing으로 실패한다.
- `fix/*`와 PR body/label에서 product branch context를 역추론하는 경로는 없다.
- check-workpack-docs, validator-shared의 closeout/exploratory/authority/real-smoke consumers, Wave1, OMO GitHub inference는 모두 shared parser/resolver로 연결되었다.
- successor kind가 유지되므로 frontend/backend non-Draft strict mode 조건 자체는 canonical branch와 동일하다.
- 다만 I-001과 I-002 때문에 전체 공용화가 fail-closed/regression-free라고 승인할 수 없다.

## Recovery Policy And Git History Evidence

- `git-workflow.md`와 `slice-workflow.md`는 recovery를 preserved-history commit-range failure에만 제한한다.
- original PR/history 보존, original exact base/head/tree, successor exact base/parent/head/tree, same exact tree, clean full Conventional range, no force/amend/rebase/reset/silent recreation, Draft, same product gates/current-head checks/actual verification/independent review를 모두 요구한다.
- #1320:
  - base `11883fb790dbe4664ed5f409fd0b5cf55ee02f41`
  - head `7d11175fe142b95af12b4bffcaf65d2c89262e29`
  - tree `c9295bb8431e17f9b686376f0360d1c865194d72`
  - full range validator는 invalid non-merge subject 정확히 `3`개로 실패했다.
- #1323:
  - base/parent `11883fb790dbe4664ed5f409fd0b5cf55ee02f41`
  - head `86a71dee01814cf7a220fcb4c919401dad0aaa8a`
  - tree `c9295bb8431e17f9b686376f0360d1c865194d72`
  - full range validator는 `Commit messages OK (1)`로 통과했다.
- `git diff --exit-code 7d11175fe142b95af12b4bffcaf65d2c89262e29 86a71dee01814cf7a220fcb4c919401dad0aaa8a`는 통과해 동일 tree를 재현했다.
- #1324 full base..head range는 `Commit messages OK (2)`다. 두 commit 모두 Conventional subject와 Lore trailers를 갖는다.
- commit validator, git-policy commit rule, Policy workflow는 base..head에서 변경되지 않았다. allowlist, skip env, head-only 검사, `fix/*` product bypass 추가가 없다.

## Independent Verification

- `pnpm install --frozen-lockfile` — pass, lockfile 변경 없음.
- dedicated Vitest — `1 file / 11 tests passed`.
- focused policy Vitest — `8 files / 118 tests passed`.
- full Vitest — `536 files passed, 28 skipped / 5,682 tests passed, 372 skipped`.
- `pnpm lint` — pass.
- `pnpm typecheck` — pass.
- `pnpm validate:branch` — pass.
- `pnpm validate:commits` — pass for #1324 full range.
- `pnpm validate:workpack` — pass for PR #1324 branch; canonical successor workpack resolution also passed in focused test.
- `pnpm validate:workflow-v2` — pass.
- `pnpm validate:source-of-truth-sync` — pass.
- `pnpm validate:omo-bookkeeping` — pass.
- `pnpm validate:closeout-sync` — pass for Draft PR #1324 context.
- exploratory QA / authority / real-smoke / Wave1 validators — pass for Draft PR #1324 context.
- PR body validator — pass.
- `git diff --check` — pass.

Green suites do not waive the three Important findings because two are independently reproduced control-flow bugs and one is a direct successor coverage gap.

## PR Body And Input-Head Checks

- reviewed input head `b223ed8da862146084191709be762468a70f3b5c`의 raw check-runs는 `17/17` terminal이었다.
  - success `12`
  - intentional skipped `5`: `smoke`, `accessibility`, `visual`, `lighthouse`, `full-regression`
  - pending/running/failure/cancelled `0`
- legacy commit status contexts는 `0`이다.
- PR 본문의 `9 success + 5 skip`은 body edit로 추가 시작된 `policy`, `labeler`, `template-check` 3개를 반영하지 못해 stale하지만, terminal-green 여부는 바뀌지 않는다.

## #1321 Ownership And Integration Caveat

- `scripts/lib/validate-authority-evidence-presence.mjs`와 `tests/authority-evidence-presence.test.ts`는 reviewed base/head에서 blob이 정확히 동일하며 #1324가 수정하지 않았다.
- #1321은 아직 `OPEN / Draft`; head `01af1ca4be749063147adb1e49fc25912b19af1d`, tree `affffe928cf40fd517a4b9d9eda9f41417e36a43`이다.
- #1321 merge 후에는 force/rebase/reset 없이 최신 master를 normal merge하고, shared parser와 변경된 authority consumer를 새 integration tree에서 focused/full/validator/current-head checks로 다시 검증해야 한다.
- 이는 이후 integration caveat이며 이번 reviewed head의 추가 코드 finding은 아니다.

## Reviewer Boundary

- 이 review는 report만 추가한다. parser/consumer/test repair, Ready 전환, merge, PR #1323 수정, Discord 전송을 수행하지 않는다.
- report commit/push 뒤 새 PR head에서 시작된 checks는 successor head 기준으로 다시 terminal 집계한다. reviewed input head green은 새 head merge 근거로 재사용하지 않는다.
