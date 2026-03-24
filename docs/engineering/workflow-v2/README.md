# Workflow V2

## Status

- 현재 기본 운영 경로:
  - product slice: `docs/engineering/slice-workflow.md`
  - change-type gate: `docs/engineering/agent-workflow-overview.md`
- 이 디렉터리의 역할:
  - reusable workflow v2 설계와 파일럿
  - 현재 v1을 즉시 대체하지 않는 next-generation path
- 승격 전 규칙:
  - v2 문서는 `workflow-v2`를 명시적으로 대상으로 한 engineering 작업에서만 직접적인 source of truth다.
  - 일반 product slice 구현은 계속 v1 절차를 따른다.

## Why

v1은 문서 정합성, 계약 안정성, PR 추적성을 크게 개선했다.
반면 handoff 비용, 상태 관리 중복, GitHub 상태와 review 의미의 불일치, 다른 프로젝트로의 재사용 어려움이 남아 있다.

v2는 이 문제를 풀기 위해 다음을 추가한다.

- workflow core와 project profile 분리
- preset 기반 경로 선택
- Claude-Codex dual-approval loop의 공식화
- machine-readable 상태 파일
- external dependency smoke check의 명시화

## Reading Order

1. [charter.md](./charter.md)
2. [core.md](./core.md)
3. [presets.md](./presets.md)
4. [approval-and-loops.md](./approval-and-loops.md)
5. [TEMPLATE.md](./profiles/TEMPLATE.md)
6. [homecook.md](./profiles/homecook.md)
7. [migration.md](./migration.md)

## Directory Map

- [.workflow-v2/README.md](../../../.workflow-v2/README.md): 실제 pilot 상태 저장 위치
- [charter.md](./charter.md): v2가 해결할 문제, 유지할 원칙, 비범위
- [core.md](./core.md): 공통 개념, 책임, lifecycle
- [presets.md](./presets.md): 작업 유형별 기본 경로
- [approval-and-loops.md](./approval-and-loops.md): plan/review loop와 dual-approval 규칙
- [profiles/TEMPLATE.md](./profiles/TEMPLATE.md): 다른 프로젝트용 profile template
- [profiles/homecook.md](./profiles/homecook.md): 현재 저장소에 적용되는 profile
- [schemas/work-item.schema.json](./schemas/work-item.schema.json): work item 메타데이터 스키마
- [schemas/workflow-status.schema.json](./schemas/workflow-status.schema.json): 상태 보드 스키마
- [templates/work-item.example.json](./templates/work-item.example.json): 예시 work item
- [templates/workflow-status.example.json](./templates/workflow-status.example.json): 예시 상태 보드
- [migration.md](./migration.md): v1 -> v2 점진 전환 경로

## Adoption Rules

- v2는 big bang 전환이 아니라 파일럿으로 도입한다.
- `workflow-v2` 관련 첫 단계는 문서와 schema를 고정하는 것이다.
- 실제 pilot 운영 상태는 저장소 루트의 `.workflow-v2/` 아래 JSON으로 기록한다.
- machine-readable 파일이 들어와도 README 표를 즉시 제거하지 않는다.
- v2 승격 전까지는 product slice merge gate를 v1 기준으로 계속 유지한다.

## Immediate Scope

- v2 charter/core/profile/preset/loop 문서화
- JSON schema와 예시 파일 추가
- `validate:workflow-v2` 최소 validator 추가
- 현재 entry-point 문서에서 v2 pilot 경로를 발견 가능하게 연결

## Pilot Usage

1. `.workflow-v2/work-items/<id>.json`을 만든다.
2. `.workflow-v2/status.json`에 같은 `id`의 status item을 추가한다.
3. 작업 브랜치와 preset, required checks를 status에 기록한다.
4. PR 본문의 `## Workpack / Slice`에 `workflow v2 work item` 경로를 적는다.
5. `pnpm validate:workflow-v2`를 통과시킨다.
6. medium/high risk 작업이면 plan loop와 review loop summary artifact를 함께 남긴다.

## Not Yet Included

- GitHub Actions의 전면 재구성
- README 자동 생성
- v1 slice status 표의 자동 동기화
- preset 기반 branch/PR gate의 강제 실행
