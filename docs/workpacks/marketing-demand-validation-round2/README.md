# Slice: marketing-demand-validation-round2

## Goal

기존 `/beta`(v1) 계약을 보존한 상태에서 2차 캠페인을 위해 회차(`r2`)와 주제(`recording`, `homeflow`)를 분리해 측정할 수 있는 경로를 `/beta/r2/recording`, `/beta/r2/homeflow`로 추가한다. v2에 승인된 핵심 계약인 4문항·4결과, 결과/체험 공개, 단일 API·단일 테이블 구조는 유지한다.

또한 첫 화면을 메뉴형으로 전환하고 
1) 설문/체험 마감까지 강제하지 않고 2) 알림 신청(직접 신청) 경로를 분리해 설문 완료 없이도 신청 가능하도록 한다. 기존 v1 쿠키와 v1 세션 흐름은 오염되지 않도록 분리한다.

## Branches

- 문서: `docs/marketing-demand-validation-round2`
- 백엔드: `feature/be-marketing-demand-validation-round2`
- 프론트엔드: `feature/fe-marketing-demand-validation-round2`

## In Scope

- 화면:
  - 2차 캠페인 랜딩: `/beta/r2/recording`, `/beta/r2/homeflow`
  - 공통 메뉴: `베타 알림 받기` / `집밥 사용 예시 보기` / `의견 남기기`
  - 설문 경로: 4문항 `q1~q4` → 4개 결과 → 체험/플래너/완료
  - 직접 신청 경로: 메인 메뉴에서 알림 폼으로 바로 이동
  - 완료/복귀 경로: 완료 화면에서 메뉴로 돌아가기 가능
- API:
  - 기존 `POST /api/v1/marketing/validation` 단일 endpoint
- 상태 전이:
  - 공통: `view -> menu_viewed`
  - 메뉴 선택 설문/체험:
    `view -> menu_viewed -> menu_selected(quiz_or_experience) -> quiz_started -> quiz_completed -> result_viewed -> experience_started -> experience_completed -> beta_form_viewed -> lead_submitted`
  - 메뉴 직접 신청:
    `view -> menu_viewed -> beta_form_viewed -> lead_submitted`
  - 메뉴 의견/리뷰 선택:
    `view -> menu_viewed -> opinion_opened -> opinion_completed`
  - `same action replay`: first-write-wins
  - `역순/스킵`은 `409 INVALID_TRANSITION`
- DB 영향:
  - `public.marketing_validation_sessions` 공용 테이블
- Schema Change:
  - [ ] 없음 (읽기 전용)
  - [x] 있음 → 회차·주제 분기 보존과 중복 제거를 위한 additive migration 필요

## Out of Scope

- 신규 endpoint/table/RPC 추가
- v1(`/beta`) 또는 v1 5문항/문항 분기/lead 흐름 재정의
- 로그인/회원가입/요금제/결제
- 관리자 실운영 화면, 광고 게시/예산 설정, 운영 DB write
- 이미지 저작권 미확인 자산의 운영 노출
- production/staging remote DB 적용, tag/release/rollout

## Dependencies

| 선행 항목 | 상태 | 확인 |
| --- | --- | --- |
| `marketing-demand-validation` | merged | [x] |
| `marketing-demand-validation-v2` | merged | [x] |
| `/Users/cwj/.codex/visualizations/2026/09/05/01a07316-265c-7f22-b0af-fa22b7fb2b8a/mumeok-r2-stage-handoff.md` | user-authored scope lock | [x] |
| `/Users/cwj/.codex/visualizations/2026/09/05/01a07316-265c-7f22-b0af-fa22b7fb2b8a/mumeok-r2-landing-diagnosis.md` | latest diagnosis lock | [x] |

## Stage 1 Backend Contract Lock (no Stage 2 deferral)

- 이 단계에서 Stage 1 문서에서 아래 계약만 lock한다. 구현은 동일 스키마/동일 에러 코드를 이어받는다.

- request
  - `view`: `action` + `round=r2` + `subject=recording|homeflow` + allowlisted `utm_*` + `ad_variant`
  - `menu_selected`: `menu_action=quiz|experience|direct_form|opinion`
  - `quiz_started | quiz_completed | result_viewed | experience_started | experience_completed | beta_form_viewed`: `action` (공통)
  - `quiz_completed`: `answers: { q1, q2, q3, q4 }`
  - `lead_submitted`: `email`, `consent: true`, `turnstile_token`, `honeypot: ""`
  - `opinion_submitted`: `choice` / `opinion` (nullable)
- response
  - wrapper `{ success, data, error }`
  - error `{ code, message, fields[] }`
  - `lead_submitted`는 accepted/duplicate 둘 다 동일 generic UI 결과 반환
  - 성공은 회차/주제별 state machine을 따르며, 중복 replay는 first-write-wins
- authorization / policy
  - `first-party` 쿠키만 사용 (`mumeok_validation_session`), 브라우저 직접 DB write 금지
  - v1 row/cookie는 v2/r2 처리에 재사용하지 않음: r2 진입은 r2 row를 새로 생성
  - v1 행위 규칙과 raw PII 컬렉션 정책은 유지
  - `v2` 계약의 `target_qualified=null`, anonymous action는 PII 수집 없음
  - fail-closed: origin/Turnstile/privacy readiness 미충족 시 lead는 block
- validation & error contract
  - wrapper 형식은 `{ success, data, error }`로 고정
  - `error`는 `{ code, message, fields[] }` 형식만 허용
  - `validation`/`형식/권한` 실패: `422`
  - 역순/skip/invalid transition: `409 INVALID_TRANSITION`
  - readiness 미충족: `503`
  - 동일 action replay: `200` + generic success (`accepted` 또는 `duplicate` 구분 없음)
- idempotency and cookie
  - `view`는 첫 시작 시 `mumeok_validation_session`을 새로 만들고 동일 브라우저에서 replay를 식별
  - v1 쿠키와의 경로 혼합 금지: `round=r2`는 반드시 신규 row bootstrap
  - `same action` replay는 first-write-wins로 이벤트 집계만 단일 처리
- 중복·재방문 처리
  - 같은 브라우저 재방문/새로고침은 동일 메뉴·세션·행위의 중복 집계 금지
  - 같은 방문자의 메뉴 복귀는 기존 퍼널 재개로 처리하고 신규 방문으로 카운트하지 않음
  - 설문/체험 미완료 상태에서 `beta_form`로 전환된 건은 `lead_submitted`로만 집계

## Frontend Delivery Mode

- 소스 승인 후 디자인 확정 전까지 기능 가능한 임시 UI 우선
- 필수 상태: `loading / empty / error / read-only / unauthorized`
- 추가 상태: `hero`, `menu`, `quiz`, `result`, `experience1~5`, `planner_homecook`, `packaged_food`, `planner_complete`, `beta_form`, `done`, `opinion`, `validation-error`, `duplicate-generic-success`, `turnstile-fail-closed`
- 메뉴 복귀와 재시작은 사용성 경로이며 자동 완료 강제 없음

## Design Authority

- UI risk: `high-risk`
- Anchor screen dependency: 없음 (실제 `PLANNER_WEEK`/`HOME` anchor는 수정 없음)
- Visual artifact: 본 라운드 source prototype은 사용자 승인 문서(디버깅 산출물) 기반으로 lock, 별도 Figma artifact 확정은 후속 디자인 단계에서 보완
- Authority status: `required`
- Notes:
  - 2차는 기능성 분기 설계가 핵심이며, 1차 계약을 유지한 범위에서 `/beta/r2/*` 분기와 메뉴 로직만 선행한다.
  - 운영 광고 노출/예산/lead activation은 production blocker 상태에서 열지 않는다.

## Design Status

- [ ] 임시 UI (temporary) — Stage 1 기본값
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후
- [ ] 확정 (confirmed) — Stage 5/최종 authority 통과 후
- [ ] N/A — BE-only 슬라이스

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.36.md`
- `docs/화면정의서-v1.5.40.md`
- `docs/유저flow맵-v1.3.38.md`
- `docs/db설계-v1.3.38.md`
- `docs/api문서-v1.2.43.md`
- `docs/workpacks/README.md`
- `/Users/cwj/.codex/visualizations/2026/09/05/01a07316-265c-7f22-b0af-fa22b7fb2b8a/mumeok-r2-stage-handoff.md`
- `/Users/cwj/.codex/visualizations/2026/09/05/01a07316-265c-7f22-b0af-fa22b7fb2b8a/mumeok-r2-landing-diagnosis.md`

## QA / Test Data Plan

- fixture baseline
  - `round=r2` + `subject=recording/homeflow` 별도 세션
  - menu action 3개 케이스: direct_form/experience/opinion
  - anonymous replay idempotency / refresh / back 버튼 흐름
  - 메뉴 복귀 후 중복집계 방지
  - direct_form → lead, quiz path lead, opinion path 분리 집계
  - v1 row와 cookie 재사용 여부 차단
- real DB smoke
  - `public.marketing_validation_sessions`에서 r2 분기 구분(회차/주제) 검증
  - v1 row 보존 및 r2 신규 row 생성
  - same row와 duplicated v1 쿠키로 시작 시 r2 row 생성 테스트
- seed / reset
  - isolated stack 기반, 운영 DB는 read-only 또는 통제된 local runbook만
- precondition
  - `lead` fail-closed 정책은 v1/v2 동일
  - direct_apply(실패·성공)와 오디언스/UTM attribution 분리

## Key Rules

- `marketing-demand-validation` v1 계약은 `view`~`followup` 흐름을 그대로 유지한다.
- `marketing-demand-validation-v2`의 `q1~q4`, `4개 결과`, `single API`, `single table`, `PII 최소화`, `target_qualified=null`은 변경하지 않는다.
- 2차는 회차·주제별 분리(`round=r2`, `subject=recording/homeflow`)로만 신규 분기한다.
- 메뉴 직접 신청은 설문 진행을 대체하지 않으며 신청 경로를 별도 action로 둔다.
- 같은 브라우저 재방문/완료 후 메뉴 복귀/재시도는 신규 방문 카운트에 더하지 않는다.
- 1차 신청자·동일 이메일의 기존 신청은 신규 신청 수치로 중복 집계하지 않는다.
- direct_apply가 우선된 세션도 결과/체험 경로 집계의 완료 조건을 강제하지 않는다.
- 동의·봇방지·수락 여부는 서버의 same generic success 정책을 따른다.
- raw email/IP/UA/referrer/turnstile_token을 response/log/event에 노출하지 않는다.

## Primary User Path

1. 사용자가 광고/캠페인 링크로 `/beta/r2/recording` 또는 `/beta/r2/homeflow` 진입.
2. 메뉴에서 `베타 알림 받기` 또는 `집밥 사용 예시 보기` 또는 `의견 남기기` 선택.
3. 설문·체험 선택 시 4문항을 답하고 결과/체험을 본 뒤 폼에서 알림 신청.
4. 직접 신청 선택 시 메뉴에서 바로 폼으로 이동 후 동의+이메일 제출.
5. 신청/중단 후 완료 화면에서 메뉴로 돌아가 재방문 동선 허용.

## Delivery Checklist

> 이 체크리스트는 Stage 2~6 동안 갱신되는 closeout 문서다.

- [ ] 2차 회차/주제 분기 계약을 백엔드 타입/어답터에서 고정한다 <!-- omo:id=delivery-backend-contract;stage=2;scope=backend;review=3,6 -->
- [ ] 단일 route/table 정책 유지 + v1 계약 불변 조건을 명시한다 <!-- omo:id=delivery-api-adapter;stage=2;scope=backend;review=3,6 -->
- [ ] `ad_variant` + `round` + `subject`의 attribution 저장 방식 합의한다 <!-- omo:id=delivery-attribution-binding;stage=2;scope=backend;review=3,6 -->
- [ ] 메뉴 직접 신청 경로와 설문 경로의 state 분리를 구현한다 <!-- omo:id=delivery-state-policy;stage=2;scope=backend;review=3,6 -->
- [ ] 메뉴 복귀/재시도 중복 집계 방지 규칙을 동시성 테스트로 고정한다 <!-- omo:id=delivery-idempotent-path;stage=2;scope=shared;review=3,6 -->
- [ ] v1 쿠키 오염 방지(새 round/subject에서 r2 row 생성) 검증을 고정한다 <!-- omo:id=delivery-cookie-boundary;stage=2;scope=backend;review=3,6 -->
- [ ] API 응답/에러 형식을 계약대로 고정한다 <!-- omo:id=delivery-response-shape;stage=2;scope=shared;review=3,6 -->
- [ ] v2 4문항/4결과 및 PII 정책을 v1과 분리해 lock한다 <!-- omo:id=delivery-v2-policy-preserve;stage=2;scope=shared;review=3,6 -->
- [ ] `loading / empty / error / read-only / unauthorized` 상태 점검한다 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] 수동 QA handoff(메뉴복귀/직접신청/완료 후 복귀/중복재계산) 정리한다 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
