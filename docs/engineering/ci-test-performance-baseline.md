# CI and Test Performance Baseline

상태: **canonical baseline / cleanup steps 8–9**

측정일: 2026-09-05

측정 기준 제품 commit: `1b008936df16dcef8f9a68a964a6ba8b4c616fce`

## 목적과 cleanup plan

이 문서는 CI와 테스트를 줄이기 전에 현재 시간, 반복 설치, 중복 실행, flaky 신호와
fail-closed 안전장치를 고정한다. 이 단계에서는 workflow, test, package script 또는
production release 파일을 수정하지 않는다.

후속 정리 순서는 다음과 같다.

1. PR과 protected branch의 concurrency identity를 분리해 PR의 superseded run만 취소한다.
2. security, release, migration, auth 변경은 필요한 전체 gate가 계속 실행되도록 path scope를 잠근다.
3. full regression의 2-project matrix에 이미 포함된 core smoke instance만 중복 제거하고,
   `mobile-ios-small` sentinel과 a11y·visual의 별도 결함 검출력은 보존한다.
4. fixed wait는 observable condition 기반 대기로 교체하고, 기존 회귀 테스트로 전후 동작을 고정한다.
5. 같은 commit의 master 및 PR 표본을 다시 측정해 wall time과 runner-time proxy를 비교한다.

기존 동작 보호 기준은 production attestation이 요구하는 7개 context, scope 실패 시 명시적
실패, security N/A success context, auth/session smoke, migration 관련 gate를 유지하는 것이다.

## 측정 방법

GitHub Actions run과 job의 `startedAt`, `completedAt`을 사용했다. GitHub timing API의
`billable.total_ms`는 조사한 run에서 0을 반환했으므로 실제 청구 시간이라고 주장하지 않는다.
대신 각 job elapsed time의 합을 **runner-time proxy**로 사용한다.

주요 재현 명령은 다음과 같다.

```bash
git fetch origin master --prune
gh run list --repo netsus/homecook --limit 500 --json databaseId,name,event,status,conclusion,createdAt,startedAt,updatedAt,headSha,headBranch
gh run view <run-id> --repo netsus/homecook --json jobs
gh api repos/netsus/homecook/actions/runs/<run-id>/timing
gh run view 33952741209 --repo netsus/homecook --log
git grep -n 'waitForTimeout' origin/master -- 'tests/e2e/**'
git grep -n '^concurrency:' origin/master -- '.github/workflows/*.yml'
```

## Workflow 실행시간 기준선

active job이 실제 실행된 최근 표본이다. path filter로 무거운 job이 전부 skip된 run은
표본에서 제외했다.

| 구분 | 표본 수 | 중앙값 | 평균 | 범위 |
| --- | ---: | ---: | ---: | ---: |
| protected `master` QA | 5 | 18분 48초 | 19분 00초 | 18분 01초~20분 02초 |
| protected `master` CI | 7 | 8분 02초 | 8분 03초 | 5분 43초~10분 51초 |
| PR QA | 20 | 5분 56초 | 6분 58초 | 3분 32초~18분 07초 |
| PR CI | 20 | 8분 41초 | 9분 47초 | 6분 58초~14분 55초 |

측정 snapshot 상한은 `2026-09-05T07:48:54Z`다. `startedAt DESC`로 조회해
`status=completed`이고 workload job이 실제 실행된 run만 포함했다. master는
`event=push`, `headBranch=master`, PR은 `event=pull_request`로 제한했다. 실패·취소도
실제 runner 비용이므로 제외하지 않았다. exact cohort는 다음과 같다.

- master QA 5, 하한 `2026-09-02T20:21:36Z`:
  `33952741209`, `33800780203`, `33741291245`, `33725381212`, `33678798303`
- master CI 7, 하한 `2026-09-02T20:21:36Z`:
  `33952741163`, `33841368835`, `33830629251`, `33800780160`, `33741291200`,
  `33725381214`, `33678798288`
- PR QA 20, 하한 `2026-09-03T08:36:04Z`:
  `33952276484`, `33951259707`, `33950736576`, `33950248038`, `33950102499`,
  `33849718177`, `33847020336`, `33843989284`, `33843751505`, `33799237457`,
  `33798303978`, `33777980839`, `33768764568`, `33739569339`, `33738602303`,
  `33737799533`, `33736964400`, `33735625449`, `33734818756`, `33734229832`
- PR CI 20, 하한 `2026-09-03T19:45:33Z`:
  `33952276470`, `33951259639`, `33950736595`, `33950248045`, `33950102484`,
  `33849718175`, `33847020419`, `33843989289`, `33843751577`, `33839757807`,
  `33827344882`, `33822062226`, `33820667573`, `33815347725`, `33814314344`,
  `33811038690`, `33810436973`, `33809770631`, `33807442462`, `33798303988`

### 최신 master exact run

`1b008936df16dcef8f9a68a964a6ba8b4c616fce`의 주요 run은 다음과 같다.

| workflow | run id | wall time | runner-time proxy |
| --- | ---: | ---: | ---: |
| QA | `33952741209` | 18분 31초 | 32분 04초 |
| CI | `33952741163` | 8분 28초 | 12분 02초 |
| Security Smoke | `33952741173` | 1분 51초 | 1분 45초 |
| Security Review | `33952741186` | 51초 | 1분 17초 |
| Policy | `33952741160` | 25초 | 23초 |
| 합계 | - | 동시 실행이므로 합산하지 않음 | **47분 31초** |

QA의 `full-regression` job은 18분 06초, 실제 Playwright test step은 17분 19초였다.
따라서 “master 전체 회귀가 18분 이상 걸린다”는 관찰을 이 baseline에 고정한다.

최신 PR head `94eb67c777390c7b7925e4b3a388f81a2f68ce45`의 주요 동시 실행 묶음은
사용자 wall time 8분 28초, runner-time proxy 29분 21초였다.

## 설치와 build 반복

최신 master 활성 실행에서 확인한 실제 반복은 다음과 같다.

| 항목 | 횟수 | step elapsed 합 |
| --- | ---: | ---: |
| `pnpm install --frozen-lockfile` | 9 | 50초 |
| Playwright Chromium 설치 | 5 | 99초 |
| 앱 build | 2 | CI 188초 + Lighthouse 185초 |

각 QA job이 checkout, pnpm/Node setup, dependency install을 반복한다. Playwright를 사용하는
smoke, accessibility, visual, full regression, security smoke도 Chromium 설치를 반복한다.
현재 `.github/workflows/*.yml`에는 workflow-level `concurrency`가 0개다.

동일 PR SHA에서도 새 event가 생길 때 기존 run이 계속된다. 표본 PR에서는 Policy가 같은
head에 네 차례 실행됐다. 이는 step 9에서 PR-only superseded run 취소를 도입할 근거다.

## 테스트 범위와 중복

최신 master QA 결과는 다음과 같다.

| suite | 예약 테스트 | 통과 | 제외 | flaky | test step |
| --- | ---: | ---: | ---: | ---: | ---: |
| full regression | 798 | 661 | 135 | 2 | 17분 19초 |
| core smoke | 75 | 65 | 10 | 0 | 2분 30초 |
| accessibility | 36 | 21 | 15 | 0 | 1분 38초 |
| visual | 48 | 25 | 23 | 0 | 1분 20초 |

full regression CI matrix는 `desktop-chrome`, `mobile-chrome` 두 project에서
`slice-*.spec.ts` 전체를 실행하므로 같은 두 project의 `@smoke-core` test도 포함한다.
별도 core smoke는 여기에 `mobile-ios-small`을 더한 세 project에서 실행된다. 따라서
full regression이 강제되는 run에서 desktop/mobile Chrome smoke instance는 중복이지만,
`mobile-ios-small` smoke는 작은 iOS viewport sentinel로서 고유하다. step 10은 겹치는 두
project instance만 제거하고 iOS sentinel을 계속 실행해야 한다.

run `33952741209`에서 별도 smoke는 project당 25개, 총 75 instances였다. full regression의
`@smoke-core`는 desktop 25개 + mobile 25개 = 50 instances다. 따라서 별도 smoke의
50개, 66.7%가 중복이고 `mobile-ios-small` 25개, 33.3%는 고유 sentinel이다.

accessibility와 visual은 별도 spec이고 결함 검출 목적도 다르다. 이 둘은 “같은 테스트”로
분류하지 않는다. 다만 full run에서 별도 job으로 함께 강제되기 때문에 checkout, install,
browser, fixture server 준비 비용이 중복된다. step 10은 검출력을 삭제하지 않고 준비 비용을
줄이는 방향을 우선한다.

## Fixed wait와 flaky 기준선

`origin/master`의 Playwright E2E에는 `waitForTimeout()`이 23곳, 11파일에 있다. 명시된
고정 대기 합은 14.86초이며, device/project 반복 전 수치다.

최신 성공 QA run도 retry 후 통과한 flaky test 2개를 기록했다. 동일 master SHA
`c1d43f60e427943087a7065f188d32224e739ecf`는 run `33678798303`에서
`1 failed + 5 flaky`였고, run `33679689965`에서는
성공했다. 현재 CI가 실패 test를 최대 2회 retry하므로 flaky 신호가 green workflow 안에
숨을 수 있다.

후속 변경에서는 fixed wait를 무조건 삭제하지 않는다. network response, locator state,
URL, animation end 또는 domain-specific readiness처럼 관찰 가능한 조건이 있을 때만 교체한다.
process timeout, retry backoff, race-condition fixture처럼 시간 자체가 계약인 wait는 일반적인
UI fixed wait와 구분한다.

## 반드시 유지할 fail-closed gate

CI의 `quality`, `build`, `security-function-authorization`, Security Smoke의
`security-smoke`, Security Review의 `dependency-audit`는 각 scope 계산이 실패하면
`always()` 경로에서 명시적으로 실패한다. path scope가 N/A인 경우에도 “scope 실패”와
구분되는 성공 context를 남긴다.

production attestation이 요구하는 context는 다음 7개다.

- `build`
- `changes`
- `dependency-audit`
- `policy`
- `quality`
- `security-function-authorization`
- `security-smoke`

release evidence는 context 누락, pending, failed, cancelled, 중복 rerun을 거부한다. 그러므로
step 9의 `cancel-in-progress`는 PR의 superseded run에만 적용한다. protected branch push는
release evidence를 보존하도록 별도 concurrency group을 사용하고 진행 중 run을 취소하지 않는다.

다음 범위는 단순 docs/UI 경량화와 동일하게 취급하지 않는다.

- production release, attestation, ruleset, policy workflow
- security, auth, session, ownership, authorization
- migration, schema, Supabase local-only gate
- dependency manifest와 lockfile
- CI path filter 또는 workflow 자체

이 범위가 바뀌면 관련 security/release/full gate가 계속 실행되어야 하며 scope resolver 실패는
fail-open으로 바꾸지 않는다.

## Step 8 완료 기준과 후속 비교

이 baseline 단계의 검증 항목은 다음과 같다.

- recent master/PR run과 job elapsed time 재계산
- 최신 master full regression 18분 이상 확인
- workflow log에서 install과 build 반복 횟수 확인
- full regression과 core smoke의 실제 포함 관계 확인
- Playwright fixed wait 위치와 합계 확인
- flaky retry 사례 확인
- production attestation required context와 scope failure 경계 확인
- 제품 코드, test, workflow, release 파일 변경 없음

step 9와 10 완료 뒤에는 같은 분류 기준으로 최소 다음을 다시 기록한다.

- master와 PR의 wall time 중앙값
- 같은 SHA의 runner-time proxy
- `pnpm install`과 Playwright install 횟수
- full regression과 core smoke 중복 test 수
- `waitForTimeout()` 위치 수와 flaky test 수
- 7개 release context와 security N/A/failure semantics 보존 여부

## Step 9 implementation contract

PR의 새 commit을 뜻하는 `synchronize` event가 같은 workflow의 이전 `synchronize` run을
대체할 때만 `cancel-in-progress`를 사용한다. 이때만 workflow 이름과 PR 번호 기반
`head-updates` group을 사용한다. `opened`, `reopened`, `edited`, `ready_for_review`, `labeled`와
`push`, `schedule`, `workflow_dispatch`는 run ID별 고유 group을 쓰고 취소하지 않는다.
따라서 같은 head에서 약한 metadata event가 이미 시작된 강한 gate를 취소하지 않는다.
`production-release-attestation.yml`에는 cancellation을 추가하지 않는다.

다음 workflow가 이 PR-only 정책을 사용한다.

- CI
- QA
- Policy
- PR Governance
- QA Eval
- Security Review
- Security Smoke

path scope는 required workflow 자체를 `paths-ignore`로 생략하지 않고 기존 job-level resolver에서
계속 계산한다. 따라서 N/A 성공 context와 scope-resolution 실패의 fail-closed context가 모두
남는다.

비실행 marketing archive와 생성 evidence만 runtime/browser scope에서 제외한다.

- `docs/marketing/assets/**`
- `ui/designs/evidence/marketing-demand-validation/**`
- `ui/designs/evidence/marketing-demand-validation-v2/source-*/**`
- browser QA에 한해 `tests/demand-validation.test.ts`, `tests/marketing-*.test.ts(x)`

marketing unit/contract test는 CI `quality`에서 계속 실행한다. 실제 `/beta` route,
`components/marketing/**`, API·DB·auth·migration·security·workflow·path-filter 변경은 기존
code/security/browser/full gate를 유지한다. manual/nightly run도 archive ignore와 무관하게
complete QA set을 실행한다.
