# Acceptance Checklist

> **Fresh full-local relock 2026-08-02:** browser direct Data/Storage와 user-path service-role fallback 0은 그대로 유지한다. local Auth JWT/active binding으로 owner 경계를 다시 증명하며 과거 remote Auth/local `auth.users=0` evidence는 historical evidence일 뿐 full-local provider/cutover 증거로 간주하지 않는다.

> This full-local Stage 1 relock uses the current official tuple (`요구사항기준선-v1.7.28.md`, `화면정의서-v1.5.32.md`, `유저flow맵-v1.3.30.md`, `db설계-v1.3.30.md`, `api문서-v1.2.33.md`). The approved master plan remains design history. The current pre-floor source-of-record is `LIVE_REMOTE`; the target authority is one self-hosted local Supabase Auth/DB/Storage. This docs PR adds no product runtime, migration, schema or public contract.
>
> Stage 4 evidence is local-fixture only: the shared shell/primitives, capability-off CTA composition, browser dirty guard, managed-image cleanup, 390px/320px Playwright and 20 PNG authority set are implemented on `feature/fe-personal-recipe-editor-decoupling`. Plain successor/merge-gate bullets are intentionally outside the machine Stage 4 checklist; they remain owned by #6, #8 or post-merge verification and are not claimed here.
>
> Stage 4/5 implementation and its merge gate closed through PR #1243: exact implementation head `e177a882e0fbc35847895a7a0f1dd775ff4425d1` completed 20 checks successfully with one documented normal skip, then squash-merged as `6565c2a84f3b7eba9f0579db7b91fed12fc08f23`. PR #1246 merged the test-first historical hybrid verifier as `354c569c8e40889bcfa7d9832cb9cec93f53db46`, and its merged exact-SHA dry-run passed. These checked items and PR evidence remain history; they are not retoggled or treated as the active full-local completion gate.

## Happy Path

### Existing Backend Boundary Lock

- [x] an invisible parent recipe returns the same `404 RESOURCE_NOT_FOUND` before ingredient, step, tag or service-role image reads <!-- omo:id=accept-editor-backend-nondisclosure;stage=2;scope=backend;review=3,6 -->
- [x] manual recipe create cannot accept client authority for `visibility`, `created_by` or `origin_recipe_id` and sends only official fields to the existing RPC <!-- omo:id=accept-editor-backend-create-boundary;stage=2;scope=backend;review=3,6 -->

## State / Policy

### Composition / Context

- [x] pure form primitives contain no planner, router, auth, persistence or destination decisions <!-- omo:id=accept-editor-pure-primitives;stage=4;scope=frontend;review=5,6 -->
- [x] shell alone owns `planner-add | personal-create | personal-edit | public-fork` context, permission, initial draft, submit adapter and destination <!-- omo:id=accept-editor-shell-context;stage=4;scope=frontend;review=5,6 -->
- [x] planner-add preserves existing plan-servings/Meal creation and MEAL_SCREEN return while standalone contexts never create Meal implicitly <!-- omo:id=accept-editor-planner-separation;stage=4;scope=frontend;review=5,6 -->
- [x] no new public route/query/API contract is invented merely to encode editor context <!-- omo:id=accept-editor-no-route-invention;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

### Permission / Entry

- **Successor gate (#8):** public authenticated detail exposes secondary `내 레시피로 수정` without replacing primary `[플래너에 추가] [요리하기]` <!-- omo:id=accept-editor-public-cta -->
- **Successor gate (#8):** public anonymous CTA returns from login to the same accessible recipe and `public-fork` draft action <!-- omo:id=accept-editor-login-return -->
- **Successor gate (#8):** owner-private active detail alone exposes secondary `편집` and visually separated destructive-tertiary `삭제` <!-- omo:id=accept-editor-owner-cta -->
- [x] other-owner private, deleted and quarantined public views expose neither CTA nor existence and cannot preload editor data <!-- omo:id=accept-editor-nondisclosure;stage=4;scope=frontend;review=5,6 -->
- **Successor gate (#6/#8):** resumed/direct/stale editor entry revalidates auth, visibility, owner and deleted/quarantined state <!-- omo:id=accept-editor-entry-revalidation -->
- [x] loading access state keeps fork/edit/delete CTA fail-closed; unauthenticated protected entry uses login/401 meaning while authenticated inaccessible content renders 404 non-disclosure <!-- omo:id=accept-editor-loading-auth-states;stage=4;scope=frontend;review=5,6 -->
- [x] empty ingredient and step sections expose `재료 추가` and `조리 단계 추가`; public source and capability-off personal surfaces remain explicitly read-only <!-- omo:id=accept-editor-empty-readonly;stage=4;scope=frontend;review=5,6 -->

### Identity / Navigation

- **Successor gate (#6/#8):** personal-edit primary save returns to the same private recipe ID <!-- omo:id=accept-editor-save-same-id -->
- **Successor gate (#6/#8):** explicit secondary `새 레시피로 저장` alone requests a new private identity <!-- omo:id=accept-editor-save-new-id -->
- **Successor gate (#6/#8):** public-fork cannot mutate the public source and success navigates to a new owner-private ID with immutable origin provenance <!-- omo:id=accept-editor-fork-identity -->
- [x] save/upload in progress blocks duplicate submit and navigation occurs only after one durable success <!-- omo:id=accept-editor-submit-once;stage=4;scope=frontend;review=5,6 -->
- [x] server error keeps the draft, presents retryable feedback and focuses summary/first invalid field <!-- omo:id=accept-editor-error-preserve;stage=4;scope=frontend;review=5,6 -->

### Dirty / Cancel

- [x] title/servings, ingredient/product, step order/content, tags and image object/state changes all mark the draft dirty <!-- omo:id=accept-editor-dirty-coverage;stage=4;scope=frontend;review=5,6 -->
- [x] clean cancel returns immediately; dirty browser back, in-app back and close share one `계속 편집 | 변경사항 버리기` guard <!-- omo:id=accept-editor-discard-guard;stage=4;scope=frontend;review=5,6 -->
- [x] discard does not claim success while an unattached managed upload still needs recoverable owner cancel/cleanup <!-- omo:id=accept-editor-discard-cleanup;stage=4;scope=frontend;review=5,6 -->
- **Successor gate (#6):** server/preload refresh never overwrites a dirty local draft <!-- omo:id=accept-editor-no-dirty-overwrite -->

## Data Integrity

### Image / Tag Reuse

- [x] draft persists `image_object_id` authority separately from short presentation URL and never accepts a service bucket URL as managed identity <!-- omo:id=accept-editor-image-object;stage=4;scope=frontend;review=5,6 -->
- [x] personal upload has no public/private selector and reuses 5MB/MIME/quota/replay/signed-URL states <!-- omo:id=accept-editor-private-upload;stage=4;scope=frontend;review=5,6 -->
- [x] remove/unmount/discard uses owner server cancel and never browser Storage `.remove()` <!-- omo:id=accept-editor-server-cancel;stage=4;scope=frontend;review=5,6 -->
- [x] existing attached image is not deleted merely by unmount; later write core owns reference-aware replacement <!-- omo:id=accept-editor-attached-image;stage=4;scope=frontend;review=5,6 -->
- [x] tag suggestions/chips reuse duplicate/empty/length/prohibited validation and cannot widen parent visibility <!-- omo:id=accept-editor-tag-upper-bound;stage=4;scope=frontend;review=5,6 -->

### Surface / Scope Boundary

- [x] MYPAGE and RECIPEBOOK_DETAIL add no edit UI and existing item navigation still lands on RECIPE_DETAIL <!-- omo:id=accept-editor-recipebook-boundary;stage=4;scope=frontend;review=5,6 -->
- [x] no history/timeline/trash/restore/public-publish UI or unofficial endpoint/field/status/error is introduced <!-- omo:id=accept-editor-no-extra-contract;stage=4;scope=frontend;review=5,6 -->
- [x] #5 does not implement or claim #6 write/RLS/RPC, #7 impact propagation or #8 snapshot-v2 activation <!-- omo:id=accept-editor-successor-boundary;stage=4;scope=frontend;review=5,6 -->
- [x] editor CTA and external personal writes remain dark until approved capability and snapshot-v2 activation gates <!-- omo:id=accept-editor-dark-ship;stage=4;scope=frontend;review=5,6 -->
- **Successor gate (#6/#8):** user-scoped preload and future mutation use the restored stable local Auth UUID, active local session binding, account generation and existing `auth.uid()` RLS; all remote sessions/refresh/flow-state are excluded and users re-login <!-- omo:id=accept-editor-full-local-session-boundary -->
- [x] browser direct Data/Storage and service-role user fallback remain zero; existing generation-aware server image Routes with `image_object_id`, private Storage, short signed read and owner cancel are the only managed-image mutation path <!-- omo:id=accept-editor-hybrid-client-boundary;stage=4;scope=frontend;review=5,6 -->
- **Post-merge gate:** the Stage 2 merged-exact-SHA full-local verifier proves single local Auth/DB/Storage authority, stable UUID, local session/RLS owner boundary, app plus the current official `/auth/v1/*` contract as the only public surfaces, and capability-off external personal write dark; historical `verify-personal-recipe-editor-hybrid.mjs` evidence cannot satisfy it. A narrower method/path allowlist requires a future user-approved contract-evolution and is not promised here <!-- omo:id=accept-editor-full-local-verifier -->

## Data Setup / Preconditions

### Design / Accessibility

- [x] Stage 1 state matrix and markdown wireframe cover public/auth, anon, owner, other-owner/deleted/quarantined and four editor contexts <!-- omo:id=accept-editor-stage1-wireframe;stage=4;scope=frontend;review=5,6 -->
- [x] independent design critic approves hierarchy, planner/standalone separation, dirty guard and permission states before implementation <!-- omo:id=accept-editor-design-critic;stage=4;scope=frontend;review=5,6 -->
- **Successor gate (#8):** before/after RECIPE_DETAIL and editor evidence exists at 390px and 320px for capability-on login-return and edit/delete states <!-- omo:id=accept-editor-visual-evidence -->
- [x] no horizontal overflow, clipped sticky CTA, keyboard occlusion or ingredient/step action collision occurs at 320px <!-- omo:id=accept-editor-mobile-fit;stage=4;scope=frontend;review=5,6 -->
- **Successor gate (#8):** 320px visual and tab wrap order preserves primary `플래너에 추가 → 요리하기`, then secondary fork/edit, then destructive delete <!-- omo:id=accept-editor-cta-hierarchy -->
- [x] dialog semantics, focus trap/restore, error focus, labels, 44px targets and screen-reader action names pass accessibility checks <!-- omo:id=accept-editor-a11y;stage=4;scope=frontend;review=5,6 -->
- [x] screenshot/Figma product-design-authority report has blocker/major findings zero before Design Status becomes confirmed <!-- omo:id=accept-editor-authority;stage=4;scope=frontend;review=5,6 -->

## Manual QA

Existing confirmed Stage 4 visual/a11y artifacts and the authority report are reused as historical no-visual-drift evidence; this relock creates no new screenshot or authority result.

### Manual Only

- [ ] activated provider callback/link, Cloudflare, final backup, off-Mac restore, first local mutation/cutover and post-floor recovery remain pending and unclaimed

## Automation Split

### Verification / Delivery

- [x] Stage 1 claims only the RED→GREEN contract-sync test, current docs validators, focused workflow tests, lint/typecheck, audit and diff check <!-- omo:id=accept-editor-stage1-honesty;stage=4;scope=frontend;review=5,6 -->
- [x] Stage 4 records failing component/navigation tests before production shell/CTA/dirty-guard edits <!-- omo:id=accept-editor-tdd-red;stage=4;scope=frontend;review=5,6 -->
- [x] component, E2E, visual, a11y and capability-off regressions pass at the Stage 4 implementation head <!-- omo:id=accept-editor-future-tests;stage=4;scope=frontend;review=5,6 -->
- [x] independent internal 1.5, security/ownership and five-axis reviews finish with no unresolved merge-blocking finding <!-- omo:id=accept-editor-independent-reviews;stage=4;scope=frontend;review=5,6 -->
- **Merge gate:** Draft→Ready and every started current-head check finishes success or documented normal skip before squash merge <!-- omo:id=accept-editor-current-head -->

### Active Full-Local Relock Gates

- [ ] Stage 2 implements the read-only full-local verifier with TDD RED→GREEN and keeps the active target at a clean merged exact SHA <!-- omo:id=accept-editor-full-local-stage2;stage=2;scope=shared;review=3,6 -->
- Stage 3 lifecycle gate: a separate Codex task completes exact-head code/security review with unresolved required findings zero.
- [ ] Stage 4 revalidates the existing capability-off shell/consumer without activating #6/#7/#8 or adding product/UI changes <!-- omo:id=accept-editor-full-local-stage4;stage=4;scope=frontend;review=5,6 -->
- Stage 5 lifecycle gate: perform a lightweight no-visual-drift review; Design Status remains confirmed and no new screenshot/Figma/authority evidence is fabricated.
- Stage 6 lifecycle gate: close only from the exact merged head after all active checks and independent review evidence are current.
- [ ] self-owned isolated local Auth/DB/Storage rehearsal and the merged-exact verifier pass without any production/staging/remote application write <!-- omo:id=accept-editor-full-local-isolated;stage=2;scope=shared;review=3,6 -->
