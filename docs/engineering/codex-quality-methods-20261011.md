# Codex 코드 품질 방법 적용 — 2026-10-11

## 목적

YouTube 영상 [쓰레기 코드 ☠️ 없애는 법](https://www.youtube.com/watch?v=3JCgiVYlLFo&t=97s)이 소개한 네 방법과 연결 원본을 확인해 Homecook의 저장소 공통 Codex 지침으로 적용한다. 개인 `~/.codex` 설정에 의존하지 않고, 팀원이 저장소를 받은 뒤 새 Codex 실행을 시작하면 같은 규칙과 스킬을 발견하도록 한다. 후속 승인에 따라 Anti Slop의 검토된 일부 규칙은 저장소 안에 vendoring해 자동 검사로도 실행한다.

제품 기능, API, DB, 인증, 운영 배포는 바꾸지 않는다. 현재 `AGENTS.md`의 빠른 개발 모드와 선택적 검증 원칙도 유지한다.

## 확인한 원본과 적용

| 영상 시점 | 방법 | 확인한 원본 | 라이선스 확인 | Homecook 적용 |
| --- | --- | --- | --- | --- |
| 02:00 | Attention Span | [`alexgreensh/attention-span@2714c965`](https://github.com/alexgreensh/attention-span/tree/2714c965e6be1fa2597510e66651e63bc67cb448) | AGPL-3.0 | `AGENTS.md`에 결론 우선, 필요한 만큼만 설명, 반복 금지, 중요한 진행만 알리는 원칙을 독립적으로 작성했다. 원문 스타일 파일은 복사하지 않았다. |
| 03:05 | Karpathy Skills | [`multica-ai/andrej-karpathy-skills@2c606141`](https://github.com/multica-ai/andrej-karpathy-skills/tree/2c606141936f1eeef17fa3043a72095b4765b9c2) | 스킬 frontmatter는 MIT 표기, 검토 시 루트 `LICENSE`는 404 | 구현 전 판단, 단순성, 최소 범위 변경, 성공 조건 중심 실행이라는 네 주제를 `AGENTS.md`와 Homecook 스킬에 맞춤 작성했다. 라이선스가 불명확한 원문은 복제하지 않았다. |
| 04:05 | Anti Slop | [`dmmulroy/anti-slop@c44ef22c`](https://github.com/dmmulroy/anti-slop/tree/c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b) | MIT, [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md), [`UPSTREAM.md`](../../tools/oxlint/anti-slop/UPSTREAM.md) | 검토한 규칙 네 개를 최소 vendoring하고 정확히 일치하는 Oxlint 의존성으로 제품 소스의 신규 위반을 자동 차단한다. 나머지는 Homecook 맞춤 리뷰 스킬로 유지한다. |
| 08:42 | Verification Before Completion | [`obra/superpowers@bb92a777`](https://github.com/obra/superpowers/blob/bb92a77741419a4ab5f06e711a283343f1ada0c3/skills/verification-before-completion/SKILL.md) | MIT, [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md) | `.agents/skills/verification-before-completion/SKILL.md`에서 완료 주장 전에 해당 주장을 직접 증명하는 최신 검사와 전체 결과를 확인하도록 했다. |

영상 제목·썸네일만으로 방법을 추정하지 않았다. 영상 설명의 타임스탬프와 연결 링크, 각 저장소의 README·스킬·라이선스를 확인했다. YouTube 자막 endpoint는 조사 시 빈 응답이어서 전체 자막 전사는 검증 근거에 포함하지 않는다.

## 자동 적용 경로

- Codex 공식 문서의 [AGENTS.md 탐색 규칙](https://learn.chatgpt.com/docs/agent-configuration/agents-md)에 따라 저장소 루트 `AGENTS.md`는 새 실행 시작 시 읽힌다. 이미 열린 세션에는 소급되지 않는다.
- Codex 공식 문서의 [저장소 스킬 경로](https://learn.chatgpt.com/docs/build-skills)에 따라 루트 `.agents/skills/<name>/SKILL.md`는 저장소 아래에서 시작한 Codex에 팀 공통 스킬로 노출된다.
- 루트 지침이 TypeScript/JavaScript 변경과 완료 게이트에서 두 스킬의 적용 시점을 명시한다. 개인 홈 설정은 필요하지 않다.
- `pnpm verify:codex-quality-tooling`은 필수 파일, skill frontmatter, 루트 연결, 32 KiB 기본 instruction 예산, vendored source hash, 정확한 의존성 버전과 자동 검사 연결을 확인한다.
- `pnpm verify:anti-slop`은 허용/차단 fixture와 baseline 초과 신규 위반 차단을 함께 검증한다. 대상 경로의 GitHub Actions workflow도 같은 명령에 연결되어 있지만, 저장소 Actions 설정이 활성화된 경우에만 원격에서 실행된다. 현재는 Actions가 비활성이라 로컬 명령이 공식 검증 경로이며 workflow는 required check나 자동 PR 차단 조건이 아니다.

## 기계적으로 강제되는 것과 아닌 것

자동 검사는 다음을 보장한다.

- 팀 공통 위치에 지침과 두 스킬이 존재한다.
- 스킬의 `name`과 `description` frontmatter가 있고 루트 지침에서 참조한다.
- `AGENTS.md`가 공식 문서의 기본 합산 한도인 32 KiB를 넘지 않는다.
- `oxlint`와 `@oxlint/plugins`가 upstream 고정 커밋과 호환되는 동일한 `1.78.0`으로 정확히 고정되어 있다.
- vendored 규칙 파일 다섯 개의 SHA-256이 검토한 upstream bytes와 일치한다.
- `app`, `components`, `lib`, `stores`, `types`, `ui`의 현재 275개 기존 finding은 checked-in baseline으로 식별되고, 새 finding은 실패한다.
- `no-array-filter-map`, `no-chained-type-assertions`, `no-conditional-empty-object-spread`, `no-reduce-accumulator-copy`, `oxc/no-accumulating-spread`가 실제 fixture 위반을 차단한다.

다음은 Codex가 새 세션에서 따르는 작업 지침이며 AST lint로 강제되지 않는다.

- 응답 간결성
- 구현 전 전제·트레이드오프 확인
- 최소 범위와 단순성
- 자동 규칙으로 선택하지 않은 `homecook-typescript-evidence-review`의 코드 리뷰 항목
- 완료 주장 전에 작업에 맞는 fresh verification 선택

Anti Slop upstream은 공식 npm 패키지 없이 소스 vendoring을 전제로 한다. Homecook은 다섯 소스 파일과 로컬 entry point만 포함하며, Effect 규칙은 직접 의존성이 없어 제외했다. 모듈 mocking·runtime `typeof`·`unknown`·`Reflect` 규칙도 기존 테스트와 외부 입력 경계의 정당한 패턴을 무차별 차단하므로 제외했다. 기존 275건을 자동 고치거나 규칙을 약화하지 않고 source snippet hash 기반 baseline으로 고정했다. 줄 이동은 허용하지만 같은 파일·규칙·정규화된 snippet의 허용 개수를 넘기면 실패한다. baseline 변경은 `pnpm lint:anti-slop:baseline`로 만들 수 있지만 반드시 diff에서 새 허용 항목의 이유를 검토해야 한다.

기존 ESLint는 Next.js·TypeScript·프로젝트 기본 규칙을 계속 담당한다. Anti Slop은 그 대체물이 아니라 선택한 저근거 패턴의 신규 유입만 막는 별도 gate다. 현재 빠른 개발 모드에서는 `pnpm verify:anti-slop`을 로컬에서 실행하며 GitHub Actions CI는 사용하지 않는다.

향후 활성화에 대비한 workflow의 실행 코드 공급망은 가변 major tag 대신 확인한 정확한 커밋으로 고정한다: `actions/checkout@11d5960a326750d5838078e36cf38b85af677262`, `pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1`, `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020`. 저장소 Actions가 비활성화된 상태에서는 workflow 파일만으로 검사가 실행됐다고 주장하지 않는다. Actions 활성화와 required check 도입은 별도 승인·검토가 필요한 저장소 설정 변경이다.

## 팀 확인

새 checkout 또는 갱신한 기본 브랜치에서 다음을 실행한다.

```bash
pnpm verify:codex-quality-tooling
pnpm verify:anti-slop
```

그 뒤 저장소 루트에서 새 Codex 실행을 시작해 현재 지침과 사용 가능한 두 스킬을 요약하게 한다. 기존 세션이 아니라 새 실행이어야 한다. 검사 성공은 로드 경로를 검증하지만 모든 향후 답변과 코드가 지침을 완벽히 준수한다는 보장은 아니다.
