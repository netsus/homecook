# Workpack 33 independent Stage 6 current-head review

## Review identity and exact target

- reviewer role: independent `frontend-closeout-reviewer`
- reviewer task ID: `019ff552-b732-7aa0-80a2-8833acd9c23e`
- implementation author task ID: `019ff51a-ad9d-7df3-b830-b37d7a76e2e5`
- PR: [#1341](https://github.com/netsus/homecook/pull/1341)
- reviewed head: `277f21614d481d30385e349303bd4bc4b147796a`
- reviewed base: `origin/master@ed1982a138ef67692aa17a3c014811bb255cb06d`
- reviewed inventory: 18 files, 2 commits, 671 additions, 80 deletions
- review independence: reviewer and implementation author task IDs differ; Claude CLI, app, and API were not used

## Verdict

**PASS**

- Critical: `0`
- Important: `0`
- Suggestion requiring pre-merge action: `0`
- unresolved actionable findings: `0`

This verdict applies to the exact reviewed product/evidence head above. The report-only successor that adds this file must receive fresh current-head checks before Ready or merge.

## Focused correctness review

1. Loading click/Enter duplication is blocked at both layers. `isBusy` disables the input and submit button, while `importInFlightRef` synchronously rejects a second `startImport` before React state can commit.
2. Retry performs a real second call. `extractionAttempt` changes the extraction effect dependency while `extractionFiredRef` is reset, so retry from the still-current `extracting` step starts a new request instead of remaining in the failed state.
3. Auto-preview does not win a stale race. Busy transitions clear the pending timer, `lastAutoInspectUrlRef` prevents the same URL from being rescheduled, and `requestSeqRef` discards an older inspection result if a newer action starts.
4. The 320px repair is narrow. Only the four progress labels receive `whitespace-nowrap` and horizontal label padding is removed; no layout hierarchy, endpoint, field, dependency, auth, or extraction contract changes.

The regression tests assert one extraction for rapid click plus Enter, zero unintended preview validation, exactly two extraction requests across error and retry, one-line progress labels, horizontal overflow at most 1px, no capability overlap, and zero console/page/unexpected HTTP errors.

## Five-axis quality review

- correctness: implementation and tests agree on duplicate suppression, retry, stale-request disposal, error recovery, and responsive behavior
- readability: the new refs and attempt token have single, local responsibilities; control flow remains linear and uses existing component patterns
- architecture: no new abstraction, route, public contract, or dependency was introduced
- security: URL validation and server-only provider configuration remain unchanged; no secret, provider payload, or credential surface was added
- performance: the change removes duplicate requests and adds only constant-time refs/state; it introduces no loop, polling source, bundle dependency, or unbounded cache

## Acceptance evidence review

All eight newly checked non-manual Stage 4 items are justified:

| Acceptance item | Independent evidence |
| --- | --- |
| arbitrary public URL | merged PR #1110 retained production TypeScript smoke: 3 successes at `42.41s`, `51.03s`, `52.78s`; 36 frames, 8 selected, 2 model calls, 0 temp directories |
| loading submit lock | source-level synchronous guard plus fresh three-project Playwright request-count assertion |
| error/retry | fresh three-project 502 `PROVIDER_ERROR` to retry-to-review run, request count exactly 2 |
| no settings UI | base-to-head diff and browser assertion show no key/model/settings surface |
| browser quality | original-size 1280/390/320 loading, error/retry, and review PNGs inspected; runtime overlap/overflow/error assertions pass |
| Playwright flow | fresh `7 passed / 2` intentional single-browser evidence-matrix skips |
| live/mock split | retained provider smoke and current deterministic browser evidence are explicitly separated in the closeout report and PR body |
| frontend gates | retained full frontend verification is supported by current-head CI plus fresh focused Vitest, Playwright, and closeout validators |

`accept-i031-current-head-green` remains unchecked at this reviewed head because Ready-triggered checks and merge had not occurred. All three `Manual Only` items remain unchecked.

## Retained real-smoke provenance

- PR #1110 is merged with content head `db0b838a7e4d568c4e11a6ff9c5117fef4c8d476` and squash merge `438f5f9b83d0676d61d8d51d5e31ca96ee9b0a91`.
- The content-head tree and merge-commit tree are identical: `f587fca82290ae44aa52d5ac725d8bf6c41fa153`.
- The merge commit is an ancestor of the reviewed `origin/master` base.
- The repository-retained integration plan and workpack record the same input class, timings, frame/model counts, and cleanup result. The evidence is not represented as a fresh provider run by the Stage 4 author or this reviewer.

## Visual evidence review

The nine committed PNGs were opened at original size. Dimensions are `1280x720` for desktop, `390x860..1074` for mobile 390, and `320x880..1102` for mobile 320. Loading, error/retry, and review remain readable without clipped controls or overlap; the 320px progress labels remain one line. The screenshots are fixture-backed browser evidence, not provider-smoke evidence.

## Independent verification

| Verification | Result |
| --- | --- |
| related Vitest | `3 files / 116 tests passed` |
| workpack Playwright, all projects, retries 0 | `7 passed / 2 intentional skips` |
| source-of-truth sync | passed |
| workflow-v2 | passed |
| workpack | passed |
| automation spec | passed via `scripts/validate-automation-spec.mjs` |
| closeout sync | passed |
| OMO bookkeeping | passed |
| real-smoke presence | passed |
| `git diff --check` | passed |

## Reviewed-head CI evidence

For exact head `277f21614d481d30385e349303bd4bc4b147796a`, GitHub returned 21 raw check runs: 19 `SUCCESS`, 2 intentional `SKIPPED`, and 0 pending/failed/cancelled/rerun. The 15 unique contexts are 13 success plus the two intended Draft-policy skips:

- `full-regression`: Draft policy; it is required again by the Ready-for-review action for this frontend path
- `lighthouse`: Draft policy; it is required again after Draft removal for the changed frontend path

Every check-run reports the exact reviewed `head_sha`. Ready transition and merge remain conditional on all newly started successor-head checks completing successfully or with a documented policy skip.

## Remaining boundary

- user-owned arbitrary public URL confirmation: Manual Only, unchecked
- Holdout promotion and preview/production enablement: Manual Only, unchecked
- production macOS worker installation and operating secrets: Manual Only, unchecked
- post-merge roadmap/acceptance projection and OMO report: not claimed by this pre-merge review record
