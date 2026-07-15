# YouTube Live Extraction Validation Plan

Status: implemented guardrails, live provider run remains environment-dependent
Change type: docs-governance first, followed by product-backend and optional contract-evolution
Created: 2026-06-05

## Problem

The YouTube recipe extraction work had a serious verification failure: a fixture replay result was shown like a live local service extraction result.

In plain terms:

- `fixture replay` means a test uses a prepared answer sheet.
- `live smoke` means the local service calls the real configured providers for real YouTube URLs.
- `UI verification` means the browser shows the same ingredients and steps that the report claims.

The production code already blocks test provider injection outside `NODE_ENV=test`, but that was not enough. The failure happened because the report and browser evidence used for a user-facing claim came from a Vitest fixture replay artifact.

This plan fixes the process so future work cannot claim recipe extraction quality unless it is backed by live extraction evidence and UI evidence.

## Grounded Evidence

- The previous plan `.omx/plans/youtube-recipe-extraction-quality-ralplan-20260604.md` already required `fixture_replay`, `real_smoke`, and UI-visible scoring separation.
- The user-facing artifact `.omx/artifacts/youtube-12-after-improvement-20260605/extraction-results.json` was produced by `.omx/artifacts/youtube-12-after-improvement-20260605/run-report.test.ts`.
- `tests/youtube-recipio-parity.test.ts` builds visual recipe mock results from `tests/fixtures/youtube-recipio-parity/parity-v1.json`.
- `lib/server/youtube-import.ts` restricts `setYoutubeVisualRecipeExtractorForTest` to tests, so the core shortcut was not in normal production provider selection.
- `docs/api문서-v1.2.23.md` §6-2 forbids fixed recipe fixtures for specific `youtube_video_id` during extraction and forbids storing raw video, raw frames, raw provider responses, API keys, secrets, or Recipio data.

## Principles

1. Live evidence and test evidence are different kinds of proof.
   A test can protect code behavior, but it cannot prove that a real YouTube video was parsed correctly.

2. Extraction must be provider-driven, not answer-key-driven.
   The extraction process receives only the YouTube URL and configured providers. Recipio or fixture references are allowed only after extraction, inside the evaluator.

3. A score is not valid unless its source layer is explicit.
   `fixture_replay_score`, `real_smoke_score`, and `ui_visible_score` must never be averaged into one vague total.

4. Contract limits are part of correctness.
   Current official docs allow public text parsing, Gemini structured fallback over public text, and visual quantity enrichment. Broader visual/OCR ingredient and step extraction needs docs-first contract evolution.

5. Recurrence prevention must be structural.
   "Be careful next time" is not enough. Scripts, report schemas, file names, provenance checks, and review gates must make the wrong path fail closed.

## Decision Drivers

| Driver | Why It Matters |
| --- | --- |
| Evidence integrity | The user must know whether a result came from live YouTube extraction or a test fixture. |
| Generality | Improvements must work for new videos without hidden answer sheets. |
| Contract safety | Raw provider data, raw frames, Recipio data, and video-specific fixtures must not leak into extraction or reports. |

## Options

| Option | Summary | Pros | Cons | Decision |
| --- | --- | --- | --- | --- |
| A. Label existing reports more clearly | Keep current scripts but add stronger fixture wording. | Fast. | The same mistake can recur because structure still permits mixed evidence. | Reject |
| B. Split fixture, live, and UI evidence with hard gates | Keep fixture tests, but require separate live and UI artifacts for public claims. | Directly prevents the known failure while preserving regression tests. | Requires new validation scripts and reporting discipline. | Choose |
| C. Remove fixture replay scoring entirely | Only run live smoke tests. | Removes one source of confusion. | Loses stable regression coverage and makes CI flaky/costly. | Reject |
| D. First add full visual/OCR recipe extraction | Try to fix sparse videos by adding stronger extraction. | May improve sparse videos long-term. | Skips the immediate verification failure and touches current contract limits. | Defer to contract-evolution |

## ADR

Decision: Use Option B as the next execution path.

Drivers:
- The immediate failure is not only extraction quality. It is evidence mixing.
- Fixture tests are useful, but fixture output must never be presented as live service output.
- Sparse videos can be improved later, but only after live evidence and contract boundaries are honest.

Alternatives rejected:
- Label-only fix: too weak because it still allows fixture artifacts to be reused as live reports.
- Live-only testing: too flaky and removes useful regression tests.
- Visual/OCR-first implementation: premature until docs authorize ingredient/step visual extraction.

Consequences:
- Future "12 tabs" demos require live extraction sessions, not test replay HTML.
- Reports need explicit run modes and manifest validation.
- If live providers are unavailable, the task must report blocked/inconclusive instead of using fixture output as fallback evidence.

Follow-ups:
- Implement a live smoke harness.
- Implement a report manifest validator.
- Add a docs-first contract-evolution plan if visual/OCR recipe ingredient and step extraction is approved.

## Non-Negotiable Rules

1. A file generated by `*.test.ts`, Vitest, or `tests/fixtures/**` cannot be used as `live` evidence.
2. A live extraction run must fail if `NODE_ENV=test`.
3. A live extraction run must fail if `HOMECOOK_YOUTUBE_FIXTURE_PROVIDER=1`.
4. A live extraction run must fail if any provider name contains `fixture`, `mock`, `parity`, or `test`.
5. The extractor process must not import Recipio reference data, parity fixture data, or expected ingredients/steps.
6. Recipio comparison data may be loaded only by a separate evaluator after our extraction result has been persisted.
7. Browser tabs for user review must open actual local extraction result pages backed by live session IDs.
8. If a live run cannot reach YouTube, transcript, Gemini, or another required provider, the status is `blocked` or `inconclusive`, not `passed`.
9. Live status must be derived, not self-attested.
   `verified_live`, `provider_names`, and `session_ids` must be computed from the actual API response and persisted session metadata. A report writer cannot manually mark a row as live.
10. Candidate-level evidence must not be displayed or scored as a completed top-level single recipe unless an explicit candidate-promotion contract says so.
11. Current official docs do not allow broad visual/OCR recipe ingredient and step extraction as a silent production win. That requires a separate docs-first contract change.

## Required Report Layers

Every report must declare one of these modes.

| Mode | Meaning | Allowed Use |
| --- | --- | --- |
| `fixture_replay` | Deterministic test replay using prepared inputs or expected outputs. | Regression tests only. Never used for public improvement claims. |
| `live_smoke` | Local service calls real configured providers for actual YouTube URLs. | Extraction quality evidence. |
| `ui_capture` | Browser-visible result from live extraction sessions. | User-facing result evidence. |

Required report fields:

| Field | Requirement |
| --- | --- |
| `run_mode` | One of `fixture_replay`, `live_smoke`, `ui_capture`. |
| `evidence_origin` | `test_fixture`, `live_provider`, or `browser_ui`. |
| `verified_live` | Derived by the validator from API response, persisted session metadata, environment metadata, and provider metadata. It is not accepted as a manually supplied value. |
| `ui_verified` | Derived by the UI verifier from live session URLs and DOM counts. It is not accepted as a manually supplied value. |
| `provider_names` | Derived from extraction metadata and validated against fixture/mock names. |
| `session_ids` | Derived from persisted extraction sessions. Required for UI verification. |
| `source_providers` | Must match extraction metadata from the service. |
| `blocking_issues` | Empty only when the result is genuinely usable. |
| `public_improvement_claim` | `true` only when live and UI evidence both support it. |

## Data Flow Boundary

The extractor and evaluator must be separated.

```text
Live extractor:
  input: YouTube URL only for each extraction call
  may use: YouTube metadata, public description, public comments, public captions, configured Gemini fallback allowed by contract
  must not use: Recipio reference, fixture expected ingredients, fixture expected steps

Evaluator:
  input: persisted live extraction output + optional Recipio/reference comparison
  may compute: ingredient score, step score, gaps, UI mismatch
  must not feed reference data back into extraction
```

This boundary is the main anti-shortcut rule. If the same script both supplies expected answers and runs extraction, it cannot produce live evidence.

Implementation guardrails:

- The live extractor and evaluator must be different entrypoints or commands.
- The live extractor corpus may contain only YouTube URLs. Optional labels, expected ingredients, expected steps, Recipio scores, Recipio URLs, reference recipe text, and hand-written video metadata are not allowed in the extractor input file.
- If a report needs video ID or title, it must use the values returned by the service or stored session, not values supplied by the smoke input file.
- The live extractor source/import graph must not read or import from `tests/**`, `.omx/artifacts/**`, Recipio reference fixtures, parity fixtures, or report outputs.
- A static check must fail if the live extractor imports files whose path includes `fixture`, `parity`, `recipio-reference`, `expected`, or `.test.`
- The evaluator can read reference data only after the live extractor has written immutable extraction output. "Immutable" here means the evaluator gets a saved report file or session ID and cannot call back into extraction with reference data.
- If one script combines extraction and reference scoring in the same process, its output cannot be `run_mode=live_smoke`.

## Live Provenance Authority

`verified_live` is not a field that a report author may decide. It must be recomputed by a validator.

Validator inputs:

- current process environment snapshot with secret values redacted
- package script or command name that launched the run
- API response from `POST /api/v1/recipes/youtube/extract`
- persisted `youtube_extraction_sessions` row
- if direct DB access is unavailable, a server-generated export created from that persisted row, with the same session ID and extraction metadata
- `extraction_meta_json.source_providers`
- provider names and provider statuses
- session IDs used by the UI verifier

Validator rules:

- `verified_live=true` only if the run is non-test, fixture provider is off, provider names are clean, live session IDs exist, and the report rows can be matched back to persisted extraction sessions.
- `provider_names` and `session_ids` are ignored if they appear only as hand-written report fields without matching persisted evidence.
- Any mismatch between API payload, persisted session metadata, and report rows makes the row `inconclusive`.
- `public_improvement_claim=true` is allowed only when the validator derives both `verified_live=true` and `ui_verified=true`.

## Execution Phases

### Implemented Guardrails

Implemented commands:

```bash
pnpm youtube:smoke:live -- --set recipio-12
pnpm youtube:smoke:ui -- --report <live-smoke-report.json>
pnpm youtube:smoke:validate -- <report.json>
```

Implemented files:

| File | Role |
| --- | --- |
| `scripts/validate-youtube-live-extraction-report.mjs` | Recomputes `verified_live` / `ui_verified`, rejects fixture/test/parity/mock provenance, rejects reference-answer fields in live rows, and checks live extractor source imports. |
| `scripts/youtube-live-smoke.mjs` | URL-only live smoke wrapper. It passes only YouTube URLs into the existing real app-route smoke and validates the resulting report. |
| `scripts/youtube-live-smoke-recipio-12-urls.json` | URL-only 12-video corpus. It intentionally contains no titles, expected ingredients, expected steps, Recipio URLs, or scores. |
| `scripts/youtube-smoke-ui.mjs` | Builds a separate `ui_capture` report from DOM-count evidence collected during the live browser smoke. |
| `scripts/youtube-real-app-route-smoke.mjs` | Existing real browser smoke, now with live manifest fields, fixture-provider environment guard, persisted session provenance export, and minimal UI count evidence. |

Important limitation:

- `youtube:smoke:ui` currently verifies the minimal DOM count evidence captured by the live browser smoke. The app does not yet expose a stable route that reopens an existing `youtube_extraction_sessions` draft by session ID alone, so the verifier does not independently reconstruct the review screen from only a session URL.

### Phase 1. Governance And Naming Guard

Goal: Make the previous failure impossible to miss.

Tasks:
- Add a tracked engineering plan, this document.
- Rename or clearly label any fixture-derived report path in future work.
- Define canonical report naming:
  - `youtube-fixture-replay-<timestamp>.json`
  - `youtube-live-smoke-<timestamp>.json`
  - `youtube-ui-capture-<timestamp>.json`
- Add a rule that any `after-improvement` summary must include a live smoke manifest and UI capture manifest.

Acceptance:
- A reader can tell from the file name and JSON root whether the result is fixture, live, or UI.

### Phase 2. Anti-Fixture Report Validator

Goal: Fail closed before a fixture report is presented as live.

Tasks:
- Implement a validator for report manifests.
- The validator fails if:
  - `run_mode=live_smoke` and `NODE_ENV=test`
  - `run_mode=live_smoke` and `HOMECOOK_YOUTUBE_FIXTURE_PROVIDER` is not `0`
  - provider names match `/fixture|mock|parity|test/i`
  - artifact producer path ends with `.test.ts`
  - `verified_live=true` but no live session IDs exist
  - `public_improvement_claim=true` but `ui_verified=false`
- The validator recomputes `verified_live` and `ui_verified`; it does not trust these fields from the report.
- Add an import/static check for the live extractor entrypoint so it cannot read test fixtures, Recipio reference answers, or prior report artifacts.
- Add unit tests for each failure case.

Acceptance:
- A fixture replay report cannot pass as live even if its scores are high.

### Phase 3. Live 12-Video Smoke Harness

Goal: Run the actual local service against the 12 YouTube URLs without answer keys.

Tasks:
- Build or identify a non-test script that calls the same local API path a user uses, ideally `POST /api/v1/recipes/youtube/extract`.
- Keep the live extractor command separate from the evaluator/scoring command.
- Use an input allowlist that has only YouTube URLs. Video ID and title must be service-derived after extraction.
- Existing starting point to inspect: `scripts/youtube-real-app-route-smoke.mjs` and `pnpm smoke:youtube-real-app-route`.
- Force live environment checks before running:
  - `NODE_ENV` must not be `test`
  - `HOMECOOK_YOUTUBE_FIXTURE_PROVIDER=0`
  - feature flags and provider keys must be present or the run is blocked
- Save only allowed structured output:
  - extraction session ID
  - title, video ID, YouTube URL
  - top-level ingredients and steps
  - candidate counts
  - source providers and fallback reasons
  - blocking issues
  - provider status and timeout reason
- Do not persist raw video, raw frames, raw provider responses, API keys, secrets, or Recipio data.

Acceptance:
- If `노오븐 라따뚜이` returns 0 ingredients and 0 steps in live mode, the report says exactly that and gives a low or blocked live score.
- If providers are unavailable, the report says blocked/inconclusive and does not substitute fixture data.

### Phase 4. Browser/UI Verification

Goal: Show the user the real result screen, not a generated fixture HTML page.

Tasks:
- Start the local app with the same environment used for live smoke.
- Open one tab per live extraction session.
- Capture `visible_ui_counts` from the DOM or page text:
  - ingredient count
  - step count
  - candidate count if multi-recipe
  - blocking/warning state
- Compare UI counts to live report counts.
- Mark `ui_verified=true` only if they match.
- Store minimal UI evidence:
  - DOM counts
  - relevant ingredient/step text snippets
  - optional cropped screenshot of only the extraction result section
- Do not store screenshots or DOM extracts that include:
  - Recipio/reference comparison panels
  - raw provider payload
  - YouTube video frames or iframes
  - secrets or API keys

Acceptance:
- The 12 tabs are backed by live session IDs.
- A page showing `재료 0개 / 만들기 0단계` cannot receive a higher UI score than Recipio or any reference score.

### Phase 5. Scoring Separation

Goal: Stop answer-key scores from being mixed with live results.

Tasks:
- Keep separate score fields:
  - `fixture_replay_score`
  - `real_smoke_score`
  - `ui_visible_score`
  - `reference_score`
- Summary tables must use only `real_smoke_score` and `ui_visible_score` for user-facing quality claims.
- `fixture_replay_score` can appear only in an internal regression section labeled as such.
- Candidate-level scores stay separate from top-level single recipe scores.

Acceptance:
- Aggregate score code cannot average fixture and live scores.
- A high fixture score cannot change a low live or UI score.

### Phase 6. Separate Docs-First Visual/OCR Contract Track, Not Approved Here

Goal: Keep broader visual recipe extraction out of this execution plan unless the user explicitly approves a separate contract-evolution task.

Tasks:
- If the next implementation truly needs Gemini video/OCR to extract ingredients and steps, first update official source-of-truth docs through `contract-evolution`.
- Define:
  - provider name and provenance fields
  - what structured evidence can be stored
  - what raw data must not be stored
  - user review requirements for visually inferred ingredients/steps
  - cost, quota, timeout, and cache rules
- Only after that PR merges, implement or enable broader visual recipe fallback.

Acceptance:
- Visual/OCR recipe ingredient and step extraction is either officially allowed and gated, or explicitly reported as `contract_blocked`.
- This plan does not itself approve or implement visual/OCR recipe ingredient or step extraction.

## Test Plan

### Unit Tests

Targets:
- report manifest validator
- source provider validation
- score aggregation separation

Must cover:
- `live_smoke` report generated from `.test.ts` fails
- provider name `parity-visual-recipe-provider` fails for live
- `verified_live=true` without session IDs fails
- `public_improvement_claim=true` without `ui_verified=true` fails
- fixture score cannot be used as live score
- report-supplied `verified_live=true` is ignored unless validator can derive it
- live extractor import graph fails when it reads `tests/**`, `.omx/artifacts/**`, or reference answer files

### Integration Tests

Targets:
- YouTube extraction report generation
- scoring/report separation

Must cover:
- fixture replay still works as regression coverage
- live smoke report schema cannot be produced from fixture replay
- multi-candidate results keep top-level and candidate scores separate

### Live Smoke

Command shape to implement:

```bash
HOMECOOK_YOUTUBE_FIXTURE_PROVIDER=0 pnpm youtube:smoke:live -- --set recipio-12
```

Must prove:
- the run is not `NODE_ENV=test`
- providers are live or explicitly unavailable
- each row has session IDs or a blocked reason
- no expected ingredients/steps file is imported by the extractor
- live extraction and reference scoring are separate commands or processes

### Browser Verification

Command shape to implement:

```bash
pnpm youtube:smoke:ui -- --report <live-smoke-report.json>
```

Must prove:
- each tab URL maps to a live extraction session
- DOM counts match report counts
- UI evidence is limited to counts, relevant text snippets, or cropped result-section screenshots
- UI evidence does not include Recipio/reference panels, YouTube video frames, provider payloads, or secrets

### Review Gate

Claude or human review must check:
- no fixture/mock/parity provider in live report
- no Recipio data in extraction input
- no video-id/title-specific extraction rule
- no public claim without live and UI evidence
- no visual/OCR recipe contract bypass
- no self-attested live fields accepted without persisted session provenance

## Numeric Gates

| Gate | Required Result |
| --- | --- |
| Fixture as live | 0 allowed cases |
| `public_improvement_claim=true` without live evidence | 0 allowed cases |
| `public_improvement_claim=true` without UI evidence | 0 allowed cases |
| Mixed aggregate score | 0 allowed cases |
| Self-attested `verified_live` without persisted provenance | 0 allowed cases |
| Live extractor reads reference answer files | 0 allowed cases |
| Live provider unavailable | must be `blocked` or `inconclusive`, never `passed` |
| Top-level empty but candidate exists | must show separate candidate status, never fake a completed single recipe |

## Pre-Mortem

| Failure Scenario | How It Could Happen | Prevention |
| --- | --- | --- |
| Fixture report is renamed and reused as live | A script writes convincing HTML/JSON from tests. | Manifest validator rejects `.test.ts`, fixture provider names, and missing live session IDs. |
| Live smoke is skipped because credentials are missing | The executor uses fixture output to keep progress moving. | Missing provider config becomes `blocked`, not success. Discord/PR summary must say blocked. |
| Visual/OCR is quietly enabled outside contract | Existing code path is treated as proof that the contract allows it. | Phase 6 requires docs-first contract evolution before visual recipe extraction can be a public win. |

## Execution Staffing

Sequential `$ralph` route:
- Executor: implement report validator and live smoke harness.
- Test engineer: add validator and scoring separation tests.
- Verifier: run fixture, live, and UI checks and compare manifests.
- Architect: review data-flow boundary before visual/OCR contract work.

Parallel `$team` route:

| Lane | Agent | Scope |
| --- | --- | --- |
| Report integrity | executor | manifest schema, validator, tests |
| Live smoke | executor | non-test live harness and provider checks |
| UI verification | test-engineer | browser tabs, DOM count extraction |
| Contract review | architect | visual/OCR docs-first boundary |
| Final verification | verifier | evidence matrix and no-shortcut audit |

Suggested reasoning:
- Report integrity and contract review: high
- Live smoke and UI verification: medium/high
- Final verifier: high

## Done Definition

A future implementation is not done until all of these are true:

- Fixture replay report exists only as fixture evidence.
- Live smoke report exists or the run is honestly blocked.
- UI capture report exists for every claimed visible result.
- Summary table shows source layer for every score.
- Public claim is based only on live and UI evidence.
- No extractor code can see Recipio/reference answers before extraction finishes.
- Review explicitly checks the no-shortcut rules.
