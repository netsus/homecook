---
name: tdd-test-driven-development
description: Use a red-green-refactor cycle when the user requests test-first development or a change needs a regression test under the current repository rules. Ordinary low-impact edits do not automatically require new tests.
---

# Test-Driven Development

## Scope

The current repository AGENTS.md determines verification scope. Apply this skill when a regression test is needed or the user explicitly requests TDD. It does not require full test suites, CI, separate approval, or tests mirroring every new function.

For low-impact text, layout, documentation or configuration edits, choose the direct checks required by the repository. Do not ask for permission merely to omit an unnecessary test. Preserve mandatory regression coverage for authentication, authorization, ownership, state transitions and database changes.

## Red → Green → Refactor

1. Identify the observable behavior and the smallest relevant regression test. Reuse existing fixtures and test helpers.
2. Write the test and run it. Confirm it fails for the intended behavior, rather than a missing import, setup error or unrelated failure.
3. Make the smallest implementation change that satisfies the behavior and run the relevant tests again.
4. Simplify the changed code while preserving behavior. Repeat checks when new changes or failures justify them.
5. Report what was verified and any remaining limits. If implementation already exists, preserve it and add meaningful regression coverage rather than deleting working code solely to recreate test-first history.

## Test Quality

- Test user-visible behavior or meaningful invariants, not wording, internal structure or mock existence.
- Prefer real modules where practical; mock external boundaries only when needed for determinism.
- For asynchronous behavior, await observable completion rather than fixed delays.
- Cover relevant failure paths and boundaries without expanding unrelated scope.
- Keep test-only behavior out of production APIs.
- Do not claim a regression test caught the original failure unless that failure was observed.

Use the repository's actual runner and scripts. In Homecook, a selected product test can run with `pnpm exec vitest run --config vitest.product.config.ts tests/<related-test>.test.ts`.
