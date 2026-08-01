# Acceptance Checklist

> **Full-local relock 2026-08-01:** pantry/shopping product authority와 owner cleanup 의미는 유지하되 local Auth UUID/session binding이 active principal이다. remote exact-epoch와 `local auth.users=0` 검증은 역사적 hybrid evidence이며 full-local RLS/cross-owner/delete-recreate smoke로 재잠근다.

> Evidence is checked only after the owning implementation/review stage produces it. 2026-07-31 사용자 승인 Contract Evolution은 current official tuple v1.7.28 / v1.5.32 / v1.3.30 / DB v1.3.30 / API v1.2.33에 반영됐다. Stage 2/3 PR #1255는 final reviewed head `6b0a1c5232759f3d801c9aa84e1427b12bfc37d1` 승인 뒤 `d30ee2c8f38a06609e7a5efddbfb0b5df30f712c`로 merged됐다. Stage 4/5/6 PR #1256은 consumer regression과 race repair를 잠그고, exact head `27fc07c48e61f9f8c252949e598ef5c67fc00068`의 독립 code/security/final verification `P0/P1/P2=0/0/0`, current-head 전체 checks green을 확인한 뒤 `5e9773f5e715e7d63132d7f6b8fadcaafd4b76a0`로 merged됐다. 아래 Manual Only 운영 증거는 계속 미완료다.

## Happy Path

- [x] the first small Stage 2 PR proves only the additive link authority, promotion ACL and fail-closed eligible-link selector, while leaving `pantry_items`, public payloads and existing readers unchanged <!-- omo:id=accept-link-safe-subset;stage=2;scope=backend;review=3,6 -->
- [x] a generic pantry row contributes its canonical ingredient without any product link <!-- omo:id=accept-link-generic-pantry;stage=2;scope=backend;review=3,6 -->
- [x] a product pantry row retains exact product and nutrition-version identity while an active approved primary `represents` link contributes its effective ingredient <!-- omo:id=accept-link-product-pantry;stage=2;scope=backend;review=3,6 -->
- [x] generic and multiple product rows resolving to the same ingredient produce one DISTINCT effective ingredient without collapsing exact pantry row IDs <!-- omo:id=accept-link-distinct-union;stage=2;scope=backend;review=3,6 -->
- [x] official `GET /recipes/pantry-match` (implemented at `/api/v1/recipes/pantry-match`) recognizes an eligible product row as the linked canonical ingredient <!-- omo:id=accept-link-pantry-match;stage=2;scope=backend;review=3,6 -->
- [x] HOME pantry-cleanout recommendation uses the same projection and returns the same eligibility decision <!-- omo:id=accept-link-home-cleanout;stage=2;scope=backend;review=3,6 -->
- [x] shared reader signature/semantics regression contract only is published for custom-recipe and meal-log owning successors; their runtime endpoints/UI are not #2 acceptance targets <!-- omo:id=accept-link-successor-reader-contract;stage=2;scope=backend;review=3,6 -->
- [x] pantry display/direct add preserves existing generic `items`/`ingredient_ids` and additive exact `product_items` <!-- omo:id=accept-link-pantry-display-add;stage=2;scope=backend;review=3,6 -->
- [x] shopping creation pins generic/product provenance and completion uses it without client product/version resend <!-- omo:id=accept-link-shopping-provenance;stage=2;scope=backend;review=3,6 -->
- [x] shopping create/detail response exposes source_type and nullable exact product/version provenance for generic, product and all-null legacy fail-closed branches <!-- omo:id=accept-link-shopping-response-provenance;stage=2;scope=backend;review=3,6 -->

## State / Policy

- [x] production matching requires all four predicates: active, approved, primary and `relation='represents'` <!-- omo:id=accept-link-production-predicate;stage=2;scope=backend;review=3,6 -->
- [x] product-level partial unique prevents two active approved primary represents rows under concurrent promotion <!-- omo:id=accept-link-primary-unique;stage=2;scope=backend;review=3,6 -->
- [x] `contains|substitute` rows never participate in P0 recommendation matching <!-- omo:id=accept-link-nonrepresents-excluded;stage=2;scope=backend;review=3,6 -->
- [x] no-link, inactive, pending, rejected, revoked, superseded and non-primary products remain unmatched rather than choosing a first row <!-- omo:id=accept-link-unapproved-fail-closed;stage=2;scope=backend;review=3,6 -->
- [x] candidate generation is deterministic and separate from explicit human-reviewed atomic promotion <!-- omo:id=accept-link-candidate-promotion-split;stage=2;scope=backend;review=3,6 -->
- [x] 287,041 catalog rows are not bulk-linked or auto-approved by product/brand name <!-- omo:id=accept-link-no-bulk-auto;stage=2;scope=backend;review=3,6 -->
- [x] brand-variable products stay product-first until a representative link is approved <!-- omo:id=accept-link-brand-variance;stage=2;scope=backend;review=3,6 -->
- [x] referenced `화이트크림` history is inventoried before hide/deprecate and is never hard-deleted by this slice <!-- omo:id=accept-link-broad-anchor-preserved;stage=2;scope=backend;review=3,6 -->

## Error / Permission

- [x] normal users cannot insert, update, delete, activate or promote `food_product_ingredient_links` directly <!-- omo:id=accept-link-user-mutation-denied;stage=2;scope=backend;review=3,6 -->
- [x] PUBLIC/anon/ordinary authenticated execution is denied and only the exact intended internal/admin principal can promote <!-- omo:id=accept-link-exact-principal;stage=2;scope=backend;review=3,6 -->
- [x] another owner's private product/link is absent from rows, counts, effective sets and error details <!-- omo:id=accept-link-owner-isolation;stage=2;scope=backend;review=3,6 -->
- [x] missing or ambiguous link data returns valid fail-closed absence without a new public error code or guessed ingredient <!-- omo:id=accept-link-no-public-error-drift;stage=2;scope=backend;review=3,6 -->
- [x] shared reader execution is authenticated-self, verifies `auth.uid() = p_user_id`, and rejects missing auth, other-owner, stale generation/session and user-path service-token fallback <!-- omo:id=accept-link-reader-auth-self;stage=2;scope=backend;review=3,6 -->
- [x] existing JSON endpoints retain `{ success, data, error }` and `{ code, message, fields[] }` <!-- omo:id=accept-link-envelope;stage=2;scope=backend;review=3,6 -->

## Data Integrity

- [x] product FK is `ON DELETE CASCADE` and ingredient FK is `ON DELETE RESTRICT` <!-- omo:id=accept-link-fk-actions;stage=2;scope=backend;review=3,6 -->
- [x] owner-only private product hard delete removes its link without touching an unrelated product or ingredient <!-- omo:id=accept-link-private-cascade;stage=2;scope=backend;review=3,6 -->
- [x] owner-null public/shared product, exact nutrition version, link and non-PII provenance survive account cleanup <!-- omo:id=accept-link-public-preserve;stage=2;scope=backend;review=3,6 -->
- [x] link provenance contains no owner UUID, email, raw session/JWT, secret, API key or raw provider payload <!-- omo:id=accept-link-provenance-safe;stage=2;scope=backend;review=3,6 -->
- [x] brand product identifiers are never inserted into `ingredient_synonyms` <!-- omo:id=accept-link-no-product-synonym;stage=2;scope=backend;review=3,6 -->
- [x] a later current product-version change does not silently rewrite the version pinned by an existing pantry or shopping product row <!-- omo:id=accept-link-version-pin;stage=2;scope=backend;review=3,6 -->
- [x] pantry/shopping XOR CHECK, partial uniques and composite product/version `ON DELETE RESTRICT` FKs reject mismatched or half-present identity <!-- omo:id=accept-link-tagged-identity-fk;stage=2;scope=backend;review=3,6 -->
- [x] account cleanup removes exact owner-private references before private product/version/link aggregate cleanup and preserves owner-null public/shared rows <!-- omo:id=accept-link-cleanup-order;stage=2;scope=backend;review=3,6 -->
- [x] #2-owned pantry-match and HOME readers have regressions that fail when reduced to raw `pantry_items.ingredient_id` only; successor regression checks stop at shared signature/semantics <!-- omo:id=accept-link-raw-reader-regressions;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions

- [x] fixture includes A/B owners, owner-null shared product, generic/product pantry and shopping rows, exact nutrition versions and product/version mismatch <!-- omo:id=accept-link-fixture-owners;stage=2;scope=shared;review=3,6 -->
- [x] link fixture includes active-approved-primary represents plus inactive, pending, rejected, revoked, superseded, secondary, contains and substitute rows <!-- omo:id=accept-link-fixture-states;stage=2;scope=backend;review=3,6 -->
- [x] concurrency fixture attempts two simultaneous primary promotions for one product <!-- omo:id=accept-link-fixture-concurrency;stage=2;scope=backend;review=3,6 -->
- [x] delete fixture covers private cascade, owner-null preservation and ingredient restrict <!-- omo:id=accept-link-fixture-delete;stage=2;scope=backend;review=3,6 -->
- [x] implementation does not activate account-generation cleanup until F0 and #3 joint account-delete gate is satisfied <!-- omo:id=accept-link-joint-gate;stage=2;scope=shared;review=3,6 -->

## Manual QA

- verifier: separate Codex implementation/review sessions at Stage 2/3
- environment: fresh and existing isolated local Supabase fixtures; current remote Supabase remains read-only migration source until the full-local cutover floor, and production/staging application writes remain zero
- scenarios:
  1. compare generic-only, product-only and mixed pantry recommendations for the same ingredient
  2. confirm product name/brand/version remains visible to exact-row readers while recommendation dedupes by ingredient
  3. revoke or demote the representative link and confirm all effective readers stop matching it
  4. delete a private product and anonymize a shared product, then compare link/version retention

## Existing Consumer Regression

- [x] HOME cleanout and PANTRY display/add consume the effective-ingredient result without a raw `pantry_items.ingredient_id`-only fallback <!-- omo:id=accept-link-existing-consumers;stage=4;scope=frontend;review=5,6 -->
- [x] loading/empty/error/read-only/unauthorized states and exact product/version presentation remain unchanged at desktop, 390px and 320px <!-- omo:id=accept-link-existing-ui-states;stage=4;scope=frontend;review=5,6 -->
- [x] custom-recipe and meal-log UI work remains with its owning successor and no provisional control or layout is added here <!-- omo:id=accept-link-successor-ui-boundary;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [ ] production account-generation/account-delete activation waits for the separately approved F0 + #3 joint release gate
- [ ] production link candidate promotion or data load is not performed from an unmerged branch or this docs PR
- [ ] existing-schema signature/function/grant/data digest comparison and production-equivalent effective-reader query-plan measurement
- [ ] the full-local rehearsal must preserve the remote source UUID/product provenance, prove local Auth `auth.uid()` RLS and A/B cross-owner isolation, and keep pre-floor production mutation at zero
- [ ] the merged-exact full-local verifier must prove delete/recreate and stale-session behavior on the isolated target while the remote source remains authoritative until cutover
- [ ] this docs PR performs no migration, implementation, private product cleanup or production write
- [ ] a separate Codex `docs-gate-reviewer` task must approve this exact commit with unresolved required finding 0 before merge

## Automation Split

- [x] Stage 1 runs only current docs validators, focused workflow tests, lint/typecheck, additional local dependency audit and diff check, then independently observes current-head GitGuardian and repository Security Review results <!-- omo:id=accept-link-stage1-current-gate;stage=2;scope=shared;review=3,6 -->
- [x] Stage 2 adds focused tests first and records the expected RED before migration/production reader code <!-- omo:id=accept-link-tdd-red;stage=2;scope=backend;review=3,6 -->
- [x] Stage 4 adds behavior-only HOME/PANTRY consumer unit and focused Playwright regressions with no visual hierarchy change <!-- omo:id=accept-link-stage4-consumer-tests;stage=4;scope=frontend;review=5,6 -->
- [x] focused Vitest covers link predicate, route/helper readers, ACL/PII and account-delete behavior <!-- omo:id=accept-link-vitest-targets;stage=2;scope=backend;review=3,6 -->
- [x] PostgreSQL integration covers isolated fresh/replay, FK/check/partial unique, RLS/grants and concurrent promotion <!-- omo:id=accept-link-postgres-targets;stage=2;scope=backend;review=3,6 -->
- [x] independent internal 1.5, security/DB and five-axis reviewers finish with unresolved required findings zero on the full-local rebased current head <!-- omo:id=accept-link-independent-reviews;stage=2;scope=shared;review=3,6 -->
- [x] Draft→Ready and current exact head started checks all finish success or documented normal skip before squash merge <!-- omo:id=accept-link-current-head-ci;stage=2;scope=shared;review=3,6 -->
