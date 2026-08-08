# COOK_MODE cooked-batch-weight-ledger — fresh independent product design authority

> 검토 역할: `product-design-authority` 전용 fresh Codex App task
> authority task ID: `019fe041-2ff4-7f62-9786-79a46aecae0c`
> 검토일: 2026-08-08
> reviewed exact docs head: `2e81b729001625149d6617018fe416743cc40bdd`
> visual lineage head: `f88bc1c0d4bad38e1ba35e224ee1c62741eb2b23`
> corrected critic commit: `f102b9bbff2d19679babcdde2541497ef06abc66`
> base master: `c982d97085ebcbe50da8a1b3c3de68bcd9f638a3`
> source branch / PR: `docs/cooked-batch-weight-ledger-stage1-relock` / PR #1285 (Draft)
> critic task: `019fe02c-1b12-7d42-bcaf-0d5a02847967`
> critic report: `ui/designs/critiques/COOK_MODE-cooked-batch-weight-ledger-critique.md` (`PASS`, blocker/major/minor `0/0/0`)
> 공식 tuple: 요구사항 `v1.7.29` / 화면정의서 `v1.5.33` / 유저 Flow `v1.3.31` / DB `v1.3.31` / API `v1.2.35`

> evidence:
> - `ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-design-mobile-default-390.png` — `390×3949`, `view_image detail=original` 직접 검사
> - `ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-design-mobile-narrow-320.png` — `320×5158`, `view_image detail=original` 직접 검사

## Verdict

**pass**

- blocker: **0** — finding ID 없음
- major: **0** — finding ID 없음
- minor: **0** — finding ID 없음
- actionable finding IDs: **없음**

Stage 2 전 fresh `product-design-authority` 조건인 blocker/major `0/0`을 충족한다. 이 verdict는 reviewed exact docs head의 Stage 1 설계와 visual lineage에 대한 authority 판정만 닫는다. 별도 task의 independent internal 1.5, Stage 1 docs PR merge와 후속 구현·검토 gate를 승인하지 않으며 `Design Status: confirmed`, Ready, merge 또는 R+2 activation으로 승격하지 않는다.

## 독립성 및 검토 범위

- 이 authority task는 author tasks `019fcad5-e90a-7f22-8446-f7fb4ef00c68`, `019fe035-d7af-7d20-bc20-87abef90f511`, evidence generator `019fcb39-c42a-74a2-980e-2f4a831e4808`, critic task `019fe02c-1b12-7d42-bcaf-0d5a02847967`와 다른 fresh task다.
- critic, author, internal 1.5, Stage 2, Ready, merge 또는 Discord 역할을 겸하지 않았다.
- product runtime, API, DB, migration, capability, production/staging/remote write를 수행하거나 완료로 주장하지 않았다.
- legacy `ui/designs/authority/COOK_MODE-authority.md`, `ui/designs/critiques/COOK_MODE-critique.md`와 15a/v1.5.1 evidence는 #8 판정 근거로 재사용하지 않았다.
- inherited `pnpm audit` high 4 (`js-yaml` 2, `nanoid` 2)는 dependency blocker evidence이며 이 authority가 수리하거나 디자인 finding으로 계산하지 않는다.

## 원본 시각 evidence 직접 검토

두 PNG를 각각 원본 크기로 열어 전체 길이를 직접 검사했다. 두 파일은 여러 상태를 세로로 합친 **Stage 1 static mock board**이며 실제 runtime viewport recording 또는 한 번의 연속 스크롤 캡처가 아니다.

| Evidence | 원본 크기 | 직접 확인한 상태 |
| --- | ---: | --- |
| mobile default | `390×3949` | whole-board, 초기 무선택, known weight, Pending, 409 |
| mobile narrow | `320×5158` | whole-board, Loading, Empty `[]`, weigh-later, 422, stored replay, creation-off existing-v2 drain |

### Mobile UX와 scroll containment

- 390px와 320px 모두 기존 dark whole-board의 한 화면 mental model을 유지하고, 완료 보조 입력만 white bottom sheet로 분리한다. card stack이나 별도 full-page completion으로 interaction model을 바꾸지 않는다.
- page-level horizontal scroll, 좌우 흔들림, CTA clipping, fixed action bar 겹침 또는 핵심 정보 잘림은 보이지 않는다.
- whole-board 본문과 sheet 내부 세로 스크롤, 하단 action/safe-area의 책임 경계가 시각적으로 분명하다. Stage 4에서는 body scroll lock, sheet max-height와 내부 scroll을 실제 DOM geometry로 다시 증명해야 한다.
- 320px에서도 제목, product name, 브랜드·보관 context, radio/input, 오류 copy가 정보 구조를 잃지 않고 줄바꿈되며 390px 대비 과도하게 성긴 밀도로 벌어지지 않는다.

### CTA와 familiar app pattern

- whole-board primary `[요리 완료]`와 sheet primary `[완료 저장]`은 브랜드색과 오른쪽 thumb zone으로 가장 강하게 읽힌다. `[취소]`/`[돌아가기]`는 neutral secondary로 명확히 구분된다.
- default, Loading, Pending, invalid 422에서는 primary CTA가 disabled되고 valid known/weigh-later에서만 활성화되어 action hierarchy가 상태와 일치한다.
- 원래 요리 context를 dimmed background로 유지한 bottom sheet는 짧은 선택·추가 입력이라는 과업에 익숙한 모바일 패턴이다. stored replay는 새 completion control 없이 terminal read-only 결과로 돌아가 중복 성공 action을 만들지 않는다.
- safe-area 계획은 mock 하단 action과 문서에 일관되게 드러난다. 실제 `env(safe-area-inset-bottom)` 적용과 virtual keyboard 회피는 Stage 4 implementation evidence 책임이다.

### 정보 위계, spacing과 material

- 제품 row는 제품명을 1차, 브랜드·보관 위치와 exact row context를 2차로 배치한다. raw UUID를 노출하지 않고 generic row와 product row의 의미도 뭉개지 않는다.
- 16px 모바일 gutter/card spacing, radius, surface separation과 blue brand CTA가 product action을 먼저 읽게 한다. 장식 색은 content hierarchy를 누르지 않는다.
- 선택 row의 blue outline/fill, 오류의 red border/copy, pending의 progress label은 색 이외의 checkbox·radio·문구와 함께 상태를 전달한다.
- 320px에서도 checkbox/radio 행과 CTA가 visually 44px 이상을 의도한 크기로 유지된다. 단, static PNG만으로 computed hit box가 정확히 `44×44px`인지 증명할 수는 없다.

### 상태와 interaction contract

- 초기 pantry 선택과 weight action은 모두 0/미선택이며 first/recent/equivalent row 자동 선택이 없다.
- `음식만 무게(g)`와 `나중에 입력`은 exact-one radio다. known은 positive `640g`, Empty `[]`와 weigh-later는 null weight 의미를 유지하며 servings/current remainder를 추측하지 않는다.
- Loading은 row/radio/CTA를 fail closed하고, Pending은 tap·Enter·touch 중복 submit 경로를 잠근다.
- 409는 sheet와 남은 exact selection/`640g`을 보존하고 error summary를 우선한다. 422는 `0g` invalid input과 연결된 오류를 표시하고 CTA를 disabled로 둔다.
- stored replay는 최초 저장 결과를 single-close/read-only로 소비하고 성공 effect 또는 completion control을 반복하지 않는다.
- creation-off는 새 snapshot-v2 creation을 열지 않으면서 existing v2의 read/cancel/complete drain을 유지한다.

### Keyboard, focus와 accessibility 설계

- `ui/designs/COOK_MODE.md`는 sheet title initial focus, focus trap, background inert, Escape/돌아가기 후 opener focus restore를 명시한다.
- 409/422는 sheet를 닫지 않고 error summary로 focus를 옮기며 server `fields[]`와 control을 연결한다. 422 mock은 virtual keyboard가 떠도 input/error/sticky CTA가 보이도록 sheet 내부 scroll 계획을 명시한다.
- checkbox, radio, input, CTA의 programmatic label, 제품명→브랜드/context→선택 상태의 screen-reader 순서, 색상 단독 상태 표현 금지와 44×44px minimum target이 문서에 잠겨 있다.
- 이 항목들은 Stage 1 설계 coverage로 충분하지만 runtime focus trap/restore, keyboard occlusion, accessible name/description과 실제 hit geometry는 Stage 4 component/E2E/a11y evidence가 직접 증명해야 한다.

## Scorecard

| Axis | Result | Authority 판단 |
| --- | --- | --- |
| mobile UX | **pass** | 390/320에서 핵심 행동, narrow fit, safe-area 계획과 page-level no-overflow가 분명하다. |
| interaction clarity | **pass** | no auto-select, exact-one known/weigh-later, fail-closed 상태와 retry/replay 의미가 명확하다. |
| visual hierarchy | **pass** | product→brand/context, primary→secondary CTA, error→field 순서가 안정적이다. |
| color/material fit | **pass** | 기존 dark board와 current blue app token 계열의 white sheet가 역할을 분리하며 상태 색이 사용성을 보조한다. |
| familiar app pattern fit | **pass** | whole-board context 위 bottom sheet, sticky actions와 terminal replay가 보편적 모바일 mental model에 맞는다. |

## 공식 계약과 successor 경계

- reviewed docs와 visual evidence는 공식 tuple `v1.7.29 / v1.5.33 / v1.3.31 / v1.3.31 / v1.2.35`를 그대로 소비하며 새 endpoint, request field, status, reason, public error 또는 screen을 발명하지 않는다.
- #8은 existing snapshot-v2 complete body의 `consumed_pantry_item_ids`, `weight_action`, `finished_weight_g`, exact pantry completion과 R/R+1 drain을 소유한다.
- #9 `meal-log-core`의 meal-log linked consumed event/pointer와 arbitrary-order entry reversal을 선점하지 않는다.
- #11 `cooked-batch-weight-ui`의 final LEFTOVERS/COOK_MODE visual polish, delayed-weight/unrecoverable/discard/adjust presentation, container helper와 full accessibility completion을 선점하지 않는다.
- R+2 personal recipe + snapshot-v2 creation 공동 activation은 Manual Only다. 이 pass는 R/R+1 evidence 또는 service-owner 승인 없이 activation 근거가 될 수 없다.
- #7 runtime projection repair가 current head에 포함돼도 #7 전체 상태는 `in_progress / needs_revision / pending`이며 Manual/server-Mac/OAuth, #8 R/R+1과 R+2 gate는 계속 열린다.

## Findings

actionable blocker/major/minor finding은 없다. finding ID도 발급하지 않는다.

## Before-coding 권고

아래는 pass를 뒤집는 finding이 아니라 Stage 4 구현 evidence에서 그대로 확인할 guardrail이다.

1. whole-board body와 completion sheet의 scroll container를 분리하고 sheet open 중 background/body scroll을 잠근다.
2. 모든 checkbox/radio/CTA의 computed hit box `44×44px+`, 기본 horizontal gutter `16px`, bottom safe-area와 sticky footer geometry를 390/320에서 측정한다.
3. initial focus→trap→409/422 error summary/field→Escape/돌아가기 opener restore를 keyboard E2E로 검증한다.
4. virtual keyboard에서 g input, error summary와 primary CTA가 동시에 접근 가능한지 실제 viewport로 확인한다.
5. Loading/Empty `[]`/Pending/409/422/stored replay/creation-off drain을 component/E2E 상태 증거로 고정하고 explicit user selection을 retry 중에만 보존한다.

## Limitations

- 두 PNG는 static Stage 1 mock board라서 실제 runtime scroll containment, browser safe-area, virtual keyboard occlusion, Tab/Shift+Tab focus trap, opener focus restore, screen-reader announcement를 증명하지 않는다.
- static pixels는 computed `44×44px` hit target, CSS token 적용, WCAG contrast ratio, accessible name/description 또는 DOM overflow width를 증명하지 않는다.
- 따라서 이 pass는 Stage 4의 fresh 390px/320px implementation screenshots, DOM/computed-style geometry, component/E2E/a11y/visual evidence와 후속 Stage 5/final authority를 대체하지 않는다.

## Contract Evolution Candidate

없음. 현재 pass에 공식 계약 변경이 필요하지 않다. 구현 중 공식 tuple 밖 endpoint/field/status/error/interaction contract가 필요해지면 수정하지 말고 candidate로 보고해야 한다.

## Next action

1. 이 authority report가 포함된 successor head를 별도 independent internal 1.5가 검토한다.
2. critic, authority, internal 1.5가 같은 successor lineage에서 blocker/major 또는 required finding 0이고 Stage 1 docs PR이 merge된 뒤에만 Stage 2 진입을 판단한다.
3. Stage 4는 runtime 390/320 implementation evidence와 keyboard/focus/44px/safe-area/no-overflow/a11y 증거를 새로 수집한다.
4. 이 task는 Ready, merge, Discord, internal 1.5, Stage 2 또는 R+2 activation을 수행하지 않는다.
