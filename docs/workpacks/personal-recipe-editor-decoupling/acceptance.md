# Acceptance Checklist

> This Stage 1 document locks future editor, design and release evidence. Unchecked items are not claims that #6 write APIs, Stage 4 UI, screenshots or production activation already exist.

## Composition / Context

- [ ] pure form primitives contain no planner, router, auth, persistence or destination decisions <!-- omo:id=accept-editor-pure-primitives;stage=4;scope=frontend;review=5,6 -->
- [ ] shell alone owns `planner-add | personal-create | personal-edit | public-fork` context, permission, initial draft, submit adapter and destination <!-- omo:id=accept-editor-shell-context;stage=4;scope=frontend;review=5,6 -->
- [ ] planner-add preserves existing plan-servings/Meal creation and MEAL_SCREEN return while standalone contexts never create Meal implicitly <!-- omo:id=accept-editor-planner-separation;stage=4;scope=frontend;review=5,6 -->
- [ ] no new public route/query/API contract is invented merely to encode editor context <!-- omo:id=accept-editor-no-route-invention;stage=4;scope=frontend;review=5,6 -->

## Permission / Entry

- [ ] public authenticated detail exposes secondary `내 레시피로 수정` without replacing primary `[플래너에 추가] [요리하기]` <!-- omo:id=accept-editor-public-cta;stage=4;scope=frontend;review=5,6 -->
- [ ] public anonymous CTA returns from login to the same accessible recipe and `public-fork` draft action <!-- omo:id=accept-editor-login-return;stage=4;scope=frontend;review=5,6 -->
- [ ] owner-private active detail alone exposes secondary `편집` and visually separated destructive-tertiary `삭제` <!-- omo:id=accept-editor-owner-cta;stage=4;scope=frontend;review=5,6 -->
- [ ] other-owner private, deleted and quarantined public views expose neither CTA nor existence and cannot preload editor data <!-- omo:id=accept-editor-nondisclosure;stage=4;scope=frontend;review=5,6 -->
- [ ] resumed/direct/stale editor entry revalidates auth, visibility, owner and deleted/quarantined state <!-- omo:id=accept-editor-entry-revalidation;stage=4;scope=frontend;review=5,6 -->
- [ ] loading access state keeps fork/edit/delete CTA fail-closed; unauthenticated protected entry uses login/401 meaning while authenticated inaccessible content renders 404 non-disclosure <!-- omo:id=accept-editor-loading-auth-states;stage=4;scope=frontend;review=5,6 -->
- [ ] empty ingredient and step sections expose `재료 추가` and `조리 단계 추가`; public source and capability-off personal surfaces remain explicitly read-only <!-- omo:id=accept-editor-empty-readonly;stage=4;scope=frontend;review=5,6 -->

## Identity / Navigation

- [ ] personal-edit primary save returns to the same private recipe ID <!-- omo:id=accept-editor-save-same-id;stage=4;scope=frontend;review=5,6 -->
- [ ] explicit secondary `새 레시피로 저장` alone requests a new private identity <!-- omo:id=accept-editor-save-new-id;stage=4;scope=frontend;review=5,6 -->
- [ ] public-fork cannot mutate the public source and success navigates to a new owner-private ID with immutable origin provenance <!-- omo:id=accept-editor-fork-identity;stage=4;scope=frontend;review=5,6 -->
- [ ] save/upload in progress blocks duplicate submit and navigation occurs only after one durable success <!-- omo:id=accept-editor-submit-once;stage=4;scope=frontend;review=5,6 -->
- [ ] server error keeps the draft, presents retryable feedback and focuses summary/first invalid field <!-- omo:id=accept-editor-error-preserve;stage=4;scope=frontend;review=5,6 -->

## Dirty / Cancel

- [ ] title/servings, ingredient/product, step order/content, tags and image object/state changes all mark the draft dirty <!-- omo:id=accept-editor-dirty-coverage;stage=4;scope=frontend;review=5,6 -->
- [ ] clean cancel returns immediately; dirty browser back, in-app back and close share one `계속 편집 | 변경사항 버리기` guard <!-- omo:id=accept-editor-discard-guard;stage=4;scope=frontend;review=5,6 -->
- [ ] discard does not claim success while an unattached managed upload still needs recoverable owner cancel/cleanup <!-- omo:id=accept-editor-discard-cleanup;stage=4;scope=frontend;review=5,6 -->
- [ ] remote/preload refresh never overwrites a dirty local draft <!-- omo:id=accept-editor-no-dirty-overwrite;stage=4;scope=frontend;review=5,6 -->

## Image / Tag Reuse

- [ ] draft persists `image_object_id` authority separately from short presentation URL and never accepts a service bucket URL as managed identity <!-- omo:id=accept-editor-image-object;stage=4;scope=frontend;review=5,6 -->
- [ ] personal upload has no public/private selector and reuses 5MB/MIME/quota/replay/signed-URL states <!-- omo:id=accept-editor-private-upload;stage=4;scope=frontend;review=5,6 -->
- [ ] remove/unmount/discard uses owner server cancel and never browser Storage `.remove()` <!-- omo:id=accept-editor-server-cancel;stage=4;scope=frontend;review=5,6 -->
- [ ] existing attached image is not deleted merely by unmount; later write core owns reference-aware replacement <!-- omo:id=accept-editor-attached-image;stage=4;scope=frontend;review=5,6 -->
- [ ] tag suggestions/chips reuse duplicate/empty/length/prohibited validation and cannot widen parent visibility <!-- omo:id=accept-editor-tag-upper-bound;stage=4;scope=frontend;review=5,6 -->

## Surface / Scope Boundary

- [ ] MYPAGE and RECIPEBOOK_DETAIL add no edit UI and existing item navigation still lands on RECIPE_DETAIL <!-- omo:id=accept-editor-recipebook-boundary;stage=4;scope=frontend;review=5,6 -->
- [ ] no history/timeline/trash/restore/public-publish UI or unofficial endpoint/field/status/error is introduced <!-- omo:id=accept-editor-no-extra-contract;stage=4;scope=shared;review=5,6 -->
- [ ] #5 does not implement or claim #6 write/RLS/RPC, #7 impact propagation or #8 snapshot-v2 activation <!-- omo:id=accept-editor-successor-boundary;stage=4;scope=shared;review=5,6 -->
- [ ] editor CTA and external personal writes remain dark until approved capability and snapshot-v2 activation gates <!-- omo:id=accept-editor-dark-ship;stage=4;scope=shared;review=5,6 -->

## Design / Accessibility

- [ ] Stage 1 state matrix and markdown wireframe cover public/auth, anon, owner, other-owner/deleted/quarantined and four editor contexts <!-- omo:id=accept-editor-stage1-wireframe;stage=4;scope=frontend;review=5,6 -->
- [ ] independent design critic approves hierarchy, planner/standalone separation, dirty guard and permission states before implementation <!-- omo:id=accept-editor-design-critic;stage=4;scope=frontend;review=5,6 -->
- [ ] before/after RECIPE_DETAIL and editor evidence exists at 390px and 320px for default, login-return, edit/delete, dirty, upload, validation and error states <!-- omo:id=accept-editor-visual-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] no horizontal overflow, clipped sticky CTA, keyboard occlusion or ingredient/step action collision occurs at 320px <!-- omo:id=accept-editor-mobile-fit;stage=4;scope=frontend;review=5,6 -->
- [ ] 320px visual and tab wrap order preserves primary `플래너에 추가 → 요리하기`, then secondary fork/edit, then destructive delete <!-- omo:id=accept-editor-cta-hierarchy;stage=4;scope=frontend;review=5,6 -->
- [ ] dialog semantics, focus trap/restore, error focus, labels, 44px targets and screen-reader action names pass accessibility checks <!-- omo:id=accept-editor-a11y;stage=4;scope=frontend;review=5,6 -->
- [ ] screenshot/Figma product-design-authority report has blocker/major findings zero before Design Status becomes confirmed <!-- omo:id=accept-editor-authority;stage=4;scope=frontend;review=5,6 -->

## Verification / Delivery

- [ ] Stage 1 claims only current docs validators, focused workflow tests, lint/typecheck, audit and diff check <!-- omo:id=accept-editor-stage1-honesty;stage=4;scope=shared;review=5,6 -->
- [ ] Stage 4 records failing component/navigation tests before production shell/CTA/dirty-guard edits <!-- omo:id=accept-editor-tdd-red;stage=4;scope=frontend;review=5,6 -->
- [ ] future component, E2E, visual, a11y and capability-off regressions pass at exact implementation head <!-- omo:id=accept-editor-future-tests;stage=4;scope=frontend;review=5,6 -->
- [ ] independent internal 1.5, security/ownership and five-axis reviewers finish with P0/P1/P2/P3 zero <!-- omo:id=accept-editor-independent-reviews;stage=4;scope=shared;review=5,6 -->
- [ ] Draft→Ready and every started current-head check finishes success or documented normal skip before squash merge <!-- omo:id=accept-editor-current-head;stage=4;scope=shared;review=5,6 -->
