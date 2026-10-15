# 레시피 수정 저장·재시도: 기존 배포 도구의 229→231 준비

현재 상태는 **도구 source·새 review 결속 완료, DB231·새 웹 운영 미반영**이다. 총괄이 release `0ae67d66c5ab330cf3f7ef7aff3a7ba40e99b1d7`과 `approved-recipe-save-review.json`의 새 PIN `0add1b4d75327a87417a3b3cad1b521f9d1327096e69cc0d753162e0d178cdfc`를 결속했다. 이는 실제 DDL 적용 증거가 아니다. 원14 PIN과 영양 validator 228→229·개인 227→228·C04의 원 receipt/verification은 보존한다.

## 고정 범위와 순서

기존 `nutrition-database` / `nutrition-database-retry` / `nutrition-reconcile` 명령을 유지한다. 새 profile은 코드에 고정한 최종 `--reviewed-ref`와 별도 review가 모두 결속된 경우에만 선택한다. 임의 SQL/파일/권위/경로/generation 인수는 없다.

1. 현재 운영 reader의 ref/build/plist와 A가 증명한 네 읽기 모듈의 원 SHA를 확인한다. 기존 `aad313…` reader는 v4/v5 읽기 호환 증거가 있지만 실제 작업 직전과 SQL dispatch/COMMIT 직전에도 같은 reader를 재확인해야 한다. 별도 reader 선배포를 만든 단계가 아니다.
2. 원 nutrition229 committed terminal을 직접 predecessor로 읽고 target/ordered ledger/catalog/scope를 결속한다. 미확정 개인/C04 writer intent가 있으면 입장을 거절한다. raw worker ON만으로 승인하지 않고 기존 current journal과 immutable activation chain을 읽어 정확한 current229 committed worker ON을 확인한다. 옛227/228 activation만 있는 상태나 pending/unknown worker는 새 SQL 입장이 불가능하다.
3. 기존 보호 engine의 5초 lock·동일 transaction·전체 snapshot export/백업 decode·원 postgres DDL actor와 supabase_admin ledger actor로 아래 두 SQL과 ledger229→231을 한 번에 적용한다. 중간230은 완료 상태가 아니다.
4. source/카탈로그·함수/권한·기존 데이터·개인 사실·모든 control·worker48을 검증한 뒤 별도의231 terminal을 발행한다. COMMIT/terminal 응답 불명은 원 guard와 backup을 보존하며 같은 intent의 reconcile만 가능하다. 새 guard가 pending/unknown이면 옛229 성공 상태로 후퇴하지 않는다.
5. committed231 이후에만 새 serializer/PATCH route와 보조 report SELECT가 들어 있는 exact full-source로 웹을 인계한다. 기존 일반 `--reviewed-ref … --already-applied-db --db-config … --test-script test:feedback-batch:web` 경로를 쓰되, 전체 source diff/각 파일 before-after SHA가 새 review와 일치해야 한다. 다른 SQL·추가 runtime·부분 인계는 거절한다.

고정 SQL:

- `20261014225200_recipe_snapshot_reason_identity.sql`: `b6050c12e60594267908b89ff02cff0c0344a52ccb79dc9a88d21e3c57e8fe66`
- `20261014225300_recipe_future_patch_http_replay.sql`: `aed773e0d27e6b6dd4af8e65fb933d73c89927faef1d1d36804eec8476fed9c7`

초기 진입에서 두 SQL뿐 아니라 해당 serializer의 명시 `recipe-nutrition-v5` 계약과 PATCH의 두 새 RPC 식별자도 고정된 두 파일에서 확인한다. 따라서 공백/주석만 바꾼 미동결 runtime이나 SQL0/1개·runtime한쪽만 들어간 부분 후보도 committed231 및 exact 전체 diff 없이는 통과하지 못한다. 이미 승인한 full-source가 실제 live ref의 조상인 이후 일반 편집은 기존 current231 증명을 재검증한다. 이 검사는 일반 JavaScript 의미 분석기가 아니며, 선언한 계약 식별자·고정 source closure와 독립 source 리뷰의 경계다.

새 engine/CLI/테이블을 만든 것이 아니다. 앱 SQL의 신규 private helper·service-only RPC·scope delegate·nullable receipt 열은 앱 단위의 별도 검토 대상이며 도구가 그 권한을 확대하지 않는다. 총괄은 격리 native와 독립 검토를 거쳐 새 release/PIN 및 예상 메타데이터를 결속했으며, 실제 반영 결과는 별도로 확인한다.

## 함수·receipt·카탈로그 증거

`recipe-save-recovery-source-function-postimages.json`은 기존 변경5개와 신규5개, 그대로 남는15인자 writer1개를 분리한다. 원103 source registry는 그대로이고 `includeRecipeSaveRecoveryFunctions`를 명시한 경우만109개 union/전용11개를 검사한다. 원 attestation 전용10개 검사는 새 outer의 postimage만 선택해 비교한다. SQL 원 bytes·별도 registry SHA·원 owner/ACL/config/security/volatility와 scope alias body를 함께 확인한다. worker critical catalog `de001…`·동일 gen48/source/credential/stable policy는 유지해야 한다. 정적 교집합0은 실제 worker 건강 검증을 대신하지 않는다.

기존 normal-data SQL과 원 보호 PIN은 바꾸지 않는다. 새 profile의 `RECIPE_SAVE_NORMAL_DATA_SQL`만 `mutation_idempotency_keys`를 정확한 기존18열로 읽는다. 새 `recipe_future_http_request_fingerprint` 열 하나를 제외해 DDL로 생기는 NULL 키를 기존 데이터 변경으로 오인하지 않는다. before/after의 열·제약 전체 SHA, 고정 새 SQL/전체 catalog도 별도 비교하므로 다른 열을 일반적으로 무시하지 않는다.

DDL transaction의 postimage에는 새 열 allNULL이 필수다. 이후 실제 PATCH가 저장한 nonNULL은 정상 상태이므로 current231 읽기/일반 웹/기존 safe OFF에 allNULL을 영구 조건으로 적용하지 않는다. 정상 사용자 쓰기 이후 normal-data SHA도 옛 terminal과 영구 동일하게 요구하지 않는다. 원량 `quantity_input`은 기존 normal projection 밖이므로 통합 native에서 행 전체·quantity_input SHA를 별도로 보존/복원 확인해야 한다.

## 기존 worker와 복구 경계

기존 worker current-proof의 `databaseMaintenance`에 새231 binding을 넣고 원229 binding은 `predecessorMaintenance`로 보존한다. 새 guard/terminal/source/target와 원 개인228 successor 및 worker48 권위가 연결돼야 한다. 원229의 committed activation만 새231 current readback의 역사 근거로 사용하며 unknown/pending intent는 경계를 넘겨 재활성화하지 않는다. 새 issue/renew/CAS/재시작이나 실제 job/AI 검증을 추가하지 않는다. 기존 pause/resume/activation 명령이 실행될 때도 fresh catalog·source/credential·whole/stable policy·queue/permit/enqueue·서비스 검사는 유지한다.

이미 ON인 상태의 기존 `--activate`는 정확한 committed229 predecessor를231 receipt로 새로 발행하고, 같은231 반복은 기존 receipt를 반환한다. 원227 verification과229 receipt 원문은 보존한다. 발급·정책 ON·설치·재시작 없이 실제 함수의 engine→verify→publisher→consumer 연결 회귀로 확인했다. 서비스 검사는 현재 health와 현재 안정 PID의 일치를 확인하며 과거 post/verification PID와 같을 필요는 없다. 이231 readback의 실제 운영 실행은 아직 남았다.

SQL/COMMIT 경계의 자기 pending231 guard는 새 review PIN, 원229 terminal, operationId/from/to/target/sourceReader와 operation의 attempt 원문이 같은 `applying_precommit` 또는 `commit_dispatch_guard`일 때만 원229 worker 근거를 검사할 수 있다. 일반 current loader는 계속 pending/unknown을 거절하며 범용 우회 옵션은 없다. 이 worker admission은 새 SQL 실행에만 적용한다. 기존 read-only reconcile은 unknown DB 결과를 정확한231/229 관측으로 확정하는 경로를 유지하고 새 SQL을 재실행하지 않는다.

이번 full-source는 runtime이 바뀌므로 이전229의 runtime 동일 A/B 웹 보상 예외를 재사용하지 않는다. 새231 full-source 교체 실패는 자동 구 writer/DB rollback이 아닌 forward repair로 처리한다. 빌드/준비 실패로 아직 교체하지 않은 reader는 그대로 남는다. 원 228→229 exact A 보상 규칙은 유지한다.

## 검증과 남은 단계

단위·owned native 검사는 소유 임시 사본의 합성 PIN/권위를 사용하며 실제 운영 승인 chain·설치·reader/worker 검증을 대신하지 않는다. 정상 engine 검증 진입점은 기존 `createProtectedPrelaunchDatabaseEngine({ review, reviewSha256, operationId, readMigrations, adapter, journal, assertBoundary })`다. 테스트는 운영 release/PIN 결속 후에도 합성 값으로 격리하고 실제 root/config/credential을 읽지 않는다. 운영 소스의 새 release/PIN은 위 값으로 결속돼 있다.

확인 대상은 두 payload 순서·두 번째 SQL 실패 전체 rollback·reader 손실·ACK/terminal unknown·exact intent reconcile·실제 deploy prebuild entry·부분/foreign SQL 거절·source handoff·기존229 경로·현재231 worker와 old229 unknown 거절·정확 설치 snapshot import다. packaging은 기존 정적 경로에 새 registry JSON 한 경로만 추가한다. SQL은 기존 migrations 디렉터리 closure로 포함한다.

V2 owned native는 실제 두 SQL/ledger의 원자231 commit·전체 백업 decode와229 복원·두 번째 SQL dispatch 실패 전체 rollback·COMMIT ACK 유실 후 같은 intent의 read-only reconcile을 통과했다. 합성 개인 확인2/철회1과 원1/2·기존 receipt18열/행을 보존했고 source109/전용11 함수와 열 메타데이터를 검사했다. 합성 권위 및 정확4표 metadata bootstrap의 한계는 유지하며 실제 승인 chain을 검증한 결과로 확대하지 않는다.

운영 before의 변경 대상만 투영한 예상 전체 catalog `80fbf73bd83091e9ef8c500cb406bae71764197b55de16f33e23638aa12483b4`는 READ ONLY 계산과 독립 검토를 마쳤다. 이는 실제231 AFTER 관측이 아니다. 격리 restore의 나머지 ACL·열 번호·CHECK 표현으로 운영 메타데이터를 덮거나 정상화하지 않았다.

총괄은 설치646의 기존 sealed artifact/descriptor staging 후 기존 `--activate`로 current229 worker receipt를 발행했다. 원227/verification·현재 PID·plist·기존 credential/secret·policy row를 보존했고 실제 AI·DDL·재시작은0이다. DB231과 새 웹 release의 운영 반영, 새231 worker readback 및 그 실제 결과 확인은 아직 남았다. 과거 앱 native나 기존229 native를 새 운영 반영 성공으로 합산하지 않으며 모든 운영 단계는 총괄이 담당한다.
