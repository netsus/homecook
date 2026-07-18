# PLANNER_WEEK / MEAL_SCREEN Prepared Food Standard Basis UX Authority Review

> 대상 slice: `prepared-food-standard-basis-ux`
> evidence:
> - 320 before/after: `ui/designs/evidence/prepared-food-standard-basis-ux/before/meal-screen-quantity-edit-320.png`, `ui/designs/evidence/prepared-food-standard-basis-ux/after/meal-screen-quantity-edit-320.png`
> - 390 before/after: `ui/designs/evidence/prepared-food-standard-basis-ux/before/meal-screen-quantity-edit-390.png`, `ui/designs/evidence/prepared-food-standard-basis-ux/after/meal-screen-quantity-edit-390.png`
> - 1280 before/after: `ui/designs/evidence/prepared-food-standard-basis-ux/before/meal-screen-quantity-edit-1280.png`, `ui/designs/evidence/prepared-food-standard-basis-ux/after/meal-screen-quantity-edit-1280.png`
> - real local Supabase + Chrome: public solid `100g`, public liquid `100mL`, shared manual `100g`, `100 → 101g` 저장과 계획 영양 재계산
> 검토일: 2026-07-18
> 검토자: product-design-authority (independent Stage 5)
> 기준 base head: `0118be2ab401b36d7b1c60be299a60e8f9c5f965`
> 검토한 Stage 4 코드·테스트 diff SHA-256: `d7373889914bc410a8bfe0341f18f399bccdb650bd67d5bb8c0e3a83c84320f6`
> test-only repair 재심사: **PASS — visual implementation unchanged, test coverage strengthened**

## Verdict

- PASS / FAIL: **PASS**
- verdict: `pass`
- Blocker / Major / Minor: `0 / 0 / 0`
- 한 줄 요약: 기존 PLANNER_WEEK → MEAL_SCREEN → 완제품 수량 변경 mental model과 modal 위계를 보존하면서 g/mL의 1단위 입력만 정확히 맞췄고, 320/390/1280에서 가로 넘침·잘림·터치 타겟 축소가 없다.
- 후속 E2E coverage repair는 테스트 fixture/assertion만 변경했다. 제품 구현, interaction model, 레이아웃, evidence PNG는 그대로이므로 **visual implementation unchanged, test coverage strengthened**다.

## Scorecard

| 항목 | 점수 | 메모 |
|------|------|------|
| Mobile UX | 4/5 | 320/390 bottom sheet에서 수량·단위와 두 action이 한 화면에 안정적으로 보이고 page-level overflow가 없다. |
| Interaction Clarity | 5/5 | g/mL는 1단위, serving/package는 자유 양수라는 현재 단위별 규칙이 browser validity와 즉시 일치한다. |
| Visual Hierarchy | 4/5 | 제목 → 저장 기준 설명 → 수량/단위 → 취소/수량 변경 순서와 primary CTA 색상 위계가 유지된다. |
| Color / Material Fit | 4/5 | 기존 surface, border, brand, overlay token을 그대로 사용해 새 시각 체계를 만들지 않았다. |
| Familiar App Pattern Fit | 5/5 | 짧은 수량 변경을 기존 modal/bottom-sheet 안에서 끝내며 planner/meal interaction model을 바꾸지 않는다. |

## Blockers

| # | 위치 | 문제 | 왜 blocker인가 | 수정 방향 |
|---|------|------|----------------|----------|
| - | - | 없음 | 320/390/1280 모두 page-level horizontal overflow 0이며 좁은 폭 붕괴·CTA 가림·scroll boundary 혼란이 없다. | - |

## Major Issues

| # | 위치 | 문제 | 수정 방향 |
|---|------|------|----------|
| - | - | 없음 | - |

## Minor Issues

| # | 위치 | 문제 | 제안 |
|---|------|------|------|
| - | - | 없음 | - |

## Responsive And Geometry Evidence

| Viewport | Modal pattern | Horizontal overflow | Touch/control | Verdict |
| --- | --- | --- | --- | --- |
| 320×720 | mobile bottom sheet | 0 | input/button 44px | Pass |
| 390×844 | mobile bottom sheet | 0 | input/button 44px | Pass |
| 1280×900 | desktop center modal | 0 | input/button 44px | Pass |

- 320px에서도 설명 문구는 modal 안에서 자연스럽게 줄바꿈되고 `수량 | 단위` 2열이 찌그러지지 않는다.
- 390px은 배경 ProductPlannerEntry 카드와 modal의 집중 경계가 분명하며 primary `수량 변경` action이 취소보다 강하다.
- 1280px은 기존 content column 위 center modal을 유지하고 별도 dashboard/full-page interaction으로 확장하지 않는다.
- before/after에서 modal geometry와 위계가 바뀌지 않아 입력 semantics 수정이 visual regression을 만들지 않았다.

## Accessibility And State Boundary

- 수량 input, 단위 select, 닫기, 취소, 수량 변경에 명확한 label/role과 44px 조작 영역이 있다.
- `role=dialog`, `aria-modal`, 제목 연결, 초기 input focus, Tab trap, ESC close, trigger focus restoration을 유지한다.
- mismatch/error는 `role=alert`로 읽히며 dialog·입력·단위·플래너 context를 지우지 않는다.
- 실제 물리 기기 screen reader·가상 키보드 완전 준수는 Manual Only로 남기며 이 보고서가 전체 WCAG 인증을 주장하지 않는다.

## Contract Boundary Review

- 고형은 `100g`, 액상은 `100mL` 비교를 유지하고 picker의 g/mL 기본 수량은 `100`이다.
- g/mL는 `min=1`, `step=1`로 `100`과 `101`이 browser-valid하다.
- `serving/package`는 `min=0.01`, `step=any`를 유지하며 원 basis를 100g/100mL로 추정하지 않는다.
- unit select 변경 즉시 input semantics가 바뀌지만, exactly-one direct relation이 제공하는 호환 단위만 사용한다.
- relation 0개/복수/chaining, 이름·브랜드·밀도, 임의 g↔mL 추정을 추가하지 않았다.
- source tag(`공공 영양DB / 사용자 등록 / 비공개 보관`), 원 라벨 `label_basis_text`, missing/null/unavailable 비-0 표현을 보존한다.
- 새 API/DB/field/status/error/endpoint, product create-form prefill/정수 제한, 추가 fetch/query/N+1, Recipe Meal workflow 편입이 없다.

## Functional Evidence

- real local DB/Chrome에서 공공 고형 `100g`, 공공 액상 `100mL`, 사용자 등록 `100g`의 source tag·원 라벨·핵심 영양을 확인했다.
- g 제품 수량 input은 기본 `100`, `min=1`, `step=1`, `valid=true`였고 `101g`도 step mismatch 없이 저장됐다.
- 저장 후 해당 끼니 계획 영양이 `847.4 kcal → 851.2 kcal`로 다시 계산되어 수량 변경과 합계 연결을 확인했다.
- focused Vitest는 `8 passed / 56 skipped`, 관련 UI Vitest 전체는 `83 passed`, focused Playwright는 desktop/mobile 합계 `3 passed / 1 intentional skip`이다.
- test-only repair는 public dataset 고형 `100g`과 액상 `100mL`를 각각 선택해 source tag·기본 `100`·`min=1`·`step=1`·비교 기준을 확인한다.
- 같은 E2E 흐름에서 사용자 등록 `100mL`, legacy no-relation의 `min=0.01`·`step=any`, MEAL_SCREEN의 serving→g 전환 후 browser validity를 직접 잠근다.
- 구현 파일과 여섯 evidence PNG checksum은 이전 authority 심사와 동일하며 새 네트워크·UI·계약 surface가 생기지 않았다.

## Evidence Limits

- 320/390 after 캡처의 검은 원형 `N`은 local Next.js 개발 도구 overlay로 배포 제품 요소가 아니다.
- 이 residual slice의 캡처는 MEAL_SCREEN quantity modal을 중심으로 한다. picker source/filter/100g·100mL/no-relation 전체 시각 상태는 병합된 predecessor authority와 이번 real local Chrome 회귀가 보완한다.
- 실제 물리 iOS/Android, 실제 screen reader, production-scale query 비용은 후속 Manual Only 범위다.
- production/staging/provider write는 0이다.

## Decision

- Stage 4 진행 가능 여부: **가능**
- Stage 5 confirmed 가능 여부: **가능**
- blocker: `0`
- confirmed_allowed: `true`
- 다음 행동: 이 보고서와 동일한 implementation diff/evidence가 포함된 exact PR head에서 Stage 6 및 current-head 전체 check를 확인한다.
