# Wave1 Prototype Repair Closeout

> 작성일: 2026-05-11 KST

## Frozen Reference

- Fixed prototype path: `ui/designs/prototypes/claude-design-260505-wave1`
- Fixed prototype implementation SHA: `9bf7a34c6b422d0c9981d4c2968e3350d5a28892`
- Freeze workpack: `docs/workpacks/wave1-prototype-repair`
- Service porting plan: `docs/workpacks/wave1-service-porting-plan.md`

`9bf7a34c6b422d0c9981d4c2968e3350d5a28892` is the last merged commit that changed the prototype implementation during the 2026-05-11 repair and follow-up sequence. It supersedes the initial Repair 4 freeze reference (`95a93180a1329d2b317a561aa7c954a39cbe104c`), the earlier follow-up freeze reference (`0000c86a7d6f719e2bb1c0966c6d1e307061df7c`), the final QA reference (`c83a851f95e358cf07f5a21c6f413ee091a3d2be`), and the previous planner polish reference (`4b49e05906c998fe83f68a2fa374bf53b7079291`) because the user provided additional prototype-finalization changes after PR #390, after PR #394, after PR #398, and after PR #403. Later service porting prompts must pin the SHA above as the read-only visual/layout reference for the prototype files.

## Merged Repair PRs

| Repair | PR | Merge Commit | Scope |
| --- | --- | --- | --- |
| Repair 0 | #386 | `268893953f9b831c299e0378cfab8863b6b8a858` | Navigation and return context |
| Repair 1 | #387 | `d351ab1405d979d8bf1f6db305a9594b618c070f` | Modal and interaction fixes |
| Repair 2 | #388 | `0d36d871f71a797d61f8e50604f2190bd6e6500e` | Screen visual corrections |
| Repair 3 | #389 | `95a93180a1329d2b317a561aa7c954a39cbe104c` | Functional logic fixes |
| Repair 4 | #390 | `e5c897201cea6b641b5e811f992610c256c4f2c3` | Initial freeze gate |
| Follow-up planner polish | #391 | `c89f71aa590b37f7eb45c0ba954b2c449ed9fc10` | Planner layout/color polish |
| Follow-up settings/layout | #392 | `43f65e33782c489b48d67c4b4c76267566f7130e` | Pantry and settings layout polish |
| Follow-up menu/leftovers | #393 | `9ba3740b2bab07e7540f7206ec064a0ac0493724` | Menu add, manual input, leftovers flow |
| Follow-up shopping flow | #394 | `0000c86a7d6f719e2bb1c0966c6d1e307061df7c` | Per-meal shopping and completion flow |
| Final manual-create validation | #396 | `28d114dcdc4bf750ce7841f5f8c42c69bb394abc` | Required manual recipe field validation |
| Final settings account split | #397 | `fa2a64a1e5c0548ec946d9a417333671a8572c30` | Settings dirty-state and account action relocation |
| Final leftovers targeting | #398 | `c83a851f95e358cf07f5a21c6f413ee091a3d2be` | Leftover add-to-planner target selection by entry path |
| Final follow-up freeze 2 | #399 | `cf1b303283d08c6df7e10e0b4dd5e8b47aedc53d` | Freeze after final QA repairs |
| Final modal sheet unification | #400 | `9d096c677274dce266318b0c383f8a1c82c02d14` | White bottom-sheet modal unification |
| Final planner week rail snap | #401 | `4fc940ca8e69528755300c88c1f95a1467775eef` | Seven-card week rail fit and next-week snap |
| Final planner row density | #402 | `4b49e05906c998fe83f68a2fa374bf53b7079291` | Compact meal rows and planner border cleanup |
| Final follow-up freeze 3 | #403 | `b8f9bf7304a0e7d4b36b8452297f783b26f48009` | Freeze after modal and planner polish |
| Final planner color density polish | #404 | `9bf7a34c6b422d0c9981d4c2968e3350d5a28892` | Home-theme planner colors and final row density |

## Evidence

Smoke evidence:

- Repair 0: `prototype Repair 0 navigation smoke OK`
- Repair 0 desktop: `prototype Repair 0 desktop navigation smoke OK`
- Repair 1: `prototype Repair 1 mobile modal smoke OK`
- Repair 1: `prototype Repair 1 save modal smoke OK`
- Repair 1: `prototype Repair 1 save/pantry smoke OK`
- Repair 1 desktop: `prototype Repair 1 desktop modal smoke OK`
- Repair 2: `prototype Repair 2 visual smoke OK`
- Repair 3: `prototype Repair 3 functional smoke OK`
- Follow-up planner polish: Playwright 390px/320px planner smoke
- Follow-up settings/layout: Playwright mobile settings and pantry-add smoke
- Follow-up menu/leftovers: Playwright mobile menu-add/manual-create/leftovers smoke and desktop menu-add smoke
- Follow-up shopping flow: Playwright mobile per-meal shopping and existing shopping-detail completion smoke
- Final manual-create validation: Playwright mobile and desktop blank ingredient amount / blank cooking step smoke
- Final settings account split: Playwright mobile and desktop settings dirty-state / account action smoke
- Final leftovers targeting: Playwright mobile My Page target selection, planner-origin serving-only smoke, and desktop target selection smoke
- Final modal sheet unification: Playwright mobile My Page leftovers planner-add smoke, mobile Recipe Detail planner-add smoke, planner-origin serving-only smoke, and desktop meal-add smoke
- Final planner week rail snap: Playwright 390px/320px rail fit smoke and next-week snap smoke
- Final planner row density: Playwright 390px row density/border smoke
- Final planner color density polish: Playwright 390px final polish smoke, 320px rail/color smoke, and desktop planner summary color smoke

Screenshot evidence:

- Repair 2 390px: `.omx/artifacts/wave1-repair2/repair2-390-*.png`
- Repair 2 320px: `.omx/artifacts/wave1-repair2/repair2-320-*.png`
- Repair 3 390px: `.omx/artifacts/wave1-repair3/repair3-390-*.png`
- Repair 3 320px: `.omx/artifacts/wave1-repair3/repair3-320-*.png`
- Follow-up planner polish: `.omx/artifacts/wave1-repair5/planner-*.png`
- Follow-up settings/layout: `.omx/artifacts/wave1-repair8/*.png`
- Follow-up menu/leftovers: `.omx/artifacts/wave1-repair6/*.png`
- Follow-up shopping flow: `.omx/artifacts/wave1-repair7/*.png`

Mirror file check:

```bash
diff -q ui/designs/prototypes/claude-design-260505-wave1/index.html ui/designs/prototypes/claude-design-260505-wave1/homecook-baemin-prototype.html
```

Final local validation:

```bash
git diff --check
pnpm validate:branch
pnpm validate:workflow-v2
pnpm validate:workpack -- --slice wave1-prototype-repair
```

## Service Porting Gate

Service Slice A~F porting may start only after this closeout is merged.

All service porting prompts must include:

- `fixed_prototype_path=ui/designs/prototypes/claude-design-260505-wave1`
- `fixed_prototype_implementation_sha=9bf7a34c6b422d0c9981d4c2968e3350d5a28892`
- `visual_layout_source_of_truth=fixed prototype`
- `functional_source_of_truth=MVP service implementation + official docs`

Do not copy prototype demo behavior into the MVP service. The repaired prototype is a visual/layout and reference-flow artifact. Service routes, submit behavior, auth, persistence, API wrappers, read-only rules, and status transitions remain sourced from the current MVP implementation and official docs.

## Guardrails

- Prototype Repair 0~4 and follow-up repairs stayed out of MVP service source.
- No API, DB, status, endpoint, or field was added.
- No dependency was added.
- Broken/demo-only prototype behavior identified by the user was either repaired in the prototype or fenced off from service porting semantics.

## Contract Candidates From Follow-Up Repair 7

These notes are **not** official contract changes. They record prototype behavior that service porting must compare against current official docs before implementation:

- Per-meal shopping creation: when a user starts shopping from a specific meal card inside `MEAL_SCREEN`, the creation flow should carry `date`, `slot`, and `mealIndex` so only that meal's ingredients are included.
- Shopping completion from create/review: completing Step 2 should persist or upsert a shopping list, mark it completed, open the pantry-reflection choice, and route to the completed read-only detail screen under the modal.
- Completed shopping detail: completed lists should remain read-only in the prototype flow; reopening or item mutation is not part of the repaired reference behavior.

## Residual Risk

- Actual service visual parity is not complete yet. It is deferred to service Slice A~F re-porting.
- Screenshot artifacts are local ignored evidence under `.omx/artifacts`; service slices must capture fresh reference and service screenshots in their own evidence flow.
- The fixed prototype SHA should remain pinned until the user explicitly approves a newer prototype revision.
