# PR #1323 Ready Linux visual baseline repair evidence

## Identity and scope

- evidence generator task ID: `019fec78-54f5-7052-aec0-65814f7ec452`
- delegated source task ID: `019fe028-be31-76f2-a5a7-986000a93374`
- role: fresh independent evidence generator and Linux visual baseline repair author; not Stage 5, final authority, Stage 6, Ready/merge supervisor, or self-approver
- model / effort: `GPT-5.6-Sol` / `high`
- Claude use: none
- source PR / run / job: PR #1323 / QA run `31405628297` / visual job `93511223752`
- exact starting head / tree: `cc1d94e3e6bcd7cb4df81f2a8edf60555f009054` / `486059ad24d7a993e98f89092c8d6677f5bbf7ad`
- requested local-only ref: `codex/pr1323-linux-visual-baseline-repair`

This repair changes only the two stale Linux Playwright screenshot baselines and this evidence report. It does not change product code, test logic, thresholds, retries, Darwin snapshots, manifest/runtime evidence, official contracts, closeout projections, dependencies, or automation requirements. It performs no push, PR edit, Ready transition, merge, Discord notification, production/remote DB/server-Mac/OAuth work, R/R+1/R+2, or capability activation.

The worktree initially matched the requested tuple, was detached, and was clean. The repository branch-intent tool rejects the requested `codex/*` prefix, so the requested local ref was created at the exact source head and the repository-supported temporary intent `fix/pr1323-linux-visual-baseline-repair` was declared at the same tuple. Final handoff returns the worktree to detached/clean and leaves the requested `codex/*` ref pointing at the local repair commit.

## GitHub failure and artifact provenance

Read-only GitHub inspection confirmed:

- QA run `31405628297` was a `pull_request` run for exact head `cc1d94e3e6bcd7cb4df81f2a8edf60555f009054`.
- Visual job `93511223752` failed only in the full visual suite; artifact upload succeeded.
- Result: `2 failed / 21 passed / 22 skipped`.
- `qa-leftovers-ready.png`: expected `1280x1002`, actual `1280x1433`, `50,149` differing pixels, ratio `0.03`.
- `qa-leftovers-empty.png`: expected `1280x733`, actual `1280x970`, `11,155` differing pixels, ratio `0.01`.
- Both failures persisted through the initial attempt and two retries.
- Artifact `playwright-visual-report` ID `9069560932` was current and unexpired; GitHub recorded archive digest `sha256:ecdf06afddc79f83ea2532d6c7d31c01f34d693dca0db671540b1dd7618533f3`.
- The three ready actual files were byte-identical at SHA-256 `0642b76e59e27529e4afa74c2a9e0773d9c362cf775e314e937fdd92059c0588`.
- The three empty actual files were byte-identical at SHA-256 `a9f86b148c93de4f65e0a2e9c2a3a11f292dfc5e172e09474dd3f403fb648036`.

Git history explains the drift: the Linux leftovers baselines last changed in `a0a52faff81b4f6ba9991b1ad5785ee33059bb8b` on 2026-07-12, while `86a71dee01814cf7a220fcb4c919401dad0aaa8a` added the cooked-batch lifecycle UI and updated only the Darwin leftovers baselines on 2026-08-10.

## Pre-replacement original-size visual inspection

The Linux actual ready/empty images, current Linux expected images, Darwin baselines, diff images, approved `LEFTOVERS-desktop-state-matrix.png`, current LEFTOVERS design, Stage 5 report, final authority report, and Stage 6 evidence were inspected directly at original size before replacement.

The CI actual ready image is healthy:

- header, `남은 요리 3개`, safe `다먹은 요리` action, and footer are fully visible;
- the approved two-section hierarchy `남은요리 관리` → `중량·잔량 기록` is present;
- all three legacy cards are complete and readable;
- the cooked-batch card shows authoritative finished/remaining grams, nutrition availability, neutral `양 조정`, and distinct destructive `버림`;
- there is no horizontal clipping, truncated content, wrong state, duplicate section, or missing bottom content.

The CI actual empty image is also healthy:

- `남은 요리 0개`, `남은 요리가 없어요`, safe return action, `중량·잔량 기록이 없어요`, and footer are all visible;
- the legacy empty state and cooked-batch empty state remain separate;
- there is no clipped CTA, wrong ready content, or hierarchy regression.

The Darwin approved images express the same state, content hierarchy, and actions. Linux differs only in platform font/emoji rasterization and the resulting ready full-page height (`+17px` versus Darwin); empty has the same `1280x970` dimensions as Darwin. The stale Linux files visibly predate the approved two-section UI and cooked-batch content.

```json
{
  "score": 98,
  "verdict": "pass",
  "category_match": true,
  "differences": [
    "Linux uses platform-specific Korean font and emoji rasterization compared with the Darwin reference.",
    "The Linux ready full-page image is 17px taller than Darwin while preserving the same complete hierarchy and content."
  ],
  "suggestions": [
    "Replace only the two stale Linux baselines with the retry-stable CI actual PNG bytes."
  ],
  "reasoning": "Both CI actuals faithfully render the approved LEFTOVERS ready and empty UI without clipping, wrong state, or hierarchy regression; the failure is stale platform-specific baseline data."
}
```

The visual-verdict state file was not written under `.omx/state` because this repair has an explicit three-file allowlist; the structured verdict is preserved here instead.

## Exact baseline replacement

| Snapshot | Old dimensions | Old SHA-256 | New dimensions | New SHA-256 |
| --- | ---: | --- | ---: | --- |
| `qa-leftovers-ready-desktop-chrome-linux.png` | `1280x1002` | `4eefaa38cf59ff59402187b5675a0e419ceb3773b86ce09d691e1fb8a106b09a` | `1280x1433` | `0642b76e59e27529e4afa74c2a9e0773d9c362cf775e314e937fdd92059c0588` |
| `qa-leftovers-empty-desktop-chrome-linux.png` | `1280x733` | `d44021ac1f026706c9fce55207634afecd9b2488e6f471de8c5803be10a08b0f` | `1280x970` | `a9f86b148c93de4f65e0a2e9c2a3a11f292dfc5e172e09474dd3f403fb648036` |

The replacement files are exact byte copies of the retry-2 CI actuals, and post-copy SHA-256 comparison matched source and destination byte-for-byte.

Darwin comparison remains unchanged:

| Darwin baseline | Dimensions | SHA-256 |
| --- | ---: | --- |
| `qa-leftovers-ready-desktop-chrome-darwin.png` | `1280x1416` | `130c9888fb62c27d11b4dfe15a9ba602b5fdcaf9e1ff64aa7162effe0c1eb829` |
| `qa-leftovers-empty-desktop-chrome-darwin.png` | `1280x970` | `edad91b9b576a893312567bb00701ceb0412b16722298427e8571cd04d2c750c` |

## Verification

- `pnpm install --frozen-lockfile`: passed; package and lockfile were unchanged.
- focused local visual spec, `desktop-chrome`, exact ready/empty grep: `2 passed` against the unchanged Darwin baselines.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed.
- branch, source-of-truth, workpack, automation-spec, workflow-v2, OMO bookkeeping, and authority-evidence-presence validators: passed.
- original-size post-copy image inspection: passed; both Linux targets retain the healthy CI actual pixels.
- source/destination SHA-256 equality: passed for both files.
- retry stability: passed; all three CI actual captures per state were byte-identical.
- snapshot inventory: both exact Darwin/Linux ready and empty pairs remain present; no unrelated snapshot was added, removed, or changed.
- allowed-file diff and `git diff --check`: passed before commit.

The dependency install and local Playwright run created only ignored local setup/test output. `node_modules`, `.next`, `test-results`, `playwright-report`, and the downloaded GitHub artifact directory were moved out of the worktree into the recoverable Trash folder `/Users/shj/.Trash/pr1323-visual-repair-019fec78`; the unrelated pre-existing `.artifacts` directory was preserved.

The local macOS runner cannot execute or validate the `desktop-chrome-linux` snapshot path without faking the platform. The next real GitHub Linux visual job at the repair publication head is the final platform proof. No threshold, retry, project, snapshot name, viewport, or platform detection was weakened to manufacture a local pass.

## Remaining Manual and lifecycle boundary

The existing Manual obligations remain unchanged:

- actual OS virtual-keyboard occlusion, resize, and scroll-to-active-field behavior;
- physical keyboard Tab / Shift+Tab / Escape timing;
- VoiceOver / TalkBack reading order, names, descriptions, focus, and live announcements;
- physical-device 320px/390px safe area and browser chrome;
- full WCAG conformance, including the two inherited COOK_MODE full-page contrast residual nodes;
- real authentication and other-owner accounts;
- server-Mac/OAuth and production/remote DB behavior;
- R/R+1/R+2 and capability activation.

This evidence author does not approve its own repair publication successor. PR #1323 Ready, merge, broader lifecycle completion, Manual verification, and activation remain outside this local-only task.
