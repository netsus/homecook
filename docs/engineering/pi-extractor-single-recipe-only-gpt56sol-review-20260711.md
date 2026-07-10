# Pi Extractor Single-Recipe-Only GPT-5.6 Sol Review

Date: 2026-07-11 KST
Reviewer: separate `gpt-5.6-sol` session, reasoning effort `high`
Review session: `019f4d6f-298b-78d0-9740-94adff171df9`
Verdict before fixes: `REQUEST CHANGES`

## Execution Notes

- Local `codex exec` with `gpt-5.6-sol` could not start because Codex CLI `0.142.5` is too old for that model.
- Two native review session attempts were rejected before execution because the model was at capacity.
- A third native separate session started with the requested model and effort and completed the review.
- The reviewer did not edit files.

## Findings And Decisions

### Accepted: explicit unsupported notes were not counted

The prompt tells Pi to keep one `r1` story and write `UNSUPPORTED_MULTI_RECIPE_VIDEO` into uncertainty notes, but the gate only counted multiple stories or recipes.

Applied:

- Count the exact unsupported token in video-understanding `crossDishNotes`/`uncertainties`.
- Count the same token in draft `globalUncertainties`/recipe `uncertainties`.
- Keep the two-stage rule, so one uncertain stage alone still does not block the final result.

### Partially rejected: fallback cache/event writes before 422

The reviewer noted that LLM/visual fallback can write extractor cache and operational event rows before the final multi-recipe 422 response.

Decision:

- Keep these writes. They are bounded extractor cache/observability records, not a `youtube_extraction_sessions` parent or `youtube_extraction_candidates` row.
- The public contract and implementation requirement are that a rejected single-only request must not create a user extraction session or candidate ledger.
- Existing tests verify those two user-facing tables are not written.
- Suppressing cache/events would add a second persistence mode to every fallback and would reduce rate-limit and debugging correctness without changing the user-visible session state.

### Accepted: protected split detail leak bypass

Applied:

- Detailed comparison HTML now rejects every `validation` or `holdout` invocation, regardless of whether `--dataset-manifest` is supplied.
- Protected splits remain aggregate-only.

### Accepted: missing candidateId passed exact-one contract

Applied:

- Single-only final output now requires `candidateId === "r1"`.
- Missing, null, or another candidate ID is a contract failure.

### Accepted: noisy LLM/visual candidates could hard reject

Applied:

- LLM/visual multi extraction now keeps only candidates with at least one usable ingredient and one usable cooking step.
- It returns a multi result only when at least two usable candidates remain.

### Accepted: 4/6 were defaults instead of hard caps

Applied:

- Single-only mode clamps `holistic-max-targets-per-recipe` to at most 4.
- Single-only mode clamps `holistic-max-total-targets` to at most 6.
- Smaller caller-provided limits remain allowed.

## Additional Local Finding

The local review found that staged `--candidate-only` wrote `result.json` before applying the exact-one contract.

Applied:

- Candidate-only output now passes the same single-recipe contract before result persistence.
- A regression test confirms two candidates fail and no `result.json` is written.

## Verification After Review

- `tests/pi-extractor-runner.test.ts`, `tests/youtube-import.backend.test.ts`, and `tests/menu-add-screen.test.tsx`: 220 tests passed after the first review fixes.
- Final follow-up verification: the same three files completed with 221 tests passed, together with `pnpm lint`, `pnpm typecheck`, JavaScript syntax checks, and production build.

## Final Re-Review

The same `gpt-5.6-sol` high-effort session re-read the fixes and returned `OK` with no remaining P0/P1 finding.
