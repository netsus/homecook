# Workflow V2 Presets

## Purpose

preset은 작업마다 같은 절차를 강제하지 않기 위한 기본 경로다.
작업 시작 시 `change_type + risk + surface`를 보고 preset 하나를 고른다.

## Preset Matrix

| Preset | Use For | Plan Loop | Review Loop | External Smoke | Branch/PR Path | Typical Lead |
|--------|---------|-----------|-------------|----------------|----------------|--------------|
| `vertical-slice-strict` | 새 vertical slice, contract-heavy product work | required | required | conditional-required | backend/fe split + Draft PR | Codex implementation, Claude supervision |
| `vertical-slice-light` | 작은 fullstack product change, contract stable | recommended | required | conditional | single feature/fix branch + Draft PR | Codex |
| `bugfix-patch` | post-merge bugfix, regression fix | optional | recommended | conditional | `fix/<item>` short PR | Codex |
| `ui-polish` | spacing, copy, token swap, low-risk UX polish | optional | conditional | skipped by default | `fix/` or `feature/` short PR | Codex |
| `infra-governance` | workflow, docs/engineering, CI policy, repo automation | required | required | skipped unless external service touched | `docs/`, `chore/`, or `refactor/` PR | Codex |
| `docs-only` | low-risk docs clarification | skipped | optional | skipped | small docs PR | Codex or Claude depending on repo policy |

## Preset Rules

### `vertical-slice-strict`

- 현재 v1 slice workflow와 가장 가깝다.
- workpack 문서와 acceptance가 있어야 한다.
- plan loop와 review loop를 모두 실행한다.
- backend/fe 분리를 기본값으로 둔다.
- external integration이 있으면 smoke checklist를 필수로 붙인다.

### `vertical-slice-light`

- contract가 이미 안정적인 작은 product 작업용이다.
- work item은 필요하지만 full stage split은 강제하지 않는다.
- branch는 하나로 갈 수 있다.
- Claude 리뷰는 유지하되 design/code review를 합칠 수 있다.

### `bugfix-patch`

- 운영 중 발견된 회귀 버그나 post-merge fix에 사용한다.
- 문제 재현 테스트가 최우선이다.
- full workpack 대신 짧은 work item + 관련 source refs를 사용한다.
- auth/payment 같은 외부 연동이면 smoke checklist를 붙인다.

### `ui-polish`

- 레이아웃, spacing, token swap, copy change처럼 low-risk UI에 사용한다.
- 기존 confirmed 화면이면 design 산출물을 생략할 수 있다.
- 접근성이나 interaction model이 바뀌면 이 preset을 쓰지 않는다.

### `infra-governance`

- workflow, PR gate, schema, docs/engineering, CI policy 변경용이다.
- reusable system 문서와 validation artifact를 남겨야 한다.
- 사람에게 보이는 절차와 기계가 읽는 schema를 함께 갱신하는 것을 권장한다.

### `docs-only`

- 리스크가 낮은 설명 보강, 오탈자, 링크 보정에 사용한다.
- product contract를 바꾸면 이 preset을 쓰지 않는다.

## Preset Selection Heuristics

- 권한/상태 전이/API 계약을 바꾸면 `vertical-slice-strict` 또는 `vertical-slice-light`
- 외부 서비스 장애 재현/복구 fix면 `bugfix-patch`
- CSS token, spacing, copy만 바꾸면 `ui-polish`
- workflow/automation 문서와 script면 `infra-governance`
- 설명만 바꾸면 `docs-only`

## Homecook Default Recommendations

- 새 슬라이스 착수: `vertical-slice-strict`
- slice retrofit의 작은 후속 수정: `bugfix-patch`
- workflow v2 자체 구축: `infra-governance`
- 디자인 미세 수정: `ui-polish`
