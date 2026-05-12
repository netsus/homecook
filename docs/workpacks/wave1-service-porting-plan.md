# Wave1 Service Porting Plan

> 목적: `ui/designs/prototypes/claude-design-260505-wave1`에 정리된 앱/웹 디자인 개선사항을 실제 서비스로 작은 vertical slice 단위로 포팅하기 위한 새 세션용 실행 계획이다.
> 작성일: 2026-05-10 KST
> 기준 프로토타입: `ui/designs/prototypes/claude-design-260505-wave1`
> fixed prototype implementation SHA: `9bf7a34c6b422d0c9981d4c2968e3350d5a28892`
> 핵심 원칙: 프로토타입은 visual/layout source of truth이고, 기능 동작은 현재 MVP 구현과 공식 문서가 source of truth다. 공식 문서와 실제 API 계약을 넘는 변경은 먼저 contract-evolution 문서/PR로 닫고, FE는 그 계약을 그대로 소비한다.
> 2026-05-11 Phase 1 update: Wave1 모바일 앱 재포팅은 `ui/designs/WAVE1_MOBILE_APP_BASELINE.md`를 우선 디자인 기준으로 사용한다. 모바일 목표는 `90+` 또는 near-100%가 아니라 fixed prototype reference 대비 100% parity다.
> 2026-05-12 Phase 2 update: 앱/웹 책임 분리와 exact-ready/freeze 대상은 `ui/designs/WAVE1_APP_WEB_RESPONSIBILITY_MATRIX.md`를 따른다.
> 2026-05-12 contract update: 사용자 결정에 따라 official docs가 `요구사항 v1.6.6 / 화면정의서 v1.5.3 / 유저flow v1.3.3 / DB v1.3.3 / API v1.2.4`로 갱신됐다. Phase4 재진행 전 이 계약을 먼저 구현/검증한다.
> 2026-05-12 reference refresh gate: Phase4 재진행 전 `HOME_SORT_OPEN_STATE`와 `SHOPPING_DETAIL_PANTRY_REFLECT_PICKER` fixed reference를 새 계약 기준으로 다시 freeze한다.
> 2026-05-12 derived state UI prep: Phase4 재진행 전 `loading / skeleton / empty / error / unauthorized / not-found / submitting` 같은 prototype에 직접 없는 상태 UI는 `prototype-derived design`으로 분류하고, 공통 규칙 + 공통 컴포넌트 + 대표 3화면(HOME / RECIPE_DETAIL / PLANNER_WEEK)까지만 먼저 잠근다. 나머지 화면은 각 Phase4 slice 안에서 같은 패턴으로 확산한다.

## Current Status

- Wave1 vNext prototype은 최신 기준 프로토타입으로 사용한다.
- Wave1 모바일 앱 재포팅의 기준 문서는 `ui/designs/WAVE1_MOBILE_APP_BASELINE.md`다.
  - Phase 2 row-by-row 책임 분리 기준은 `ui/designs/WAVE1_APP_WEB_RESPONSIBILITY_MATRIX.md`다.
  - Phase 3 reference freeze 이후 `HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK`, `MENU_ADD`, `SHOPPING_DETAIL`, `PANTRY`, `MYPAGE`, `SETTINGS`, `ACCOUNT`, `LEFTOVERS`에 더해 `LOGIN`, `GLOBAL::LoginGateModal`, `ATE_LIST`, `RECIPEBOOK_DETAIL`, `MEAL_SCREEN`, `SHOPPING_FLOW_SELECT/REVIEW`, `COOK_READY_LIST`, `COOK_MODE_PLANNER/STANDALONE`, `MANUAL_RECIPE_CREATE`, `YT_IMPORT/REVIEW`, MENU_ADD 내부 picker, PANTRY sheet, RECIPE_DETAIL popup, HOME sort/filter modal, SHOPPING_DETAIL pantry reflect, COOK_MODE consumed checklist, SETTINGS confirm/sheet, MYPAGE recipebook/shopping-list tab 상태가 exact-reference-ready다.
  - `GLOBAL::LoginGateModal`은 prototype-owned phone-shell `?modal=login-gate` trigger와 390px/320px reference가 추가되어 `needs-prototype-freeze`에서 해제됐다.
  - 2026-05-12 contract-evolution: HOME `latest` sort, SavePopup multi-save, shopping history `completed_at` + `다시열기`, leftovers/ate card metadata, recipebook detail metadata, prototype colors/touch sizes/bottom-tab icons are now official Wave1 criteria.
  - Phase4 재진행 전 reference refresh 대상: HOME sort-open state, pantry reflect picker state. 이전 reference가 계약과 충돌하면 visual 100% 근거로 쓰지 않는다.
  - `wave1-derived-state-ui-prep`는 완료됐다. 이 prep은 fixed reference가 없는 상태 화면을 exact parity 대상으로 과장하지 않고, MVP 기능 계약을 유지한 채 Wave1 mobile visual language에서 파생한 공통 상태 UI 기준을 잠갔다.
  - 기존 C2 / h6 / h7 / h8 design authority와 PR #373, #374, #376, #379, #381, #383 evidence는 historical evidence다.
  - fixed reference가 있는 모바일 surface는 색상, 폰트, spacing, radius, shadow, layout, icon, sheet/bottom-tab geometry까지 prototype과 일치해야 한다.
  - broad approved divergence, coral-vs-mint token mapping, non-Jua font substitution, warm-cream background 유지 같은 이전 예외는 현재 Wave1 mobile 100% parity completion proof로 사용할 수 없다.
- 2026-05-11 Prototype Repair 0~4 및 follow-up repair #391~#404 이후 service porting 기준은 fixed prototype implementation SHA `9bf7a34c6b422d0c9981d4c2968e3350d5a28892`다.
  - Freeze closeout: `docs/workpacks/wave1-prototype-repair/closeout.md`
  - Reference lock manifest: `ui/designs/reference/wave1-fixed-prototype/manifest.json`
  - Committed reference screenshots: `ui/designs/reference/wave1-fixed-prototype/*.png`
  - 이후 Slice A~F prompt와 PR body는 이 SHA를 read-only visual/layout reference로 명시한다.
  - 이 SHA는 초기 Repair 4 freeze reference, 이전 follow-up SHA `0000c86a7d6f719e2bb1c0966c6d1e307061df7c`, Final QA SHA `c83a851f95e358cf07f5a21c6f413ee091a3d2be`, 이전 planner polish SHA `4b49e05906c998fe83f68a2fa374bf53b7079291`를 추가 prototype-finalization PR 이후 갱신한 최종 기준이다.
- 2026-05-10 사용자 결정: 기존 Wave1 포팅 PR들은 merge 이력으로만 본다. 사용자가 원하는 다음 작업은 **전체 Wave1 slice A~F를 다시 prototype 기준으로 디자인 재감사/재포팅**하는 것이다.
  - 기존 PR #373, #374, #376, #379, #381, #383의 screenshot/authority 결과는 historical evidence일 뿐, 현재 visual parity 완료 근거로 재사용하지 않는다.
  - 각 slice는 기존 MVP 기능과 공식 계약을 보존하면서, `claude-design-260505-wave1`와 실제 서비스 화면의 visual/layout 차이를 다시 확인하고 필요한 만큼 수정한다.
  - Slice F의 PR #383 문제는 전체 재포팅이 필요한 대표 사례이며, 다음 계획이 Slice F에만 한정된다는 뜻이 아니다.
- `planner-column-customization`은 이미 완료됐다.
  - contract-evolution PR: #367
  - Stage 1 docs PR: #368
  - Stage 2 backend PR: #369
  - Stage 4~6 frontend/closeout PR: #370
  - 결과: 신규 기본 끼니 컬럼은 `아침 / 점심 / 저녁` 3개, SETTINGS에서 1~5개 범위로 이름 변경/추가/삭제 가능.
- 따라서 이후 포팅 slice에서 플래너 컬럼 3개 기본값과 SETTINGS 컬럼 관리는 다시 만들지 말고, 이미 merged된 계약과 컴포넌트를 소비한다.
- 기존 `docs/workpacks/baemin-prototype-home-porting`과 일부 HOME 범위가 겹칠 수 있다. HOME 관련 slice 착수 전 현재 구현과 해당 workpack 상태를 먼저 확인한다.
- **Slice A `wave1-port-foundation`**: merged, but visual parity re-audit required.
  - Stage 1 docs PR: #372
  - Stage 4~6 frontend/closeout PR: #373
  - 결과: AppShell bottom-safe 조건부, Button/Chip 44px 터치 타겟, Card interactive cursor, ModalFooterActions min-h, SelectionChipRail px-1, SortDropdown primitive 신규 도입. Claude final authority gate pass, blocker 0.
- **Slice B `wave1-port-discovery-detail`**: merged, but visual parity re-audit required.
  - Stage 1 docs PR: #374
  - 결과: HOME header 단순화, sort dropdown 전환, filter chip 재배치, RECIPE_DETAIL 별점 제거/행동 metric/CTA 재구성, save modal 정리, login provider 축소. Stage 2 N/A.
  - 2026-05-12 contract update 이후 Stage 2 is no longer N/A: `GET /recipes sort=latest`와 `POST /recipes/{id}/save book_ids[]` 구현/테스트가 필요하다.
- **Slice C `wave1-port-planner-meal-add`**: merged, but visual parity re-audit required.
  - Stage 1 docs PR: #376
  - 결과: PLANNER_WEEK 주간 이동/이모지·배지 제거/CTA 정리, MENU_ADD 2열 옵션, MANUAL_CREATE 재료 모달, MEAL_SCREEN 정리. Stage 2 N/A.
- **Slice D `wave1-port-shopping-cooking`**: merged, but visual parity re-audit required.
  - Stage 1 docs PR: #378
  - Stage 4~6 frontend/closeout PR: #379
  - 결과: SHOPPING_FLOW/SHOPPING_DETAIL/COOK_MODE Wave1 UI-only 포팅, authority blocker 0.
  - 2026-05-12 contract update 이후 `/shopping/lists` 목록 응답에 `completed_at`을 포함하고, pantry reflect picker는 pre-complete state 기준으로 phase4를 진행한다.
- **Slice E `wave1-port-pantry`**: merged, but visual parity re-audit required.
  - Stage 1 docs PR: #380
  - Stage 4~6 frontend/closeout PR: #381
  - 결과: PANTRY/add sheet/bundle picker/multi-delete Wave1 UI-only 포팅, authority blocker 0. `ingredients.image_url`은 contract-evolution 후보로 분리.
- **Slice F `wave1-port-account-library-leftovers`**: merged, but visual parity repair required.
  - Stage 1 docs PR: #382
  - Stage 4~6 frontend/closeout PR: #383
  - Stage 4~6 frontend/closeout branch: `feature/fe-wave1-port-account-library-leftovers`
  - Claude Stage 1 handoff attempted via resume session `3f4ca745-db71-4392-a3f1-4e3c4493e9bc`; provider limit reset 13:20 Asia/Seoul blocked editing, so Codex fallback prepared Stage 1 docs and frontend closeout.
  - 결과: MYPAGE visible settings entry, LEFTOVERS/ATE_LIST clipping/copy polish, ATE_LIST uneat API preserved with `남은요리로 복귀` label, RECIPEBOOK_DETAIL custom book menu, 390/320 screenshot evidence, authority blocker 0, `pnpm verify:frontend` passed.
  - 2026-05-12 contract update 이후 Stage 2 is no longer N/A: leftovers/ate card metadata, recipebook detail metadata, shopping history `completed_at`를 API/types/tests에 반영해야 한다.
  - 2026-05-10 사용자 확인: #383 closeout은 기능 보존과 일부 polish는 통과했지만, 확정 디자인 소스 `ui/designs/prototypes/claude-design-260505-wave1`와 화면 구조/카드 밀도/배민 톤/섹션 구성/모바일·데스크톱 layout이 충분히 맞지 않는다. #383 authority/evidence는 visual parity 완료 근거로 재사용하지 말고, PR #383 보정 작업으로 다시 캡처/비교/수정한다.

## Read First

새 세션은 아래 파일을 먼저 읽는다.

1. `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
2. `docs/workpacks/README.md`
3. `docs/engineering/slice-workflow.md`
4. `docs/engineering/agent-workflow-overview.md`
5. `docs/engineering/product-design-authority.md`
6. `docs/design/design-tokens.md`
7. `ui/designs/WAVE1_MOBILE_APP_BASELINE.md`
8. `ui/designs/WAVE1_APP_WEB_RESPONSIBILITY_MATRIX.md`
9. `docs/design/mobile-ux-rules.md`
10. `docs/design/anchor-screens.md`
11. `ui/designs/BAEMIN_STYLE_DIRECTION.md`
12. slice 13+ future screen이면 `docs/workpacks/h8-baemin-prototype-reference-future-screens-direction/README.md`
13. `ui/designs/prototypes/claude-design-260505-wave1/VNEXT_DESIGN_PRINCIPLES.md`
14. `ui/designs/prototypes/claude-design-260505-wave1/HANDOFF.md`
15. 실제 구현 대상 화면의 현재 서비스 파일

토큰 기준 주의:

- Wave1 mobile 100% parity 기준 brand/font/background/material 값은 `ui/designs/WAVE1_MOBILE_APP_BASELINE.md`의 prototype baseline을 따른다.
- `docs/design/design-tokens.md`와 `app/globals.css`에 남아 있는 legacy C2/coral 값은 non-Wave1 또는 아직 이관되지 않은 web/legacy surface의 현재 구현값일 수 있으나, Wave1 mobile exact-reference-ready surface의 목표값은 아니다.
- prototype의 mint/Jua/font/asset은 더 이상 blanket exclusion이 아니다. fixed reference에 보이는 경우 exact parity 대상이며, production에서 사용할 수 없으면 surface를 `needs-prototype-freeze` 또는 unresolved asset/font decision으로 막는다.
- `ui/designs/BAEMIN_STYLE_DIRECTION.md`의 `prototype parity`, `prototype-derived design`, `out of prototype scope` 용어만 사용한다.
- 사용자가 2026-05-11에 모바일 화면의 색상과 폰트 크기까지 100% 일치를 요구했으므로, Wave1 mobile exact-reference-ready surface에서는 "approved token divergence"를 completion escape hatch로 쓰지 않는다.
- fixed prototype reference가 없는 상태 UI는 `prototype parity`가 아니라 `prototype-derived design`으로만 기록한다. 예: loading, skeleton, empty, error, unauthorized, not-found, submitting/creating/completing.

프로토타입 쪽 참고 파일:

- `ui/designs/prototypes/claude-design-260505-wave1/index.html`
- `ui/designs/prototypes/claude-design-260505-wave1/app.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/components.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/tokens.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/*.jsx`

## Working Contract

- **Visual vs Functional Source of Truth**
  - `claude-design-260505-wave1`는 화면 구조, 카드 밀도, spacing, hierarchy, 섹션 구성, responsive layout, visual tone의 기준이다.
  - 현재 MVP 구현과 공식 문서는 기능 동작, API 호출, request/response payload, route navigation, submit 동작, auth/permission, loading/empty/error/unauthorized/read-only 상태, 상태 전이의 기준이다.
  - prototype에 직접 없는 상태 UI는 MVP 기능 계약을 유지하고, Wave1 mobile token/spacing/card/button/density 규칙에서 파생한다. 이 경우 completion 문구는 "fixed reference 대비 100% pixel parity"가 아니라 "prototype-derived state UI 기준 충족"으로 쓴다.
  - 현재 구현의 낡은 시각 형태는 방어하지 않는다. 하지만 잘 동작하는 기능은 regression test로 고정하고 보존한다.
  - 프로토타입에서 버튼이 미연결, demo-only, placeholder, broken behavior인 경우 그 동작을 복사하지 않는다. UI 모양만 참고하고 `onClick`/`onSubmit`/API 연결은 현재 서비스의 정상 동작을 유지한다.
  - 테스트가 UI selector 변경 때문에 깨지면 기능 기대값은 유지하고 selector를 새 UI에 맞게 조정한다. 디자인 변경을 이유로 기능 테스트를 삭제하지 않는다.
- **전체 Wave1 재포팅 원칙**
  - 서비스 재포팅 대상은 Slice A~F 전체다. 특정 slice만 먼저 실패가 확인됐더라도, 이전 merge 상태를 전체 완료 판정으로 간주하지 않는다.
  - 단, 2026-05-11 사용자 QA에서 prototype 자체의 화면이동/동작/디자인 문제가 확인됐으므로, 서비스 재포팅을 시작하기 전에 **Prototype Repair 0~4와 follow-up repair #391~#404를 완료하고 fixed prototype을 freeze**한다.
  - 각 slice는 "현재 서비스 screenshot -> prototype reference screenshot -> 차이표 -> 기능 보존 테스트 -> 디자인 수정 -> screenshot 재캡처 -> screenshot diff + computed-style audit + geometry audit" 순서로 닫는다.
  - slice별 completion은 PR merge 여부나 visual verdict 90점 이상이 아니라 fixed prototype 대비 unclassified visual difference 0개, blocker 0개, 기능 regression 통과로 판단한다.
  - reference prototype screenshot은 `ui/designs/reference/wave1-fixed-prototype/manifest.json`에 등록된 커밋된 PNG를 사용한다. `.omx/artifacts`에만 남은 prototype screenshot은 final PR 근거로 쓰지 않는다.
  - 각 `wave1-port-*` PR은 `pnpm validate:pr-ready -- --slice <slice> --pr-body <pr-body-file> --mode frontend`를 통과해야 하며, 이 검증에는 fixed SHA, reference screenshot, service screenshot, screenshot diff, computed-style audit, geometry audit, blocker 0개, unclassified visual difference 0개 확인이 포함된다.
  - 2026-05-12 기준 `pnpm validate:wave1-prototype-lock`는 manifest `parity_mode: exact-mobile`과 exact parity PR evidence를 검사한다. historical `required_visual_verdict_score: 90` 필드는 더 이상 허용하지 않는다.
  - 한 PR에 모든 화면을 몰아넣지 않는다. 기존 vertical slice 경계 A~F를 유지하고, 각 slice repair PR을 작고 검증 가능하게 만든다.
  - Foundation Slice A는 공통 shell/component/tokens 영향이 크므로 먼저 재감사한다. 다만 기능을 깨는 전역 리팩터링은 하지 않고, 이후 slice에서 필요한 공통 primitive만 보수한다.
- product slice는 Stage 1~6 흐름을 따른다.
- Stage 1은 Claude가 workpack README/acceptance/automation-spec, `.workflow-v2/work-items/<slice>.json`, `.workflow-v2/status.json` matching item을 작성하고 `docs/workpacks/README.md`에 해당 slice row와 Status를 맞춘다.
- Stage 2는 Codex가 BE 변경이 필요한 경우만 수행한다. UI-only 또는 기존 API로 가능한 slice는 `N/A` 근거를 남긴다.
- Stage 3은 BE 변경이 있었을 때 Claude review를 받는다.
- Stage 4는 Claude가 FE 포팅을 수행한다. UI가 실제로 바뀌면 관련 `ui/designs/<SCREEN_ID>.md` 또는 authority/design closeout 메모도 현재 화면 기준으로 맞춘다.
- Stage 5는 Codex가 public design review와 authority precheck를 수행한다. authority-required slice는 Claude `final_authority_gate`에서 blocker 0개 확인 후에만 `confirmed`로 닫는다.
- Stage 6은 Codex가 code review, local verification, PR checks, merge까지 닫는다.
- 사용자가 `$claude-delegate`와 기존 Claude session을 명시하면 해당 session에 `--resume`으로 붙는다. 현재 Wave1 Phase 2 요청 session은 `a5fcbba9-be8d-4765-b939-b628995c071e`이며, `session_attach_mode=resume`, `model=opus`, `effort=high`, `permission_mode=bypassPermissions`로 기록한다.

## Stage Flow Per Slice

각 slice는 아래 순서로 진행한다.

1. Stage 1, Claude
   - `docs/workpacks/<slice>/README.md`
   - `docs/workpacks/<slice>/acceptance.md`
   - `docs/workpacks/<slice>/automation-spec.json`
   - `.workflow-v2/work-items/<slice>.json`
   - `.workflow-v2/status.json` matching item
   - `docs/workpacks/README.md`에 해당 Wave1 slice row가 없으면 먼저 등록하고 Status를 `docs`로 기록. 이미 `planned` row가 있으면 `planned -> docs`
   - `Design Authority` 섹션과 screenshot/Figma evidence 계획
   - 신규 화면, high-risk UI change, anchor extension이면 `ui/designs/<SCREEN_ID>.md`와 `ui/designs/critiques/<SCREEN_ID>-critique.md`
   - Baemin prototype 적용 화면은 `BAEMIN_STYLE_DIRECTION.md` 용어를 사용하고, slice 13+는 h8 screen/surface matrix 반영
   - 공식 문서/API와 충돌하는 항목은 `Contract Evolution Candidate`로 분리

2. Stage 2, Codex
   - BE/API/DB/status/field 변경이 필요한 경우만 구현
   - 권한, read-only, 상태 전이, idempotency 테스트 먼저
   - UI-only slice면 `N/A` 사유를 workpack/PR body에 남김

3. Stage 3, Claude
   - BE 변경 review
   - contract drift, 테스트 누락, 공식 문서 충돌 확인

4. Stage 4, Claude
   - FE 포팅
   - 구현 전에 화면별 "프로토타입 대비 현재 구현 차이표"를 작성한다.
     - reference prototype component/function
     - 현재 서비스 파일
     - 빠진 visual/layout 요소
     - 유지해야 하는 MVP 기능 동작
     - 적용할 수정 방향
   - 대상 화면의 핵심 기능 regression test를 먼저 확인하고, 부족하면 최소 기능 보존 테스트를 추가한다.
   - 기존 API wrapper `{ success, data, error }` 유지
   - `loading / empty / error / read-only / unauthorized` 상태 유지
   - 모바일 390px/320px evidence 생성
   - reference prototype screenshot과 generated service screenshot을 함께 보관한다.
   - reference prototype screenshot은 `ui/designs/reference/wave1-fixed-prototype/`의 커밋된 baseline을 사용한다.
   - PR body의 Design / Accessibility 섹션에 fixed SHA, reference screenshot path, service screenshot path, screenshot diff, computed-style audit, geometry audit, blocker count 0, unclassified visual difference 0을 기록한다.
   - `$visual-verdict`는 보조 reviewer로 사용할 수 있지만, Wave1 mobile 100% parity completion은 점수가 아니라 unclassified visual difference 0개로 판단한다.
   - 차이가 남으면 다음 코드 수정 전에 screenshot diff, computed-style audit, geometry audit의 finding을 근거로 다시 수정하고 재캡처한다.
   - parity verdict/audit 결과는 `.omx/state/<slice>/ralph-progress.json`에 pass/fail, reasoning, findings, next_actions를 저장한다.
   - new-screen/high-risk UI change는 `pnpm qa:explore -- --slice <slice>`와 `pnpm qa:eval` 수행, 생략 시 PR에 low-risk skip 근거 기록
   - Draft PR Ready 전 `pnpm validate:pr-ready -- --slice <slice> --pr-body <pr-body-file> --mode frontend`

5. Stage 5, Codex
   - screenshot evidence 기반 authority precheck / public design review
   - authority precheck는 "스크린샷이 존재한다"만으로 통과하지 않는다. prototype reference와 service generated screenshot을 나란히 보고 실제 visual parity 차이를 blocker/major/minor로 기록한다.
   - anchor screen은 authority report와 blocker 0개 확인
   - touch target, overflow, CTA clipping, text wrapping finding 기록
   - authority-required slice는 Claude final authority gate 통과 전 merge-ready로 넘기지 않음

6. Stage 6, Codex
   - code review
   - `pnpm verify:frontend`
   - 필요 시 `pnpm qa:explore -- --slice <slice>`와 `pnpm qa:eval`
   - `pnpm validate:authority-evidence-presence`
   - exploratory QA를 실행했거나 required인 경우 `pnpm validate:exploratory-qa-evidence`
   - real DB smoke가 필요한 slice는 `pnpm validate:real-smoke-presence`
   - `pnpm validate:wave1-prototype-lock -- --slice <slice> --pr-body <pr-body-file>`
   - PR checks current head green 확인
   - merge 후 알림 채널이 설정되어 있으면 Discord 알림

## Recommended Order

| Order | Slice ID | Goal | Primary Owner Flow | Notes |
| --- | --- | --- | --- | --- |
| 0 | `planner-column-customization` | SETTINGS 끼니 컬럼 관리 + PLANNER_WEEK 동적 컬럼 | Done | PR #367~#370 merged. 다시 하지 않는다. |
| 0.5 | `wave1-exact-parity-validator-baseline` | manifest/validator를 `90+` 점수 기준에서 exact mobile parity 기준으로 승격 | Done | `lock_version: 2`, `parity_mode: exact-mobile`, screenshot diff, computed-style audit, geometry audit, visual blocker 0, unclassified visual difference 0을 검증한다. 이 gate가 깨지면 Slice A~F 포팅을 시작하지 않는다. |
| 0.6 | `wave1-app-web-responsibility-matrix` | 모바일 exact-ready, needs-freeze, web-only 책임을 분리하고 token scoping 기본 경로를 확정 | Done | `ui/designs/WAVE1_APP_WEB_RESPONSIBILITY_MATRIX.md`가 기준이다. `needs-prototype-freeze` row는 Phase 3 capture/freeze 전에는 포팅하지 않는다. |
| 0.7 | `wave1-phase3-reference-freeze` | missing 모바일 prototype reference를 390px/320px fixed screenshots로 동결 | Done | 31개 surface state, 62개 신규 mobile PNG를 manifest에 추가했다. 기존 reference는 기본 capture에서 skip된다. |
| 0.8 | `wave1-login-gate-reference-freeze` | `GLOBAL::LoginGateModal` deterministic trigger와 390px/320px fixed screenshots 추가 | Done | prototype-owned `?modal=login-gate` trigger로 `GLOBAL::LoginGateModal` reference 2장을 manifest에 추가했다. Phase 4/5 재개 전 남은 `needs-prototype-freeze` row를 해제한다. |
| 0.9 | `wave1-derived-state-ui-prep` | prototype에 직접 없는 loading/skeleton/empty/error류 상태 UI의 공통 기준 잠금 | Done | `ContentState`, `Skeleton`, legacy `EmptyState`/`ErrorState`의 Wave1-derived visual 기준과 대표 3화면(HOME / RECIPE_DETAIL / PLANNER_WEEK) 적용을 닫았다. 모든 화면을 선행 PR에서 완성하지 않고, 나머지는 Slice A~F에서 확산한다. |
| A | `wave1-port-foundation` | 공통 shell, 공용 UI 패턴, CTA/칩/카드/모달 위계 | Re-audit / repair | 전체 재포팅의 첫 단계. AppShell, bottom tab, 공통 primitive가 prototype과 실제로 맞는지 다시 확인한다. |
| B | `wave1-port-discovery-detail` | HOME, RECIPE_DETAIL, save modal, login provider display | Re-audit / repair | HOME은 기존 `baemin-prototype-home-porting`과 충돌/중복 확인 후, fixed prototype reference 대비 unclassified visual difference 0을 달성한다. |
| C | `wave1-port-planner-meal-add` | PLANNER, MENU_ADD, MANUAL_CREATE, MEAL_SCREEN | Re-audit / repair | 컬럼 CRUD는 완료된 `planner-column-customization` 계약을 소비한다. PLANNER/식사추가/직접등록 화면의 layout parity를 다시 확인한다. |
| D | `wave1-port-shopping-cooking` | SHOPPING_FLOW, SHOPPING_DETAIL, COOK_READY/COOK_MODE | Re-audit / repair | PR #379 merged 이력은 완료 근거로 쓰지 않는다. 장보기 read-only/exclude/add_to_pantry 기능은 보존하고 디자인만 재포팅한다. |
| E | `wave1-port-pantry` | PANTRY, ingredient picker, bundle picker, multi-delete | Re-audit / repair | PR #381 merged 이력은 완료 근거로 쓰지 않는다. 재료 이미지 URL은 계속 계약 후보로 분리하고, 가능한 UI만 prototype에 맞춘다. |
| F | `wave1-port-account-library-leftovers` | MYPAGE, SETTINGS polish, LEFTOVERS, ATE_LIST, RECIPEBOOK_DETAIL | Re-audit / repair | PR #383은 visual parity 실패 사례다. Slice F만 다시 하는 것이 아니라 전체 재포팅 순서의 마지막 slice로 다시 닫는다. SETTINGS 컬럼 관리 완료 상태와 충돌하지 않게 조심. |
| G | `wave1-port-web-followup` | 앱 포팅 이후 웹-only 조정 | 별도 계획 | 앱 slice 완료 후 최신 프로토타입 기준으로 다시 작성. |

## Derived State UI Prep Before Phase4

`wave1-derived-state-ui-prep`은 Phase4를 오래 막는 별도 전체 리디자인이 아니다. 목적은 fixed reference가 없는 상태 화면을 화면별로 임의 해석하지 않도록, 작고 재사용 가능한 기준을 먼저 잠그는 것이다.

Closeout status: complete. `ContentState`, `Skeleton`, legacy `EmptyState`/`ErrorState`, HOME / RECIPE_DETAIL / PLANNER_WEEK representative state tests, workpack acceptance, workflow-v2 bookkeeping, and `pnpm verify:frontend` are closed. Remaining Phase4 work should consume this derived state UI baseline inside Slice A~F instead of reopening it as a separate blocker.

### Scope

- 공통 상태 UI 규칙 문서화:
  - `loading`
  - `skeleton`
  - `empty`
  - `error`
  - `unauthorized`
  - `not-found`
  - `submitting / creating / completing`
- 공통 컴포넌트 정리:
  - `components/shared/content-state.tsx`
  - `components/ui/skeleton.tsx`
  - legacy `components/ui/empty-state.tsx`
  - legacy `components/ui/error-state.tsx`
- 대표 적용 화면:
  - `HOME`
  - `RECIPE_DETAIL`
  - `PLANNER_WEEK`
- 주요 화면별 상태 UI inventory 작성:
  - exact reference가 있는 상태
  - prototype-derived로 처리할 상태
  - Phase4 각 slice에서 확산할 상태

### Non-Goals

- 이 prep에서 모든 화면의 loading/empty/error를 전부 완성하지 않는다.
- fixed reference가 없는 상태를 100% pixel parity로 주장하지 않는다.
- route, API, payload, auth, status transition, read-only 정책은 변경하지 않는다.
- 상태 copy를 공식 문서 계약보다 앞서 임의 변경하지 않는다.

### Design Classification

- fixed reference가 있는 surface: `prototype parity`
- fixed reference가 없지만 같은 화면의 visual language에서 파생 가능한 state: `prototype-derived design`
- prototype에도 없고 현재 제품 범위에도 필요하지 않은 state: `out of prototype scope`

`prototype-derived design` 상태는 아래 기준으로 닫는다:

- 현재 MVP 기능 계약과 상태 전이를 유지한다.
- Wave1 mobile token, spacing, card density, button hierarchy, bottom safe-area, typography scale을 따른다.
- old MVP glass/radius/color treatment를 제거한다.
- loading/skeleton은 최종 콘텐츠의 구조와 밀도를 예고해야 하며, 과장된 장식 카드나 화면 설명문으로 대체하지 않는다.
- empty/error/unauthorized/not-found는 사용자가 다음 행동을 이해할 수 있게 하되, fixed reference 없는 pixel parity 점수를 completion proof로 사용하지 않는다.

### Acceptance

- 공통 상태 UI 규칙과 화면별 state inventory가 문서에 남아 있다.
- `ContentState`, `Skeleton`, `EmptyState`, `ErrorState`가 Wave1-derived 기준으로 정리되어 있다.
- HOME / RECIPE_DETAIL / PLANNER_WEEK에서 대표 loading/skeleton/empty/error 또는 gate 상태가 새 기준을 소비한다.
- 기존 기능 테스트와 상태 전이 테스트는 삭제하지 않고 필요한 selector만 업데이트한다.
- PR closeout에는 `prototype-derived design` 상태와 `prototype parity` 상태를 분리해 기록한다.

## Prototype Repair Before Service Porting

서비스 화면을 다시 포팅하기 전에 `ui/designs/prototypes/claude-design-260505-wave1` 자체를 먼저 고친다. 사용자가 확인한 prototype 문제는 화면 이동, MVP와 다른 기능 동작, 일부 디자인 문제에 걸쳐 있으므로, fixed prototype이 freeze되기 전에는 service visual parity 작업을 시작하지 않는다.

중요한 구분:

- **prototype repair**는 이후 포팅 기준이 될 디자인/흐름 기준 prototype을 고치는 작업이다.
- **service porting**은 fixed prototype의 visual/layout을 실제 MVP 서비스에 반영하는 작업이다.
- prototype repair는 `ui/designs/prototypes/` 경로 내부에서만 수행한다. MVP service source는 Prototype Repair와 follow-up repair 동안 수정하지 않는다.
- prototype repair에서 고친 화면 이동은 "prototype 기준을 MVP에 맞춘 것"이지, 나중에 service route를 prototype 임의 흐름으로 바꿔도 된다는 뜻이 아니다.
- service porting의 100% parity는 visual/layout parity만 뜻한다. route, submit, API, 저장/삭제/복구, auth, 상태 전이는 MVP/공식 문서 기준을 유지한다.
- Repair slice PR은 독립적으로 리뷰 가능해야 하며, 이전 repair slice가 merge되지 않으면 다음 repair slice를 시작하지 않는다.
- Repair 4에서 initial fixed prototype commit SHA를 기록했고, follow-up freezes에서 additional repair PR #391~#404를 반영한 최종 SHA를 기록한다. 이후 service porting은 그 commit의 prototype을 read-only reference로 사용한다.
- Current fixed prototype implementation SHA: `9bf7a34c6b422d0c9981d4c2968e3350d5a28892`
- Current freeze closeout note: `docs/workpacks/wave1-prototype-repair/closeout.md`

### Prototype Repair 0: Navigation And Return Context

목표: prototype의 상단 뒤로가기와 모달 복귀가 MVP 사용 흐름과 맞게 동작하도록 고친다.

범위:

- MEAL_SCREEN에서 레시피명 클릭 -> RECIPE_DETAIL -> 뒤로가기 시 해당 끼니 화면으로 복귀
- MENU_ADD 옵션 진입 후 뒤로가기 시 식사추가 모달이 열린 PLANNER 상태로 복귀
- MYPAGE 장보기기록 -> SHOPPING_DETAIL -> 뒤로가기 시 장보기기록으로 복귀
- MYPAGE 레시피북 목록 -> RECIPEBOOK_DETAIL -> 뒤로가기 시 레시피북 목록으로 복귀

예상 파일:

- `ui/designs/prototypes/claude-design-260505-wave1/app.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/planner.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/extras.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/desktop-screens.jsx`

완료 기준:

- 뒤로가기 버튼이 단순 tab/page 초기화가 아니라 진입 context를 보존한다.
- modal-origin flow는 뒤로가기 후 원래 modal 상태를 복원한다.
- desktop/mobile shell 양쪽에서 동일한 흐름을 확인한다.

### Prototype Repair 1: Modal And Interaction Fixes

목표: 화면 이동보다 좁은 modal open/close, 선택, 입력, footer button 문제를 MVP 기대 흐름에 맞춘다.

범위:

- MENU_ADD의 레시피북/팬트리 추천/남은요리/유튜브 가져오기 option은 별도 화면이 아니라 modal로 표시
- Save Modal: 레시피북 다중 선택, 이미 저장된 책은 해제, 저장 안 된 책은 추가
- `플래너에 추가` 모달: 취소 버튼 추가, 선택 인분이 레시피 정보 영역에 실시간 표시
- Bundle Picker: 취소 버튼 글자 가로 정렬
- SHOPPING_DETAIL: 장보기 완료 후 팬트리 반영 모달을 거쳐 completed read-only 화면으로 이동
- PANTRY: 이미 팬트리에 있는 재료는 추가 모달에서 비활성화하고 중복 추가 방지
- MANUAL_CREATE: 재료 수량 입력은 숫자만 허용

예상 파일:

- `ui/designs/prototypes/claude-design-260505-wave1/app.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/modals.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/extras.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/pantry.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/planner.jsx`

완료 기준:

- modal을 닫거나 취소했을 때 의도하지 않은 page 전환이 없다.
- 선택/해제/중복 방지/숫자 입력 제한이 prototype에서 명확히 표현된다.
- contract 밖의 API/DB/status/field를 prototype 기준으로 새로 요구하지 않는다.

### Prototype Repair 2: Screen Visual Corrections

목표: 사용자가 확인한 화면별 visual/layout 문제를 fixed prototype에 반영한다.

범위:

- HOME: 재료 검색 모달 구조를 검색 input + 가로 category chip + filtered ingredient list로 변경
- HOME: recipe card에서 별점 제거, 조회수 표시, tag 내용은 MVP처럼 recipe 요약 정보로 변경, 우측 상단 저장 버튼은 save modal 연결
- RECIPE_DETAIL: hero image metric을 오른쪽 아래로 이동, 흰 배경 제거, icon/text 색상과 그림자 정리, `완료`를 `요리완료`로 변경, 칼로리 제거
- LOGIN: 소셜 로그인 버튼 잘림 수정
- PLANNER: MVP식 일주일 날짜 카드 가로 스크롤, sticky date rail, date chip -> 해당 날짜 scroll, meal card 이미지/인분/밀도 조정, `+음식` -> `+`, 색상 충돌 정리
- SHOPPING_DETAIL: Step2 장보기 목록 이름은 날짜 먼저, 마이페이지 진입 completed detail의 공유 버튼 왼쪽 `완료` 표시 제거
- COOK_MODE: 상단 recipe title 크기 확대
- PANTRY: `구매` category 제거
- MYPAGE: recipebook card의 recipe count와 description 위치/디자인 switch
- LEFTOVERS: 남은요리/다먹은요리 이동 버튼 텍스트를 `다먹은 요리`, `남은 요리`로 변경

예상 파일:

- `ui/designs/prototypes/claude-design-260505-wave1/screens/home.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/detail.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/modals.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/planner.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/extras.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/pantry.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/mypage.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/desktop-screens.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/components.jsx`

완료 기준:

- 320px/390px에서 버튼, 텍스트, modal footer가 잘리지 않는다.
- 사용자가 명시한 visual 문제는 fixed prototype에서 재현되지 않는다.
- visual 변경이 MVP 기능 기준을 뒤집지 않는다.

### Prototype Repair 3: Functional Logic Fixes

목표: prototype의 demo-only 또는 MVP와 어긋나는 기능 로직을 MVP 기준으로 맞춘다.

범위:

- RECIPE_DETAIL `요리하기`: 플래너 추가 없이 요리모드 진입 가능
- SETTINGS: 닉네임 변경 동작
- SETTINGS: 끼니 컬럼 최대 5개 제한
- SETTINGS: 환경설정 저장/취소 버튼 제공
- LEFTOVERS: 플래너에 추가해도 해당 남은요리가 남은요리 화면에서 사라지지 않음
- HOME: recipe card 우측 상단 저장 버튼이 Save Modal을 연다

예상 파일:

- `ui/designs/prototypes/claude-design-260505-wave1/app.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/home.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/detail.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/extras.jsx`
- `ui/designs/prototypes/claude-design-260505-wave1/screens/mypage.jsx`

완료 기준:

- MVP에서 정상 동작해야 하는 저장/복구/요리하기/설정 저장 흐름이 prototype에서 깨진 상태로 남지 않는다.
- service porting 때 prototype의 broken behavior를 복사할 여지를 줄인다.
- contract 밖의 API/DB/status/field를 prototype 기준으로 새로 요구하지 않는다.

### Prototype Repair 4: Freeze And Service Porting Gate

목표: repaired prototype을 service porting 기준으로 freeze한다.

필수 산출물:

- repaired prototype screenshot evidence: 320px, 390px, 가능하면 desktop
- navigation smoke evidence: 뒤로가기 4개 흐름
- modal behavior smoke evidence: MENU_ADD modal-origin flow, Save Modal, Pantry reflect, Pantry add
- `HANDOFF.md` 또는 별도 closeout note에 fixed prototype 기준과 남은 divergence 기록
- `index.html`과 `homecook-baemin-prototype.html` 정합성 확인

완료 기준:

- Prototype Repair 0~4와 follow-up repair PR #391~#404가 merged된 뒤에만 service Slice A~F 재포팅을 시작한다.
- 이후 service porting prompt는 fixed prototype 경로/commit SHA를 명시한다.
- 이후 service porting prompt는 `fixed_prototype_implementation_sha=9bf7a34c6b422d0c9981d4c2968e3350d5a28892`를 명시한다.
- fixed prototype의 화면 이동은 MVP 기준으로 보정된 reference이며, service route 변경 근거로 오해하지 않게 기록한다.

## All-Slice Re-Port Charter

이번 계획의 목표는 이미 merge된 특정 PR을 보정하는 것이 아니라, `claude-design-260505-wave1` 기준으로 **앱 화면 전체 Wave1 디자인 포팅을 다시 신뢰 가능하게 닫는 것**이다.

재포팅 범위:

- Slice A: 공통 shell, bottom tab, 공용 UI primitive, app-wide spacing/safe-area
- Slice B: HOME, RECIPE_DETAIL, save modal, login provider display
- Slice C: PLANNER, 식사추가, recipebook/pantry/search add flows, MANUAL_CREATE, MEAL_SCREEN
- Slice D: SHOPPING_FLOW, SHOPPING_DETAIL, pantry exclusion section, COOK_READY_LIST, COOK_MODE
- Slice E: PANTRY, ingredient add modal, bundle picker, category/search, multi-delete
- Slice F: MYPAGE, SETTINGS, LEFTOVERS, ATE_LIST, RECIPEBOOK_DETAIL

각 slice에서 반복할 공통 절차:

1. 기존 workpack/acceptance와 prototype reference 파일을 읽는다.
2. 서비스 현재 화면 screenshot과 prototype reference screenshot을 390px/320px에서 확보한다. 가능하면 desktop도 확보한다.
3. 화면별 "프로토타입 대비 현재 구현 차이표"를 작성한다.
4. 유지해야 하는 MVP 기능을 regression test나 기존 E2E로 먼저 확인한다.
5. API/DB/status/endpoint/field 추가 없이 UI 구조, spacing, 카드 밀도, visual hierarchy, responsive layout을 수정한다.
6. screenshot evidence를 다시 캡처하고 screenshot diff, computed-style audit, geometry audit으로 unclassified visual difference 0을 달성한다.
7. 차이가 남으면 audit finding의 blocker/major difference를 기준으로 다시 수정한다.
8. slice workpack/acceptance/authority/evidence에 "전체 Wave1 모바일 100% 재포팅"과 허용 taxonomy에 해당하는 차이만 기록한다.

완료 기준:

- slice의 모든 exact-reference-ready 모바일 화면이 fixed reference 대비 unclassified visual difference 0개다.
- visual blocker가 0개다.
- MVP 기능 regression이 통과한다.
- official contract 밖의 기능 변경은 구현하지 않았거나 contract-evolution 후보로만 문서화했다.
- PR current-head GitHub checks가 모두 green이다.

## Slice A: wave1-port-foundation

### Scope

- 공통 layout shell
- header / bottom tabs / top nav 대응
- Button, Chip, Card, Modal/Sheet, Dropdown 공통 스타일 정리
- 정렬 dropdown 패턴
- 공통 CTA 위계
- app-wide spacing, safe-area, sticky bottom action rules

### Stage 1 Must Resolve

- `docs/workpacks/baemin-prototype-home-porting` status와 현재 HOME/AppShell 구현을 먼저 확인한다.
- HOME 전용 bottom tab, shared `AppShell`, `components/layout/bottom-tabs.tsx` 중복 변경 가능성을 dependency로 기록한다.
- Wave1 mobile exact-reference-ready surface는 `ui/designs/WAVE1_MOBILE_APP_BASELINE.md`의 prototype token/font/asset 기준을 따른다. web/legacy surface 영향은 app/web responsibility matrix에서 분리한다.
- 새 공용 primitive 도입은 high-risk UI change로 보고 design-generator/design-critic 필요 여부와 authority evidence 계획을 `automation-spec.json`에 명시한다.

### Expected Files

- `components/layout/app-header.tsx`
- `components/layout/bottom-tabs.tsx`
- `components/ui/*`
- `components/shared/*`
- `app/globals.css`
- existing app shell files discovered during Stage 1

### Classification

| Item | Classification | Notes |
| --- | --- | --- |
| header 단순화 | UI-only | API 영향 없음. 화면별 헤더 액션 제거/이동은 slice B~F에서 실제 적용. |
| bottom tab 유지 규칙 | UI-only | 상세 화면에서 하단 탭 유지 여부를 화면별 확인. |
| Button/Chip/Card radius/spacing | UI-only | 기존 design token과 충돌하지 않게 additive 중심. |
| Modal/Sheet footer label | UI-only | 기존 modal behavior 유지. |
| Sort dropdown primitive | UI-only | HOME 적용은 Slice B. |

### Verification

- `pnpm verify:frontend`
- `pnpm validate:pr-ready -- --slice wave1-port-foundation --pr-body <pr-body-file> --mode frontend`
- 공통 UI unit/component test
- 모바일 320/390 screenshot evidence
- no horizontal overflow spot check

## Slice B: wave1-port-discovery-detail

### Scope

- HOME
- RECIPE_DETAIL
- recipe save modal
- login screen provider display

### Main Changes

- HOME banner click -> `/planner`
- HOME header profile/cart 제거
- HOME search/filter chip 위치 재정리
- HOME sort sheet -> inline dropdown
- RECIPE_DETAIL 별점 제거, 행동 metric 표시로 전환
- RECIPE_DETAIL 하단 save 제거, `플래너에 추가` + `요리하기` 중심
- RECIPE_DETAIL 이미지 오른쪽 또는 근접 영역에 좋아요/저장/요리완료 metric 배치
- save modal에서 recipebook 생성 흐름 유지/정리
- login에서 카카오/Apple 버튼 숨김 또는 provider 축소

### Classification

| Item | Classification | Notes |
| --- | --- | --- |
| HOME filter chip 위치 | UI-only | 기존 recipes/ingredients API 소비. |
| HOME banner -> planner | UI-only / existing route | `/planner` 라우트 존재 확인. |
| sort dropdown | API + UI | API v1.2.4의 `latest` sort를 구현하고, HOME 노출 옵션은 `조회수순/최신순/저장순/플래너 등록순`으로 맞춘다. |
| RECIPE_DETAIL 별점 제거 | UI-only | rating field를 추가하지 않는다. |
| 좋아요/저장수 표시 | 공식 API로 가능 | detail response의 `like_count`, `save_count` 소비. 구현 타입/fixture 정합만 확인. |
| 요리완료수 표시 | 공식 API로 가능 | detail response의 `cook_count` 소비. 플래너 등록수는 `plan_count`. |
| 조회수 제거 | UI-only | 데이터는 보존 가능, 화면에서 숨김. |
| save modal multi-save | API + UI | `POST /recipes/{id}/save`는 `book_ids[]`를 소비한다. Prototype multi-select를 기능 divergence로 분류하지 않는다. |
| login provider 축소 | UI-only + auth config 확인 | 버튼 숨김은 FE 가능. 실제 provider disable은 운영 config 정책 확인. |

### Contract Evolution Candidates

- metric source를 official docs v1.6.6 / API v1.2.4의 `view_count` / `latest` / `save_count` / `plan_count` / `cook_count` 외 새 집계로 바꾸려 할 때
- 조회수 표시/비표시 정책을 공식 화면 계약과 다르게 바꾸려 할 때
- provider list를 실제 Supabase config에서 비활성화해야 할 때

### Verification

- HOME unit/component tests
- RECIPE_DETAIL E2E
- save modal E2E
- login provider display test
- mobile 390/320 authority evidence for HOME and RECIPE_DETAIL
- `pnpm validate:authority-evidence-presence`

## Slice C: wave1-port-planner-meal-add

### Scope

- PLANNER
- 식사추가 modal
- recipebook/pantry/search add flows
- MANUAL_CREATE
- MEAL_SCREEN

### Main Changes

- PLANNER weekly horizontal movement or swipe support
- 끼니 컬럼 이모티콘 제거 / 텍스트 명확화
- recipe status badge 제거
- `+ 음식` 위치와 강조 정리
- `장보기 목록 만들기` -> `장보기`
- planner-level `요리하기` 버튼 제거, meal/card context action 중심
- 식사추가 option modal 2열 구성
- `남은 요리에서 추가` option 추가
- 직접등록 재료 추가 modal 흐름 정리
- MEAL_SCREEN recipe name click -> RECIPE_DETAIL
- MEAL_SCREEN status selector 제거, delete icon 정리

### Classification

| Item | Classification | Notes |
| --- | --- | --- |
| PLANNER 이모티콘/배지 제거 | UI-only | 기존 meal status는 유지하고 표시만 줄임. |
| weekly 이동 | 기존 API로 가능 | `fetchPlanner(start,end)`와 `shiftPlannerRange` 사용 가능 여부 확인. |
| `+ 음식` 위치 변경 | UI-only | route/query 유지. |
| 식사추가 option modal | UI-only + existing flows | 각 option route/modal 연결을 실제 라우트에 맞춘다. |
| 남은요리에서 추가 | 공식 API로 가능 | `POST /meals`에 `leftover_dish_id` 포함. 구현 라우팅/상태만 확인. |
| 직접등록 완료 버튼 | UI-only / existing API | `POST /recipes` 후 완료 CTA. |
| 재료 선택 modal 다중 선택 | 기존 API로 가능 | ingredients API 소비. |
| 재료 양 입력 위치 변경 | UI-only | 저장 payload shape 유지. |
| MEAL_SCREEN recipe click | UI-only / existing route | `/recipe/[id]` 이동. |
| meal -> cook_done -> leftover 자동 생성 | 공식 요리 완료 API로 가능 | `POST /cooking/sessions/{id}/complete` 경유 시 공식 계약. 세션을 우회하거나 새 상태 전이를 만들면 contract candidate. |

### Contract Evolution Candidates

- `POST /meals` + `leftover_dish_id`가 아닌 별도 leftover attach API를 새로 만들려 할 때
- cooking session complete를 우회해 `meals.status`를 직접 바꾸려 할 때
- pantry 미사용 사용자 분기에서 공식 9-4/9-6 완료 흐름과 다른 상태 전이를 요구할 때

### Verification

- PLANNER E2E mobile + narrow
- MENU_ADD option routing E2E
- MANUAL_CREATE ingredient modal and complete CTA E2E
- MEAL_SCREEN recipe click E2E
- status transition tests if BE touched

## Slice D: wave1-port-shopping-cooking

### Scope

- SHOPPING_FLOW preview/create
- SHOPPING_DETAIL
- pantry exclusion section
- share/list title
- COOK_READY_LIST / COOK_MODE

### Delivery Status

- Stage 1 docs/workpack PR merged as #378.
- Stage 4 frontend implementation and screenshot evidence completed on `feature/fe-wave1-port-shopping-cooking`.
- Claude resume session `3f4ca745-db71-4392-a3f1-4e3c4493e9bc` was attempted for Stage 4, but provider limit blocked completion; per user instruction, Codex completed the slice directly.
- Repair status: required as part of the all-slice Wave1 visual re-port. Treat prior screenshots/authority evidence as historical until reference-vs-service visual verdict is rerun.

### Main Changes

- shopping preview에서 `#1`, 끼니 이모티콘 제거
- list 하단 생성 button 정리
- shopping detail title에 생성 날짜/목록명 표시
- share button과 complete button 배치 정리
- 구매 섹션 / 팬트리 제외 섹션 명확화
- `이미있음` / `되살리기` 이동 버튼
- `장보기 완료` button 하단 배치
- 완료 후 pantry 반영 modal 유지/정리
- COOK_MODE timer/note/pause/prev/next 제거
- COOK_MODE 전체 step 한 화면 스크롤
- cancel / complete button clipping 해결
- consumed ingredient screen 줄바꿈 수정

### Classification

| Item | Classification | Notes |
| --- | --- | --- |
| preview label/icon 제거 | UI-only | 데이터/계약 유지. |
| `장보기 목록 만들기` -> `장보기 완료` 등 label | UI-only | 화면 맥락별 문구만 변경. |
| pantry excluded section | 기존 API로 가능 | 현재 `is_pantry_excluded` 규칙 소비. |
| `이미있음` / `되살리기` | 기존 API로 가능 | `exclude -> uncheck` 규칙 유지. |
| share button | 공식 API로 가능 | `GET /shopping/lists/{id}/share-text` 소비. |
| shopping list title/date | 공식 API로 가능 | `shopping_lists.title`, `created_at` 소비. 없는 fixture/type만 보강. |
| complete 후 pantry add modal | 기존 API로 가능 | `add_to_pantry_item_ids` 3-way 규칙 유지. |
| COOK_MODE controls 제거 | UI-only | session/complete API 유지. |
| consumed ingredient wrapping | UI-only | payload 유지. |

### Non-Negotiable Rules

- completed `SHOPPING_DETAIL`은 read-only.
- completed list mutation은 409.
- `is_pantry_excluded=true`면 `is_checked=false`.
- `add_to_pantry_item_ids`: `null`, `[]`, selected ids를 구분.
- invalid pantry add ids는 무시하고 `pantry_added` 계산이 일치해야 한다.

### Verification

- shopping preview/create E2E
- shopping detail interact E2E
- shopping complete + pantry reflect E2E
- cook session/complete E2E
- read-only and 409 regression tests

## Slice E: wave1-port-pantry

### Scope

- PANTRY
- ingredient add modal
- bundle picker
- category chips
- search
- multi-delete

### Main Changes

- add ingredient button 명확화
- bundle add button 위치/라벨 정리
- category horizontal chip rail을 보유 재료 상단으로 이동
- pantry item image + checkbox 위치 정리
- 보유 텍스트 제거
- 미보유 재료 숨김
- delete button 항상 보이게
- delete mode에서 checkbox 표시
- selected items bottom `제거하기` CTA

### Classification

| Item | Classification | Notes |
| --- | --- | --- |
| chip/filter 위치 | UI-only | 기존 pantry list filtering. |
| delete mode UI | UI-only + 공식 API | `DELETE /pantry` + `ingredient_ids` 사용. |
| multi-delete | 공식 API로 가능 | batch delete endpoint가 이미 공식 계약에 있음. |
| ingredient image | 기존 API로 가능 여부 확인 | image field가 없으면 placeholder or contract candidate. |
| category chips | 기존 API로 가능 여부 확인 | category enum/mapping 확인. |
| hidden unowned ingredients | UI-only | pantry screen에서는 보유 items만 보여줌. |

### Design Authority Notes

- h8 기준 `PANTRY`는 screen-level `prototype parity` 후보이다.
- `PANTRY_BUNDLE_PICKER`는 별도 승격 전까지 `prototype-derived design`이다.
- `Jua`와 prototype-only assets는 blanket scope 밖이 아니다. fixed mobile reference에 보이는 경우 exact parity 대상이며, 사용할 수 없으면 font/asset decision 또는 `needs-prototype-freeze` blocker로 기록한다.

### Contract Evolution Candidates

- ingredient image URL이 공식 API에 없을 때
- category group이 `주식/채소/단백질/양념`으로 정규화되어 있지 않을 때
- 기존 `DELETE /pantry` 계약으로 부족해 새로운 삭제 정책이 필요할 때

### Verification

- PANTRY list/search/filter E2E
- add ingredient modal E2E
- bundle add E2E
- multi-delete E2E
- mobile screenshot evidence 390/320

### Delivery Status

- Stage 1 docs branch: `docs/wave1-port-pantry-stage1`
- Stage 4/5 implementation branch: `feature/fe-wave1-port-pantry`
- Claude Stage 1 handoff: attempted with resume session `3f4ca745-db71-4392-a3f1-4e3c4493e9bc`; provider limit reset was 13:20 Asia/Seoul.
- Codex fallback: Stage 1 workpack docs created because the user explicitly instructed Codex to continue directly when Claude token limit ends.
- Codex Stage 4/5 fallback: PANTRY UI, add sheet retry state, bundle picker labels, multi-delete bottom CTA, Playwright evidence, and `ui/designs/authority/WAVE1_PANTRY-authority.md` completed with blocker 0.
- Contract finding: official `category` exists on `ingredients`/`pantry` responses; official ingredient image URL does not exist and remains a contract-evolution candidate.
- Repair status: required as part of the all-slice Wave1 visual re-port. Keep the image URL finding as contract-evolution only; do not invent the field during visual repair.

## Slice F: wave1-port-account-library-leftovers

### Slice F Repair Notes

PR #383 `feat(wave1): merge account library leftovers closeout`은 merged 상태지만, 사용자가 확인한 실제 서비스 화면은 `claude-design-260505-wave1` 확정 디자인과 충분히 맞지 않는다. 이 섹션은 전체 Wave1 재포팅 중 Slice F에 적용할 추가 주의사항이다. 다음 작업이 Slice F에만 한정된다는 뜻이 아니다.

보정 작업의 기준:

- prototype은 visual/layout 기준이다.
- MVP와 공식 문서는 기능 기준이다.
- 화면 구조, 카드 밀도, spacing, 배민 스타일 톤, 섹션 구성, 모바일/데스크톱 layout은 prototype reference에 최대한 맞춘다.
- API 호출, payload, route, submit, loading/empty/error/unauthorized/read-only, 권한, 상태 전이는 현재 MVP 기능을 유지한다.
- prototype에서 잘 작동하지 않는 demo-only 기능은 복사하지 않는다.
- #383 screenshot evidence와 authority report는 historical evidence로만 본다. 보정 작업에서는 reference prototype screenshot, current service screenshot, after screenshot, visual verdict를 새로 남긴다.
- `docs/workpacks/wave1-service-porting-plan.md`, `docs/workpacks/wave1-port-account-library-leftovers/README.md`, `acceptance.md`, authority/evidence 문서에는 "PR #383 보정 작업"임을 명확히 기록한다.

### Scope

- MYPAGE
- SETTINGS polish
- LEFTOVERS
- ATE_LIST
- RECIPEBOOK_DETAIL

### Main Changes

- MYPAGE: `screens/mypage.jsx` / desktop reference의 profile card, tab/card density, recipebook/shopping sections, settings entry hierarchy를 실제 서비스에 반영한다.
- SETTINGS: `screens/extras.jsx` / desktop reference의 settings layout, row density, destructive action hierarchy를 반영하되 planner column management 기능은 현재 MVP 구현을 유지한다.
- LEFTOVERS: prototype의 카드 구조, meta density, CTA hierarchy, 반대 화면 이동 버튼 형태를 반영한다. API v1.2.4의 `source_meal_label`, `source_planned_servings`, `cooking_servings`를 소비하고, `POST /meals` + `leftover_dish_id`, eat API는 유지한다.
- ATE_LIST: prototype의 다먹은 요리 list/card 구조와 `남은요리로 복귀` 복구 action hierarchy를 반영한다. API v1.2.4의 card metadata를 소비하고 uneat API는 유지한다.
- RECIPEBOOK_DETAIL: prototype의 전용 화면 구조, custom book menu, recipe card density를 반영하되 API v1.2.4의 `tags`, `view_count`, `total_duration_seconds/text`, `base_servings`를 소비한다. System book 보호와 recipe removal 정책은 유지한다.
- 공통: 390px/320px뿐 아니라 shared responsive 영향이 있으면 desktop screenshot도 남기고, reference 대비 unclassified visual difference 0을 달성할 때까지 반복한다.

### Classification

| Item | Classification | Notes |
| --- | --- | --- |
| mypage gear/saved recipes 제거 | UI-only | routes는 유지 가능. |
| settings account action copy | UI-only | existing logout/delete API 유지. |
| planner column management | Done | `planner-column-customization` merged. 다시 만들지 않음. |
| leftovers/ate button shape | UI-only | route links 유지. |
| `다먹음` 텍스트 제거 | UI-only | list source 유지. |
| `덜먹음` label 조정 | UI-only | API와 상태 전이는 유지. |
| leftovers/ate card metadata | API + UI | API v1.2.4 / DB v1.3.3 필드 구현 후 prototype layout에 맞춘다. |
| recipebook detail metadata | API + UI | API v1.2.4의 tags/view/time/servings를 카드에 표시한다. |
| recipebook kebab menu | 기존 API로 가능 | rename/delete endpoints 확인. |

### Design Authority Notes

- h8 기준 `MYPAGE` shell은 screen-level `prototype parity` 후보이다.
- MYPAGE shopping-list tab, `LEFTOVERS`, `ATE_LIST`, `RECIPEBOOK_DETAIL`은 2026-05-12 contract update 이후 prototype parity target이다. `SETTINGS`는 planner column management 기능을 유지하면서 exact reference를 따른다.
- shell parity가 sub-surface parity로 자동 전파되지 않게 Stage 1에서 화면별 classification을 분리한다.

### Verification

- PR #383 repair diff table
  - 화면별 reference component/function
  - 현재 서비스 파일
  - 빠진 visual/layout 요소
  - 유지할 MVP 기능
  - 적용할 수정 방향
- 기능 보존 regression
  - MYPAGE: 레시피북 탭, 장보기 기록 탭, 설정 이동, 책 상세 이동
  - SETTINGS: 닉네임 변경, 화면 꺼짐 방지, planner column CRUD, logout/delete confirm
  - LEFTOVERS: eat, planner add with `leftover_dish_id`
  - ATE_LIST: uneat / `남은요리로 복귀`
  - RECIPEBOOK_DETAIL: custom book rename/delete, system book no-menu, recipe removal
- visual parity evidence
  - reference prototype screenshots
  - current service screenshots before repair
  - after service screenshots
  - screenshot diff, computed-style audit, geometry audit, unclassified visual difference 0 ledger
- MYPAGE E2E
- SETTINGS E2E regression
- LEFTOVERS / ATE_LIST E2E
- RECIPEBOOK_DETAIL E2E
- button clipping screenshots 320/390

### Delivery Status

- Stage 1 docs branch: `docs/wave1-port-account-library-leftovers`
- Stage 4~6 implementation branch: `feature/fe-wave1-port-account-library-leftovers`
- Stage 4~6 frontend/closeout PR: #383
- Historical Stage 2/3: N/A at PR #383 time. As of 2026-05-12 contract update, Stage 2 is required before Slice F Phase4 rerun.
- Codex fallback: completed FE implementation after Claude provider limit blocked Stage 4 delegation.
- Authority: `ui/designs/authority/WAVE1_ACCOUNT_LIBRARY_LEFTOVERS-authority.md`, verdict pass, blocker 0.
- Verification: targeted Vitest passed 78 tests, modified Playwright bundle passed 189 tests, exploratory QA eval score 98, and `pnpm verify:frontend` passed.
- Repair status: required. Treat #383 as function-preserving but visually insufficient. Next implementation branch should be `fix/wave1-account-library-leftovers-design-parity` or equivalent and should not call the slice complete until fixed prototype vs service unclassified visual difference is 0 for the touched exact-reference-ready Slice F screens.

## Cross-Slice Mapping Table

| Change Area | UI-only | Existing API 가능성 | Docs + BE 필요 가능성 |
| --- | --- | --- | --- |
| Header/profile/cart removal | yes | no | no |
| Filter chip position | yes | ingredients/recipes unchanged | no |
| Sort modal -> dropdown | yes | no | no |
| Recipe detail metric layout | yes | documented count fields | new metrics beyond documented fields |
| Recipe detail bottom CTA | yes | planner add/cook routes | no |
| Save modal copy/layout | yes | save/book APIs | yes: API v1.2.4 multi-save |
| Planner weekly movement | mostly | planner range API | no if current API sufficient |
| Planner column default/customization | done | done | done in #367~#370 |
| Meal add option modal | yes | existing add flows incl. `leftover_dish_id` | no unless new attach policy |
| Manual create ingredient modal | mostly | ingredients + recipe create | unit/category contract if missing |
| Meal screen recipe click | yes | recipe route | no |
| Meal cook_done -> leftover auto | no | official cooking complete APIs | docs+BE only if bypassing official complete flow |
| Shopping excluded section | mostly | shopping detail item APIs | no if current contract sufficient |
| Shopping list title/date | yes | title/date fields documented | no unless generation policy changes |
| Shopping share | yes | share-text API | no |
| Pantry reflect on complete | yes | complete API | no, preserve 3-way rules |
| Cook mode control removal | yes | existing session APIs | no |
| Pantry category chips/images | maybe | pantry/ingredient fields 확인 | image/category contract if missing |
| Pantry multi-delete | yes | `DELETE /pantry` with ids | no unless new delete semantics |
| Mypage/settings polish | yes | existing account APIs | no |
| Leftovers/Ate copy/buttons/meta | yes | leftovers APIs | yes: API v1.2.4 metadata |
| Recipebook menu/card meta | mostly | recipebook rename/delete/detail | yes for card metadata; no for menu endpoints if existing endpoints suffice |
| Login provider display | FE yes | auth config 확인 | provider policy/config if disabling server-side |

## Contract Evolution Rule

다음 중 하나라도 해당하면 구현 전에 사용자 승인 기반 `contract-evolution` PR을 먼저 만든다.

- 공식 API 문서에 없는 endpoint, response field, request field가 필요하다.
- DB schema 또는 status enum을 바꿔야 한다.
- `meals.status` 전이가 `registered -> shopping_done -> cook_done` 외 흐름을 요구한다.
- shopping read-only, `exclude -> uncheck`, `add_to_pantry_item_ids` 3-way 규칙을 바꾸게 된다.
- auth provider 자체를 운영 설정에서 제거해야 한다.
- production data migration 또는 backfill이 필요하다.
- anchor screen의 header 구조, section 배치, action hierarchy 같은 공식 화면 계약을 바꾸게 된다.

## Suggested New Session Prompt

새 세션을 시작할 때 아래처럼 요청하면 된다.

```text
너는 /Users/shj/2025/2026/homecook1 저장소에서 작업한다. 한국어로 보고해라.

docs/workpacks/wave1-service-porting-plan.md를 먼저 읽고, `ui/designs/prototypes/claude-design-260505-wave1` 기준으로 전체 Wave1 디자인 재포팅을 다시 진행해줘.

문제:
- 기존 Wave1 포팅 PR들은 merge됐지만, 실제 서비스 화면이 확정 디자인 소스 `claude-design-260505-wave1`와 충분히 맞는지 신뢰할 수 없다.
- 특히 PR #383 `feat(wave1): merge account library leftovers closeout`은 사용자가 직접 visual parity 실패를 확인했다.
- 2026-05-11 사용자 QA에서 prototype 자체의 화면이동/동작/디자인 문제가 확인됐다.
- Prototype Repair 0~4, follow-up repair #391~#404, fixed prototype freeze, `wave1-derived-state-ui-prep`는 완료됐다. 이제 Slice A~F 전체를 fixed prototype 기준으로 재감사하고 필요한 slice를 다시 디자인 포팅한다.
- 단순 문구/버튼 polish가 아니라 화면 구조, 카드 밀도, spacing, 배민 스타일 톤, 섹션 구성, 모바일/데스크톱 layout을 prototype 기준으로 맞춘다.

가장 중요한 원칙:
- fixed prototype은 visual/layout source of truth다.
- 현재 MVP 구현과 공식 문서는 기능 source of truth다.
- service porting의 100% parity는 visual/layout parity만 뜻한다.
- route navigation, API 호출, payload, submit 동작, loading/empty/error/unauthorized/read-only 상태, 권한 정책, status 전이는 기존 MVP 그대로 보존한다.
- fixed prototype에 직접 없는 loading/skeleton/empty/error/unauthorized/not-found/submitting 상태는 `prototype-derived design`으로 분류한다. `wave1-derived-state-ui-prep`에서 잠근 공통 규칙, 공통 컴포넌트, HOME/RECIPE_DETAIL/PLANNER_WEEK 대표 적용을 기준으로 Slice A~F 안에서 확산한다.
- prototype에서 버튼이 미연결/demo-only/broken behavior이면 그 동작을 service로 복사하지 않는다. Prototype Repair 단계에서 MVP 기준으로 먼저 고친다.
- 테스트가 selector 변경으로 깨지면 기능 기대값은 유지하고 selector만 새 UI에 맞게 고친다. 기능 테스트를 디자인 때문에 삭제하지 않는다.

먼저 새 브랜치를 만든다:
- 첫 작업은 `pnpm branch:start -- --branch feature/fe-wave1-port-foundation-reaudit`
- 이후 service slice마다 작은 re-audit / repair 브랜치로 분리한다.

반드시 먼저 읽는다:
1. AGENTS.md
2. docs/sync/CURRENT_SOURCE_OF_TRUTH.md
3. docs/workpacks/wave1-service-porting-plan.md
4. docs/workpacks/README.md
5. docs/engineering/product-design-authority.md
6. docs/design/mobile-ux-rules.md
7. ui/designs/BAEMIN_STYLE_DIRECTION.md
8. ui/designs/prototypes/claude-design-260505-wave1/HANDOFF.md
9. ui/designs/prototypes/claude-design-260505-wave1/COVERAGE_REVIEW.md
10. ui/designs/prototypes/claude-design-260505-wave1/VNEXT_DESIGN_PRINCIPLES.md
11. ui/designs/prototypes/claude-design-260505-wave1/app.jsx
12. ui/designs/prototypes/claude-design-260505-wave1/components.jsx
13. ui/designs/prototypes/claude-design-260505-wave1/tokens.jsx
14. ui/designs/prototypes/claude-design-260505-wave1/screens/*.jsx

완료된 선행 gate:
1. Prototype Repair 0~4
2. Follow-up repair #391~#404
3. Fixed prototype SHA freeze
4. `wave1-derived-state-ui-prep`

Service 재포팅 순서:
1. Slice A `wave1-port-foundation`
2. Slice B `wave1-port-discovery-detail`
3. Slice C `wave1-port-planner-meal-add`
4. Slice D `wave1-port-shopping-cooking`
5. Slice E `wave1-port-pantry`
6. Slice F `wave1-port-account-library-leftovers`

구현 전에 service repair 체크포인트를 만든다:
- service slice별 target screens/flows
- prototype reference file/function
- 현재 broken behavior 또는 visual issue
- MVP 기준 기대 동작
- 적용할 수정 방향
- 필요한 screenshot/smoke evidence 경로

기능 보존 잠금 예시:
- Slice B: HOME 검색/필터/정렬, recipe detail 저장/좋아요/플래너 추가/요리하기, save modal book 생성/저장, 로그인 redirect 유지
- Slice C: planner range 이동, 식사 추가 옵션 연결, `leftover_dish_id` 기반 추가, 직접등록 저장, meal 삭제/요리하기 흐름 유지
- Slice D: shopping preview/create, completed detail read-only, exclude -> uncheck, `add_to_pantry_item_ids` 3-way, share, cooking complete 유지
- Slice E: pantry 검색/필터/add, bundle add, multi-delete, 공식 category/image 계약 제한 유지
- Slice F: MYPAGE 탭/설정 이동, SETTINGS 계정/컬럼 관리, LEFTOVERS eat/planner add, ATE_LIST uneat, RECIPEBOOK_DETAIL custom/system book 정책 유지

작업 방식:
1. service Slice A부터 한 번에 한 service slice만 PR로 진행한다.
2. 각 slice는 fixed reference screenshot과 현재 service screenshot을 먼저 비교한다.
3. service 코드는 MVP route/API/auth/status/read-only 동작을 보존하면서 visual/layout만 repair한다.
4. API/DB/status/endpoint/field는 임의 추가하지 않고, 필요한 경우 contract-evolution 후보로 분리한다.
5. 320px/390px screenshot evidence를 남기고, 가능한 경우 desktop도 포함한다.
6. 각 PR은 current-head GitHub checks 통과 확인 후 merge한다.
7. merge 후 알림 채널이 설정되어 있으면 Discord 완료 알림을 보낸다.
8. 다음 service slice로 넘어갈 때 새 branch intent를 선언한다.

검증:
- targeted Vitest
- targeted Playwright
- screenshot evidence capture
- `pnpm verify:frontend`
- `pnpm validate:workflow-v2`
- service slice에서는 `pnpm validate:workpack -- --slice <slice>`
- `PR_IS_DRAFT=false pnpm validate:authority-evidence-presence`
- `PR_IS_DRAFT=false PR_BODY_FILE=<pr-body-file> pnpm validate:exploratory-qa-evidence`
- `BRANCH_NAME=<branch> BASE_REF=master node scripts/validate-omo-bookkeeping.mjs`
- GitHub PR current-head checks green before merge

최종 보고:
- 어떤 repair slice 또는 service slice를 얼마나 바꿨는지
- fixed prototype 대비 남은 차이
- 보존한 MVP 기능과 관련 테스트
- 테스트/CI 결과
- PR 링크와 merge commit
- Manual Only 잔여 위험
```

## First Next Action

Prototype repair, follow-up freeze, and **`wave1-derived-state-ui-prep`** are complete. The next product implementation step is Slice A **`wave1-port-foundation`** service porting re-audit/repair using:

- `fixed_prototype_path=ui/designs/prototypes/claude-design-260505-wave1`
- `fixed_prototype_implementation_sha=9bf7a34c6b422d0c9981d4c2968e3350d5a28892`
- `visual_layout_source_of_truth=fixed prototype`
- `functional_source_of_truth=MVP service implementation + official docs`

1. `pnpm branch:start -- --branch feature/fe-wave1-port-foundation-reaudit`
2. Read `docs/workpacks/wave1-port-foundation/README.md`, `docs/workpacks/wave1-port-foundation/acceptance.md`, `ui/designs/WAVE1_MOBILE_APP_BASELINE.md`, `ui/designs/WAVE1_APP_WEB_RESPONSIBILITY_MATRIX.md`, and the fixed reference manifest before editing.
3. Capture or reuse committed fixed reference screenshots, then capture current service screenshots for Slice A surfaces.
4. Build a difference table for AppShell, bottom tab, shared CTA/button/chip/card/modal primitives, touch targets, spacing, radius, and safe-area behavior.
5. Lock existing MVP behavior with focused regression tests before visual repair, including no route/API/auth/status/read-only contract changes.
6. Apply only the foundation repairs needed for fixed reference parity and derived state UI compatibility, leaving Slice B~F screen-specific repairs to their own PRs.
7. Run targeted tests, `pnpm verify:frontend`, Wave1 PR-ready validators, authority evidence checks, code review, current-head PR checks, and merge.
