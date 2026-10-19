# 장보기 생성 SDK/JSON 소비 경계

기준 `5208dcbdeb68bf6a229ca5a1c3156a868aa31148`(미사용 writer 정리 반영). 제품은 `app/api/v1/shopping/lists/route.ts`와 `lib/server/shopping.ts` 2파일만 변경한다. 전체 장부/CSoT/inventory는 부모 통합 작업에서 갱신한다. 이 문서 작성 시 커밋/머지/운영 반영은 아직 하지 않았다.

## 작은 변경과 유지한 경계

- POST의 실제 읽기 5표와 joined recipe_content_snapshots 1표를 local native SDK 계약으로 선언한다. Row interface는 mapped identity로 표현하고 meals의 embedded `recipe_content_snapshots`는 실제 Row에서 Omit한다. 실제 nullable FK와 `isOneToOne:false`가 단일 nullable join 결과를 추론한다. 쿼리 문자열·필터·정렬·선택 순서는 변경하지 않는다.
- 원 request client를 구조적으로 직접 대입하여 기존 해당 연쇄 단언 1건을 제거한다. bootstrap/growth와 source factory는 그대로이며 새 권한/adapter/캐스트/검사 억제를 추가하지 않는다. Insert/Update never는 SDK의 delete 메서드나 런타임 grant를 없애는 deep-readonly 보장이 아니다.
- snapshot `ingredients_json`은 unknown이다. 원소의 모든 필드를 한꺼번에 검사하지 않는다. null/undefined JSON, 문자열 JSON의 기존 빈 identity 반복, primitive/빈 배열/빈 object 원소의 skip 동작을 유지한다. JSON object 자체가 iterable이 아닌 경우와 null 원소는 기존처럼 TypeError다.
- generic 집계가 실제 소비하는 amount/unit/display_text/ingredient_type만 unknown으로 받는다. `typeof amount !== number`는 기존 Number.isFinite false 경로와 같으며 문자열 amount를 숫자로 바꾸지 않고 text fallback으로 보낸다. unit.trim은 기존 양수 숫자 QUANT 경로/overflow 검사 후에만, label.trim은 실제 truthy fallback 또는 이름 복구가 필요한 RHS에서만 확인한다. 새 Number(), 누락 채우기, 수량 추정은 없다.
- 상품 경로도 원래 typeof-number 산출 조건과 raw unit payload를 보존한다. `ProductAmount`의 공개 strict 타입과 quantity 수학/helper는 변경하지 않는다. 구매 제안용 strict 입력만 number+string일 때 쌓고 나머지 pair는 null로 닫아 기존 변환 결과 null을 보존한다. 예를 들어 unit 42는 원래 RPC/응답의 amounts_json에도 42로 남으며 구매 제안만 null이다. 이것을 정상 입력 타입으로 권장하거나 JSON 원문을 고친 것은 아니다.

SQL 근거는 core schema(ingredients/recipes/recipe_ingredients/meals), `20260729170500_recipe_snapshot_authority_foundation.sql`(배열 JSON 및 nullable meals FK), `20260731110000_product_ingredient_link_contract_runtime.sql`(pantry nullable ingredient와 product/version), `20260802130000_personal_recipe_customization_write_core.sql`(nullable product/version), `20261013190000_recipe_product_only_identity.sql:66`(recipe_ingredients nullable ingredient)이다. snapshot JSON 배열 제약은 각 원소의 세부 필드까지 보증하지 않는다. SQL/RLS/권한/worker/환경은 변경하지 않았다.

## 의도적으로 달라진 malformed ID 처리

truthy 비문자열 ingredient ID(42/object), product ID(42)는 예전처럼 후속 SDK 조회/원자 RPC를 시도하지 않고 로컬 wrapped INTERNAL_ERROR 500으로 닫는다. 응답 message는 `장보기 재료를 확인하지 못했어요.`, fields는 []다. 이 세 경우 새 회귀는 `/rest/v1/meals` 읽기 1회 외 ingredients lookup/원자 RPC/growth 0을 고정한다.

이전 500 관측은 실제 SDK가 만드는 URL/RPC payload와 fake-fetch의 UUID 22P02/400 응답으로 확인했다. 실제 DB/운영 PostgREST를 조회한 결과가 아니다. UUID SQL 소비 근거와 모형 오류 응답을 실제 운영 오류 시점/문구와 동일하다고 확대하지 않는다. 정상 ID/소유권/수량/상태 전이의 권한을 완화한 변화는 없다.

## 전후 증거와 발견한 실수

- 처음 수정 전 SDK 37 PASS(기존 core 10 복제 포함)를 확보했다. 상품 빈 amounts를 item 자체가 없는 것으로 잘못 기대한 초기 fixture 3 FAIL/29 PASS를 바로잡았다. 상품 row는 유지되고 amounts_json만 []였다.
- 중복 core 10은 기존 `shopping-create-sdk-contract`에 맡기고 JSON/정확 타입 사례를 집중했다. 최초 후보 95 PASS는 unavailableIngredients의 previous.name short-circuit 엣지를 놓쳤다.
- 부모/독립 리뷰가 찾은 이 엣지는 catalog 미반환·동일 ID 두 행에서 첫 label로 이름이 정해진 뒤 두 번째 숫자 label을 소비하면 안 된다는 것이다. 초안에서 표적 1 FAIL/29 이름필터 SKIP(TypeError)를 재현했다. guard를 previous.name가 없는 RHS에만 두어 해소했다.
- 정확한 5208 원본 route와 shopping.ts를 `.omx/evidence/shopping-json-consumption-20261020/`에 동결하고 별도 임시 Vitest 모듈 대조로 같은 30개 **30 PASS**를 확인했다. 현재 baseline probe snapshot도 이 ignored evidence 폴더에 보존했다. 실제 제품을 원복/전환하거나 검사를 완화하지 않았다.
- 최종 `shopping-json-consumption-contract`는 기존 동작/정확 타입 30 + 새 조기 500 동작 3 = **33 PASS**. 기존 SDK10 + preview/reconciliation48과 합친 명령은 4suite **91 PASS**, skip 0이다. 상품 raw unit은 RPC payload뿐 아니라 최종 응답까지 검사한다.
- 실제 기본 SDK → native6 직접 할당, 정확 recipes 선택행, nullable snapshot join의 unknown JSON, nullable ingredient/product/amount 선택행은 전체 비증분 compiler에서 검사한다. 별도 미등록 `shopping_lists` 음성 probe는 예상 TS2769 한 건만 거부했다. any/never fallback의 성공으로 계상하지 않는다.
- 제품+최종 exact-type 테스트의 전체 비증분 typecheck, 변경 ESLint `--max-warnings 0`, diff 검사를 실행했다. 초기 exact-type 전용 변수 2개는 lint에서 사용하지 않는 값 경고였고 실제 then 검사도 더해 해결했다.
- 최종 위 검사들은 exit 0이다. `verify:anti-slop` 전체 fixture/tool type/product 검사도 exit 0: **117/baseline207/신규0**, 기준118에서 해당 연쇄 단언 1건만 감소했다. 규칙/기존 baseline 파일은 변경하지 않았다.

실행 JS byte-identical 변경은 아니다. 소비 시점의 타입 확인과 위 malformed-ID 조기 응답은 실행 코드다. 원문/수량/revision/선택 순서/정상 결과의 보존은 차분 회귀 범위로 주장한다. 실제 운영 flow·모든 malformed 조합·DB 오류 응답을 검증했다고 주장하지 않는다. 이전 실패 실험/권한 3건/보류 444/별도 기존 실패 기준선은 유지한다.
