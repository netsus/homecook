# MEAL_SCREEN Prepared Food Standard Basis UX Critique

> 대상 slice: `prepared-food-standard-basis-ux`
> 검토일: 2026-07-18 KST
> 검토자: independent Stage 5 design critic
> 판정: **PASS**
> Blocker / Major / Minor: **0 / 0 / 0**
> 기준 base head: `0118be2ab401b36d7b1c60be299a60e8f9c5f965`
> 검토한 Stage 4 코드·테스트 diff SHA-256: `d7373889914bc410a8bfe0341f18f399bccdb650bd67d5bb8c0e3a83c84320f6`
> test-only repair 재심사: **PASS — visual implementation unchanged, test coverage strengthened**

## 검토 범위

- 공식 v1.7.21/v1.5.27/v1.3.24의 고형 `100g`, 액상 `100mL`, picker 기본 수량 `100`, g/mL `step=1` 계약을 기준으로 삼았다.
- `ui/designs/MEAL_SCREEN.md`의 Prepared Food Standard Basis UX addendum과 실제 before/after `320 / 390 / 1280` 캡처를 대조했다.
- `components/planner/food-product-picker.tsx`, `components/planner/meal-screen.tsx`의 변경과 관련 Vitest/Playwright 회귀를 확인했다.
- real local Supabase + Chrome에서 공공 고형, 공공 액상, 사용자 등록 제품의 source tag·비교 기준·원 라벨·영양 표시와 `100 → 101g` 저장 흐름을 확인한 실행 증거를 검토했다.

## Evidence

> evidence:
> - 320 before: `ui/designs/evidence/prepared-food-standard-basis-ux/before/meal-screen-quantity-edit-320.png`
> - 320 after: `ui/designs/evidence/prepared-food-standard-basis-ux/after/meal-screen-quantity-edit-320.png`
> - 390 before: `ui/designs/evidence/prepared-food-standard-basis-ux/before/meal-screen-quantity-edit-390.png`
> - 390 after: `ui/designs/evidence/prepared-food-standard-basis-ux/after/meal-screen-quantity-edit-390.png`
> - 1280 before: `ui/designs/evidence/prepared-food-standard-basis-ux/before/meal-screen-quantity-edit-1280.png`
> - 1280 after: `ui/designs/evidence/prepared-food-standard-basis-ux/after/meal-screen-quantity-edit-1280.png`

## Verdict

- PASS / FAIL: **PASS**
- 한 줄 요약: 기존 `완제품 수량 변경` modal의 구조와 플래너 맥락을 그대로 유지하면서 g/mL 브라우저 입력만 1단위 유효 입력으로 맞췄고, 좁은 모바일·기본 모바일·데스크톱에서 blocker가 없다.
- 후속 repair는 E2E fixture/assertion만 보강했으며 구현·레이아웃·스크린샷은 바뀌지 않았다. 즉 **visual implementation unchanged, test coverage strengthened**다.

## Responsive Review

| 폭 | 판정 | 근거 |
| --- | --- | --- |
| 320px | Pass | 제목·설명·`수량 | 단위` 2열·취소·수량 변경 버튼이 잘리지 않는다. page-level horizontal overflow는 0이고 input/button 높이는 44px다. |
| 390px | Pass | 기존 bottom-sheet 흐름, 배경 식단 맥락, primary/secondary action 위계가 안정적으로 유지된다. page-level horizontal overflow는 0이다. |
| 1280px | Pass | center modal 폭과 2열 입력, 버튼 위계가 기존 desktop 패턴을 보존한다. 불필요한 sidebar나 별도 full-page 흐름을 만들지 않았다. |

## Contract And Interaction Review

- g/mL 입력은 `min=1`, `step=1`이라 기본 `100`과 `101`이 browser validity 기준으로 유효하다.
- `serving/package`는 `min=0.01`, `step=any`를 유지한다. 이를 `100g/100mL`로 바꾸거나 추정하지 않는다.
- 단위 select를 `serving/package → g/ml`로 바꾸면 같은 input의 min/step 의미가 즉시 바뀌고 modal context와 값은 유지된다.
- exactly-one direct relation, pinned nutrition version, `422 NUTRITION_BASIS_MISMATCH` 서버 authority는 변경하지 않았다.
- relation 0개/복수/chaining, 이름·브랜드·밀도, 임의 g↔mL 추정 코드는 추가하지 않았다.
- source tag, `label_basis_text`, missing/null/unavailable 비-0 표현은 predecessor UI를 그대로 소비한다.
- Recipe Meal, shopping, cooking, leftover, XP와 ProductPlannerEntry의 분리 구조를 변경하지 않았다.
- 새 endpoint, API field/status/error, DB schema, create-form prefill/정수 제한, 추가 fetch/query가 없다.

## Accessibility Review

- 수량 input과 단위 select는 각각 명시적인 접근성 이름을 가진다.
- input, select, 취소, 수량 변경, 닫기 control은 44px 터치 기준을 유지한다.
- modal은 `role=dialog`, `aria-modal`, 제목 연결, 초기 input focus, Tab focus containment, ESC close, trigger focus restoration을 기존 공용 경계로 유지한다.
- mutation 오류는 `role=alert`를 사용하며 modal·입력값·선택 단위·배경 플래너 context를 유지한다.

## Findings

### Blockers

- 없음.

### Major Issues

- 없음.

### Minor Issues

- 없음.

## Verification

- focused Vitest: `8 passed / 56 skipped` (`browser-valid`, unit switch, legacy serving 회귀)
- 관련 UI Vitest 전체: `83 passed`
- focused Playwright: `3 passed / 1 intentional skip` (공공 고형 `100g`, 공공 액상 `100mL`, 사용자 등록, legacy no-relation, serving/package any, serving→g min/step/validity)
- real local Chrome: public solid `100g`, public liquid `100mL`, shared manual `100g`, source/label/nutrition 표시 확인
- real local mutation: `100 → 101g` 저장 후 계획 영양 `847.4 → 851.2 kcal` 재계산 확인
- geometry: `320 / 390 / 1280` 모두 horizontal overflow 0, input/button 44px
- test-only repair는 public dataset liquid fixture와 solid/liquid 선택 assertion, serving→g browser validity assertion만 추가했다. 제품 코드와 evidence PNG checksum은 이전 authority 심사와 동일하다.

## Evidence Limits

- screenshot의 검은 원형 `N` 표시는 Next.js 개발 도구이며 제품 UI가 아니다.
- 실제 물리 iOS/Android, 가상 키보드 조합, 실제 screen reader와 production-scale query 측정은 이 Stage 5 시각 심사의 범위가 아니다.
- production/staging/provider write는 수행하지 않았다.

## Decision

- Stage 4 구현 디자인: **승인**
- authority 전달 가능 여부: **가능**
- 다음 행동: exact implementation head가 이 diff fingerprint와 evidence를 포함하는지 확인한 뒤 Stage 6 current-head gate를 진행한다.
