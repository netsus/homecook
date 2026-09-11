# Slice: marketing-demand-validation-round2

## 사용자 승인 로컬 후보 — 선형 homeflow

로컬 작성·검증 결과는 [집밥흐름 로컬 구현 인수](../../marketing/homeflow-local-implementation.md)에 남긴다. 기존 Stage 완료 상태는 변경하지 않는다.

2026-09-11 최신 요청으로 [현재 PRD](../../marketing/homecook-flow-round2-prd.md)와 [로컬 구현 계약](../../marketing/homeflow-linear-implementation-contract.md)의 선형 homeflow 화면·새 설문 버전을 작성/검증한다. 기존 아래 r2.1 문항·독립 활동은 이전 버전의 보존 기준이다. 이번 변경은 배포·master 머지 없이 작업 브랜치에 남기며, 기존 checked 항목을 새 버전의 통과나 독립 Stage 승인으로 재사용하지 않는다.

## Goal

두 영상의 주제와 일치하는 랜딩에서 방문자가 베타 오픈 알림, 사용 예시, 네 문항 의견 중 원하는 활동을 자유롭게 선택한다. 하나만 마쳐도 참여를 끝낼 수 있고, 다른 활동으로 이동하거나 돌아와도 서버가 확인한 완료는 유지한다. 기존 `/beta` 수집과 데이터를 보존하면서 R2 참여·주제 관심을 별도로 기록한다.

## Stage 1 Contract Lock

- 권위: [r2 상세 계약](../../marketing-demand-validation-r2-contract.md), 버전 `r2.1`.
- 승인 계약 merge SHA: `7f00e62c13572b5b2c0d54c997fe628f7a56567e`, [PR #1551](https://github.com/netsus/homecook/pull/1551).
- 독립 검토 head: `24093c94ebf53676050353088f173ef7f6315445`; reviewer task `01a08c9d-2cf5-75c0-b409-b3a6ab2d265a`; 해당 계약의 unresolved required 0. 이 승인으로 현재 Stage 1을 자가 승인하지 않는다.
- 계약의 과거 작성 시점 Draft 설명과 현재 병합 이력을 구분한다. 이 재잠금은 병합된 규범 내용을 그대로 소비한다.
- 현재 작성 task: `01a08c92-ec13-78a2-8071-681afe60527b`; PR #1550은 Draft이며 독립 internal 1.5 검토·merge 대기다. Stage 1 완료 선언과 Stage 2 시작 권한은 조정 작업이 관리한다.
- 최초 PR 초안의 v2 제약은 이 문서와 acceptance로 대체한다. R2에 유형 결과, 선형 8단계, 별도 네 번째 의견 활동을 정의하지 않는다. 공식 계약에 없는 API 필드·함수·테이블은 추가하지 않는다.

## Branches

- 문서: `docs/marketing-demand-validation-round2`
- 백엔드: `feature/be-marketing-demand-validation-round2`
- 프론트엔드: `feature/fe-marketing-demand-validation-round2`

## In Scope

- 페이지: `/beta/r2/recording`, `/beta/r2/homeflow`. exact pathname으로 topic을 결정하며 그 밖의 경로는 404, trailing slash는 canonical 이동이다.
- 화면: `R2_RECORDING_` 및 `R2_HOMEFLOW_` 각각 `MENU / EXAMPLE / EXAMPLE_DONE / SURVEY / SURVEY_DONE / LEAD / LEAD_DONE / RECOVERY`, 총 16 canonical ID.
- 공개 API: 새 `POST /api/v1/marketing/round2` 하나. GET 상태 API는 없다.
- 서버 전용 실행: `createMarketingRound2InternalClient().execute(command)`와 `public.marketing_round2_apply(p_command jsonb)` 하나. 공개 endpoint 총계에 내부 RPC를 중복 추가하지 않는다.
- DB: `public.marketing_round2_participations`, `public.marketing_round2_events`, `public.marketing_round2_lead_requests` 세 테이블과 계약 §7의 exact index/constraint/trigger.
- 상태: `example / survey / lead` 각각 `not_started | started | completed`; 다른 활동과 순서 의존 없음. 각 활동 내부의 start 선행은 유지한다.
- Schema Change: **있음**. 후속 Stage 2에서 계약 §6.1·7의 추가형 migration 파일을 생성한다. 현재 Stage 1에서 SQL을 만들거나 실행하지 않는다.

## Out of Scope

- 기존 `/beta`, `POST /api/v1/marketing/validation`, `marketing_validation_sessions`, v1/v2 cookie·질문·4유형·8단계·retention·dashboard의 수정 또는 R2 혼합.
- 실제 레시피 추출·식사 기록·장보기·팬트리·남은 요리 데이터 변경. EXAMPLE은 준비된 fixture만 사용한다.
- 로그인/회원가입/결제, 결과 유형/점수/개인 결과 공유, 설문 수정·재제출, 임의 자유 텍스트·다중 선택, 별도 의견 endpoint.
- 네 번째 DB 테이블, 새 runtime 의존성, native PostgreSQL driver, 여러 host 수집 확장, 영구 이메일/복원키 tombstone.
- 운영 DB 변경·migration 적용·deploy·광고·실제 메일·Discord, 운영 activation, 통계 대시보드 구현. 이 작업은 Draft 문서 PR까지만 소유한다.

## Dependencies

| 선행 항목 | 상태 | 근거 |
| --- | --- | --- |
| marketing-demand-validation | merged | [기존 workpack](../marketing-demand-validation/README.md), 기존 데이터 보존 |
| marketing-demand-validation-v2 | merged | [v2 workpack](../marketing-demand-validation-v2/README.md), 기존 endpoint/cookie/retention 회귀 기준 |
| r2 contract-evolution #1551 | merged | `7f00e62c13572b5b2c0d54c997fe628f7a56567e`, 별도 독립 계약 검토 완료 |
| 현재 Stage 1 internal 1.5 | pending | 현재 작성 task와 다른 독립 reviewer의 검토·merge 필요 |

## Backend First Contract

### 요청·타입·응답

정확한 타입/nullable/길이/정규화/JSON 예시는 **공식 계약 §4~5**가 단일 기준이다. 아래 표는 구현 진입점이며 선택적으로 필드를 생략하도록 완화하지 않는다.

공통 요청 필드는 exact `action, event_id, topic, round_version, honeypot`다. `event_id`는 lowercase RFC4122 UUIDv4, topic은 `recording | homeflow`, round_version은 `r2.1`, honeypot은 빈 문자열이다. UTF-8 JSON object, 최대 실제 body 8192bytes, 중복 JSON key/unknown key/루트 null·array/임의 coercion을 거부한다.

| action | 공통 외 요청 필드 | 선행 조건·결과 |
| --- | --- | --- |
| bootstrap key 분기 | `bootstrap_intent=create_or_resume|resume`, `bootstrap_key`, `page_context` | key는 43자/decoded32bytes. create_or_resume만 신규 참여 가능, resume은 기존 참여만 |
| bootstrap cookie 분기 | `bootstrap_intent=cookie_resume` | key/context는 금지, 유효 해당 topic cookie로 기존 상태만 복원 |
| activity_start | `activity=example|survey|lead` | 해당 최초 start만 적용; lead start는 동의/신청 아님 |
| example_complete | 추가 필드 없음 | example start 필요, 최초 complete 후 같은 의미는 no-op |
| survey_submit | `survey_version`, exact `answers:{q1,q2,q3,q4}` | survey start 필요. topic별 `r2.1-recording|r2.1-homeflow`; 같은 답변 no-op, 다른 답변 409 |
| lead_submit | `email, consent:true, consent_version, purpose, consent_generation, turnstile_token?` | lead start, 현재 gate·동의·검증 필요. token 생략은 동일 성공 event/정규화 payload 영수증 재조회에만 허용 |
| menu_return | `from_activity=example|survey|lead` | 관측만 기록, 상태/revision/최초 유입 변화 없음 |

`consent_version=mumeok-r2-beta-notice-20260911`, `purpose=beta_open_notice`, generation은 현재 control의 1~2147483647 정수다. 이메일은 계약 §8의 ASCII trim/lower 및 254자/주소 구조 검증만 적용하며 공급자별 dot/plus 동일인 추정을 하지 않는다. API의 모든 문항 enum·필수 안내는 계약 §3·5와 일치해야 한다. Q1은 본인/가족·동거인 조리를 포함하고, recording Q2는 `reuse_saved/other`, homeflow Q2는 `not_managing/other`를 포함한다. 부정·미경험·없음 응답을 제외하거나 자유 텍스트로 바꾸지 않는다.

모든 성공은 HTTP 200, exact `{success:true,data,error:null}`다. data는 `round_version,topic,participation_id,event_id,revision,consent_generation,state,receipt,participation_expires_at,retention_until`만 포함한다. state는 세 활동 상태, receipt는 lead 완료일 때 원 성공 `{event_id,status:'received'}`이고 그 외 null이다. `retention_until=2026-11-30T15:00:00Z`. 이메일/answers/UTM/중복/legacy 존재/digest를 응답에 넣지 않는다. 같은 replay도 최신 revision snapshot을 줄 수 있으므로 응답 byte 동일성을 약속하지 않는다.

실패는 `{success:false,data:null,error:{code,message,fields:[]}}`이며 계약 §5.2의 고정 message를 그대로 쓴다. 422만 허용된 field path의 정렬·중복 제거 목록을 사용하고 알 수 없는 key는 이름도 돌려주지 않는다.

| HTTP | exact code |
| --- | --- |
| 400 / 405 / 413 / 415 | INVALID_JSON / METHOD_NOT_ALLOWED / BODY_TOO_LARGE / UNSUPPORTED_MEDIA_TYPE |
| 401 | PARTICIPATION_REQUIRED |
| 403 | ORIGIN_NOT_ALLOWED, CONTEXT_INVALID |
| 409 | EVENT_CONFLICT, BOOTSTRAP_CONFLICT, CONSENT_REFRESH_REQUIRED, INVALID_TRANSITION, ACTIVITY_ALREADY_COMPLETED |
| 410 | CONTEXT_EXPIRED, PARTICIPATION_EXPIRED, CAMPAIGN_ENDED |
| 422 | VALIDATION_ERROR, TURNSTILE_FAILED |
| 429 | RATE_LIMITED; Retry-After 정수초 |
| 503 | ROUND2_DISABLED, ROUND2_UNAVAILABLE, LEAD_CAPTURE_NOT_READY, LEAD_CAPTURE_UNAVAILABLE |

### bootstrap·권한·멱등성

첫 메뉴는 DB/POST 응답을 기다리지 않는 서버 HTML이다. page context는 exact topic/version/첫 유입 의미를 전용 HMAC으로 서명하며 유효기간 30분/수집 종료 중 먼저인 때다. UTM은 계약 §4.1 allowlist로만 정규화하고 최초 성공 bootstrap만 attribution을 쓴다. raw query/referrer/임의 광고 ID를 저장하지 않는다.

IndexedDB `mumeok-r2`의 `bootstrap` store에서 `r2.1:<topic>` key를 단일 readwrite transaction으로 생성/복원한다. 최초 event/key를 응답 확인까지 유지해 응답/Set-Cookie 유실과 동시 탭 중복을 방지한다. 같은 의미 attribution은 같은 최초 event_id, 다른 광고 의미는 같은 bootstrap key와 새 event_id를 사용한다. confirmed key는 resume만 허용한다.

저장소 차단 시 `cookie_resume`으로 유효한 기존 서명 cookie를 복원하면 해당 참여의 활동을 계속할 수 있다. 쿠키도 없으면 공개 예시·설문 draft만 열고 신규 참여/제출은 저장소 복구까지 차단한다. 쿠키 없는 메모리 전용 신규 참여를 만들지 않는다. 미제출 draft/미성공 요청의 reload 손실을 명시한다.

쿠키는 `__Secure-mumeok_r2_recording` / `__Secure-mumeok_r2_homeflow`, `HttpOnly; Secure; SameSite=Lax; Path=/api/v1/marketing/round2`, Domain 없음이다. payload `{v:1,pid,topic,round_version,iat,exp}`는 계약 §4.3의 서명/최초 expiry를 유지한다. 동일 이름 중복 cookie, 잘못된 소유/topic/version을 거부하며 body participation_id로 대체 인증하지 않는다.

서명 검증된 참여의 삭제/만료를 확인한 410 PARTICIPATION_EXPIRED에만 해당 topic 쿠키를 같은 속성으로 만료한다. 로컬 정리 → 사용자 `새 참여 시작` → 새 key/event/context 순서이며 자동 INSERT는 없다. 다른 topic/v2 쿠키는 보존한다. DB 결과 불명/일반401/page 만료를 삭제로 오인하지 않는다.

event_id는 전역 PK다. 같은 ID의 다른 소유/action/canonical 의미는 409, 같은 의미는 새 event/revision 없이 현재 snapshot이다. 다른 ID의 시작/예시완료/같은 설문은 applied=false no-op event, **새 lead event_id로 재완료는 409**다. 실패는 세 테이블에 쓰지 않는다. 현재 gate/rate/기간/generation은 성공 영수증 재조회에도 적용한다.

### 단일 RPC·DB 원자성·제어

공식 계약 §6.1~7을 그대로 소비한다. `createMarketingValidationInternalClient()`의 여러 from 호출을 하나의 transaction으로 취급하지 않는다. 기존 scoped client 방식만 재사용하고 SDK `client.rpc('marketing_round2_apply', {p_command:command})` 하나를 호출한다.

함수는 `public.marketing_round2_apply(p_command jsonb) RETURNS jsonb`, `LANGUAGE plpgsql VOLATILE SECURITY DEFINER`, owner postgres, `search_path=pg_catalog,pg_temp`, statement_timeout 8s, lock_timeout 2s다. PUBLIC/anon/authenticated EXECUTE와 **service_role 포함 세 테이블 직접 권한**을 revoke한다. service_role에는 해당 RPC EXECUTE만 주며 기존 wrapper를 보존한 `marketing-round2 / POST / /rpc/marketing_round2_apply` scope tuple과 caller JWT role/current role을 모두 확인한다.

내부 command는 exact `op,action,event_id,topic,round_version,participation_id,bootstrap_intent,bootstrap_digest,activity,payload,payload_digest,lead,control`이다. null 조건과 lead/control object, inspected/applied 결과는 계약 §6.1의 표·타입 그대로다. 공개 body를 spread하지 않는다. inspect는 잠금/커밋 증거가 아니며 apply가 경쟁·선행 상태를 다시 검사한다. 공개 응답에는 applied.data만 projection하고 cookie_claims는 서버에서 서명한다.

lead는 inspect → 필요한 Siteverify → 공통 control lease → 새 control → apply 순서다. control lease는 `MUMEOK_ROUND2_CONTROL_PATH + '.lock'`, rate lock과 별도이며 최종 apply의 확정 결과까지 유지한다. RPC 12초 timeout/응답 유실을 rollback으로 간주하거나 finally에서 자동 해제하지 않는다. 확인 불가능하면 닫힌 상태로 유지하고 승인된 runbook만 dispatch 중단/DB transaction0 확인 후 복구한다.

apply는 참여 row lock과 필요시 전체 R2 email advisory lock 이후 clock_timestamp()로 동일 write_at을 사용해 event → lead → 참여 projection을 한 transaction에 쓴다. deferred `marketing_round2_consistency`가 성공 event·시각·revision·survey/lead projection과 deadline/expiry를 commit에 검사한다. inspect와 apply, DB transaction과 파일 변경을 하나의 원자 transaction이라고 표현하지 않는다.

세 테이블의 exact column/default/null/CHECK/FK/UNIQUE/index와 action별 비PII payload는 계약 §7.1~7.4에 위임한다. schema diff는 그 명세와 전수 대조한다. 기존 table ALTER/UPDATE/backfill/삭제 및 v2 constraint 수정은 금지한다. legacy는 보관 중 accepted email의 고정 EXISTS 읽기만 허용한다. 내부 오류는 SQLSTATE+고정 code allowlist로 변환하며 SQL/PII를 노출하지 않는다.

### 수집·동의·보관·격리

기본 `MUMEOK_ROUND2_ENABLED=false`, `MUMEOK_ROUND2_LEADS_ENABLED=false`; 환경 flag와 공유 control flag가 모두 true여야 열리며 v2 flag를 재사용하지 않는다. 수집은 `[2026-09-10T15:00:00Z,2026-10-31T15:00:00Z)`, 보관 종료는 `2026-11-30T15:00:00Z`다. 참여는 최초부터30일/수집 종료 중 먼저, 자동 연장 없음이다.

동의 label: `무먹 베타 오픈 알림을 이메일로 받기 위해 이메일 주소와 신청 주제·동의 기록을 수집·이용하는 데 동의해요. 보관 기간은 2026년 11월 30일까지이며, 철회하면 해당 정보를 삭제해요.` 미체크 동의, privacy 링크, `동의하지 않아도 예시와 의견 남기기를 이용할 수 있어요`, `만 14세 이상인 경우에만 신청해 주세요`를 표시한다. 접수 화면을 메일 발송/이메일 소유 확인으로 표현하지 않는다.

동일 주제 email은 new_topic 한 row만 원문 보관, repeat_topic은 email_normalized NULL; 개인정보 분류와 request_digest는 lead 영역에만 둔다. legacy 동시 writer의 부재를 완전 직렬화했다고 하지 않고 new_observed는 잠정 관측으로 처리한다. 고유 사람/평생 신규 고객 수라고 표현하지 않는다.

서버 전용 7개 독립 HMAC secret과 Turnstile secret, exact production Origin/Host/action, 단일 host local-file rate/control, owner/권한/lock/원자 replace·crash 정책은 계약 §9 그대로다. IP60/분·bootstrap20/분·참여60/분·lead IP10/시간/참여5/시간, 실패/replay 포함, state 손상·lock orphan은 fail closed다. 실제 Siteverify는 hostname/action/challenge age 확인, timeout5초/네트워크재시도최대1회, event_id idempotency를 쓴다.

보관 종료는 즉시 읽기/수집 차단과 승인 purge24시간 내 cascade 삭제다. 철회는 동일 control lease, lead off, drain, generation 증가, email lock 삭제, 잔여0 확인 후 승인 복원이며 오래된 동의는409로 체크/토큰을 지우고 새 명시동의를 받는다. 운영 export와 브라우저 data도 같은 보관/철회 수명을 따른다. 실제 실행은 별도 운영 권한이다.

local preview는 explicit flag+exact loopback에서만 메모리 mock, 모든 화면 `로컬 미리보기 · 저장되지 않아요`, `preview@example.com`, POST/DB/Turnstile0이다. preview public POST는 disabled다. 실제 통합 검증은 별도 HTTPS `https://localhost:3443`, localhost hostname·테스트키·mock challenge·isolated DB/rate namespace만 사용한다. full-local 운영/Cloud에 접근하지 않는다.

## Frontend Delivery Mode

기능 가능한 임시 UI를 거쳐 Stage 4 실제 화면 근거로 검토한다. 아래 다섯 상태를 두 topic 모두 닫는다.

| 필수 상태 | R2 동작 |
| --- | --- |
| loading | bootstrap 중 메뉴 HTML/활동 진입 유지, 제출 근처 연결 안내. 완료 여부는 미확인 |
| empty | 확인된 미완료에 `아직 완료한 활동이 없어요`; 선택을 막지 않음 |
| error | 실패한 행동 근처 RECOVERY, 오류 연결/입력 보존, 결과 불명과 확정 실패 구분 |
| read-only | 설문 완료는 접수 확인만, lead 완료는 영수증 확인만, 예시 다시 보기는 완료 유지 |
| unauthorized | 쿠키401·문맥403은 참여 재연결/페이지 갱신 안내. 로그인으로 보내거나 비인증 제출 허용하지 않음 |

공개 익명 캠페인이므로 로그인 gate/로그인 return-to-action은 N/A다. 대신 복구 가능한 원 활동의 local 선택을 보존하고 명시 재시도를 제공한다. 410 명시 재시작은 기존 참여 완료/동의를 새 참여로 복사하지 않는다.

## Design Authority

- UI risk: `new-screen` / `high-risk`.
- Anchor screen dependency: 없음. 실제 HOME/RECIPE_DETAIL/PLANNER_WEEK를 변경하지 않는 독립 캠페인 surface다.
- 화면 mapping: [R2_SCREEN_MAPPING](../../../ui/designs/R2_SCREEN_MAPPING.md). 8 공통 설계 문서가 topic별 내용으로 canonical16 ID를 각각 설명하며 동일 이름 별칭 파일을 늘리지 않는다.
- Generator/critic: [설계 방향](../../../ui/designs/R2_DESIGN_DIRECTION.md), [화면별 인계](../../../ui/designs/R2_DESIGN_HANDOFF.md), 해당 `ui/designs/R2_<STATE>.md`와 `ui/designs/critiques/R2_<STATE>-critique.md`.
- 첫 MENU는 알림 primary/예시 secondary/의견 tertiary, 세 DONE은 종료 안내 후 메뉴 primary/다른 활동 optional이다. 0/3 강요·자동복귀 없음.
- Visual artifact: [recording390](../../../ui/designs/evidence/marketing-demand-validation-round2/R2_recording_390.png), [recording320](../../../ui/designs/evidence/marketing-demand-validation-round2/R2_recording_320.png), [homeflow390](../../../ui/designs/evidence/marketing-demand-validation-round2/R2_homeflow_390.png), [homeflow320](../../../ui/designs/evidence/marketing-demand-validation-round2/R2_homeflow_320.png), [완료보존320](../../../ui/designs/evidence/marketing-demand-validation-round2/R2_completed-state-variants_320.png).
- Authority status: required
- Review progress: pending. `automation-spec.json`의 `authority_report_paths`는 각 공통 화면의 두 topic을 다룰 예정 경로다. Stage4 실제 화면 검토 전에는 보고서 생성·승인 완료를 의미하지 않는다. 정적 도면은 브라우저 screenshot이 아니며 독립 authority pass가 아니다. 보조 critic 결과는 mapping 및 각 report의 최신 메모를 따른다.
- Stage 4 evidence: canonical16 ID마다 320×568/390×844/393×852 및 desktop, initial/scroll/오류/해당 키보드/200%/reduced-motion/복원 캡처. Stage4와 다른 reviewer precheck, Stage5, 별도 final authority 순서다.

## Design Status

- [x] 임시 UI (temporary) — **상태 분류**이며 Stage4 구현 완료 체크가 아님.
- [ ] 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed)
- [ ] N/A (BE-only에만 해당하므로 선택하지 않음)

## Source Links

- [CSoT](../../sync/CURRENT_SOURCE_OF_TRUTH.md), [workpack index](../README.md), [공식 상세 계약](../../marketing-demand-validation-r2-contract.md).
- [요구사항](../../요구사항기준선-v1.7.36.md), [화면정의서](../../화면정의서-v1.5.40.md), [Flow](../../유저flow맵-v1.3.38.md), [API](../../api문서-v1.2.43.md), [DB](../../db설계-v1.3.38.md)의 2026-09-11 r2 addendum.
- [slice workflow](../../engineering/slice-workflow.md), [단계 인계](../../engineering/codex-task-handoff.md), [게이트 기준](../../engineering/agent-workflow-overview.md), [QA](../../engineering/qa-system.md), [local-only](../../engineering/supabase-local-only-operations.md).

## QA / Test Data Plan

현재 Stage1은 문서·JSON·metadata·정적 디자인만 검증한다. 아래 제품 테스트는 후속 **미완료 요구사항**이다.

| 범위 | 준비·검증 경로 | 소유 단계 |
| --- | --- | --- |
| fixture baseline | 고정 clock/UUID/HMAC key, 두topic4질문, 세활동 단독·순서6개, scoped fake client, fault injection; email은 example.com만 | Stage2 |
| DB smoke | pinned isolated local stack에서 §7 migration replay, RPC 실제SDK 호출·rollback·권한negative·동시성20·consistency trigger. target provenance 없으면 blocker | Stage2 |
| bootstrap row | 신규 create_or_resume은 participation1+applied bootstrap event1+revision1, lead0. cookie_resume은 기존 row+applied=false event, 새 참여0 | Stage2 |
| seed/reset | R2 전용 seed/reset 명령은 현재 없음. Stage2가 isolated fixture로 준비. 운영 full-local reset/Cloud 연결금지; 앱 recipe_books/meal_plan_columns bootstrap은 N/A | Stage2 |
| 로직 검증 | 기존 `pnpm test:product`, backend 종합 `pnpm verify:backend`; 새 r2 테스트 파일은 Stage2에서 추가해 실제 실행목록에 포함 | Stage2/3 |
| schema/security | 기존 `pnpm verify:security-functions:isolated`에 새 RPC/table negative evidence가 실제 포함되는지 Stage2에서 확인·보강 | Stage2/3 |
| 브라우저 | 기존 `pnpm verify:frontend:pr`, Ready 전 `pnpm verify:frontend`; R2 전용 slice flow·a11y·visual coverage를 Stage4에서 추가. 기존 marketing E2E를 R2 검증으로 오인하지 않음 | Stage4/5/6 |
| 실제 동작·탐색 QA | deterministic 후 `pnpm qa:explore` 및 QA eval을 SOP에 맞춰 실행. 필요한 인자/fixture는 승인 구현에서 설정 | Stage4~6 |

bootstrap storage/cookie 실패, body/권한/멱등, RPC/control lease, retention/철회는 자동 테스트 범위다. Manual Only로 옮겨 자동 검증을 회피하지 않는다. 실제 provider·실기기/인앱·이미지 권리·운영 activation은 acceptance의 Manual Only로 분리한다. 운영 배포가 없다는 사실과 preview/isolated 결과를 섞지 않는다.

## Key Rules

- 공식 §2~10을 완화하지 않고 backend-first로 타입/권한/상태/원자성부터 고정한다.
- 재료/양 직접 확인, 완성 무게·먹은 양 입력, 추정 영양을 명시한다. 보유 재료는 직접 확인·제외한다. 미검증 시간·정확 영양 보장 금지.
- 메뉴/활동은 자유 순서, start/complete는 활동별 선행 조건 유지. direct lead에서 example/survey를 가짜 완료하지 않는다.
- 완료는 commit된 snapshot/receipt로만 표현한다. 낮은 revision 응답을 무시하고 예시 재보기·메뉴 복귀가 새 완료가 되지 않는다.
- 모든 구현·리뷰 체크는 실제 evidence 후 각 소유 단계에서 닫는다. 독립 검토는 작성 task의 subagent로 대신하지 않는다.

## Contract Evolution Candidates (Optional)

현재 추가 후보 없음. 다중 host/쿠키 없는 신규 메모리 참여/설문 수정/새 필드 등은 승인 범위 밖이며 필요하면 별도 contract-evolution을 요청한다.

## Primary User Path

1. 광고와 일치하는 topic MENU에서 준비 상태·가치를 읽고 활동을 고른다.
2. 바로 알림 폼을 열어 현재 동의·보안 확인 후 제출하거나, 예시 또는 네 질문만 진행한다.
3. 서버 확인 뒤 해당 DONE에서 접수/확인 내용을 읽고 참여를 끝낸다.
4. 원하면 메뉴나 다른 활동으로 이동한다. 이미 접수한 알림/의견은 확인 화면으로, 예시는 다시 보기로 열며 완료를 보존한다.

## Stage 2 실행 기록

현재 백엔드 구현·검증 범위와 Stage 4/운영 인수 조건은 [Stage 2 인수 기록](stage2-backend-handoff.md)을 따른다. 아래 checked는 실제 검증한 Stage 2 범위만 의미하며 독립 Stage 3 승인·화면 완료·배포 완료가 아니다. 실제 페이지 경로 통합은 Stage 4 화면 작업에 남긴다.

## Delivery Checklist

현재 Stage1은 아래 Stage2/4 완료 항목을 체크하지 않는다. 독립 3/5/6 review는 metadata와 별도 task를 따른다.

- [x] 백엔드 계약 고정 <!-- omo:id=delivery-backend-contract;stage=2;scope=backend;review=3,6 -->
- [x] API 또는 adapter 연결 <!-- omo:id=delivery-api-adapter;stage=2;scope=backend;review=3,6 -->
- [x] 타입 반영 <!-- omo:id=delivery-types;stage=2;scope=shared;review=3,6 -->
- [ ] UI 연결 <!-- omo:id=delivery-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [x] 상태 전이 / 권한 / 멱등성 테스트 <!-- omo:id=delivery-state-policy-tests;stage=2;scope=shared;review=3,6 -->
- [ ] Vitest / Playwright 자동화 범위 구분 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [x] fixture와 real DB smoke 경로 구분 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [x] seed / bootstrap / system row 준비 점검 <!-- omo:id=delivery-bootstrap-readiness;stage=2;scope=shared;review=3,6 -->
- [ ] loading / empty / error / read-only / unauthorized 상태 검증 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] 실제 QA와 Manual Only 운영 인수 조건 분리 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
