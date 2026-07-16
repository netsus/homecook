# MENU_ADD critique

> 검토 대상: `ui/designs/MENU_ADD.md`
> 검토일: 2026-04-24
> 검토자: design-critic

## Summary

- mobile baseline 375 구조는 검색 입력이 첫 시선에 잡혀서 목적이 분명하다.
- narrow 320에서도 검색창, 비활성 placeholder 버튼, 직접등록 링크 순서가 유지된다.
- primary CTA를 검색 입력으로 본 해석은 이번 슬라이스 범위와 잘 맞다.
- scroll containment는 상단 앱바 고정 + 본문 세로 스크롤 구조로 충분하다.
- anchor 표현은 독립 신규 화면이라는 점을 분명히 해 anchor-screen 변경으로 오해되지 않는다.

## Minor Notes

> **2026-07-16 prepared-food-planner-entry 재검수 필요:** 위 역사적 판정은 `[완제품] -> FOOD_PRODUCT_PICKER/CREATE` 확장을 승인하지 않는다. fresh independent reviewer는 mobile baseline 375/구현 390, narrow 320, desktop, primary CTA, scroll containment, unauthorized return과 PLANNER_WEEK anchor context를 별도로 판정해야 한다. 현재 successor 판정은 pending이다.

### Independent Stage 1.5 Review Record — prepared-food-planner-entry

- reviewed head: `b137aa4e9d090827a80301ab47cc55710821a166`
- decision: `REQUEST_CHANGES` — Important 6건
- 이 화면 관련 finding: 기존 anchor-adjacent MENU_ADD의 before/after viewport evidence가 불완전했고 successor critique provenance가 pending placeholder뿐이었다.
- repair disposition: MENU_ADD before+after를 390/320/desktop에서 각각 machine-required로 추가했다. `[완제품]` 진입, unauthorized return, picker/create 연결은 fresh authority review 대상으로 유지한다.
- 전역 finding disposition: MEAL_SCREEN 예상 열량, picker cursor, real DB bootstrap/reset/cleanup, roadmap/status 정합성은 owning artifact에서 수정했다.
- approval: **pending independent exact-head re-review**. 기존 2026-04-24 판단은 successor 승인으로 재사용하지 않는다.

- placeholder 버튼은 실제 CTA처럼 보이지 않게 톤을 낮춰야 한다.
- narrow 320에서 버튼 라벨 줄바꿈이 생기면 아이콘과 라벨 간격을 먼저 지키는 쪽이 안전하다.
