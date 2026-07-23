# recipe-visibility-read-hardening

> Stage 1 contract lock. Approved master plan SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d` (1,018 lines). Official baseline: requirements v1.7.22, screens v1.5.28, flow v1.3.25, DB v1.3.23, API v1.2.27.

## Goal

private, soft-deleted, 또는 quarantined owner의 recipe/tag/profile/image 존재가 public list/detail/search/theme/tag/cache/SEO에서 새지 않게 먼저 read matrix를 닫고, 개인 recipe 이미지를 session-bound account generation과 영구 registry/outbox에 연결한다. 기존 계획·요리·배치·식사 기록은 당시 FK/snapshot만 계속 읽으며, 일반 public reader가 그 예외를 재사용하지 못하게 한다.

## Branches

- Stage 1 docs: `docs/recipe-visibility-read-hardening`
- Stage 2 backend/data/storage: `feature/be-recipe-visibility-read-hardening`
- Stage 4 existing-consumer behavior regression: `feature/fe-recipe-visibility-read-hardening`
- Release train: B. 구현 선행조건은 F0 runtime, merged `31-recipe-media-tags`, merged `36e-recipe-tags-frontend`다. 이 Stage 1 docs PR은 승인된 Stage 0 순서대로 먼저 작성한다.
- Stage 1 author, internal 1.5 reviewer/repair-final owner, implementation owner, security/DB reviewer와 five-axis reviewer는 서로 다른 Codex 세션을 사용하며 Claude는 사용하지 않는다.

## In Scope

- additive recipe visibility read foundation
  - `recipes.visibility`, nullable `origin_recipe_id`, nullable `deleted_at`, monotonic revision/`updated_at`
  - 기존 public/manual recipe를 자동 private로 바꾸지 않음
  - private detail은 owner 외 404, soft-deleted recipe는 신규 search/select/book/snapshot/start 대상에서 제외
  - 기존 Meal, shopping, cooking session, batch, meal-log와 snapshot FK 전용 historical reader는 당시 anchor를 계속 해석
- public read matrix와 quarantine upper bound
  - public recipe list, HOME, theme, tag, search, sitemap, cache와 SEO는 public+not-deleted만 노출
  - F0 lifecycle이 quarantined인 owner의 profile과 user-owned recipe/product/community content를 public list/detail/search/tag/cache/SEO에서 제외
  - recovery activate는 기존 row visibility를 다시 적용하고 cleanup은 개인 row를 삭제하며 system/owner-neutral content를 quarantine owner에게 역귀속하지 않음
- parent-bounded `recipe_tags`
  - association visibility는 locked parent recipe에서 파생하며 client input을 authority로 사용하지 않음
  - public RLS, `/tags`, `/recipes?tag`, `/recipes/themes`, sitemap/search RPC, usage count/cache가 parent public+not-deleted를 매번 재검증
  - direct PostgREST와 aggregate 차이로 private association의 제목, ID, 연결 수를 추론할 수 없음
- generation-aware managed recipe image lifecycle
  - private/pending/cleanup object는 owner UUID+account generation, public/shared object는 owner/generation-null neutral path
  - `recipe_image_objects` permanent compact tombstone과 `recipe_image_object_references`
  - private `recipe-images-private` signed read, owner-neutral public `shared/{object_uuid}` read
  - anon/authenticated direct Storage mutation과 registry/reference/outbox DML revoke; server Route+revoke된 RPC+service client만 mutation
  - upload attempt token, generation-scoped idempotency, 5-minute lease takeover, 120-second hard PUT deadline, `upsert=false`, raw SHA-256/size/actual MIME verification
  - `image/jpeg|image/png|image/webp`, 5MB/object, owner `10 new uploads/10min`, `100MB/24h`, active pending+unlinked 20 and global cleanup backlog circuit breaker at 500 rows, oldest due over 15 minutes or any dead-letter before PUT
  - finalize/attach/cancel/scanner CAS, 24-hour attach grace, replay signed URL reissue, Storage-success/DB-failure compensation
  - first 404 `awaiting_not_found_recheck` with 15-minute quarantine, later object recovery/delete, independent second 404 `verified_not_found`, contiguous cleanup generation terminal barrier
  - terminal tombstone scan every 5 minutes for the first 24 hours and every 24 hours thereafter; permanent lifecycle/watermark/registry/image-idempotency compact identity with cleanup-terminal + 90-day minimum + terminal-recheck verbose compaction and 91-day same-key replay
- existing public API compatibility
  - existing `POST /recipes/images` is private-only and returns object-ID based result; public intent is not accepted
  - new official `POST /recipes/images/{image_object_id}/cancel` is owner-only
  - `POST /recipes` attaches verified `image_object_id` in the same recipe/reference transaction
  - public/shared creation is publisher/service-only or verified publish RPC
  - recipe-book external URL input remains compatible, but service-owned bucket URL without verified object ID is `422 MANAGED_IMAGE_REFERENCE_REQUIRED`
- legacy and operations gates
  - positive referenced legacy object backfill and private/public-neutral visibility copy/swap are separate from orphan GC
  - legacy orphan candidates remain report-only; P0 enqueue/delete is exactly 0
  - old path remains for one compatibility release and is deleted only through a separate irreversible gate
  - F0 MacBook launchd maintenance skeleton is extended with ordered Storage scanner/tombstone/recheck/drain before Auth deletion
  - `StartInterval=300`, `RunAtLoad=true`, external heartbeat gap 15 minutes, cleanup target 24 hours, 3 consecutive-call/oldest-due-over-15-minutes/dead-letter alerts, mode 600 env or Keychain secret and 10MB × 5 JSON log rotation
  - install, production secret, power/login/sleep and external heartbeat evidence remain service-owner `Manual Only`

Schema Change:
- [ ] 없음
- [x] 있음 — official DB v1.3.23의 recipe visibility/tag projection, image registry/reference/quota/storage outbox와 F0 lifecycle integration을 additive하게 구현한다. 기존 migration은 수정하지 않는다.

## Out of Scope

- public recipe fork/edit CTA, owner editor decoupling 또는 RECIPE_DETAIL layout 변경(#5)
- content/nutrition snapshot와 Meal authority 구현(#4), personal recipe write core(#6), future propagation(#7)
- ACCOUNT_QUARANTINE 화면 재설계(F0 소유)
- recipe-book object picker UI 또는 진행 중 MYPAGE/RECIPEBOOK_DETAIL 파일 변경
- 임의 외부 URL을 managed Storage object로 해석하거나 삭제
- legacy orphan 후보 자동 enqueue/delete, deletion manifest 승인 또는 `legacy-image-reference-graph-gc`
- Vercel Cron을 P0 scheduler로 사용하거나 24/7 SLA를 주장
- user-facing recipe history/trash/restore UI와 public restore endpoint
- 공식 문서에 없는 endpoint, field, status, error, bucket 또는 actor 추가
- unmerged migration의 remote 적용이나 production/staging data/Storage write

## Dependencies

| Gate | Current state | Meaning |
| --- | --- | --- |
| Stage -1 security hotfix + closeout | merged/deployed | mutation authorization predecessor complete |
| official contract PR #1072 | merged | v1.7.22/v1.5.28/v1.3.25/v1.3.23/v1.2.27 authority available |
| F0 Stage 1 docs PR #1073 | merged | account generation contract documented; runtime remains future implementation predecessor |
| `product-ingredient-link-foundation` Stage 1 docs PR #1076 | merged | successor #2 Stage 1 complete; joint activation still waits for F0+#3 runtime |
| `31-recipe-media-tags` | merged | existing manual recipe image/tag ownership must be preserved |
| `36e-recipe-tags-frontend` | merged | existing tag frontend behavior must be preserved |

> Roadmap status is `docs` while workflow lifecycle remains `planned`. Stage 2 starts only after its implementation predecessors are actually merged and green; Stage 1 docs merge alone is not runtime activation.

## Backend First Contract

### Public, owner and historical readers

- public recipe eligibility is exactly parent `visibility='public'`, `deleted_at IS NULL`, and owner lifecycle not quarantined/deleting/cleanup-hidden. Association/cache flags cannot widen this predicate.
- an owner may read an eligible private current recipe through the authenticated detail path. Another owner and anon receive 404 without title, ID, tag, count, image path, owner, or timing oracle.
- a soft-deleted recipe is absent from all new discovery, recipe-book selection, planner/cooking selection and snapshot creation. No new current pin is allowed.
- only existing Meal/shopping/session/batch/meal-log/snapshot FK readers may resolve a deleted recipe's pinned historical content. Historical permission is scoped to the anchored resource owner and cannot be reused as a general recipe detail/list bypass.
- quarantined user-owned rows are public-ineligible regardless of stored visibility. Recovery activate re-evaluates the same stored rows; delete follows generation cleanup. Owner-neutral/system content is never hidden or claimed merely because an old reference mentions that owner.

### Tag and cache non-disclosure

- tag association visibility is derived under the parent recipe lock. private/deleted parent always lowers the association; unapproved association is never auto-promoted.
- public RLS and every tag/theme/search/sitemap/cache/usage reader joins or `EXISTS`-checks the live parent predicate rather than trusting `recipe_tags.visibility` alone.
- cursor/order/count behavior remains stable after filtering and dedupe. A private association cannot be inferred from count differences, duplicate rows, cache keys, timing-specific error shape, or direct PostgREST.
- visibility/soft-delete/quarantine recovery transitions invalidate or version public caches so stale private/deleted content cannot remain public.

### Managed image authority

- registry object ID, bucket/path, actual hash/size/MIME, lifecycle state, owner/generation and reference rows are authority. Signed URLs are short-lived response data and are never durable identity.
- personal upload is always private. Normal authenticated users cannot select public visibility, public path, owner, generation, registry state, cleanup generation, quota or moderation fields.
- upload start reserves quota and pins attempt token/path/idempotency before PUT. Same key+payload replays durable state without recharging quota; different payload is `409 IDEMPOTENCY_KEY_REUSED`.
- a live lease replay returns `202 + Retry-After`. Only an expired exact-token/generation CAS winner may take over the same path. Existing bytes are verified before finalize and never overwritten.
- finalize succeeds only for exact pending registry+in-progress key+attempt token+cleanup generation. Late finalize after cancel/scanner/delete never restores a row or returns a URL.
- attach and scanner/cancel are conditional competitors. Reference attach occurs with recipe write in one DB transaction; any reference blocks stale cleanup.
- first 404 is nonterminal. Ordered recheck either finds and deletes the late object or records verified-not-found only after an independent second absence check.
- first-404 quarantine is exactly 15 minutes and `awaiting_not_found_recheck` is excluded from normal claim. The due ordered recheck alone may return a recovered object to pending deletion or record an independent second 404.
- permanent terminal tombstone scan claims at most 50 rows per tick in `(next_terminal_scan_at, id)` order with `SKIP LOCKED` and a durable per-row cursor. It scans every 5 minutes for the first 24 hours after terminal and every 24 hours thereafter; a 151-row fixture must finish with starvation 0 across successive ticks.
- lifecycle/watermark/managed registry and image-idempotency compact identity are permanent. Only after cleanup terminal, at least 90 days and a terminal recheck may verbose succeeded-outbox/quota/attempt detail and idempotency attempt/lease/error be compacted; key/payload/result/object references remain and a 91-day same-key replay returns the original durable result.
- account lifecycle completion requires required cleanup generations 1..N to be consecutively terminal and zero pending/processing/awaiting/failed/dead-letter/registry-nonterminal rows.

### ACL, API and operations

- all registry/reference/outbox/quota tables enable RLS and revoke normal direct mutation. Exact internal functions use safe search path, minimal grants, expected generation and lease/token CAS.
- public JSON responses keep `{ success, data, error }` and `{ code, message, fields[] }`. Only official v1.2.27 errors are used, including `IMAGE_NOT_FOUND`, `IMAGE_EXPIRED`, `IMAGE_VISIBILITY_MISMATCH`, `MANAGED_IMAGE_REFERENCE_REQUIRED`, `IMAGE_UPLOAD_LIMITED`, `IDEMPOTENCY_KEY_REUSED` and lifecycle errors.
- implementation routes use `/api/v1` prefix while official contract paths omit it where documented. Assertions name both forms and do not invent duplicate endpoints.
- maintenance tick order is scanner → permanent tombstone late-object scan → due quarantine recheck → normal drain → expected-owner union-zero → Auth deletion drain → lifecycle complete.
- the MacBook LaunchAgent uses `StartInterval=300` and `RunAtLoad=true`. Its release gate requires an external heartbeat gap no greater than 15 minutes, Storage cleanup target within 24 hours, alert on 3 consecutive calls failed, oldest due over 15 minutes or any dead-letter, a mode 600 env or Keychain secret, and structured JSON log rotation at 10MB with 5 retained files.
- remote verification before merge is read-only. Production Storage/DB mutation and cutover activation run only from a merged exact SHA through the approved joint release gate.

## Frontend Delivery Mode

- existing-consumer behavior only: MANUAL_RECIPE_CREATE stores `image_object_id`, calls owner cancel instead of browser Storage `.remove()`, refreshes signed read URLs, and renders the official in-progress/retry/quota/expired/visibility/reference errors.
- no new screen, route, navigation, layout, anchor hierarchy or public/private selector is added. Existing loading/empty/error/read-only/unauthorized and return-to-action behavior stays intact.
- F0 owns ACCOUNT_QUARANTINE UI; #5 owns RECIPE_DETAIL fork/edit/delete CTA; recipebook-diary-port or later contract owns recipe-book object picker UI.
- any visual hierarchy or cross-screen behavior change stops this slice and moves to the owning workpack/design authority gate.

## Design Authority

- UI risk: `low-risk` behavior/state integration on existing MANUAL_RECIPE_CREATE
- Anchor screen dependency: existing MANUAL_RECIPE_CREATE only; no visual change authorized
- Visual artifact: N/A
- Authority status: `not-required`
- Notes: official image state behavior is regression-tested without changing the screen composition. F0/#5 retain their separate design gates.

## Design Status

`N/A`. No new screen or visual-system change. Stage 4 verifies existing picker states and browser `.remove()` removal behavior only.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.22.md` B/H/I
- `docs/화면정의서-v1.5.28.md` 0-D/0-G
- `docs/유저flow맵-v1.3.25.md` ⓮/⓱
- `docs/db설계-v1.3.23.md` B/C/E/F/G and managed-image/outbox sections
- `docs/api문서-v1.2.27.md` A/C/E/I/J/K/L and image cancel contract
- approved master plan sections 6-1, dependency matrix #3 and successor #3

## QA / Test Data Plan

### Stage 1 gate and planned artifacts

- this docs PR runs only current SOT/workflow/workpack/automation/bookkeeping/doc-gate validators, focused workflow Vitest, lint, typecheck, dependency audit and diff check. GitGuardian and current-head repository workflows are observed separately.
- Stage 2 first adds focused visibility/route/tag/security/image/lifecycle/account-delete tests and records RED before migration or production reader/Storage code.
- planned Stage 2/4/closeout commands, PostgreSQL replay, Storage live replay, launchd evidence and remote verifier are required future gates, not commands claimed to exist or pass in Stage 1.

### Fixture and matrix

- A/B owners, public owner-null/system recipe, private current, soft-deleted private, quarantined active-looking owner rows, recovered owner and cleanup owner.
- list/detail/theme/tag/search/sitemap/cache/direct PostgREST matrix with stable empty/404 response and count/cursor dedupe.
- existing historical Meal/shopping/session/batch/meal-log/snapshot anchors versus unanchored new selection attempts.
- image state matrix: pending, live replay, expired takeover, uploaded-unlinked, attached-private, attached-public-shared, cleanup-pending, first-404 awaiting, deleted, verified-not-found and late-object reappearance.
- terminal tombstone fairness fixture: 151 due rows, `(next_terminal_scan_at, id)` durable cursor, `SKIP LOCKED`, per-tick claim limit 50, first-24-hours 5-minute cadence, later 24-hour cadence and starvation 0 after successive ticks.
- quota boundaries (`10/10min`, `100MB/24h`, active 20, backlog 500/oldest due 15min/dead-letter), 15-minute first-404 quarantine, 90-day compaction/91-day replay, different-payload reuse, cancel/scanner/attach/finalize races, Storage-success/DB-failure compensation and generation completion gaps.
- existing/fresh/idempotent replay DB, local Storage emulator where supported, role/grant/function/trigger/policy inventory and merged-exact-SHA remote read-only evidence.

### Legacy and operations evidence

- positive referenced object backfill is idempotent; private/public mixed reference splits by visibility; old path stays readable for a full compatibility release.
- legacy orphan candidate report records count/path hashes only and performs enqueue/delete 0.
- expected-owner signal uses only Storage owner ID, strict allowlisted owner path, or registry owner/generation; arbitrary UUID substrings and external URLs are excluded.
- launchd dry-run plus Manual Only actual install/secret/power/login/sleep/heartbeat evidence, `StartInterval=300`, `RunAtLoad=true`, wrong-secret 401, 15-minute heartbeat/oldest-due alerts, 3 consecutive-call failure alert, dead-letter alert, 24-hour cleanup target, mode 600 env or Keychain secret, 10MB × 5 log rotation and next-tick recovery are release blockers.

## Key Rules

- parent recipe and owner lifecycle are both public visibility upper bounds.
- private/deleted/quarantined existence never leaks through detail, tags, aggregates, caches or SEO.
- historical FK readers preserve history but never grant new selection or general detail access.
- managed image authority is object ID+registry, never URL text, ETag, filename or client visibility intent.
- first 404 is not success; permanent tombstones can re-open cleanup when a late object appears.
- legacy orphan deletion remains zero and Manual Only irreversible approval is outside this slice.
- F0+#3 joint cutover is a hard activation gate; Stage 1 docs do not activate it.

## Primary User Path

1. A user or anonymous visitor requests a public recipe/tag/theme/search surface.
2. The server applies recipe public+not-deleted and non-quarantined-owner predicates before aggregation, count, cache or response projection.
3. An owner manual upload is registered and quota/idempotency-reserved before private Storage PUT, then returns a short signed URL plus durable object ID.
4. Recipe create attaches that object ID atomically; cancel/scanner/outbox handles abandoned or late objects without browser direct deletion.
5. Soft delete removes the recipe from new reads immediately while authorized historical FK readers continue from pinned content only.

## Delivery Checklist

- [ ] recipe visibility/origin/deleted/revision schema and existing-row compatibility are additive and replay safe <!-- omo:id=delivery-visibility-schema;stage=2;scope=backend;review=3,6 -->
- [ ] public list/detail/theme/tag/search/sitemap/cache/SEO enforce public+not-deleted+non-quarantined owner <!-- omo:id=delivery-public-read-matrix;stage=2;scope=backend;review=3,6 -->
- [ ] private owner detail 404 and soft-deleted new-selection denial are non-inferable <!-- omo:id=delivery-private-detail-delete;stage=2;scope=backend;review=3,6 -->
- [ ] anchored historical readers preserve prior Meal/session/batch/log content without general bypass <!-- omo:id=delivery-historical-reader-scope;stage=2;scope=backend;review=3,6 -->
- [ ] recipe tag projection and every aggregate/cache reader recheck parent visibility <!-- omo:id=delivery-parent-bounded-tags;stage=2;scope=backend;review=3,6 -->
- [ ] quarantine recovery/delete and owner-neutral preservation consume F0 lifecycle exactly <!-- omo:id=delivery-quarantine-upper-bound;stage=2;scope=backend;review=3,6 -->
- [ ] private/public-neutral registry, references, RLS/grants and server-only Storage mutation are proven <!-- omo:id=delivery-image-registry-security;stage=2;scope=backend;review=3,6 -->
- [ ] exact 10/10min, 100MB/24h, active-20 and backlog-500/15min/dead-letter quota gates plus idempotency/lease/takeover/finalize/attach/cancel races are atomic and fail closed <!-- omo:id=delivery-image-upload-cas;stage=2;scope=backend;review=3,6 -->
- [ ] 15-minute first-404 recheck, late-object recovery, 5-minute→24-hour 50-row fair tombstone scan over 151 rows, 90-day compaction/91-day replay and contiguous cleanup terminal barrier are proven <!-- omo:id=delivery-image-cleanup-lifecycle;stage=2;scope=backend;review=3,6 -->
- [ ] legacy positive visibility migration preserves rollback path and orphan candidate deletion remains zero <!-- omo:id=delivery-legacy-image-boundary;stage=2;scope=backend;review=3,6 -->
- [ ] launchd 300-second tick, 15-minute heartbeat/oldest-due and 3-failure/dead-letter alerts, 24-hour cleanup target, mode 600 secret, 10MB × 5 logs, recovery and Manual Only gates are recorded <!-- omo:id=delivery-maintenance-operations;stage=2;scope=shared;review=3,6 -->
- [ ] MANUAL_RECIPE_CREATE consumes object ID/cancel/signed-read states with no browser direct Storage mutation <!-- omo:id=delivery-image-existing-consumer;stage=4;scope=frontend;review=5,6 -->
- [ ] existing screen composition, accessibility, loading/error/read-only and return-to-action behavior remain unchanged <!-- omo:id=delivery-visibility-ui-regression;stage=4;scope=frontend;review=5,6 -->
- [ ] local existing/fresh/replay, live Storage fixtures and merged-exact-SHA remote read-only evidence are green <!-- omo:id=delivery-visibility-verification;stage=2;scope=shared;review=3,6 -->
