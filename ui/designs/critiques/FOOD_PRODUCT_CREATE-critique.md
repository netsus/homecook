# FOOD_PRODUCT_CREATE independent critique handoff

> 상태: **Stage 1 설계 계약 exact-head 승인 / Stage 4·5·final authority 대기**. 이 승인은 구현 화면의 🟢/🟡 또는 `Design Status: confirmed` 판정이 아니다.

## Independent Stage 1.5 Review Record

- reviewed head: `b137aa4e9d090827a80301ab47cc55710821a166`
- decision: `REQUEST_CHANGES` — Important 6건
- 이 화면 관련 finding: 신규 surface와 기존 anchor를 같은 before/after 요구로 뭉뚱그려 증거 소유가 불명확했고, critique가 reviewer 입력 placeholder에 머물렀다.
- repair disposition: CREATE는 신규 화면이므로 390/320/desktop **after** evidence만 요구한다. 기존 `PLANNER_WEEK`/`MEAL_SCREEN`/`MENU_ADD`는 각각 before+after를 별도로 요구하도록 machine matrix를 보강했다.
- 전역 finding disposition: MEAL_SCREEN 예상 열량, picker cursor, real DB bootstrap/reset/cleanup, roadmap/status 정합성은 해당 owning artifact에서 수정했다.
- repair-final은 자기 변경을 승인하지 않았다.

### Independent Exact-Head Re-review

- reviewed head: `fe210b7169094edc77b64e91a730d86720d598ae`
- decision: `DOC_GATE_APPROVED` — Blocker/Important/Suggestion `0/0/0`
- provenance: 첫 review `0/6/0`, 별도 repair-final 1회, fresh independent re-review `0/0/0`
- scope: FOOD_PRODUCT_CREATE의 Stage 1 설계 계약과 future evidence 요구만 승인한다. Stage 4 실제 UI, 390/320/desktop after evidence, authority precheck, Stage 5, final authority, Stage 6은 pending이다.

## Required Independent Review

- mobile baseline 375/구현 evidence 390과 narrow 320에서 keyboard가 primary CTA와 마지막 field를 가리지 않는가
- scroll containment가 form body에만 있고 sticky header/footer와 focus order가 자연스러운가
- PLANNER_WEEK anchor flow와 FOOD_PRODUCT_PICKER 선택 복귀가 끊기지 않는가
- optional blank, observed zero, validation error가 분명하고 missing을 0으로 보이지 않는가
- public/share/OCR/barcode/relation/generic prep-size-edible scope를 암시하지 않는가
- desktop 1280에서도 과도한 two-column 재배치로 mobile tab order가 깨지지 않는가

## Reviewer Output Contract

- 판단 결과: 첫 reviewed head는 `REQUEST_CHANGES`, repaired exact head는 Stage 1 contract `DOC_GATE_APPROVED`
- 필수 수정 사항: Stage 1 required finding 0; Stage 4 이후 실제 화면 authority 검수 필요
- 권장 사항: fresh authority precheck에서 320px keyboard/CTA와 picker 선택 복귀 확인
- 차단 여부: Stage 1.5 문서 차단은 해제됐지만 docs PR merge 전 Stage 2 시작은 차단
