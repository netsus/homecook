# cooked-batch-weight-ui Stage 4 authority findings repair

## Scope and lineage

- task: `019fe9a4-f94c-7230-a1f7-9d0b8116d1c0`
- role: fresh Stage 4 authority findings repair author; not authority reviewer, Stage 5, final authority, Stage 6 or merge owner
- reviewed PR head/tree: `c9179cce6bc30134401fce770e41577b5d60e1b3` / `c81ca940844bef333d0a8323ed2b7ecea12af59b`
- authority report commit: `9a9630b5b699a9b6c48561b0bab60fbc7c02ae42`; successor lineage commit `9285f016c6f8245c2498158133860fcb570c396e`
- merged base: `origin/master` `11883fb790dbe4664ed5f409fd0b5cf55ee02f41`, tree `f687f4723cbbd9135de64d53fc2050a0a83d9df8`
- non-rebase merge commit: `cdff58d62617d41e829f0a14bc2b45f0d1385a3b`
- repaired implementation head/tree: `6aac3c194f9606df8269fcd42a9cfa9f974fa1f0` / `cc2ebc645214433dada8492141ba950b5035a9d8`
- branch: local successor `feature/fe-cooked-batch-weight-ui-authority-repair`; final push target remains `feature/fe-cooked-batch-weight-ui`
- Draft PR: [#1320](https://github.com/netsus/homecook/pull/1320); Ready/merge remain forbidden here

The repair changes only the existing frontend action sheet and tests/evidence. It adds no public field, error, status, action, endpoint, schema, dependency, backend write or direct DML. `CBW-CM-MIN-01` remains backlog; the shared footer was not changed.

## Authority finding closure

### CBW-LO-MAJ-01

- discard and negative adjustment now stop at an explicit second confirmation before the request is sent.
- the confirmation shows the authoritative current remainder, entered amount, local result guidance and entered reason.
- the result is labelled as pre-submit guidance; the final remainder/state remains determined by the existing server response.
- unweighed close shows the selected `consumed | discarded | mixed` result and explicitly requires confirmation that no gram weight, nutrition calculation or meal-log entry remains.
- confirmation back retains inputs. Existing opener focus restore, Escape close, pending Escape/dismiss lock and disabled duplicate submit remain intact.
- positive adjustment keeps its existing direct correction path because the authority finding requires the destructive negative path to receive the second step.

Evidence:

- `tests/cooked-batch-lifecycle-actions.test.tsx`
- `tests/e2e/slice-cooked-batch-weight-ui-evidence.spec.ts`
- `ui/designs/evidence/cooked-batch-weight-ui/LEFTOVERS-mobile-default-390-known-missing-unrecoverable.png`
- `ui/designs/evidence/cooked-batch-weight-ui/LEFTOVERS-mobile-narrow-320-actions.png`
- `ui/designs/evidence/cooked-batch-weight-ui/runtime-focus-keyboard-overflow.json`

### CBW-LO-MAJ-02

- only official existing names are mapped: `finished_weight_g`, `discarded_g`, `delta_g`, `reason`, `closure_reason`.
- unknown `error.fields[]` entries are ignored and create no new field or error contract.
- the alert summary receives focus; mapped controls receive `aria-invalid=true` and `aria-describedby` pointing to that alert.
- values remain present after the 422 response. A separate 409 flow also proves that the entered finished weight remains present.
- the 320 runtime flow exercises a real mocked 422 with `discarded_g` and `reason`, while the retained 409 flow remains covered independently.

Evidence:

- `tests/cooked-batch-lifecycle-actions.test.tsx`
- `ui/designs/evidence/cooked-batch-weight-ui/LEFTOVERS-mobile-narrow-320-pending-error.png`
- `ui/designs/evidence/cooked-batch-weight-ui/runtime-focus-keyboard-overflow.json`

## TDD and verification

RED was observed before implementation:

- focused Vitest: `1 passed / 4 failed`; the new tests could not find the second confirmation, explicit close consequences or field/error links.
- existing Playwright evidence: `1 failed / 1 passed / 2 intended skip`; the old flow waited for the removed generic checkbox instead of the new confirmation step.

GREEN at repaired implementation head:

- focused lifecycle Vitest: `5/5` pass
- related #11 Vitest: `4 files / 11 tests` pass
- canonical #11 Playwright: `2 pass / 2 intended skip`
- focused ESLint, TypeScript and `git diff --check`: pass
- exploratory QA/eval: score `93`, validation errors `0`, `52/63 covered`, `11/63 blocked`, new product findings `0`
- clean `pnpm verify:frontend`: exit `0`
  - lint/typecheck: pass
  - product Vitest: `227 files / 2,702 tests` pass; `11 files / 150 tests` intended skip
  - production build: pass; `78` pages
  - Lighthouse: `2 URLs × 3 runs` pass
  - full regression: `952 pass / 170 intended skip / 0 fail`
  - a11y: `18 pass / 15 intended skip / 0 fail`
  - visual: `23 pass / 22 intended skip / 0 fail`
  - security: `12 pass / 0 fail`

The first full verify attempt stopped on one unrelated `slice-18-manual-recipe-create` mobile-chrome concurrency failure (`951/170/1`). Its exact isolated rerun passed `1/1`, and the subsequent full clean invocation passed `952/170/0`; no unrelated product code was changed.

## Fresh visual/runtime evidence

- canonical manifest: `ui/designs/evidence/cooked-batch-weight-ui/manifest.json`
- captured at: `2026-08-10T03:50:08.157Z`
- implementation head/tree: `6aac3c194f9606df8269fcd42a9cfa9f974fa1f0` / `cc2ebc645214433dada8492141ba950b5035a9d8`
- PNGs: `15`; all were freshly generated, `12` remained byte-identical and `3` changed to show the authority repair
- runtime JSON: `2`
- original sizes inspected directly: `320`, `390`, and `1440` widths; the confirmation and 422 captures are native `320×568`, and the unweighed close capture is native `390×2296`
- existing COOK_MODE full-page contrast residual: exactly `2` nodes
- new #11 sheet/section selector-scoped serious/critical: `0`
- no page-wide-zero claim is made

## Authority validator tooling mismatch

The Draft successor command exits `0` because the validator gate is inactive for this branch context:

```text
pnpm validate:authority-evidence-presence -- --slice cooked-batch-weight-ui
authority evidence presence validation passed
```

The Ready-equivalent command reproduces the existing specification/tool mismatch and exits `1`:

```text
BRANCH_NAME=feature/fe-cooked-batch-weight-ui PR_IS_DRAFT=false pnpm validate:authority-evidence-presence -- --slice cooked-batch-weight-ui
Authority reports are missing required ui/designs/evidence/cooked-batch-weight-ui/runtime-focus-keyboard-overflow.json visual evidence.
Authority reports are missing required ui/designs/evidence/cooked-batch-weight-ui/runtime-axe-wcag.json visual evidence.
Authority reports are missing required ui/designs/evidence/cooked-batch-weight-ui/manifest.json visual evidence.
```

Affected source: `scripts/lib/validate-authority-evidence-presence.mjs`. Lines `141-143` reduce report refs to image extensions, while lines `273-283` compare every declared Stage 4 requirement—including runtime JSON and manifest—against that visual-only set. This product repair does not alter the validator or the authority report verdict/content. The orchestrator must decide whether to open a separate tooling repair before Ready.

## Pending and not claimed

- fresh independent authority rereview of this exact repaired implementation/evidence target
- independent Stage 5, final product-design authority and Stage 6
- physical keyboard, VoiceOver/TalkBack, real virtual keyboard/safe-area and full WCAG Manual checks
- server-Mac/OAuth, R/R+1/R+2 and capability activation
- shared `docs/workpacks/README.md` / `.workflow-v2/status.json` projection owned by the sequential #9/shared lane
- Ready transition, merge and Discord notification
