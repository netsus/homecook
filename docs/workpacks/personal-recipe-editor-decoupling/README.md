# personal-recipe-editor-decoupling

> Stage 1 contract lock. Approved master plan SHA-256 `d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d` (1,018 lines). Official baseline: requirements v1.7.22, screens v1.5.28, flow v1.3.25, DB v1.3.23, API v1.2.27.

## Goal

planner에 결합된 `MANUAL_RECIPE_CREATE`를 재사용 가능한 editor shell과 순수 form primitives로 분리한다. 공개 `RECIPE_DETAIL`의 fork 진입, owner-private detail의 편집·삭제 진입, standalone create와 기존 planner-add가 같은 입력 규칙을 쓰되 서로의 복귀·저장 의미를 섞지 않게 한다.

## Branches

- Stage 1 docs: `docs/personal-recipe-editor-decoupling`
- Stage 4 frontend shell: `feature/fe-personal-recipe-editor-decoupling`
- Release train: C. 구현 선행조건은 #3 runtime과 merged `31-recipe-media-tags`, `36e-recipe-tags-frontend`다.
- Stage 1 author, internal 1.5 reviewer/repair-final owner, frontend implementation owner, security/ownership reviewer, five-axis reviewer, design critic와 product-design-authority reviewer는 서로 다른 Codex 세션을 사용한다. Claude는 사용하지 않는다.

## In Scope

- editor composition 분리
  - pure form primitives는 title, base servings, ingredient/product rows, steps/cooking method, tags와 managed image object draft를 표현한다.
  - shell은 `planner-add | personal-create | personal-edit | public-fork` context와 initial draft, submit/cancel destination, dirty state, permissions를 소유한다.
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
  - 390px와 320px에서 CTA wrap/priority, sticky submit, ingredient/step rows, keyboard/focus, dirty-discard dialog가 겹치거나 잘리지 않아야 한다. 320px wrap/tab order는 primary `플래너에 추가 → 요리하기`, secondary `내 레시피로 수정 | 편집`, tertiary `삭제` 순이며 destructive action을 primary row에 올리지 않는다.

Schema Change:
- [x] 없음 — #5는 UI/editor composition과 navigation ownership만 분리한다. `recipes`/API write contract는 #6이 구현한다.
- [ ] 있음

## Out of Scope

- `POST /recipes` public fork persistence, `PATCH /recipes/{id}`, `DELETE /recipes/{id}`, future-plan impact token, optimistic concurrency, RLS/DB RPC (#6/#7)
- `personal_recipe_v2` capability activation 또는 public-fork/personal-edit external write activation; #8 snapshot-v2 cook complete gate 전에는 dark-ship
- official contract에 없는 editor endpoint, route, field, status, error code, history/timeline, trash/restore 또는 public publish UI
- `MYPAGE`나 `RECIPEBOOK_DETAIL`의 새 edit CTA/layout. 기존 item→`RECIPE_DETAIL` navigation만 유지
- recipebook cover picker/reference upgrade, YT import redesign, PLANNER_WEEK shell, COOK_MODE 또는 MEAL_LOG UI
- public recipe mutation, other-owner private 존재 추론, client-selected visibility/owner/public image path
- merged predecessor 결과를 되돌리거나 browser direct Storage mutation을 복원하기

## Dependencies

| Gate | Current state | Meaning |
| --- | --- | --- |
| official contract PR #1072 | merged | v1.7.22/v1.5.28/v1.3.25/v1.3.23/v1.2.27 authority available |
| `recipe-visibility-read-hardening` Stage 1 PR #1077 | merged | #3 docs locked; runtime implementation remains #5 implementation predecessor |
| `31-recipe-media-tags` | merged required | existing image upload/object-ID/cancel surface must be reused |
| `36e-recipe-tags-frontend` | merged required | existing tag form/primitives must be reused |
| `recipe-snapshot-authority-foundation` Stage 1 PR #1078 | merged | future writes must preserve immutable history; #5 does not implement snapshot writes |
| `recipebook-diary-port` | not a predecessor | MYPAGE/RECIPEBOOK_DETAIL remain untouched |

> Roadmap status is `docs` while workflow lifecycle remains `planned`. This Stage 1 docs merge does not activate editor CTA or personal writes.

## Context Contract

| Context | Entry | Initial data | Primary success | Cancel/back |
| --- | --- | --- | --- | --- |
| `planner-add` | existing menu-add/manual flow | empty draft + planner date/meal context | existing create then plan servings/Meal flow | existing MENU_ADD/MEAL_SCREEN origin |
| `personal-create` | personal create entry owned by existing navigation | empty draft, no planner requirement | new private detail after #6 write activation | invoking detail/list origin |
| `personal-edit` | owner-private `RECIPE_DETAIL → 편집` | current private recipe revision/draft | same private recipe ID detail | same recipe detail |
| `public-fork` | public `RECIPE_DETAIL → 내 레시피로 수정` | copied editable draft + immutable public origin identity | new owner-private recipe ID detail | original public detail |

- internal routing may encode context, but this workpack does not invent a new public API path or stable query parameter.
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
- public `RECIPE_DETAIL` source는 read-only다. `내 레시피로 수정`은 별도 fork draft를 여는 secondary action이며 detail field를 inline mutation하지 않는다. capability-off personal editor도 write가 활성화된 것처럼 보이지 않는다.
- unauthenticated protected entry는 login gate/`401` 의미로 같은 public recipe와 draft action을 보존한다. authenticated other-owner private, deleted 또는 quarantined content는 login prompt가 아니라 `404` non-disclosure를 렌더링해 존재를 추론할 수 없게 한다.
- detail/editor load error는 기존 안전한 content/draft를 숨기지 않고 retry를 제공한다. access 판정 실패를 public 또는 owner state로 fallback하지 않는다.

## Editor / Navigation Contract

- form primitives contain no router, planner, auth, persistence or destination decisions. They emit normalized draft changes and validation state only.
- shell owns submit adapter, busy/error state, dirty detection, destination and managed upload cancellation. A context adapter cannot silently call another context's save path.
- initial draft equality is canonical content equality, not object identity. upload object/state changes, tag edits, ingredient/product changes and step reorder/add/delete all mark dirty.
- cancel/back with no changes returns immediately. Dirty cancel opens an accessible confirmation with `계속 편집 | 변경사항 버리기`; browser back and in-app close use the same guard.
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
320px: 플래너에 추가 → 요리하기 → fork/edit → delete 순으로 wrap/tab
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

`temporary`. Stage 1 locks the official interaction contract only. Stage 4 implementation, independent design critique and screenshot/Figma authority approval are still pending.

## QA / Test Data Plan

### Stage 1 gate

- this docs PR runs current SOT/workflow/workpack/automation/bookkeeping validators, focused workflow Vitest, lint, typecheck, dependency audit and diff check only.
- Stage 4 first writes component/navigation regression tests and records RED before shell extraction, CTA or dirty guard production code.
- future component/Playwright/visual/authority commands below are required implementation artifacts, not commands claimed executable in this docs PR.

### Future fixtures

- public/auth, public/anon login round-trip, owner-private, other-owner-private, deleted and quarantined visibility fixtures.
- four editor contexts with identical form primitives but distinct initial data, submit adapter, destination and planner side effects.
- title/servings, generic ingredient, exact product/version provenance, add/change/delete/reorder steps, tags, existing/new/replaced/cancelled images.
- clean cancel, dirty browser back/in-app close, stay/discard, cancel API failure, duplicate submit, server validation, unauthorized/stale access and retry.
- public fork source unchanged and new private ID; personal edit same ID; secondary save new ID; planner-add alone creates Meal.
- current and immediate-previous dark-ship compatibility with CTA/write flag off and no mutable-history regression.

## Key Rules

- #5 separates UI composition and navigation; #6 owns persistence, RLS and recipe write RPCs.
- public source is immutable; fork success is a new owner-private ID.
- normal personal save keeps identity; only explicit secondary save creates a new identity.
- visibility and owner checks are server-authoritative and other-owner private is non-inferable.
- planner-add is the only context that automatically continues into Meal creation.
- managed image object ID and existing tag rules are reused; no browser Storage mutation or client visibility authority.
- MYPAGE/RECIPEBOOK_DETAIL stay out of scope.
- CTA and external personal write remain dark until the approved capability/snapshot-v2 activation gate.

## Delivery Checklist

- [ ] shared pure form primitives are separated from context shell/router/persistence <!-- omo:id=delivery-editor-primitives;stage=4;scope=frontend;review=5,6 -->
- [ ] all four contexts preserve distinct initial data, submit, success and cancel destinations <!-- omo:id=delivery-editor-contexts;stage=4;scope=frontend;review=5,6 -->
- [ ] public/anon/owner/other-owner/deleted/quarantined CTA matrix is fail-closed <!-- omo:id=delivery-editor-cta-matrix;stage=4;scope=frontend;review=5,6 -->
- [ ] public-fork login round-trip restores the same recipe and draft action <!-- omo:id=delivery-editor-login-return;stage=4;scope=frontend;review=5,6 -->
- [ ] primary save/same ID, secondary new ID and public fork/new private ID are not conflated <!-- omo:id=delivery-editor-identity;stage=4;scope=frontend;review=5,6 -->
- [ ] dirty discard, duplicate submit, validation/error and navigation guards preserve draft integrity <!-- omo:id=delivery-editor-dirty;stage=4;scope=frontend;review=5,6 -->
- [ ] image object/cancel and tag primitives reuse predecessor contracts without direct Storage mutation <!-- omo:id=delivery-editor-media-tags;stage=4;scope=frontend;review=5,6 -->
- [ ] MYPAGE/RECIPEBOOK_DETAIL remain unchanged and navigate items to RECIPE_DETAIL <!-- omo:id=delivery-editor-surface-boundary;stage=4;scope=frontend;review=5,6 -->
- [ ] 390px/320px screenshots and independent design critic/authority reviews pass <!-- omo:id=delivery-editor-design-authority;stage=4;scope=frontend;review=5,6 -->
- [ ] capability stays dark until owning write and snapshot-v2 activation gates <!-- omo:id=delivery-editor-dark-ship;stage=4;scope=shared;review=5,6 -->
- [ ] local tests, E2E, visual/a11y and current-head checks are green <!-- omo:id=delivery-editor-verification;stage=4;scope=shared;review=5,6 -->
