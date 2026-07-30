# personal-recipe-editor-decoupling

> Hybrid Stage 1 relock. The approved 2026-07-29 master plan SHA-256 `45f02013fbc1c3af1936d596605230d0cbac7839a783224aa9535844e4bda7dc` (1,056 lines) remains editor/product design history, while its local-only Auth/deployment assumptions are superseded by `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`. Official baseline: `docs/요구사항기준선-v1.7.26.md`, `docs/화면정의서-v1.5.30.md`, `docs/유저flow맵-v1.3.28.md`, `docs/db설계-v1.3.27.md`, `docs/api문서-v1.2.30.md`.

## Goal

planner에 결합된 `MANUAL_RECIPE_CREATE`를 재사용 가능한 editor shell과 순수 form primitives로 분리한다. 공개 `RECIPE_DETAIL`의 fork 진입, owner-private detail의 편집·삭제 진입, standalone create와 기존 planner-add가 같은 입력 규칙을 쓰되 서로의 복귀·저장 의미를 섞지 않게 한다.

## Branches

- Stage 1 hybrid relock: `docs/personal-recipe-editor-stage1-relock`
- Stage 2 backend evidence lock: `feature/be-personal-recipe-editor-decoupling`
- Stage 4 frontend shell: `feature/fe-personal-recipe-editor-decoupling`
- Release train: C. successor dependency는 merged #3뿐이며, 재사용 대상인 `31-recipe-media-tags`와 `36e-recipe-tags-frontend`도 이미 merged다. #4 완료는 #5 구현 선행조건이 아니다.
- Stage 1 author, internal 1.5 reviewer/repair-final owner, frontend implementation owner, security/ownership reviewer, five-axis reviewer, design critic와 product-design-authority reviewer는 서로 다른 Codex 세션을 사용한다. Claude는 사용하지 않는다.

## In Scope

- editor composition 분리
  - pure form primitives는 title, base servings, ingredient/product rows, steps/cooking method, tags와 managed image object draft를 표현한다.
  - shell은 `planner-add | personal-create | personal-edit | public-fork` context와 initial draft, submit/cancel destination, dirty state, permissions를 소유한다.
  - `personal-create` is a future standalone shell context reservation, not an active entry point. This Stage does not add a new MYPAGE or RECIPEBOOK entry.
  - 기존 planner-add는 저장 뒤 계획 인분/Meal 생성과 기존 `MEAL_SCREEN` 복귀 의미를 유지한다.
  - standalone create/edit/fork는 planner date/meal-column을 요구하거나 Meal을 자동 생성하지 않는다.
- `RECIPE_DETAIL` entry states
  - public accessible recipe: 로그인 사용자에게 `내 레시피로 수정`; 비로그인은 로그인 뒤 같은 recipe와 fork draft action으로 복귀한다.
  - owner-private, not-deleted recipe: owner에게만 `편집 | 삭제`를 제공한다.
  - other-owner private/deleted/quarantined recipe: CTA와 존재를 노출하지 않고 #3 visibility reader의 404/non-disclosure를 유지한다.
  - delete confirmation은 soft delete와 기존 계획·요리·기록 보존을 설명한다. 휴지통/복원 UI는 없다.
- save identity and navigation semantics
  - personal edit의 primary `저장`은 같은 recipe ID current를 갱신한다.
  - secondary `새 레시피로 저장`만 새 private identity를 만든다.
  - public fork save는 public 원본을 변경하지 않고 `origin_recipe_id`를 가진 새 owner-private ID를 만들고 그 detail로 이동한다.
  - cancel/back은 context별 origin으로 돌아가며, dirty draft면 stay/discard를 명시적으로 선택한다. upload cancel 정리가 완료되기 전에 discard 성공을 가장하지 않는다.
- existing image and tag reuse
  - managed image draft authority는 `image_object_id`; durable identity로 signed URL이나 service bucket URL 문자열을 저장하지 않는다.
  - personal upload는 private-only이고 public/private selector를 만들지 않는다. 취소/unmount는 browser Storage `.remove()`가 아니라 owner cancel API를 사용한다.
  - existing 5MB/MIME/magic-byte/quota/circuit-breaker, live replay, new signed URL, `MANAGED_IMAGE_REFERENCE_REQUIRED` states를 재사용한다.
  - tag suggestion/chip validation과 parent recipe visibility upper bound를 재사용하고 private association을 public으로 넓히지 않는다.
- design contract
  - 기존 `RECIPE_DETAIL` anchor 안에 context-aware CTA row를 추가하고 기존 planner/share/like/save/cook actions를 대체하지 않는다. `[플래너에 추가] [요리하기]`는 primary hierarchy를 유지하고 fork/edit는 secondary, delete는 분리된 destructive tertiary다.
  - editor는 기존 MANUAL_RECIPE_CREATE 시각 언어와 primitives를 재사용하되 planner 전용 copy/step만 shell로 분리한다.
  - 390px primary 2-button row는 `[플래너에 추가] [요리하기]`, secondary next row는 `내 레시피로 수정 | 편집`, delete separate destructive row는 `삭제`다. 320px도 같은 row hierarchy와 tab order를 유지하며 destructive action을 primary row에 올리지 않는다.
  - 390px와 320px에서 CTA wrap/priority, sticky submit, ingredient/step rows, keyboard/focus, dirty-discard dialog가 겹치거나 잘리지 않아야 한다.

Schema Change:
- [x] 없음 — #5는 UI/editor composition과 navigation ownership만 분리한다. `recipes`/API write contract는 #6이 구현한다.
- [ ] 있음

## Out of Scope

- `POST /recipes` public fork persistence, `PATCH /recipes/{id}`, `DELETE /recipes/{id}`, future-plan impact token, optimistic concurrency, RLS/DB RPC (#6/#7)
- `personal_recipe_v2` capability activation 또는 public-fork/personal-edit external write activation; #8 snapshot-v2 cook complete gate 전에는 dark-ship
- hybrid Auth gateway, identity epoch mirror, session-liveness binding, local Data/Storage infrastructure 또는 verifier 구현
- official contract에 없는 editor endpoint, route, field, status, error code, history/timeline, trash/restore 또는 public publish UI
- `MYPAGE`나 `RECIPEBOOK_DETAIL`의 새 edit CTA/layout. 기존 item→`RECIPE_DETAIL` navigation만 유지
- recipebook cover picker/reference upgrade, YT import redesign, PLANNER_WEEK shell, COOK_MODE 또는 MEAL_LOG UI
- public recipe mutation, other-owner private 존재 추론, client-selected visibility/owner/public image path
- merged predecessor 결과를 되돌리거나 browser direct Storage mutation을 복원하기

## Dependencies

| Gate | Current state | Meaning |
| --- | --- | --- |
| historical contract base PR #1072 | merged | superseded baseline; active authority is the current tuple in `docs/sync/CURRENT_SOURCE_OF_TRUTH.md` |
| `recipe-visibility-read-hardening` PR #1228 | merged | #3 Stage 2~6 runtime/client/review/current-head closeout is the only successor predecessor for #5 |
| `31-recipe-media-tags` | merged | existing image upload/object-ID/cancel surface must be reused |
| `36e-recipe-tags-frontend` | merged | existing tag form/primitives must be reused |
| `recipe-snapshot-authority-foundation` | in-progress, not a predecessor | PR #1218 historical Stage 2 and PR #1219 historical Stage 4 are preserved; the hybrid delta/reverification remains in progress. #4 is not a #5 implementation predecessor |
| `recipebook-diary-port` | not a predecessor | MYPAGE/RECIPEBOOK_DETAIL remain untouched |

> Roadmap and workflow lifecycle are `in-progress` for the test-only Stage 2. This backend branch adds route/contract regression locks only; it does not activate editor CTA, personal writes or any new runtime endpoint.

## Hybrid Auth / Local Data Boundary

- Google/Naver/Kakao session identity and the minimal Hook/lifecycle fence remain in the remote Auth control-plane. Application DB and Storage authority are local application Data/Storage on the server Mac.
- `local auth.users=0` is intentional. User-scoped editor preload and future mutation paths must pass the server session-authority gateway, exact remote JWT claim checks, current private identity epoch and active session-liveness HMAC binding.
- The browser must not call local PostgREST/Storage directly. The user path has service-role user path 0; managed image operations continue through the existing server image APIs.
- The future Stage 4/release verifier is planned as `node scripts/verify-personal-recipe-editor-hybrid.mjs --mode post-merge-read-only`. It must read local application Data/Storage plus the minimal remote Auth control-plane evidence, keep remote application DB/Storage writes remain zero, and prove the capability-off external personal write remains dark.
- The verifier file and its RED/GREEN evidence do not exist in this Stage 1 relock and are not claimed complete. This relock makes no product API, DB, route, field, status or error change.

## Context Contract

| Context | Entry | Initial data | Primary success | Cancel/back |
| --- | --- | --- | --- | --- |
| `planner-add` | existing menu-add/manual flow | empty draft + planner date/meal context | existing create then plan servings/Meal flow | existing MENU_ADD/MEAL_SCREEN origin |
| `personal-create` | future standalone shell context reservation; no active entry in #5 | empty draft, no planner requirement | new private detail only after the owning write/activation gate | future invoking origin |
| `personal-edit` | owner-private `RECIPE_DETAIL → 편집` | current private recipe revision/draft | same private recipe ID detail | same recipe detail |
| `public-fork` | public `RECIPE_DETAIL → 내 레시피로 수정` | copied editable draft + immutable public origin identity | new owner-private recipe ID detail | original public detail |

- internal routing may encode context, but this workpack does not invent a new public API path or stable query parameter.
- `personal-create` reservation does not authorize a new MYPAGE/RECIPEBOOK CTA, route, query or navigation surface.
- login return-to-action stores the original accessible recipe identity, `public-fork` intent and draft action. It never trusts a client owner/visibility claim.
- direct URL or stale resume revalidates current auth, #3 visibility, owner, deleted/quarantined state before rendering or submitting.
- planner-only state cannot leak into standalone contexts; standalone save never creates or mutates Meal implicitly.

## Permission / State Matrix

| Recipe state / principal | Detail CTA | Editor result |
| --- | --- | --- |
| public + anon | login-gated `내 레시피로 수정` intent | login success resumes same `public-fork`; cancel returns to public detail |
| public + authenticated | `내 레시피로 수정` | fork draft; write remains dark until owning activation gate |
| owner-private + active | `편집 | 삭제` | edit draft or soft-delete confirmation |
| other-owner private | none; existence not inferable | 404/non-disclosure, no editor preload |
| soft-deleted private | none for normal user flow | no editor, no new save/snapshot/start; no restore UI |
| quarantined owner content | none publicly | F0/#3 recovery rules only; no editor bypass |

### Loading / empty / read-only / unauthorized

- permission/detail loading 중에는 fork/edit/delete CTA를 숨기거나 disabled fail-closed로 두고, owner/public 상태를 추측한 skeleton action을 먼저 노출하지 않는다.
- empty editor의 ingredient와 step section은 각각 `[재료 추가]`, `[조리 단계 추가]` affordance를 제공한다. empty array를 완료된 read-only content처럼 보이게 하거나 저장 가능한 정상 상태로 가장하지 않는다.
- public `RECIPE_DETAIL` source는 read-only다. `내 레시피로 수정`은 별도 fork draft를 여는 secondary action이며 detail field를 inline mutation하지 않는다. capability-off hides the personal CTA and route instead of exposing a write-like entry.
- unauthenticated protected entry는 login gate/`401` 의미로 같은 public recipe와 draft action을 보존한다. authenticated other-owner private, deleted 또는 quarantined content는 login prompt가 아니라 `404` non-disclosure를 렌더링해 존재를 추론할 수 없게 한다.
- detail/editor load error는 기존 안전한 content/draft를 숨기지 않고 retry를 제공한다. access 판정 실패를 public 또는 owner state로 fallback하지 않는다.

## Editor / Navigation Contract

- form primitives contain no router, planner, auth, persistence or destination decisions. They emit normalized draft changes and validation state only.
- shell owns submit adapter, busy/error state, dirty detection, destination and managed upload cancellation. A context adapter cannot silently call another context's save path.
- initial draft equality is canonical content equality, not object identity. upload object/state changes, tag edits, ingredient/product changes and step reorder/add/delete all mark dirty.
- cancel/back with no changes returns immediately. Dirty cancel opens an accessible confirmation with `계속 편집 | 변경사항 버리기`; browser back, mobile gesture-back and in-app close use the same guard.
- save/upload in progress disables duplicate submit. navigation occurs only after one durable success; API error keeps the draft and focus moves to an error summary or first invalid field.
- public-fork source identity is read-only provenance. UI may copy content into the draft but cannot PATCH the source or let the user clear/change the origin to another recipe.
- personal edit preload must not refetch mutable current after the user begins editing in a way that overwrites dirty input.

## Managed Image / Tag Contract

- image upload starts through the existing server route and retains `image_object_id`, state and short read URL separately. the read URL is presentation-only and reissued on replay.
- replacing/removing an unattached image and discarding a draft calls the existing owner cancel path. attached existing image is not deleted merely because the editor unmounts; write core later performs reference-aware replacement.
- cancel failure keeps a recoverable cleanup state and must not fall back to direct Storage removal.
- tags use existing suggestion, add/remove, duplicate/empty/length/prohibited validation. server remains authority for moderation and visibility; private recipe tags never become public through client state.

## Stage 1 Wireframe

### `RECIPE_DETAIL` action states

```text
PUBLIC / AUTHENTICATED              OWNER-PRIVATE / ACTIVE
┌──────────────────────────────┐    ┌──────────────────────────────┐
│ media · title · meta         │    │ media · title · meta         │
│ share  like  save            │    │ share  like  save            │
│ [플래너에 추가] [요리하기]    │    │ [플래너에 추가] [요리하기]    │
│ [내 레시피로 수정] secondary  │    │ [편집] secondary             │
│                               │    │ [삭제] destructive tertiary  │
└──────────────────────────────┘    └──────────────────────────────┘

ANON: fork CTA → LoginGate → same public recipe/fork draft action
OTHER-OWNER PRIVATE / DELETED / QUARANTINED PUBLIC VIEW: CTA와 존재 노출 없음
LOADING: access 판정 전 personal CTA fail-closed
390px/320px: primary 2-button row → secondary next row → delete separate destructive row 순으로 wrap/tab
```

### shared editor shell

```text
┌──────────────────────────────────┐
│ ← context title                  │
│ image object picker / state      │
│ recipe title · base servings     │
│ ingredients OR [재료 추가]       │
│ steps OR [조리 단계 추가]         │
│ tag suggestions / chips          │
│                                  │
│ secondary: 새 레시피로 저장*     │
│ [취소]                 [저장]    │
└──────────────────────────────────┘
* personal-edit에서만 명시적 secondary identity action.
dirty close/back → [계속 편집] [변경사항 버리기]
```

## Design Authority

- UI risk: `high-risk` anchor-screen CTA and multi-context editor navigation
- Anchor screen: `RECIPE_DETAIL`; high-risk affected/required editor surface: `MANUAL_RECIPE_CREATE`
- Stage 1 artifact: this README's state matrix and markdown wireframe
- Design critic: required before Stage 4 implementation begins; public/owner/anon/deleted matrix, action hierarchy, dirty-discard and planner/standalone separation
- Stage 4 evidence: before/after `RECIPE_DETAIL` and editor at 390px/320px; public/auth, anon login-return, owner edit/delete, dirty dialog, validation/error/upload states, keyboard/focus, no horizontal overflow
- Product-design-authority: required from screenshots or Figma frames before Design Status can become `confirmed`
- authority report만 canonical report path에 두고, PNG/Figma frame은 report 안의 evidence/runtime reference로 연결한다.
- MYPAGE/RECIPEBOOK_DETAIL evidence must show no new edit UI and unchanged item→detail navigation.

## Design Status

`confirmed` for the Stage 4 dark-ship surface. The independent product-design-authority recheck records `pass`, blocker/major/minor `0/0/0`, after reviewing 20 local-fixture PNGs at 390px/320px plus rendered 44px geometry. Capability-on fork/edit/delete visuals remain intentionally deferred to #8 activation and are not claimed as reachable shipping evidence.

### Stage 4 local evidence

- TDD RED was recorded before the locked shell/navigation/dirty/media/action implementation and before the automation `external_smokes` relock.
- Focused Vitest covers the shared shell, context policy, browser dirty guard, managed owner cancel, tag/media reuse and capability-off action matrix.
- `tests/e2e/slice-personal-recipe-editor-decoupling.spec.ts` covers 12 local-fixture cases across 390px and 320px, including browser back, validation, upload error, cleanup retry, interaction geometry, focus/scroll and MYPAGE/RECIPEBOOK no-edit regression.
- `ui/designs/authority/personal-recipe-editor-decoupling-authority.md` is the canonical authority report. Physical-device virtual keyboard/IME and post-activation personal writes remain Manual Only/future evidence.
- No production/staging write or remote application DB/Storage mutation was performed.

## QA / Test Data Plan

### Stage 1 gate

- this docs PR first records RED and then GREEN in `tests/personal-recipe-editor-hybrid-contract-sync.test.ts`, and runs the current executable subset only: SOT/workflow/workpack/automation/bookkeeping validators, focused workflow Vitest, lint, typecheck, dependency audit and diff check.
- `required_checks` remains the full-lifecycle closeout gate; `verify_commands` is the current Stage 1 executable subset.
- Stage 4 first writes component/navigation regression tests and records RED before shell extraction, CTA or dirty guard production code.
- future component/Playwright/visual/authority and `verify-personal-recipe-editor-hybrid.mjs` commands below are required implementation artifacts, not commands claimed executable in this docs PR.

### Future fixtures

- public/auth, public/anon login round-trip, owner-private, other-owner-private, deleted and quarantined visibility fixtures.
- four editor contexts with identical form primitives but distinct initial data, submit adapter, destination and planner side effects.
- title/servings, generic ingredient, exact product/version provenance, add/change/delete/reorder steps, tags, existing/new/replaced/cancelled images.
- clean cancel, dirty browser back/in-app close, stay/discard, cancel API failure, duplicate submit, server validation, unauthorized/stale access and retry.
- public fork source unchanged and new private ID; personal edit same ID; secondary save new ID; planner-add alone creates Meal.
- current and immediate-previous dark-ship compatibility with CTA/write flag off and no mutable-history regression.
- hybrid session fixtures cover remote Auth control-plane liveness, local identity epoch/binding checks, `local auth.users=0`, service-role user path 0 and remote application DB/Storage write 0 without logging raw identity/session material.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.26.md` 0-HYBRID, B
- `docs/화면정의서-v1.5.30.md` 0-HYBRID, 0-D
- `docs/유저flow맵-v1.3.28.md` remote Auth→local Data/Storage, ⓮
- `docs/db설계-v1.3.27.md` 0-HYBRID, recipe/image authority
- `docs/api문서-v1.2.30.md` hybrid internal boundary, personal recipe/image contracts
- historical master plan design sections for successor #5; its local-only Auth/deployment assumptions are superseded by the current official tuple

## Key Rules

- #5 separates UI composition and navigation; #6 owns persistence, RLS and recipe write RPCs.
- public source is immutable; fork success is a new owner-private ID.
- normal personal save keeps identity; only explicit secondary save creates a new identity.
- visibility and owner checks are server-authoritative and other-owner private is non-inferable.
- planner-add is the only context that automatically continues into Meal creation.
- managed image object ID and existing tag rules are reused; no browser Storage mutation or client visibility authority.
- MYPAGE/RECIPEBOOK_DETAIL stay out of scope.
- CTA and external personal write remains dark until the approved capability/snapshot-v2 activation gate.
- remote application DB/Storage writes remain zero; the hybrid control-plane boundary never authorizes #5 product writes.

## Delivery Checklist

- [x] existing recipe detail read returns the same `404 RESOURCE_NOT_FOUND` before child or service-role reads when the parent recipe is not visible <!-- omo:id=delivery-editor-backend-nondisclosure;stage=2;scope=backend;review=3 -->
- [x] existing manual recipe create ignores client owner, visibility and origin fields and forwards only the official payload <!-- omo:id=delivery-editor-backend-create-boundary;stage=2;scope=backend;review=3 -->
- [x] shared pure form primitives are separated from context shell/router/persistence <!-- omo:id=delivery-editor-primitives;stage=4;scope=frontend;review=5,6 -->
- [ ] all four contexts preserve distinct initial data, submit, success and cancel destinations <!-- omo:id=delivery-editor-contexts;stage=4;scope=frontend;review=5,6 -->
- [x] public/anon/owner/other-owner/deleted/quarantined CTA matrix is fail-closed <!-- omo:id=delivery-editor-cta-matrix;stage=4;scope=frontend;review=5,6 -->
- [ ] public-fork login round-trip restores the same recipe and draft action <!-- omo:id=delivery-editor-login-return;stage=4;scope=frontend;review=5,6 -->
- [ ] primary save/same ID, secondary new ID and public fork/new private ID are not conflated <!-- omo:id=delivery-editor-identity;stage=4;scope=frontend;review=5,6 -->
- [x] dirty discard, duplicate submit, validation/error and navigation guards preserve draft integrity <!-- omo:id=delivery-editor-dirty;stage=4;scope=frontend;review=5,6 -->
- [x] image object/cancel and tag primitives reuse predecessor contracts without direct Storage mutation <!-- omo:id=delivery-editor-media-tags;stage=4;scope=frontend;review=5,6 -->
- [x] MYPAGE/RECIPEBOOK_DETAIL remain unchanged and navigate items to RECIPE_DETAIL <!-- omo:id=delivery-editor-surface-boundary;stage=4;scope=frontend;review=5,6 -->
- [x] 390px/320px screenshots and independent design critic/authority reviews pass <!-- omo:id=delivery-editor-design-authority;stage=4;scope=frontend;review=5,6 -->
- [x] capability stays dark until owning write and snapshot-v2 activation gates <!-- omo:id=delivery-editor-dark-ship;stage=4;scope=shared;review=6 -->
- [ ] local tests, E2E, visual/a11y and current-head checks are green <!-- omo:id=delivery-editor-verification;stage=4;scope=shared;review=6 -->
