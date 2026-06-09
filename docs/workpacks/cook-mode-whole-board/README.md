# cook-mode-whole-board

## Goal

요리 중 사용자가 화면을 넘기지 않고 전체 재료와 전체 조리순서를 동시에 볼 수 있게 COOK_MODE를 whole-board 화면으로 바꾼다. 사용자가 직접 캡처해 확대해 두던 사용 방식을 서비스 안에서 대체하는 것이 목표다.

## Change Type

- `contract-evolution`: 요구사항/화면/유저플로우의 COOK_MODE UI 계약 변경
- `product-frontend`: session/standalone COOK_MODE 화면 구현 변경
- API/DB 변경 없음

## In Scope

| Surface | Scope |
| --- | --- |
| `COOK_MODE` session | 전체 재료 보드 + 전체 조리순서 보드, 완료/취소 유지 |
| `COOK_MODE` standalone | session과 동일한 whole-board UI |
| Wake lock status | 실제 화면 꺼짐 방지 활성 상태일 때만 상태 표시 |
| Tests | Vitest component tests, 관련 Playwright assertions 갱신 |
| Docs | `v1.7.7`, `v1.5.14`, `v1.3.14`, SoT sync |

## Out of Scope

- cook-mode 조회/완료/취소 API 변경
- DB schema 변경
- 인분 조절 UI 추가
- 음성, 타이머, 자동 단계 이동
- 단계별 재료 추출 정확도 개선

## Dependencies

| Dependency | Status | Note |
| --- | --- | --- |
| `15a-cook-planner-complete` | merged | planner cook-mode 완료/취소 |
| `15b-cook-standalone-complete` | merged | standalone cook-mode 완료 |
| `wave1-port-shopping-cooking` | merged | 기존 COOK_MODE 단일 스크롤 방향 |

## Frontend Delivery Mode

- `loading`: 기존 skeleton 유지
- `empty`: 재료/스텝이 없는 경우 기존 empty copy 유지
- `error`: 기존 retry 상태 유지
- `read-only`: 요리 완료 전까지 recipe data는 표시 전용, 인분 조절 없음
- `unauthorized`: session 진입은 로그인 필요, standalone 완료 시 login gate 유지

## Key Rules

- 전체 재료가 왼쪽/상단 보드에 항상 보이므로 단계별 재료는 표시하지 않는다. <!-- omo:id=rule-no-step-ingredients;stage=4;scope=frontend;review=5,6 -->
- 조리순서는 모든 단계를 번호 순서대로 표시하고 이전/다음 이동 버튼을 두지 않는다. <!-- omo:id=rule-all-steps-visible;stage=4;scope=frontend;review=5,6 -->
- 긴 레시피는 whole-board 내부 세로 스크롤을 허용한다. <!-- omo:id=rule-long-recipe-scroll;stage=4;scope=frontend;review=5,6 -->
- 조리방법 태그는 단계 번호나 조리법 본문 위에 표시한다. <!-- omo:id=rule-method-tag-above-copy;stage=4;scope=frontend;review=5,6 -->
- wake lock 상태는 설정 ON만으로 초록 표시하지 않고 실제 활성 상태를 반영한다. <!-- omo:id=rule-wake-lock-actual;stage=4;scope=frontend;review=5,6 -->

## Design Authority

- UI risk: `high-risk-ui-change`
- Anchor screen dependency: 없음
- Visual artifact:
  - `ui/designs/COOK_MODE-whole-board-vision.md`
  - `ui/designs/prototypes/cook-mode-whole-board/index.html`
- Authority status: prototype approved by user in this session, production implementation requires screenshot verification before PR ready.

## QA / Test Data Plan

- Fixture: existing cook-mode component test data.
- Local deterministic:
  - `pnpm exec vitest run tests/cook-mode-screen.test.tsx tests/standalone-cook-mode-screen.test.tsx`
  - targeted Playwright cook-mode specs when dev server is available.
- Visual/manual:
  - desktop and mobile screenshots for session/standalone COOK_MODE.
  - confirm no previous/next buttons, no current-step-only layout, no step ingredient board.

## Delivery Checklist

- [ ] Official docs point to whole-board COOK_MODE contract <!-- omo:id=docs-contract;stage=4;scope=frontend;review=6 -->
- [ ] Session COOK_MODE shows all ingredients and all steps together <!-- omo:id=fe-session-whole-board;stage=4;scope=frontend;review=5,6 -->
- [ ] Standalone COOK_MODE uses the same whole-board UI <!-- omo:id=fe-standalone-whole-board;stage=4;scope=frontend;review=5,6 -->
- [ ] Step cards do not show per-step ingredients, heat, or duration <!-- omo:id=fe-remove-step-meta;stage=4;scope=frontend;review=5,6 -->
- [ ] Wake lock status reflects actual active state <!-- omo:id=fe-wake-status;stage=4;scope=frontend;review=5,6 -->
- [ ] Component and flow tests reflect whole-board behavior <!-- omo:id=test-whole-board;stage=4;scope=frontend;review=6 -->
