# 슬라이스 개발 체계 보완 계획 (rev.4)

## Context

현재 프로젝트는 Codex(구현) + Claude(리뷰/디자인) 협업 구조와 workpack 슬라이스 방식이 잘 갖춰져 있다.
이전 두 차례 Codex 검토를 거쳐 브랜치 네이밍 충돌과 마이그레이션 트리거 과대정의가 수정됐다.
rev.3에서는 Supabase 실행 전제 명시, live-oauth 태그 기반 제외, Commands 동기화, 파일 수 수정을 반영했고,
rev.4는 마지막 두 가지를 마저 닫는다:
- `test:e2e:oauth`도 태그 기반으로 맞춰 live suite 실행 경로를 완전히 대칭화
- `supabase/config.toml`을 커밋 대상 신규 파일로 명시

총 변경: 기존 파일 9개 수정 + 신규 파일 4개

---

## P0 — 슬라이스 02 시작 즉시 CI 차단

### P0: 브랜치 네이밍 충돌

**문제**: workpack 문서가 `feat/be-*`, `feat/fe-*`를 안내하지만
`scripts/lib/git-policy.mjs` L2는 `feature/*`만 허용.
`feat/be-discovery-filter` 브랜치를 만들면 `pnpm validate:branch`와 CI `policy` 잡이 즉시 실패.

**검증 근거**:
- `scripts/lib/git-policy.mjs` L2: `ALLOWED_BRANCH_PATTERNS = [/^(feature|fix|chore|docs|refactor|test|release|hotfix)\/.../]`
- `docs/workpacks/README.md` L19–20: `feat/be-<slice>`, `feat/fe-<slice>`

**수정 파일 3개** (docs만, CI 코드는 변경 없음):

1. `docs/workpacks/README.md` — Branch Convention 섹션:
   ```markdown
   ## Branch Convention

   - 백엔드: `feature/be-<slice>`
   - 프론트엔드: `feature/fe-<slice>`
   ```

2. `docs/workpacks/_template/README.md` — Branches 섹션:
   ```markdown
   ## Branches

   - 백엔드: `feature/be-<slice-name>`
   - 프론트엔드: `feature/fe-<slice-name>`
   ```

3. `AGENTS.md` — Branch And Delivery 섹션에 한 줄 추가:
   ```
   브랜치 접두어는 feat/가 아니라 feature/를 사용한다. (CI 검증 기준)
   ```

---

## P1 — 다음 슬라이스 전에 반드시 수정 (3개)

### P1-A: `test:e2e` / `test:e2e:oauth` — 태그 기반 대칭 구조

**문제 1**: `package.json`의 `test:e2e`가 `tests/e2e/slice-01-basic.spec.ts`만 실행.
새 슬라이스 E2E 스펙이 추가돼도 조용히 건너뜀.

**문제 2**: `--grep-invert 'live-oauth'`는 Playwright가 **테스트 제목**을 기준으로 필터링하기 때문에
현재 describe 제목 `"Slice 01 live Google OAuth"`에 매칭이 안 될 가능성이 있다.

**문제 3**: `test:e2e:oauth`도 특정 파일로 고정되어 있어, 새 `@live-oauth` 테스트를 추가해도
live suite에서 자동으로 실행되지 않는다.

**해결책**: `test:e2e`와 `test:e2e:oauth`를 태그 기반 대칭 구조로 변경한다.

**수정 파일 2개**:

1. `package.json` — 두 스크립트 모두 태그 기반으로 변경:
   ```jsonc
   // before
   "test:e2e": "playwright test tests/e2e/slice-01-basic.spec.ts",
   "test:e2e:oauth": "playwright test tests/e2e/slice-01-live-oauth.spec.ts"

   // after — 대칭 구조
   "test:e2e": "playwright test --grep-invert '@live-oauth'",
   "test:e2e:oauth": "playwright test --grep '@live-oauth'"
   ```
   - `.github/workflows/playwright-live-oauth.yml`은 이미 `pnpm test:e2e:oauth`를 호출하므로
     스크립트 변경만으로 CI 워크플로우 파일 수정 없이 자동 반영됨

2. `tests/e2e/slice-01-live-oauth.spec.ts` — 테스트 제목에 태그 추가:
   ```typescript
   // before
   test("returns to recipe detail after Google login", async ({ page }) => {

   // after
   test("@live-oauth returns to recipe detail after Google login", async ({ page }) => {
   ```

**컨벤션**: 이후 모든 live 외부 서비스 시나리오는 테스트 제목에 `@live-oauth`를 붙인다.
`playwright-e2e.md`에 이 규칙을 명시한다.

---

### P1-B: pre-push 게이트 단일화 + PR 템플릿 E2E 추가 + Commands 동기화

**문제 1**: 게이트가 3곳에 긴 명령으로 중복. `pnpm test:all`로 단일화해야 드리프트를 막는다.

**문제 2**: PR 템플릿 Test Plan에 `pnpm test:e2e` 항목 없어 E2E 실행 증적 없음.

**문제 3**: `AGENTS.md`와 `CLAUDE.md`의 Commands 섹션에 `pnpm test:e2e`, `pnpm test:all`이 없어
게이트 문서와 명령 레퍼런스가 어긋난다.

**수정 파일 4개**:

1. `AGENTS.md`:
   - Branch And Delivery 게이트를 `pnpm install --frozen-lockfile && pnpm test:all`로 교체
   - Commands 섹션에 추가:
     ```
     - `pnpm test:e2e`
     - `pnpm test:e2e:ui`
     - `pnpm test:e2e:oauth`
     - `pnpm test:all`
     ```

2. `CLAUDE.md`:
   - Before Opening A PR 게이트 블록을 `pnpm install --frozen-lockfile && pnpm test:all`로 교체
   - Commands 섹션에 동일하게 추가

3. `docs/engineering/agent-workflow-overview.md` — "4단계 Push 전 로컬 CI 게이트" 섹션:
   ```
   pnpm install --frozen-lockfile && pnpm test:all
   ```

4. `.github/pull_request_template.md` — Test Plan 섹션:
   ```markdown
   ## Test Plan

   - [ ] `pnpm lint`
   - [ ] `pnpm typecheck`
   - [ ] `pnpm test`
   - [ ] `pnpm test:e2e`
   - 추가 검증:
   ```

---

### P1-C: Supabase 마이그레이션 — 실행 전제 + scaffold + 문서

**문제**: `supabase/` 디렉토리 없음. CLI 미설치 환경에서는 문서만 생겨도 바로 실행 불가.
`config.toml`을 커밋 대상으로 명시했으나 파일 수에서 누락됐다.

**수정 1 — scaffold 생성 (신규 파일 3개)**:
- `supabase/migrations/.gitkeep` (디렉토리 추적용)
- `supabase/seed.sql` (개발용 시드 시작점, 초기 내용은 주석만)
- `supabase/config.toml` (`supabase init` 실행 결과물, 커밋 대상)
  - `supabase init`은 계획 실행 시 한 번 실행한다. 시크릿 없이 실행 가능.

**수정 2 — 신규 문서 1개**: `docs/engineering/supabase-migrations.md`

포함 내용:

```markdown
## Prerequisites (첫 마이그레이션 전에 1회)

1. Supabase CLI 설치:
   - macOS: brew install supabase/tap/supabase
   - 공식 문서: https://supabase.com/docs/guides/cli/getting-started

2. CLI 초기화 (저장소 루트에서):
   supabase init
   → supabase/config.toml 생성됨. 이 파일을 커밋한다.

3. 프로젝트 연결 (개인 환경에서, 커밋 불필요):
   supabase link --project-ref <project-ref>

## Migration Convention

- 디렉토리: supabase/migrations/
- 파일명: <timestamp>_<slice>_<description>.sql
  예: 20260317_05_add_meals_table.sql
- 새 파일 생성: supabase migration new <description>

## Trigger 조건

스키마 변경(테이블·컬럼·인덱스·RLS 추가·변경·삭제)이 있을 때만 마이그레이션 파일을 만든다.
테이블을 읽기만 하는 슬라이스는 마이그레이션 파일 불필요.

## 로컬 적용

supabase db push

## CI 정책

현재 CI에서는 마이그레이션 미실행 (시크릿 없음). 마이그레이션은 개발자가 로컬에서 직접 실행한다.

## 롤백

롤백은 신규 마이그레이션 파일로 처리한다. down.sql 없음.
```

**수정 3 — 템플릿 필드**: `docs/workpacks/_template/README.md`:
```markdown
- DB 영향: (이 슬라이스가 건드리는 테이블 목록)
- Schema Change: [ ] 없음 (읽기 전용) / [ ] 있음 → supabase/migrations/<파일명>.sql 생성 필요
```

---

## P2 — 에이전트 프로세스 명확화 (3개)

### P2-A: Codex→Claude 핸드오프 프로토콜 명시

**수정 파일 2개**:

1. `docs/engineering/agent-workflow-overview.md` — "Codex 작업 흐름" 뒤에 섹션 추가:
   ```markdown
   ## Handoff Protocol

   Codex → Claude:
   1. 로컬 CI 게이트(pnpm test:all) 통과 후 PR을 Draft로 open한다.
   2. ci.yml + playwright.yml green 확인 후 "Ready for Review"로 전환한다.

   Claude 리뷰 시작 조건:
   - PR이 Draft 상태가 아니다.
   - ci.yml + playwright.yml 모두 green이다.
   - docs/workpacks/<slice>/README.md가 존재한다.

   Draft PR은 Claude가 리뷰를 시작하지 않는다.
   ```

2. `AGENTS.md` — Branch And Delivery 게이트 이후 한 줄 추가:
   ```
   PR은 Draft로 열고, CI green 확인 후 Ready for Review로 전환한다.
   ```

---

### P2-B: Design Status 필드 추가

**수정 파일**: `docs/workpacks/_template/README.md` — `Frontend Delivery Mode` 섹션 아래:

```markdown
## Design Status

- [ ] 임시 UI (temporary) — 기능 완성 우선, 디자인 리뷰 불필요
- [ ] 리뷰 대기 (pending-review) — Claude 디자인 리뷰 필요
- [ ] 확정 (confirmed) — Tailwind/공용 컴포넌트 정리 완료

> temporary: 기능 동작·상태 분기(loading/empty/error/read-only)만 검토
> pending-review 이상: spacing, hierarchy, 공용 컴포넌트 일관성까지 검토
```

**흐름**: Codex 시작 시 `temporary` → 스타일 정리 후 `pending-review` + Claude 알림 → Claude 리뷰 후 `confirmed`.

---

### P2-C: Dependencies 테이블 구조화

**수정 파일 2개**:

1. `docs/workpacks/_template/README.md` — `Dependencies` 섹션:
   ```markdown
   ## Dependencies

   | 선행 슬라이스   | 상태                           | 확인 |
   | --------------- | ------------------------------ | ---- |
   | `NN-slice-name` | merged / in-progress / planned | [ ]  |

   > 모든 선행 슬라이스가 `merged` 상태가 아니면 이 슬라이스를 시작하지 않는다.
   ```

2. `docs/workpacks/README.md` — Operating Rules에 한 줄 추가:
   ```
   - 슬라이스 시작 전 Dependencies 테이블의 모든 선행 슬라이스가 merged 상태임을 확인한다.
   ```

---

## P3 — 문서 정합성 (2개)

### P3-A: `playwright-e2e.md` 업데이트

**수정 파일**: `docs/engineering/playwright-e2e.md`

1. `pnpm test:e2e` 설명 → "모든 슬라이스 기본 E2E 실행 (@live-oauth 태그 제외)"
2. `pnpm test:e2e:oauth` 설명 → "@live-oauth 태그 테스트만 실행 (실제 외부 서비스 포함)"
3. Flaky Rules 섹션 아래 태그 컨벤션 추가:
   ```
   - 실제 외부 서비스(Google OAuth 등) 시나리오는 테스트 제목에 @live-oauth 태그를 붙인다.
   - @live-oauth 태그가 있는 테스트는 pnpm test:e2e:oauth 로만 실행된다.
   ```

### P3-B: `security-performance-design.md` Read First 노출

**수정 파일**: `AGENTS.md` Read First 섹션에 항목 추가:
```
7. 필요 시 `docs/engineering/security-performance-design.md`
```

---

## 변경 범위 요약

| ID   | 우선순위 | 변경 파일                                                                                                                                                                       | 변경 유형                              |
| ---- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| P0   | P0       | `docs/workpacks/README.md`, `_template/README.md`, `AGENTS.md`                                                                                                                 | 브랜치명 feat→feature                  |
| P1-A | P1       | `package.json`, `tests/e2e/slice-01-live-oauth.spec.ts`                                                                                                                         | test:e2e + test:e2e:oauth 태그 기반 대칭화 |
| P1-B | P1       | `AGENTS.md`, `CLAUDE.md`, `agent-workflow-overview.md`, `.github/pull_request_template.md`                                                                                      | 게이트 단일화 + Commands 동기화        |
| P1-C | P1       | `docs/engineering/supabase-migrations.md` (신규), `supabase/migrations/.gitkeep` (신규), `supabase/seed.sql` (신규), `supabase/config.toml` (신규), `_template/README.md` | CLI 전제 포함 마이그레이션 문서 + scaffold |
| P2-A | P2       | `agent-workflow-overview.md`, `AGENTS.md`                                                                                                                                       | 핸드오프 섹션 추가                     |
| P2-B | P2       | `_template/README.md`                                                                                                                                                           | Design Status 섹션 추가                |
| P2-C | P2       | `_template/README.md`, `workpacks/README.md`                                                                                                                                    | 의존성 테이블 구조화                   |
| P3-A | P3       | `playwright-e2e.md`                                                                                                                                                             | 설명 + 태그 컨벤션 추가                |
| P3-B | P3       | `AGENTS.md`                                                                                                                                                                     | 1줄 추가                               |

**총계**: 기존 파일 9개 수정 + 신규 파일 4개

유니크 수정 파일 (9개):
1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/workpacks/README.md`
4. `docs/workpacks/_template/README.md`
5. `package.json`
6. `tests/e2e/slice-01-live-oauth.spec.ts`
7. `docs/engineering/agent-workflow-overview.md`
8. `.github/pull_request_template.md`
9. `docs/engineering/playwright-e2e.md`

신규 파일 (4개):
1. `docs/engineering/supabase-migrations.md`
2. `supabase/migrations/.gitkeep`
3. `supabase/seed.sql`
4. `supabase/config.toml` (supabase init 실행 결과물, 커밋 대상)

---

## Verification

수정 완료 후 아래 순서로 검증:

1. `pnpm validate:branch feature/be-discovery-filter` → OK
2. `pnpm validate:branch feat/be-discovery-filter` → ERROR
3. `pnpm test:e2e` → `tests/e2e/` 전체 실행, `@live-oauth` 테스트 제외 확인
4. `pnpm test:e2e:oauth` → `@live-oauth` 태그 테스트만 실행 확인
5. `pnpm test:all` → lint + typecheck + vitest + E2E 전부 통과
6. `supabase/migrations/`, `supabase/seed.sql`, `supabase/config.toml` 존재 확인
7. `docs/workpacks/_template/README.md` — Design Status·Dependencies 테이블·Schema Change 포함 확인
8. `docs/engineering/supabase-migrations.md` — Prerequisites(CLI 설치·init 순서) 포함 확인
