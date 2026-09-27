# recipe-visibility-read-hardening

> Stage 1 contract lock. Approved master plan SHA-256 `45f02013fbc1c3af1936d596605230d0cbac7839a783224aa9535844e4bda7dc` (1,056 lines). Official baseline: requirements v1.7.25, screens v1.5.29, flow v1.3.27, DB v1.3.26, API v1.2.29.

## Goal

private, soft-deleted, 또는 quarantined owner의 recipe/tag/profile/image 존재가 public list/detail/search/theme/tag/cache/SEO에서 새지 않게 먼저 read matrix를 닫고, 개인 recipe 이미지를 session-bound account generation과 영구 registry/outbox에 연결한다. 기존 계획·요리·배치·식사 기록은 당시 FK/snapshot만 계속 읽으며, 일반 public reader가 그 예외를 재사용하지 못하게 한다.

## Branches

- Stage 1 docs: `docs/recipe-visibility-read-hardening`
- Stage 2 backend/data/storage: `feature/be-recipe-visibility-read-hardening`
- Stage 4 existing-consumer behavior regression: `feature/fe-recipe-visibility-read-hardening`
- Release train: B. 구현 선행조건은 F0 runtime, merged `31-recipe-media-tags`, merged `36e-recipe-tags-frontend`다. 이 Stage 1 docs PR은 승인된 Stage 0 순서대로 먼저 작성한다.
- 초기 배포 gate: production=`server MacBook local Next.js + local Supabase`, staging=`isolated local rehearsal stack`, remote verifier/provider barrier/remote migration=`N/A` until separate contract-evolution
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
- [x] 있음 — official DB v1.3.26의 recipe visibility/tag projection, image registry/reference/quota/storage outbox와 F0 lifecycle integration을 additive하게 구현한다. 기존 migration은 수정하지 않는다.

## Out of Scope

- public recipe fork/edit CTA, owner editor decoupling 또는 RECIPE_DETAIL layout 변경(#5)
- content/nutrition snapshot와 Meal authority 구현(#4), personal recipe write core(#6), future propagation(#7)
  - #3은 이미 `deleted_at`인 fixture의 read/new-consumer 차단과 history 보존 경계만 검증한다.
  - owner `DELETE /recipes/{id}` route, owner+revision 멱등 RPC와 실제 `deleted_at` mutation은 #6 소유이며 #2/#3/#4/#5 runtime predecessor 전에는 구현하지 않는다.
- ACCOUNT_QUARANTINE 화면 재설계(F0 소유)
- recipe-book object picker UI 또는 진행 중 MYPAGE/RECIPEBOOK_DETAIL 파일 변경
- 임의 외부 URL을 managed Storage object로 해석하거나 삭제
- legacy orphan 후보 자동 enqueue/delete, deletion manifest 승인 또는 `legacy-image-reference-graph-gc`
- Vercel Cron을 P0 scheduler로 사용하거나 24/7 SLA를 주장
- user-facing recipe history/trash/restore UI와 public restore endpoint
- 공식 문서에 없는 endpoint, field, status, error, bucket 또는 actor 추가
- unmerged migration의 production/staging DB 또는 Storage write

## Dependencies

| Gate | Current state | Meaning |
| --- | --- | --- |
| Stage -1 security hotfix + closeout | merged/deployed | mutation authorization predecessor complete |
| historical contract base PR #1072 | merged | superseded baseline; active authority is the current tuple in `docs/sync/CURRENT_SOURCE_OF_TRUTH.md` |
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
- public JSON responses keep `{ success, data, error }` and `{ code, message, fields[] }`. Only official v1.2.29 errors are used, including `IMAGE_NOT_FOUND`, `IMAGE_EXPIRED`, `IMAGE_VISIBILITY_MISMATCH`, `MANAGED_IMAGE_REFERENCE_REQUIRED`, `IMAGE_UPLOAD_LIMITED`, `IDEMPOTENCY_KEY_REUSED` and lifecycle errors.
- implementation routes use `/api/v1` prefix while official contract paths omit it where documented. Assertions name both forms and do not invent duplicate endpoints.
- maintenance tick order is scanner → permanent tombstone late-object scan → due quarantine recheck → normal drain → expected-owner union-zero → Auth deletion drain → lifecycle complete.
- the MacBook LaunchAgent uses `StartInterval=300` and `RunAtLoad=true`. Its release gate requires an external heartbeat gap no greater than 15 minutes, Storage cleanup target within 24 hours, alert on 3 consecutive calls failed, oldest due over 15 minutes or any dead-letter, a mode 600 env or Keychain secret, and structured JSON log rotation at 10MB with 5 retained files.
- local verification before merge is read-only. Production Storage/DB mutation and cutover activation run only from a merged exact SHA through the approved joint release gate.

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

- [ ] 임시 UI (temporary)
- [ ] 디자인 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed)
- [x] N/A — 기존 MANUAL_RECIPE_CREATE 동작 통합만 수행하며 새 화면 또는 시각 변경 없음

No new screen or visual-system change. Stage 4 verifies existing picker states and browser `.remove()` removal behavior only.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.25.md` B/H/I
- `docs/화면정의서-v1.5.29.md` 0-D/0-G
- `docs/유저flow맵-v1.3.27.md` ⓮/⓱
- `docs/db설계-v1.3.26.md` B/C/E/F/G and managed-image/outbox sections
- `docs/api문서-v1.2.29.md` A/C/E/I/J/K/L and image cancel contract
- approved master plan sections 6-1, dependency matrix #3 and successor #3

## QA / Test Data Plan

### Stage 1 gate and planned artifacts

- this docs PR runs only current SOT/workflow/workpack/automation/bookkeeping/doc-gate validators, focused workflow Vitest, lint, typecheck, dependency audit and diff check. GitGuardian and current-head repository workflows are observed separately.
- Stage 2 first adds focused visibility/route/tag/security/image/lifecycle/account-delete tests and records RED before migration or production reader/Storage code.
- planned Stage 2/4/closeout commands, PostgreSQL replay, Storage live replay, launchd evidence and local verifier are required future gates, not commands claimed to exist or pass in Stage 1.

### Fixture and matrix

- A/B owners, public owner-null/system recipe, private current, soft-deleted private, quarantined active-looking owner rows, recovered owner and cleanup owner.
- list/detail/theme/tag/search/sitemap/cache/direct PostgREST matrix with stable empty/404 response and count/cursor dedupe.
- existing historical Meal/shopping/session/batch/meal-log/snapshot anchors versus unanchored new selection attempts.
- image state matrix: pending, live replay, expired takeover, uploaded-unlinked, attached-private, attached-public-shared, cleanup-pending, first-404 awaiting, deleted, verified-not-found and late-object reappearance.
- terminal tombstone fairness fixture: 151 due rows, `(next_terminal_scan_at, id)` durable cursor, `SKIP LOCKED`, per-tick claim limit 50, first-24-hours 5-minute cadence, later 24-hour cadence and starvation 0 after successive ticks.
- quota boundaries (`10/10min`, `100MB/24h`, active 20, backlog 500/oldest due 15min/dead-letter), 15-minute first-404 quarantine, 90-day compaction/91-day replay, different-payload reuse, cancel/scanner/attach/finalize races, Storage-success/DB-failure compensation and generation completion gaps.
- existing/fresh/idempotent replay DB, local Storage emulator where supported, role/grant/function/trigger/policy inventory and local Supabase read-only verifier evidence.

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

- [x] recipe visibility/origin/deleted/revision schema and existing-row compatibility are additive and replay safe <!-- omo:id=delivery-visibility-schema;stage=2;scope=backend;review=3,6 -->
- [x] public list/detail/theme/tag/search/sitemap/cache/SEO enforce public+not-deleted+non-quarantined owner <!-- omo:id=delivery-public-read-matrix;stage=2;scope=backend;review=3,6 -->
- [x] private owner detail 404 and soft-deleted new-selection denial are non-inferable <!-- omo:id=delivery-private-detail-delete;stage=2;scope=backend;review=3,6 -->
- [x] existing Meal/shopping/session historical readers preserve prior anchored content without general bypass; successor batch/log/snapshot readers remain in their owning workpacks <!-- omo:id=delivery-historical-reader-scope;stage=2;scope=backend;review=3,6 -->
  - 2026-07-28 partial evidence covers owned existing Meal, shopping-list and cooking-session FK readers plus rejection before service-role recipe lookup for another owner. Immutable content snapshots (#4), snapshot-v2 session reads (#7), batch (#8) and meal-log (#9) remain outside the current implementation.
  - 2026-07-29 KST user-directed scope split: successor reader/snapshot workpacks own the remaining immutable content readers, so they are excluded from this workpack's local-only Stage 2 closeout.
  - 2026-07-30 KST Stage 6 scope projection: this item closes only the existing-reader portion implemented by this workpack. Successor-owned immutable snapshot, batch and meal-log readers remain explicitly out of scope and are not claimed complete here.
- [x] recipe tag projection and every aggregate/cache reader recheck parent visibility <!-- omo:id=delivery-parent-bounded-tags;stage=2;scope=backend;review=3,6 -->
- [x] quarantine recovery/delete and owner-neutral preservation consume F0 lifecycle exactly <!-- omo:id=delivery-quarantine-upper-bound;stage=2;scope=backend;review=3,6 -->
- [x] private/public-neutral registry, references, RLS/grants and server-only Storage mutation are proven <!-- omo:id=delivery-image-registry-security;stage=2;scope=backend;review=3,6 -->
- [x] exact 10/10min, 100MB/24h, active-20 and backlog-500/15min/dead-letter quota gates plus idempotency/lease/takeover/finalize/attach/cancel races are atomic and fail closed <!-- omo:id=delivery-image-upload-cas;stage=2;scope=backend;review=3,6 -->
- [x] 15-minute first-404 recheck, late-object recovery, 5-minute→24-hour 50-row fair tombstone scan over 151 rows, 90-day compaction/91-day replay and contiguous cleanup terminal barrier are proven <!-- omo:id=delivery-image-cleanup-lifecycle;stage=2;scope=backend;review=3,6 -->
  - 2026-07-28 merged-tree closeout sync on `690b86600b3b2973c827802f172716d9d667d12b`: focused recipe visibility tests passed 598 tests and isolated PostgreSQL existing/fresh/replay passed 75 tests. The evidence covers registry/RLS/direct-mutation denial, exact quota and replay/takeover/finalize/attach/cancel races, first-404 recheck, 151-row terminal scan fairness, 90/91-day compaction replay and contiguous cleanup completion. Live Storage and rollout evidence remain separately unchecked below.
- [x] legacy positive visibility migration preserves rollback path and orphan candidate deletion remains zero for local Stage 2 copy/swap evidence <!-- omo:id=delivery-legacy-image-boundary;stage=2;scope=backend;review=3,6 -->
  - 2026-07-28 partial evidence: the recipe detail reader now resolves durable registry references after the existing recipe authorization. The authenticated recipe-book list resolves `recipe_book_cover` references only after its owner-bounded query and chunks projection inputs at 100 IDs. Both readers sign private targets, derive public/shared targets and retain legacy URL compatibility only while their additive projection authority is not deployed.
  - The additive DB migration authority now plans exact report-only positive references only during the matching F0 `cutover_maintenance` attempt/revision, splits private targets onto the staged account generation and public/shared targets onto owner-neutral `shared/{object_uuid}` paths, and leaves all legacy URL columns unchanged. Finalization requires both exact source and copied-target Storage rows plus hash/size/MIME evidence before inserting the managed object and all target references atomically; replay is idempotent and no deletion outbox row is created. Production copy execution, consumer smoke, one-release retention and irreversible old-path deletion are split out of the local-only Stage 2 closeout.
  - The service-only copy executor and Storage adapter now validate the exact prepared source/target bucket+path shape, bounded-download and inspect source bytes, use `upsert=false`, re-download and hash/size/MIME-compare the target, then call the DB finalize authority. An already matching target is replay-safe, upload collision can recover only through matching bytes, DB finalize failure leaves the copied target for retry, and the adapter exposes no delete operation. No scheduler/route invokes this executor yet and no production Storage copy has run; merged-exact-SHA execution, reference-consumer smoke, one-release retention and the separate old-path deletion gate remain open.
  - 2026-07-28 local live evidence used the migrated local DB and real Storage for one private and one public legacy PNG. The executor copied exact bytes to the staged private path and owner-neutral `shared/` path, finalized both durable projections with no deletion outbox effect, replayed the same migration key as two finalized targets, and Chrome consumed the new public shared path on the recipe detail screen. A replay-order defect found by this run was repaired so only finalized durable references owned by the exact same migration run bypass the foreign-reference drift guard. Production/merged-exact-SHA execution and compatibility-release retention remain open.
  - 2026-07-29 KST local-only rerun: `HOMECOOK_STORAGE_LIVE_LOCAL_ONLY=1 node scripts/run-recipe-image-legacy-visibility-local.mjs` passed the fixture-bounded private/public legacy copy-swap test against local Supabase Storage (1 passed, 3 skipped), keeping old paths and deletion outbox writes at zero. One-release retention and irreversible old-path deletion remain explicitly separated into the follow-up delete gate.
- [x] local launchd 300-second tick, `RunAtLoad=true`, dry-run-only local command, loaded state, Homecook log creation, recovery-safe feature-off behavior and Manual Only production gates are recorded <!-- omo:id=delivery-maintenance-operations;stage=2;scope=shared;review=3,6 -->
  - 2026-07-27 UTC partial Manual Only evidence: merged exact source `f8ae202f627d190ae349bb97346084e1b2d93d12` installed the LaunchAgent with `StartInterval=300`, `RunAtLoad=true`, mode `0600`, and a macOS Keychain secret aligned to Vercel production without value disclosure. The one-time wrong-secret request returned `401`; the authenticated proof and following steady tick returned `200`, `feature_off`, `blocked`, `blocked_at=scanner`, and `activationAllowed=false`. The official `~/Library/Logs/Homecook/account-maintenance.log` entries at `2026-07-27T20:44:21.404Z` and `2026-07-27T20:44:42.351Z` parsed as JSON, and the stderr log was zero bytes.
  - 2026-07-27 UTC additional evidence on merged exact source `063447bbf77323c948e8e6e5fe71ce6a9ee1be92`: eleven scheduled `feature_off` ticks from `20:49:43Z` through `21:39:51Z` stayed `200`, `blocked_at=scanner`, and `activationAllowed=false` at approximately 300-second intervals. A one-shot closed-loop URL failure at `21:44:00Z` logged `ok=false` and `activationAllowed=false`; the next scheduled tick at `21:44:53Z` recovered to the same safe `200 feature_off/blocked` state. The stderr log remained zero bytes and no secret value was printed.
  - 2026-07-28 KST local dry-run evidence: `pnpm account-maintenance:scheduler:verify` passed the skeleton contract with cadence `300s` and Homecook log paths. `pnpm account-maintenance:scheduler:install -- --dry-run --json --tick-url https://homecook-flame.vercel.app/internal/account-maintenance/tick` rendered the Manual Only plist target with `RunAtLoad=true`, `StartInterval=300` and an allowlisted HTTPS tick URL without running launchctl. `pnpm account-maintenance:scheduler:verify-release` remained blocked by actual install, production secret, power/login/sleep, live tick wiring, external heartbeat/alert delivery, cleanup target and next-tick recovery.
  - 2026-07-29 KST closeout rerun on exact source `539a9f593ef5d26563f496c33a577210583688f5`: `pnpm account-maintenance:scheduler:verify` passed the F0 skeleton contract with cadence `300s`; `pnpm account-maintenance:scheduler:verify-release` remained non-zero with `actual_launchd_install`, `production_secret`, `power_login_sleep`, `live_tick_log_wiring`, `external_heartbeat`, `external_alert_delivery`, `cleanup_target` and `next_tick_recovery`. No `launchctl`, live secret load or maintenance tick mutation was attempted.
  - 2026-07-29 KST local automatic cleaner evidence: `pnpm account-maintenance:local-scheduler:install -- --json` installed and loaded separate LaunchAgent `com.homecook.account-maintenance.local` at `/Users/shj/Library/LaunchAgents/com.homecook.account-maintenance.local.plist`; `pnpm account-maintenance:local-scheduler:verify -- --json` confirmed `RunAtLoad=true`, `StartInterval=300`, `checkedLaunchctl=true`, `installed=true`, `loaded=true`, and dry-run-only `scripts/account-maintenance-tick.mjs --dry-run --json`. Local stderr was zero bytes, and `plutil -lint /Users/shj/Library/LaunchAgents/com.homecook.account-maintenance.local.plist` passed.
  - Production power/login/sleep, approved external heartbeat/alert receiver, actual external 15-minute gap/alert fault evidence, 24-hour cleanup target and 10MB x 5 rotation stay Manual Only outside the local-only Stage 2 closeout.
- [x] MANUAL_RECIPE_CREATE consumes object ID/cancel/signed-read states with no browser direct Storage mutation <!-- omo:id=delivery-image-existing-consumer;stage=4;scope=frontend;review=5,6 -->
  - 2026-07-30 KST Stage 4 evidence: TDD began with 3 failed files / 8 failed tests and later review-specific RED for limited-key replay, remove-during-retry stale completion and expired-read refresh retry cancellation. Final focused Vitest passed 3 files / 42 tests; the locked automation pair passed 2 files / 8 tests; managed browser regression passed desktop/mobile 2/2. The client now consumes the managed object ID/read state, preserves the pre-activation legacy union, refreshes expired signed URLs with the same intent without cancelling that object, rotates the key after a durable limited response, and owner-cancels managed abandoned or stale objects without browser Storage `.remove()`.
- [x] existing screen composition, accessibility, loading/error/read-only and return-to-action behavior remain unchanged <!-- omo:id=delivery-visibility-ui-regression;stage=4;scope=frontend;review=5,6 -->
  - 2026-07-30 KST Stage 4 evidence: `pnpm verify:frontend:pr` and full `pnpm verify:frontend` passed. The full gate included 2,369 product tests, production build, Lighthouse 6/6, Playwright regression 909 passed / 132 skipped, accessibility 18 passed / 15 skipped, visual 23 passed / 22 skipped and security 12/12. Fresh independent code and security reviews both approved with P0/P1/P2/P3 findings 0.
- [x] local existing/fresh/replay, live Storage fixtures and local read-only verifier evidence are green <!-- omo:id=delivery-visibility-verification;stage=2;scope=shared;review=3,6 -->
  - 2026-07-28 partial local evidence: focused Vitest passed 601 tests, PostgreSQL existing/fresh/replay passed 75 tests, local migration replay reported up to date, and the two real local Storage tests passed.
  - 2026-07-28 KST orchestrator rerun on clean merged-exact head `0410b0cb6b4c4e3204ab462783f2cf7431b055d1`: `pnpm test:recipe-visibility-read-hardening:focused` passed 56 files / 601 tests, `pnpm test:recipe-visibility-read-hardening:postgres` passed 75 tests, local Supabase-backed `pnpm test:recipe-visibility-read-hardening:storage-live` passed 2 files / 2 tests, and `pnpm verify:backend` completed lint, typecheck, product tests 2298 passed / 102 skipped, production build and security Playwright 12/12. Historical remote verifier dry-run passed at that time, while the full remote read-only verifier failed closed before the later local-only decision.
  - 2026-07-28 KST repair branch evidence: RED tests reproduced service-owned legacy `thumbnail_url` acceptance and the missing service-role tag usage reconcile path, then GREEN tests passed focused 56 files / 601 tests, PostgreSQL 75 tests, related unit 85 tests, and `pnpm verify:backend`. Independent code and security/DB reviewers rechecked the repair with P0/P1/P2 findings 0. Launchd runtime, full live Storage and final stage promotion evidence remained open, so this item stayed unchecked.
  - 2026-07-28 KST historical post-merge remote evidence on exact source `ff0998d6f862027e81ce6d4aee57916600cba9e2`: dry-run passed merged-exact/clean/read-only prerequisites, then the full linked remote verifier failed because the remote database was missing required Stage 2 image/guard relations and routines. The narrowed read-only diagnostic reported remote writes 0. This is superseded by the 2026-07-29 local-only verifier decision.
  - 2026-07-28 KST live Storage matrix completion: `tests/recipe-image-legacy-visibility-storage.live.test.ts` now covers managed upload/replay, takeover, compensation, attach, cancel/drain, first-404 quarantine and late-object requeue against the local Supabase Storage stack. With `HOMECOOK_STORAGE_LIVE_URL`, `HOMECOOK_STORAGE_LIVE_SERVICE_ROLE_KEY`, `HOMECOOK_STORAGE_LIVE_DB_URL` and `HOMECOOK_STORAGE_LIVE_LOCAL_ONLY=1` loaded from local Supabase, `pnpm test:recipe-visibility-read-hardening:storage-live` passed 2 files / 5 tests. The live tests fail closed if Storage/DB URLs and service-role key do not exactly match `supabase status -o env` for the default local Supabase endpoints, and cleanup verifies Storage removal errors.
  - 2026-07-28 KST current branch verification after the live matrix update: `pnpm lint`, `pnpm typecheck`, `pnpm test:recipe-visibility-read-hardening:focused`, `pnpm test:recipe-visibility-read-hardening:storage-live`, `pnpm validate:source-of-truth-sync`, `pnpm validate:workflow-v2`, `BRANCH_NAME=feature/recipe-visibility-stage2-live-storage pnpm validate:workpack -- --slice recipe-visibility-read-hardening`, `node scripts/validate-automation-spec.mjs --slice recipe-visibility-read-hardening`, `pnpm validate:omo-bookkeeping`, `pnpm validate:closeout-sync` and `git diff --check` passed.
  - 2026-07-29 KST closeout rerun on exact source `539a9f593ef5d26563f496c33a577210583688f5`: `pnpm lint`, `pnpm typecheck`, `pnpm test:recipe-visibility-read-hardening:focused` (57 files / 606 tests), `pnpm test:recipe-visibility-read-hardening:postgres` (75 tests), `pnpm exec vitest run tests/recipe-image-storage-live-guard.test.ts` (5 tests), local-Supabase `pnpm test:recipe-visibility-read-hardening:storage-live` (2 files / 5 tests), source-of-truth/workflow-v2/workpack/automation-spec/OMO bookkeeping/closeout validators and `git diff --check` passed. Reconstructed PR #1205 RED evidence also failed on parent `0410b0cb6b4c4e3204ab462783f2cf7431b055d1` when only the repair tests were applied: service-owned legacy `thumbnail_url` returned `201` instead of expected `422`, and tag usage-count guard matches were `0` instead of `>=3`.
  - 2026-07-29 KST local-only verifier update: `node scripts/verify-recipe-visibility-read-hardening-local.mjs --mode local-read-only --json` passed with local writes zero, exact policy/RLS matrix, `public.tags` column-only read boundary and union-zero counts zero. Remote verifier evidence is no longer required because the user decided not to use a remote DB for this workpack.
  - 2026-07-29 KST local-only closeout evidence: targeted Vitest passed 3 files / 31 tests, `pnpm test:recipe-visibility-read-hardening:focused` passed 59 files / 614 tests, `pnpm test:recipe-visibility-read-hardening:postgres` passed 75 tests, local Storage live passed 2 files / 5 tests, `HOMECOOK_STORAGE_LIVE_LOCAL_ONLY=1 node scripts/run-recipe-image-legacy-visibility-local.mjs` passed 1 file / 1 test with 3 skips, `pnpm account-maintenance:local-scheduler:verify -- --json` passed with `plistMatches=true`, `plutil -lint` passed for the installed local LaunchAgent, `pnpm verify:backend` passed lint/typecheck/product tests 2311 passed / 105 skipped, production build and security Playwright 12/12, and automation/workpack/source-of-truth/workflow-v2/OMO/closeout validators plus `git diff --check` passed. Successor-owned reader/snapshot/delete and production Manual Only gates remain outside this local Stage 2 closeout.
