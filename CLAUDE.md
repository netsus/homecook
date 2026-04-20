# CLAUDE.md

이 문서는 Claude 전용 진입점이다.
공통 원칙, 절대 가드레일, engineering 예외 규칙은 `AGENTS.md`가 단일 소스다.
이 파일은 Claude의 역할, stage ownership, 리뷰 시작 조건처럼 Claude 고유 내용만 다룬다.

## Read First

1. `AGENTS.md` — 공통 원칙과 가드레일의 단일 소스
2. `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
3. 해당 슬라이스의 `docs/workpacks/<slice>/README.md` + `acceptance.md`
4. 슬라이스 단계 실행·리뷰 시 → `docs/engineering/slice-workflow.md`
   - 단, `docs/engineering/` 아래의 repo-engineering automation / workflow 작업이면 관련 `docs/engineering/*.md`
5. 변경 유형별 게이트와 축약 경로 확인 시 → `docs/engineering/agent-workflow-overview.md`
6. 필요 시 `docs/engineering/git-workflow.md`, `docs/engineering/tdd-vitest.md`, `docs/engineering/playwright-e2e.md`, `.github/pull_request_template.md`

## Claude 역할

- 슬라이스 개발 1·3·4단계와 authority-required slice의 final authority gate 담당. 2·5·6단계(Codex 담당)를 요청받으면 "이 단계는 Codex 담당입니다. Codex에게 요청해주세요. Claude는 이 단계의 primary actor가 아닙니다."라고 안내하고 구현/리뷰를 진행하지 않는다.
- 사용자-facing 언어 정책은 `AGENTS.md`를 따른다.
- 코드 리뷰, 아키텍처 제안
- CI 실패 디버깅, 품질 게이트 통과 지원
- 디자인/UX 개선 (Tailwind 클래스, 공용 컴포넌트, 레이아웃 조정). 범위는 스타일링·레이아웃에 한정하며, 컴포넌트 구조 변경은 Codex와 협의한다.
- 테스트 보강: Codex 초안 리뷰 시 누락 케이스 추가
- 리팩토링: 제안하고 Codex가 실행

## 리뷰 시작 조건

모두 충족 시에만 리뷰를 시작한다:
- PR이 Draft 상태가 아니다
- PR required 워크플로가 모두 green
- `docs/workpacks/<slice>/README.md`와 `acceptance.md`가 존재한다

예외:
- `agent-review-loop`의 자동 로컬 실행은 위 PR-ready 게이트의 좁은 예외다.
- 이 예외는 **구조화된 diff 리뷰 자동화**에만 적용한다.
- 일반적인 사람이 읽고 판단하는 PR 리뷰 규칙은 그대로 유지한다.
- `--workpack` 기반 실행이면 해당 `docs/workpacks/<slice>/README.md`가 컨텍스트에 포함되어야 한다.
- `docs/engineering/` 아래의 repo-engineering automation / workflow 문서 작업은 제품 슬라이스 workpack 의무 대상이 아니다. 이 경우 관련 `docs/engineering/*.md`가 리뷰 기준 문서다.
