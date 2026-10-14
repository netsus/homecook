# 선택 개인 실측 확인 기록 — 2026-10-15

## 2026-10-15 운영 반영 — 개인 확인만 활성화

아래 로컬 후보/운영 미반영 문장은 준비 당시 기록이며 이 절이 최신 운영 상태다. 앱 #1704·도구 #1705·plist 결속 보완 #1706 이후 DB228과 웹 `af88126b44cf5abb6fa06f7c08f9eee23ca7de99`·build `prelaunch-af88126b44cf-f3IycH`를 확인했다. DB는 개인 writer OFF로 반영하고 reader 배포·영수증 결속 뒤 개인 writer ON으로 전환했다. 기존 C03/C01/C04 writer·worker48 ON을 유지했다. 새 개인 확인 ON은 C05 참여·자료 수집·물리 검증·W4 보정 ON이 아니다.

운영 QA의 선택160g+개인 확인1건,30g 식사1건·130g 잔량을 확인했고, 철회는 revision1→2의 append event만 만들었다. 철회/새로고침 전후 원g/evidence 지문·식사 행 지문·고정160g 분모·130g 잔량이 같았다.375 취소/재열기·double click·완료 세션 reload,320 가로 넘침,1440 철회/reload·닫기 초점, 비로그인 공개 상세/로그인 안내·복귀 경로를 확인했다.160g는 사용자 보고 QA 값이며 `user_attested / physical_verification=not_verified / record_usage=qa_personal_record`, planned 원량을 유지한다. 실제 기기 품질·투입량이나 추정 정확도 검증으로 승격하지 않는다.

reader 배포 검사1,418 PASS·선택 범위 밖133 skipped 및 배포 exit0·recoveryPending=false를 확인했다. 처음 한글 source 경로의 인코딩과 잘못된 준비 plist 지문은 guard가 거절했고, 정확 원본 경로/캡처 bytes로 교정한 #1706 이후 진행했다. 초기 실패·원 승인/영수증은 보존했으며 검사 기준·원 운영 plist를 바꾸지 않았다.

C05 draft #1707·소스 `da65a96a2611918096295d7d42f7d4e0b27f1e5c`는 운영 미적용이고 수집 OFF·보유기간 미정이다. 실제 sample writer·삭제/복원·모델 영향 처리와 W4/W5/W6는 별도 미완료다. 새 실제 추출·모델/P5 평가·외부 AI0이며 전체 v9 완료가 아니다. 비공개 개인 operation의 DB/reader/writer·QA JSON과 철회 전후 행 지문을 [진행 장부](mumeok-beta-v9-progress-20261013.md#선택-개인-무게-확인-운영-반영원기록-보존--2026-10-15)에 연결했다. 기존 read/retract/성공 replay의 OFF 허용과 원기록 보존 계약은 아래 내용 그대로다.

이 묶음은 C01의 새 `reported_measurement`와 선택 자기보고를 같은 DB transaction에서 저장하고, 소유자가 조회하거나 확인을 취소하는 **로컬 후보**다. 운영 반영이나 v9/W4 전체 완료를 뜻하지 않는다. 기존 C01 실측 입력은 계속 선택이며, 빈칸·건너뛰기·체크하지 않은 요청과 구 클라이언트는 기존 완료/나중 실측 RPC를 그대로 사용한다.

## 기록의 의미

기본 unchecked 문장은 “이번 요리 재료표의 재료와 양(추가 물·기름 포함)을 그대로 사용했고, 먹거나 버리기 전에 용기를 뺀 음식 전체(먹을 국물 포함)를 저울로 쟀어요.”이며 버전은 `pinned-quantities-whole-net-weight-v1`이다. 개인 기록용 자기보고이고 모델 참여 동의가 아니다.

서버가 원 snapshot의 행 식별자·재료/제품과 고정 영양 버전·원량/단위·scalable·quantity_input·인분·steps 지문, 소유자와 계정 generation, session/batch를 결속한다. 행의 `quantity_origin`은 **planned**를 유지하고 `claim=matches_pinned_quantities`, `provenance=user_attested`를 별도로 저장한다. 실제 사용량 벡터를 클라이언트에서 받거나 planned를 reported_actual로 덮지 않는다. 원 snapshot/content hash와 original measurement/prediction 참조를 보존한다.

`physical_verification=not_verified`, `record_usage=qa_personal_record`로 고정한다. 현재 계정 자료는 QA다. 조리 손실·배수·누락 재료·기기 품질이 검증됐다는 뜻이 아니며, 과학적 품질값이나 숫자 보정 기준을 임의로 만들지 않는다. W4의 독립 3배치·미래 예측만 적용·정정 무효화 같은 기존 pure 계약에 이 기록을 자동으로 투입하지 않는다. 개인 숫자 보정의 실제 적용은 별도 미완료 범위다. C05 참여/선별/수집·보유기간과 연결하지 않으며 수집 OFF/기간 미정은 유지한다.

## DB와 원자 경계

독립 append migration `20261014224500_cooked_weight_user_attestation.sql`은 현재 227의 마지막 `223000` 뒤, 미적용 C05 `230000/231000` 앞이다. 원 C01 `60b9f400…`과 C04 여섯 SQL은 수정하지 않는다. 새로운 worker·키·환경변수는 없다.

- `private.cooked_weight_user_attestations`: attested revision1과 retracted revision2의 append-only event. owner/batch/원 measurement 삭제를 따라 cascade하며 snapshot FK와 이전 assertion FK를 보존한다. 기존 measurement의 `measured_g`를 참조해 표시하며 현재 잔량을 원 실측으로 표시하지 않는다.
- `private.cooked_weight_user_attestation_control`: singleton·기본 OFF. 기존 C01 control과 분리한다. 새 writer는 같은 transaction에서 `FOR SHARE` 후 ON을 확인하므로 OFF UPDATE가 진행 중인 쓰기와 순서를 보장한다. DB control이 새 기록 쓰기의 권위이며 서버 boolean으로 대신하지 않는다.

새 완료/실측 wrapper는 원 owner/generation/session authority를 재검증하고 원 C01 RPC를 동일 authority·headers·claims·path 조건 아래 실제 호출한다. 원 C01/core receipt는 그대로 두고 새 scope의 payload/key receipt에 확인 ACK를 저장한다. 원 C01의 성공한 새 measurement가 생성되지 않으면 새 확인도 저장되지 않는다. append 실패는 완료/무게/기존·신규 receipt까지 함께 rollback한다. 옛 C01 receipt에 확인을 사후 부착하지 않는다.

자기보고 revision과 measurement original revision, 이후 소비/버림에 따라 변하는 balance revision은 서로 다르다. 확인 취소는 원 g·prediction_json·과거 meal/영양/분모·quantity event·receipt를 수정하지 않는다. 같은 키 replay는 최초 요청의 고정 성공 ACK를 반환하고 현재 상태는 owner GET으로 읽는다. 취소 이후 replay가 확인을 되살리지 않는다. 동일 measurement에 재확인/새 숫자 정정은 이 묶음에 없다.

OFF에도 기존 C01 동작과 개인 read/retract, 이미 성공한 receipt replay는 유지한다. ON 요구는 새 확인을 생성하는 경계에만 적용한다. 새 reader를 OFF·facts0으로 준비하는 운영/복구는 별도 도구 후속이다. 새 facts가 저장된 뒤 구 reader로 자동 복귀할 수 있다고 가정하지 않는다.

## API와 UI 소비 계약

기존 완료/weight 요청에 선택 `weight_attestation` 4키만 추가한다: `statement_version`, `checked:true`, `expected_subject={owner_uuid,account_generation}`, `expected_context_fingerprint`. 신규 실측 `set_finished_weight` + `reported_measured`에만 허용한다. `false`/null/클라이언트 실제 행/physical_verified 같은 추가 값은 거절한다. 명시 요청에서만 검증된 `weight_attestation` 성공 ACK를 응답에 넣고, 구 요청의 응답 형태를 유지한다.

`GET /api/v1/cooked-weight-attestations/{id}?target=session|batch`는 현재 DB capability와 owner/generation context·기록을 반환한다. `PATCH`는 필수 Idempotency-Key와 `expected_subject`, `expected_record_id`, `expected_revision`, `expected_context_fingerprint`로 확인을 취소한다. 취소의 fingerprint는 **원 record의 값**이며, session→batch 현재 context 값으로 바꾸지 않는다.

내부 RPC는 snapshot-v2-session scope의 정확 POST 경로 네 개만 추가한다: read, complete_with_attestation, mutate_weight_with_attestation, retract. 원 scope는 `verify_scope_pre_weight_attestation_20261014` alias로 보존한다. 신규 public RPC execute는 service_role만, private helper/table은 API principal에 직접 권한을 주지 않는다. 서버는 기존 로그인·계정 session authority와 응답 래퍼를 유지한다. stale subject/context/revision·옛 receipt·새 control OFF는 명시 오류로 반환하고 체크를 조용히 버리거나 기존 RPC로 fallback하지 않는다.

완료/나중 실측 UI는 별도 unchecked 항목을 소비한다. OFF나 조회 실패에서도 기존 실측/skip을 이용할 수 있고, owner/generation/target 또는 늦은 응답이 바뀌면 기존 체크가 다음 대상에 붙지 않아야 한다. measured/depleted 뒤에도 개인 조회/취소 진입을 제공한다. UI·화면 검증 결과는 별도 UI 작성자 freeze로 통합한다.

## 검증과 한계

실제 운영 접근 없이 root가 검증한 제한 schema219/비밀번호 없는 roles 사본을 pinned PostgreSQL17.6·network none·host port/mount0·새 UUID label 환경에 복원했다. seed 전 147개 비시스템 application 표 전부0행을 검사하고 원 C03→C01→C04 여섯 SQL을 실제 postgres/NOSUPER 및 worker supabase_admin actor로 적용했다. 모든 테스트 자료와 credential/hash는 합성이다. 원 함수/권한/headers/claims/guard를 완화하지 않았다.

기능 native **14 PASS / 0 FAIL / 0 SKIP**: 실제 nested C01 저장, read/retract/OFF/replay, stale·foreign·직접 ACL 거부, 완료와 나중 실측 append 실패 rollback/같은 키 retry, 원 revision과 잔량 revision 분리, 실제 진행 중 wrapper와 OFF 잠금, 실제 dump→별도 ownedDB restore의 두 새 표/5FK/삭제 cascade, 신규 helper ACL drift 거부, worker 불변. 원 public/private453함수에서 변경은 scope outer 한 개이며 alias의 원 body/owner/ACL/config/volatility를 보존했다. worker catalog `de001df9…`와 synthetic policy/credential 원값이 동일했다. source postimages 10개와 private 두 표 ACL/RLS는 명시 opt-in inventory로 등록한다. 기존 C03/C01/C04 기본 기대값을 낮추지 않는다.

초기 실패는 별도 보존한다: source-only 역사 replay의 pg_temp 설정 차이 exact guard 거절; primitive fixture temp-table/UUID wrapper; synthetic policy seed 누락; psql autocommit의 seed marker; 불완전 영양 5항목 seed; 원 account-delete marker 누락. 제품 SQL/guard를 바꾸어 통과시키지 않았다.

배포용 expected catalog는 **실제 AFTER 관측에서 학습하지 않는다**. schema dump→restore의 물리 metadata는 운영의 ACL 배열 순서/owner ACL·dropped-column attnum holes·기존 CHECK 표기와 달랐다. root가 허용한 비밀/개인 행 없는 227 readonly metadata와 native의 동일 default-context before→after를 대조했다. 새 함수9+scope outer1+표2만 허용하고 기존 함수456·관계149·namespace/role/member를 그대로 보존한 delta를 승인된 실제 BEFORE metadata에만 투영했다. before `d9e0c390…`를 다시 검산하고 expected after `74f7917f…`, 원 outer=새 alias를 산출했다. 기존 자료와 권한을 정규화하거나 새 baseline으로 승인하지 않았다. 이 결과의 채택은 root의 독립 검토와 배포 도구 검증에 달려 있다.

초기 v1 auxiliary immutable 계산은 full-catalog 관계만 필터해 원 immutable query의 index/sequence까지 포함한 98관계를 재현하지 못했으므로 **부적합**으로 보존한다. 기존 query를 변경하지 않고 root가 제공한 정확 immutable metadata·query SHA와 원 outer만 교체한 delta를 v2로 결속하고 PostgreSQL jsonb 직렬화로 재검산했다. v1 core full/scope/native delta는 유지한다. 원 whole immutable `1fd6bb45…`→`a61dbaa1…`, stable `61b7c4b4…`는 불변이다. v1aux/Python shortcut 실패와 source-only 준비 실패는 통과 수치에 합치지 않는다.

현재 게이트로 준비한 원 pre-request 함수가 정확 새 POST RPC 네 개를 synthetic decoded service claims로 허용하는 별도4검사도 통과했다. 실제 JWT 서명 전송과 운영/실사용자 HTTP 인증을 검증한 것은 아니다. root/tool 작성자의 전체 보호 engine 227→228 및 ON/OFF/worker 교차 회귀·독립 source 검토·운영 복구 검증은 별도 후속이고 기능 native14로 대체하지 않는다. 운영·수집·모델/평가·외부 AI 호출은0이다.
