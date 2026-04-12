# 집밥 서비스 작업 규칙

## Read First

1. `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
2. `docs/workpacks/README.md`
3. 관련 `docs/workpacks/<slice>/README.md`
4. 관련 공식 문서 in `docs/`
5. 슬라이스 개발 단계 실행 시 → `docs/engineering/slice-workflow.md`
6. 변경 유형별 게이트/리뷰/자동화 기준 확인 시 → `docs/engineering/agent-workflow-overview.md`
7. 테스트 작성 시 → `docs/engineering/tdd-vitest.md`
8. 브라우저 흐름 검증 시 → `docs/engineering/playwright-e2e.md`
9. QA 시스템/게이트/탐색 QA/eval 작업 시 → `docs/engineering/qa-system.md`
10. 모바일 UI/UX 품질, screenshot/Figma authority review 기준 확인 시 → `docs/engineering/product-design-authority.md`, `docs/design/mobile-ux-rules.md`, `docs/design/anchor-screens.md`
11. 필요한 경우에만 `docs/reference/wireframes/`
12. 운영 규칙 변경 또는 신규 작업 방식 도입 시 `docs/engineering/subagents.md`
13. 필요 시 `docs/engineering/security-performance-design.md`
14. workflow v2 설계/파일럿 작업 시 `docs/engineering/workflow-v2/README.md`

## Source of Truth

- 공식 최신본:
  - 요구사항 `docs/요구사항기준선-v1.6.3.md`
  - 화면정의서 `docs/화면정의서-v1.2.3.md`
  - 유저 Flow맵 `docs/유저flow맵-v1.2.3.md`
  - DB 설계 `docs/db설계-v1.3.1.md`
  - API 문서 `docs/api문서-v1.2.2.md`
- `wireframes`는 보조 레퍼런스다.
- wireframe과 공식 문서가 충돌하면 공식 문서가 우선이다.
- 공식 문서는 현재 구현의 기본 기준이다. 더 나은 제품/API 계약이 필요해 보여도 사용자 승인 없이 공식 문서보다 구현을 앞세우지 않는다.
- 사용자 승인 하의 공식 계약 변경은 `contract-evolution` 경로로 처리한다:
  명시적 사용자 승인 → 공식 문서 갱신(필요 시 새 버전 파일) → `docs/sync/CURRENT_SOURCE_OF_TRUTH.md` 동기화 → 관련 workpack/acceptance 재잠금 → 이후 구현

## Working Model

- 구현 단위는 화면 하나가 아니라 `세로 슬라이스(workpack)`다.
- 기능 구현은 가능한 한 더 작은 작업 단위로 쪼개서 순차적으로 진행한다.
- 한 슬라이스 안에서 화면, 상태 전이, API, DB 영향, 테스트를 같이 닫는다.
- 예외: `docs/engineering/` 아래의 repo-engineering automation, workflow tooling, agent 운영 규칙은 제품 기능 슬라이스가 아니다.
- 이런 engineering 작업은 `docs/workpacks/<slice>/README.md`를 새로 만드는 대신 관련 `docs/engineering/*.md`를 설계와 운영 기준 문서로 사용한다.
- 현재 저장소에 이미 들어온 탐색/상세/로그인 게이트는 `01-discovery-detail-auth` 부트스트랩 슬라이스로 간주한다.
- 새로운 기능 작업 전 **Claude가** `docs/workpacks/<slice>/README.md`와 `acceptance.md`를 먼저 만들고 main에 머지한다 (1단계).
- **Codex는** 구현 전 해당 슬라이스의 `docs/workpacks/<slice>/README.md`와 `acceptance.md`를 반드시 확인한다. 없으면 Claude에 먼저 요청한다.
- engineering 예외 작업에서는 Codex와 Claude 모두 대상 `docs/engineering/*.md`를 우선 확인하고, 필요 시 `AGENTS.md`, `CLAUDE.md`, `docs/engineering/subagents.md` 같은 governing doc을 함께 갱신한다.
- 문서 간 충돌이 보이면 구현보다 충돌 정리를 우선한다.
- 메인 Codex는 작업 전 `문서 확인 -> 테스트 전략 -> 구현 -> 리뷰` 순서를 기본 흐름으로 따른다.
- 품질 판단이 필요한 작업은 `docs/engineering/subagents.md`의 역할 기반 체크리스트를 사용한다.
- 슬라이스 개발 단계를 요청받으면 `docs/engineering/slice-workflow.md`를 읽고 해당 단계의 담당 AI를 확인한다. 자신이 담당하지 않는 단계는 수행하지 않고 올바른 AI를 안내한다.

## Rule Layers

- `AGENTS.md`는 원칙, 절대 유지 규칙, engineering 예외 규칙의 단일 소스다.
- `docs/engineering/agent-workflow-overview.md`는 변경 유형별 게이트, optional review, loop 사용 조건의 단일 소스다.
- `docs/engineering/slice-workflow.md`는 product slice Stage 1~6 절차의 단일 소스다.
- `docs/engineering/git-workflow.md`는 브랜치/커밋/PR 크기 규칙의 단일 소스다.
- `docs/engineering/qa-system.md`는 deterministic QA, exploratory QA, qa eval 실행 기준의 단일 소스다.
- `docs/engineering/workflow-v2/*`는 차세대 reusable workflow의 설계·파일럿 문서다. 별도 승격 공지가 있기 전까지 현재 product slice의 운영 규칙을 직접 대체하지 않는다.
- 같은 규칙이 여러 문서에 보이면 먼저 `중복`인지 `계층적 위임`인지 판정한다.
- `중복`: 같은 actor, trigger, action, success condition, scope를 추가 정보 없이 반복할 때만 본다.
- `계층적 위임`: 상위 문서가 원칙을 말하고 하위 문서가 단계, 예외, 산출물, 체크리스트를 구체화할 때 본다.
- 단일 소스화는 `중복`으로 판정된 경우에만 진행한다. `계층적 위임`은 삭제보다 링크와 책임 경계를 정리한다.

## Language Policy

- 사용자-facing 응답은 특별한 요청이 없는 한 항상 한국어로 작성한다.
- `commentary`, 최종 답변, 리뷰 요약, PR 설명, 운영 보고는 모두 한국어를 기본값으로 한다.
- 코드, 파일 경로, 명령어, 식별자, API 이름, 에러 메시지 원문처럼 정확한 보존이 필요한 항목만 영어 그대로 유지한다.
- 새로운 작업을 이어받을 때도 마지막 사용자 요청 언어가 한국어라면 같은 턴의 후속 응답 전부를 한국어로 유지한다.

## Absolute Safeguards

- 공식 문서 우선, 문서 충돌 시 충돌 정리 우선. 공식 계약 변경이 필요하면 먼저 `contract-evolution` docs-governance PR로 문서를 갱신한다.
- 문서에 없는 API/status/field/endpoint를 임의 추가하지 않는다.
- public contract 변경 시 문서 영향도를 먼저 적는다.
- 사용자 승인 없는 `contract-evolution`은 금지한다.
- 권한, 소유권, read-only, 멱등성, 상태 전이 보호 규칙은 완화 대상이 아니다.
- 상태 전이, 권한 경계, read-only, 에러 시나리오는 테스트로 고정한다.
- 제품 규칙 완화 제안에는 반드시 대체 안전장치 또는 완화 불가 근거가 있어야 한다.

## Branch And Delivery

- 브랜치, 커밋, worktree, PR 크기 규칙의 단일 기준은 `docs/engineering/git-workflow.md`다.
- 변경 유형별 `required_checks`, `optional_reviews`, `N/A 허용 기준`, loop 사용 기준은 `docs/engineering/agent-workflow-overview.md`를 따른다.
- 기능 작업은 기본 브랜치에서 직접 하지 않고 작업 전용 브랜치에서 진행한다.
- 파일 수정 전에는 먼저 작업 브랜치로 전환한다. 표준 명령은 `pnpm branch:start -- --branch <name>` 또는 slice 작업의 경우 `pnpm branch:start -- --slice <slice> --role <docs|be|fe>`다.
- `pnpm branch:start`는 일반 세션의 active work branch intent도 함께 기록한다.
- 일반 세션에서는 `.claude/settings.json`의 project hook가 새 user prompt마다 branch reassert를 요구한다.
- 따라서 같은 세션이어도 새 user prompt 뒤에 파일을 수정하려면 먼저 `pnpm branch:start ...`를 다시 실행해 이번 턴의 work branch intent를 재확인한다.
- reassert가 끝난 뒤 `Write/Edit` hook는 recorded intent와 현재 checkout을 비교한다. clean worktree면 recorded branch로 자동 전환하고, intent가 없거나 dirty mismatch면 수정이 차단된다.
- 필요 시 `pnpm branch:status`, `pnpm branch:clear`로 현재 intent와 reassert 상태를 확인/초기화한다.
- 브랜치 하나에는 가능한 한 하나의 작은 기능 단위 또는 명확한 하위 작업만 담는다.
- 브랜치 접두어는 `feat/`가 아니라 `feature/`를 사용한다. (CI 검증 기준)
- product slice 구현은 슬라이스 순서를 유지한다. 1단계(Claude) 문서가 main에 머지된 뒤에만 2단계(Codex)를 시작한다.
- product 구현 PR은 기본적으로 `Draft -> required checks green -> Ready for Review -> 실제 동작 확인 -> current head 기준 전체 PR checks green -> merge` 흐름을 따른다.
- merge 판단은 GitHub branch protection의 required 여부가 아니라 현재 PR head SHA에 대해 시작된 check 전체를 기준으로 한다. pending, rerun 중, fail인 check가 하나라도 남아 있으면 merge하지 않는다.
- docs/governance와 low-risk docs/config 변경은 `docs/engineering/agent-workflow-overview.md`의 축약 경로를 따른다.

## Dependency Management

- 의존성 추가/제거 시 반드시 `package.json`과 `pnpm-lock.yaml` 양쪽을 일치시킨다.
- lockfile만 수정하고 `package.json`에 반영하지 않으면 CI에서 `--frozen-lockfile` 실패한다.

## Tech Stack

- 패키지 매니저: `pnpm`
- 프론트엔드: `Next.js 15` + `React 19` + `TypeScript`
- 스타일링: `Tailwind CSS 4`
- 상태관리: `Zustand`
- 백엔드/BaaS: `Supabase`
- API 구현: `Next.js Route Handlers`
- 테스트: `Vitest`
- Drag and Drop: `@dnd-kit/core`

## Domain Rules

- `meals.status`: `registered -> shopping_done -> cook_done`
- 장보기 preview 대상: `status='registered' AND shopping_list_id IS NULL`
- 장보기 생성 시 대상 `meals.shopping_list_id`를 먼저 세팅한다.
- `SHOPPING_DETAIL`은 구매 섹션 / 팬트리 제외 섹션 2영역 구조다.
- 장보기 완료 후 리스트는 read-only다. 수정 API는 `409`를 반환한다.
- `is_pantry_excluded=true`가 되면 `is_checked=false`로 자동 정리한다.
- `add_to_pantry_item_ids`: `null`은 기본값, `[]`는 미반영, 선택값은 해당 항목만 반영이다.
- 무효 항목(미체크/제외/중복)은 무시하고 진행한다.
- `pantry_added`는 `pantry_added_item_ids` 길이와 일치해야 한다.
- `shopping_list_items` 정렬은 `sort_order ASC`, 동일 시 `id ASC`다.
- 팬트리는 수량이 아니라 보유 여부만 저장한다.
- 독립 요리는 `meals` 상태를 바꾸지 않는다.
- 요리모드에서는 인분 조절 UI를 두지 않는다.
- 저장 가능한 레시피북 타입은 `saved`, `custom`만이다.
- 삭제된 엔드포인트 `DELETE /recipes/{id}/save`는 되살리지 않는다.

## Implementation Rules

- 문서에 없는 필드, 상태, 엔드포인트를 임의 추가하지 않는다.
- public contract 변경 시 문서 영향도를 먼저 적는다.
- API 응답은 `{ success, data, error }` 래퍼를 유지한다.
- error 객체는 `{ code, message, fields[] }` 구조를 따른다.
- 백엔드 브랜치는 슬라이스 시작 시 request/response/error 계약과 타입 기준을 먼저 고정한다.
- 프론트엔드는 백엔드 계약을 그대로 소비하고, 화면 컴포넌트보다 API 타입 / 상태 enum / 권한 상태 / read-only 여부를 우선 분리한다.
- 상태 전이 로직은 테스트로 고정한다.
- UI는 필요한 `loading / empty / error / read-only` 상태를 포함한다.
- 디자인 확정 전 프론트는 기능 가능한 임시 UI를 우선 구현하고, 추후 `CSS 변수`, `Tailwind 클래스`, 공용 컴포넌트 중심으로 스타일을 교체할 수 있게 유지한다.
- 비로그인 보호 액션은 로그인 안내 후 return-to-action을 지원한다.

## Review Checks

- 완료/취소성 API가 멱등한가
- read-only 정책이 우회되지 않는가
- exclude -> uncheck 규칙이 지켜지는가
- `add_to_pantry_item_ids`의 `null / [] / 선택값`이 구분되는가
- 다른 사용자 리소스를 수정할 수 없는가
- 독립 요리와 플래너 요리의 상태 전이가 섞이지 않는가
- 브랜치, 커밋, PR 본문이 Git/PR 규칙을 만족하는가
- 테스트가 happy path만이 아니라 상태 전이, 에러, read-only를 고정하는가
- 보안/성능/디자인 영향이 PR 템플릿에 기록되어 있는가

## Commands

- `pnpm install`
- `pnpm dev`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`
- `pnpm test:e2e:smoke`
- `pnpm test:e2e:a11y`
- `pnpm test:e2e:visual`
- `pnpm test:e2e:visual:update`
- `pnpm test:e2e:security`
- `pnpm test:e2e:ui`
- `pnpm test:e2e:oauth`
- `pnpm test:lighthouse`
- `pnpm test:all`
- `pnpm verify:backend`
- `pnpm verify:frontend`
- `pnpm verify`
- `pnpm qa:explore`
- `pnpm qa:eval`
- `pnpm build`
- `pnpm branch:start -- --branch <name>`
- `pnpm validate:branch`
- `pnpm validate:commits`
- `pnpm validate:pr`
- `pnpm validate:source-of-truth-sync`
- `pnpm validate:exploratory-qa-evidence`
- `pnpm validate:closeout-sync`
