# TDD with Vitest

## Default

- 기본 테스트 러너는 `Vitest`다.
- `Jest`는 별도 도입 이유가 있을 때만 사용한다.
- 신규 기능 또는 회귀 수정은 구현 전에 실패 테스트를 먼저 설계한다.
- 브라우저 사용자 흐름과 외부 연동 검증은 `docs/engineering/playwright-e2e.md` 기준을 따른다.

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
