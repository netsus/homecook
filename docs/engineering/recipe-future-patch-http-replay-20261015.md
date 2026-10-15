# 개인 레시피 수정의 HTTP 성공 재시도

2026-10-15 로컬 후보다. 운영 미적용이며 A의 개인 영양 사유 v5와 별도로 검증한다. 신규 endpoint·일반 멱등성 저장소·UI 자동 재시도는 추가하지 않는다.

## 고치는 경계

기존 `PATCH /api/v1/recipes/{id}`는 성공 영수증을 읽기 전에 현재 revision·수량 근거와 영양을 다시 준비했다. 첫 저장으로 revision 또는 미리보기 상태가 바뀌면 같은 키·본문의 성공 결과도 복구하지 못했다. 새 순서는 기존 정적 입력 검사, 현재 검증 세션, 정확한 성공 조회, 없는 경우에만 기존 쓰기 조건·영양 준비·저장이다. GET/DELETE는 바꾸지 않는다.

현재 소유자·계정 세대·유효 세션, 대상의 본인 소유/private/nondeleted 조건은 성공 재조회에도 필수다. URL의 대소문자 UUID는 검증 후 같은 canonical recipe UUID로 사용한다. 같은 소유자·세대의 새 유효 세션에서도 정확한 성공을 조회할 수 있다. 현재 revision/미리보기 소비/영양 출처 변화나 quantity 환경·DB OFF는 이미 성공한 결과의 조회를 새 쓰기로 바꾸지 않는다.

조회 오류, 비성공 영수증, legacy NULL 바인딩, 다른 본문·결과 형식 오류는 없는 요청으로 처리하지 않는다. 동일 키의 다른 요청은 기존 `409 IDEMPOTENCY_KEY_REUSED`를 유지한다. 잘못된 내부 응답은500이며 기존 인증·404·409·422·오류 래퍼를 유지한다. OFF에서 새 요청은 기존 차단 조건을 계속 통과해야 한다.

## 요청과 기존 영수증의 결속

신규 SQL은 [`20261014225300_recipe_future_patch_http_replay.sql`](../../supabase/migrations/20261014225300_recipe_future_patch_http_replay.sql)이다. `public.mutation_idempotency_keys.recipe_future_http_request_fingerprint text NULL` 한 컬럼만 추가한다. default/backfill은 없다. CHECK는 NULL 또는 `recipe_future_patch` scope의 `recipe-future-patch-http-v1:<64 lowercase hex>`만 허용한다. 기존 unique/index·prepared payload_hash·state·결과·retention은 그대로다.

`private.recipe_future_http_request_fingerprint(uuid,jsonb,text)`가 DB에서 같은 지문을 만든다. preimage는 고정 schema/method(PATCH)/canonical recipe UUID/요청 quantity contract/원 요청 전체다. 원 요청은 base revision, draft 전체(title/description/base servings/ingredients/steps), future strategy, impact token, image object ID다. 없는 description/image는 NULL로 통일한다. 재료·단계의 모든 JSON 속성과 배열 순서, raw quantity 문자열, 제품/버전·row key·source kind·context·단계 참조를 보존한다. JSON 객체 키 순서와 숫자 scale만 동일 의미로 정규화하며 title·원문을 추가로 trim하거나 배열을 정렬하지 않는다. mutable 영양 결과·현재 근거·env·시간·세션은 지문에 넣지 않는다.

서비스 전용 함수는 다음 둘뿐이다.

- `public.read_recipe_future_patch_result(auth5, recipe_id, request_body, quantity_contract, idempotency_key)`: 현재 authority와 원 recipe lock 뒤 owner/gen/scope/key를 확인한다. 내부 응답은 정확히 `{state:'absent',result:null}` 또는 `{state:'succeeded',result:<원 응답>}`다. 성공은 terminal succeeded·attempt/lease NULL·result_reference·정확한 durable success/id/양의 정수 revision을 모두 요구한다.
- `public.write_recipe_future_plan_change_recoverable(auth5, recipe_id, request_body, quantity_contract, idempotency_key, nutrition_snapshot, nutrition_predecessor_guard, now)`: 같은 성공 조회를 다시 한 뒤 absent에서만 원 15인자 `write_recipe_future_plan_change`를 호출한다. 원 writer의 성공 직후 같은 transaction에서 현재 owner/gen/scope/key의 신규 NULL 지문 영수증 한 건을 결속한다. 결과·완료 상태·attempt/lease NULL·UPDATE의 반환 지문까지 일치해야 한다. 연결 실패는 recipe·계획·스냅샷·영수증 전체를 롤백한다.

첫 조회 후 다른 요청이 완료되어도 기존 owner/recipe lock과 wrapper의 재조회가 중복 쓰기를 막는다. 같은 키·본문은 한 저장 결과, 다른 본문은 충돌이다. 이미 결속된 성공에만 새 prepared 값을 사용하지 않고 원 결과를 반환한다. 원 writer 자체의 body/signature/prepared payload_hash와 직접 SQL 재생·prepared 불일치 거절은 바꾸지 않는다. 기존 NULL 영수증을 현재 본문으로 소급 결속하지 않는다.

## 권한과 호환성

새 두 RPC는 postgres owner·SECURITY DEFINER·고정 search_path이며 service_role만 EXECUTE한다. private digest helper와 새 scope verifier는 일반/API 역할의 직접 EXECUTE를 허용하지 않는다. 기존 `recipe-future-propagation` scope의 POST `/rpc/read_recipe_future_patch_result`, POST `/rpc/write_recipe_future_plan_change_recoverable` 두 경로만 추가하고 원 verifier를 exact preimage 확인 후 alias로 보존한다. 다른 scope/path/role·기존 R2/worker/계정 권한은 바꾸지 않는다.

owned DB228 schema-only+정확 DB229에서 관측한 원 scope verifier와 15인자 writer의 definition/source/owner/ACL/config/security를 migration이 먼저 검사한다. 알 수 없는 predecessor를 위임 대상으로 채택하지 않는다. 기존 함수는 outer verifier 교체를 제외하고 원 metadata·본문을 보존한다. 새 helper/RPC와 alias의 metadata는 native 증거에 별도로 기록한다.

receipt의 실제 owned baseline은 RLS=true·policy0·owner postgres·일반 역할 NOSUPER/NOBYPASS였다. source 초기 revoke 선언과 달리 표 ACL에는 기존 broad grant가 남아 있으므로 '표 grant 없음'이라고 주장하지 않는다. 이 변경은 실제 RLS/ACL/trigger를 교정하거나 확대하지 않으며 일반 역할의 직접 조회가 빈 결과이고 새 RPC/helper 실행이 거절됨을 별도로 검사한다. 기존 service 역할의 넓은 권한은 이 기능에서 새로 부여하거나 해결한 것으로 취급하지 않는다.

새 컬럼 때문에 전체 `to_jsonb(receipt)` shape에는 NULL 필드가 하나 추가된다. 보존 기준은 **기존 컬럼 전부 동일 + 기존 행의 새 컬럼 모두 NULL**이다. 전체 행 JSON hash 불변으로 표현하지 않는다. 옛 웹의 직접 writer는 추가 컬럼 뒤에도 그대로 작동하며 원 prepared 재생과 불일치 거절을 유지한다. 새 웹은 신규 SQL보다 먼저 배포하지 않는다. 신형 지문이 생긴 뒤 컬럼/함수를 제거하거나 기존 영수증을 재작성하는 일반 rollback은 제공하지 않는다.

## 검증과 통합 한계

전용 [`HTTP 회귀`](../../tests/recipe-future-patch-http-replay.test.ts)는 reader 선행, 성공 후 mutable 준비0, OFF 재생, malformed/transport/다른 ID 거절과 uppercase URL을 검증한다. 기존 HTTP 권한·predecessor 오류·원 래퍼 단언은 새 absent reader/현재 mode 계약에 필요한 fixture만 동기화한다. 원 writer를 직접 호출하는 기존 SQL 테스트는 새 이름으로 치환하지 않는다.

[`owned native`](../../tests/recipe-future-patch-http-replay.native.test.ts)의 B 단독 검사는 원 B 고정 소스에서 `HOMECOOK_RECIPE_PATCH_REPLAY_NATIVE=1`로 실행한다. 현재 A+B 통합 소스에서는 아래 두 플래그를 함께 지정한다. 단독 모드를 통합 소스에서 실행하면 소스 불일치로 거절하며 v4로 몰래 바꾸지 않는다. 고정 SHA의 schema-only228과 비밀번호 없는 roles, DB229 SQL을 사용한다. 초기 application rows0 뒤 synthetic 자료만 넣고 고유 UUID/label/CID·pinned PG17.6·network none·host mount/port0·pull never·자기 정리를 확인한다. 실제 PATCH의 DB authority/quantity mode/영양 준비/preview/원 writer/신규 SQL을 연결한다. HTTP transport와 세션 발견만 synthetic 인증 fixture다.

첫200→같은 키200, 계획 변경 한 번, 기존 NULL/완료 형식/원 prepared 충돌, raw/context/product version 등 원 요청 변경, 동시 같은/다른 본문, read/write 사이 성공, 유효 새 세션, 현재 소유/삭제/역할·scope 경계, 새 binding 실패 전체 롤백과 OFF/출처 변경 후 성공 조회를 분리 검사한다. singleton 삭제·영양 immutable 값 변경을 이용한 잘못된 fixture는 원 보호 거절을 보존해 교정했으며 실패 로그도 남긴다. 미확인 capability 상태를 강제로 만드는 보호 우회는 하지 않는다.

현재 통합 검사 명령:

```bash
HOMECOOK_RECIPE_PATCH_REPLAY_NATIVE=1 HOMECOOK_RECIPE_SAVE_INTEGRATION_NATIVE=1 pnpm exec vitest run tests/recipe-future-patch-http-replay.native.test.ts
```

[A의 개인 영양 사유 v5](recipe-nutrition-semantic-reason-identity-v5.md)와 통합한 격리 검사35개가 통과했다. 실제 API handler·SQL을 연결한 fork→동일 본문 새 key 수정→같은 key HTTP 재생, 두 SQL의 단일 transaction·중간 실패 전체 rollback, 합성 기존 식단/요리 세션/claim·원 수량/영양 snapshot·receipt 보존을 확인했다. 대조한 control9표 중8표는 각1행이며 lead_requests는0행이다. 같은 확장 검사 파일을 원 B 고정 소스에 연결한 단독34개도 별도로 통과했다. HTTP transport와 세션 발견은 합성 fixture이며 실제 OAuth/gateway 검증이 아니다.

로컬 검사·native 성공은 운영 적용이나 실제 사용자 UI 완료를 뜻하지 않는다. 운영 도구의 ledger·백업·복원·정확 source/postimage 승계와 운영 확인은 별도다. A는 수치 엔진·기존 v4/과거 snapshot을 바꾸지 않는 개인 저장 사유 identity 보완이며 B의 HTTP 바인딩과 혼동하지 않는다. 운영 DB·키·실제 계정·worker·외부AI/추출은 실행하지 않는다.
