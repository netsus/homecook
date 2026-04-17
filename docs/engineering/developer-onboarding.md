# Developer Onboarding

## 목적

이 문서는 새로 합류한 개발자가 **Homecook의 제품 구조, 문서 구조, 개발 워크플로우, OMO 운영 방식**을 한 번에 이해하도록 돕는 입문서다.

이 문서를 다 읽고 나면 최소한 아래를 바로 설명할 수 있어야 한다.

- 이 저장소에서 무엇이 **공식 기준 문서**인지
- 제품 기능 작업과 engineering/workflow 작업이 어떻게 다른지
- 어떤 문서를 먼저 읽고, 어떤 브랜치에서 작업을 시작해야 하는지
- OMO v2가 무엇을 담당하고, `slice-workflow.md` / `agent-workflow-overview.md`와 어떻게 역할을 나누는지

## 10분 개념 지도

### 1. 이 저장소는 무엇을 만드는가

- 제품: 개인 집밥 관리 서비스
- 핵심 화면 축:
  - `HOME`
  - `RECIPE_DETAIL`
  - `PLANNER_WEEK`
  - 장보기 / 팬트리 / 요리 / 마이페이지
- 기술 스택:
  - `Next.js 15`
  - `React 19`
  - `TypeScript`
  - `Tailwind CSS 4`
  - `Zustand`
  - `Supabase`
  - `Vitest`
  - `Playwright`

### 2. 이 저장소의 가장 중요한 원칙

- **공식 문서가 구현보다 우선**이다.
- 기능은 화면 하나가 아니라 **세로 슬라이스(workpack)** 단위로 닫는다.
- 브랜치/PR은 **작고 명확한 의도 하나**만 담는다.
- merge 판단은 “required check만”이 아니라 **current head 기준으로 시작된 전체 check green**이다.
- OMO가 기본 운영 경로가 되었어도, **제품 계약은 여전히 공식 문서 + `AGENTS.md`가 우선**이다.

### 3. 아키텍처를 한 문장으로

Homecook은 **공식 문서가 제품 계약을 잠그고**, **workpack이 구현 단위를 쪼개며**, **OMO v2가 상태 추적 / 자동 진행 / closeout / smoke / scheduler를 운영**하는 구조다.

## 저장소 구조 한눈에

| 위치 | 역할 | 초보자가 이해해야 할 것 |
|---|---|---|
| `app/` | Next.js App Router 진입점 | route/page/api가 어디서 시작되는지 본다 |
| `components/` | 화면/공용 UI | 실제 렌더링 로직은 여기서 가장 많이 본다 |
| `lib/` | API 호출, auth, planner, server helper, mock | UI 바깥의 비즈니스 보조 로직이 모인다 |
| `stores/` | Zustand 상태 | 전역 UI 상태/필터/인증 게이트 상태를 확인한다 |
| `supabase/` | migration과 로컬 DB 자원 | schema와 seed 기반의 실제 저장소 영향 지점이다 |
| `tests/` | Vitest / Playwright | 회귀 테스트와 QA baseline이 모여 있다 |
| `docs/sync/` | 공식 문서 버전 인덱스 | 어떤 문서 버전이 현재 기준인지 여기서 본다 |
| `docs/workpacks/` | 제품 기능 로드맵 + slice 정의 | “무엇을 어떤 순서로 구현하는가”를 본다 |
| `docs/engineering/` | 개발 시스템 / 운영 규칙 | 브랜치, QA, slice 단계, workflow-v2 규칙이 있다 |
| `.workflow-v2/` | work item / tracked state / promotion ledger | OMO가 읽는 machine-readable 운영 상태다 |
| `.opencode/` | provider/runtime 운영 메모 | OMO provider, runtime, scheduler 운영 정보가 있다 |
| `.artifacts/` | 실행/감사/QA 결과물 | OMO stage, audit, qa evidence가 남는다 |

## 가장 먼저 읽을 문서

순서는 이대로 보는 게 제일 빠르다.

1. [AGENTS.md](/Users/cwj/01_vibe_coding/homecook/AGENTS.md)
2. [CURRENT_SOURCE_OF_TRUTH.md](/Users/cwj/01_vibe_coding/homecook/docs/sync/CURRENT_SOURCE_OF_TRUTH.md)
3. [docs/workpacks/README.md](/Users/cwj/01_vibe_coding/homecook/docs/workpacks/README.md)
4. 관련 workpack `README.md` / `acceptance.md`
5. [agent-workflow-overview.md](/Users/cwj/01_vibe_coding/homecook/docs/engineering/agent-workflow-overview.md)
6. [slice-workflow.md](/Users/cwj/01_vibe_coding/homecook/docs/engineering/slice-workflow.md)
7. [workflow-v2/README.md](/Users/cwj/01_vibe_coding/homecook/docs/engineering/workflow-v2/README.md)
8. [qa-system.md](/Users/cwj/01_vibe_coding/homecook/docs/engineering/qa-system.md)
9. [git-workflow.md](/Users/cwj/01_vibe_coding/homecook/docs/engineering/git-workflow.md)

### 왜 이 순서인가

- `AGENTS.md`: 전역 규칙과 금지사항
- `CURRENT_SOURCE_OF_TRUTH.md`: 현재 공식 문서 버전
- `docs/workpacks/README.md`: 무엇을 어떤 순서로 구현하는지
- workpack 문서: 지금 내가 만지는 기능의 scope
- `agent-workflow-overview.md` / `slice-workflow.md`: 실제 작업 절차
- `workflow-v2/README.md`: OMO 기본 운영 구조
- `qa-system.md`: 테스트와 QA 증거를 어떻게 남기는지
- `git-workflow.md`: 브랜치/커밋/PR 규칙

## 제품 아키텍처 이해하기

### 공식 계약 레이어

아래 5개가 제품 계약의 중심이다.

- 요구사항: `docs/요구사항기준선-*`
- 화면 정의: `docs/화면정의서-*`
- 유저 플로우: `docs/유저flow맵-*`
- DB 설계: `docs/db설계-*`
- API 문서: `docs/api문서-*`

현재 활성 버전은 [CURRENT_SOURCE_OF_TRUTH.md](/Users/cwj/01_vibe_coding/homecook/docs/sync/CURRENT_SOURCE_OF_TRUTH.md)에서 본다.

### 구현 레이어

- `app/`: 라우트와 API 진입
- `components/`: 화면과 공용 UI
- `lib/`: API helper, business helper, server helper
- `stores/`: 전역 상태
- `supabase/migrations/`: 스키마 변경

### UI 앵커 화면

이 저장소에서 변경 영향이 큰 anchor 화면은 보통 아래다.

- `HOME`
- `RECIPE_DETAIL`
- `PLANNER_WEEK`

이 화면들은 단순 UI polish로 끝나지 않고, design authority / evidence / QA / slice 영향이 같이 따라온다.

## 개발 시스템 이해하기

### 1. 제품 기능은 workpack 단위로 진행

- 제품 구현 단위는 화면 1개가 아니라 **slice / workpack**
- 각 slice는 `docs/workpacks/<slice>/README.md`와 `acceptance.md`를 가진다
- 보통 백엔드와 프론트엔드 브랜치를 나눠서 닫는다

예:

- `feature/be-06-recipe-to-planner`
- `feature/fe-06-recipe-to-planner`

### 2. slice 단계 담당

현재 product slice의 stage mechanics는 여전히 [slice-workflow.md](/Users/cwj/01_vibe_coding/homecook/docs/engineering/slice-workflow.md)가 담당한다.

| Stage | 담당 | 의미 |
|---|---|---|
| 1 | Claude | workpack docs 작성 |
| 2 | Codex | 백엔드 구현 |
| 3 | Claude | 백엔드 리뷰 |
| 4 | Claude | 프론트 구현 |
| 5 | Codex | 디자인 리뷰 |
| 6 | Codex | 프론트 PR 리뷰 / closeout |

즉, **OMO v2가 기본 운영 경로**가 되었어도, slice 단계 책임표 자체는 그대로 유지된다.

### 3. 변경 유형별 게이트

[agent-workflow-overview.md](/Users/cwj/01_vibe_coding/homecook/docs/engineering/agent-workflow-overview.md)가 아래를 결정한다.

- `product-backend`
- `product-frontend`
- `docs-governance`
- `low-risk docs/config`
- `contract-evolution`

여기서 보는 것:

- required checks
- optional reviews
- `N/A` 허용 기준
- merge 직전 무엇을 다시 확인하는지

### 4. OMO v2는 무엇을 담당하나

[workflow-v2/README.md](/Users/cwj/01_vibe_coding/homecook/docs/engineering/workflow-v2/README.md)는 이제 **기본 운영 entry docs**다.

OMO가 맡는 것:

- work item / tracked state
- runtime state
- stage dispatch / supervise / tick / reconcile
- closeout bookkeeping
- promotion ledger
- smoke / scheduler 운영

OMO가 직접 대체하지 않는 것:

- 공식 제품 계약
- slice 단계별 actor 책임표
- change-type gate 자체

즉 정리하면:

- **제품 계약/단계 규칙**: `AGENTS.md`, 공식 문서, `slice-workflow.md`, `agent-workflow-overview.md`
- **운영 엔진/상태 추적**: OMO v2 (`.workflow-v2/`, `.opencode/`, `pnpm omo:*`)

## 새 작업을 받을 때 실제 순서

### 제품 기능 작업

1. `AGENTS.md`
2. `CURRENT_SOURCE_OF_TRUTH.md`
3. `docs/workpacks/README.md`
4. 해당 slice workpack `README.md` + `acceptance.md`
5. 변경 유형 파악
6. `pnpm branch:start ...`
7. 테스트 전략 확인
8. 구현
9. required checks
10. PR / closeout / merge gate 확인

### engineering / workflow 작업

1. `AGENTS.md`
2. 관련 `docs/engineering/*.md`
3. `workflow-v2/README.md` 및 관련 spec
4. 변경 유형(`docs-governance`, `infra-governance` 성격) 확인
5. `pnpm branch:start ...`
6. validator / targeted tests
7. PR

## 자주 쓰는 명령어

### 개발 서버

```bash
pnpm dev
pnpm dev:demo
pnpm dev:local-supabase
pnpm dev:qa-fixtures
```

### 검증

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e:smoke
pnpm verify:backend
pnpm verify:frontend
pnpm validate:workflow-v2
pnpm validate:closeout-sync
pnpm validate:authority-evidence-presence
pnpm validate:exploratory-qa-evidence
pnpm validate:real-smoke-presence
```

### 브랜치 / Git

```bash
pnpm branch:start -- --branch <name>
pnpm branch:start -- --slice <slice> --role docs
pnpm branch:start -- --slice <slice> --role be
pnpm branch:start -- --slice <slice> --role fe
pnpm branch:status
pnpm branch:clear
```

### OMO

```bash
pnpm omo:status:brief -- --work-item <id>
pnpm omo:supervise -- --work-item <id>
pnpm omo:tick -- --all
pnpm omo:reconcile -- --work-item <id>
pnpm omo:promotion:update -- --section <...>
```

## 초보자가 자주 헷갈리는 포인트

### 1. “v1이냐 v2냐?”

- 제품 계약은 계속 공식 문서가 우선
- 운영 엔진은 OMO v2가 기본
- slice 단계 책임은 `slice-workflow.md` / `agent-workflow-overview.md`가 계속 담당

즉 **둘 중 하나만 고르는 구조가 아니다.**

### 2. “master에서 바로 작업해도 되나?”

안 된다.

- 항상 작업 브랜치에서 시작
- 수정 전 `pnpm branch:start ...`

### 3. “wireframe이 공식인가?”

아니다.

- wireframe은 참고 자료
- 공식 기준은 `CURRENT_SOURCE_OF_TRUTH.md`에 적힌 문서 버전

### 4. “테스트가 green이면 바로 merge?”

아니다.

- current head 기준으로 시작된 **전체 PR checks**가 green이어야 한다
- closeout / Actual Verification / Merge Gate 섹션도 최신이어야 한다

### 5. “OMO가 다 해주면 문서는 덜 봐도 되나?”

아니다.

- OMO는 운영 레이어
- 문서 우선 원칙은 그대로다

## 첫 주 추천 루트

### 1일차

- 이 문서 읽기
- `AGENTS.md`
- `CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/engineering/agent-workflow-overview.md`
- `docs/engineering/slice-workflow.md`

### 2일차

- 이미 merge된 slice 하나 고르기
  - `03-recipe-like`
  - `04-recipe-save`
  - `06-recipe-to-planner`
- 해당 workpack docs와 구현 파일을 같이 읽기
- 관련 테스트를 한 번 직접 실행해보기

### 3일차

- 작은 `fix/` 또는 `docs/` 작업 하나 수행
- 브랜치 시작 → 수정 → 검증 → PR 본문 작성까지 경험하기

## 추천 읽기 묶음

### 제품 기능을 만질 때

- [CURRENT_SOURCE_OF_TRUTH.md](/Users/cwj/01_vibe_coding/homecook/docs/sync/CURRENT_SOURCE_OF_TRUTH.md)
- [docs/workpacks/README.md](/Users/cwj/01_vibe_coding/homecook/docs/workpacks/README.md)
- [slice-workflow.md](/Users/cwj/01_vibe_coding/homecook/docs/engineering/slice-workflow.md)
- [agent-workflow-overview.md](/Users/cwj/01_vibe_coding/homecook/docs/engineering/agent-workflow-overview.md)
- [qa-system.md](/Users/cwj/01_vibe_coding/homecook/docs/engineering/qa-system.md)

### OMO / 운영 시스템을 이해할 때

- [workflow-v2/README.md](/Users/cwj/01_vibe_coding/homecook/docs/engineering/workflow-v2/README.md)
- [promotion-readiness.md](/Users/cwj/01_vibe_coding/homecook/docs/engineering/workflow-v2/promotion-readiness.md)
- [omo-base.md](/Users/cwj/01_vibe_coding/homecook/docs/engineering/workflow-v2/omo-base.md)
- [profiles/homecook.md](/Users/cwj/01_vibe_coding/homecook/docs/engineering/workflow-v2/profiles/homecook.md)
- [bookkeeping-authority-matrix.md](/Users/cwj/01_vibe_coding/homecook/docs/engineering/bookkeeping-authority-matrix.md)

## 한 줄 요약

이 저장소는 **공식 문서가 제품 계약을 잠그고**, **workpack이 구현 단위를 자르고**, **OMO v2가 그 작업을 운영하고 추적하는 구조**다.
