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

## QA / Test Data Plan
- 기본 검증 모드: `fixture` / `seeded-db` / `mixed`
- 최소 재현 상태: `happy / empty / unauthorized / error / conflict(read-only 포함) / other-user(해당 시)`
- 어떤 상태를 어떤 데이터 모드로 재현하는지
- setup / reset 방법 (명령, helper, env, SQL seed 등)
- live/external 의존 시 manual-only 또는 opt-in 분리 근거

## Design Status

- [ ] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료, Claude Stage 5 디자인 리뷰 필요
- [ ] 확정 (confirmed) — Stage 5 리뷰 통과, Tailwind/공용 컴포넌트 정리 완료
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

> Design Status 전이: `temporary` (Stage 1 기본값)
>   → `pending-review` (Stage 4 완료, Codex가 변경)
>   → `confirmed` (Stage 5 리뷰 통과, Claude가 변경)
> BE-only 슬라이스: `N/A` 선택, Stage 4~6 스킵, Stage 3 merge 시 슬라이스 종료

## Source Links
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- 관련 공식 문서 경로
- 필요한 경우에만 관련 wireframe 1~2개

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
- [ ] 백엔드 계약 고정
- [ ] API 또는 adapter 연결
- [ ] 타입 반영
- [ ] UI 연결
- [ ] 상태 전이 / 권한 / 멱등성 테스트
- [ ] 이 슬라이스의 `Vitest` / `Playwright` 자동화 범위 구분
- [ ] `QA / Test Data Plan` 작성 및 setup/reset 경로 문서화
- [ ] 구현 직후 clean reset으로 수동 QA와 exploratory QA를 시작할 수 있음
- [ ] `loading / empty / error / read-only` 상태 점검
- [ ] 테스트 에이전트 전달용 수동 QA 시나리오 정리
