# Nutrition / Products / Planner Cross-Slice Release QA Authority Review

> current status: `CONFIRMED` — PR `#1059` 당시 PASS와 두 차례 post-merge reopen 이력을 아래에 보존하며, `#1060` 주간 정합성 repair와 `#1063` 모바일 44px 터치 타깃 repair 뒤 fresh independent authority review가 최종 PASS했다.

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
> reviewed runtime exact head: `fefbc298420dbe863b8847f60d7db9409647a578` (`origin/master` exact match at final review time)
> evidence packaging boundary: PR `#1059` contains evidence only; its final merged SHA and current-head checks are intentionally reserved for the independent Stage 6 closeout because a commit cannot include its own final hash.
> repaired evidence: `SETTINGS_ACCOUNT_DELETE_CONFIRM-320.png`, `SETTINGS_ACCOUNT_DELETE_CONFIRM-390.png`, `SETTINGS_ACCOUNT_DELETE_CONFIRM-desktop-1280.png`, `PLANNER_WEEK-320.png`, `PLANNER_WEEK-390.png`, `PLANNER_WEEK-desktop-1280.png`

## Historical #1059 Verdict (superseded by post-merge reopen)

- historical PASS / FAIL: **PASS**
- historical verdict: `pass`
- Blocker / Major / Minor: `0 / 0 / 0`
- 한 줄 요약: `PLANNER_WEEK` 320/390/desktop이 모두 `7/18 점심 · OFS 갈비탕 · 101g · 67.7 kcal`로 일치하고, final exact head의 추가 변경도 QA fixture 로그인 분기와 stale E2E selector에 한정되어 계정 삭제 접근성 경계와 나머지 필수 화면의 위계·반응형·workflow 분리에 회귀가 없으므로 release authority를 통과한다.

## Final post-#1063 Verdict

- final PASS / FAIL: **PASS**
- final verdict: `pass`
- Blocker / Major / Minor: `0 / 0 / 0`
- 한 줄 요약: `#1060`이 제목·날짜 strip·7개 날짜 카드의 주간 동기화를 복구하고 `#1063`이 모바일 주 이동과 식사 추가 control의 실제 hit area를 최소 `44×44px`로 확장했으며, exact master `fefbc298420dbe863b8847f60d7db9409647a578`의 320/390/1280 real Chrome evidence에서 `OFS 갈비탕 · 101g · 67.7 kcal`, 주 이동·복귀, 가로 overflow `0`이 모두 일치하므로 release authority를 최종 통과한다.

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

### Second blocker: post-#1059 week-range mismatch

- PR `#1059` merge `d05c81d8f0e88ed3dc97b1da4fae9271b0b683ca` 뒤 별도 integrated authority가 390 evidence를 다시 보면서 새 blocker `1`을 발견했다.
- 화면 제목과 날짜 카드는 `7/13–7/19`였지만 사용자가 실제로 보는 상단 요일 strip은 `7/06–7/12`였다. 기존 authority는 제품 row와 영양 값 일치에 집중해 이 세 범위의 동기화를 별도 acceptance로 고정하지 못했다.
- 별도 TDD repair PR `#1060`은 늦은 측정 retry, stale interaction guard, range-change recenter를 추가했다.
  - reviewed repair head: `73d471aeb1f0e1a9b000a5cf57ebf77751c94234`
  - merged repaired master: `d8a8aa496717ec2b304d070bde1f3f57a8725c5a`
  - planner Vitest: `41/41` PASS
- repaired master runtime DOM recheck:
  - 320/390/1280 initial: heading / visible strip / day cards `7/13–7/19`
  - next week: heading / visible strip / day cards `7/20–7/26`
  - `이번 주` return: heading / visible strip / day cards `7/13–7/19`
  - 320/390 page overflow: `0 / 0`
  - product / nutrition: `OFS 갈비탕 · 101g`, `67.7 kcal`
- runtime blocker와 evidence mismatch는 수정·재촬영됐고, fresh independent authority는 이 주간 정합성 blocker가 닫힌 것을 확인했다.

### Third blocker: post-#1060 mobile touch targets

- `#1060` merge 뒤 fresh authority는 주간 범위 불일치는 닫혔다고 판정했지만, 모바일의 이전/다음 주 `30×30px`, 이번 주 높이 `30px`, 채운 슬롯 추가 `32×32px`, 빈 슬롯 추가 높이 `38px`가 제품 디자인 최소 `44×44px`보다 작아 blocker `1`로 다시 열었다.
- 별도 TDD repair PR `#1063`은 compact 시각 크기를 유지한 채 바깥 hit area만 확장했다.
  - RED: touch-target 회귀 테스트 `2` failures
  - reviewed repair head: `cb5b8b76ff1b9abe209b55baa5ea7a59b6aefab3`
  - merged repaired master: `fefbc298420dbe863b8847f60d7db9409647a578`
  - planner Vitest: `42/42` PASS
  - independent code review: `APPROVE`, unresolved finding `0`
  - current-head full regression: `12m42s` PASS
- repaired master real Chrome geometry:
  - 320/390 이전·다음 주: `44×44px`
  - 320/390 이번 주: `71.71×44px`
  - 채운 슬롯과 빈 슬롯 meal-add: 최소 `44×44px`
  - compact inner visuals: 이전·다음 `30×30px`, 채운 슬롯 plus `32×32px` 유지
- final fresh authority는 exact master와 새 320/390/1280 evidence를 재검토해 blocker / major / minor `0 / 0 / 0`, `PASS`로 판정했다.

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
- 320/390의 이전·다음 주, 이번 주, 채운 슬롯과 빈 슬롯 meal-add control은 모두 실제 hit area가 최소 `44×44px`이며, 작은 내부 시각 요소를 유지해 정보 밀도와 터치 안정성을 함께 지킨다.
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
- Chrome full-page capture는 nested horizontal scroller를 runtime DOM의 `scrollLeft`와 다른 위치에서 렌더링하는 한계도 보였다. repaired 320/390 evidence는 같은 로컬 서비스가 실제 렌더링한 donor strip pixel만 base full-page의 strip 영역에 합성해 capture distortion을 보정했다. 날짜·수치·제품·layout을 새로 그린 것이 아니며, heading/visible strip/day-card 일치는 합성과 독립된 Chrome DOM geometry로 먼저 검증했다.
- settings dialog boundary repair 후의 320/390/desktop account-delete evidence와 real Chrome focus/scroll/keyboard 결과를 final exact head에서도 유지 근거로 재검토했다.
- `PLANNER_WEEK` 320/390/desktop은 final exact master `fefbc298420dbe863b8847f60d7db9409647a578`의 동일한 real Chrome/local Supabase 상태로 다시 교체됐다. 이 최종 evidence는 `#1060`의 strip recenter와 `#1063`의 44px hit area를 모두 포함한다.
- 최신 모바일 full-page 캡처에서도 nested horizontal scroller가 capture 시점에 한 주 전으로 이동하는 도구 artifact가 재현됐다. 320/390은 같은 exact master의 next-week donor에서 브라우저가 실제 렌더링한 `7/13–7/19` 날짜 행 pixel만 current-week base의 동일 위치에 합성했다. 새 텍스트·수치·제품·layout을 그리지 않았고, 320×568 및 390×844 runtime DOM geometry와 주 이동·복귀를 합성과 독립적으로 검증했다.
- 최신 evidence의 `QA FIXTURE MODE` panel, mouse pointer와 focus 흔적은 local 검증 도구 artifact이며 배포 제품 UI가 아니다. panel로 가려진 부분은 다른 viewport, desktop evidence와 DOM geometry로 교차 검증했다. 320 파일은 width `320px` responsive evidence이며 capture 동안 panel을 아래로 옮기기 위해 viewport height `1200px`를 사용했다.
- 나머지 required screenshot도 carry-forward 검토했으며 final exact-head diff와 충돌하는 화면 계약 변화는 없다.
- 실제 iOS/Android 기기, 실제 screen reader, virtual keyboard의 전체 조합, 확대/zoom, production-scale 성능은 이 시각 authority가 증명하지 않으며 별도 Manual Only 범위다.
- PR `#1059` verification-only evidence branch 자체에서는 runtime/app/API/DB 코드를 변경하지 않았다. 이후 발견된 runtime blocker는 이 보고서에서 봉합하지 않고 별도 TDD repair PR `#1060`으로 수정했다. `#1060`은 planner strip timing/recenter runtime을 변경했지만 API/DB/public contract는 변경하지 않았다. test-only `#1061`/`#1062`도 runtime 계약을 바꾸지 않았다.

## Historical #1059 Decision

- Stage 4 진행 가능 여부: **가능**
- Stage 5 confirmed 가능 여부: **가능**
- blocker: `0`
- confirmed_allowed: `true`
- 다음 행동: authority 관점의 추가 수정은 없다. Stage 6가 final exact head의 acceptance, exploratory QA와 모든 current-head check를 독립 확인한 뒤 closeout할 수 있다.

## Current post-#1063 decision

- fresh Stage 5 confirmed 가능 여부: **가능**
- current verdict: `pass`
- Blocker / Major / Minor: `0 / 0 / 0`
- confirmed_allowed: `true`
- 다음 행동: authority 관점의 추가 수정은 없다. 독립 Stage 5/6 reviewer가 final closeout diff와 current-head checks를 확인한 뒤 closeout PR을 merge할 수 있다.
