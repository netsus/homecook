# FOOD_PRODUCT_PICKER independent critique handoff

> 상태: **Stage 1.5 request changes 수정 반영 / exact-head 재검수 대기**. 이 파일은 승인/🟢/🟡 판정이 아니다.

## Independent Stage 1.5 Review Record

- reviewed head: `b137aa4e9d090827a80301ab47cc55710821a166`
- decision: `REQUEST_CHANGES` — Important 6건
- 이 화면 관련 finding: 기존 `GET /food-products` cursor 소비 계약과 기존 anchor before/after evidence matrix가 불충분했다.
- repair disposition: opaque `next_cursor`, query reset, product-ID dedupe, last-page 종료, latest-query-wins를 화면·workpack·machine contract에 추가했다. picker는 신규 화면이므로 390/320/desktop **after** evidence를 요구하고, `MENU_ADD` before/after 맥락과 짝지었다.
- 전역 finding disposition: MEAL_SCREEN 예상 열량, real DB bootstrap/reset/cleanup, 5개 critique provenance, roadmap/status 정합성도 해당 owning artifact에서 수정했다.
- approval: **pending independent exact-head re-review**. repair-final은 자기 변경을 승인하지 않는다.

## Required Independent Review

- mobile baseline 375/구현 evidence 390과 narrow 320에서 결과 card·quantity·primary CTA가 겹치지 않는가
- scroll containment가 nested sheet body에만 있고 page-level horizontal overflow가 없는가
- PLANNER_WEEK anchor → MEAL_SCREEN → MENU_ADD 맥락과 focus return이 보존되는가
- public read-only, private owner-only, partial/unavailable/missing-not-zero가 혼동되지 않는가
- basis mismatch가 선택/quantity 단계에 머물고 추정 relation을 암시하지 않는가
- desktop modal에서도 search/result/selected state가 중복 CTA 없이 이해되는가

## Reviewer Output Contract

- 판단 결과: reviewed head는 REQUEST_CHANGES, repaired head는 pending
- 필수 수정 사항: cursor/query race와 evidence finding 수정 반영; 독립 재검수 필요
- 권장 사항: fresh authority precheck에서 실제 scroll observer·focus return 확인
- 차단 여부: Stage 2 시작은 독립 Stage 1.5 재승인 전까지 차단
