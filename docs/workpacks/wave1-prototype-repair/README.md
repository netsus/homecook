# Slice: wave1-prototype-repair

## Goal

`ui/designs/prototypes/claude-design-260505-wave1`를 service porting의 신뢰 가능한 기준으로 만들기 위해, 사용자가 MVP와 비교해 확인한 prototype의 화면 이동, modal/interaction, visual/layout, 기능 로직 문제를 repair slice로 나눠 고친다.

이 workpack은 **prototype 전용**이다. MVP service source는 수정하지 않는다. Prototype Repair 0~4와 2026-05-11 follow-up repair가 모두 merge되고 fixed prototype이 freeze된 뒤에만 `docs/workpacks/wave1-service-porting-plan.md`의 service Slice A~F 재포팅을 시작한다.

## Branches

- Repair 0: `fix/wave1-prototype-navigation-repair`
- Repair 1: `fix/wave1-prototype-modal-interaction-repair`
- Repair 2: `fix/wave1-prototype-visual-repair`
- Repair 3: `fix/wave1-prototype-functional-logic-repair`
- Repair 4: `chore/wave1-prototype-freeze-gate`
- Follow-up planner polish: `fix/wave1-prototype-planner-polish-repair`
- Follow-up settings/layout polish: `fix/wave1-prototype-settings-layout-repair`
- Follow-up menu/inputs/leftovers: `fix/wave1-prototype-menu-inputs-leftovers-repair`
- Follow-up shopping flow: `fix/wave1-prototype-shopping-flow-repair`
- Final follow-up freeze: `docs/wave1-prototype-followup-freeze`
- Final QA manual-create validation: `fix/wave1-prototype-manual-create-validation`
- Final QA settings account split: `fix/wave1-prototype-settings-account-split`
- Final QA leftovers target selection: `fix/wave1-prototype-leftovers-target-selection`
- Final follow-up freeze 2: `docs/wave1-prototype-followup2-freeze`
- Final modal sheet unification: `fix/wave1-prototype-modal-unification`
- Final planner week rail snap: `fix/wave1-prototype-week-rail-snap`
- Final planner row density: `fix/wave1-prototype-planner-row-density`
- Final follow-up freeze 3: `docs/wave1-prototype-followup3-freeze`

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
- Repair 4 recorded the initial fixed prototype commit SHA; the follow-up freezes update that SHA after PRs #391~#402. Later service porting uses the updated commit as a read-only reference.

## Freeze Status

- Fixed prototype implementation SHA: `4b49e05906c998fe83f68a2fa374bf53b7079291`
- Closeout note: `docs/workpacks/wave1-prototype-repair/closeout.md`
- Merged repair PRs:
  - Repair 0 navigation: #386, merge commit `268893953f9b831c299e0378cfab8863b6b8a858`
  - Repair 1 modal/interaction: #387, merge commit `d351ab1405d979d8bf1f6db305a9594b618c070f`
  - Repair 2 visual/layout: #388, merge commit `0d36d871f71a797d61f8e50604f2190bd6e6500e`
  - Repair 3 functional logic: #389, merge commit `95a93180a1329d2b317a561aa7c954a39cbe104c`
  - Repair 4 freeze gate: #390, merge commit `e5c897201cea6b641b5e811f992610c256c4f2c3`
  - Follow-up planner polish: #391, merge commit `c89f71aa590b37f7eb45c0ba954b2c449ed9fc10`
  - Follow-up settings/layout polish: #392, merge commit `43f65e33782c489b48d67c4b4c76267566f7130e`
  - Follow-up menu/inputs/leftovers: #393, merge commit `9ba3740b2bab07e7540f7206ec064a0ac0493724`
  - Follow-up shopping flow: #394, merge commit `0000c86a7d6f719e2bb1c0966c6d1e307061df7c`
  - Final QA manual-create validation: #396, merge commit `28d114dcdc4bf750ce7841f5f8c42c69bb394abc`
  - Final QA settings account split: #397, merge commit `fa2a64a1e5c0548ec946d9a417333671a8572c30`
  - Final QA leftovers target selection: #398, merge commit `c83a851f95e358cf07f5a21c6f413ee091a3d2be`
  - Final follow-up freeze 2: #399, merge commit `cf1b303283d08c6df7e10e0b4dd5e8b47aedc53d`
  - Final modal sheet unification: #400, merge commit `9d096c677274dce266318b0c383f8a1c82c02d14`
  - Final planner week rail snap: #401, merge commit `4fc940ca8e69528755300c88c1f95a1467775eef`
  - Final planner row density: #402, merge commit `4b49e05906c998fe83f68a2fa374bf53b7079291`

Service Slice A~F re-porting must pin the fixed prototype implementation SHA above. The follow-up freezes supersede the initial Repair 4 SHA, the earlier follow-up SHA `0000c86a7d6f719e2bb1c0966c6d1e307061df7c`, and the final QA SHA `c83a851f95e358cf07f5a21c6f413ee091a3d2be` because the user provided additional prototype-finalization changes after PR #390, after PR #394, and after PR #398.

## Repair Slices

| Order | Repair Slice | Goal | User Items |
| --- | --- | --- | --- |
| 0 | Navigation And Return Context | 상단 뒤로가기와 modal-origin return context 보정 | App Shell/Header/Bottom Tab 1~4 |
| 1 | Modal And Interaction Fixes | modal open/close, 다중 선택, 입력 제한, 중복 방지, footer clipping 보정 | MENU_ADD 1, Save Modal 1~2, RECIPE_DETAIL 4, MANUAL_CREATE 1, SHOPPING_DETAIL 1, PANTRY 2, Bundle Picker 1 |
| 2 | Screen Visual Corrections | 화면별 visual/layout 문제 반영 | Home 1~2, RECIPE_DETAIL 1~2/5, Login 1, PLANNER 1~7, SHOPPING_DETAIL 2~3, COOK_MODE 1, PANTRY 1, MYPAGE 1, LEFTOVERS 2 |
| 3 | Functional Logic Fixes | prototype demo logic을 MVP 기대 동작에 맞춤 | RECIPE_DETAIL 3, Home 3, SETTINGS 1~3, LEFTOVERS 1 |
| 4 | Freeze And Service Porting Gate | fixed prototype evidence와 freeze 선언 | Repair 0~3 closeout |
| 5 | Planner Follow-up Polish | 플래너 주간 네비, 색상, 다중 식사 배치 보정 | 추가 변경사항 PLANNER 1.1~1.4 |
| 6 | Menu Inputs And Leftovers | 팬트리 매칭 바, 수량 숫자 입력 제한, 남은요리 인분 모달 | 추가 변경사항 MENU_ADD 2.1, MANUAL_CREATE 3.1, LEFTOVERS 7.1 |
| 7 | Shopping Completion Flow | 식사별 장보기와 완료 후 팬트리 반영/read-only 전환 | 추가 변경사항 PLANNER 1.5, SHOPPING_DETAIL 4.1 |
| 8 | Settings And Pantry Layout | 팬트리/설정 버튼 정렬, 저장/취소, 5개 끼니 제한 보정 | 추가 변경사항 PANTRY 5.1, SETTINGS 6.1~6.5 |
| 9 | Follow-up Freeze | fixed prototype SHA와 closeout/service-porting 기준 갱신 | Repair 5~8 closeout |
| 10 | Manual Create Final Validation | 직접등록 완료 전 빈 재료/조리법 필드 차단 | 추가 변경사항 MANUAL_CREATE 1.1 |
| 11 | Settings Account Split | 끼니 컬럼 dirty state, 계정/닉네임/로그아웃/회원탈퇴 위치 보정 | 추가 변경사항 SETTINGS 2.1~2.2 |
| 12 | Leftovers Target Selection | 진입 경로별 날짜/끼니/인분 선택 범위 분기 | 추가 변경사항 LEFTOVERS 3.1 |
| 13 | Final Follow-up Freeze 2 | fixed prototype SHA와 closeout/service-porting 기준 재갱신 | Repair 10~12 closeout |
| 14 | Modal Sheet Unification | 모달 배경/형식/위치를 white bottom sheet로 통일 | 추가 변경사항 모달 1.1~1.3 |
| 15 | Planner Final Polish | 주간 날짜 rail 7일 fit/snap, 끼니 row density, border 정리 | 추가 변경사항 플래너 2.1~2.5 |
| 16 | Final Follow-up Freeze 3 | fixed prototype SHA와 closeout/service-porting 기준 최종 재갱신 | Repair 14~15 closeout |

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

Codex may attach to the user-provided Claude session `2937f409-95c1-4627-a6e2-3febf3e3955f` when a repair slice needs cross-model review.

Required recording:

- `session_attach_mode=resume`
- `model=opus`
- `effort=xhigh`
- `permission_mode=bypassPermissions`

Use `--resume 2937f409-95c1-4627-a6e2-3febf3e3955f`, not `--session-id`.
