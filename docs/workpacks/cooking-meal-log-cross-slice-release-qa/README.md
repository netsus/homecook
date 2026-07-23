# cooking-meal-log-cross-slice-release-qa

## Goal

F0와 #1~#13에서 닫은 계정 세대, 제품 검색·재료 연결, private recipe/snapshot, 미래 계획, cooked batch, meal log, Planner/COOK_MODE/legacy 계약을 하나의 verification-only 최종 release gate로 재검증한다. exact repaired head에서 local/remote DB·API·browser·security·performance·design·rollback evidence와 모든 started check가 green이어야 하며, 발견한 defect는 이 slice에서 inline 수정하지 않고 별도 TDD repair PR로 봉합한 뒤 전체 증거를 다시 만든다.

## Official Sources

- `docs/요구사항기준선-v1.7.22.md`
- `docs/화면정의서-v1.5.28.md`
- `docs/유저flow맵-v1.3.25.md`
- `docs/db설계-v1.3.23.md`
- `docs/api문서-v1.2.27.md`
- approved plan SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d`, 1,018 lines

## Verification-Only Boundary

- this slice adds no endpoint, field, status, error, migration, runtime feature, UI composition or dependency.
- F0 and #1~#13 Stage 1 docs are merged. Runtime verification starts only after all predecessor implementation/closeout PRs are merged and their current-head checks are green.
- each train's evidence may be reused only when it records the exact release/head/window and still applies to the final repaired head. Stale, absent, fixture-only or different-head evidence is not a final pass.
- any runtime defect opens a small separate TDD repair PR. After merge, affected local/remote DB, browser, security, performance, design and rollback evidence is rerun on the new exact head.
- production-safe read-only verification never permits writes. Production/staging/provider writes remain zero unless a separately authorized Manual Only operation explicitly permits a scoped mutation.

## Final Evidence Contract

### Security function and principal inventory

- inventory every application-owned trusted-schema function and every SECURITY DEFINER exact signature regardless of schema. Each signature maps 1:1 to control class, effect, exposure and exact principals.
- application-controlled mutations keep PUBLIC/anon execution false and a safe search path with `pg_temp` last and no writable untrusted schema. Owner-self, service-only, taxonomy server-only and `auth-hook-internal` remain distinct.
- re-run anonymous checksum-unchanged/`42501` negatives for the application mutation set, authenticated A/B isolation, taxonomy direct denial plus verified server success, no-key fallback denial and new-signature ACL/search-path lint.
- provider/extension-managed functions retain immutable owner, extension/version, ACL, `proconfig` and exposure baselines. Non-exposed provider schemas remain absent from the Data API and actual anon/authenticated RPC attempts fail; an exposed provider mutation blocks release until a supported mitigation exists.
- F0 Hook wrapper/guard verifies exact `supabase_auth_admin` schema USAGE and EXECUTE only, dedicated NOLOGIN guard-owner SELECT-only privileges, no non-admin membership/`SET ROLE`, legacy/maintenance/generation-active behavior and fail-closed email/OAuth admission.

### Account generation, cutover and image cleanup

- every personal writer and account delete verifies the JWT session binding and expected account generation under the common owner lifecycle lock; G1 delayed/revoked requests cannot write into G2.
- fresh/replay cutover covers volatile shared fence, maintenance 503, Auth Hook admission freeze, auth/public/personal staging, final count+digest CAS, quarantine classification/resolution and atomic canonical promote. Failed pre-promote attempts leave canonical rows at zero and remain retryable in legacy mode.
- account cleanup follows the real FK order `pointer → event/meal log/idempotency → claim → session-meal/session → Meal → batch → private content/nutrition snapshot → private recipe → private product references/link/version/profile/product`. Public/shared rows remain owner-neutral or anonymized as contracted.
- personal images remain private and generation-bound. Quota, lease/takeover/finalize CAS, server cancel, first-404 awaiting recheck, permanent tombstone, ordered scanner/recheck/drain/owner-zero/Auth-delete/complete and dead-letter blockers are replayed.
- legacy image visibility migration preserves current/immediate-previous readers and old-path rollback. Legacy orphan inventory is positive-reference/report-only and enqueues or deletes zero objects.

### Recipe, snapshot, product and planner

- public recipe fork keeps the original immutable; owner private create/PATCH/soft DELETE uses the single-RPC owner→recipe boundary and private/deleted tags never leak through RLS, PostgREST, tag/theme/search/cache/usage paths.
- content snapshot is the logical authority and pins one exact nutrition snapshot without a duplicate nutrition vector. Compatibility direct values are null-or-equal rollback mirrors until the separately approved contract step; old binaries below the rollback floor are rejected afterward.
- future-plan preview binds owner/session generation, base revision, proposed content hash, target Meal revisions and active claims. `replace_all` is all-or-nothing 409 on stale/claim; `keep` preserves existing pins; completed shopping remains read-only.
- the 287,041-row local product catalog keeps no-runtime-provider-search, source/moderation/owner boundaries and stable integer-tuple cursors. Unified food search is one server-ranked typed-union cursor without client merge.
- approved primary product→ingredient projection preserves product identity and exact nutrition version while enabling effective pantry matching; no brand product identifier is inserted into ingredient synonyms.
- `PLANNER_WEEK` separates `요리 계획 | 식사 기록`, removes new product-planner/nutrition UI producers and preserves legacy pinned product read/detail/owner-delete without automatic expiry.

### Cooking, batch and meal log

- `/sessions` legacy-v1 and `/session-attempts` snapshot-v2 dispatch only by stored contract version. Optional stable-key rollout, no-key-zero before mutation-zero 428, flag-off R/R+1 seeded-v2 drain, rollback drain and strict-v1 tombstone prerequisites remain separate.
- planner start and recipe propagation use the same owner→recipe→Meal lock order and active claim. v2 completion validates exact owner pantry row/product/effective ingredient and removes only selected rows.
- cooked batch pins content only. Missing/known/unrecoverable weight, append-only quantity/lifecycle events, adjustment bounds, weighted/unweighed consumed/discarded/mixed closure, non-reversible `marked_unrecoverable`, concurrent consume and full replay all match the ledger projection.
- each meal-log batch entry points to its own active consumption event. PATCH/DELETE reverses only that event regardless of order, retains other entries and recomputes the entire batch projection.
- day/meal aggregates use exact batch, product-version/basis or ingredient profile/conversion evidence. Missing conversion returns 422 instead of guessed nutrition; record-time IANA timezone and local date never regroup after a device timezone change.
- only consumed/consumed-unweighed first depletion grants eaten/auto-hide/XP once. Discarded/mixed states do not; reversal preserves earned activity while source uniqueness blocks a second grant.

### Real DB, browser, performance and legacy

- fresh local Supabase full migrations, replay, real Postgres/RLS/PostgREST/Auth/Storage, user A/B isolation and target digests must pass. Isolated or fixture-only evidence is supplemental, not a substitute.
- search 287,041 rows, product relation, personal recipe propagation, batch ledger and meal-log aggregate form one end-to-end evidence chain with measured SQL/route latency, EXPLAIN and no item-level N+1 or unexplained regression.
- real Chrome covers `ACCOUNT_QUARANTINE`, `HOME`, `RECIPE_DETAIL`, `MANUAL_RECIPE_CREATE`, `PLANNER_WEEK`, `COOK_MODE`, `LEFTOVERS` and `MEAL_LOG` at 390px, 320px and desktop, including loading/empty/error/unauthorized/read-only/partial/unavailable/conflict/replay and keyboard/focus/44px/landmark behavior.
- legacy product rows, planner nutrition/v1 cursor readers, current/immediate-previous cooking clients, old-path image readers and rollback floors stay available until their own separately approved irreversible gates. Elapsed time or telemetry zero is evidence only.
- final closeout requires blocker 0, fresh independent security/DB/operations, performance/code, design authority and Stage 5/6 approvals, plus every started current-head check terminal success or policy-justified skip.

## Release State Matrix

| State | Required behavior |
| --- | --- |
| predecessor runtime incomplete | final verification does not start; Stage 1 docs remain planned lifecycle |
| stale or different-head evidence | reject the evidence and rerun on the exact repaired head |
| runtime defect found | stop closeout, open separate failing-test-first repair PR, merge, then rerun affected and final gates |
| remote or provider verifier unavailable | fail closed; do not substitute a local fixture or claim remote pass |
| telemetry unavailable/zero | retain compatibility surfaces; no destructive inference |
| browser state unavailable | record blocker; do not replace real Chrome with fixture screenshots |
| current-head check pending/fail/cancel/absent | do not merge or close the release |
| Manual Only operation not authorized | keep it explicitly unchecked; do not install, write or delete |

## Dependencies

- Stage 1 docs predecessors: F0 PR #1073, #1 PR #1074, #2 PR #1076, #3 PR #1077, #4 PR #1078, #5 PR #1079, #6 PR #1080, #7 PR #1081, #8 PR #1082, #9 PR #1083, #10 PR #1084, #11 PR #1085, #12 PR #1086 and #13 PR #1087 are merged.
- runtime Stage 2+ waits for F0 and #1~#13 implementation/closeout to be merged and current-head green according to the exact DAG.
- no successor workpack exists inside the approved 15-pack Stage 0 set. Runtime release trains still begin with F0 implementation after all Stage 1 docs close.

## Design / Accessibility

- UI risk is high because this is the final release gate across all three official anchors `HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK` and the required high-risk/new surfaces.
- no new generator or critic artifact is created: the slice reuses each predecessor's canonical screen designs and critic decisions only after that predecessor has actually merged them, without changing composition.
- `ui/designs/MEAL_LOG.md`, `ui/designs/critiques/MEAL_LOG-critique.md` and `ui/designs/authority/MEAL_LOG-authority.md` are future #12-owned artifacts. Stage 0 only reserves these paths and does not claim they exist or are merged; #14 Stage 2 fails closed until #12 creates and merges all three and its implementation/current-head gate is green.
- fresh exact-head authority is mandatory. Screenshot/evidence manifests cover `ACCOUNT_QUARANTINE`, `HOME`, `RECIPE_DETAIL`, `MANUAL_RECIPE_CREATE`, `PLANNER_WEEK`, `COOK_MODE`, `LEFTOVERS`, `MEAL_LOG` at mobile-default 390px, mobile-narrow 320px and desktop.
- the final authority report references concrete PNG/Figma/runtime evidence and verifies responsive wrapping, destructive hierarchy, focus restoration, keyboard order, 44px targets, screen-reader landmarks and fail-closed CTA states.

## Out of Scope

- inline runtime repair, new API/DB/UI contract, new dependency or official contract evolution.
- R+2 activation, v1/product/planner/image-path tombstone, retention cleanup or legacy orphan deletion.
- production/staging/provider mutation, launchd install/secret setup or destructive data operation without its separate authority.
- medical guidance, new nutrition inference, external search SaaS or runtime provider fetch.

## Stage 1 Current Gate

- run SOT/workflow/workpack/automation/bookkeeping validators, focused workflow-doc tests, lint, typecheck, dependency audit and exact-six diff/parity only.
- DB migrations, Postgres/RLS/Auth/Storage, targeted product tests, full backend/frontend, E2E/browser, exploratory/eval, performance, remote read-only, authority and Manual Only operations are future runtime release evidence.
- `verification.required_checks` is the canonical full-lifecycle minimum; `verification.verify_commands` is only the Stage 1 executable subset.

## Delivery Checklist

- [x] Stage 1 exact-six docs authored
- [ ] independent internal1.5/security-DB-operations/five-axis/design-authority-plan reviews approved with zero findings
- [ ] every check started for the Stage 1 PR current head is terminal green or intended skip
- [ ] post-merge master QA/Policy/Security/Vercel green
- [ ] all predecessor runtime/current-head gates green before Stage 2
- [ ] any defect repaired through a separate TDD PR and final evidence rerun on the repaired head
- [ ] exact-head DB/API/browser/performance/legacy/rollback/authority evidence and Stage 5/6 reviews green
- [ ] Manual Only and irreversible operations remain separately authorized
