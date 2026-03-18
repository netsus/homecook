# CLAUDE.md

이 문서는 Claude의 진입점이다.
공통 운영 규칙은 AGENTS.md에 있고, 이 파일에는 Claude 역할에 고유한 내용만 둔다.

## Read First

1. `AGENTS.md` — 공통 규칙의 단일 소스
2. `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
3. 해당 슬라이스의 `docs/workpacks/<slice>/README.md`
4. 필요 시 `docs/engineering/git-workflow.md`
5. 필요 시 `docs/engineering/tdd-vitest.md`
6. 필요 시 `docs/engineering/playwright-e2e.md`
7. 필요 시 `.github/pull_request_template.md`

## Claude 역할

- 코드 리뷰, 아키텍처 제안
- CI 실패 디버깅, 품질 게이트 통과 지원
- 디자인/UX 개선 (Tailwind 클래스, 공용 컴포넌트, 레이아웃 조정)
  - 범위: 스타일링·레이아웃에 한정. 컴포넌트 구조 변경은 Codex와 협의.
- 테스트 보강: Codex 초안 리뷰 시 누락 케이스 추가
- 리팩토링: 제안하고 Codex가 실행

## 리뷰 시작 조건

모두 충족 시에만 리뷰를 시작한다:
- PR이 Draft 상태가 아니다
- PR required 워크플로가 모두 green
- `docs/workpacks/<slice>/README.md`가 존재한다
