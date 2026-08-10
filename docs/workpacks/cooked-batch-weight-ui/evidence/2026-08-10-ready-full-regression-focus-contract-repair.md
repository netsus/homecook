# Ready full-regression focus contract repair — HOLD

- 작성 task: `019fe028-be31-76f2-a5a7-986000a93374`
- 선행 merge-supervisor task: `019febe4-bdbf-73d2-9b1a-69cf1f5eefb1`
- branch: `feature/fe-cooked-batch-weight-ui-superseding-draft`
- PR: `#1323` (Draft 유지)
- 시작 head/tree: `0354922111404595155311b942596ec2e886bd2b` / `6fefae9018c5120e60c1f29daeb5cf1288acbda7`
- 결론: scoped focus contract repair는 GREEN이지만 기본 `pnpm verify:frontend`가 별도 Stage 4 evidence generator에서 2회 실패했으므로 로컬 보존 commit만 만들고 push/PR 동기화 없이 HOLD한다.

## 범위

수정 범위는 다음 두 파일로 잠갔다.

1. `tests/e2e/slice-cooked-batch-weight-ledger.spec.ts`
2. 이 evidence 문서

제품 component, PNG 기준물, runtime, API, DB, schema, 공식 계약, Stage 4 evidence generator는 수정하지 않았다. skip 추가, timeout 증가, 검증 약화도 하지 않았다.

## RED

merge supervisor의 기본 `pnpm verify:frontend`에서 기존 expectation은 최초 실행과 retry 2회, 총 3회 동일하게 실패했다.

- 위치: `tests/e2e/slice-cooked-batch-weight-ledger.spec.ts:451` (수정 전 line)
- 기존 expectation: `완료 저장`에서 `Tab` 한 번 뒤 `닫기`
- 승인된 320px DOM/focus 계약: `완료 저장 -> 돌아가기 -> 닫기`
- 판정: 제품 결함이나 flaky가 아니라 superseded UI와 불일치한 stale test expectation

작성 task에서도 수정 전 isolated desktop 실행으로 같은 RED를 1회 재현했다.

## scoped repair

320x568 viewport를 명시하고 다음 양방향 순서를 강하게 검증한다.

```text
완료 저장 -> Tab -> 돌아가기 -> Tab -> 닫기
닫기 -> Shift+Tab -> 돌아가기 -> Shift+Tab -> 완료 저장
```

`닫기 -> Tab -> 완료 저장`은 대화상자 본문에 다른 focusable control이 있으므로 전체 dialog의 실제 순서가 아니다. 따라서 승인된 Stage 4 evidence와 같은 역방향 `Shift+Tab` 검증으로 순환 경계를 고정했다.

## GREEN evidence

| 명령 | 결과 |
| --- | --- |
| target test, `desktop-chrome --repeat-each=3` | `3 passed` |
| target test, `mobile-chrome --repeat-each=3` | `3 passed` |
| `slice-cooked-batch-weight-ledger.spec.ts`, desktop + mobile | `11 passed`, intended `1 skipped` |
| Stage 4 evidence matrix isolated desktop 재검증 | `1 passed` |

두 번의 기본 `pnpm verify:frontend`에서도 수정한 ledger focus test는 실행 프로젝트에서 통과했다. 전체 gate의 선행 단계는 두 번 모두 다음과 같이 통과했다.

- lint: PASS
- typecheck: PASS
- product Vitest: `232 passed files`, `12 skipped files`; `2729 passed`, `175 skipped`
- build: PASS
- Lighthouse: `6 passed`

## 별도 full-regression blocker

기본 `pnpm verify:frontend`는 두 번 모두 full regression에서 다음과 같이 종료했다.

- total: `1122`
- passed: `951`
- intended skipped: `170`
- failed: `1`
- 동일 failing test: `tests/e2e/slice-cooked-batch-weight-ui-evidence.spec.ts:260`, `captures and verifies the Stage-4 viewport, state, and accessibility matrix`, `desktop-chrome`

두 번째 실행의 보존된 Playwright report에서 확인한 정확한 assertion은 다음과 같다.

- failure line: `tests/e2e/slice-cooked-batch-weight-ui-evidence.spec.ts:526`
- assertion: `maxRgbChannelDelta(leftoversFooter.backgrounds[1], leftoversFooter.dangerBackground).toBeLessThanOrEqual(1)`
- error: `Expected: <= 1`, `Received: 4`
- 상태: `버린 양 기록` confirmation 화면에서 `내용 확인` 직후 `readFooterMetrics`가 destructive CTA의 computed background를 즉시 읽음

이 실패는 scoped focus repair와 관계없는 Stage 4 evidence generator/harness blocker다. 확인된 사실은 `ModalFooterActions`의 primary button에 `transition-colors`와 hover background가 있고 generator가 클릭 직후 computed color를 읽는다는 점이다. 두 번의 full run은 같은 별도 test에서 실패했지만 isolated matrix는 통과했다. 따라서 현재 증거로는 PNG 파일 write collision보다 transition/hover timing 민감성이 더 유력한 원인이라는 추론만 가능하다. 제품 색상 결함이나 focus repair 회귀로 판정하지 않으며, 이 작성 task에서 harness를 고치지도 않는다.

### generator writes와 worker 설정 읽기 전용 확인

- generator는 `ui/designs/evidence/cooked-batch-weight-ui`에 PNG를 기록한다.
- matrix 후반부는 `runtime-focus-keyboard-overflow.json`, `runtime-axe-wcag.json`, `manifest.json`도 기록하지만 이번 failure는 그 `writeFile` 구간 전에 발생했다.
- 같은 spec의 두 test는 동일 evidence directory를 사용하며 `fullyParallel: false`로 파일 내부에서는 순차 실행된다.
- `package.json`에는 serial 또는 worker=1 전용 regression 스크립트가 없다.
- `test:e2e:regression`은 worker flag 없이 Playwright를 실행한다.
- `playwright.config.ts`도 `workers`를 지정하지 않아 CLI 기본값 `50%`를 사용한다.
- 현재 로컬은 logical CPU 10개이므로 기본 worker는 5개다.
- `.github/workflows/playwright.yml`도 `pnpm test:e2e:regression` 또는 `pnpm test:e2e:regression:ci`를 worker override 없이 호출한다.

기본 gate가 실패했으므로 별도 worker=1 실행을 기본 `pnpm verify:frontend` GREEN의 대체 근거로 사용하지 않았다. regression에서 중단되어 뒤의 전체 a11y, visual, security 단계는 이번 두 실행에서 시작되지 않았다.

## findings / handoff

- scoped stale focus expectation: repaired, isolated/adjacent GREEN
- 제품/component/API/DB/schema/공식 계약 finding: 없음
- 별도 harness finding: Stage 4 evidence generator의 transition-sensitive destructive background assertion이 full concurrency에서 `delta 4`로 실패
- required next owner: 별도 engineering/harness repair task에서 generator 안정화 후 기본 `pnpm verify:frontend` 재실행
- merge-supervisor: HOLD
- fresh re-review approval, Ready for Review, merge: 주장하지 않음
- Manual physical keyboard, server-Mac, capability activation: pending
- OAuth, production/staging, Discord, remote mutation: 실행하지 않음

## publication state

이 작성 task는 blocker 경계에 따라 scoped 변경을 로컬 commit으로만 보존한다. local branch ref만 전진시키며 push, PR body 변경, GitHub check 대기는 수행하지 않는다. remote branch는 시작 head를 유지하고, 정확한 local head/tree는 후속 handoff에서 기록한다.
