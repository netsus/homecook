# Nutrition / Products / Planner Cross-Slice Release QA Authority Review

> 대상 slice: `nutrition-products-cross-slice-release-qa`
> 검토 범위: `RECIPE_DETAIL`, `FOOD_PRODUCT_PICKER`, `FOOD_PRODUCT_CREATE`, `PLANNER_WEEK`, `MEAL_SCREEN`, `SETTINGS_ACCOUNT_DELETE_CONFIRM`
> evidence:
> - RECIPE_DETAIL 390/320/1280: `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/RECIPE_DETAIL-390.png`, `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/RECIPE_DETAIL-320.png`, `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/RECIPE_DETAIL-desktop-1280.png`
> - FOOD_PRODUCT_PICKER 390/320/1280: `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/FOOD_PRODUCT_PICKER-390.png`, `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/FOOD_PRODUCT_PICKER-320.png`, `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/FOOD_PRODUCT_PICKER-desktop-1280.png`
> - FOOD_PRODUCT_CREATE 390/320/1280: `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/FOOD_PRODUCT_CREATE-390.png`, `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/FOOD_PRODUCT_CREATE-320.png`, `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/FOOD_PRODUCT_CREATE-desktop-1280.png`
> - PLANNER_WEEK 390/320/1280: `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/PLANNER_WEEK-390.png`, `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/PLANNER_WEEK-320.png`, `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/PLANNER_WEEK-desktop-1280.png`
> - MEAL_SCREEN 390/320/1280: `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/MEAL_SCREEN-390.png`, `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/MEAL_SCREEN-320.png`, `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/MEAL_SCREEN-desktop-1280.png`
> - SETTINGS_ACCOUNT_DELETE_CONFIRM 390/320/1280: `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/SETTINGS_ACCOUNT_DELETE_CONFIRM-390.png`, `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/SETTINGS_ACCOUNT_DELETE_CONFIRM-320.png`, `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/SETTINGS_ACCOUNT_DELETE_CONFIRM-desktop-1280.png`
> - 보조 상태: `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/RECIPE_DETAIL-PARTIAL-390.png`, `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/RECIPE_DETAIL-UNAVAILABLE-390.png`, `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/FOOD_PRODUCT_PICKER-LIQUID-100ML-desktop-1280.png`, `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/MEAL_SCREEN-RECIPE-PRODUCT-COMBINED-390.png`, `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/MEAL_SCREEN-ANONYMIZED-PIN-390.png`
> 검토일: 2026-07-19
> 검토자: product-design-authority (independent final exact-head re-review)
> reviewed exact head: `8a055a01fb77a28fd4f7c6e5e7587579ea74354f` (`origin/master` exact match)
> repaired evidence: `SETTINGS_ACCOUNT_DELETE_CONFIRM-320.png`, `SETTINGS_ACCOUNT_DELETE_CONFIRM-390.png`, `SETTINGS_ACCOUNT_DELETE_CONFIRM-desktop-1280.png`, `PLANNER_WEEK-320.png`, `PLANNER_WEEK-390.png`, `PLANNER_WEEK-desktop-1280.png`

## Verdict

- PASS / FAIL: **PASS**
- verdict: `pass`
- Blocker / Major / Minor: `0 / 0 / 0`
- 한 줄 요약: `PLANNER_WEEK` 320/390/desktop이 모두 `7/18 점심 · OFS 갈비탕 · 101g · 67.7 kcal`로 일치하고, final exact head의 추가 변경도 QA fixture 로그인 분기와 stale E2E selector에 한정되어 계정 삭제 접근성 경계와 나머지 필수 화면의 위계·반응형·workflow 분리에 회귀가 없으므로 release authority를 통과한다.

## Scorecard

| 항목 | 점수 | 메모 |
|------|------|------|
| Mobile UX | 5/5 | 320/390 모두 page-level 가로 이동 없이 주 이동, 합계, 날짜 카드와 `101g` 제품 row가 같은 세로 흐름에서 안정적으로 읽힌다. |
| Interaction Clarity | 5/5 | 검색→등록→추가→수량 변경, 플래너 제품 row와 합계, 계정 삭제의 위험 action 경계가 서로 모순 없이 명확하다. |
| Visual Hierarchy | 4/5 | 계획 영양, 제품 유형, 기준량, 핵심 CTA가 보조 metadata보다 먼저 읽히며 danger action도 명확히 분리된다. |
| Color / Material Fit | 4/5 | blue brand, surface, source badge, danger surface가 기존 app token과 일치하고 장식색이 콘텐츠를 누르지 않는다. |
| Familiar App Pattern Fit | 5/5 | anchor의 day-card/detail 구조를 바꾸지 않고 긴 등록은 nested form, 짧은 확인은 sheet/dialog, 수량 관리는 meal card 안에서 처리한다. |

## Blockers

| # | 위치 | 문제 | 왜 blocker인가 | 수정 방향 |
|---|------|------|----------------|----------|
| - | - | 없음 | - | - |

### Resolved Blocker History

- 이전 재심사에서는 `PLANNER_WEEK-390.png`만 빈 7/6 슬롯과 `124.2 kcal`를 함께 보여, 당시 320/desktop의 `101g` 제품 row와 상태가 모순됐다.
- exact head `adbf93d24ad9750640aab26c4f60b569ff8d7861`에서 같은 계정·주·날짜·끼니 상태를 real Chrome으로 다시 열고 320/390/desktop을 모두 재촬영했다.
- 세 evidence 모두 주간 합계 `67.7 kcal`, 7/18 날짜 합계 `67.7 kcal`, 점심 `OFS 갈비탕 · 101g` row를 동일하게 보여 viewport별 누락·stale capture 의심이 해소됐다. 따라서 기존 blocker는 닫는다.

## Major Issues

| # | 위치 | 문제 | 수정 방향 |
|---|------|------|----------|
| - | - | 없음 | - |

## Minor Issues

| # | 위치 | 문제 | 제안 |
|---|------|------|------|
| - | - | 없음 | - |

## Anchor Screen Review

### PLANNER_WEEK

- 320과 390은 주간 범위, 상태 요약, `계획 영양 67.7 kcal`, 주 이동, 요일 strip, 날짜 card가 한 흐름으로 붙고 7/18 점심의 `완제품` chip + `OFS 갈비탕` + `101g`가 동일하게 읽힌다.
- 320/390 모두 첫 viewport에서 7/13 day card와 다음 날짜의 시작이 함께 보여 `2일 이상 summary`와 control proximity는 충족한다. 같은 날짜의 아침/점심/저녁도 한 day card 안에 유지된다.
- desktop은 기존 주간 table mental model을 유지한다. 날짜/끼니 grid가 page wrapper를 넓히지 않고, 7/18 점심 제품 row와 날짜별 `67.7 kcal`가 compact하게 읽힌다.
- 장보기 floating action과 bottom tab은 모바일 고정 영역으로 읽히며 day-card 콘텐츠는 세로 스크롤로 계속 접근할 수 있다. 320/390/desktop 모두 whole-page 가로 이동 징후는 없다.
- final 재촬영 3종에서 같은 ProductPlannerEntry와 계획 영양 projection이 동일하게 보이므로 `ProductPlannerEntry → day card → 계획 영양`의 viewport 안정성을 입증한다.

### RECIPE_DETAIL

- complete 상태는 핵심 5종, 선택 인분 전체, 반영 재료 수, 실제 투입 가식부 기준 안내를 한 nutrition card 안에서 보여준다.
- partial은 `최소`와 반영 개수, unavailable은 숫자 0 대신 `정보 준비 중` 및 결측 이유를 사용해 상태를 합치지 않는다.
- 320/390 sticky CTA는 `[플래너에 추가] / [요리하기]` 위계를 유지하고 bottom navigation과 겹치지 않는다. full-page 캡처에서 CTA가 본문 중간에 한 번 보이는 것은 fixed element를 현재 viewport 위치에 기록하는 캡처 특성이다. 후속 재료 본문과 충분한 하단 여백이 남아 콘텐츠가 영구 가려진 상태가 아니다.
- desktop은 hero, 1인분/CTA rail, nutrition, 재료/만들기 순서가 자연스럽고 anchor의 primary/secondary action model을 바꾸지 않는다.

## Product Basis And Source Review

- mobile picker의 공공 제품 카드에서 `공공 영양DB`, `100g 기준`, 원 라벨 기준, 예상 열량과 핵심 영양이 같은 card 안에서 읽힌다.
- desktop liquid 보조 evidence는 `후레쉬 매실 제로슈가`의 `공공 영양DB`, `100mL 기준`, `라벨 100ml`를 직접 보여준다. 이름이나 밀도로 g↔mL를 추정한 표현은 없다.
- create의 320/390/1280은 `사용자 등록 공동 제품`, 다른 로그인 사용자의 검색/추가 가능 안내, 등록자만 수정·삭제 가능 안내를 먼저 보여준다. `내가 등록` 또는 공개 toggle 같은 잘못된 소유권 표현은 없다.
- create는 기준량 `100`과 `g`를 각각 field로 유지하며 원 라벨 기준량을 별도 optional field로 분리한다. primary `[등록하고 선택]`은 mobile/desktop 모두 form footer에 명확히 고정된다.
- MEAL_SCREEN은 `101g · 예상 열량 124.2 kcal`와 계획 영양 핵심 5종을 함께 보여줘 `100→101g`의 1g 조절 결과가 읽힌다.

## Planned Nutrition And Workflow Boundary

- PLANNER_WEEK와 MEAL_SCREEN은 합계를 `계획 영양` 및 `직접 계산`으로 표현하고 실제 섭취, 목표 달성, 의료 조언으로 확대하지 않는다.
- recipe+product 보조 evidence는 한 끼 합계 `630.4 kcal` 아래 Recipe Meal의 인분/status action과 완제품의 수량/type action을 분리해 함께 보여준다.
- ProductPlannerEntry에는 장보기/요리/남은요리 status action이 나타나지 않고 `[수량 변경] / [삭제]`만 있어 Recipe Meal workflow isolation이 보존된다.
- anonymized pin 보조 evidence는 등록자 정보 없이도 기존 제품명, `100g`, `123 kcal`와 계획 영양을 유지해 과거 planner pin을 current catalog로 바꾸지 않는다는 점을 보여준다.

## Account Delete Modal Review

- 320/390은 위험 action을 bottom sheet로, desktop은 centered alert dialog로 제공해 viewport에 맞는 익숙한 패턴을 쓴다.
- 설명은 개인 기록의 비가역 삭제와 공개 사용자 등록 제품의 익명 read-only 보존을 함께 말하며, `취소`와 danger `탈퇴하기`의 위계가 명확하다.
- repaired exact head의 320/390/desktop 재촬영에서 mobile 최초 초점은 `취소`이고 `취소`/`탈퇴하기`가 모두 44px이며, danger action이 초기 초점을 빼앗지 않는다.
- real Chrome에서 `Shift+Tab`/`Tab` 순환, 배경 `aria-hidden`/`inert`, body scroll lock, `Escape` 닫기, `계정 삭제하기` trigger focus 복귀가 통과했다. pending destructive 요청 중에는 Escape를 dialog boundary가 소비한다.
- 구현도 shared `useDialogBoundary`를 사용하고 `role="alertdialog"`, `aria-modal="true"`, labelled-by/described-by를 연결한다. repaired settings evidence에서는 viewport 가로 overflow가 없다.

## Responsive And Scroll Evidence

| 화면 | 320 | 390 | 1280 | 판정 |
| --- | --- | --- | --- | --- |
| RECIPE_DETAIL | sticky CTA와 영양/재료가 안전하게 세로 이동 | CTA/영양 card 위계 안정 | detail + side CTA rail 안정 | Pass |
| FOOD_PRODUCT_PICKER | filter wrap, card text/metadata 안정 | source filter와 결과 list 안정 | liquid `100mL` card와 검색 context 안정 | Pass |
| FOOD_PRODUCT_CREATE | form body와 sticky footer 분리 | 공개 안내와 CTA 안정 | 2-column form + footer 안정 | Pass |
| PLANNER_WEEK | 7/18 점심 `OFS 갈비탕 101g`, 67.7 kcal, 다음 날짜 header 노출 | 동일한 7/18 점심 row와 67.7 kcal, day-card 위계 안정 | table/sidebar, 동일한 7/18 점심 row와 67.7 kcal 안정 | Pass |
| MEAL_SCREEN | 핵심 5종, product card, sticky add CTA 안정 | 동일 위계, 여백 안정 | summary/content rail 안정 | Pass |
| ACCOUNT_DELETE_CONFIRM | sheet가 viewport 안에서 action을 보존 | sheet copy/action 안정 | centered dialog와 backdrop 안정 | Pass |

## Evidence Limits

- 캡처의 검은 원형 `N`과 일부 mouse pointer는 local Next.js/Chrome 검증 도구 artifact이며 배포 제품 UI가 아니다. repaired 320/390 settings evidence에서는 `N`이 취소 버튼 가장자리에 겹치지만 버튼 label·focus outline·44px geometry 판독은 가능하다.
- full-page screenshot은 fixed/sticky element를 현재 viewport 위치에 한 번 기록하므로, 페이지 아래쪽의 배경 내용이 같은 이미지에 이어 보일 수 있다. modal/CTA의 실제 viewport containment는 캡처와 구현 shell을 함께 판정했다.
- settings dialog boundary repair 후의 320/390/desktop account-delete evidence와 real Chrome focus/scroll/keyboard 결과를 final exact head에서도 유지 근거로 재검토했다.
- `PLANNER_WEEK` 320/390/desktop은 `adbf93d24ad9750640aab26c4f60b569ff8d7861`의 동일한 real Chrome/local Supabase 상태로 새로 교체됐다. 이후 final exact head `8a055a01fb77a28fd4f7c6e5e7587579ea74354f`까지의 diff는 `components/auth/social-login-buttons.tsx`의 QA fixture provider 선택 순서와 account-delete E2E selector/test 기대 갱신뿐이며, 이 6개 대상 화면의 layout·copy·interaction runtime을 바꾸지 않는다.
- 나머지 required screenshot도 carry-forward 검토했으며 final exact-head diff와 충돌하는 화면 계약 변화는 없다.
- 실제 iOS/Android 기기, 실제 screen reader, virtual keyboard의 전체 조합, 확대/zoom, production-scale 성능은 이 시각 authority가 증명하지 않으며 별도 Manual Only 범위다.
- 이 verification-only slice에서 runtime/app/API/DB 코드는 변경하지 않았다. 향후 runtime blocker가 발견되면 이 보고서에서 봉합하지 않고 별도 TDD repair PR 뒤 repaired exact head에서 Stage 4를 재실행해야 한다.

## Decision

- Stage 4 진행 가능 여부: **가능**
- Stage 5 confirmed 가능 여부: **가능**
- blocker: `0`
- confirmed_allowed: `true`
- 다음 행동: authority 관점의 추가 수정은 없다. Stage 6가 final exact head의 acceptance, exploratory QA와 모든 current-head check를 독립 확인한 뒤 closeout할 수 있다.
