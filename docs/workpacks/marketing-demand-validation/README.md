# Slice: marketing-demand-validation

## Goal
`/beta` 수요검증 랜딩으로 광고 메시지 일치, 5문항 퀴즈 반응, 결과를 이메일 전에 공개하는 neutral funnel, 그리고 제출 뒤 주간 플래너 관심을 하나의 세로 슬라이스로 검증한다. 이 슬라이스는 수요를 호기심과 분리해서 측정하기 위해 단일 route, 단일 first-party session row, 단일 API만 사용한다. Stage 1 author와 분리된 fresh Codex internal 1.5 reviewer가 `APPROVED / FINDINGS_COUNT: 0`으로 승인했다. Claude dispatch는 금지한다.

## Branches

- 문서: `docs/marketing-demand-validation`
- 백엔드: `feature/be-marketing-demand-validation`
- 프론트엔드: `feature/fe-marketing-demand-validation`

## In Scope

- 화면:
  - `/beta` isolated mobile-first landing
  - Hero / quiz / result / concept / intent / email / followup 상태
  - `/privacy`로 연결되는 공개 안내 링크
- API:
  - `POST /api/v1/marketing/validation`
- 상태 전이:
  - `view → quiz_started → quiz_completed → solution_viewed → intent_selected → lead_submitted → followup_submitted`
  - first-write-wins, 역순 전이 금지, 동일 action 재전송 멱등
- DB 영향:
  - `public.marketing_validation_sessions`
- Schema Change:
  - [ ] 없음 (읽기 전용)
  - [x] 있음 → `supabase/migrations/<timestamp>_marketing_validation_sessions.sql` 생성 필요

## Out of Scope

- 관리자 대시보드
- 로그인 / 회원가입
- 가격표 / 결제
- 후기 / social proof
- 장문 FAQ
- 영상 / 애니메이션 heavy landing
- GA / GTM / PostHog / Amplitude / Segment / Meta Pixel SDK
- 다중 테이블 이벤트 로그
- in-memory rate limiter
- 캠페인 관리자 UI
- `/beta` 외의 제품 route 재설계

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `launch-readiness-blockers` | docs | [ ] |

> `launch-readiness-blockers`의 PR1 `/privacy`·실제 운영정보, PR2 guest global GrowthToast/401 clean, PR3 security-header/CSP baseline이 끝나기 전에는 preview/production lead 수집을 열지 않는다. 실제 operator privacy data와 Turnstile site key/secret은 아직 사용자가 제공해야 하는 blocker다.

## Backend First Contract

- request body / query / path 파라미터
  - `POST /api/v1/marketing/validation`
  - discriminated `action`: `view | quiz_started | quiz_completed | solution_viewed | intent_selected | lead_submitted | followup_submitted`
  - `view`는 attribution allowlist만 허용하고 `campaign_key`·`creative_key`·`audience_key`는 서버 상수로 결정
  - `lead_submitted`는 email/consent/Turnstile만 허용
  - `honeypot`은 항상 빈 문자열이어야 함
- response `{ success, data, error }`
  - stage action 성공은 generic success
  - `lead_submission_status=accepted`와 `duplicate`는 같은 UI 결과를 반환
  - invalid transition, origin mismatch, Turnstile failure, privacy readiness missing은 fail-closed
- 권한 / 소유자 검증 / 상태 전이 / 멱등성
  - first-party session cookie `mumeok_validation_session` only
  - `view`에서 서버가 HttpOnly cookie를 발급
  - `Path=/api/v1/marketing/validation`, SameSite=Lax, 7일 만료
  - preview/staging/production은 HTTPS면 Secure=true, local HTTP만 Secure=false
  - `MARKETING_LEAD_PROTECTION_READY=1`, Turnstile secret, allowlisted hostname, edge rule evidence가 없으면 lead는 503 fail-closed
  - `view → quiz_started → quiz_completed → solution_viewed → intent_selected → lead_submitted → followup_submitted` 외 전이는 409
  - 동일 action 재전송은 first-write-wins
  - unique email만 accepted, 중복 email은 duplicate
  - raw IP, user-agent, referrer, cookie fingerprint는 저장하지 않는다

## Frontend Delivery Mode

- 디자인 확정 전: 기능 가능한 임시 UI
- 필수 상태: `loading / empty / error / read-only / unauthorized`
- 추가 상태:
  - `hero`
  - `quiz`
  - `result`
  - `concept`
  - `intent`
  - `email`
  - `followup`
- 로그인 보호 액션이 없으므로 return-to-action 대신 session 복귀만 유지한다.

## Design Authority

- UI risk: `new-screen`
- Anchor screen dependency: 없음
- Visual artifact: `ui/designs/MARKETING_DEMAND_VALIDATION.md`, `ui/designs/critiques/MARKETING_DEMAND_VALIDATION-critique.md`, `ui/designs/authority/MARKETING_DEMAND_VALIDATION-authority.md`, `ui/designs/evidence/marketing-demand-validation/`
- Authority status: `required`
- Notes:
  - `/beta`는 앱 셸이 아니라 독립 랜딩이다.
  - 결과와 해결 아이디어는 이메일 전에 보여 준다.
  - neutral CTA pair `써보고 싶어요 / 지금은 필요하지 않아요`를 유지한다.
  - design-critic은 PASS지만 authority report는 runtime evidence가 들어오기 전까지 hold 상태다.

## Design Status

- [x] 임시 UI (temporary) — Stage 1 기본값
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후
- [ ] 확정 (confirmed) — Stage 5/6 후
- [ ] N/A — BE-only 슬라이스

> Design Status 전이: `temporary → pending-review → confirmed`
> 새 화면과 turnstile/privacy gate가 있는 만큼 Stage 1에서 authority requirement를 먼저 잠근다.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.35.md`
- `docs/화면정의서-v1.5.39.md`
- `docs/유저flow맵-v1.3.37.md`
- `docs/db설계-v1.3.37.md`
- `docs/api문서-v1.2.42.md`
- `docs/workpacks/README.md`
- `docs/workpacks/launch-readiness-blockers/README.md`
- `docs/workpacks/launch-readiness-blockers/acceptance.md`
- `docs/marketing/demand-validation-plan.md`
- `docs/marketing/quiz-content-spec.md`
- `.omx/plans/mumeok-weekly-nutrition-ad-landing.md`

> Official contract-evolution tuple `v1.7.35 / v1.5.39 / v1.3.37 / v1.3.37 / v1.2.42` is complete and `docs/sync/CURRENT_SOURCE_OF_TRUTH.md` points to these full additive documents.

## QA / Test Data Plan

- fixture baseline
  - `view → quiz_started → quiz_completed → solution_viewed → intent_selected → lead_submitted → followup_submitted`
  - `satisfied_control`
  - target_qualified true / false cases
  - duplicate email generic success
  - lead failure / Turnstile reset / transition rejection
- real DB smoke
  - full-local stack에서 `public.marketing_validation_sessions` 하나만 사용
  - `/api/v1/marketing/validation` route smoke
  - `/privacy` 200 and fail-closed lead gate
- seed/reset
  - test key만 사용하고 production key는 섞지 않는다
  - full-local destructive reset은 사용하지 않는다
- bootstrap이 만들어야 하는 시스템 row / 기본 데이터
  - server-issued `mumeok_validation_session` cookie
  - `campaign_key=weekly_nutrition_2026`
  - `creative_key=weekly_nutrition_v2`
  - `audience_key` allowlist entry
- blocker 조건
  - 실제 operator privacy data 미제공
  - Turnstile secret / hostname 미제공
  - launch-readiness-blockers PR1/2/3 미완료
  - `/privacy` canonical copy 미완료

## Key Rules

- 결과는 이메일 전에 공개한다.
- `satisfied_control`은 실패가 아니라 대조군이다.
- 단일 first-party session row와 단일 route만 쓴다.
- `view`에서만 cookie를 발급하고 나머지 action은 이미 발급된 cookie를 사용한다.
- origin, privacy readiness, Turnstile readiness가 없으면 lead는 fail closed다.
- duplicate email은 generic success다.
- `target_qualified`와 `quiz_result`는 서버 pure function을 기준으로 계산한다.
- TDD: `target_qualified`, state transition, duplicate email, fail-closed readiness는 구현 전에 테스트로 잠근다.
- authority: new-screen이므로 design authority와 runtime evidence가 필요하다.
- closeout: Stage 6는 fail-closed 구현과 자동 검증을 완료하면 Manual Only blocker를 unchecked로 남긴 채 code closeout할 수 있다. 다만 operator privacy, allowlisted origin/hostname, Turnstile production key, edge-rule evidence, launch-readiness PR1/2/3가 끝나기 전에는 production lead 수집과 광고 집행을 열지 않는다.

## Contract Evolution Candidates (Optional)

- 없음. 이번 슬라이스는 승인된 단일 퍼널과 단일 테이블/route 계약만 구현 대상으로 둔다.

## Primary User Path

1. 사용자가 광고를 눌러 `/beta`에 들어온다.
2. Hero에서 광고와 같은 메시지를 본 뒤 5문항 테스트를 시작한다.
3. 결과와 해결 아이디어를 이메일 전에 확인한다.
4. `써보고 싶어요`를 선택하면 email → optional followup으로 진행한다.
5. `지금은 필요하지 않아요`를 선택하면 이메일 폼을 열지 않고 대조군 완료 안내 → done으로 끝난다.

## Delivery Checklist

> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> Stage 2/3에서는 백엔드 관련 항목을, Stage 4~6에서는 남은 프론트/QA/디자인/closeout 항목을 닫는다.
> Stage 6 merge 시점에는 In Scope인데도 남아 있는 unchecked 항목이 없어야 하며, `N/A` 또는 후속 분리는 README/PR 본문에 근거를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

- [ ] 백엔드 계약 고정: 단일 route, 단일 table, fail-closed readiness <!-- omo:id=delivery-backend-contract;stage=2;scope=backend;review=3,6 -->
- [ ] API 또는 adapter 연결: `/api/v1/marketing/validation` route + cookie/session glue <!-- omo:id=delivery-api-adapter;stage=2;scope=backend;review=3,6 -->
- [ ] 타입 반영: quiz/result/session/lead/followup shared types <!-- omo:id=delivery-types;stage=2;scope=shared;review=3,6 -->
- [ ] UI 연결: `/beta` funnel states and CTA wiring <!-- omo:id=delivery-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [ ] 상태 전이 / 권한 / 멱등성 테스트: view→followup, duplicate email, turnstile fail-closed <!-- omo:id=delivery-state-policy-tests;stage=2;scope=shared;review=3,6 -->
- [ ] 이 슬라이스의 `Vitest` / `Playwright` 자동화 범위 구분 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [ ] fixture와 real DB smoke 경로 구분 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [ ] seed / bootstrap / system row 준비 여부 점검 <!-- omo:id=delivery-bootstrap-readiness;stage=2;scope=shared;review=3,6 -->
- [ ] `loading / empty / error / read-only` 상태 점검 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
