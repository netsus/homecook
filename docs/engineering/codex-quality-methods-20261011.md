# Codex 코드 품질 방법 적용 — 2026-10-11

## 목적

YouTube 영상 [쓰레기 코드 ☠️ 없애는 법](https://www.youtube.com/watch?v=3JCgiVYlLFo&t=97s)이 소개한 네 방법과 연결 원본을 확인해 Homecook의 저장소 공통 Codex 지침으로 적용한다. 외부 설치 명령을 실행하거나 개인 `~/.codex` 설정에 의존하지 않고, 팀원이 저장소를 받은 뒤 새 Codex 실행을 시작하면 같은 규칙과 스킬을 발견하도록 한다.

제품 기능, API, DB, 인증, 운영 배포는 바꾸지 않는다. 현재 `AGENTS.md`의 빠른 개발 모드와 선택적 검증 원칙도 유지한다.

## 확인한 원본과 적용

| 영상 시점 | 방법 | 확인한 원본 | 라이선스 확인 | Homecook 적용 |
| --- | --- | --- | --- | --- |
| 02:00 | Attention Span | [`alexgreensh/attention-span@2714c965`](https://github.com/alexgreensh/attention-span/tree/2714c965e6be1fa2597510e66651e63bc67cb448) | AGPL-3.0 | `AGENTS.md`에 결론 우선, 필요한 만큼만 설명, 반복 금지, 중요한 진행만 알리는 원칙을 독립적으로 작성했다. 원문 스타일 파일은 복사하지 않았다. |
| 03:05 | Karpathy Skills | [`multica-ai/andrej-karpathy-skills@2c606141`](https://github.com/multica-ai/andrej-karpathy-skills/tree/2c606141936f1eeef17fa3043a72095b4765b9c2) | 스킬 frontmatter는 MIT 표기, 검토 시 루트 `LICENSE`는 404 | 구현 전 판단, 단순성, 최소 범위 변경, 성공 조건 중심 실행이라는 네 주제를 `AGENTS.md`와 Homecook 스킬에 맞춤 작성했다. 라이선스가 불명확한 원문은 복제하지 않았다. |
| 04:05 | Anti Slop | [`dmmulroy/anti-slop@c44ef22c`](https://github.com/dmmulroy/anti-slop/tree/c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b) | MIT, [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md) | `.agents/skills/homecook-typescript-evidence-review/SKILL.md`에 근거 없는 타입 단언·넓은 계약·불필요한 누산 복사 등을 검토하는 저장소 맞춤 규칙을 작성했다. |
| 08:42 | Verification Before Completion | [`obra/superpowers@bb92a777`](https://github.com/obra/superpowers/blob/bb92a77741419a4ab5f06e711a283343f1ada0c3/skills/verification-before-completion/SKILL.md) | MIT, [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md) | `.agents/skills/verification-before-completion/SKILL.md`에서 완료 주장 전에 해당 주장을 직접 증명하는 최신 검사와 전체 결과를 확인하도록 했다. |

영상 제목·썸네일만으로 방법을 추정하지 않았다. 영상 설명의 타임스탬프와 연결 링크, 각 저장소의 README·스킬·라이선스를 확인했다. YouTube 자막 endpoint는 조사 시 빈 응답이어서 전체 자막 전사는 검증 근거에 포함하지 않는다.

## 자동 적용 경로

- Codex 공식 문서의 [AGENTS.md 탐색 규칙](https://learn.chatgpt.com/docs/agent-configuration/agents-md)에 따라 저장소 루트 `AGENTS.md`는 새 실행 시작 시 읽힌다. 이미 열린 세션에는 소급되지 않는다.
- Codex 공식 문서의 [저장소 스킬 경로](https://learn.chatgpt.com/docs/build-skills)에 따라 루트 `.agents/skills/<name>/SKILL.md`는 저장소 아래에서 시작한 Codex에 팀 공통 스킬로 노출된다.
- 루트 지침이 TypeScript/JavaScript 변경과 완료 게이트에서 두 스킬의 적용 시점을 명시한다. 개인 홈 설정이나 플러그인 설치는 필요하지 않다.
- `pnpm verify:codex-quality-tooling`은 필수 파일, skill frontmatter, 루트 연결, 32 KiB 기본 instruction 예산, 외부 Oxlint 미설치를 검사한다.

## 기계적으로 강제되는 것과 아닌 것

자동 검사는 다음만 보장한다.

- 팀 공통 위치에 지침과 두 스킬이 존재한다.
- 스킬의 `name`과 `description` frontmatter가 있고 루트 지침에서 참조한다.
- `AGENTS.md`가 공식 문서의 기본 합산 한도인 32 KiB를 넘지 않는다.
- `package.json`의 dependency 필드와 `pnpm-lock.yaml`에 `oxlint`, `@oxlint/plugins`, `oxlint-plugin-anti-slop`이 추가되지 않았다.

다음은 Codex가 새 세션에서 따르는 작업 지침이며 AST lint로 강제되지 않는다.

- 응답 간결성
- 구현 전 전제·트레이드오프 확인
- 최소 범위와 단순성
- `homecook-typescript-evidence-review`의 선택적 코드 리뷰 항목
- 완료 주장 전에 작업에 맞는 fresh verification 선택

Anti Slop upstream은 공식 npm 패키지 없이 소스 vendoring을 전제로 하고 `oxlint`와 `@oxlint/plugins`의 정확한 버전 일치를 요구한다. Homecook은 현재 ESLint를 사용하고 있고 upstream의 모듈 mocking·runtime `typeof`·`unknown` 경계 규칙을 기존 코드 전체에 바로 강제하면 테스트와 외부 입력 경계의 정당한 패턴까지 막을 수 있다. 따라서 이번 범위에서는 외부 실행 코드를 vendoring·설치·실행하지 않았다. 향후 기계적 강제를 원하면 별도 승인 아래 규칙별 기존 위반 수와 런타임 호환을 조사한 뒤 점진 도입한다.

## 팀 확인

새 checkout 또는 갱신한 기본 브랜치에서 다음을 실행한다.

```bash
pnpm verify:codex-quality-tooling
```

그 뒤 저장소 루트에서 새 Codex 실행을 시작해 현재 지침과 사용 가능한 두 스킬을 요약하게 한다. 기존 세션이 아니라 새 실행이어야 한다. 검사 성공은 로드 경로를 검증하지만 모든 향후 답변과 코드가 지침을 완벽히 준수한다는 보장은 아니다.
