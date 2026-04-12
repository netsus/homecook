# Slice: <slice-name>

## Goal
이 슬라이스가 끝났을 때 사용자가 얻게 되는 가치와 구현 목표를 2~4문장으로 적는다.

## Branches

- 백엔드: `feature/be-<slice-name>`
- 프론트엔드: `feature/fe-<slice-name>`

## In Scope
- 화면:
- API:
- 상태 전이:
- DB 영향: (이 슬라이스가 건드리는 테이블 목록)
- Schema Change:
  - [ ] 없음 (읽기 전용)
  - [ ] 있음 → `supabase/migrations/<파일명>.sql` 생성 필요

## Out of Scope
- 이번 슬라이스에서 의도적으로 제외하는 항목

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `NN-slice-name` | merged / in-progress / planned | [ ] |

> 모든 선행 슬라이스가 `merged` 상태가 아니면 이 슬라이스를 시작하지 않는다.

## Backend First Contract
- request body / query / path 파라미터
- response `{ success, data, error }`
- 권한 / 소유자 검증 / 상태 전이 / 멱등성

## Frontend Delivery Mode
- 디자인 확정 전: 기능 가능한 임시 UI
- 필수 상태: `loading / empty / error / read-only / unauthorized`
- 로그인 보호 액션이면 return-to-action 포함

## Design Authority
- UI risk: `low-risk` / `new-screen` / `high-risk` / `anchor-extension`
- Anchor screen dependency: 없음 / `HOME` / `RECIPE_DETAIL` / `PLANNER_WEEK`
- Visual artifact: Figma frame URL 또는 screenshot evidence 경로
- Authority status: `not-required` / `required` / `reviewed`
- Notes:

## Design Status

- [ ] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [ ] 확정 (confirmed) — Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과, Tailwind/공용 컴포넌트 정리 완료, authority blocker 0개
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

> Design Status 전이: `temporary` (Stage 1 기본값)
>   → `pending-review` (Stage 4 완료 후)
>   → `confirmed` (Stage 5 public review 통과 후, authority-required면 final authority gate 통과 후)
> BE-only 슬라이스: `N/A` 선택, Stage 4~6 스킵, Stage 3 merge 시 슬라이스 종료
> 신규 화면 / high-risk / anchor-extension은 `confirmed` 전에 authority review 근거가 필요하다.

## Source Links
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- 관련 공식 문서 경로
- 필요한 경우에만 관련 wireframe 1~2개

## QA / Test Data Plan
- fixture baseline / auth override / fault injection
- real DB smoke 경로 (`pnpm dev:demo`, `pnpm dev:local-supabase`, seed script 등)
- seed / reset 명령
- bootstrap이 생성해야 하는 시스템 row / 기본 데이터
- blocker 조건 (예: referenced table 부재, bootstrap 미완료)

## Key Rules
- 이 슬라이스에서 반드시 지켜야 하는 정책과 상태 전이
- read-only, 권한, 멱등성, 예외 처리 규칙

## Contract Evolution Candidates (Optional)
- 공식 문서에는 없지만 사용자 승인 시 더 나은 제품/API 계약이 될 수 있는 후보가 있으면 적는다
- 각 후보는 `현재 계약 / 제안 계약 / 기대 사용자 가치 / 영향 문서 / 승인 상태`를 남긴다
- 승인 전에는 In Scope, Backend First Contract, acceptance 기준에 포함하지 않는다

## Primary User Path
1. 사용자의 시작 화면
2. 주요 액션
3. 결과 화면 또는 상태 변화

## Delivery Checklist
> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> Stage 2/3에서는 백엔드 관련 항목을, Stage 4~6에서는 남은 프론트/QA/디자인/closeout 항목을 닫는다.
> Stage 6 merge 시점에는 In Scope인데도 남아 있는 unchecked 항목이 없어야 하며, `N/A` 또는 후속 분리는 README/PR 본문에 근거를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.
> Claude가 Codex rebuttal을 받아들인 checklist는 checkbox를 바꾸지 않고 `waived=true;waived_by=claude;waived_stage=<3|5|6>;waived_reason=<slug>` metadata를 추가해 닫는다.

- [ ] 백엔드 계약 고정 <!-- omo:id=delivery-backend-contract;stage=2;scope=backend;review=3,6 -->
- [ ] API 또는 adapter 연결 <!-- omo:id=delivery-api-adapter;stage=2;scope=backend;review=3,6 -->
- [ ] 타입 반영 <!-- omo:id=delivery-types;stage=2;scope=shared;review=3,6 -->
- [ ] UI 연결 <!-- omo:id=delivery-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [ ] 상태 전이 / 권한 / 멱등성 테스트 <!-- omo:id=delivery-state-policy-tests;stage=2;scope=shared;review=3,6 -->
- [ ] 이 슬라이스의 `Vitest` / `Playwright` 자동화 범위 구분 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [ ] fixture와 real DB smoke 경로 구분 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [ ] seed / bootstrap / system row 준비 여부 점검 <!-- omo:id=delivery-bootstrap-readiness;stage=2;scope=shared;review=3,6 -->
- [ ] `loading / empty / error / read-only` 상태 점검 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
