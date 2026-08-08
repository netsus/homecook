# COOK_MODE cooked-batch-weight-ledger — fresh independent design critique

> 검토 역할: `design-critic` 전용 독립 Codex App task
> task ID: `019fe02c-1b12-7d42-bcaf-0d5a02847967`
> 검토일: 2026-08-08
> reviewed input head: `f88bc1c0d4bad38e1ba35e224ee1c62741eb2b23`
> base master: `c982d97085ebcbe50da8a1b3c3de68bcd9f638a3`
> source branch / PR: `docs/cooked-batch-weight-ledger-stage1-relock` / PR #1285 (Draft)
> 공식 tuple: 요구사항 `v1.7.29` / 화면정의서 `v1.5.33` / 유저 Flow `v1.3.31` / DB `v1.3.31` / API `v1.2.35`

## Verdict

**PASS**

- blocker: **0** — finding ID 없음
- major: **0** — finding ID 없음
- minor: **0** — finding ID 없음
- actionable finding IDs: **없음**

Stage 2 진입에 필요한 이 fresh design-critic gate의 조건인 **blocker 0 / major 0**을 충족한다. 다만 이 PASS는 design-critic 범위만 닫는다. 별도 task의 390px/320px `product-design-authority`와 independent internal 1.5가 같은 successor lineage를 승인하기 전에는 Stage 2 전체 진입 조건이 충족되지 않는다.

## 독립성 및 검토 범위

- 이 task는 Stage 1 author, design evidence generator, product-design-authority, internal 1.5, merge/Ready 감독자 또는 Discord sender 역할을 겸하지 않았다.
- product runtime, API, DB, migration, capability, production/staging/remote write를 변경하거나 검증 완료로 주장하지 않았다.
- legacy `ui/designs/critiques/COOK_MODE-critique.md`, `ui/designs/authority/COOK_MODE-authority.md`, 15a/v1.5.1 evidence를 #8 승인 근거로 사용하지 않았다.
- 검토 대상은 input head의 `ui/designs/COOK_MODE.md`, Stage 1 workpack/acceptance/automation/workflow 상태, 아래 fresh PNG 2개와 PR #1285 body/files/current checks다.

## 직접 시각 검토 evidence

두 PNG를 Codex `view_image`의 `detail=original`로 각각 직접 열어 원본 크기로 검사했다.

| Evidence | Exact path | 원본 크기 | 직접 확인한 상태 |
| --- | --- | ---: | --- |
| mobile default | `ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-design-mobile-default-390.png` | `390×3949` | whole-board, 초기 무선택, known-g, Pending, 409 |
| mobile narrow | `ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-design-mobile-narrow-320.png` | `320×5158` | whole-board, Loading, Empty `[]`, weigh-later, 422, stored replay, creation-off existing-v2 drain |

원본 IHDR 크기는 `sips`로도 `390×3949`, `320×5158`임을 재확인했다. 두 파일은 한 runtime 화면의 긴 캡처가 아니라 여러 상태를 세로로 모은 Stage 1 mock evidence다.

## 계약 및 UX 대조 결과

### 1. whole-board와 스크롤 경계

- 기존 whole-board의 한 화면 안에서 전체 재료와 전체 조리순서를 읽는 구조를 유지한다.
- 이전/다음 단계, 단계별 화면 전환, COOK_MODE 인분 조절 UI를 되살리지 않는다.
- 390px와 320px 모두 page-level horizontal overflow, CTA 잘림, fixed action bar의 본문 가림 또는 interaction model 교체가 보이지 않는다.
- 긴 콘텐츠는 whole-board/sheet 내부 세로 스크롤로 처리한다는 문서 계약과 일치한다.

### 2. exact pantry row와 초기 선택

- product row는 제품명을 1차 정보로, 브랜드·보관 위치/row context를 2차 정보로 보여준다.
- generic row는 표준 재료명을 1차 정보로 유지하며 product와 generic을 한 이름으로 뭉개지 않는다.
- raw UUID는 사용자 화면에 노출하지 않는다.
- 초기 pantry 선택은 0개이고, 동등 row·첫 row·최근 row의 자동 선택은 없다.
- known-g 예시에서도 사용자가 선택한 exact row만 선택 상태로 보이며 동등한 다른 row는 별도 미선택 항목으로 남는다.

### 3. weight exact-one과 상태 보존

- `음식만 무게(g)`와 `나중에 입력`은 exact-one radio로 표현되고 초기에는 둘 다 미선택이다.
- known-g는 positive `640g`, weigh-later는 g 입력 disabled/null 의미로 구분되며 servings→grams 추정이나 자동 전환이 없다.
- Empty는 pantry candidate `[]`를 오류로 만들지 않고, 명시적 weight action 뒤 완료 가능한 상태를 보여준다.
- Loading은 row와 완료 CTA를 잠그고 추측 선택을 만들지 않는다.
- Pending은 sheet의 모든 action과 중복 submit을 잠그고 단일 진행 상태를 보여준다.
- 409는 sheet를 유지하면서 나머지 exact selection과 `640g`을 보존하고 오류 요약을 우선한다.
- 422는 `0g` invalid control을 표시하고 오류 요약에서 해당 입력으로 이동하는 focus 계획을 드러낸다.
- stored replay는 최초 저장 결과를 한 번만 소비하고 성공 effect를 반복하지 않는 single-close/read-only 결과를 보여준다.
- creation-off evidence는 existing v2 whole-board와 `[취소]`/`[요리 완료]` drain control을 유지한다.

### 4. CTA, sheet, 390/320 fit

- whole-board primary CTA는 하단 오른쪽의 브랜드색 `[요리 완료]`, secondary는 `[취소]`로 위계가 분명하다.
- completion은 원래 context를 유지하는 bottom sheet 패턴이며 primary `[완료 저장]`과 secondary `[돌아가기]`가 일관된다.
- invalid/default/loading/pending에서는 primary action이 disabled이고 valid known/weigh-later에서만 활성화된다.
- 390px와 320px 모두 제품명 줄바꿈, radio+input, error copy와 하단 action이 가로로 잘리거나 겹치지 않는다.
- 설계 문서는 44×44px target, 16px spacing/token 사용, bottom safe area, sheet 내부 scroll과 virtual keyboard 회피를 명시한다. mock의 버튼/행 위계도 그 계획과 충돌하지 않는다.

### 5. 접근성 및 focus 계획

- `ui/designs/COOK_MODE.md`는 sheet title initial focus, focus trap, background inert, Escape/돌아가기 opener focus restore를 명시한다.
- checkbox/radio/input/CTA의 programmatic label, 44×44px target, 제품명→브랜드/context→선택 상태의 screen-reader 순서, 색상 단독 상태 표현 금지를 명시한다.
- 409/422는 sheet를 닫지 않고 오류 요약 focus와 field 연결을 요구한다.
- 이 계획은 Stage 1 설계로 충분히 명시되어 있으며, 실제 동작 증명은 Stage 4 implementation evidence가 담당하도록 workpack과 PR body가 구분한다.

### 6. successor 및 activation 경계

- #8은 existing complete body의 exact pantry/weight UI와 R/R+1 drain만 다루며 새 endpoint, field, status, reason, error 또는 screen을 만들지 않는다.
- #9의 meal-log linked consumed event/pointer와 #11의 final LEFTOVERS/COOK_MODE polish, container helper, delayed-weight/unrecoverable full UX를 선점하지 않는다.
- R+2 personal recipe + snapshot-v2 creation 공동 activation을 현재 evidence나 PASS로 승인하지 않는다.
- creation-off에서 새 creation을 열지 않고 existing v2 read/cancel/complete만 유지하는 경계가 문서와 이미지에서 일치한다.

## 문서·이미지·PR 사실 일치

- `CURRENT_SOURCE_OF_TRUTH.md`, workpack README, acceptance, automation spec, workflow work item/status와 `COOK_MODE.md`가 동일한 공식 tuple과 `temporary / planned / not_started / pending` 경계를 사용한다.
- PR #1285는 reviewed input head `f88bc1c0d4bad38e1ba35e224ee1c62741eb2b23`, base `c982d97085ebcbe50da8a1b3c3de68bcd9f638a3`, Draft 상태였다.
- reviewed input head의 PR checks는 success 9 / intended skip 5 / pending·fail·cancel·rerun 0으로 확인했다.
- PR body는 design evidence generator가 critic/authority/internal 1.5가 아니며, runtime/PostgreSQL/E2E/live authority/activation 증거는 미래 또는 N/A라고 구분한다.
- 문서, 이미지, PR body 사이에 Stage 1 mock을 production runtime 증거로 승격하거나 미래 gate를 완료로 표시한 사실 불일치는 발견하지 못했다.

## Limitations

- 두 PNG는 정적 Stage 1 mock evidence이므로 실제 virtual keyboard occlusion, Tab/Shift+Tab focus trap, opener focus restore, screen-reader announcement, computed 44px target, WCAG contrast/accessible-name 또는 runtime overflow를 증명하지 않는다.
- 이 limitation은 자체 major가 아니다. `ui/designs/COOK_MODE.md`와 workpack이 해당 항목을 명시하고 Stage 4의 fresh 390px/320px implementation screenshot, component/E2E/a11y/visual evidence와 별도 authority review로 검증하도록 책임을 분리했기 때문이다.
- 이 critique는 product-design-authority, Stage 5/final authority, `Design Status: confirmed`, Ready 전환 또는 merge 판단을 대신하지 않는다.

## Contract Evolution Candidate

없음. PASS에 공식 계약 밖 해결책이 필요하지 않다.

## 다음 단계 권고

1. 이 report-only successor head를 기준으로 다른 독립 task가 390px/320px `product-design-authority`를 수행해 blocker/major 0을 확인한다.
2. 별도 independent internal 1.5가 Stage 1 전체 문서·bookkeeping·evidence를 같은 lineage에서 검토한다.
3. critic, authority, internal 1.5가 모두 exact-head 조건을 충족한 뒤에만 Stage 2 진입 여부를 판단한다.
