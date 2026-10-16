# 레시피 요청 역할: 기존 도구의231→232 준비

현재는 기존 보호 engine/CLI의232 고정 분기와 owned native 검증을 마치고, 총괄이 release `5a3926e5a188d48a0642317805ef5bca38958a30`과 `approved-recipe-role-review.json`의 PIN `2532d389a187907d649fc5a9cffae4cb8a8c9e38fdad80c1a74d010a41be6f0e`를 결속한 상태다. 실제232 적용은 아직 실행하지 않았다. 총괄이 확인한 현재 reader는 `0ae67d…`·DB231·worker48/ON이다. 웹 runtime 변경과 이 보정만을 위한 웹 재배포는 없다. 원15 PIN과231 SQL·review/receipt 및227/229 이력은 보존한다.

## 고정 범위

기존 `nutrition-database` / `nutrition-database-retry` / `nutrition-reconcile` 명령을 유지한다. 코드 고정 feature `recipe-future-request-role`은 별도 PIN/ref와 정확한231 committed predecessor가 있어야 선택된다. 새 CLI·engine·범용 SQL/path/권위 인수·ignore 옵션은 없다.

SQL은 `20261015100000_recipe_future_request_role.sql` 하나이며 SHA256은 `2322ccf737382e9738aa2c3d5cb50531c769c1a7902e2f621c8d378f9ce1505e`다. postgres DDL과 supabase_admin ledger 쓰기를 같은 transaction으로 처리한다. `private.verify_full_local_internal_scope()` 하나의 source/definition만 바꾼다. owner/ACL/config, 나머지108 union 함수·전용11 함수 중 나머지10개, receipt19열/제약/RLS·validator·control은 보존한다.

원231 registry는 계속 검증한다. 새 고정 postimage JSON은232를 명시해서 선택한 경우에만 outer 하나를 대체한다. 전체 catalog/immutable, C01·attestation·recipe scope, 열 metadata, worker critical catalog/credential48/policy를 비교한다. 새 normal projection은 대상 표의 현재 행 전체를 읽어 receipt의 NONNULL HTTP fingerprint와 원 quantity_input도 포함한다. 원231의 역사18열 projection은 그대로다.

기존5초 lock·snapshot/전체 backup decode·SQL/ledger 원자 commit·ACK unknown의 동일 intent read-only reconcile을 재사용한다. 새 SQL 입장은 current231 committed worker receipt를 요구한다. 자기 pending232에서는 고정 review, operationId/from/to/target/sourceReader와 attempt bytes가 같은 precommit 상태에서만 원231을 참조할 수 있다. 일반 current loader는 pending/unknown에서231로 후퇴하지 않으며 reconcile은 새 SQL을 실행하지 않는다.

## reader·worker·후속 웹

현재 reader ref/build/plist와 원 네 reader source SHA를 SQL/COMMIT 직전에 재확인한다. worker policy/key/process를 바꾸지 않고 원231 activation을 직접 predecessor로 삼아232 readback receipt만 발행할 수 있다.232 반복은 같은 receipt를 반환한다.231 생략·foreign/unknown 이력·unknown worker는 거절하고 원227 verification과229/231 receipt 원문을 보존한다.

현재231 웹 marker는 정확한 sourceReader/ref/marker가 그대로일 때232의 기존 reader로 인정한다. 후속 정상 웹 배포가 이미 적용된232 SQL source를 포함하면 고정 SQL digest·전체 적용 ledger·232 committed record와 reviewed source ancestry를 확인한다. partial/foreign SQL·미확정 guard의 승계는 거절한다. active R2 승계 경로에는 이 예외를 전달하지 않는다.

## 검증의 한계

합성 authority의 engine 회귀는 단일 payload/ledger commit, SQL 실패 rollback, 행 지문 drift 거절, ACK unknown과 동일 intent reconcile, 같은 operation pending 입장과 실제 CLI의 reader/worker 재검사를 확인한다. 실제 worker producer→consumer 함수 회귀는231→232·232 반복·잘못된 이력 거절과 발급/정책변경/재시작0을 확인한다. 설치 snapshot에는 새 JSON 하나를 추가하고 원 registry를 유지한다.

SQL/native 요청 경계 재현과 총괄의 운영 metadata READ ONLY 투영은 별도 증거다. 총괄 actual231 전체 catalog는 `80fbf73b…`, outer 하나만 투영한 expected232는 `440554c06775d1c9408f9bd8f16704aa7694489c5e08c4168432a4d245d23424`다. 실제232 AFTER 관측이 아니다.

Owned engine native는 실제232 SQL/ledger 원자 commit, 실제 DDL 뒤 강제 실패의 전체 rollback, 전체 백업 decode·231 복원, COMMIT ACK unknown 뒤 동일 intent read-only reconcile을 통과했다. 비어 있지 않은 개인 확인 사실3건(확인2·철회1), meal raw `1/2`·recipe raw `1/3kg`, NONNULL HTTP fingerprint receipt1행의19열 전체와 control/worker 지문을 보존했다. 원109/전용11 함수 중 outer 정의 하나만 달라졌고 소유 컨테이너4개는 모두 삭제했다. 초기3회 runner fixture 실패 원문과 기존 source/native 동결 증거는 보존한다.

이 native의 PIN/권위는 소유 사본의 합성 marker와 정확한 새 review bytes 결속이며, 실제 운영 승인 chain·원15 PIN 검증을 대신하지 않는다. 정확4표 metadata bootstrap과 origin 복귀를 검증했으나 인증 bootstrap은 검증하지 않았다. 정상 receipt seed는 기존 native의 legacy GUC 지원 요청을 사용했고,232 뒤 JSON-only dispatcher의 정상 tuple receipt 조회를 확인했다. 실제 운영 JSON-only PATCH 저장 성공으로 확대하지 않는다. 이 준비에서 실DB·key·AI·운영 적용은0이다.
