# legacy-product-compat

## Goal

legacy product planner와 v1/v2 cooking reader를 파괴적 정리 없이 호환 가능하게 유지한다. 기존 완제품 계획은 read-only 조회·pin된 상세·사용자 삭제만 제공하고, v1 stable key와 dormant v2 drain은 관측 가능한 단계별 gate로 전환한다. 한 호환 release 경과나 telemetry 0만으로 endpoint, row, decoder를 삭제하지 않는다.

## Official Sources

- `docs/요구사항기준선-v1.7.22.md`
- `docs/화면정의서-v1.5.28.md`
- `docs/유저flow맵-v1.3.25.md`
- `docs/db설계-v1.3.23.md`
- `docs/api문서-v1.2.27.md`
- approved plan SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d`, 1,018 lines

## Scope

### Legacy product planner retention

- keep existing `product_planner_entries` and their pinned product identity, quantity and nutrition version. Underlying product soft delete or current version change never rewrites the historical entry.
- `GET /planner` continues to return additive legacy `product_entries` separately from recipe-only `meals[]`; no row appears in both collections.
- #10 `PLANNER_WEEK` renders selected-date rows under `과거 완제품 계획`, with pinned name/brand/quantity on the card and pinned nutrition in a same-screen read-only sheet.
- the only UI mutation is existing owner delete through `DELETE /product-planner-entries/{entry_id}`. Add, quantity edit, copy, shop, cook, leftover, XP, status and meal-log migration actions remain absent.
- a minimum compatibility release is a retention floor, not an expiry. Rows and read/delete paths remain indefinitely until explicit user approval, contract-evolution and a separate retention/tombstone plan are merged.
- owner/private boundaries and scope-filtered nondisclosure remain unchanged. A legacy row is never exposed through another user's planner, telemetry or compatibility report.

### Endpoint and decoder compatibility floor

- retain `GET /planner` legacy projection and owner delete. `POST/PATCH /product-planner-entries` may remain as server compatibility contracts, but current UI has no producer.
- current UI does not call `GET /planner/nutrition`; the endpoint remains for at least one compatibility release and until a separate approved tombstone contract.
- retain `/food-products` v1 cursor dual decode. A v1 query cursor completes with its old meaning; new first pages may issue v2. Do not invalidate an in-flight v1 page.
- keep existing wrappers, body/response shapes, error codes, owner rules and pinned-version calculation. This slice adds no endpoint, request/response field, enum, status or database migration.

### Legacy v1 stable-key rollout

- preserve v1 routes, body/response and generic `consumed_ingredient_ids` semantics for planner and standalone clients.
- in the first compatibility phase, both legacy clients send an optional stable UUID `Idempotency-Key`; the server still accepts the old no-key shape and records release-scoped no-key telemetry.
- only after a complete compatibility release reports old-shape/no-key 0 may missing key return existing `428 IDEMPOTENCY_KEY_REQUIRED` with mutation 0. This does not authorize v1 route/body/parser removal.
- same stable key and payload replay the first result according to the official idempotency contract; a different payload cannot reuse the key.
- strict v1 removal requires all of: new v1 start blocked, active v1 sessions terminal 0, old-shape/no-key 0, current/immediate-previous compatibility evidence and a separate user-approved tombstone/contract.

### Dormant version dispatch and drain

- current and immediate-previous UI dispatch by stored `contract_version=legacy_v1|snapshot_v2`; they never infer version from body shape or share a parser.
- v1 IDs are read/completed/cancelled only by v1 routes; v2 IDs use `/cooking/session-attempts`. Cross-version IDs fail with the existing 404/409 contract.
- before v2 creation activation, dormant adapters keep v1 behavior unchanged and prove seeded existing-v2 cook-mode read/cancel/complete.
- flag-off R and R+1 prove new v2 starts and new personal mutations are 0. Rollback closes only new v2 start/personal writes; already-open v2 sessions continue to drain.
- R+2 joint activation is outside this slice until the approved predecessor gate is green. #13 records compatibility evidence and removal prerequisites; it does not activate or tombstone runtime contracts.

### Compatibility evidence and tombstone barrier

- evidence records exact release identifier and head SHA, observation window, current/immediate-previous clients, v1 key/no-key counts, active v1 terminal count, seeded-v2 read/cancel/complete results and rollback-drain results.
- inventory legacy planner row reads/deletes, `GET /planner/nutrition` callers and v1 cursor decodes without logging credentials, raw authorization values or another user's private payload.
- telemetry 0, one elapsed release or an empty current UI are evidence only. None is deletion authority.
- irreversible removal requires a new explicit user approval, official contract-evolution, retention/privacy treatment, rollback floor, recovery runbook and independent security/compatibility review.

## State Matrix

| State | Required behavior |
| --- | --- |
| legacy rows present | read-only card and pinned same-screen detail; delete only |
| no legacy rows | empty history section; no add/edit CTA |
| legacy read error | isolate error; do not fabricate an empty/tombstoned result |
| unauthorized/other owner | login guidance or nondisclosure; no private row/telemetry leak |
| delete pending/error | destructive CTA disabled while pending; error keeps pinned row visible |
| v1 optional-key phase | key and no-key old shape both retain v1 response semantics |
| v1 post-zero gate | missing key is mutation-zero 428; endpoint/body remain |
| flag-off existing v2 | read/cancel/complete drain remains available |
| cross-version ID | existing 404/409; no parser fallback |
| telemetry unavailable | tombstone/removal fail closed |

## API / Security Contract

- consume only existing planner/product/cooking v1/v2 routes documented above.
- server remains authority for owner, pinned version, session version, key/payload replay, terminal state and telemetry aggregation.
- no direct row cleanup, client-authored compatibility flag, silent repin, automatic migration or old-client rejection is introduced.
- `GET /planner/nutrition`, legacy product read/delete, v1 cooking and v1 cursor decode survive until their own separately approved tombstone gates.

## Dependencies / Successors

- implementation waits for #10 `planner-shell` and #12 `meal-log-ui` runtime/current-head checks to be merged and green. Stage 1 docs may proceed now.
- this slice consumes the previously approved version-dispatch and batch drain contracts without changing their DAG or activation authority.
- #14 `cooking-meal-log-cross-slice-release-qa` is the successor and replays final rollback/legacy/browser evidence.

## Out of Scope

- deleting/tombstoning legacy rows, endpoints, parsers, cursor decoders or `GET /planner/nutrition`.
- creating a retention period, background auto-delete, data migration or production cleanup job.
- new product planner add/edit UI, detail route, meal-log conversion or current nutrition repin.
- enabling snapshot-v2 creation or personal recipe writes.
- changing PLANNER_WEEK/COOK_MODE composition, HOME search, MEAL_LOG or batch lifecycle UI.
- new endpoint, field, error, enum, status, migration or direct DML.

## Design / Accessibility Impact

- no new screen or visual composition is owned by #13. #10 already owns the `PLANNER_WEEK` legacy read-only card/sheet and #7/#11 own `COOK_MODE` version/batch presentation.
- UI risk is low-risk regression only. No new canonical design, critic or authority report is created by this slice.
- browser verification still covers 390px, 320px and desktop legacy read/detail/delete, focus restoration, destructive confirmation, empty/error/unauthorized states, and current/immediate-previous COOK_MODE dispatch.
- predecessor PLANNER_WEEK/COOK_MODE authority evidence must remain green; #13 cannot use the no-new-design classification to weaken it.

## Stage 1 Current Gate

- run SOT/workflow/workpack/automation/bookkeeping validators, focused workflow-doc tests, lint, typecheck, dependency audit and diff/parity only.
- component/integration/E2E/browser/compatibility telemetry/remote commands are future implementation and release evidence.

## Delivery Checklist

- [x] Stage 1 exact-six docs authored
- [ ] internal1.5/security-compatibility/five-axis/design-impact reviews approved with zero findings
- [ ] every check started for the current head SHA terminal green or intended skip
- [ ] post-merge master QA/Policy/Security/Vercel green
- [ ] Stage 2 TDD RED before implementation
- [ ] current/immediate-previous and seeded-v2 rollback evidence green
- [ ] any destructive tombstone remains separately user-approved and Manual Only
