# Slice: marketing-demand-validation-v2

## Goal

검증된 4문항·4결과 광고 퍼널을 `/beta`의 Next.js shell에 안전하게 포팅해 사용자가 결과와 전체 기록 체험을 이메일 전에 확인하게 한다. 익명 행동과 이메일 신청은 기존 단일 API·단일 session row 안의 분리된 write boundary로 측정하고, privacy·Turnstile·origin·edge·이미지 권리 준비 전에는 lead 수집을 fail-closed로 유지한다.

## Branches

- 문서: `docs/marketing-demand-validation-v2-contract`
- 백엔드: `feature/be-marketing-demand-validation-v2`
- 프론트엔드: `feature/fe-marketing-demand-validation-v2`

## In Scope

- 화면:
  - `/beta` app-owned `hero → q1..q4 → result → experience 1..5 → planner_homecook → packaged_food → planner_complete → beta_form → done`
  - Hero `a | b | c | d | default`
  - 결과 공유 Web Share API + link-copy fallback
  - `/privacy` 안내와 lead fail-closed/retry 상태
- API:
  - 기존 `POST /api/v1/marketing/validation` 하나
- 상태 전이:
  - `view → quiz_started → quiz_completed → result_viewed → experience_started → experience_completed → beta_form_viewed → lead_submitted`
  - 동일 action replay는 first-write-wins generic success, 다음 한 단계만 advance, 건너뛰기·역순은 `409 INVALID_TRANSITION`
- DB 영향:
  - 기존 `public.marketing_validation_sessions` 하나
  - nullable `ad_variant`, `result_viewed_at`, `experience_started_at`, `experience_completed_at`, `beta_form_viewed_at`
- Schema Change:
  - [ ] 없음 (읽기 전용)
  - [x] 있음 → 후속 Stage 2에서 additive local-only migration 생성 필요

## Out of Scope

- 신규 public endpoint, 신규 table/event log/RPC
- 로그인/회원가입, 관리자 화면, 가격/결제, 후기, 장문 FAQ
- GA/GTM/PostHog/Amplitude/Segment/Meta Pixel SDK
- iPhone/Pixel frame, device selector, `src/mobile/`, standalone keyboard/device/status runtime
- source Vite app/package를 Next app에 중첩 배포
- Q1/Q2/Q4 기반 새 `target_qualified` 규칙
- v1 neutral intent/followup UI와 planner followup 질문
- 제품 앱의 실제 `PLANNER_WEEK` 화면/DB를 수정하는 일
- production/remote/cloud/linked Supabase, migration apply/reset, release/tag/deploy

## Dependencies

| 선행 항목 | 상태 | 확인 |
| --- | --- | --- |
| `marketing-demand-validation` v1 | merged | [x] |
| source prototype commit `63f8ef2a019c6d260a96a42fab9d67f727d93557` | verified handoff | [x] |
| official v2 tuple contract-evolution | 이 PR | [ ] |

> `launch-readiness-blockers`, actual operator privacy facts, production Turnstile/origin/edge/retention/sender/iOS/paid-ad 승인은 Stage 2/4 로컬 구현 선행 조건이 아니라 production lead activation의 Manual Only blocker다.

## Backend First Contract

- request
  - `view`: exact `action`, 빈 `honeypot`, optional allowlisted `utm_*`, optional `ad_variant=a|b|c|d|default`
  - `quiz_started | result_viewed | experience_started | experience_completed | beta_form_viewed`: exact `{ action, honeypot: "" }`
  - `quiz_completed`: exact `answers: { q1, q2, q3, q4 }`; `q5`와 client result 금지
  - `lead_submitted`: exact `email`, `consent: true`, `turnstile_token`, 빈 `honeypot`
- response
  - wrapper `{ success, data, error }`
  - error `{ code, message, fields[] }`
  - quiz success는 server-derived `quiz_result`와 `target_qualified: null`
  - accepted/duplicate lead는 같은 generic success, PII 없음
- authorization/privacy
  - public no-login funnel, first-party HttpOnly `mumeok_validation_session`
  - browser direct Supabase write/read 금지, exact Next internal scope only
  - anonymous action은 email/consent/Turnstile을 거부하고 PII field를 쓰지 않음
  - `lead_submitted`만 `consent_version=marketing-demand-validation-v2`, server `consented_at`, Turnstile verified time 기록
  - raw email/IP/user-agent/full referrer/cookie fingerprint/Turnstile token을 URL·event·response·log에 남기지 않음
- version boundary
  - v2 `creative_key=mumeok_funnel_prototype_v2`
  - v1 cookie는 새 v2 `view`에서 새 row/cookie로 교체; historical v1 row write 금지
  - v1 action/result/followup field와 v2 의미를 implicit mapping하지 않음
- fail-closed
  - origin mismatch `403`, invalid transition `409`, validation/Turnstile `422`, readiness `503`
  - lead readiness가 닫혀도 result/experience/planner payoff는 계속 표시

## Current Runtime Gap / Public Contract Impact

| surface | current main runtime | v2 approved contract | impact |
| --- | --- | --- | --- |
| answers | `q1..q5` exact | `q1..q4` exact | request/type/parser breaking change; old payload는 v2에서 422 |
| result enum | `ingredient_reentry | rough_match | split_tracking | weekly_blindspot | satisfied_control` | `homecook-passer | eyeballing-master | ingredient-tracker | pro-measurer` | response/type/DB constraint/analysis taxonomy 변경 |
| result rule | Q3/Q4/Q5 mixed | Q3-only | server pure rule과 test 전면 교체 |
| qualification | boolean pure rule | `target_qualified=null` | 새 hidden rule 금지; 분석 SQL을 cohort conversion으로 교체 |
| actions | `view → quiz_started → quiz_completed → solution_viewed → intent_selected → lead_submitted → followup_submitted` | `view → quiz_started → quiz_completed → result_viewed → experience_started → experience_completed → beta_form_viewed → lead_submitted` | action union/state machine/timestamp 변경 |
| attribution | allowlisted `utm_*`; `ad_variant` 없음 | allowlisted `utm_*` + `ad_variant` | request/DB additive field와 Hero priority test 필요 |
| consent | `marketing-demand-validation-v1` | `marketing-demand-validation-v2` | lead evidence version bump |
| API endpoint | single POST | same single POST | path/method/count 변화 없음 |
| DB table | single session table | same single session table | table count 변화 없음; nullable columns additive |
| frontend | 5문항, concept/intent/followup | 4문항, 5단계 체험, planner payoff, beta form | high-risk Next.js port와 새 authority evidence 필요 |

근거 runtime은 `types/marketing-validation.ts`, `lib/marketing/demand-validation.ts`, `lib/server/marketing-validation.ts`, `components/marketing/marketing-demand-validation-screen.tsx`, `supabase/migrations/20260831100000_marketing_validation_sessions.sql`, `tests/demand-validation.test.ts`, `tests/marketing-validation-route.test.ts`, `tests/marketing-demand-validation-landing.test.tsx`다. 이 Stage 1은 위 gap을 문서로만 잠그며 runtime이 이미 v2라고 주장하지 않는다.

## Frontend Delivery Mode

- source prototype의 app-owned surface를 기능 가능한 Next.js UI로 포팅한다.
- 필수 상태: `loading / empty / error / read-only / unauthorized`
  - `unauthorized`: N/A — public no-login funnel
  - `empty`: stale/missing session의 새 시작 안내
  - `read-only`: lead gate가 닫혀도 결과·체험을 보는 상태
- 추가 상태: `hero / quiz / result / experience / planner_homecook / packaged_food / planner_complete / beta_form / done / validation-error / duplicate-generic-success / turnstile-fail-closed`
- session restart/retry를 recovery path로 사용한다.

## Design Authority

- UI risk: `high-risk`
- Anchor screen dependency: 없음. isolated `/beta` 안의 planner representation이며 실제 `PLANNER_WEEK` anchor를 수정하지 않는다.
- Visual artifact:
  - source prototype commit `63f8ef2a019c6d260a96a42fab9d67f727d93557`
  - `marketing/mumeok-funnel-prototype-v2/evidence/design-qa/final/`
  - `marketing/mumeok-funnel-prototype-v2/evidence/design-qa/final-v4/`
  - `marketing/mumeok-funnel-prototype-v2/evidence/design-qa/final-v5/`
  - `marketing/mumeok-funnel-prototype-v2/design-qa.md`
- Authority status: `required`
- Notes:
  - source prototype은 standalone 기준 95/100 passed지만 Next.js port의 최종 authority가 아니다.
  - latest source는 뒤로가기·결과·체험·planner·beta layout과 최종 캐릭터/영양 자산을 개선했으며 exact 4문항·4결과 계약은 유지한다.
  - iPhone/Pixel frame과 기기 선택기는 평가·배포 대상이 아니다.
  - Stage 4는 app-owned 화면만 현재 shell/accessibility/motion 기준으로 구현하고 새 screenshot evidence를 만든다.
  - Stage 5와 final authority는 Stage 4 및 이 Stage 1 author와 다른 task ID를 사용한다.

## Design Status

- [x] 임시 UI (temporary) — v2 Stage 1 재잠금
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후
- [ ] 확정 (confirmed) — Stage 5와 final authority blocker 0 후
- [ ] N/A — BE-only 슬라이스

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.36.md`
- `docs/화면정의서-v1.5.40.md`
- `docs/유저flow맵-v1.3.38.md`
- `docs/db설계-v1.3.38.md`
- `docs/api문서-v1.2.43.md`
- `docs/marketing/quiz-content-spec.md`
- `docs/marketing/demand-validation-plan.md`
- `docs/workpacks/marketing-demand-validation/README.md` — historical v1 closeout
- source prototype commit: `63f8ef2a019c6d260a96a42fab9d67f727d93557`
- source handoff: `marketing/mumeok-funnel-prototype-v2/INTEGRATION.md`

## QA / Test Data Plan

- fixture baseline
  - Hero a/b/c/d/default와 `utm_content` 우선순위
  - exact q1..q4 options, Q3-only 네 result mapping
  - anonymous stage replay/advance/skip/reverse
  - v1 cookie → 새 v2 session
  - accepted/duplicate same response, lead retry, fail-closed readiness
  - no PII response/log/event
- real DB smoke
  - pinned isolated local stack에서 additive migration replay
  - controlled full-local은 사전 승인된 read-only/controlled runbook만 사용
  - single `marketing_validation_sessions` table와 exact internal scope 확인
- seed/reset
  - isolated disposable stack만 migration replay 가능
  - 운영 데이터가 있는 full-local reset/volume delete 금지
- bootstrap/system row
  - 별도 system row 없음
  - first `view`가 v2 session row와 cookie를 생성하는 owning flow
- blocker
  - schema/constraint가 v1 history를 훼손함
  - extra route/table/direct browser DB access
  - old/new action/result 혼용
  - 권리 미확인 이미지와 제품 예시 표시 누락
  - lead readiness fail-open

## Key Rules

- 결과와 전체 체험은 이메일 전에 공개한다.
- `q1..q4` exact, 결과 네 개 exact, Q3-only mapping이다.
- v2 `target_qualified`는 null이며 새 hidden rule을 만들지 않는다.
- single POST/single table/local-only boundary를 유지한다.
- 익명 event와 email 신청은 별도 action/write boundary다.
- UTM과 `ad_variant`는 email 원문과 분리한다.
- same-action replay, duplicate email은 generic success다.
- `consent_version`, `consented_at`, Turnstile, retention과 PII redaction을 잠근다.
- source의 app-owned UI만 포팅하고 iPhone/Pixel frame/runtime을 배포하지 않는다.
- 실제 YouTube 썸네일의 이미지 권리와 제품 이미지 사용 권리를 확인한다. 제품은 항상 `제품 예시`로 표시한다.
- existing production lead readiness blocker는 완화하지 않는다.

## Contract Evolution Candidates (Optional)

- 없음. 본 문서는 사용자가 승인한 v2 계약을 공식 tuple과 Stage 1 acceptance로 재잠근 결과다.

## Primary User Path

1. 사용자가 광고 또는 직접 URL로 `/beta`에 들어오고 normalized Hero를 본다.
2. exact 네 문항에 답하고 Q3-derived 결과를 즉시 확인·공유한다.
3. 5단계 집밥 기록 체험과 두 planner payoff를 완료한다.
4. beta form을 보고 consent와 email을 제출한다.
5. accepted/duplicate generic success 뒤 done을 본다.

## Delivery Checklist

> v1 closeout evidence는 `docs/workpacks/marketing-demand-validation/`에 보존한다. 아래 항목은 v2 구현에 대한 새 잠금이며 evidence 전에는 체크하지 않는다.

- [ ] v2 백엔드 계약 고정: q1..q4, Q3 result, v2 actions, legacy boundary <!-- omo:id=delivery-backend-contract;stage=2;scope=backend;review=3,6 -->
- [ ] 기존 API adapter를 v2 single-route/single-table 계약으로 연결 <!-- omo:id=delivery-api-adapter;stage=2;scope=backend;review=3,6 -->
- [ ] shared type을 q1..q4, 네 result, nullable target, v2 actions로 변경 <!-- omo:id=delivery-types;stage=2;scope=shared;review=3,6 -->
- [ ] source app-owned UI를 Next.js `/beta`로 포팅 <!-- omo:id=delivery-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [ ] 상태 전이/legacy session/멱등성/duplicate/fail-closed/PII 테스트 <!-- omo:id=delivery-state-policy-tests;stage=2;scope=shared;review=3,6 -->
- [ ] Vitest/Playwright/a11y/visual/Lighthouse 범위 분리 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [ ] isolated migration fixture와 controlled full-local smoke 분리 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [ ] v2 session bootstrap와 legacy cookie restart 검증 <!-- omo:id=delivery-bootstrap-readiness;stage=2;scope=shared;review=3,6 -->
- [ ] loading/empty/error/read-only/unauthorized(N/A) 상태 점검 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] 이미지 권리/제품 예시/실기기/lead blocker 수동 QA handoff <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
- [ ] v2 cohort 분석 SQL/result template을 old taxonomy 없이 갱신 <!-- omo:id=delivery-stage6-operations-closeout;stage=4;scope=shared;review=6 -->

## Stage 1 Evidence

- author role: `stage1-docs-author`
- author task/thread ID: `01a0630e-81f1-7f42-8b1b-cb259d1d5997`
- user approval: current handoff prompt의 4문항/4결과 contract-evolution 승인
- RED: `pnpm exec vitest run tests/marketing-demand-validation-v2-contract.test.ts` → 4 tests failed before document updates
- independent internal 1.5: pending; 이 author task는 승인하지 않는다.
