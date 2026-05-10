# Slice: wave1-prototype-repair

## Goal

`ui/designs/prototypes/claude-design-260505-wave1`를 service porting의 신뢰 가능한 기준으로 만들기 위해, 사용자가 MVP와 비교해 확인한 prototype의 화면 이동, modal/interaction, visual/layout, 기능 로직 문제를 repair slice로 나눠 고친다.

이 workpack은 **prototype 전용**이다. MVP service source는 수정하지 않는다. Prototype Repair 0~4가 모두 merge되고 fixed prototype이 freeze된 뒤에만 `docs/workpacks/wave1-service-porting-plan.md`의 service Slice A~F 재포팅을 시작한다.

## Branches

- Repair 0: `fix/wave1-prototype-navigation-repair`
- Repair 1: `fix/wave1-prototype-modal-interaction-repair`
- Repair 2: `fix/wave1-prototype-visual-repair`
- Repair 3: `fix/wave1-prototype-functional-logic-repair`
- Repair 4: `fix/wave1-prototype-freeze`

## Source Of Truth

- User QA list from 2026-05-11
- MVP/official docs for functional behavior
- `ui/designs/prototypes/claude-design-260505-wave1` for prototype implementation
- `docs/workpacks/wave1-service-porting-plan.md`

## In Scope

- Prototype app state/routing/back behavior
- Prototype modal behavior and demo interaction
- Prototype visual/layout corrections explicitly listed by user
- Prototype freeze evidence and closeout note

## Out Of Scope

- MVP service implementation files outside `ui/designs/prototypes/claude-design-260505-wave1`
- API/DB/status/endpoint/field changes
- New npm dependencies
- Service visual porting into `app/`, `components/`, or production source
- Contract evolution beyond documenting candidates

## Contamination Guard

- Prototype repair must stay under `ui/designs/prototypes/`.
- Service porting 100% parity means visual/layout parity only.
- MVP routes, API calls, submit behavior, auth, saved/deleted/restored state, and official status transitions remain MVP/official-doc sourced.
- Prototype broken behavior must be repaired in prototype or documented; it must not be copied into service.
- Each repair slice PR must merge before the next repair slice starts.
- Repair 4 records the fixed prototype commit SHA. Later service porting uses that commit as a read-only reference.

## Repair Slices

| Order | Repair Slice | Goal | User Items |
| --- | --- | --- | --- |
| 0 | Navigation And Return Context | 상단 뒤로가기와 modal-origin return context 보정 | App Shell/Header/Bottom Tab 1~4 |
| 1 | Modal And Interaction Fixes | modal open/close, 다중 선택, 입력 제한, 중복 방지, footer clipping 보정 | MENU_ADD 1, Save Modal 1~2, RECIPE_DETAIL 4, MANUAL_CREATE 1, SHOPPING_DETAIL 1, PANTRY 2, Bundle Picker 1 |
| 2 | Screen Visual Corrections | 화면별 visual/layout 문제 반영 | Home 1~2, RECIPE_DETAIL 1~2/5, Login 1, PLANNER 1~7, SHOPPING_DETAIL 2~3, COOK_MODE 1, PANTRY 1, MYPAGE 1, LEFTOVERS 2 |
| 3 | Functional Logic Fixes | prototype demo logic을 MVP 기대 동작에 맞춤 | RECIPE_DETAIL 3, Home 3, SETTINGS 1~3, LEFTOVERS 1 |
| 4 | Freeze And Service Porting Gate | fixed prototype evidence와 freeze 선언 | Repair 0~3 closeout |

## Expected Files

- `ui/designs/prototypes/claude-design-260505-wave1/app.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/components.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/home.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/detail.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/modals.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/planner.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/extras.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/pantry.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/mypage.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/desktop-screens.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/HANDOFF.md`

## Verification

- Targeted prototype smoke where possible
- 320px and 390px screenshot evidence for visual slices
- `diff -q ui/designs/prototypes/claude-design-260505-wave1/index.html ui/designs/prototypes/claude-design-260505-wave1/homecook-baemin-prototype.html`
- `git diff --check`
- `pnpm validate:workflow-v2`
- Current-head GitHub checks before merge

## Claude Delegate

Codex may attach to the user-provided Claude session `39d5c7fb-0624-4e39-bc3c-7fa87fb03462` when a repair slice needs cross-model review.

Required recording:

- `session_attach_mode=resume`
- `model=opus`
- `effort=high`
- `permission_mode=bypassPermissions`

Use `--resume 39d5c7fb-0624-4e39-bc3c-7fa87fb03462`, not `--session-id`.
