# CLAUDE.md

이 문서는 Claude가 이 저장소에서 작업할 때 가장 먼저 읽어야 하는 최소 운영 규칙이다.
상세 규칙은 연결된 문서를 따르고, 이 파일에는 반복해서 필요한 핵심만 둔다.

## Read First

1. `AGENTS.md`
2. `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
3. 해당 작업의 `docs/workpacks/<slice>/README.md`
4. 필요 시 `docs/engineering/git-workflow.md`
5. 필요 시 `docs/engineering/tdd-vitest.md`
6. 필요 시 `.github/pull_request_template.md`

## Core Rules

- 공식 문서가 wireframe보다 우선한다.
- 구현 단위는 화면 하나가 아니라 `세로 슬라이스(workpack)`다.
- 문서에 없는 필드, 상태, 엔드포인트를 임의로 추가하지 않는다.
- public contract 변경 시 문서 영향도를 먼저 기록한다.
- API 응답은 `{ success, data, error }` 래퍼를 유지한다.
- UI는 관련 범위의 `loading / empty / error / read-only` 상태를 포함한다.
- 비로그인 보호 액션은 로그인 안내 후 return-to-action을 지원한다.

## Git And PR

- 브랜치, 커밋, PR 규칙의 단일 기준은 `docs/engineering/git-workflow.md`다.
- PR 본문 형식의 단일 기준은 `.github/pull_request_template.md`다.
- 작업 전용 브랜치에서 진행하고, 한 브랜치에는 한 가지 작은 목적만 담는다.
- 커밋 메시지는 Conventional Commits를 따른다.

## Testing

- 기본 테스트 러너는 `Vitest`다.
- 신규 기능/회귀 수정은 가능하면 실패 테스트를 먼저 만든다.
- happy path만으로 끝내지 말고 에러, 상태 전이, 인증 경계도 본다.
- 상세 기준은 `docs/engineering/tdd-vitest.md`를 따른다.

## Commands

- `pnpm install`
- `pnpm dev`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm validate:branch`
- `pnpm validate:commits`
- `pnpm validate:pr`

## Before Opening A PR

- 관련 workpack 문서와 공식 문서를 다시 확인한다.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`를 통과시킨다.
- PR 본문에 workpack, 테스트, 문서 영향, 보안/성능/디자인 영향을 적는다.
