# Stage 4 Real Chrome / Responsive Evidence

## Verification boundary

- Slice: `nutrition-products-cross-slice-release-qa`
- Runtime app head at initial capture: `8c681b3acaca36b265e826cb589b528545b64f28`
- Repaired exact head recheck: master `24b7ced4e0678c2fb4fc0537cca625d6f6bc4cc9` after TDD repair PR `#1055`
- Final merged verification head: master `8a055a01fb77a28fd4f7c6e5e7587579ea74354f` after TDD repair PRs `#1057` and `#1058`
- Browser: the user's already-open Chrome tab, claimed through the Chrome control surface
- Data: real local Supabase only; fixture browser data was not used as release evidence
- Viewports: `320x720`, `390x844`, desktop `1280x900`
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
- Exploratory QA / eval: PASS (`35/35` covered, blocked `0`, finding `0`, score `100`)
- Exploratory bundle: `.artifacts/qa/nutrition-products-cross-slice-release-qa/latest/exploratory-report.json`, `.artifacts/qa/nutrition-products-cross-slice-release-qa/latest/eval-result.json`
- Independent product design authority: PASS, blocker / major / minor `0 / 0 / 0`
- Authority report: `ui/designs/authority/PLANNER_WEEK-nutrition-products-cross-slice-release-qa-authority.md`

The broad first `pnpm verify:frontend` attempt exposed stale account-delete selectors left behind by the accessibility copy repair. Separate TDD repair PR `#1058` aligned those deterministic tests with the current `탈퇴하기` label and restored QA fixture login providers. The final current-head rerun above is the passing result; the superseded failing run is not used as release evidence.

## Manual-only limits

- Physical-device verification was not substituted by desktop emulation.
- A real screen reader was not used.
- True production-scale load was not generated.
- Production / staging / provider writes were intentionally not performed.
- The transient recipe error state was verified through deterministic browser interception rather than corrupting the real local database.
