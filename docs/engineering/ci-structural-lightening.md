# B5 이후 CI·테스트 후속 경량화

상태: 1차 및 2026-09-10 전반 효율화 구현·로컬 검증 완료. 아래 1차 기록은 당시 기준이며,
현재 실행 정책은 마지막 `전반 효율화` 절을 따른다.

기준: `b499f704` (2026-09-10). 제품 계약을 바꾸지 않는 engineering 정리다.
기존 시간 기준은 [CI baseline](./ci-test-performance-baseline.md), 증거 보존 기준은
[tracked inventory](./tracked-content-lightening-inventory.md)를 따른다.

## 수정 전 계획

1. **P1 / 중복 준비 비용**: core visual의 web/app 호출을 한 Playwright 호출로 합친다.
   동일 spec·tag·3개 project의 test 목록을 전후 비교하고 실제 브라우저 검증을 실행한다.
   개별 web/app 명령과 full visual, screenshot assertion·baseline은 유지한다.
2. **P1 / 과도한 CI 범위**: `quality` 안의 영양 PostgreSQL 검증을 화면 파일만 바뀐 PR에서
   생략한다. `components/**`, `public/**`, app의 TSX/CSS만 화면 파일로 인정한다.
   다른 코드와 섞이면 실행하며, protected push와 full-ci에서도 기존 실행을 유지한다.
   전체 Vitest·lint·typecheck와 7개 release context, scope 실패 시 실패하는 규칙은 유지한다.
3. **P2 / 테스트 분류 부채**: 오래된 테스트·product/harness 범위를 조사한다. 고유 assertion이
   있는 테스트는 나이만으로 삭제하지 않는다. 분류가 완전하다는 증거 없이 CI 전체 테스트를
   두 부분집합으로 대체하지 않는다.
   34d/34e/35c의 자체 viewport matrix도 기기별 옵션 상속 여부를 확인한 뒤 판단한다.
4. **P2 / 증거 저장 비용**: `ui/designs/evidence`의 크기·중복·참조를 조사한다. 활성 디자인
   기준, authority, visual baseline은 보존한다. 삭제는 consumer와 복구 경로가 확인된 단위로만 한다.
5. **P3 / 중복 workflow**: PR metadata event, build·설치 반복을 조사하되 다른 강도의 gate나
   release evidence를 취소하는 동작은 도입하지 않는다.

## 검증 전략

- 기존 path filter, workflow, concurrency, release context, local-only 테스트를 수정 전에 실행.
- 실행 범위와 visual command 결합에 대한 실패 테스트를 먼저 추가한 뒤 최소 수정.
- scoped Vitest, lint, typecheck, QA eval, 전체 Vitest, 실제 core visual 및 DB 통합 검증.
- GitHub 실행시간은 실제 run을 측정한 경우에만 개선 수치로 제시한다.
- 계획·결과는 별도 reviewer가 검토한다. 같은 작업의 보조 리뷰는 독립 제품 Stage 승인이 아니다.

## 진단과 적용 결과

아래 횟수는 코드와 테스트 목록으로 확인한 사실이다. runner 시간 단축은 아직 추정이다.

| 우선순위 | 확인한 구조 | 이번 처리 | 확신 |
| --- | --- | --- | --- |
| P1 | core visual의 같은 spec/tag를 web 1 project, app 2 project로 두 번 실행 | 15개 test 목록을 보존한 단일 호출. fixture 서버 2회→1회, 보고서도 하나로 보존 | 높음 |
| 보존 | 34d/34e/35c는 viewport를 고정해도 project의 touch/mobile/userAgent를 상속 | 완전 중복이 아님. desktop-only 축소안을 리뷰에서 철회하고 원래 모든 project 유지 | 높음 |
| P1 | CI quality가 화면 변경에도 isolated nutrition SQL을 검증 | presentation-only PR에서 DB step 하나만 N/A. 알 수 없는 코드, 혼합 변경, push는 기존 실행 | 높음 |
| P2 | 719개 tracked Vitest 파일 중 product 276 / harness 48, 합집합 밖 396 / 교집합 1 | 부분집합을 전체 CI 대체 수단으로 사용하지 않음 | 높음 |
| P2 | evidence 107.738MiB, exact duplicate 추가 사본은 3.175MiB | 활성 consumer가 있어 보존. 중복 blob은 Git 저장에서는 이미 공유됨 | 높음 |
| P3 | CI와 Lighthouse의 앱 build, QA job별 설치가 반복됨 | 준비 비용은 남지만 artifact 공유는 env·build provenance 검증이 먼저 필요 | 높음 / 절감량 미측정 |

product/harness는 완전한 partition이 아닌 집중 검증 목록이다. 중복은
`tests/dev-local-supabase-runtime.test.ts`이며, 누락 예에는 `account-generation-*`,
`account-session-generation-*`, `about-screen.test.tsx`가 있다. 오래된 이름만으로 지우거나
CI에서 제외하면 auth·generation 회귀까지 사라질 수 있다. 후속 분류 작업은 전체 파일의
합집합 완전성·교집합 없음 검증을 먼저 마련해야 한다.

### 남은 작업과 선택하지 않은 대안

- **성공 캡처**: `tests/e2e/helpers/evidence-capture.ts`의 `captureEvidenceScreenshot`은
  tracked write off에서도 report screenshot+attach를 수행한다. 31 media/32 enrichment/
  cooked-batch ledger/YouTube async의 7개 callsite가 사용한다. report 소비자와 이미지 반환값
  의존성을 확인한 다음 기존 on-demand helper로 전환할 수 있다. 이번에는 진단 자료를 없애지 않았다.
- **과거 캡처 시나리오**: `slice-cooked-batch-weight-ui-evidence.spec.ts`의 pre-Stage-4 테스트는
  on-demand 캡처가 꺼져도 4 context를 만든다. 후속 matrix와 dialog/LEFTOVERS readiness assertion의
  포함 관계를 증명한 뒤 그 테스트만 `@evidence-capture`로 분리할 후보다.
- **캡처 준비**: `slice-account-session-generation-foundation.spec.ts`의 capture helper는
  기본 실행에서도 페이지 준비를 한다. prepare callback 없는 4개 호출은 opt-in 후보이며,
  320px geometry·contrast·inert 검사와 오류/충돌 조건은 계속 회귀에 남겨야 한다.
- **증거 archive**: marketing-v2 source manifest, baemin authority, desktop porting ledger부터
  consumer→대체 경로→Git SHA/blob/hash 복구 receipt 순서로 이관해야 한다. 전체 ignore 추가는
  이미 tracked인 용량을 줄이지 못한다. before/after가 같은 byte라는 이유만으로 지우지 않는다.
- **workflow 취소**: 현재 synchronize-only 취소는 강한 metadata gate를 보존한다.
  모든 PR event를 같은 group으로 합치면 약한 event가 full gate를 취소할 수 있으므로 유지한다.
- **build 공유**: CI build와 Lighthouse build를 합치는 대안은 fixture env/산출물 무결성·실행
  의존성을 바꾼다. 이번에는 독립 job을 유지하고 core visual의 확정 중복부터 제거했다.

### 재현

```bash
git ls-files 'tests/*.test.ts' 'tests/*.test.tsx'
cat vitest.product.config.ts vitest.harness.config.ts
git ls-tree -r --long b499f704 -- ui/designs/evidence
pnpm test:e2e:visual:core --list
pnpm exec vitest run tests/ci-path-filter.test.ts tests/playwright-workflow.test.ts
```

## 검증 기록

- 수정 전 path/workflow/concurrency/release/local-only: 57 passed.
- 신규 범위/command 테스트 RED: 7 failed / 27 passed → 최종 관련 gate 61 passed.
- 별도 리뷰가 Playwright `runBeforeCreateBrowserContext`의 project option 상속을 확인했다.
  34d/34e/35c 축소안과 그 mock 테스트는 철회했고 최종 diff에서 해당 spec 변경은 0이다.
  viewport만 같아도 `isMobile`/`hasTouch`/userAgent가 다르면 중복 검증으로 분류하지 않는다.
- core visual: 전후 목록 동일, 실제 15 passed(53.1초), screenshot baseline 변경 0.
- isolated nutrition PostgreSQL: 14 passed. lint / typecheck 통과. QA eval: 7 case 예상 판정 일치, 100점.
- 첫 전체 Vitest는 다른 검증과 동시 실행 중 8,319 passed / 509 skipped / 1 timeout(357.69초).
  `personal-recipe-editor-full-local-verifier.test.ts`의 증거 수집이 5초를 초과했다.
  파일 변경 없이 단독 재실행은 16 passed(2.87초). 자원 경합 가능성이 있어 다른 무거운 검증과
  분리해 재확인했다. timeout 설정이나 assertion은 변경하지 않았다.
- 최종 전체 Vitest: **8,317 passed / 509 skipped / 0 failed**, 719파일 중 681 passed / 38 skipped,
  **327.02초**. 다른 무거운 검증을 겹치지 않은 실행이며, 이 시간 차이를 CI 개선 효과로 보지 않는다.
- 별도 code review: 기기 옵션 상속 관련 P1을 수용해 축소안을 철회한 뒤 재리뷰 미해결 0건.
- 실제 GitHub runner의 전후 시간, Linux full visual 및 전체 device regression은 이 기록만으로
  통과했다고 주장하지 않는다. 로컬 변경 범위의 실제 브라우저 검증과 구분한다.

## 변경 파일과 남은 한계

- `.github/workflows/ci.yml`, `scripts/ci-path-filter.mjs`: nutrition DB step 범위 분리.
- `.github/workflows/playwright.yml`, `package.json`: core visual 단일 호출.
- `tests/ci-path-filter.test.ts`, `tests/playwright-workflow.test.ts`: 실행/보존 경계 회귀 검사.
- `docs/engineering/agent-workflow-overview.md`, `docs/engineering/playwright-e2e.md`:
  실제 CI·명령 정책 동기화.
- `docs/engineering/tracked-content-lightening-inventory.md`, 이 문서: 측정과 판단·검증 기록.

제품 소스, 기기별 E2E assertion, PNG/JSON 증거, snapshot baseline, 의존성 변경은 없다.
GitHub runner 시간 측정·PR·merge·배포는 수행하지 않았다. 남은 불확실성은 최초 전체 실행의
timeout 재현 조건과 실제 CI 비용 절감량이다. 보호 테스트와 전체 회귀를 축소해 해결하지 않는다.

## 2026-09-10 전반 효율화

사용자는 남은 테스트·미사용 파일·CI·저장소 용량 정리를 추가 승인했다. 내부 계획은
`.omx/plans/repository-efficiency-plan.md`이며 Architect 보완 후 Critic APPROVE를 받았다.
권한·DB·read-only·실제 기기별 검증은 유지하고, 테스트의 나이만으로 삭제하지 않는다.

### 실제 병목 기준

GitHub master `b499f704`의 CI run `34342979475`는 quality 507초(그중 Test 387초), build 210초였다.
QA run `34342979518`의 full-regression은 1,076초(검사 step 1,025초), Lighthouse는 306초였다.
이 QA run은 Lighthouse 실패였으며 경량화 완료 증거로 재사용하지 않는다. 직전 PR의
full QA `34341160258`도 full-regression 1,083초였다.

로컬 Git object는 loose 29.36MiB + pack 832.05MiB다. GitHub API가 보고한 repository size는
634,596KiB(약 619.7MiB)로, 로컬의 여러 ref/object 보관량과 구분한다. 의존성 `node_modules`의
약684MiB도 Git 추적 파일과 별개다. Git 이력 재작성·force push·다른 작업의 cache 삭제는 하지 않는다.

### 적용한 정리

| 대상 | 전 | 후 / 효과 |
| --- | --- | --- |
| Vitest 분류 | product/harness 합집합 밖 396파일, 교집합 1 | 전체 718 = product 667 + harness 51, 누락·중복 0. 새 파일은 product |
| 실제 중복 테스트 | 원본 route test를 다시 import하는 alias 3개 | alias 삭제, canonical 2파일 유지. 중복 실행 33개 제거 |
| 문서 테스트 fixture | 전체 docs 약74MB를 2회 복사 | 고정 19개 text 309,391bytes를 2회 복사. 변조 전 정상 통과도 검사 |
| CI quality | 화면 전용 PR도 전체 infra/harness 실행 | 모든 변경 파일이 화면 허용 경로인 PR만 product. 혼합·unknown·push·full-ci·출력 누락은 full |
| scope checkout 4개 | 전체 파일과 전체 Git graph | graph 유지, 분류 스크립트 1개만 checkout. 과거 blob을 선행 다운로드하지 않음 |
| full browser regression | 독립 runner 1개 | 3개 shard. CI 810 = 271+269+270, complete 1,215 = 405+405+405, 교집합 0 |
| 성공 증거 캡처 | helper가 매번 PNG 저장·attach | 직접 sink 7곳을 기존 on-demand helper로 통합, 옛 helper 삭제. 기능·기기 호출 320개 동일 |
| 미사용/historical PNG | 154개 / 61,479,005bytes | source SHA/blob/hash/크기/해상도·복구 검증 후 삭제. 현행 자산 1,144개 hash 동일 |

`product`는 이전처럼 빠른 일부 테스트가 아니라 전체에서 순수 도구 모음을 뺀 완전한 모음이다.
명시적 harness 목록은 import·파일 읽기·간접 이미지 의존까지 감사했다. authority image 검증과
local runtime은 product에 남겼다. UI와 docs가 함께 바뀌면 전체를 유지하므로 모든 PR이 빨라지는 것은 아니다.

scope의 single-file sparse checkout은 pinned [actions/checkout 구현](https://github.com/actions/checkout/blob/d23441a48e516b6c34aea4fa41551a30e30af803/src/git-source-provider.ts#L168)을 확인했다.
실제 원격 master의 single-branch 전체 graph probe는 `.git` 6.7MiB, working file 1개로 동일 push
분류를 수행했다. 이것은 실제 Actions 전체-ref fetch의 전송량 측정과는 구분한다.
3분할은 [Playwright 공식 sharding](https://playwright.dev/docs/test-sharding)의 방식이며
기존 fullyParallel·device·retry 설정을 유지한다. 벽시계 대기는 줄일 수 있지만 runner 총 사용량은 늘 수 있다.

### 삭제·보존 기준

- `public/assets/plush/` 66 PNG: 전체 tracked 참조 0, 현행 plush-v2 별도 존재.
- `docs/design/assets/spoon-grade-characters/` 16 PNG: 고해상도 옛 원본. 문서 5개의 참조를
  archive로 전환하고 실제 grade 자산은 유지했다.
- `ui/designs/evidence/desktop-mvp-porting/` 72 PNG: 완료 증거. 문서 22개와 53행 ledger를
  유지하고 이미지 참조 9개 문서를 전환했다. 새 캡처는 `.artifacts`로 출력한다.
- 복구: [원본 receipt](../../ui/designs/evidence/historical-manifests/retired-assets-20260910.json),
  [복구 방법](../../ui/designs/evidence/historical-manifests/retired-assets-20260910.md).
- 17개 legacy evidence spec은 기본 slice CI에 포함되지 않는다. 일부 고유 검증과 수동 진단
  경로를 보존했다. desktop slice6/7/8은 별도 자동 실행 소비자가 없지만 여러 너비의 모달·요리
  내용 검사가 있어, 현재 회귀와의 동등성을 확인하지 않고 함께 삭제하지 않았다. 현재 UI에서
  이 세 수동 spec 전체가 통과한다는 주장도 하지 않는다. baemin authority PNG는 실제 파일
  존재를 검증하는 현재 계약이 있어 보존했다.
- cooked/account capture context는 별도 1440px·empty fixture 검증을 포함하므로 제거하지 않았다.
  성공 screenshot sink만 제거했으며 실패 진단과 실제 visual assertion은 유지했다.

### 검증과 한계

- CI 선택/분할/sparse 경계 RED 8 failed → GREEN, 단일 파일 checkout의 실제 classifier 실행도 통과.
- partition RED 4 failed → GREEN. 실제 Vitest 목록으로 전체·부분 모음의 합집합/교집합 검증.
- alias 원본 assertion의 이름·순서 동일. 문서 fixture 19개는 변조 전 정상 통과를 추가 확인.
- evidence 경계 RED 2 failed → GREEN 17 passed. archive 회귀 포함 관련 99 tests 통과,
  35a/35c automation-spec CLI 통과. 삭제 원본 154개 전체 복구·hash 일치.
- 전체 Vitest·실제 세 browser shard·lint·typecheck·QA eval·최종 code review 결과는 아래와 같다.
- GitHub current-head workflow를 실행한 결과가 아니므로 실제 merge 대기 감소량은 아직 미측정이다.
  현재 tree 용량 감소를 Git 이력 용량 감소로 표현하지 않는다.

### 최종 실행 기록

- 세 CI shard 실제 실행: 1/3 = 195 passed / 76 skipped, 2/3 = 239 passed / 30 skipped,
  3/3 = 242 passed / 28 skipped. 합계 **676 passed / 134 기존 skipped / 0 failed**로 B5와 동일하다.
  로컬에서는 서버 충돌·자원 경합을 피하려고 `--workers=4`로 순차 실행했다. GitHub 동시 실행의
  시간 개선을 이 로컬 시간으로 대신 입증하지 않는다.
- auth/session security browser: **12 passed**. lint·build 통과, build 후 typecheck 통과.
- QA eval: 7개 case의 예상 판정 일치, score 100. 별도 code review 차단 발견 0건.
- 제품 모음 최종: **7,501 passed / 509 skipped / 0 failed**, 667파일 중 629 passed / 38 skipped,
  **97.88초**. UI-only PR에서 제외되는 도구 검사는 push·혼합 변경 등의 전체 실행에 남는다.
- 전체 모음 최종: **8,297 passed / 509 skipped / 0 failed**, 718파일 중 680 passed / 38 skipped,
  **327.81초**. 이전 전체 8,317개 대비 중복 33개를 제거하고 분류·복구·CI 보호 검사 13개를 더했다.
  전체 모음 자체의 시간 단축은 주장하지 않는다. PR 선택 실행과 browser shard가 대기 시간을 줄이는 지점이다.
- 전체 변경을 Git index에 반영한 뒤 추적 목록·domain·source evidence·분류·archive·scope 검사를
  다시 실행해 **70 passed**를 확인했다. 최종 staged diff의 whitespace 검사도 통과했다.
- 첫 제품 실행은 삭제 alias 3개가 Git index에 남아 `MISSING_TRACKED_SCAN_FILE`로 실패했다.
  해당 삭제를 stage한 후 domain 검사와 제품 전체를 재실행해 통과했다. 검사기를 완화하지 않았다.
- 첫 typecheck는 브라우저 dev server가 생성 중인 `.next/types`와 새 테스트의 env 타입에서 실패했다.
  env 타입을 명시하고 dev server 종료 후 build→typecheck 순서로 재실행해 통과했다.
- 기존 master Lighthouse 실패 원인은 HOME LCP 4,576.39ms > 4,500ms였다. 해당 예산은 유지했다.
  제품 화면 로딩 개선이나 이 기존 GitHub 실패의 해결을 이번 결과로 주장하지 않는다.
- 작업 산출물은 `chore/ci-structural-lightening`의 로컬 변경이며, PR·merge·배포는 하지 않았다.
  원본 복구는 과거 Git commit에 의존한다. 향후 history rewrite를 하려면 원본을 별도 검증된
  보관소로 옮긴 뒤 receipt의 복구 경로부터 갱신해야 한다.

## PR #1549 출고 검증 보수

사용자가 커밋·PR·전체 검사·병합을 승인했다. 서버 배포는 별도이며 실행하지 않는다.
첫 GitHub HEAD `31f3b059`에서 quality/build/security/visual은 통과했고, HOME LCP와 편집기 fixture가 실패했다.

- HOME LCP는 가이드 이미지였으며 초기 로고가 표시138px에 비해1040px 원본135KB로 전송됐다.
  로고 원본·CSS·접근성은 유지하고 기존 Next image optimizer에 표시 폭 `138px/174px`을 전달했다.
  로컬 로고 응답은3,359bytes이며 Lighthouse HOME3회는3,691.61/4,326.81/3,722.40ms로 기존4,500ms 기준 통과.
  관련 unit64 passed, build/lint 및 core visual15 passed. 이미지 원본·snapshot 기준·성능 예산은 변경하지 않았다.
- 편집기 CI trace에서 mock하지 않은 알림 목록 GET이401을 반환해 로그인 안내가 재료 체크박스를 가렸다.
  해당 spec의 정상 인증 fixture에 빈 알림 목록을 명시하고 force 클릭을 실제 label 클릭+checked 확인으로 바꿨다.
  모든 기기에서 해당 spec은12 passed/6 기존 skipped, retry0으로 통과했다. 제품 인증 로직은 불변이다.
- 추가 수정 별도 review: 발견0. 새 HEAD의 GitHub 전체 검사 완료 후에만 병합한다.
- 초기회귀 shard 시간은320/459/462초였고, 마지막 shard는위 fixture실패를 포함했다.
  최종 성공실행의 시간과 구분하며, 이 실패실행을 출고증거로 재사용하지 않는다.
