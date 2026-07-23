# Acceptance Checklist

> Evidence is checked only after the owning implementation/review stage produces it. This Stage 1 document locks the tests and rollout boundary; it does not claim future migration, PostgreSQL, route or remote-verifier artifacts already exist.

## Happy Path

- [ ] a generic pantry row contributes its canonical ingredient without any product link <!-- omo:id=accept-link-generic-pantry;stage=2;scope=backend;review=3,6 -->
- [ ] a product pantry row retains exact product and nutrition-version identity while an active approved primary `represents` link contributes its effective ingredient <!-- omo:id=accept-link-product-pantry;stage=2;scope=backend;review=3,6 -->
- [ ] generic and multiple product rows resolving to the same ingredient produce one DISTINCT effective ingredient without collapsing exact pantry row IDs <!-- omo:id=accept-link-distinct-union;stage=2;scope=backend;review=3,6 -->
- [ ] official `GET /recipes/pantry-match` (implemented at `/api/v1/recipes/pantry-match`) recognizes an eligible product row as the linked canonical ingredient <!-- omo:id=accept-link-pantry-match;stage=2;scope=backend;review=3,6 -->
- [ ] HOME pantry-cleanout recommendation uses the same projection and returns the same eligibility decision <!-- omo:id=accept-link-home-cleanout;stage=2;scope=backend;review=3,6 -->
- [ ] custom recipe product validation preserves product/version provenance and checks the approved representative link <!-- omo:id=accept-link-custom-recipe;stage=2;scope=backend;review=3,6 -->
- [ ] pantry display/direct add/shopping reflection preserve generic versus exact product identity <!-- omo:id=accept-link-pantry-display-add;stage=2;scope=backend;review=3,6 -->
- [ ] meal-log product/ingredient picker reads the shared effective projection without converting a product into a generic stored row <!-- omo:id=accept-link-meal-log-picker;stage=2;scope=backend;review=3,6 -->

## State / Policy

- [ ] production matching requires all four predicates: active, approved, primary and `relation='represents'` <!-- omo:id=accept-link-production-predicate;stage=2;scope=backend;review=3,6 -->
- [ ] product-level partial unique prevents two active approved primary represents rows under concurrent promotion <!-- omo:id=accept-link-primary-unique;stage=2;scope=backend;review=3,6 -->
- [ ] `contains|substitute` rows never participate in P0 recommendation matching <!-- omo:id=accept-link-nonrepresents-excluded;stage=2;scope=backend;review=3,6 -->
- [ ] no-link, inactive, pending, rejected, revoked, superseded and non-primary products remain unmatched rather than choosing a first row <!-- omo:id=accept-link-unapproved-fail-closed;stage=2;scope=backend;review=3,6 -->
- [ ] candidate generation is deterministic and separate from explicit human-reviewed atomic promotion <!-- omo:id=accept-link-candidate-promotion-split;stage=2;scope=backend;review=3,6 -->
- [ ] 287,041 catalog rows are not bulk-linked or auto-approved by product/brand name <!-- omo:id=accept-link-no-bulk-auto;stage=2;scope=backend;review=3,6 -->
- [ ] brand-variable products stay product-first until a representative link is approved <!-- omo:id=accept-link-brand-variance;stage=2;scope=backend;review=3,6 -->
- [ ] referenced `화이트크림` history is inventoried before hide/deprecate and is never hard-deleted by this slice <!-- omo:id=accept-link-broad-anchor-preserved;stage=2;scope=backend;review=3,6 -->

## Error / Permission

- [ ] normal users cannot insert, update, delete, activate or promote `food_product_ingredient_links` directly <!-- omo:id=accept-link-user-mutation-denied;stage=2;scope=backend;review=3,6 -->
- [ ] PUBLIC/anon/ordinary authenticated execution is denied and only the exact intended internal/admin principal can promote <!-- omo:id=accept-link-exact-principal;stage=2;scope=backend;review=3,6 -->
- [ ] another owner's private product/link is absent from rows, counts, effective sets and error details <!-- omo:id=accept-link-owner-isolation;stage=2;scope=backend;review=3,6 -->
- [ ] missing or ambiguous link data returns valid fail-closed absence without a new public error code or guessed ingredient <!-- omo:id=accept-link-no-public-error-drift;stage=2;scope=backend;review=3,6 -->
- [ ] existing JSON endpoints retain `{ success, data, error }` and `{ code, message, fields[] }` <!-- omo:id=accept-link-envelope;stage=2;scope=backend;review=3,6 -->

## Data Integrity

- [ ] product FK is `ON DELETE CASCADE` and ingredient FK is `ON DELETE RESTRICT` <!-- omo:id=accept-link-fk-actions;stage=2;scope=backend;review=3,6 -->
- [ ] owner-only private product hard delete removes its link without touching an unrelated product or ingredient <!-- omo:id=accept-link-private-cascade;stage=2;scope=backend;review=3,6 -->
- [ ] owner-null public/shared product, exact nutrition version, link and non-PII provenance survive account cleanup <!-- omo:id=accept-link-public-preserve;stage=2;scope=backend;review=3,6 -->
- [ ] link provenance contains no owner UUID, email, raw session/JWT, secret, API key or raw provider payload <!-- omo:id=accept-link-provenance-safe;stage=2;scope=backend;review=3,6 -->
- [ ] brand product identifiers are never inserted into `ingredient_synonyms` <!-- omo:id=accept-link-no-product-synonym;stage=2;scope=backend;review=3,6 -->
- [ ] a later current product-version change does not silently rewrite the version pinned by an existing pantry product row <!-- omo:id=accept-link-version-pin;stage=2;scope=backend;review=3,6 -->
- [ ] each required reader has a regression that fails when reduced to raw `pantry_items.ingredient_id` only <!-- omo:id=accept-link-raw-reader-regressions;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions

- [ ] fixture includes A/B owners, owner-null shared product, generic/product pantry rows and exact nutrition versions <!-- omo:id=accept-link-fixture-owners;stage=2;scope=shared;review=3,6 -->
- [ ] link fixture includes active-approved-primary represents plus inactive, pending, rejected, revoked, superseded, secondary, contains and substitute rows <!-- omo:id=accept-link-fixture-states;stage=2;scope=backend;review=3,6 -->
- [ ] concurrency fixture attempts two simultaneous primary promotions for one product <!-- omo:id=accept-link-fixture-concurrency;stage=2;scope=backend;review=3,6 -->
- [ ] delete fixture covers private cascade, owner-null preservation and ingredient restrict <!-- omo:id=accept-link-fixture-delete;stage=2;scope=backend;review=3,6 -->
- [ ] existing, fresh and replay databases produce identical schema signatures, grants and stable data digests <!-- omo:id=accept-link-db-replay;stage=2;scope=backend;review=3,6 -->
- [ ] implementation does not activate account-generation cleanup until F0 and #3 joint account-delete gate is satisfied <!-- omo:id=accept-link-joint-gate;stage=2;scope=shared;review=3,6 -->

## Manual QA

- verifier: separate Codex implementation/review sessions at Stage 2/3
- environment: fresh and existing local Supabase plus merged-exact-SHA remote read-only smoke
- scenarios:
  1. compare generic-only, product-only and mixed pantry recommendations for the same ingredient
  2. confirm product name/brand/version remains visible to exact-row readers while recommendation dedupes by ingredient
  3. revoke or demote the representative link and confirm all effective readers stop matching it
  4. delete a private product and anonymize a shared product, then compare link/version retention

## Existing Consumer Regression

- [ ] HOME cleanout and PANTRY display/add consume the effective-ingredient result without a raw `pantry_items.ingredient_id`-only fallback <!-- omo:id=accept-link-existing-consumers;stage=4;scope=frontend;review=5,6 -->
- [ ] loading/empty/error/read-only/unauthorized states and exact product/version presentation remain unchanged at desktop, 390px and 320px <!-- omo:id=accept-link-existing-ui-states;stage=4;scope=frontend;review=5,6 -->
- [ ] custom-recipe and meal-log UI work remains with its owning successor and no provisional control or layout is added here <!-- omo:id=accept-link-successor-ui-boundary;stage=4;scope=frontend;review=5,6 -->

### Manual Only

- [ ] production account-generation/account-delete activation waits for the separately approved F0 + #3 joint release gate
- [ ] production link candidate promotion or data load is not performed from an unmerged branch or this docs PR

## Automation Split

- [ ] Stage 1 runs only current docs validators, focused workflow tests, lint/typecheck, additional local dependency audit and diff check, then independently observes current-head GitGuardian and repository Security Review results <!-- omo:id=accept-link-stage1-current-gate;stage=2;scope=shared;review=3,6 -->
- [ ] Stage 2 adds focused tests first and records the expected RED before migration/production reader code <!-- omo:id=accept-link-tdd-red;stage=2;scope=backend;review=3,6 -->
- [ ] Stage 4 adds behavior-only HOME/PANTRY consumer unit and focused Playwright regressions with no visual hierarchy change <!-- omo:id=accept-link-stage4-consumer-tests;stage=4;scope=frontend;review=5,6 -->
- [ ] focused Vitest covers link predicate, route/helper readers, ACL/PII and account-delete behavior <!-- omo:id=accept-link-vitest-targets;stage=2;scope=backend;review=3,6 -->
- [ ] PostgreSQL integration covers existing/fresh/replay, FK/check/partial unique, RLS/grants and concurrent promotion <!-- omo:id=accept-link-postgres-targets;stage=2;scope=backend;review=3,6 -->
- [ ] query plans prove one bounded set-based projection without per-row N+1 or unbounded product scan <!-- omo:id=accept-link-query-plan;stage=2;scope=backend;review=3,6 -->
- [ ] merged-exact-SHA remote verifier is read-only and records schema/role/reader compatibility with writes zero <!-- omo:id=accept-link-remote-read-only;stage=2;scope=shared;review=3,6 -->
- [ ] independent internal 1.5, security/DB and five-axis reviewers finish with unresolved required findings zero <!-- omo:id=accept-link-independent-reviews;stage=2;scope=shared;review=3,6 -->
- [ ] Draft→Ready and current exact head started checks all finish success or documented normal skip before squash merge <!-- omo:id=accept-link-current-head-ci;stage=2;scope=shared;review=3,6 -->
