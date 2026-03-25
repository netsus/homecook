# Workflow V2 Core

## Core Idea

v2는 `workflow core + project profile + preset + loops + verification`의 조합이다.

- `workflow core`: 어떤 프로젝트에도 공통으로 쓰는 개념과 상태
- `project profile`: 프로젝트별 source of truth, 도메인 규칙, 기본 검증
- `preset`: 작업 유형별 기본 경로
- `loops`: Claude-Codex 수렴 규칙
- `verification`: 테스트, CI, smoke check

## Core Objects

### Work Item

작업 하나를 machine-readable하게 표현하는 최소 단위다.

필수 정보:

- 작업 ID
- 제목/목표
- project profile
- change type
- risk
- preset
- 담당 ownership
- 관련 문서
- verification command
- 상태

### Project Profile

특정 저장소에만 적용되는 규칙 묶음이다.

예:

- source of truth 문서
- API envelope
- domain invariants
- 필수 UI 상태
- 기본 smoke checklist
- 기본 verify command

### Preset

작업 유형별 기본 경로다.

예:

- `vertical-slice-strict`
- `vertical-slice-light`
- `bugfix-patch`
- `ui-polish`
- `infra-governance`
- `docs-only`

## Classification Dimensions

### Change Type

- `product`
- `bugfix`
- `ui-polish`
- `infra-governance`
- `docs-only`

### Risk

- `low`
- `medium`
- `high`
- `critical`

### Surface

- `backend`
- `frontend`
- `fullstack`
- `workflow`
- `external-integration`

## Ownership Model

- `Claude`: 감독자, 비판적 리뷰어, 최종 승인 참여자
- `Codex`: 주 구현자, 상태 갱신자, verification 실행자
- `Workers`: 제한된 역할 수행자. bounded scope만 맡는다.

### Single Writer Rule

- authoritative artifact는 한 시점에 한 agent만 수정한다.
- 문서/코드/work item/status 파일을 여러 agent가 동시에 편집하지 않는다.
- worker는 직접 merge-ready 상태를 선언하지 않는다.

## Default Lifecycle

1. 작업 분류
2. work item 생성
3. project profile 연결
4. preset 선택
5. plan loop 실행 여부 결정
6. 구현
7. 정식 stage review 또는 exceptional recovery 여부 결정
8. external smoke 필요 여부 확인
9. PR/CI/merge

## Escalation Rules

- blocker가 나오면 자동 루프를 중단하고 사람에게 넘긴다.
- 같은 필수 수정 이슈가 반복되면 `stalled`로 종료한다.
- external integration smoke가 실패하면 코드 green만으로 merge하지 않는다.

## Default Mapping

### 현재 저장소 기준

- 새 vertical slice: `vertical-slice-strict`
- 문서/자동화 정책 변경: `infra-governance`
- 작은 UX 조정: `ui-polish`
- post-merge 기능 버그 수정: `bugfix-patch`

v2가 정식 승격되기 전까지는 이 매핑이 참고 기준이며, 실제 product slice merge gate는 v1을 따른다.
