# Slice Development SOP

## 이 문서의 역할

에이전트가 `"<slice> N단계 진행해"` 요청을 받으면 이 문서를 읽고
해당 Stage의 **담당 · 사전 조건 · 읽을 것 · 산출물 · 포함 필수 사항 · 자가 점검 · 완료 기준 · 완료 요약**을 그대로 따른다.

---

## 담당 원칙 및 거부 규칙

| Stage | 이름 | 담당 |
|-------|------|------|
| 1 | Workpack README + acceptance.md 작성 | **Claude** |
| 2 | 백엔드 구현 | **Codex** |
| 3 | 백엔드 PR 리뷰 | **Claude** |
| 4 | 프론트엔드 구현 | **Codex** |
| 5 | 디자인 리뷰 | **Claude** |
| 6 | 프론트엔드 PR 리뷰 | **Claude** |

**거부 규칙 (요청받은 즉시 확인, 담당이 아니면 중단)**

- **Codex**가 1·3·5·6단계를 요청받으면:
  > "이 단계(N단계)는 Claude 담당입니다. Claude에게 요청해주세요."
  → 이후 진행하지 않는다.

- **Claude**가 2·4단계를 요청받으면:
  > "이 단계(N단계)는 Codex 담당입니다. Codex에게 요청해주세요. Claude는 코드 구현을 하지 않습니다."
  → 이후 진행하지 않는다.

---

## 공통 브랜치·PR 규칙

- 백엔드 브랜치: `feature/be-<slice>`
- 프론트엔드 브랜치: `feature/fe-<slice>`
- PR은 **Draft**로 열고 → `pnpm test:all` 통과 → CI green → **Ready for Review** 전환
- 머지 전 실제 동작 확인

---

## Stage 1: Workpack README + acceptance.md 작성

**담당: Claude**

### 사전 조건

- 슬라이스 ID와 목표가 전달됨
- `docs/workpacks/README.md` Slice Order에서 해당 슬라이스의 Dependencies 선행 슬라이스가 전부 `merged` 상태임을 확인

### 읽을 것 (이 순서로)

1. `docs/workpacks/_template/README.md` — 모든 섹션 확인
2. `docs/workpacks/_template/acceptance.md` — 모든 섹션 확인
3. `docs/sync/CURRENT_SOURCE_OF_TRUTH.md` — 공식 문서 버전 확인
4. `docs/요구사항기준선-v1.6.md` — 해당 슬라이스 요구사항 범위
5. `docs/화면정의서-v1.2.md` — 해당 화면 정의
6. `docs/api문서-v1.2.1.md` — 해당 API 섹션
7. `docs/db설계-v1.3.md` — 영향받는 테이블
8. `docs/workpacks/README.md` — Dependencies 선행 슬라이스 상태

### 산출물

- `docs/workpacks/<slice>/README.md` — 모든 섹션 채움
- `docs/workpacks/<slice>/acceptance.md` — Happy Path·State·Error·DataIntegrity·ManualQA·AutomationSplit 채움

### 포함 필수 사항

**README.md**
- **Goal**: 사용자 가치 2~4문장 (모호한 목표 금지)
- **In Scope**: 화면·API·상태 전이·DB 영향·Schema Change 체크박스
- **Out of Scope**: 의도적으로 제외하는 항목 (빈칸 금지)
- **Dependencies 테이블**: 선행 슬라이스 ID + 현재 상태
- **Backend First Contract**: request/response/error 계약 + 권한 조건 + 멱등성 정책
- **Frontend Delivery Mode**: 5개 필수 상태(`loading / empty / error / read-only / unauthorized`) 명시
- **Design Status**: 초기값 `temporary`
- **Key Rules**: 이 슬라이스 전용 정책 (도메인 규칙 + 예외 처리)
- **Primary User Path**: 3단계 이상의 구체적 사용자 흐름

**acceptance.md**
- Happy Path: 대표 흐름, API 응답 형식, 타입 일치
- State/Policy: 상태 전이 일치, read-only, 멱등성
- Error/Permission: 5개 상태, return-to-action
- Manual Only: 자동화 불가 시나리오 명시

### 자가 점검 체크리스트

- [ ] Goal이 사용자 가치 하나만 기술하는가 (복수 가치 혼합 금지)
- [ ] In Scope의 API 목록이 api문서와 정확히 일치하는가
- [ ] Backend First Contract에 error 케이스(401/403/404/409/422)가 명시되었는가
- [ ] Dependencies 선행 슬라이스 상태가 실제 저장소 상태와 일치하는가
- [ ] Schema Change 체크박스가 올바르게 표시되었는가
- [ ] Out of Scope에 의도적 제외 항목이 명시되었는가 (빈칸이면 재확인)
- [ ] Design Status가 `temporary`로 초기화되었는가
- [ ] acceptance.md에 자동화 불가 시나리오가 Manual Only로 분리되었는가

### 완료 기준

README.md + acceptance.md가 main에 merge됨

### 완료 요약 (단계 종료 시 Claude가 출력)

```
## 1단계 완료: <slice-name>

### 작성 내용
- 화면: <목록>
- API: <목록>
- 상태 전이: <목록>
- DB 영향: <테이블 목록>
- Backend First Contract 핵심: <request/response/error 요약>

### 결정 사항
- Out of Scope 이유: <내용>
- Schema 변경 여부: 있음 / 없음

### 다음 단계
→ 2단계(Codex): feature/be-<slice> 백엔드 구현
→ 사전 조건: 이 README main merge 완료
```

---

## Stage 2: 백엔드 구현

**담당: Codex**

### 사전 조건

- 1단계 README.md + acceptance.md가 main에 merge됨
- `docs/workpacks/<slice>/README.md`의 Dependencies 선행 슬라이스 전부 merged

### 읽을 것 (이 순서로)

1. `AGENTS.md` — 공통 규칙 전체
2. `docs/engineering/slice-workflow.md` — 2단계 항목
3. `docs/workpacks/<slice>/README.md` — Backend First Contract, Key Rules, In Scope
4. `docs/api문서-v1.2.1.md` — 해당 섹션 전체
5. `docs/db설계-v1.3.md` — 해당 테이블
6. `docs/engineering/tdd-vitest.md` — 테스트 전략
7. `docs/engineering/supabase-migrations.md` — Schema 변경 있는 경우만
8. `docs/engineering/git-workflow.md` — 브랜치·커밋 규칙

### 산출물

브랜치 `feature/be-<slice>`:

- Next.js Route Handlers (`app/api/v1/...`)
- TypeScript 타입 정의 (request/response/error)
- 상태 전이 로직
- Vitest 단위 테스트
- Schema 변경 있으면 `supabase/migrations/<timestamp>_<slice>_<desc>.sql`
- Draft PR (본문에 아래 완료 요약 포함)

### 포함 필수 사항

- `{ success, data, error }` 래퍼 유지
- `error: { code, message, fields[] }` 구조
- 권한 검증: 소유자 일치, 다른 유저 리소스 수정 불가 (403)
- 상태 전이: 문서 기준 상태만 허용, 불일치 시 409
- 멱등성: complete·cancel 성 API는 이미 완료/취소 시 200 + 동일 결과
- 테스트 최소 시나리오: happy path + 상태 전이 오류 + 권한 거부 + read-only 409

### 자가 점검 체크리스트

- [ ] README Backend First Contract와 실제 구현(request/response/error)이 일치하는가
- [ ] 완료·취소성 API가 멱등한가
- [ ] 다른 사용자 리소스를 수정할 수 없는가 (403)
- [ ] read-only 정책이 우회되지 않는가 (완료 후 수정 시 409)
- [ ] 문서에 없는 필드·상태·엔드포인트를 임의 추가하지 않았는가
- [ ] 테스트가 상태 전이·에러·권한·read-only를 고정하는가 (happy path만이 아닌가)
- [ ] `pnpm install --frozen-lockfile && pnpm test:all` 통과
- [ ] 브랜치명이 `feature/be-<slice>`인가
- [ ] 커밋이 Conventional Commits를 따르는가

### 완료 기준

`pnpm test:all` 통과 → push → CI green → Draft 해제 → Ready for Review

### PR 본문 완료 요약 (PR ## Summary, ## Workpack/Slice 섹션에 작성)

```
## Workpack / Slice
- 관련 workpack: `docs/workpacks/<slice>/README.md`
- 변경 범위: 백엔드 구현

## Summary
- 구현한 API: <목록>
- 상태 전이: <목록>
- DB 영향: <테이블>
- 권한 검증: <설명>
- 멱등성 처리: <설명>
- 주요 결정 사항: <계약 변경 또는 Out of Scope 처리 이유>
```

---

## Stage 3: 백엔드 PR 리뷰

**담당: Claude**

### 사전 조건 (3가지 모두 충족 시에만 시작)

- PR이 Draft 상태가 아님
- required CI 워크플로가 모두 green
- `docs/workpacks/<slice>/README.md`가 존재함

### 읽을 것 (이 순서로)

1. `docs/workpacks/<slice>/README.md` — Backend First Contract, Key Rules
2. `AGENTS.md` Review Checks 섹션 전체
3. `docs/workpacks/<slice>/acceptance.md`
4. PR diff 코드

### 리뷰 항목 (전부 확인)

- [ ] 완료·취소성 API가 멱등한가
- [ ] read-only 정책이 우회되지 않는가
- [ ] `exclude → uncheck` 규칙이 지켜지는가 (장보기 슬라이스)
- [ ] `add_to_pantry_item_ids`의 `null / [] / 선택값`이 구분되는가 (해당 슬라이스)
- [ ] 다른 사용자 리소스를 수정할 수 없는가
- [ ] 독립 요리·플래너 요리 상태 전이가 섞이지 않는가 (요리 슬라이스)
- [ ] 브랜치·커밋·PR 본문이 Git/PR 규칙을 만족하는가
- [ ] 테스트가 상태 전이·에러·read-only를 고정하는가
- [ ] PR 템플릿 Security·Performance·Design 섹션이 기록되었는가
- [ ] README Backend First Contract와 실제 구현이 일치하는가

### 완료 기준

수정 요청 없이 승인 → merge

### 완료 요약 (리뷰 종료 시 Claude가 출력)

```
## 3단계 완료: <slice-name> 백엔드 PR 리뷰

### 리뷰 결과: 승인 / 수정 요청 N건

### 항목별 결과
- 멱등성: ✅/❌
- read-only 정책: ✅/❌
- 권한 검증: ✅/❌
- 테스트 커버리지(상태전이·에러·read-only): ✅/❌
- Backend First Contract 일치: ✅/❌

### 수정 요청 사항 (있는 경우)
- <항목>

### 다음 단계
→ 4단계(Codex): feature/fe-<slice> 프론트엔드 구현
→ 사전 조건: 이 PR merged
```

---

## Stage 4: 프론트엔드 구현

**담당: Codex**

### 사전 조건

- 3단계 백엔드 PR이 main에 merged됨

### 읽을 것 (이 순서로)

1. `AGENTS.md` — 공통 규칙 전체
2. `docs/engineering/slice-workflow.md` — 4단계 항목
3. `docs/workpacks/<slice>/README.md` — Frontend Delivery Mode, Design Status, Key Rules
4. `docs/화면정의서-v1.2.md` — 해당 화면 정의
5. 백엔드 브랜치 TypeScript 타입 파일 — API 계약 확인
6. `docs/engineering/tdd-vitest.md`
7. `docs/engineering/playwright-e2e.md`
8. `docs/engineering/git-workflow.md`

### 산출물

브랜치 `feature/fe-<slice>`:

- Next.js 페이지·컴포넌트
- Zustand 상태·API 호출 레이어
- 5개 필수 UI 상태: `loading / empty / error / read-only / unauthorized`
- 로그인 게이트 + return-to-action (보호 액션 있는 경우)
- Vitest 단위 테스트 (상태 전이, 유틸)
- Playwright E2E (핵심 사용자 흐름)
- Draft PR (본문에 아래 완료 요약 포함)

### 포함 필수 사항

- 백엔드 `{ success, data, error }` 계약을 그대로 소비 (임의 변경 금지)
- API 타입·상태 enum·권한 상태·read-only 여부를 컴포넌트보다 먼저 분리
- 상태 전이 로직은 테스트로 고정
- Design Status `temporary`: 기능 가능한 임시 UI, Tailwind 클래스 나중에 교체 가능한 구조 유지
- 비로그인 보호 액션: 로그인 안내 모달 → return-to-action URL 보존

### 자가 점검 체크리스트

- [ ] 5개 UI 상태 모두 존재하는가 (`loading / empty / error / read-only / unauthorized`)
- [ ] 백엔드 계약 타입을 임의 변경하지 않았는가
- [ ] 문서에 없는 UI 상태·기능을 추가하지 않았는가
- [ ] 보호 액션이 있다면 로그인 게이트·return-to-action이 동작하는가
- [ ] 상태 전이 로직이 테스트로 고정되었는가
- [ ] Design Status `temporary`이면 스타일이 나중에 교체 가능한 구조인가
- [ ] `pnpm install --frozen-lockfile && pnpm test:all` 통과
- [ ] 브랜치명이 `feature/fe-<slice>`인가
- [ ] 커밋이 Conventional Commits를 따르는가

### 완료 기준

`pnpm test:all` 통과 → push → CI green → Draft 해제 → Ready for Review

### PR 본문 완료 요약 (PR ## Summary, ## Workpack/Slice 섹션에 작성)

```
## Workpack / Slice
- 관련 workpack: `docs/workpacks/<slice>/README.md`
- 변경 범위: 프론트엔드 구현

## Summary
- 구현 화면: <목록>
- UI 상태: loading ✅ / empty ✅ / error ✅ / read-only ✅ / unauthorized ✅
- 로그인 게이트: 있음 / 없음
- Design Status: temporary / confirmed
- 주요 결정 사항: <임시 UI 구조 선택 이유 등>
```

---

## Stage 5: 디자인 리뷰

**담당: Claude**

### 트리거 조건 (하나라도 해당 시 시작)

- workpack README의 Design Status가 `pending-review` 이상으로 변경됨
- Figma URL이 제공됨

### 리뷰 범위 (Design Status에 따라)

- `temporary`: 기능 동작·5개 UI 상태 존재·화면정의서 기준 필수 요소 누락 여부
- `pending-review` 이상: 위 + spacing·typography·color hierarchy·공용 컴포넌트 일관성·Tailwind 클래스·접근성 기본 요소(aria, focus, contrast)

### 읽을 것 (이 순서로)

1. `docs/workpacks/<slice>/README.md` — Design Status 확인
2. `docs/화면정의서-v1.2.md` — 해당 화면 정의
3. 현재 컴포넌트 코드
4. Figma 디자인 컨텍스트 (URL 있는 경우)

### 산출물

- 디자인 피드백 (구체적 수정 위치·파일명·라인 포함)
- Tailwind 클래스 교체 제안 (컴포넌트 구조 변경은 Codex와 협의)
- workpack README Design Status 업데이트 (`confirmed`으로 변경 가능 시)

### 완료 요약 (리뷰 종료 시 Claude가 출력)

```
## 5단계 완료: <slice-name> 디자인 리뷰

### Design Status: temporary → pending-review / confirmed

### 확인 항목
- 필수 UI 상태 5개: ✅/❌
- 화면정의서 일치: ✅/❌
- 공용 컴포넌트 일관성: ✅/❌ (confirmed 시만)
- 접근성 기본 요소: ✅/❌ (confirmed 시만)

### 피드백 요약
- <수정 제안 항목 (파일명·위치 포함)>

### 다음 단계
→ 6단계(Claude): 프론트엔드 PR 리뷰
→ 사전 조건: CI green + Draft 해제
```

---

## Stage 6: 프론트엔드 PR 리뷰

**담당: Claude**

### 사전 조건 (3가지 모두 충족 시에만 시작)

- PR이 Draft 상태가 아님
- required CI 워크플로가 모두 green
- `docs/workpacks/<slice>/README.md`가 존재함

### 읽을 것 (이 순서로)

1. `docs/workpacks/<slice>/README.md` — Design Status, Frontend Delivery Mode, Key Rules
2. `docs/workpacks/<slice>/acceptance.md` — 체크리스트 전체
3. `AGENTS.md` Review Checks 섹션
4. PR diff 코드

### 리뷰 깊이 (Design Status에 따라)

- `temporary`: 기능 동작·5개 UI 상태·상태 전이·권한 게이트
- `confirmed`: 위 + spacing·hierarchy·공용 컴포넌트·Tailwind 일관성

### 리뷰 항목 (전부 확인)

- [ ] 5개 UI 상태(`loading / empty / error / read-only / unauthorized`)가 모두 존재하는가
- [ ] 백엔드 계약 타입이 그대로 소비되었는가 (임의 변경 없음)
- [ ] 상태 전이 로직이 테스트로 고정되었는가
- [ ] 로그인 게이트·return-to-action이 올바른가 (해당 시)
- [ ] acceptance.md 미체크 항목이 없는가
- [ ] 브랜치·커밋·PR 본문이 규칙을 만족하는가
- [ ] 보안/성능/디자인 영향이 PR 템플릿에 기록되었는가

### 완료 기준

수정 요청 없이 승인 → merge

### 완료 요약 (슬라이스 최종 완료 요약 포함, Claude가 출력)

```
## 6단계 완료: <slice-name> 프론트엔드 PR 리뷰

### 리뷰 결과: 승인 / 수정 요청 N건
### Design Status 기준: temporary / confirmed

### 항목별 결과
- 5개 UI 상태: ✅/❌
- 상태 전이 테스트: ✅/❌
- 로그인 게이트: ✅/❌ / 해당 없음
- acceptance.md 전체 pass: ✅/❌

---

## 슬라이스 완료 요약: <slice-name>

| 항목 | 내용 |
|------|------|
| 백엔드 브랜치 | `feature/be-<slice>` |
| 프론트엔드 브랜치 | `feature/fe-<slice>` |
| 구현 API | <목록> |
| 구현 화면 | <목록> |
| 상태 전이 | <목록> |
| 테스트 커버리지 | Vitest: <범위> / Playwright: <범위> |
| Design Status | <최종 상태> |
| 주요 결정 사항 | <내용> |

### 다음 슬라이스
→ <next-slice> 1단계 시작 가능 (사전 조건: 이 PR merged)
```
