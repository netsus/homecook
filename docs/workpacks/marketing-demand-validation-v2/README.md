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
  - v1 전용 CHECK를 `creative_key`별 v1/v2 conditional quiz/lead/stage/legacy-null CHECK로 교체
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
| official v2 tuple contract-evolution | PR #1497 merged (`c1d43f60e427943087a7065f188d32224e739ecf`) | [x] |

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
  - v1 row는 기존 quiz completeness, intent lead, timestamp CHECK를 보존
  - v2 row는 q1..q4/new result, legacy field null, `target_qualified=null`, `beta_form_viewed_at → lead_submitted_at`을 DB CHECK로 강제
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
| DB CHECK | v1 quiz target/intent/followup 전용 | creative_key별 v1 보존 + v2 null/new stage | 기존 CHECK 교체 migration과 v1/v2 fixture 필요 |
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
  - `ui/designs/MARKETING_DEMAND_VALIDATION_V2.md`
  - `ui/designs/critiques/MARKETING_DEMAND_VALIDATION_V2-critique.md`
  - source prototype commit `63f8ef2a019c6d260a96a42fab9d67f727d93557`
  - `marketing/mumeok-funnel-prototype-v2/evidence/design-qa/final/`
  - `marketing/mumeok-funnel-prototype-v2/evidence/design-qa/final-v4/`
  - `marketing/mumeok-funnel-prototype-v2/evidence/design-qa/final-v5/`
  - `marketing/mumeok-funnel-prototype-v2/design-qa.md`
- Authority status: `reviewed`
- Notes:
  - source prototype은 standalone 기준 95/100 passed지만 Next.js port의 최종 authority가 아니다.
  - latest source는 뒤로가기·결과·체험·planner·beta layout과 최종 캐릭터/영양 자산을 개선했으며 exact 4문항·4결과 계약은 유지한다.
  - Stage 1 generator artifact: `ui/designs/MARKETING_DEMAND_VALIDATION_V2.md`
  - Stage 1 critic artifact: `ui/designs/critiques/MARKETING_DEMAND_VALIDATION_V2-critique.md` — 🟢 통과, blocker/major/minor `0/0/0`
  - iPhone/Pixel frame과 기기 선택기는 평가·배포 대상이 아니다.
  - Stage 4는 app-owned 화면만 현재 shell/accessibility/motion 기준으로 구현하고 새 screenshot evidence를 만든다.
  - Stage 5와 final authority는 Stage 4 및 이 Stage 1 author와 다른 task ID를 사용한다.

## Design Status

- [ ] 임시 UI (temporary) — v2 Stage 1 재잠금
- [ ] 리뷰 대기 (pending-review) — Stage 4 구현/evidence 완료, 독립 Stage 5/final authority 대기
- [x] 확정 (confirmed) — Stage 5 `APPROVE`, final authority `CONFIRMED 93/100`, blocker/major `0/0`
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
  - v1 existing CHECK fixture + row digest preservation
  - v2 target/legacy null fixture, stage-order/lead prerequisite rejection
  - recognized UTM conflict, unknown UTM fallthrough, unknown/direct default resolved ad variant
  - opaque result deep-link known/unknown and query stripping
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
- 저장 `ad_variant`는 resolved Hero variant이며 recognized UTM conflict가 우선하고 unknown/direct는 default다.
- canonical share URL은 opaque result key만 남기고 email/answers/UTM/ad variant를 제거한다.
- v1 CHECK는 그대로 보존하고 v2 CHECK는 target/legacy null과 새 stage order를 강제한다.
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

- [x] v2 백엔드 계약 고정: q1..q4, Q3 result, v2 actions, legacy boundary <!-- omo:id=delivery-backend-contract;stage=2;scope=backend;review=3,6 -->
- [x] 기존 API adapter를 v2 single-route/single-table 계약으로 연결 <!-- omo:id=delivery-api-adapter;stage=2;scope=backend;review=3,6 -->
- [x] shared type을 q1..q4, 네 result, nullable target, v2 actions로 변경 <!-- omo:id=delivery-types;stage=2;scope=shared;review=3,6 -->
- [x] source app-owned UI를 Next.js `/beta`로 포팅 <!-- omo:id=delivery-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [x] 상태 전이/legacy session/멱등성/duplicate/fail-closed/PII 테스트 <!-- omo:id=delivery-state-policy-tests;stage=2;scope=shared;review=3,6 -->
- [x] Vitest/Playwright/a11y/visual/Lighthouse 범위 분리 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [x] isolated migration fixture와 controlled full-local smoke 분리 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [x] v2 session bootstrap와 legacy cookie restart 검증 <!-- omo:id=delivery-bootstrap-readiness;stage=2;scope=shared;review=3,6 -->
- [x] loading/empty/error/read-only/unauthorized(N/A) 상태 점검 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [x] 이미지 권리/제품 예시/실기기/lead blocker 수동 QA handoff <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
- [x] v2 cohort 분석 SQL/result template을 old taxonomy 없이 갱신 <!-- omo:id=delivery-stage6-operations-closeout;stage=4;scope=shared;review=6 -->

## Stage 1 Evidence

- author role: `stage1-docs-author`
- author task/thread ID: `01a0630e-81f1-7f42-8b1b-cb259d1d5997`
- user approval: current handoff prompt의 4문항/4결과 contract-evolution 승인
- RED: `pnpm exec vitest run tests/marketing-demand-validation-v2-contract.test.ts` → 4 tests failed before document updates
- independent internal 1.5 reviewer task: `01a0636c-cdf3-74b1-8292-2d50418837a1`
- reviewed head `0b8867dd61f56013859eb1ee5309582f2a1749e6`: `REQUEST_CHANGES`, findings `P1-001..P1-004`, `P2-001`
- repair: creative-key conditional DB CHECK, generator/critic artifacts, PR projection, resolved ad variant, opaque share deep-link를 successor에서 보강한다. 이 author task는 repair를 승인하지 않으며 exact successor head 재검토가 필요하다.
- Stage 1 design gate: generator 완료, design-critic 🟢 / findings 0. 이는 internal 1.5 재승인을 대체하지 않는다.
- successor re-review head `6adb3baaab03bf0f9fec0cade5b4c9162902d486`: previous 5 findings CLOSED, new `P1-005` TomorrowPreview design/acceptance/evidence mismatch OPEN.
- P1-005 repair: 두 planner wireframe에 오늘 card 다음·CTA 직전의 read-only TomorrowPreview를 추가하고 393/320 Stage 4 browser evidence를 잠근다. 이 repair도 exact successor head 재검토가 필요하다.
- final internal 1.5: reviewer task `01a0636c-cdf3-74b1-8292-2d50418837a1`, APPROVED, findings 0; merged PR #1497 tree `e70617a384ddd084417f443cc28abb268348798b`.

## Stage 2 Evidence

- implementer role: `backend-implementer`; this task does not approve its own changes.
- RED: required four-file Vitest run → 26 failed / 16 passed against the v1 runtime; separate historical-cookie RED → expected 409, received 503.
- GREEN: required four-file Vitest run → 44 passed; product regression → 2,881 passed / 175 intended skips; marketing operations → 11 passed.
- isolated schema/security: Supabase CLI `2.110.0`, aggregate migration SHA-256 `39b8171e36e704a742c583fb213b6257d524fba2fd1ca4664bfa935d5508bf4a`; v1 baseline row/digest → v2 migration → same v1 projection digest와 v1→v2 field rejection → clean full replay, RLS/ACL, local Data API negative smoke가 통과했다. remote/cloud/linked access는 0이다.
- Manual Only blockers remain open; production lead activation, full-local apply, release/tag/deploy were not performed.
- Stage 3 reviewer task `01a063fb-8d16-7842-8b81-09e863ebee18` reviewed head `25bd7d9b5fb1e1d0e648ad2c610a73c15e056be0` and returned `REQUEST_CHANGES`: `P1-001..P1-003`, `P2-001..P2-002`.
- repair RED: finding-focused 4-file run `10 failed / 37 passed`; invalid UTM focused run `5 failed`; each failure reproduced the requested boundary.
- repair GREEN: required four-file run `66/66`, operations `11/11`, lint, typecheck, workflow/workpack/automation/bookkeeping/diff validators and the pinned isolated pre/post migration gate passed. Exact successor head requires the same reviewer task's re-review.

## Stage 3 Evidence

- independent reviewer task `01a063fb-8d16-7842-8b81-09e863ebee18` approved reviewed implementation head `b5d4ea2babcc69d13753119acbf4371f61aea317`, tree `d9c79898d0f695aec83ed08b20be6e394476229e`, with findings 0.
- retained artifact: `docs/workpacks/marketing-demand-validation-v2/evidence/2026-09-03-stage3-backend-review.md`
- this evidence-only successor commit is not covered by that approval until the same reviewer rechecks its new exact head. The author does not self-approve or merge.

## Stage 4 Evidence

- implementer role: `frontend-implementer`; this task does not self-approve or merge.
- RED: detached base `c29d4a9bd39a8b9d4fcd89b1160bf64290ef405e` + current Stage 4 tests only → Vitest `20 failed / 20 total` (`tests/marketing-client-session.test.ts`, `tests/marketing-demand-validation-landing.test.tsx`).
- GREEN focused:
  - Vitest landing/client-session/metadata → `24/24`
  - product-focused marketing suite → `37/37`
  - operations/contract suite → `23/23`
  - Playwright marketing flow → `16 passed / 2 intentional skips`
  - Playwright marketing visual snapshot update → `3 passed`
- evidence artifacts:
  - authority precheck: `ui/designs/authority/MARKETING_DEMAND_VALIDATION_V2-authority.md`
  - Stage 4 captures: `ui/designs/evidence/marketing-demand-validation-v2/`
  - exploratory QA bundle: `.artifacts/qa/marketing-demand-validation-v2/2026-09-03T07-26-41-418Z/`
- Stage 5 repair increased the focused landing coverage to `20/20`, product frontend suite to `41/41`, and preserved contract `12/12`, operations `11/11`, browser `16 pass / 2 intentional skips`, a11y `3/3`, visual `3/3`, and Lighthouse three-run success.
- exact repaired product head/tree: `4a746ad2c33710a12e0227abc59f92f771041e19` / `b47c0510b0531a2b4036ee910add4d12dbce1090`.

## Stage 5 Evidence

- independent reviewer task `/root/stage5_frontend_review` returned `APPROVE` on the exact repaired product head/tree.
- all five initial findings are closed; new `P0/P1/P2/P3 = 0/0/0/0`.
- retained report: `docs/workpacks/marketing-demand-validation-v2/evidence/2026-09-03-stage5-frontend-rereview.md`.

## Final Product Design Authority

- independent authority task `/root/final_product_design_authority` returned `CONFIRMED 93/100` with blocker/major `0/0`.
- the A/B/C/D hook-to-hero mapping, complete funnel, characters, responsive evidence, and recovery feedback preserve the approved source direction.
- retained report: `docs/workpacks/marketing-demand-validation-v2/evidence/2026-09-03-final-product-design-authority.md`.

## Stage 6 Candidate

- repair publication report: `docs/workpacks/marketing-demand-validation-v2/evidence/2026-09-03-stage6-repair-publication.md`.
- remaining gate: fresh independent Stage 6 review of the evidence-only successor, successor-head CI, Ready validation, merge, and post-merge exact-tree verification.
- all Manual Only production blockers remain open; no production, remote database, release, or deployment action is authorized by this candidate.

## Stage 6 Merged-Exact Closeout

- independent Stage 6 reviewed successor `ec13cf08a3e89e62f28540269f72b900826bbbac` / tree `231c2e5c5dc14d022812e6de49bc3b0bb316c6db` and returned `APPROVE`, `P0/P1/P2/P3 = 0/0/0/0`.
- Ready policy, template, quality, build, smoke, full regression, accessibility, visual, Lighthouse, and security gates passed.
- frontend PR #1499 squash-merged as `335886750bda3ae3b1a0f8ea7b01d3a696a80327`; merge tree equals the reviewed successor tree, drift `0`.
- retained report: `docs/workpacks/marketing-demand-validation-v2/evidence/2026-09-03-stage6-merged-exact-closeout.md`.
- automated integration is complete; the Manual Only production and rights gates remain fail-closed and do not authorize activation or deployment.
