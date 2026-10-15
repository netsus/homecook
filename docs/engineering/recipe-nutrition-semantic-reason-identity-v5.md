# 개인 레시피 영양 사유 식별자 v5

이 문서는 개인 레시피 복사·수정에서 동일 본문의 영양 스냅샷을 안정적으로 재사용하는 저장 계약이다. 계산 엔진은 `recipe-nutrition-v4` 그대로이며, 개인 quantity-v4 준비 결과의 저장 payload만 `recipe-nutrition-v5`를 사용한다. 수동 등록·공개, 추출/worker, 수치 공식, 기존 content/input hash는 바꾸지 않는다. v3 개인 저장과 기존 v4 요청도 원계약을 유지한다.

## 문제와 보호 경계

계산기는 초안의 `row_key` 또는 재료/제품 ID를 missing reason에 사용한다. 복사 시 실제 저장 행 UUID가 새로 생기므로 첫 복사와 같은 본문의 다음 수정이 서로 다른 사유를 만들었다. `(recipe_id, input_hash, calculation_version)`가 같지만 missing reasons가 다르면 기존 writer의 `SNAPSHOT_IDENTITY_COLLISION` 거절은 올바르다.

최종 사유를 새 행 UUID로만 바꾸어도 충분하지 않다. raw quantity와 source marker가 없는 일반 재료는 삭제 후 동일 재료를 재추가하면 UUID가 바뀌면서 content hash는 같을 수 있다. v5는 저장 행의 일대일 대응을 검증한 뒤 의미상 출처로 사유를 식별한다. 과거 스냅샷과 content/meal 연결은 수정하지 않는다. 실제 predecessor가 달라져 영양 사실이 달라지는 경우의 충돌도 계속 거절한다.

## 정확한 식별자

`private.map_recipe_nutrition_reasons_v5(uuid,jsonb,jsonb,jsonb)`가 아래 tuple의 PostgreSQL `jsonb_build_array(...)::text`를 UTF-8 SHA256으로 해시한다.

```text
[
  food_product_id가 있으면 "food_product", 없으면 "ingredient",
  (food_product_id ?? ingredient_id)의 canonical UUID text,
  고정 food_product_nutrition_version_id의 canonical UUID text 또는 null,
  nullif(btrim(component_label), '') 또는 null
]
```

최종 참조는 `row-v1-` + 소문자 64자리 hex다. component의 대소문자와 기존 SQL `btrim` 의미를 유지한다. 새로운 의미 정규화는 없다. recipe UUID, physical row UUID, 초안 row_key, 배열 위치, 수량, 단위, raw quantity, revision은 이 tuple에 넣지 않는다. 이들은 각자의 기존 내용·근거 검증을 따른다. 제품에 연결된 일반 재료 ID는 source/version/membership 검증에 사용하지만 제품 token의 출처는 제품 ID다.

요청 배열과 기존 `private.write_recipe_source_rows` 결과 배열의 위치를 연결한 후, 각 실제 target 행의 소속·유일성·전체 포함, 일반 재료/제품/고정 버전, component, amount/unit/type/scalable, 저장된 quantity snapshot을 대조한다. NULL인 일반 source marker와 기존 step mapper의 정상 marker 승격도 허용한다. 다른 target 행, 누락, 중복, 변경된 map은 거절한다. 새 클라이언트 map을 받지 않는다.

계산 alias는 원 요청 문자열의 case를 보존한다. `row_key`가 있으면 우선 사용하고, 없으면 `ingredient_id ?? food_product_id`를 사용한다. 같은 문자열 key가 전체 요청에서 여러 번 나오면 `<key>-row-<0부터 시작하는 배열 위치>`다. keyed/TO_TASTE 행도 count에 포함하며 제출 sort_order로 대체하지 않는다. UUID 관계는 canonical 값으로 비교하지만 alias를 먼저 소문자화하지 않는다. explicit key와 다른 행 fallback key 충돌도 거절한다.

v5에서만 정확한 `CODE:<alias>` 또는 `NUTRIENT_VALUE_MISSING:<alias>:<정확 영양소>`의 참조를 token으로 바꾼다. 기존 11개 reason code와 8개 nutrient만 허용하며 bare/unknown/빈 참조/추가 suffix/중복은 거절한다. 변환 뒤 전체 사유를 `COLLATE "C"`로 정렬한다. 행 참조가 없는 warnings, 수치·상태·quality·counts·sources는 바꾸지 않는다. low-level snapshot payload validator도 v5에 정확한 token 형식을 요구하므로 UUID형 v5 payload로 우회할 수 없다.

## 쓰기·읽기·적용 경계

신규 migration은 `20261014225200_recipe_snapshot_reason_identity.sql`이다. 번호는 DB229 뒤의 순서이며 실제 적용 시각을 뜻하지 않는다. 다음 기존 네 함수의 정확한 DB229 predecessor body만 변경하고 owner/ACL/OID/security/search_path/volatility/parallel은 보존한다.

- `private.recipe_quantity_mode_metadata_v4(uuid)`: raw가 없는 경우에도 원래의 hash·소유권·content 연결 검증으로 v4/v5 lineage를 확인한다.
- `public.write_personal_recipe_core(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,jsonb,jsonb,uuid,bigint,uuid,timestamptz)`: quantity mode의 v4/v5만 허용하고, 기존 receipt 재생 이후·저장 행 결정 이후·snapshot validator 이전에 v5 사유만 변환한다.
- `public.write_recipe_nutrition_snapshot(uuid,jsonb,timestamptz,jsonb)`: v5도 기존 quantity guard를 사용한다. immutable 전체 비교와 충돌 거절은 그대로다.
- `public.validate_recipe_nutrition_snapshot_payload(jsonb)`: v5는 기존 v4 exact warning/reason 집합과 수치 검증에 더해 정확한 semantic token만 허용한다.

신규 helper는 invoker/volatile/fixed search_path이며 PUBLIC·anon·authenticated·service_role 직접 EXECUTE가 없다. 새 테이블·컬럼·grant·RLS·RPC HTTP 경로가 없다. 기존 owner/session/generation/revision/source guard와 owner/recipe lock을 유지한다. SQL 적용은 helper 생성과 네 함수 변경을 한 transaction에서 수행한다. preimage가 다르거나 재적용하면 전체 실패한다.

현행 recipe/planner의 `mapRecipeNutritionSnapshot`은 이미 SQL writer를 지난 수치·정확한 warnings/sources projection을 검증하며 calculation_version/missing_reasons를 조회하지 않는다. signed quantity-mode 웹 reader도 DB의 기존 Boolean 계약을 사용한다. 따라서 현재 웹 source가 DB229의 v4와 신규 SQL의 v5를 읽는지 격리 native로 확인하고, 별도 reader 웹 변경 없이 DB 적용 후 새 개인 writer source를 반영할 수 있다. 새 v5 serializer를 DB229에 먼저 반영하면 quantity 쓰기가 거절되므로 이 순서는 허용하지 않는다.

SQL을 유지한 채 이전 웹 writer로 되돌리면 signed reader는 v5 lineage도 Boolean으로 읽고 기존 v4 payload를 만들 수 있다. 다만 이전 writer의 물리 행 참조 때문에 복사·삭제/재추가 또는 과거 v4 snapshot과의 identity 충돌이 다시 생길 수 있으므로 일반 쓰기 rollback의 안전성은 별도로 검토해야 한다. 새 v5가 생긴 뒤 SQL229로 되돌리는 것은 lineage 지원을 잃으므로 안전한 일반 rollback으로 보지 않는다. OFF fence/새 쓰기 정지와 검토된 복구 절차는 배포 담당이 별도로 결정한다. 과거 snapshot을 downgrade하거나 재작성하지 않는다.

영양 검토 HTML의 기존 read-only SELECT는 v5 분기에서만 snapshot.recipe_id로 현재 행을 제한한다. v5 이외의 기존 버전은 원래 전역 UUID PK 처리로 연결하고, v5만 정확한 semantic tuple로 연결한다. v1/v2/v3/v4 및 기존 validator가 허용하던 임의 nonempty legacy version의 동작을 새 allowlist로 좁히지 않는다. 제품-only 행을 일반 재료로 강제 집계하지 않는다. v5를 UUID로 fallback하지 않으며, 나머지 버전도 기존 UUID 문법 이외의 참조를 임의 추정하지 않는다. 과거 복사 사유가 다른 source recipe의 행 UUID를 가리키는 경우도 기존 보고서 조회를 유지하며, 과거 snapshot은 다시 쓰지 않는다. 보고서 운영 실행은 이 변경의 로컬 검사에 포함하지 않는다.

## 검증과 남는 경계

`tests/recipe-snapshot-reason-identity.native.test.ts`는 고정 SHA의 DB228 schema-only artifact에 DB229 SQL만 적용해 시작한다. application rows 0을 확인한 뒤 synthetic 자료만 넣는다. 고유 label/CID, network none, host mount/port 0인 소유 컨테이너만 만들고 정리한다. 원 schema의 RLS/ACL을 교정하지 않는다. DB229에서 real manual→publish→fork→동일 본문 새 key PATCH500을 먼저 재현한 로그와 신규 SQL/source의 GREEN을 분리 보존한다.

직접 회귀는 다음을 검증한다.

- real manual/publication은 v4 유지, 개인 v5는 원 v4 엔진의 수치·경고·sources 그대로 직렬화.
- 실제 동일 본문 수정·target UUID 재사용·성공 receipt replay·동시 동일 core 요청, 원 owner/revision fence.
- raw 마지막 제거 후 재열기와 수정, legacy generic 삭제→동일 내용 재추가에서 physical UUID가 바뀌어도 원 v5 snapshot 재사용과 과거 content snapshot 불변.
- 일반/linked/product-only/고정 버전/component, 원문 case/keyed/fallback/TO_TASTE/순서, 모든 reason/영양소 suffix, 누락·중복·foreign·source/version/value map 변조 거절.
- direct writer의 UUID형/uppercase/partial/중복 v5 reason 거절과 같은 identity의 다른 수치 충돌 유지.
- 기존 recipe/planner/signed mode reader의 DB229/신규 SQL 읽기, 네 정의+helper1 외 함수 변경0·기존 함수 권위와 critical policy/worker 설정 보존.

기존 `recipe-quantity-input-postgres.integration`의 개인 serializer 기대는 v5로 동기화하되, 그 fixture가 원래 검증하던 C04 v4 SQL 요청은 명시 v4 payload로 유지한다. 신규 v5의 실제 core map/writer 검사는 위 native가 따로 담당한다. HTTP 성공 영수증의 선행 조회 문제는 별도 변경이며 이 문서의 완료 주장에 포함하지 않는다. 실제 운영 DB·계정·키·AI/추출 실행과 배포는 수행하지 않는다.
