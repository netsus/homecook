# Skills 한눈에 보기

> homecook 프로젝트에 설치된 17개 스킬을 초보 개발자도 바로 쓸 수 있게 정리했어요.

---

## 1. 요약 테이블

| Skill name | 한줄 설명 | 주요 기능 | 대표 사용 예시 |
|---|---|---|---|
| `find-skills` | 내가 원하는 기능의 스킬을 찾아줘요 | 스킬 검색·설치 | "테스트 자동화 스킬 찾아줘" |
| `git-workflow` | 커밋 규칙·브랜치 전략 가이드 | 커밋 컨벤션, 브랜치 네이밍, CI 설정 | `feat: 로그인 기능 추가` 커밋 작성 |
| `git-storytelling-branch-strategy` | 브랜치를 이야기처럼 구조화해요 | Git Flow / GitHub Flow / Trunk 전략 | `feature/123-user-auth` 브랜치 만들기 |
| `eslint-prettier-config` | 코드 스타일 자동 통일 설정 | ESLint v9 + Prettier 설정 파일 생성 | 저장할 때 코드 자동 정렬 |
| `eslint-prettier-husky-config` | 커밋 전 코드 품질 자동 검사 | Husky + lint-staged + GitHub Actions | 나쁜 코드 커밋 자동 차단 |
| `pr-template-builder` | PR·이슈 템플릿 자동 생성 | PR 체크리스트, 이슈 폼, 라벨 자동화 | PR 작성할 때 빠짐없이 체우기 |
| `code-review-and-quality` | 코드 리뷰 5가지 기준으로 점검 | 정확성·가독성·설계·보안·성능 체크 | 머지 전 내 코드 셀프 리뷰 |
| `code-review-quality` | 우선순위별 리뷰 피드백 가이드 | 🔴블로커→🟡주요→🟢마이너→💡제안 | PR 리뷰 코멘트 달기 |
| `tdd` | 테스트 먼저 쓰는 개발 방법론 | Red-Green-Refactor 42가지 규칙 | 코드 작성 전에 테스트 먼저 |
| `tdd-test-driven-development` | TDD 철학을 엄격하게 지키게 해줘요 | 실패하는 테스트 없이 코드 금지 | 버그 수정 전 테스트 작성 |
| `vitest-testing-patterns` | Vitest + React Testing Library 패턴 | 컴포넌트·API·훅 테스트 작성법 | `expect(button).toBeInTheDocument()` |
| `owasp-security` | OWASP Top 10 보안 취약점 예방 | XSS·SQL 인젝션·인증 실패 방어 코드 | 로그인 API 보안 점검 |
| `owasp-top-10` | OWASP 취약점 심층 분석 가이드 | 취약점별 탐지·수정 패턴 참조 파일 | 보안 코드 리뷰 시 체크리스트 |
| `perf-lighthouse` | Lighthouse 성능 점수 측정·자동화 | CLI 감사, 성능 예산, CI 연동 | PR마다 성능 점수 자동 체크 |
| `cicd-expert` | GitHub Actions 파이프라인 설계 | 멀티 스테이지 CI/CD, 보안 게이트 | 코드 푸시 → 자동 빌드/배포 |
| `ln-732-cicd-generator` | CI 워크플로우 파일 자동 생성 | `.github/workflows/ci.yml` 생성 | "CI 파이프라인 만들어줘" |
| `frontend-design` | 독창적인 프로덕션급 프론트엔드 UI 생성 | 제네릭 AI 미학을 탈피한 개성 있는 인터페이스 구현 | "대시보드 UI 만들어줘" |

---

## 2. 각 스킬별 간단 정리

---

### find-skills

- **하는 일**: "이런 기능 있는 스킬 없나요?" 하고 물어보면 대신 찾아줘요
- **사용법**: Claude에게 `"배포 자동화 스킬 찾아줘"` 라고 말하면 됩니다. 또는 직접 `npx skills find 검색어`
- **언제 좋아요**: 새로운 기능이 필요할 때 스킬 마켓에서 검색해서 바로 설치할 수 있어요

---

### git-workflow

- **하는 일**: 커밋 메시지 형식, 브랜치 이름 규칙, GitHub Actions 설정 방법을 알려줘요
- **사용법**: `"커밋 메시지 어떻게 써야 해?"` 라고 물어보세요. 예) `feat: 레시피 검색 기능 추가`
- **언제 좋아요**: 팀원들과 커밋 형식을 통일하고 싶을 때, 히스토리를 깔끔하게 유지하고 싶을 때

---

### git-storytelling-branch-strategy

- **하는 일**: 브랜치를 어떻게 만들고 관리할지 전략을 잡아줘요 (Git Flow, GitHub Flow 등)
- **사용법**: `"새 기능 브랜치 어떻게 만들어?"` → `feature/123-레시피-검색` 형식으로 안내해줘요
- **언제 좋아요**: 여러 기능을 동시에 개발할 때, 브랜치가 너무 많아 복잡해질 때

---

### eslint-prettier-config

- **하는 일**: ESLint(나쁜 코드 탐지)와 Prettier(코드 정렬)를 한 번에 설정해줘요
- **사용법**: `"ESLint Prettier 설정해줘"` → `eslint.config.mjs`, `.prettierrc` 파일을 자동 생성
- **언제 좋아요**: 팀원마다 코드 스타일이 달라서 PR 리뷰가 힘들 때, 저장할 때 자동 정렬하고 싶을 때

---

### eslint-prettier-husky-config

- **하는 일**: 커밋하기 전에 자동으로 린팅·포매팅을 돌려서 나쁜 코드가 올라가지 못하게 막아요
- **사용법**: `"Husky로 커밋 전 린팅 설정해줘"` → `.husky/pre-commit`, GitHub Actions 워크플로우 생성
- **언제 좋아요**: 실수로 ESLint 에러가 있는 코드를 올릴까 봐 걱정될 때 (자동으로 막아줘요!)

---

### pr-template-builder

- **하는 일**: PR을 작성할 때 빠뜨리기 쉬운 항목들을 체크리스트로 자동 생성해줘요
- **사용법**: `"PR 템플릿 만들어줘"` → `.github/PULL_REQUEST_TEMPLATE.md`와 이슈 템플릿 생성
- **언제 좋아요**: PR마다 "무엇을 바꿨는지", "테스트는 했는지" 등을 빠짐없이 적고 싶을 때

---

### code-review-and-quality

- **하는 일**: 코드를 **정확성·가독성·설계·보안·성능** 5가지 축으로 꼼꼼하게 리뷰해줘요
- **사용법**: `"이 코드 리뷰해줘"` 라고 하면 Critical/Important/Suggestion 레벨로 피드백을 줘요
- **언제 좋아요**: 내 코드를 머지하기 전에 빠진 부분이 없는지 확인하고 싶을 때

---

### code-review-quality

- **하는 일**: 리뷰 피드백을 🔴(반드시 고쳐야), 🟡(고치면 좋음), 🟢(사소한 것), 💡(제안) 4단계로 나눠줘요
- **사용법**: `"PR #42 코드 리뷰해줘"` → 우선순위와 이유를 함께 알려줘요
- **언제 좋아요**: 리뷰 코멘트가 너무 많아서 뭐부터 봐야 할지 모를 때

---

### tdd

- **하는 일**: **테스트를 먼저 작성**하고 코드를 짜는 TDD 방법론 42가지 규칙을 알려줘요
- **사용법**: 새 기능을 만들 때 `"TDD로 레시피 저장 기능 만들어줘"` 라고 하면 테스트부터 작성해줘요
- **언제 좋아요**: 코드를 짜다가 나중에 "이거 테스트 어떻게 하지?" 하는 상황을 없애고 싶을 때

---

### tdd-test-driven-development

- **하는 일**: **"테스트 없이 코드 금지"** 규칙을 엄격하게 지키도록 안내해줘요
- **사용법**: `"버그 수정해줘"` 하면 먼저 버그를 재현하는 실패하는 테스트부터 작성해요
- **언제 좋아요**: 테스트 없이 그냥 고쳐버리는 습관을 고치고 싶을 때 (Red-Green-Refactor 사이클 강제)

---

### vitest-testing-patterns

- **하는 일**: Vitest와 React Testing Library로 컴포넌트·API·유틸 테스트를 작성하는 패턴을 알려줘요
- **사용법**: `"RecipeCard 컴포넌트 테스트 작성해줘"` → `RecipeCard.test.tsx` 파일을 바로 만들어줘요
- **언제 좋아요**: 테스트를 처음 써보는데 어떻게 시작해야 할지 모를 때

---

### owasp-security

- **하는 일**: SQL 인젝션, XSS, 인증 실패 등 웹 보안 10가지 취약점을 예방하는 코드 패턴을 알려줘요
- **사용법**: `"이 API 보안 점검해줘"` → 취약한 부분과 안전한 코드로 바꾸는 방법을 알려줘요
- **언제 좋아요**: 로그인, 결제, 개인정보 관련 코드를 짤 때 보안이 걱정될 때

---

### owasp-top-10

- **하는 일**: OWASP Top 10 각 항목에 대한 상세한 참조 파일을 제공해요 (owasp-security보다 더 자세해요)
- **사용법**: `"Broken Access Control 취약점이 뭐야?"` → 취약점 설명과 체크리스트를 보여줘요
- **언제 좋아요**: 보안 감사나 코드 리뷰를 체계적으로 진행하고 싶을 때

---

### perf-lighthouse

- **하는 일**: Lighthouse로 웹 성능(로딩 속도, LCP, CLS 등)을 측정하고 CI에 연동하는 방법을 알려줘요
- **사용법**: `"Lighthouse CI 설정해줘"` → PR마다 성능 점수가 자동으로 체크되는 설정을 만들어줘요
- **언제 좋아요**: 앱이 느린 것 같은데 어디가 문제인지 수치로 확인하고 싶을 때

---

### cicd-expert

- **하는 일**: GitHub Actions로 코드 푸시 → 자동 테스트 → 빌드 → 배포까지 파이프라인을 설계해줘요
- **사용법**: `"CI/CD 파이프라인 만들어줘"` → 보안 스캔·캐싱·병렬 실행까지 포함한 워크플로우 생성
- **언제 좋아요**: 매번 손으로 배포하기 귀찮을 때, PR에서 자동으로 테스트가 돌아갔으면 할 때

---

### ln-732-cicd-generator

- **하는 일**: 프로젝트 스택을 분석해서 `.github/workflows/ci.yml` 파일을 자동으로 만들어줘요
- **사용법**: `"CI 워크플로우 파일 생성해줘"` → package.json을 읽고 프로젝트에 맞는 CI 파일 생성
- **언제 좋아요**: CI 설정 파일을 처음부터 작성하기 어려울 때, 빠르게 기본 파이프라인을 갖추고 싶을 때

---

### frontend-design

- **하는 일**: 제네릭 AI 미학을 탈피한 독창적이고 프로덕션급 프론트엔드 인터페이스를 생성해줘요
- **사용법**: `"음악 스트리밍 앱 대시보드 만들어줘"` → 개성 있는 타이포그래피·색상·애니메이션이 적용된 UI를 바로 구현해줘요
- **언제 좋아요**: AI가 만들어주는 뻔한 보라색 그라데이션·시스템 폰트 UI에서 벗어나 차별화된 디자인이 필요할 때

---

## 참고: 스킬 관리 커맨드

```bash
# 새 스킬 검색
npx skills find "검색어"

# 스킬 설치
npx skills add owner/repo@skill-name --yes

# 설치된 스킬 업데이트 확인
npx skills check

# 전체 업데이트
npx skills update
```
