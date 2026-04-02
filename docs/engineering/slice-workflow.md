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

- 1단계(docs) 브랜치: `docs/<slice>`
- 백엔드 브랜치: `feature/be-<slice>`
- 프론트엔드 브랜치: `feature/fe-<slice>`
- 파일 수정 전에는 먼저 해당 단계 브랜치로 전환한다. 표준 명령:
  - `pnpm branch:start -- --slice <slice> --role docs`
  - `pnpm branch:start -- --slice <slice> --role be`
  - `pnpm branch:start -- --slice <slice> --role fe`
- 일반 세션에서는 위 명령이 해당 단계 브랜치를 active intent로 기록한다.
- 새 user prompt 뒤에 다시 수정하려면 같은 명령으로 branch intent를 재확인해야 하며, project hook가 그 턴의 첫 `Write/Edit` 전에 recorded intent와 current checkout을 맞춘다.
- product slice 구현 PR은 **Draft**로 열고 → backend는 `pnpm install --frozen-lockfile && pnpm verify:backend`, frontend는 `pnpm install --frozen-lockfile && pnpm verify:frontend` 통과 → required CI green → **Ready for Review** 전환
- 머지 전 실제 동작 확인
- merge 직전에는 현재 PR head SHA에 대해 시작된 check 전체가 완료/green인지 다시 확인한다. required가 아닌 check라도 pending, rerun, fail 상태면 merge하지 않는다.
- 변경 유형별 축약 경로와 `N/A` 허용 기준은 `docs/engineering/agent-workflow-overview.md`의 Change Type Matrix를 따른다.

## Closeout Sync Contract

- workpack README의 `Delivery Checklist`, `Design Status`, roadmap status, acceptance 체크박스, PR 본문 evidence는 서로 따로 노는 참고 문서가 아니라 **같은 closeout 상태**를 표현해야 한다.
- Stage 2/4 구현 담당인 Codex는 PR을 `Ready for Review`로 넘기기 전에 자신이 닫은 범위에 맞춰 `Delivery Checklist`, acceptance, PR 본문 `Actual Verification`, `Closeout Sync`, `Merge Gate`를 갱신한다.
- Stage 3/5/6 리뷰 담당인 Claude는 승인 전에 위 문서들이 서로 일치하는지 확인하고, mismatch가 있으면 코드 이슈가 없어도 closeout drift로 수정 요청한다.
- policy 자동화는 `pnpm validate:closeout-sync`로 closeout drift를 검사한다.
  - non-draft `feature/fe-<slice>` PR은 `Ready for Review` 전에 README `Delivery Checklist`, acceptance(`Manual Only` 제외), `Design Status`가 closeout-ready 상태인지 통과해야 한다.
  - roadmap status가 이미 `merged`인 changed slice와 `docs/omo-closeout-<slice>` 브랜치는 merged closeout 기준을 통과해야 한다.
- Stage 6 merge 시점에는 아래가 동시에 만족해야 한다:
  - roadmap status가 실제 단계와 맞다
  - `Design Status`가 최종 리뷰 결과와 맞다
  - README `Delivery Checklist`에 In Scope인데도 남은 unchecked 항목이 없다
  - acceptance에서 `Manual Only`를 제외한 In Scope 미체크 항목이 없다
  - PR 본문 `Actual Verification`, `Closeout Sync`, `Merge Gate`가 최신 evidence를 반영한다
- 남길 수 있는 미체크 항목은 `Manual Only` 또는 명시적 `N/A` / 후속 slice 이관뿐이며, 이 경우 README 또는 PR 본문에 근거가 있어야 한다.

## Slice Readiness Safeguards

- fixture/mock green만으로 슬라이스가 닫혔다고 간주하지 않는다. 해당 슬라이스가 기존 DB 테이블, 시스템 row, 회원 bootstrap에 의존하면 최소 1회는 real DB smoke 또는 동등한 검증 경로를 가져야 한다.
- workpack의 `Schema Change`가 `없음`이어도 referenced table 부재 위험이 사라지지 않는다. 기존 테이블을 읽기만 하는 슬라이스도 로컬 또는 합의된 smoke 환경에 스키마가 실제로 준비되어 있는지 확인해야 한다.
- 로그인/회원가입 직후 자동 생성되는 시스템 데이터(`meal_plan_columns`, `recipe_books` 등)에 의존하는 슬라이스는 Stage 1에서 owning flow를 명시하고, Stage 2 또는 4에서 해당 bootstrap이 실제로 완료되는지 검증해야 한다.
- real DB, seed, bootstrap readiness가 blocker면 product 구현을 계속 밀지 말고 먼저 스키마/seed/bootstrap 경로를 복구한다.

---

## Stage 1: Workpack README + acceptance.md 작성

**담당: Claude**

### 사전 조건

- 슬라이스 ID와 목표가 전달됨
- `docs/workpacks/README.md` Slice Order 표의 **Status 열**에서 현재 슬라이스보다 먼저 완료돼야 하는 선행 슬라이스가 전부 `merged` 상태임을 확인 (슬라이스 번호 순서가 기본 의존 순서이며, 예외는 Slice Notes 참조). **`bootstrap`은 `merged`와 동등하게 취급한다.**

### 읽을 것 (이 순서로)

1. `docs/workpacks/_template/README.md` — 모든 섹션 확인
2. `docs/workpacks/_template/acceptance.md` — 모든 섹션 확인
3. `docs/sync/CURRENT_SOURCE_OF_TRUTH.md` — 공식 문서 버전 확인
4. `docs/요구사항기준선-v1.6.md` — 해당 슬라이스 요구사항 범위
5. `docs/화면정의서-v1.2.md` — 해당 화면 정의
6. `docs/api문서-v1.2.1.md` — 해당 API 섹션
7. `docs/db설계-v1.3.md` — 영향받는 테이블
8. `docs/engineering/qa-system.md` — QA 3-Layer와 real DB / fixture 운영 기준
9. `docs/workpacks/README.md` — Slice Order의 Status 열로 선행 슬라이스 `merged` 여부 확인
10. `docs/design/design-tokens.md` — 확정 디자인 토큰 (와이어프레임 작성 전 확인)

### 산출물

- `docs/workpacks/<slice>/README.md` — 모든 섹션 채움
- `docs/workpacks/<slice>/acceptance.md` — Happy Path·State·Error·DataIntegrity·ManualQA·AutomationSplit 채움
- (신규 화면 또는 high-risk UI change가 있는 FE 슬라이스만) In Scope의 **각 FE 화면마다**:
  - `ui/designs/<SCREEN_ID>.md` — design-generator 실행
  - `ui/designs/critiques/<SCREEN_ID>-critique.md` — design-critic 실행 (🟢/🟡 통과 필수)

### 포함 필수 사항

**README.md**
- **Goal**: 사용자 가치 2~4문장 (모호한 목표 금지)
- **In Scope**: 화면·API·상태 전이·DB 영향·Schema Change 체크박스
- **Out of Scope**: 의도적으로 제외하는 항목 (빈칸 금지)
- **Dependencies 테이블**: 선행 슬라이스 ID + 현재 상태
- **Backend First Contract**: request/response/error 계약 + 권한 조건 + 멱등성 정책
- **Frontend Delivery Mode**: 5개 필수 상태(`loading / empty / error / read-only / unauthorized`) 명시
- **Design Status**: FE 화면 있으면 `temporary`, BE-only 슬라이스(FE 화면 없음)면 `N/A`
- **Key Rules**: 이 슬라이스 전용 정책 (도메인 규칙 + 예외 처리)
- **QA / Test Data Plan**: fixture baseline, real DB smoke 경로, seed/reset 명령, bootstrap이 만들어야 하는 시스템 row, blocker 조건
- **Contract Evolution Candidates (optional)**: 공식 문서엔 없지만 사용자 승인 시 더 나은 계약이 될 수 있는 후보가 있다면 현재 계약 / 제안 계약 / 기대 사용자 가치 / 영향 문서 / 승인 상태를 기록
- **Primary User Path**: 3단계 이상의 구체적 사용자 흐름

**acceptance.md**
- Happy Path: 대표 흐름, API 응답 형식, 타입 일치
- State/Policy: 상태 전이 일치, read-only, 멱등성
- Error/Permission: 5개 상태, return-to-action
- Data Setup / Preconditions: fixture, real DB smoke, seed, bootstrap 완료 기준
- Manual Only: 자동화 불가 시나리오 명시

**디자인 산출물 (신규 화면 또는 high-risk UI change가 있는 FE 슬라이스만)**
- In Scope의 각 FE 화면마다 design-generator → design-critic 순서로 실행
- design-critic 등급이 🔴(재작업)이면 재작업 완료 후 Stage 2로 넘어간다
- 기존 confirmed 화면의 low-risk UI change는 design-generator·design-critic을 생략할 수 있다. 이 경우 README 또는 PR에 생략 근거를 남긴다.
- BE-only 슬라이스(In Scope에 FE 화면 없음)는 design-generator·design-critic 불필요

### 자가 점검 체크리스트

- [ ] Goal이 사용자 가치 하나만 기술하는가 (복수 가치 혼합 금지)
- [ ] In Scope의 API 목록이 api문서와 정확히 일치하는가
- [ ] Backend First Contract에 error 케이스(401/403/404/409/422)가 명시되었는가
- [ ] Dependencies 선행 슬라이스 상태가 실제 저장소 상태와 일치하는가
- [ ] Schema Change 체크박스가 올바르게 표시되었는가
- [ ] Out of Scope에 의도적 제외 항목이 명시되었는가 (빈칸이면 재확인)
- [ ] Design Status가 올바르게 설정됐는가 (FE 화면 있으면 `temporary`, BE-only면 `N/A`)
- [ ] acceptance.md에 자동화 불가 시나리오가 Manual Only로 분리되었는가
- [ ] README에 `QA / Test Data Plan`이 있고 fixture 경로와 real DB smoke 경로가 모두 적혀 있는가
- [ ] bootstrap/system row 의존 슬라이스라면 Stage 1 문서에 owning flow와 기대 row(`recipe_books ×3`, `meal_plan_columns ×3` 등)가 명시됐는가
- [ ] 공식 문서에 없는 더 나은 계약 후보가 있다면 workpack에 `Contract Evolution Candidates`로만 기록했고, 승인 전 In Scope 계약에 섞지 않았는가
- [ ] 신규 화면 또는 high-risk UI change가 있다면 각 화면의 `ui/designs/<SCREEN_ID>.md`가 생성됐는가
- [ ] 신규 화면 또는 high-risk UI change가 있다면 각 화면의 design-critic 등급이 🟢 또는 🟡인가 (🔴이면 재작업)
- [ ] low-risk UI change라면 design-generator / design-critic 생략 근거가 README 또는 PR에 기록됐는가

### 완료 기준

브랜치 `docs/<slice>`에서 PR을 열고, 다음이 같은 PR에 포함되어 main에 merge됨:
- `docs/workpacks/<slice>/README.md` + `acceptance.md`
- (신규 화면 또는 high-risk UI change가 있는 FE 슬라이스) In Scope 각 FE 화면의 `ui/designs/<SCREEN_ID>.md` + `ui/designs/critiques/<SCREEN_ID>-critique.md`

**이 PR에 `docs/workpacks/README.md` Slice Order의 해당 슬라이스 Status를 `planned` → `docs`로 변경하는 커밋을 포함한다.**

공식 source-of-truth 문서 변경이 필요한 사용자 승인 계약 후보가 있다면:
- Stage 1 결과를 바로 Stage 2 시작 신호로 쓰지 않는다.
- 먼저 별도 `contract-evolution` docs PR에서 공식 문서와 `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`를 갱신한다.
- 그 후 Stage 1 workpack/acceptance를 새 공식 문서 기준으로 다시 잠그고 main에 merge한다.

### 완료 요약 (단계 종료 시 Claude가 출력)

```
## 1단계 완료: <slice-name>

### 작성 내용
- 화면: <목록>
- API: <목록>
- 상태 전이: <목록>
- DB 영향: <테이블 목록>
- Backend First Contract 핵심: <request/response/error 요약>
- QA / Test Data Plan: <fixture, real DB smoke, seed, bootstrap 요약>

### 결정 사항
- Out of Scope 이유: <내용>
- Schema 변경 여부: 있음 / 없음
- Contract Evolution: 없음 / 후보 N건 / 사용자 승인 후 별도 docs PR 필요

### Design 산출물 (신규 화면 또는 high-risk UI change가 있는 FE 슬라이스만)
- <SCREEN_ID>: critique 등급 🟢/🟡

### 다음 단계
→ 2단계(Codex): feature/be-<slice> 백엔드 구현
→ 사전 조건: 이 README main merge 완료
→ 단, 사용자 승인된 Contract Evolution 후보가 있으면 해당 docs PR merge 후 시작
```

---

## Stage 2: 백엔드 구현

**담당: Codex**

### 사전 조건

- 1단계 README.md + acceptance.md가 main에 merge됨
- `docs/workpacks/<slice>/README.md`의 Dependencies 선행 슬라이스 전부 merged
- 이 슬라이스에 영향 있는 `Contract Evolution Candidates`가 있다면, 승인된 항목은 별도 `contract-evolution` PR로 official docs와 `CURRENT_SOURCE_OF_TRUTH`가 먼저 merge됨
- **`docs/workpacks/README.md` Slice Order에서 해당 슬라이스 Status를 `docs` → `in-progress`로 변경한다** (2단계 첫 커밋에 포함)

### 읽을 것 (이 순서로)

1. `AGENTS.md` — 공통 규칙 전체
2. `docs/engineering/slice-workflow.md` — 2단계 항목
3. `docs/workpacks/<slice>/README.md` — Backend First Contract, Key Rules, In Scope
4. `docs/workpacks/<slice>/acceptance.md` — 상태 전이·에러·권한 시나리오 확인
5. `docs/api문서-v1.2.1.md` — 해당 섹션 전체
6. `docs/db설계-v1.3.md` — 해당 테이블
7. `docs/engineering/tdd-vitest.md` — 테스트 전략
8. `docs/engineering/qa-system.md` — Layer 1 deterministic gate + real DB smoke 운영 기준
9. `docs/engineering/supabase-migrations.md` — Schema 변경 있는 경우만
10. `docs/engineering/git-workflow.md` — 브랜치·커밋 규칙

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
- `Schema Change: 없음`이어도 이 슬라이스가 읽는 기존 테이블이 real DB/local Supabase에 존재하는지 확인
- 시스템 row/bootstrap 의존 슬라이스면 fixture만이 아니라 real DB smoke 또는 seed 검증 경로를 최소 1회 실행
- README `Delivery Checklist`와 acceptance의 백엔드 범위를 PR 준비 전에 갱신
- PR 본문 `Actual Verification`에 real DB/schema/bootstrap smoke 또는 `N/A` 근거 기록
- PR 본문 `Closeout Sync`에 Stage 2 시점에 닫은 항목과 남은 프론트 범위 기록
- PR 본문 `Merge Gate`에 current head SHA, 시작된 PR checks, 남은 pending/fail/rerun 여부 기록

### 자가 점검 체크리스트

- [ ] README Backend First Contract와 실제 구현(request/response/error)이 일치하는가
- [ ] 완료·취소성 API가 멱등한가
- [ ] 다른 사용자 리소스를 수정할 수 없는가 (403)
- [ ] read-only 정책이 우회되지 않는가 (완료 후 수정 시 409)
- [ ] 문서에 없는 필드·상태·엔드포인트를 임의 추가하지 않았는가
- [ ] 승인되지 않았거나 문서화되지 않은 `Contract Evolution Candidates`를 구현 scope에 섞지 않았는가
- [ ] 테스트가 상태 전이·에러·권한·read-only를 고정하는가 (happy path만이 아닌가)
- [ ] 로컬 또는 합의된 smoke DB에서 referenced table 부재가 없는지 확인했는가 (`Schema Change: 없음`이어도 적용)
- [ ] bootstrap/system row 의존 슬라이스라면 real DB smoke 또는 seed 경로로 `recipe_books`, `meal_plan_columns` 같은 선행 데이터가 실제 생성되는지 확인했는가
- [ ] README `Delivery Checklist`와 acceptance의 백엔드 항목을 최신 구현/evidence 기준으로 갱신했는가
- [ ] PR 본문 `Actual Verification`, `Closeout Sync`, `Merge Gate`가 최신 상태와 일치하는가
- [ ] `pnpm install --frozen-lockfile && pnpm verify:backend` 통과
- [ ] 브랜치명이 `feature/be-<slice>`인가
- [ ] 커밋이 Conventional Commits를 따르는가

### 완료 기준

`pnpm verify:backend` 통과 + 필요한 real DB/schema/bootstrap smoke 확인 → push → required CI green → Draft 해제 → Ready for Review

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
- `docs/workpacks/<slice>/README.md`와 `acceptance.md`가 존재함

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
- [ ] referenced table / bootstrap readiness를 real DB smoke나 seed evidence로 확인했는가 (해당 슬라이스)
- [ ] README `Delivery Checklist`와 acceptance의 백엔드 범위가 실제 머지 상태와 일치하는가
- [ ] PR 본문 `Actual Verification`, `Closeout Sync`, `Merge Gate`가 비어 있지 않고 실제 evidence를 반영하는가

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

※ **BE-only 슬라이스** (workpack README에 FE 화면 없음 명시):
  이 PR merge 시 `docs/workpacks/README.md` Slice Status를 `in-progress → merged`로 직접 변경, 슬라이스 종료.
  아래 최종 완료 요약도 함께 출력한다.

---

## 슬라이스 완료 요약 (BE-only): <slice-name>

| 항목 | 내용 |
|------|------|
| 백엔드 브랜치 | `feature/be-<slice>` |
| 구현 API | <목록> |
| 상태 전이 | <목록> |
| 테스트 커버리지 | Vitest: <범위> |
| Design Status | N/A (FE 화면 없음) |
| 주요 결정 사항 | <내용> |

### 다음 슬라이스
→ <next-slice> 1단계 시작 가능 (사전 조건: 이 PR merged)
```

---

## Stage 4: 프론트엔드 구현

**담당: Codex**

### 사전 조건

- 3단계 백엔드 PR이 main에 merged됨
- 프론트에 영향 있는 공식 계약 변경이 있다면 관련 `contract-evolution` docs PR도 main에 merged됨

> **BE-only 슬라이스** (workpack README에 `Design Status: N/A` 또는 FE 화면 없음 명시):
> Stage 4~6 스킵. Stage 3 완료 요약에 슬라이스 종료 처리 포함.

### 읽을 것 (이 순서로)

1. `AGENTS.md` — 공통 규칙 전체
2. `docs/engineering/slice-workflow.md` — 4단계 항목
3. `docs/workpacks/<slice>/README.md` — Frontend Delivery Mode, Design Status, Key Rules
4. `docs/workpacks/<slice>/acceptance.md` — 자동화 대상·Manual Only 분리 확인
5. `docs/화면정의서-v1.2.md` — 해당 화면 정의
6. `docs/design/design-tokens.md` — 확정 색상·간격·컴포넌트 토큰 (Tailwind 클래스 작성 전 확인)
7. In Scope의 각 FE 화면마다 `ui/designs/<SCREEN_ID>.md` — 신규 화면 또는 high-risk UI change인 경우 Stage 1에서 생성된 화면 설계 와이어프레임 (필수)
8. 백엔드 브랜치 TypeScript 타입 파일 — API 계약 확인
9. `docs/engineering/tdd-vitest.md`
10. `docs/engineering/playwright-e2e.md`
11. `docs/engineering/qa-system.md`
12. `docs/engineering/git-workflow.md`

### 산출물

브랜치 `feature/fe-<slice>`:

- Next.js 페이지·컴포넌트
- Zustand 상태·API 호출 레이어
- 5개 필수 UI 상태: `loading / empty / error / read-only / unauthorized`
- 로그인 게이트 + return-to-action (보호 액션 있는 경우)
- Vitest 단위 테스트 (상태 전이, 유틸)
- Playwright E2E (핵심 사용자 흐름)
- exploratory QA bundle + report + eval result (필수인 변경 강도에서)
- Draft PR (본문에 아래 완료 요약 포함)

### 포함 필수 사항

- 백엔드 `{ success, data, error }` 계약을 그대로 소비 (임의 변경 금지)
- API 타입·상태 enum·권한 상태·read-only 여부를 컴포넌트보다 먼저 분리
- 상태 전이 로직은 테스트로 고정
- Design Status `temporary`: 기능 가능한 임시 UI, Tailwind 클래스 나중에 교체 가능한 구조 유지
- 비로그인 보호 액션: 로그인 안내 모달 → return-to-action URL 보존
- 신규 화면 또는 high-risk UI change인 경우 In Scope의 각 FE 화면마다 `ui/designs/<SCREEN_ID>.md` 와이어프레임을 참조하여 구현
- 신규 화면 또는 high-risk UI change인 경우 구현 완료 시 workpack README의 Design Status를 `temporary → pending-review`로 변경
- 기존 confirmed 화면의 low-risk UI change는 Design Status를 유지할 수 있다. 이 경우 PR 본문에 low-risk 판단 근거를 남긴다.
- Layer 1 deterministic gate(`pnpm verify:frontend`)를 먼저 green으로 만들고, exploratory QA는 그 다음에 실행
- 시스템 row/bootstrap 의존 슬라이스면 fixture mode만이 아니라 real DB/local Supabase smoke 경로도 최소 1회 검증
- Layer 2 exploratory QA를 실행했다면 Layer 3 단건 `pnpm qa:eval -- --checklist ... --report ...` 결과까지 PR에 남긴다
- README `Delivery Checklist`, acceptance, Design Status를 PR 준비 전에 최신화
- PR 본문 `Actual Verification`에 실제 브라우저 확인 / local demo / local Supabase / `N/A` 근거 기록
- PR 본문 `Closeout Sync`에 남은 Manual Only, 후속 slice 이관, 최종 closeout 변경사항 기록
- PR 본문 `Merge Gate`에 current head SHA, 시작된 PR checks, 남은 pending/fail/rerun 여부 기록

### 자가 점검 체크리스트

- [ ] 5개 UI 상태 모두 존재하는가 (`loading / empty / error / read-only / unauthorized`)
- [ ] 백엔드 계약 타입을 임의 변경하지 않았는가
- [ ] 문서에 없는 UI 상태·기능을 추가하지 않았는가
- [ ] 승인되지 않았거나 문서화되지 않은 `Contract Evolution Candidates`를 UI 구현 scope에 섞지 않았는가
- [ ] 보호 액션이 있다면 로그인 게이트·return-to-action이 동작하는가
- [ ] 상태 전이 로직이 테스트로 고정되었는가
- [ ] Design Status `temporary`이면 스타일이 나중에 교체 가능한 구조인가
- [ ] 신규 화면 또는 high-risk UI change라면 각 FE 화면의 `ui/designs/<SCREEN_ID>.md`를 참조하여 구현했는가
- [ ] 신규 화면 또는 high-risk UI change라면 구현 완료 후 workpack README의 Design Status를 `pending-review`로 변경했는가
- [ ] low-risk UI change라면 Design Status 유지 근거를 PR 본문에 남겼는가
- [ ] 디자인 토큰(`--brand`, `--olive`, `--surface`, `--muted` 등)을 올바르게 사용했는가 (구버전 `#d56a3a`, `#6e7c4a` 사용 금지)
- [ ] 카드 border-radius 16px, 터치 타겟 44px 기준을 준수했는가
- [ ] `pnpm install --frozen-lockfile && pnpm verify:frontend` 통과
- [ ] bootstrap/system row 의존 슬라이스라면 `pnpm dev:local-supabase`, `pnpm dev:demo`, seed script 등 real DB smoke 경로로 실제 생성/조회가 되는지 확인했는가
- [ ] 최신 QA tooling이나 fixture/auth 시스템이 다른 브랜치에서 먼저 merge되었다면, 최신 base를 반영한 뒤 Layer 1 deterministic gate를 다시 실행했는가
- [ ] 신규 화면 또는 high-risk UI change라면 `pnpm qa:explore -- --slice <slice>` 번들을 만들고 exploratory QA 보고서를 남겼는가
- [ ] Layer 2 exploratory QA를 실행했다면 `pnpm qa:eval -- --checklist <.../exploratory-checklist.json> --report <.../exploratory-report.json>` 결과를 남겼는가
- [ ] README `Delivery Checklist`, acceptance, Design Status가 최신 구현/evidence 기준으로 갱신됐는가
- [ ] PR 본문 `Actual Verification`, `Closeout Sync`, `Merge Gate`가 최신 상태와 일치하는가
- [ ] 브랜치명이 `feature/fe-<slice>`인가
- [ ] 커밋이 Conventional Commits를 따르는가

### 완료 기준

`pnpm verify:frontend` 통과 + 필요한 real DB/bootstrap smoke 완료 + required exploratory QA/eval evidence 확보 → push → required CI green → Draft 해제 → Ready for Review

### PR 본문 완료 요약 (PR ## Summary, ## Workpack/Slice 섹션에 작성)

```
## Workpack / Slice
- 관련 workpack: `docs/workpacks/<slice>/README.md`
- 변경 범위: 프론트엔드 구현

## Summary
- 구현 화면: <목록>
- UI 상태: loading ✅ / empty ✅ / error ✅ / read-only ✅ / unauthorized ✅
- 로그인 게이트: 있음 / 없음
- Design Status: pending-review / confirmed 유지
- QA: Layer 1 결과 + exploratory 보고서 경로 + qa eval 결과
- 주요 결정 사항: <임시 UI 구조 선택 이유 등>
```

---

## Stage 5: 디자인 리뷰

**담당: Claude**

### 트리거 조건

- **기본**: 신규 화면 또는 high-risk UI change에서 workpack README의 Design Status가 `pending-review` 상태
- **예외 1**: `temporary` 상태에서 명시적 요청이 있으면 기능 검토(5개 UI 상태·화면정의서 일치)만 수행, 스타일 리뷰 제외
- **예외 2**: 기존 confirmed 화면의 low-risk UI change는 Stage 5를 생략하고 Stage 6에서 lightweight design check로 흡수할 수 있다
- Figma URL은 트리거가 아닌 **추가 컨텍스트** — 제공되면 리뷰 시 참조

> Stage 5는 **구현된 코드** 리뷰다. design-critic(Stage 1 설계 문서 리뷰)과 다르며,
> Tailwind 클래스·토큰 사용·컴포넌트 구조의 코드 수준 검토를 담당한다.

### 리뷰 범위 (Design Status와 변경 강도에 따라)

- `pending-review` (기본): In Scope의 각 FE 화면마다 spacing·typography·color hierarchy·공용 컴포넌트 일관성·Tailwind 클래스·접근성 기본 요소(aria, focus, contrast) + 5개 UI 상태·화면정의서 일치
- `temporary` (예외·명시적 요청): 기능 동작·5개 UI 상태 존재·화면정의서 기준 필수 요소 누락 여부만 검토
- `confirmed` 유지 대상의 low-risk UI change: token 사용, spacing drift, loading/empty/error/read-only 회귀 여부만 점검

### 읽을 것 (이 순서로)

1. `docs/workpacks/<slice>/README.md` — Design Status 확인
2. `docs/화면정의서-v1.2.md` — 해당 화면 정의
3. `docs/design/design-tokens.md` — 확정 토큰 기준 (색상·간격·컴포넌트 규칙)
4. In Scope의 각 FE 화면마다 `ui/designs/<SCREEN_ID>.md` — 신규 화면 또는 high-risk UI change인 경우 Stage 1에서 생성된 화면 설계 와이어프레임 (필수)
5. 현재 컴포넌트 코드
6. exploratory QA report / eval result (있는 경우)
7. Figma 디자인 컨텍스트 (URL 있는 경우, 추가 컨텍스트)

### 산출물

- 디자인 피드백 (구체적 수정 위치·파일명·라인 포함)
- Tailwind 클래스 교체 제안 (컴포넌트 구조 변경은 Codex와 협의)
- workpack README Design Status 업데이트 (`confirmed`으로 변경 가능 시)

### 완료 요약 (리뷰 종료 시 Claude가 출력)

```
## 5단계 완료: <slice-name> 디자인 리뷰

### Design Status: pending-review → confirmed / confirmed 유지
※ temporary 상태에서 명시적 요청 시: 기능 검토만 수행, 스타일 리뷰 제외
※ low-risk UI change는 confirmed 유지 + lightweight design check 가능

### 확인 항목
- 필수 UI 상태 5개: ✅/❌
- 화면정의서 일치: ✅/❌
- 공용 컴포넌트 일관성: ✅/❌ (confirmed 시만)
- 접근성 기본 요소: ✅/❌ (confirmed 시만)

### 피드백 요약
- <수정 제안 항목 (파일명·위치 포함)>

### 다음 단계
→ 6단계(Claude): 프론트엔드 PR 리뷰
→ 사전 조건: required CI green + Draft 해제
```

---

## Stage 6: 프론트엔드 PR 리뷰

**담당: Claude**

### 사전 조건 (3가지 모두 충족 시에만 시작)

- PR이 Draft 상태가 아님
- required CI 워크플로가 모두 green
- `docs/workpacks/<slice>/README.md`와 `acceptance.md`가 존재함

### 읽을 것 (이 순서로)

1. `docs/workpacks/<slice>/README.md` — Design Status, Frontend Delivery Mode, Key Rules
2. `docs/workpacks/<slice>/acceptance.md` — 체크리스트 전체
3. exploratory QA report / eval result (해당 시)
4. `AGENTS.md` Review Checks 섹션
5. PR diff 코드

### 리뷰 깊이 (Design Status에 따라)

- `temporary`: 기능 동작·5개 UI 상태·상태 전이·권한 게이트
- `confirmed`: 위 + spacing·hierarchy·공용 컴포넌트·Tailwind 일관성
- `confirmed` 유지의 low-risk UI change: 기능 동작 + token/spacing drift + 핵심 상태 UI 회귀

### 리뷰 항목 (전부 확인)

- [ ] 5개 UI 상태(`loading / empty / error / read-only / unauthorized`)가 모두 존재하는가
- [ ] 백엔드 계약 타입이 그대로 소비되었는가 (임의 변경 없음)
- [ ] 상태 전이 로직이 테스트로 고정되었는가
- [ ] 로그인 게이트·return-to-action이 올바른가 (해당 시)
- [ ] acceptance에서 `Manual Only`를 제외한 In Scope 미체크 항목이 없는가
- [ ] Layer 1 deterministic gate와 real DB/bootstrap smoke evidence가 PR에 남아 있는가
- [ ] exploratory QA가 required인 변경이면 report와 qa eval 결과가 있고, 주요 finding이 처리되었거나 근거와 함께 남아 있는가
- [ ] 브랜치·커밋·PR 본문이 규칙을 만족하는가
- [ ] 보안/성능/디자인 영향이 PR 템플릿에 기록되었는가
- [ ] README `Delivery Checklist`, roadmap status, Design Status, acceptance가 서로 일치하는가
- [ ] PR 본문 `Actual Verification`, `Closeout Sync`, `Merge Gate`가 최종 merge 상태를 반영하는가

### 완료 기준

수정 요청 없이 승인 + current head 기준 started PR checks 전체 green 확인 → merge.
**merge 시 `docs/workpacks/README.md` Slice Order의 해당 슬라이스 Status를 `in-progress` → `merged`로 변경한다** (이 PR에 포함).

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
