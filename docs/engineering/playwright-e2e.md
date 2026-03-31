# Playwright E2E

이 문서는 브라우저 사용자 흐름을 Playwright로 언제, 어떻게 검증할지 정한다.

## Role Split

| 상황 | 기본 테스트 | Playwright 필요 여부 | 예시 |
| --- | --- | --- | --- |
| 순수 함수, 유틸 계산 | `Vitest` | 아니오 | 인분 계산, 정렬 파서 |
| 상태 전이, 권한 로직 | `Vitest` 우선 | 경우에 따라 추가 | pending action, read-only 판정 |
| API 응답 매핑, helper | `Vitest` | 아니오 | route helper, 응답 래퍼 |
| 간단한 렌더 분기 | `Vitest` | 보통 아니오 | empty/error 문구 |
| 모달 열기/닫기, 포커스, ESC | `Playwright` 권장 | 예 | 로그인 게이트 |
| 페이지 이동, URL 변화 | `Playwright` | 예 | HOME -> DETAIL |
| 여러 컴포넌트가 연결된 사용자 흐름 | `Playwright` | 예 | 보호 액션 -> 로그인 게이트 |
| 외부 연동 없는 브라우저 플로우 | `Playwright` | 예 | 검색, 정렬, 상세 진입 |
| 실제 외부 OAuth/provider | `Playwright` live suite | 예 | Google 로그인 후 복귀 |
| flaky하기 쉬운 외부 서비스 | 기본 게이트 제외 | 선택 실행 | 실제 Google OAuth |

## Default Commands

- `pnpm test:e2e`: `pnpm test:e2e:smoke`의 alias
- `pnpm test:e2e:smoke`: product slice 핵심 브라우저 흐름 smoke
- `pnpm test:e2e:a11y`: axe 기반 접근성 smoke
- `pnpm test:e2e:visual`: Playwright screenshot baseline 기반 visual regression
- `pnpm test:e2e:security`: auth/session/return-to-action security smoke
- `pnpm test:e2e:ui`: Playwright UI 모드
- `pnpm test:e2e:oauth`: `@live-oauth` 태그 테스트만 실행 (실제 외부 서비스 포함)
- `pnpm test:all`: lint, typecheck, vitest, 기본 Playwright
- `pnpm verify:frontend`: lint, typecheck, vitest, build, smoke/a11y/visual/security, Lighthouse
- `pnpm verify:backend`: lint, typecheck, vitest, build, auth/session security smoke

`docs-governance`와 `low-risk docs/config`는 `docs/engineering/agent-workflow-overview.md`의 Change Type Matrix에 따라 E2E를 생략할 수 있다.

브라우저 바이너리가 없으면 아래 명령을 먼저 실행한다.

```bash
npx playwright install --with-deps chromium
```

## CI Policy

- 기본 PR 게이트에는 안정적인 Playwright smoke, a11y, visual, security smoke를 포함한다.
- 외부 OAuth가 필요한 시나리오는 `workflow_dispatch`로만 실행한다.
- 실패 시 trace, screenshot, video를 아티팩트로 남긴다.

## Device Matrix

- smoke / a11y / security smoke는 `desktop-chrome`, `mobile-chrome` 프로젝트 둘 다 실행한다.
- visual regression은 baseline 안정성을 위해 기본값으로 `desktop-chrome`만 실행한다.

## Local Live OAuth

실제 Google OAuth 시나리오에는 아래 환경변수가 필요하다.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_ENABLED_AUTH_PROVIDERS=google`
- `E2E_GOOGLE_EMAIL`
- `E2E_GOOGLE_PASSWORD`

## Flaky Rules

- 브라우저 테스트는 사용자에게 보이는 흐름만 검증한다.
- 스타일 세부값이나 애니메이션 완료 타이밍에는 의존하지 않는다.
- 외부 서비스는 기본 게이트에서 제외한다.
- DOM 구조보다 역할(role), 레이블, URL, 사용자 문구를 우선 사용한다.

## Live OAuth 태그 컨벤션

- 실제 외부 서비스(Google OAuth 등) 시나리오는 테스트 제목에 `@live-oauth` 태그를 붙인다.
- `@live-oauth` 태그가 있는 테스트는 `pnpm test:e2e:oauth`로만 실행된다.
- 기본 CI(`pnpm test:e2e`)는 `@live-oauth` 태그를 자동으로 제외한다.
- 예시: `test("@live-oauth returns to recipe after Google login", ...)`
