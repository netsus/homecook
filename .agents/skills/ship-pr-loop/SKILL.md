---
name: ship-pr-loop
description: Split local repository changes into intentional content-based commits, push the current branch, open or update a GitHub PR, run local verification, wait for the current PR head CI checks, and merge only after review and all checks pass. Use when the user asks to "commit, push, make a PR, wait for CI, and merge", asks to ship local work end-to-end, or wants repeated delivery-loop automation.
---

# Ship PR Loop

## Overview

Use this skill to finish a local change set as a clean GitHub PR without losing scope control. The loop is: inspect, split commits by intent, verify locally, push, open/update PR, wait for CI on the current head SHA, review, then merge.

## Workflow

1. Inspect scope first.
   - Run `git status -sb`, `git diff --stat`, and targeted `git diff` reads.
   - Identify unrelated or user-owned changes. Do not stage unrelated files.
   - If the scope is impossible to separate safely, stop and explain the blocker.

2. Confirm the branch lane.
   - If branch intent tooling exists, run the project branch status/start command before edits or commits.
   - Do not work directly on protected base branches.
   - Keep the existing work branch when it already matches the task.

3. Split commits by content.
   - Group files by user-facing behavior or maintenance purpose, not by file type alone.
   - Prefer small commits such as `fix UI behavior`, `add regression coverage`, `document delivery workflow`.
   - Stage explicitly with file paths or `git add -p`; avoid `git add -A` unless the whole tree is confirmed in scope.
   - Use the repository's commit-message policy. In this repo, use Lore trailers when useful:
     `Constraint:`, `Rejected:`, `Confidence:`, `Scope-risk:`, `Tested:`, `Not-tested:`.

4. Verify before pushing.
   - Run the narrow tests that prove the change.
   - Run the project-required checks when practical: lint, typecheck, unit/product tests, and targeted E2E.
   - If a check fails, fix and rerun before publishing unless the failure is clearly unrelated and documented.

5. Review before merge.
   - Do a code-review pass over the final diff and test evidence.
   - Fix any critical or important finding before proceeding.

6. Push and open or update the PR.
   - Check `gh --version` and `gh auth status`.
   - Push with tracking: `git push -u origin $(git branch --show-current)`.
   - Use `gh pr view --json url,number,headRefOid` to find an existing PR.
   - If none exists, create one with a markdown body that includes summary, tests, risks, and notes for skipped items.
   - Default to draft only when the user has not asked to merge. If the user asked to merge after CI, mark the PR ready before waiting on checks.

7. Wait for current-head CI.
   - Capture the pushed commit SHA with `git rev-parse HEAD`.
   - Wait until GitHub reports checks for that exact PR head SHA.
   - Treat pending, missing, failing, or stale checks as not mergeable.
   - Use `gh pr checks --watch` or `gh pr view --json statusCheckRollup,headRefOid` loops.
   - If CI fails, inspect failing logs, fix locally, commit, push, and repeat from verification.

8. Merge safely.
   - Merge only after local verification, review, and current-head CI are passing.
   - Respect branch protection and repository merge style.
   - Prefer `gh pr merge --squash --delete-branch` unless the repository or user asks for another strategy.
   - After merge, report PR URL, commits, checks, merge result, and any remaining risks.

## Failure Rules

- Do not merge with failing, pending, absent, or stale CI.
- Do not silently include unrelated local changes.
- Do not rewrite or revert user changes unless explicitly requested.
- Do not skip review just because tests pass.
- Do not claim CI passed without naming the evidence source.
