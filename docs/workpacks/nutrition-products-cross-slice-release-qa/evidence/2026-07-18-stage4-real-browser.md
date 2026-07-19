# Stage 4 Real Chrome / Responsive Evidence

## Verification boundary

- Slice: `nutrition-products-cross-slice-release-qa`
- Runtime app head at initial capture: `8c681b3acaca36b265e826cb589b528545b64f28`
- Repaired exact head recheck: master `24b7ced4e0678c2fb4fc0537cca625d6f6bc4cc9` after TDD repair PR `#1055`
- Final runtime verification head: master `8a055a01fb77a28fd4f7c6e5e7587579ea74354f` after TDD repair PRs `#1057` and `#1058`
- Post-merge reopened repair head: master `d8a8aa496717ec2b304d070bde1f3f57a8725c5a` after planner week TDD repair PR `#1060`
- Latest runtime verification head: master `fefbc298420dbe863b8847f60d7db9409647a578` after mobile touch-target TDD repair PR `#1063`
- Evidence packaging boundary: PR `#1059` adds only this report, the authority report, and screenshots. Its own commit cannot self-reference its final SHA; Stage 6 must record the merged evidence SHA and current-head CI separately before closeout.
- Browser: the user's already-open Chrome tab, claimed through the Chrome control surface
- Data: real local Supabase only; fixture browser data was not used as release evidence
- Viewports: mobile full-page capture `320x1200`, runtime geometry recheck `320x568`, `390x844`, desktop `1280x900`
- External writes: production / staging / provider write `0`
- Runtime provider lookup: `0`; product search used the local `287,041`-row catalog
- This verification-only branch adds screenshots and evidence only. Runtime repairs, if any, are delivered through a separate TDD PR.

## Real browser flow

| Scenario | Result | Evidence summary |
| --- | --- | --- |
| Public catalog search | PASS | A public solid card showed `공공 영양DB`, `100g 기준`, original label basis and core nutrition. A public liquid card showed `공공 영양DB`, `100mL 기준`, `라벨 100ml`. |
| Shared manual create | PASS | Created a shared user product with name, brand, `100g`, original label basis and five core nutrients. The picker returned to the preserved date/meal context. |
| Owner edit / delete | PASS | The owner saw edit/delete actions, changed the energy value, observed the new value, then deleted the verification product. The deleted product disappeared from the search result. |
| Cross-user search / report | PASS | The other test user found the shared product with the `사용자 등록` tag, had no edit/delete action, submitted one report, and received `신고했어요.` without changing the product or existing planner data. |
| Planner add / edit / delete | PASS | Added `100g`, changed it to `101g`, observed `123 kcal -> 124.2 kcal`, then deleted only the ProductPlannerEntry. |
| Account deletion anonymization | PASS | The registering test account was deleted through `SETTINGS_ACCOUNT_DELETE_CONFIRM`. The other user's existing planner pin still showed the shared product and `123 kcal`; the catalog row remained searchable without owner edit/delete controls. |
| Recipe + product aggregation | PASS | The complete recipe and `100g` product produced a combined `630.4 kcal` meal summary. Removing the product left the recipe, its `registered` state, shopping action and `507.4 kcal` nutrition unchanged. |
| Workflow isolation | PASS | Product cards exposed only quantity/delete actions. Recipe Meal status, shopping, cooking, leftover and XP state were not written by ProductPlannerEntry operations. |

The user authorized arbitrary changes in these local test accounts and did not require data restoration. No production, staging or provider data was touched.

## Recipe nutrition states

Real local recipe snapshots were opened directly in Chrome.

| State | Actual UI result |
| --- | --- |
| ready / complete | `삼색샌드위치` showed numeric nutrition, selectable serving totals and `재료 11개 중 11개 반영`; the generic pending copy was absent. |
| partial | `감자느타리버섯국` showed `최소` nutrition values and the guidance that the values are a lower bound based on confirmed ingredients; the generic pending copy was absent. |
| unavailable | `버터 간장 계란밥` showed `정확히 계산할 수 있는 재료 정보가 아직 부족해요.` and did not present missing nutrients as zero. |
| temporarily unavailable | The merged deterministic browser test intercepts only the recipe response, verifies `영양 정보를 잠시 불러오지 못했어요`, keeps the rest of the detail usable and verifies nutrition-only retry. The real DB was not mutated to manufacture a transient failure. |

This directly disproves the previous failure mode where every recipe appeared as the same `영양 정보를 준비하고 있어요` state.

## Required responsive evidence

All required screen files are under `ui/designs/evidence/nutrition-products-cross-slice-release-qa/stage4/`.

| Screen | 320 | 390 | Desktop 1280 | Horizontal overflow |
| --- | --- | --- | --- | --- |
| `RECIPE_DETAIL` | `RECIPE_DETAIL-320.png` | `RECIPE_DETAIL-390.png` | `RECIPE_DETAIL-desktop-1280.png` | `0 / 0 / 0` |
| `FOOD_PRODUCT_PICKER` | `FOOD_PRODUCT_PICKER-320.png` | `FOOD_PRODUCT_PICKER-390.png` | `FOOD_PRODUCT_PICKER-desktop-1280.png` | `0 / 0 / 0` |
| `FOOD_PRODUCT_CREATE` | `FOOD_PRODUCT_CREATE-320.png` | `FOOD_PRODUCT_CREATE-390.png` | `FOOD_PRODUCT_CREATE-desktop-1280.png` | `0 / 0 / 0` |
| `PLANNER_WEEK` | `PLANNER_WEEK-320.png` | `PLANNER_WEEK-390.png` | `PLANNER_WEEK-desktop-1280.png` | `0 / 0 / 0` |
| `MEAL_SCREEN` | `MEAL_SCREEN-320.png` | `MEAL_SCREEN-390.png` | `MEAL_SCREEN-desktop-1280.png` | `0 / 0 / 0` |
| `SETTINGS_ACCOUNT_DELETE_CONFIRM` | `SETTINGS_ACCOUNT_DELETE_CONFIRM-320.png` | `SETTINGS_ACCOUNT_DELETE_CONFIRM-390.png` | `SETTINGS_ACCOUNT_DELETE_CONFIRM-desktop-1280.png` | `0 / 0 / 0` |

Supplementary files record partial/unavailable recipe states, the liquid `100mL` card, the combined recipe/product summary and the anonymized planner pin.

The mobile account-delete sheet exposes `44px` cancel/confirm actions. Smaller settings controls visible only in a full-page background capture are covered by the fixed modal overlay and do not receive pointer hit-testing while the dialog is open. The independent authority report records this distinction.

## Accessibility repair and exact-head recheck

Independent inspection found that the initial mobile settings confirmation sheet blocked pointer input but did not use the shared dialog-boundary hook. The defect was fixed test-first in separate TDD repair PR `#1055`, independently reviewed to `APPROVE` with zero remaining findings, and merged as `24b7ced4e0678c2fb4fc0537cca625d6f6bc4cc9`.

The merged exact head was then reopened in the user's real Chrome tab and rechecked:

- `320x720`: initial focus was `취소`; `aria-modal`, labelled-by and described-by were present; the background main was hidden from accessibility traversal; body scroll was locked; both active actions were `44px`.
- Keyboard loop: `Shift+Tab` from the first action moved to `탈퇴하기`, then `Tab` wrapped to `취소`.
- Escape: the sheet closed, body scroll and background accessibility state were restored, and focus returned to `계정 삭제하기`.
- `390x844` and desktop `1280x900`: horizontal overflow remained `0`; current repaired-head screenshots replaced the three required settings evidence files.
- Pending destructive requests consume Escape inside the dialog boundary. The regression is fixed by `39` passing settings/dialog-boundary tests, including an external `document`/`window` propagation test.

## Automation and authority

- Targeted cross-slice frontend Vitest: PASS (`6` files, `161 passed`)
- `pnpm verify:frontend:pr`: PASS (`1,603 passed / 24 skipped` product tests, `59 passed / 10 skipped` smoke, `8 passed / 1 skipped` core accessibility, `12 passed` core visual)
- `pnpm verify:frontend`: PASS (`1,603 passed / 24 skipped` product tests, `6` Lighthouse runs, `884 passed / 130 skipped` complete browser regression, `18 passed / 15 skipped` accessibility, `23 passed / 22 skipped` visual, `12 passed` security)
- Cross-slice prepared-food/planner regression: PASS (`65 passed / 23 conditionally skipped`, failure `0`)
- Exploratory QA / eval: PASS (`33/35` covered, blocked `2`, finding `0`, score `98`; the two blocked checklist items are the intentionally deferred evidence-PR merge gate and independent Stage 6 review)
- Exploratory bundle: `.artifacts/qa/nutrition-products-cross-slice-release-qa/latest/exploratory-report.json`, `.artifacts/qa/nutrition-products-cross-slice-release-qa/latest/eval-result.json`
- Historical PR `#1059` product design authority: PASS, blocker / major / minor `0 / 0 / 0` at its then-current evidence head
- Authority report: `ui/designs/authority/PLANNER_WEEK-nutrition-products-cross-slice-release-qa-authority.md`

The broad first `pnpm verify:frontend` attempt exposed stale account-delete selectors left behind by the accessibility copy repair. Separate TDD repair PR `#1058` aligned those deterministic tests with the current `탈퇴하기` label and restored QA fixture login providers. The final runtime-head rerun above is the passing result; the superseded failing run is not used as release evidence. PR `#1059` current-head checks are not claimed by this Stage 4 report and remain a Stage 6 merge gate.

## Manual-only limits

- Physical-device verification was not substituted by desktop emulation.
- A real screen reader was not used.
- True production-scale load was not generated.
- Production / staging / provider writes were intentionally not performed.
- The transient recipe error state was verified through deterministic browser interception rather than corrupting the real local database.

## 2026-07-19 post-#1059 integrated authority HOLD

PR `#1059`가 `d05c81d8f0e88ed3dc97b1da4fae9271b0b683ca`로 병합된 뒤, 별도 integrated authority가 390 evidence의 서로 다른 세 위치를 다시 대조했다.

- 주간 제목: `7/13–7/19`
- 날짜 카드: `7/13–7/19`
- 사용자가 실제로 보는 상단 요일 strip: `7/06–7/12`
- verdict: `HOLD`
- blocker / major / minor: `1 / 0 / 0`

즉 당시 이미지는 개별 값 `101g`, `67.7 kcal`가 맞더라도 한 화면이 같은 주를 가리킨다는 조건을 충족하지 못했다. 이 결함은 문서에서 PASS로 덮지 않고 별도 TDD repair PR `#1060`으로 되돌렸다.

## 2026-07-19 repaired-master Chrome recheck

- exact runtime master: `d8a8aa496717ec2b304d070bde1f3f57a8725c5a`
- repair reviewed head: `73d471aeb1f0e1a9b000a5cf57ebf77751c94234`
- planner Vitest: `41/41` PASS

### Runtime DOM results

| 시나리오 | 320 | 390 | Desktop 1280 |
| --- | --- | --- | --- |
| initial | 제목/보이는 strip/날짜 카드 모두 `7/13–7/19` | 제목/보이는 strip/날짜 카드 모두 `7/13–7/19` | 제목/날짜 카드 모두 `7/13–7/19` |
| 다음 주 | 제목/보이는 strip/날짜 카드 모두 `7/20–7/26` | 제목/보이는 strip/날짜 카드 모두 `7/20–7/26` | 제목/날짜 카드 모두 `7/20–7/26` |
| `이번 주` 복귀 | 제목/보이는 strip/날짜 카드 모두 `7/13–7/19` | 제목/보이는 strip/날짜 카드 모두 `7/13–7/19` | 제목/날짜 카드 모두 `7/13–7/19` |
| page overflow | `0` | `0` | `0` |

- initial evidence의 제품 row: `OFS 갈비탕 · 101g`
- 주간/날짜 계획 영양: `67.7 kcal`
- mobile strip은 `scrollLeft`와 `clientWidth`를 포함한 runtime DOM geometry 및 실제 visible button 목록으로 독립 검증했다.

### Mobile screenshot capture limitation and correction

Chrome full-page capture 도구는 nested horizontal scroller를 현재 DOM의 `scrollLeft`와 다른 위치에서 렌더링하는 한계가 있었다. 그래서 원본 full-page capture만 보면 runtime DOM은 올바른데 strip 픽셀만 이전 주처럼 보이는 capture distortion이 재현됐다.

- 320/390 evidence는 같은 로컬 서비스가 실제 렌더링한 픽셀만 사용했다.
- 현재 주 full-page를 base로 두고, 도구가 같은 strip을 올바른 위치에서 렌더링한 다음 주 capture에서 정확한 strip 영역의 service pixel만 잘라 합성했다.
- 텍스트를 새로 그리거나 수치·날짜·제품·layout을 임의 생성하지 않았다.
- 합성은 capture 도구의 nested-scroller offset distortion만 보정하며, runtime DOM의 제목/visible strip/날짜 카드 일치는 합성과 별도로 Chrome에서 먼저 검증했다.

따라서 이 3개 repaired evidence 파일은 실제 서비스 픽셀과 독립 DOM 측정을 함께 근거로 사용한다. 다만 fresh independent product-design authority, security/performance review, Stage 5/6, final closeout PR current-head CI는 아직 `pending`이며 이 문서가 최종 PASS를 대신하지 않는다.

## 2026-07-19 post-#1060 authority HOLD and #1063 current-head recheck

- post-`#1060` fresh authority verdict: `HOLD`
- blocker / major / minor: `1 / 0 / 0`
- reopened reason: 모바일 planner controls의 touch target이 `44px` 미만
- separate TDD repair PR `#1063` reviewed head: `cb5b8b76ff1b9abe209b55baa5ea7a59b6aefab3`
- merged current master: `fefbc298420dbe863b8847f60d7db9409647a578`
- planner Vitest: `42/42` PASS

### Current-head runtime DOM and touch-target results

| 시나리오 | 320 | 390 | Desktop 1280 |
| --- | --- | --- | --- |
| initial | 제목/보이는 strip/날짜 카드 모두 `7/13–7/19` | 제목/보이는 strip/날짜 카드 모두 `7/13–7/19` | 제목/날짜 카드 모두 `7/13–7/19` |
| 다음 주 | 제목/보이는 strip/날짜 카드 모두 `7/20–7/26` | 제목/보이는 strip/날짜 카드 모두 `7/20–7/26` | 제목/날짜 카드 모두 `7/20–7/26` |
| `이번 주` 복귀 | 제목/보이는 strip/날짜 카드 모두 `7/13–7/19` | 제목/보이는 strip/날짜 카드 모두 `7/13–7/19` | 제목/날짜 카드 모두 `7/13–7/19` |
| page overflow | `0` | `0` | `0` |

- current-week evidence의 제품 row: `OFS 갈비탕 · 101g`
- 주간/날짜 계획 영양: `67.7 kcal`
- mobile touch target:
  - prev / next: `44x44` at `320` and `390`
  - current-week button: `71.71x44`
  - meal-add CTA: minimum `44x44`
- runtime geometry는 mobile capture와 별도로 `320x568`, `390x844`, desktop `1280x900`에서 확인했다.

### Current-head capture limitation and correction

mobile full-page capture 도구는 nested horizontal scroller의 strip을 현재 DOM `scrollLeft`와 다른 위치에서 렌더링하는 artifact가 있었다. latest master evidence는 같은 최신 서비스의 실제 픽셀만 사용해 이 왜곡을 보정했다.

- mobile full-page base는 current-week latest capture다.
- donor는 같은 latest service의 next-week capture이며, current-week date row exact pixel 영역만 가져왔다.
- 새 텍스트, 날짜, 수치, 제품, 레이아웃은 생성하지 않았다.
- correction은 capture offset artifact만 보정하고, current / next / return coherence는 별도 runtime DOM 측정으로 먼저 통과시켰다.
- `QA FIXTURE MODE` panel, mouse/focus overlay는 local artifact이며 release UI evidence나 blocker로 취급하지 않는다.

### Current-head automation status

- core targeted tests: `16 files / 206 passed`
- planner Vitest: `42/42` PASS
- `typecheck` / `lint` / `git diff --check`: PASS
- E2E regression: `63 passed / 23 conditionally skipped / 2 timing failures`, isolated rerun `2/2` PASS
- current-head full regression: `12m42s` PASS

fresh independent product-design authority는 exact master와 latest screenshots/runtime measurements를 재검토해 `PASS`, blocker / major / minor `0 / 0 / 0`으로 판정했고, 분리된 Stage 5 reviewer도 `APPROVE`, unresolved finding `0`으로 닫았다. Stage 6와 final closeout PR current-head CI는 아직 `pending`이므로 최종 closeout 선언은 아니다.
