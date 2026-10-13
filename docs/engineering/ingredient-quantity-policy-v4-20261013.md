# C04 단위 근거·첫 소비 묶음 — 명시 v4 준비

상태: 별도 작업트리의 로컬 구현·fixture 검증. 운영 미적용·활성화 OFF. 기본 계산은 여전히 `recipe-nutrition-v3`다. 첫 소비 묶음은 식사기록과 완제품 계획 신규 추가/재조회에 `quantity-v4`를 연결한다. 기존 완제품 계획의 수량 편집 UI·원문 상세 표시와 recipe 편집/저장·worker predecessor 소비는 다음 독립 변경으로 남았다. C03 제품 resolver·nullable 제품 행·고정 영양 버전과 C01의 무게 근거는 최종 통합 경계다.

## 2026-10-14 첫 소비 묶음

- 확인된 일반 음식은 DB의 canonical `default_unit`과 검토된 단위 옵션으로 추천한다. 일반 우유는 mL·양 빈칸이며, 영양 기준 g에 밀도가 없어도 입력 기본을 g으로 돌리지 않는다. 밀도 없는 200mL는 원량을 저장하고 영양은 unavailable/null로 표시한다. mL↔L은 정확 환산하고 g↔mL 실패는 기존 양·단위와 선택 초점을 보존한다. 검토된 profile 자체가 없으면 canonical 부피 기본/빈 양과 이유를 보여 주고 저장·preview를 막는다. 이름이나 분류 부분문자열로 밀도·식품 종류를 추측하지 않는다.
- 최초 일반 음식·제품·알려진 배치는 v4에서 양을 비워 둔다. 최근 기록의 양은 확인 제안이며 현재 source/profile/version·지원 단위를 대조한다. 확인 실패·규격 변경은 옛 양/단위를 보존하고 이유와 재선택을 안내한다. 구 v3/OFF 경로의 기존 최초 양·응답 계약은 유지한다.
- 분수 `1/2`, `1/3`, `1/4`, `3/4`는 원문과 numerator/denominator를 저장한다. 화면의 환산된 `quantity.amount/unit`과 최초 `quantity_input.raw_value/raw_unit`은 별개다. 1/3팩→40g 저장/미리보기·로그인 복귀는 원문 1/3팩과 선택 당시 version을 보존한다. 다른 version은409이고 복귀 후 자동 저장은 없다. 표시만 최대3자리/작은 양 `<0.001`을 쓰며 저장·계산값은 표시값으로 반올림하지 않는다.
- 알려진 batch 전체1000g/조리 당시4인분에서1/2인분은125g이다. 기존 원장의 canonical g 쓰기, 남은 양·revision·멱등 receipt를 재사용하고 원입력 인분과 당시 batch 분모를 별도 metadata로 저장한다. 추정 전체중량이면 약 표시를 유지한다. 무게가 없거나 legacy인 배치에 인분 환산용 가짜 g을 만들지 않는다. C01 `weight_basis`의9키는 수정하지 않는다.
- 원입력은 사용자가 새 기록/양을 명시 수정할 때만 생긴다. `quantity_input NULL` 과거 행·기존 revision·성공 receipt와 같은 양의 날짜/끼니 이동은 보존한다. OFF 후에도 이미 저장된 v4 원문/분모를 읽고, 영양 미상을0으로 바꾸거나 과거 기록을 재계산하지 않는다.
- 과거 ingredient 행의 개/통 같은 단위에 저장된 v4 근거가 없으면 기존 숫자 편집·원단위를 유지하고 이유를 안내한다. 이 legacy 경로에는 새 분수 계약/quantity_input을 억지로 붙이지 않으며 기존 revision·멱등 쓰기를 그대로 사용한다.
- 로그인 복귀 때 새 입력 capability가 OFF이거나 원단위의 제품 관계가 사라졌으면 원입력·선택 version을 보존하고 편집/저장을 중지한다. 새 draft를 v3 fallback으로 조용히 저장하지 않는다. 사용자의 명시 제품 재선택은 해당 pending을 지우며, 새 필드가 없는 구 pending 동작은 유지한다.
- 새 제품 옵션·100g/100mL 비교·선택 영양 표시는 C03의 같은 converter로 판단한다. 유일한 두 관계 환산은 허용하고 직접/우회 경로가 동시에 있으면 모호한 단위를 빈 양에서도 열지 않는다. 환산 실패 때 기준 영양값을 입력량의 값처럼 표시하지 않는다. default v3의 기존 direct 옵션/표시는 그대로다.
- 새 입력 흐름에서 중량 미확인 legacy batch를 최초100g으로 만드는 경로는 열지 않는다. 최근 기록의 기존 g 양은 보존하되 중량 기준 미확인 이유와 상태 확인을 안내하고 새 쓰기는 막는다. OFF/구 클라이언트의 기존 batch 동작과 과거 원장은 유지한다.

### 요청·응답과 활성화

새 클라이언트의 별도 `X-Homecook-Quantity-Contract: quantity-v4` header로 metadata 응답을 협상한다. C01 무게 header만 보내는 구 클라이언트에는 새 키를 보내지 않는다. 새 쓰기/단위 옵션에는 `MUMEOK_QUANTITY_V4_ENABLED=true`와 이 header, `private.quantity_input_v4_policy.enabled=true`, 실제 C03 converter가 모두 필요하다. migration은 DB policy를 false로 만든다. 환경·header만으로 활성화되지 않는다. 운영 활성화/근거 등록/DB 적용 승인은 이번 로컬 준비에 포함되지 않는다.

draft는 `schema_version`, `raw_value`, `raw_unit`과 목적에 맞는 `expected_batch_revision` 또는 `expected_product_nutrition_version_id`만 허용한다. client는 approved/evidence/source metadata를 주장할 수 없다. preview GET도 표시 `amount/unit`과 원문 `raw_value/raw_unit`을 구분해 보내고 writer와 같은 실제 DB resolver로 검증한다. 서버는 기존 actor/session·소유권·가시성·삭제·고정 제품 버전·배치 상태 검사를 보존한다. 기존 RPC에 jsonb 마지막 인수를 가진 overload만 더하며 기존 공개 권한을 확대하지 않는다.

읽기 snapshot은 raw 원문/n/d, `display_quantity`, 정규 g/ml 또는 null, direct/estimated/unavailable, 실패 이유, evidence ID/source version, 선택적 고정 batch 분모를 담는다. 제품은 자기 nutrition version의 관계만 사용하며 일반 density/piece fallback을 적용하지 않는다. 실제 수량과 display snapshot이 다르면 응답 검증도 거절한다.

### 추가 DDL와 복구 경계

적용 순서는 C03→C01→C04 `20261014010000`→`20261014200000`→`20261014210000`이다. 뒤의 recipe 소비 예약 `20261014220000`은 첫 묶음에 없다. C05는 `20261014230000`으로 별도 통합한다.

`200000`은 OFF private policy, nullable ingredient profile/measurement evidence 단위 metadata, nullable meal-log quantity_input와 private hydration/parser/batch resolver, 기존 writer/reader의 좁은 metadata 연결, preview overload를 준비한다. 기존 account authority·event 원장·상태/receipt 검사와 성공 재생 순서를 보존한다. `210000`은 product planner nullable quantity_input와 v4 제품 resolver/overload/read 연결, quantity_amount typemod 제거+유한 양수·기존 범위 check를 준비한다. recipe_ingredients.amount DDL은 C03 소유이며 중복 변경하지 않는다. 기존 행 backfill/원문/영양/상태 자동 재작성은 없다.

복구는 새 쓰기 env/DB policy를 OFF로 두고 저장된 v4 기록의 읽기 호환을 유지하는 방향이다. v4 행이 생긴 뒤 구 코드/정밀도 typemod로 무조건 복귀하거나 metadata/원장을 삭제하지 않는다. 기존 함수가 바뀌는 consumer migration의 복구는 해당 DB219+C03/C01 실제 preimage와 신규 기록 유무를 함께 검토해야 한다. 기존 deployment의 DB backward-compatible/manual rollback guard를 우회하지 않는다. 함수4개만 제거하는 아래 U0/U1 복구 초안은 foundation에만 해당하며 consumer의 자동 down 방법이 아니다.

### 검증 구분

U0/U1 원 freeze는 독립 reviewer가164개를 확인했다. 이후 whitespace parity 수정과 소비 구현 검사는 이 문서 작성자의 자체 검증이며 별도 최종 독립 review를 대신하지 않는다. 최종 관련37suite452개, schema-only219+자기 소유 network-none 컨테이너의 실제 writer/preview/read9개, typecheck·선택52파일 ESLint·신규 anti-slop0을 확인했다. 원 lint 규칙의 설치 경로 shim을 사용했고 동일 관련 lint를 별도 통과한 뒤 fake QA env/v4 OFF로 `next build --no-lint`를 확인했다. 자기 컨테이너를 제거했다. 제품은 승인된 C03 frozen converter helper를 fixture에만 선행 소비했다. 실제 C03 전체·C01 최종 source/SQL과 OFF/legacy writer byte 계약은 통합 후 다시 확인해야 한다. Next fixture320/375/1440의30PNG는 API/데이터가 synthetic인 화면 검사이고 운영 검증이나 실제 근거 등록을 뜻하지 않는다. 테스트용 서버/브라우저는 종료했다.

## 작은 계약

foundation calculator의 `amount/unit`은 원량이다. consumer는 화면 `quantity.amount/unit`과 `quantity_input`의 최초 원문을 분리한다. 계산 결과의 정규량 `amount + g/ml`, 단위 정의/환산 근거의 ID·source version, 영양자료 `basis_amount/basis_unit`를 구분한다. 입력 객체를 변경하지 않는다. 새 근거 정책은 `ingredient-units-v4`, 명시 recipe 계산 결과/해시는 `recipe-nutrition-v4`로 결속된다.

| 의미 | v4 허용 조건 |
|---|---|
| g/kg, ml/mL/l/L | 동일 계열 정확 환산. mL와 L은 표시명이며 정규 기준은 ml. 양수·유한값만 허용 |
| 새 앱 계량 선택 | 명시 `계량큰술=15mL`, `계량작은술=5mL`, `계량컵(200mL)=200mL`. 원문 단위의 자동 별칭으로 쓰지 않음 |
| 원문 T/t/cup/큰술 등 | 대소문자 구별. 원량 출처 `unit_context.source_id`와 정의의 승인 source ID가 같고 raw_unit이 정확히 같아야 함. 출처 언어/제목/국가 추정 없음 |
| 상충 계량 | 예: 2큰술(35mL)에서 승인 정의15mL와 reference17.5mL가 충돌하면 `UNIT_DEFINITION_CONFLICT`. 원문/양 유지, 조용히30mL로 치환하지 않음 |
| g↔mL | 동일 ingredient ID·preparation·가식부의 승인된 명시 `grams_per_ml` 관계가 필요. 이름이 물/우유여도 무근거1:1 없음 |
| 생활 개수/도구 | 입력 unit=근거 physical_unit=관측 unit, 관측량1, 관측중량=개당중량, 같은 재료/상태/크기/가식부. 통·알·쪽·개를 count라는 이유로 같게 보지 않음. 밥숟가락/스푼도 각자 승인 중량 없이15mL로 가정하지 않음 |
| 승인/불확실성 | 근거/출처 approved+active, source current+명시 version. 가식부는 edible/as_purchased 중 명시한 같은 기준. 유효 근거가 둘이면 모호함으로 거절. 평균 근거는 estimated로 유지 |

`unit_context`는 **서버가 실제 DB의 검토된 predecessor를 읽어 만든 입력**이다. 클라이언트 draft의 approved/ID/version 필드 주장을 믿어 만드는 계약이 아니다. SQL helper도 private invoker이며 실제 행을 읽거나 API 권한 검사를 대신하지 않는다. 기존 approval·소유권 검사는 앞선 소비 경계에 그대로 필요하다.

`getIngredientUnitChoices`는 같은 resolver로 1단위 변환을 검사하고 유효 추천1개/대안최대3개/추가단위만 반환한다. 단위별 정규량·정확/평균 상태·근거 ID와 원문 보존값을 제공한다. 유효한 명시 preference가 우선하며 없는 근거를 추천 때문에 허용하지 않는다. 음식별 새 기본 추천·최근 source/목적/버전 선택은 U2에서 이 contract를 소비한다.

## U0/U1 최초 인계 기록 (이후 첫 소비 묶음과 구분)

- v3 기본 상수, 기존 스푼15mL/cup200mL/count 의미 및 테스트 기대는 삭제·변경하지 않았다. 신규 v4의 미확인 영양은 unavailable/partial이며 실제 0 영양과 구분한다.
- 과거 snapshot/meal nutrition·양·원문·제품 영양 버전·batch 원장은 읽거나 다시 쓰지 않았다. 같은 v3 입력의 결과/해시와 fixture 값은 그대로다.
- C03 담당과 calculator 일반/제품 분리를 확인했다. 최종 통합은 C03 product 분기·nullable ingredient_id·source_kind와 이 v4 일반 분기를 모두 보존해야 한다. 제품에 일반 density/piece를 차용하지 않는다.
- 다음 연결은 실제 검토된 source 정의·밀도·piece observation/가식부를 predecessor hydration에 추가하고, version을 명시하는 신규 계산/preview/저장 경계에 전달하는 것이다. 현재 일반 meal-log preview/create 및 weight helper의 기본 v3 정책은 바꾸지 않았다. C01이 g 산출에 연결할 때 동일 resolver를 사용하고 batch 분모/추정 출처를 보존해야 한다.
- UI의 허용 목록·빈 최초 양·분수 입력·식사기록 생활단위·배치 인분, numeric 정밀도·후속 최근 기억은 이번에 구현하지 않았다. 과거 기록을 바꾸는 전역 단위치환, 제품 resolver 재구현, 팬트리 수량재고, 권한 확대, 외부 AI/자료 추정은 없다.

## U0/U1 foundation DDL 대상·복구 초안

후보 migration: `supabase/migrations/20261014010000_ingredient_quantity_policy_v4.sql`. 운영 적용 승인 artifact용 범위이며 이번에는 운영 실행하지 않았다.

대상은 새 private 함수4개뿐이다:

1. `private.ingredient_unit_v4_normalize_text(text,boolean)`
2. `private.ingredient_unit_v4_evidence_approved(jsonb)`
3. `private.ingredient_unit_v4_measurement_matches(jsonb,jsonb)`
4. `private.resolve_ingredient_quantity_v4(jsonb,text)`

테이블/컬럼/기존 함수/데이터/정책을 바꾸지 않는다. 새 함수는 postgres owner·고정 search_path·invoker·immutable이며 PUBLIC/anon/authenticated/service_role EXECUTE를 모두 거절한다. 새 공개 RPC/권한 grant는 없다. 이후 서비스 RPC 연결은 실제 승인 근거 조회와 기존 권한 아래 별도 검증해야 한다.

적용 전 대상 함수가 아직 없는지, 정확 migration 해시와 현재 v3 함수/자료 baseline, DB 백업·복구 상태를 확인해야 한다. 복구는 v4 소비를 중지한 뒤 새 resolver→measurement helper→approval helper→normalize helper 순서로 해당4함수만 제거하는 범위다. 신규 v4 snapshot을 과거 v3 계산으로 재작성하거나 기존 단위 helper를 역교체하지 않는다. 실제 운영 적용/원장 변경/rollback 명령 실행은 이번 권한에 포함되지 않는다.

## 검증과 한계

첫 v4 원문 cup/스푼/통 회귀3개가 기존 계산에서 잘못 완전 영양으로 남는 실패를 확인한 뒤 정책 분기를 연결했다. 새 contract, 실제 명시 v4 calculator, source cup200/240·T/t, 계량 충돌, density/piece/가식부·상태·크기·원문 source 결속, 평균·중복·만료·양수·overflow를 집중 검사한다. 모든 숫자는 synthetic fixture이며 실제 음식 근거로 적재하지 않는다.

SQL 검증은 독립 `/tmp/homecook-unit-v4-*`의 PostgreSQL15 UTF8·자체 Unix socket에서 실행한다. 함수 실제 실행과 JS 수량/quality/evidence 결과 parity, 기존 실제 v3 count 함수 의미, 고정 meal fixture 내용, runtime-role helper EXECUTE 거절을 확인한다. 이후 자신의 서버와 디렉터리는 종료·제거한다. 전체 운영 DB·모든 historical snapshot·실권한 API/화면 검증을 대신하지 않는다. 결과 수치와 최종 checks는 총괄 인계 기록에 별도로 남긴다.
