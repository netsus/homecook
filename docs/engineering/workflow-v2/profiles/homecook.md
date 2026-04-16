# Homecook Project Profile

## Purpose

이 문서는 홈쿡 저장소에서 workflow v2를 사용할 때 project-specific rule pack으로 사용한다.
현재는 workflow-v2 기본 운영 경로의 project-specific rule pack이며, migration 및 후속 확장 작업의 기준으로도 사용한다.

## 1. Project Summary

- 프로젝트 이름: Homecook
- 제품 유형: 개인 집밥 관리 서비스
- 핵심 리스크:
  - 상태 전이 오류
  - 다른 사용자 리소스 수정
  - read-only 우회
  - 공식 문서와 구현 계약 불일치
  - 외부 인증 설정 문제

## 2. Source Of Truth

- 요구사항: [요구사항기준선-v1.6.3.md](../../요구사항기준선-v1.6.3.md)
- 화면 정의: [화면정의서-v1.3.0.md](../../화면정의서-v1.3.0.md)
- 유저 flow: [유저flow맵-v1.3.0.md](../../유저flow맵-v1.3.0.md)
- DB/Schema: [db설계-v1.3.1.md](../../db설계-v1.3.1.md)
- API 문서: [api문서-v1.2.2.md](../../api문서-v1.2.2.md)
- 현재 운영 규칙: [AGENTS.md](../../../AGENTS.md), [agent-workflow-overview.md](../agent-workflow-overview.md), [slice-workflow.md](../slice-workflow.md)

우선순위:

1. `AGENTS.md`
2. 공식 제품 문서
3. 저장소 설정/스크립트
4. 개별 작업 지시

## 3. Contract Rules

- API envelope: `{ success, data, error }`
- 에러 구조: `{ code, message, fields[] }`
- 금지:
  - 문서에 없는 endpoint, field, state 추가
  - public contract 변경 전 문서 영향도 누락
- 계약 고정 원칙:
  - request/response/error를 먼저 확인
  - state/permission/read-only는 테스트로 고정

## 4. Domain Invariants

- `meals.status`: `registered -> shopping_done -> cook_done`
- 장보기 완료 후 수정 API는 `409`
- `exclude -> uncheck` 자동 정리
- `add_to_pantry_item_ids`는 `null / [] / 선택값`을 구분
- 다른 사용자 리소스 수정 금지
- 독립 요리와 플래너 요리 상태 전이 분리

## 5. UI Delivery Defaults

- 필수 상태:
  - `loading`
  - `empty`
  - `error`
  - `read-only`
  - `unauthorized`
- 비로그인 보호 액션은 로그인 안내 후 return-to-action 지원
- 디자인은 CSS 변수, Tailwind 클래스, 공용 컴포넌트 중심

## 6. Verification Defaults

- 기본 명령:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm test:e2e`
  - `pnpm test:all`
- product 변경 기본값:
  - `pnpm install --frozen-lockfile`
  - backend: `pnpm verify:backend`
  - frontend: `pnpm verify:frontend`
- docs-governance 기본값:
  - 변경 범위에 맞는 targeted test
  - schema/example validation

## 7. External Smoke Checklist

- auth / Supabase:
  - Supabase server reachable
  - `NEXT_PUBLIC_SUPABASE_URL` 존재
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` 존재
  - OAuth provider enabled
  - OAuth redirect URL 일치
- live OAuth:
  - 필요 시 `pnpm test:e2e:oauth`
- infra/env:
  - 로컬 dev server 실행 가능
  - 필요한 secret과 callback URL 준비

## 8. Branch And PR Defaults

- 허용 prefix:
  - `feature/`
  - `fix/`
  - `chore/`
  - `docs/`
  - `refactor/`
  - `test/`
  - `release/`
  - `hotfix/`
- product 구현 PR:
  - 기본 `Draft -> required CI green -> Ready for Review -> current head 기준 전체 PR checks green -> merge`
- autonomous supervisor:
  - local machine + `gh` CLI + dedicated worktree 기본값
- required approval 의미:
  - v1 운영에서는 문서상 stage 통과 + 리뷰 기록
  - workflow-v2 기본 운영에서는 dual-approval artifact + verification

## 9. Preset Mapping

- 새 슬라이스: `vertical-slice-strict`
- 작은 fullstack 수정: `vertical-slice-light`
- post-merge 버그 수정: `bugfix-patch`
- 디자인 미세 조정: `ui-polish`
- workflow/CI/docs/engineering 변경: `infra-governance`
- low-risk 문서 보강: `docs-only`

## 10. Forbidden Shortcuts

- 공식 문서보다 구현을 우선시키지 않는다.
- 테스트 없이 상태 전이 규칙을 바꾸지 않는다.
- external integration 이슈를 코드 문제로만 가정하지 않는다.
- reviewer approval 없이 merge-ready를 선언하지 않는다.
- autonomous supervisor가 현재 IDE worktree를 직접 수정하지 않는다.
