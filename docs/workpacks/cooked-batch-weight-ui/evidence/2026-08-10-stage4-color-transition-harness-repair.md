# Stage 4 color-transition harness repair evidence

## 작업 식별과 기준점

- Codex task ID: `019fec15-9c36-7ee2-b551-5e40db0d547e`
- 역할: PR #1323 Ready gate의 fresh independent test-harness repair author
- 실행 모델: GPT-5.6-Sol, reasoning high
- Claude 사용: 없음
- 시작 local HEAD: `5daf67c5488de09c2e3256a1433a1cefc618c5c4`
- 시작 local tree: `b00b5a1032077d9ae29f9261e38f61a490df77d2`
- 확인한 remote-tracking PR head: `0354922111404595155311b942596ec2e886bd2b`
- 변경 범위: 이 문서와 `tests/e2e/slice-cooked-batch-weight-ui-evidence.spec.ts`만 해당한다.

제품 코드, API, DB, schema, 공식 계약, 승인된 PNG 및 manifest는 변경하지 않았다. 새 local commit의 HEAD/tree는 이 문서가 포함되는 commit 자체를 가리킬 수 없으므로 최종 handoff 보고에서 정확한 값으로 기록한다.

## RED와 원인 확인

이전 fresh author task가 남긴 기본 full regression RED는 두 번 모두 `951 passed / 170 skipped / 1 failed`였다. 실패는 `tests/e2e/slice-cooked-batch-weight-ui-evidence.spec.ts`의 destructive footer color 비교였고, strict channel tolerance `<= 1`에 대해 실제 차이 `4`가 관찰됐다. 같은 테스트를 즉시 isolated 실행하면 통과했다.

이번 task에서도 수정 전 대상 테스트를 기본 병렬 조건으로 5회 반복해 `4 passed / 1 failed`를 재현했고, 실패한 실행의 channel 차이는 `12`였다. 따라서 제품 색상 계약의 고정 실패가 아니라 병렬 부하에서 드러나는 측정 시점 문제임을 확인했다.

원인은 확인 버튼의 `transition-colors`와 hover 상태가 결합된 상태에서 클릭 직후 `getComputedStyle()`을 읽던 harness 순서였다. 클릭 뒤 포인터가 버튼 위에 남거나 새 버튼 위치와 겹치면 hover 색상 전환의 중간 프레임을 읽을 수 있었다. 기존 `stabilize()`는 색상 측정 뒤에 호출되어 이 읽기를 보호하지 못했다. 애니메이션 종료만 기다린 중간 진단에서는 5회 모두 hover 종착색의 channel 차이 `135`로 실패해, 포인터 hover가 원인의 필수 구성 요소임을 추가 확인했다.

## 최소 repair

기존 repository E2E pattern을 재사용해 destructive footer 색상을 읽기 전에 다음 순서를 명시했다.

1. 포인터를 `(0, 0)`으로 이동해 hover 상태를 해제한다.
2. footer button들의 Web Animations API animation이 끝날 때까지 기다린다.
3. 두 번의 `requestAnimationFrame`으로 settled paint를 기다린다.
4. 기존 computed-color 측정과 strict `<= 1` channel 비교를 그대로 실행한다.

색상 tolerance, assertion, skip, retry, timeout, worker 수, screenshot/evidence 기준은 완화하지 않았다.

## GREEN 증거

- 대상 테스트 병렬 stress: `5 passed` (`--repeat-each=5 --workers=5`)
- 대상 테스트 isolated 반복: `3 passed` (`--repeat-each=3 --workers=1`)
- 관련 evidence spec 전체: `2 passed`
- 기본 `pnpm verify:frontend`: exit `0`
  - ESLint: passed
  - TypeScript typecheck: passed
  - Vitest: `232 passed files / 12 skipped`, `2729 passed / 175 skipped`
  - Next.js production build: passed, static pages `81`
  - Lighthouse: `6 passed` (2 URLs x 3 runs)
  - Playwright full regression: `952 passed / 170 skipped`, default workers `5`
  - Accessibility: `18 passed / 15 skipped`
  - Visual: `23 passed / 22 skipped`
  - Security: `12 passed`

## 산출물과 보류 범위

검증 실행이 만든 PNG, manifest 및 임시 파일은 모두 시작 시점의 byte 상태로 복구했다. `ui/designs/evidence/cooked-batch-weight-ui/*`의 복구 후 blob aggregate는 시작 snapshot과 같은 `50d1dc2a7c6248bbe0c38e32db4739a63d0359ce594bc76f68171bcd7ac4596b`이다.

이 task에서는 push, PR 본문 수정, GitHub Ready 전환, merge, Discord 알림, production/staging, remote Supabase/Vercel, migration, OAuth, server-Mac 및 capability activation을 수행하지 않았다. Manual/server-Mac 확인과 R/R+1/R+2 activation은 계속 pending이다.
