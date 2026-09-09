# TDD with Vitest

## Default

- 기본 테스트 러너는 `Vitest`다.
- `Jest`는 별도 도입 이유가 있을 때만 사용한다.
- 신규 기능 또는 회귀 수정은 구현 전에 실패 테스트를 먼저 설계한다.
- 브라우저 사용자 흐름과 외부 연동 검증은 `docs/engineering/playwright-e2e.md` 기준을 따른다.

## 실행 모음

- `pnpm test`는 전체 테스트다. `test:product`와 `test:harness`의 합집합도 전체이며 교집합은 없다.
- `tests/helpers/vitest-suite-patterns.ts`의 명시적 도구 테스트 목록만 harness로 분리하고,
  나머지와 새 테스트는 기본 product에 포함한다. 제품 모음은 빠른 일부 테스트 목록이 아니다.
- harness 편입 전 import뿐 아니라 파일 읽기·디렉터리 탐색·간접 이미지 참조도 확인한다.
  UI 변경으로 결과가 달라질 수 있는 테스트는 product에 남긴다.
- `tests/vitest-suite-partition.test.ts`가 경로 존재·완전성·중복·신규 파일 기본값을 검증한다.
  CI에서 어느 모음을 실행하는지는 `agent-workflow-overview.md`의 변경 유형 규칙을 따른다.

## Workflow

1. 요구사항을 Given/When/Then으로 분해한다.
2. 실패하는 테스트를 추가한다.
3. 최소 구현으로 테스트를 통과시킨다.
4. 리팩터링 후 회귀 테스트를 유지한다.

## Minimum Scenarios

아래 범주 중 관련 항목을 반드시 고려한다.

- happy path
- 에러 처리
- 빈 상태
- read-only 상태
- 상태 전이
- 인증/인가 경계
- 외부 입력 검증

## Review Questions

- 테스트가 실제 행동을 고정하는가
- 상태 전이 규칙을 명확히 검증하는가
- mock이 실제 동작을 가리는 수준으로 과하지 않은가
- 회귀 가능성이 높은 edge case를 담았는가
