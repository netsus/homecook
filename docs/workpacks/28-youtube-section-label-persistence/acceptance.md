# Acceptance: YouTube Section Label Persistence

## 문서 게이트

- [x] 공식 5문서가 v1.7.3 / v1.5.10 / v1.3.10 / DB v1.3.9 / API v1.2.13으로 갱신된다.
- [x] `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`가 새 공식 문서를 가리킨다.
- [x] `POST /recipes` manual body는 `component_label` 비허용 계약으로 분리된다.

## 저장 게이트

- [x] `recipe_ingredients.component_label` nullable 컬럼이 추가된다.
- [x] `recipe_steps.component_label` nullable 컬럼이 추가된다.
- [x] YouTube register RPC가 ingredient/step `component_label`을 저장한다.
- [x] blank label은 `null`로 정규화된다.

## 읽기 게이트

- [x] recipe detail API가 ingredient/step `component_label`을 반환한다.
- [x] standalone cook-mode API가 ingredient/step `component_label`을 반환한다.
- [x] planner cook-mode API가 ingredient/step `component_label`을 반환한다.
- [x] legacy no-label recipe는 기존 flat 응답과 호환된다.

## UI 게이트

- [x] recipe detail mobile/web은 인접 label 변경 지점에만 섹션 heading을 표시한다.
- [x] cook-mode mobile/desktop은 인접 label 변경 지점에만 섹션 heading을 표시한다.
- [x] `component_label`이 있으면 같은 `[섹션명]` prefix가 본문에 중복 표시되지 않는다.
- [x] all-null recipe는 heading 없이 flat UI를 유지한다.

## 회귀 게이트

- [x] manual create contract가 넓어지지 않는다.
- [x] shopping aggregation은 label을 merge key로 쓰지 않는다.
- [x] `ConsumedIngredientSheet`는 flat 체크리스트를 유지한다.

## 외부 검토 게이트

- [x] Claude read-only conformance review가 `PASS`이거나, `NON_BLOCKING_RISK`만 남는다.
- [x] Claude가 `BLOCKER`를 낸 경우 수정 후 재검토한다.
