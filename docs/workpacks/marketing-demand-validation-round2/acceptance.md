# Acceptance Checklist

공식 계약: [r2.1](../../marketing-demand-validation-r2-contract.md) @ `7f00e62c13572b5b2c0d54c997fe628f7a56567e`, 독립 reviewed head `24093c94ebf53676050353088f173ef7f6315445`.
Stage 1 재잠금 이후 Stage 2·독립 Stage 3 merge와 Stage 4 구현 증거를 누적한다. 현재 Stage 4 체크는 [프론트엔드 인수 기록](stage4-frontend-handoff.md)에 근거하며 디자인 authority 승인이 아니다. 전체 서비스의 기준 SHA 재현 실패와 남은 gate는 별도 보존한다. 계약 전문의 exact 필드·타입·message·DB constraint는 README 요약보다 우선한다.


Stage 2 체크 근거: [백엔드 인수 기록](stage2-backend-handoff.md). `accept-r2-routes`의 실제 Next 페이지·canonical 이동 연결은 사용자 지정 Stage 4 화면 범위에 남겨 미체크다. 서버 topic/context helper 자체는 단위 검증했다. 나머지 Stage 4/Manual Only 항목은 완료로 올리지 않는다.

## Happy Path

- [x] 두 exact 경로에서 서버 topic/r2.1을 고정하고 잘못된 경로404·trailing slash canonical 이동을 검증한다 <!-- omo:id=accept-r2-routes;stage=4;scope=frontend;review=5,6 -->

`accept-r2-routes`는 실제 Next 웹 경로 결합·404·canonical redirect를 Stage4에서 검증하는 항목이다. 백엔드의 topic/path resolver·서명·API 권한 검증은 기존 Stage2 항목과 테스트에 그대로 남으며, 검증 요구나 테스트를 면제하지 않는다.

- [x] MENU의 알림/예시/의견 세 선택지와 베타 준비·사용 예시 안내를 두 topic에 표시한다 <!-- omo:id=accept-r2-menu;stage=4;scope=frontend;review=5,6 -->
- [x] direct lead 단독, example 단독, survey 단독과 세 활동 완료 순서6개가 모두 성공하고 나머지 활동을 가짜 완료하지 않는다 <!-- omo:id=accept-r2-independent-paths;stage=4;scope=frontend;review=5,6 -->
- [x] 모든 성공200/failure envelope·receipt·revision·PII 없는 exact 응답을 §5와 맞춘다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [x] 백엔드와 프론트의 action union/topic/version/enum/nullable 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->
- [x] 네 질문과 단일 선택, Q1 가족·동거인 범위/제외 안내, Q2 재사용·직접 미관리·기타, Q3 없음, Q4 no/unsure·필수 조건 안내를 label/API/DB CHECK/fixture에 일치시킨다 <!-- omo:id=accept-r2-survey-copy;stage=2;scope=shared;review=3,6 -->
- [x] 16 canonical ID와 8 공통 설계/critic의 두 topic mapping을 구현과 실제 캡처에 대응시킨다 <!-- omo:id=accept-screen-contract;stage=4;scope=frontend;review=5,6 -->

## State / Policy

- [x] 활동별 start 선행과 §6의 모든 유효/무효 전이, 선행 없는 complete409를 검증한다 <!-- omo:id=accept-state-transition;stage=2;scope=shared;review=3,6 -->
- [x] 같은 event/의미 replay는 event/revision 증가0, 다른 의미/타소유409, 다른event 동일 시작·예시·설문은 no-op, 새 lead event 재완료409를 검증한다 <!-- omo:id=accept-idempotency;stage=2;scope=backend;review=3,6 -->
- [x] survey 시작/제출 시 server example snapshot을 각각 보존하며 다른 답변409·부정응답 동등취급을 검증한다 <!-- omo:id=accept-r2-survey-state;stage=2;scope=backend;review=3,6 -->
- [x] survey/lead 완료 read-only와 원receipt를 유지하고 예시 다시보기·menu_return·뒤로가기가 완료/최초유입을 증가시키지 않는다 <!-- omo:id=accept-read-only;stage=4;scope=frontend;review=5,6 -->
- [x] 완료 화면에서 종료 가능·선택적 메뉴/다른활동만 제공하며 자동복귀·0/3강요·이메일 재입력·설문 재제출이 없다 <!-- omo:id=accept-r2-done-choice;stage=4;scope=frontend;review=5,6 -->
- [x] 여러 탭·느린 응답에서도 낮은 revision이 확인된 완료를 되돌리지 않고 topic간 상태를 섞지 않는다 <!-- omo:id=accept-r2-revision;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [x] loading: bootstrap 지연/실패에도 MENU HTML과 활동은 열리고 저장 영역만 기다리며 완료 여부를 미확인으로 구분한다 <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [x] empty: 확인된 미완료에 정확한 빈 상태 문구를 표시하고 활동을 막지 않는다 <!-- omo:id=accept-empty;stage=4;scope=frontend;review=5,6 -->
- [x] error: 원 화면 inline 오류·입력 연결·재시도, 확정 실패와 응답유실 구분, 이메일의 탭메모리/reload폐기 안내를 검증한다 <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [x] unauthorized: 401/403에서 원 활동 재연결 안내를 제공하고 로그인 우회/인증 없는 제출을 만들지 않는다. 공개 캠페인의 로그인 return-to-action은 N/A임을 확인한다 <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [x] 409 conflict별 복구, consent_generation 갱신 시 체크/토큰 제거·새 event/명시동의, 410의 사용자 명시 재시작을 구분한다 <!-- omo:id=accept-conflict;stage=4;scope=frontend;review=6 -->
- [x] 400/401/403/405/409/410/413/415/422/429/503의 고정code/message/fields·Allow/Retry-After를 §5.2와 전수 대조한다 <!-- omo:id=accept-r2-errors;stage=2;scope=backend;review=3,6 -->
- [x] exact Origin/Host/fetch-site·topic cookie·page context·전용 secret·rate·현재 lead gate를 replay에도 적용하고 PII 존재 여부를 노출하지 않는다 <!-- omo:id=accept-owner-guard;stage=2;scope=backend;review=3,6 -->
- [x] unknown/누락/중복JSONkey/잘못된enum·version/8192bytes streaming/token길이/email경계/동의false·honeypot 입력을 거부한다 <!-- omo:id=accept-invalid-input;stage=2;scope=backend;review=3,6 -->

## Data Integrity

- [x] IndexedDB 원자 key 생성, 동일/다른 attribution 동시 탭, 응답/Set-Cookie 유실, confirmed resume, key-cookie conflict를 검증한다 <!-- omo:id=accept-r2-bootstrap;stage=2;scope=shared;review=3,6 -->
- [x] 저장소 오류+유효 cookie_resume는 기존 참여만 복원하고 cookie없음은 신규생성/제출 차단·draft만 허용한다. 메모리 신규참여 fallback이 없다 <!-- omo:id=accept-r2-storage;stage=4;scope=frontend;review=5,6 -->
- [x] 서명확인된 삭제/만료410만 같은속성으로 해당cookie 만료·local정리·명시재시작하며 410/Set-Cookie 유실 반복도 새row를 만들지 않는다 <!-- omo:id=accept-r2-expiry-restart;stage=2;scope=shared;review=3,6 -->
- [x] SDK 단일 apply RPC에서 event/lead/projection 각각 fault injection 시 부분저장0, inspect/apply경합 재검사, 동시lead20개를 검증한다 <!-- omo:id=accept-r2-rpc-atomicity;stage=2;scope=backend;review=3,6 -->
- [x] exact 함수서명/owner/search_path/timeouts/grants, FORCE RLS·anon/auth/service_role 직접tabledeny, wrongscope/role/method/path deny를 isolated DB에서 검증한다 <!-- omo:id=accept-r2-rpc-authority;stage=2;scope=backend;review=3,6 -->
- [x] deferred trigger의 applied event수=revision·timestamp·survey/lead projection·commit deadline·partial event삭제 거부와 cascade를 검증한다 <!-- omo:id=accept-derived-fields;stage=2;scope=backend;review=3,6 -->
- [x] control lease가 apply의 확정commit/rollback까지 유지되고 응답불명 시 무조건finally해제/자동lock탈취가 없으며 control writer와 직렬화됨을 검증한다 <!-- omo:id=accept-r2-control-lease;stage=2;scope=backend;review=3,6 -->
- [x] local-file limiter의 모든bucket·경쟁process·원자replace·restart·orphan·owner/symlink·clock·state손상·429/503을 검증한다 <!-- omo:id=accept-r2-limiter;stage=2;scope=backend;review=3,6 -->
- [x] 동일email 양topic unique·repeat원문NULL·legacy조회실패503·legacy동시writer의잠정한계·삭제후재유입을 검증한다 <!-- omo:id=accept-r2-contact-dedup;stage=2;scope=backend;review=3,6 -->
- [x] raw email/key/cookie/context/token/IP 및 digest가 public/event/log/URL에 새지 않고 SQLSTATE 안전변환·backend parameter redaction을 검증한다 <!-- omo:id=accept-r2-pii;stage=2;scope=backend;review=3,6 -->
- [x] 수집종료/참여expiry/보관종료경계·철회fence/drain/generation·전체topiccascade·export수명·stale동의409를 isolated fixture로 검증한다 <!-- omo:id=accept-r2-retention;stage=2;scope=backend;review=3,6 -->
- [x] 기존 v2 endpoint/table/cookie/질문/4유형/8단계/retention/광고 attribution과 선형 dashboard가 불변이다 <!-- omo:id=accept-r2-legacy-regression;stage=2;scope=shared;review=3,6 -->

## Data Setup / Preconditions

- [x] preview용fixture는 preview@example.com·메모리mock·매화면비저장안내이며 actual POST/DB/Turnstile0, productionhost에서는preview불가다 <!-- omo:id=accept-fixture-baseline;stage=4;scope=shared;review=6 -->
- [x] pinned isolated DB/migration SHA·HTTPS localhost3443·테스트키·별도rate/controlnamespace의 provenance를 확보한다. full-local운영/Cloud연결0이다 <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
- [x] 신규bootstrap participation1/bootstrap applied event1/revision1/lead0 및cookie_resume기존row/no-op event를 확인한다. 앱시스템row생성은N/A다 <!-- omo:id=accept-bootstrap-owning-flow;stage=2;scope=shared;review=3,6 -->
- [x] 신규3table/index/CHECK/FK/RLS/trigger/RPC 추가형migration과기존wrapper보존을 replay하고 기존테이블ALTER/UPDATE/reset/백필이없음을검증한다 <!-- omo:id=accept-r2-additive-migration;stage=2;scope=backend;review=3,6 -->

## Manual QA

- verifier: 독립 Stage5 `01a08e8f-6c04-7233-a12c-b256f460e6cb`와 별도 final authority `01a08f0c-bbbb-74b1-ac9b-20feb1ac085f` 승인 원문을 확보했다. Stage6는 전체 gate 보류로 미시작이다.
- environment: preview 또는 승인된 pinned isolated 테스트. 운영 full-local/Cloud/실제 신청 데이터는 사용하지 않는다.
- scenarios: 두topic×16화면mapping, 세활동단독·순서6개·교차중단·완료복귀·재보기, 320×568/390×844/393×852·desktop·키보드·200%·reduced-motion, 초기연결/저장실패/응답유실/동시탭/쿠키저장차단. 자동화 가능한 항목은 아래 Playwright/단위·DB gate에도 포함한다.

## Automation Split

### Vitest

- [x] body/action/enum/동의/expiry/revision/정규화·서명·canonical replay·adapter projection을 fixture unit/integration으로 고정한다 <!-- omo:id=accept-vitest-split;stage=2;scope=shared;review=3,6 -->
- [x] RPC/control/limiter/retention·legacy회귀를 단위test와실제isolatedDB로 나누고 production/mock 결과를 구분한다 <!-- omo:id=accept-vitest-regression;stage=2;scope=shared;review=3,6 -->

### Playwright

- [x] 두topic/16ID/단독·자유순서·done보존·unauthorized·error·preview차단을R2전용테스트로 고정한다 <!-- omo:id=accept-playwright-flow;stage=4;scope=frontend;review=5,6 -->
- [x] 모바일 폭·짧은높이·자연세로scroll·safe-area·keyboard·44px터치·대비·focus·fieldset/legend·inlineerror·aria-live·reducedmotion을검증한다 <!-- omo:id=accept-r2-a11y-visual;stage=4;scope=frontend;review=5,6 -->
- [x] actualprovider/실기기/운영승인만ManualOnly로나누고mock통과를실제발송·실서비스검증이라고보고하지않는다 <!-- omo:id=accept-playwright-live-split;stage=4;scope=frontend;review=6 -->
- [x] independent design precheck/Stage5/finalauthority와exploratoryQA/eval evidence를확보하기전confirmed로올리지않는다 <!-- omo:id=accept-r2-authority;stage=4;scope=frontend;review=5,6 -->

디자인 승인 근거는 [독립 최종 보고서](evidence/final-authority/01a08f0c/final-authority-report.md)다. 이 체크는 전체 서비스 verification·Manual Only·Stage6·Ready·merge·배포 완료가 아니다. 기존 전체 UI 실패와 사용자 범위 결정 대기는 유지한다.

### Manual Only

- [ ] 권리 보유자의 기존 로고·음식·캐릭터 사용권과 신규 영상 장면/문구 일치 확인. 현재 자동 테스트로 권리/실제 광고 소재를 확정할 수 없음.
- [ ] 운영자가 exact origin/sitekey/실제 Turnstile·공개 개인정보/동의 반영·보관삭제 runbook·권한/secret 준비를 독립 검토하고 activation 승인. docs/mock 통과로 대체 불가.
- [ ] 실제 Instagram/Facebook 인앱·기기 키보드·네트워크에서 안내와 접근성 확인. 시뮬레이터 검증과 결과 구분.
- [ ] 별도 승인된 release/runbook으로 migration적용/backupfreshness/중단·복구·철회/purge·필요한 실제 알림발송을 인수. 이Stage1에서는 실행하지 않음.
