# 요리 실행분 수정의 분수 JSON 정밀도

## 실제 발견과 범위

운영 웹 `196c498f4e1ecc326d6bd7b6c22e4f0b2cb56ed6`·DB235에서 QA 레시피의 우유만 수정하고 밀가루 `1/7kg`를 그대로 두면 PATCH가422로 거절됐다. 밀가루의 원본 `quantity_input.normalized.amount`가 PostgreSQL numeric→JavaScript Number→JSON을 지나며 반올림됐다. 바깥 amount와 원본 identity는 같았고, 중첩 frozen proof 숫자만 달랐다. 모든 재료를 강제로 수정하거나 frozen proof를 삭제하는 우회는 사용하지 않는다.

## 수정 계약

후속 `20261019140000_cooking_quantity_json_echo.sql`은 요리 실행분 저장의 행 echo만 IEEE754 숫자 표현으로 비교한다. private 순수 함수는 number만 float8 JSON으로 투영하고, 문자열·키·배열 순서·배열 길이·null·boolean을 그대로 보존한다. 표현 범위를 벗어난 숫자는 거절한다. PUBLIC/anon/authenticated/service_role의 직접 실행은 금지하며 SECURITY INVOKER·immutable·고정 pg_catalog search_path와 extra_float_digits=3을 사용한다. 호출자의 float 출력 설정으로 비교 정밀도를 줄일 수 없다.

저장 함수는 기존 소유권·세션·상태·잠금·revision·멱등성 검사를 거친 뒤, 잠근 DB 원본과 명시된 request_changes로 expected rows를 만든다. 제출 행과 expected rows의 echo가 같은지만 비교한다. 이후 행 검증과 실제 저장에는 **정밀도를 유지한 expected rows만** 쓴다. 영양·예측·request_changes·receipt 비교는 투영하지 않는다. 원본 레시피와 과거 snapshot도 변경하지 않는다.

기존 save 함수 OID·owner·ACL·security·volatility·설정은 유지한다. 새 helper 외에 scope/권한/worker 변경은 없다. 원233–235 SQL·승인·guard·receipt는 보존하며, 운영 적용은 별도 후속 authority 검증이 필요하다.

## 검증과 적용 상태

- 운영에서 캡처한 schema-only232의 고정 fixture와 원233/234/235를 새 network-none·port0·mount0 PostgreSQL17 컨테이너에 적용했다. 실제 사용자 데이터·자격증명 복사 및 운영 연결은0이다.
- 기존26회귀와 새25회귀가 통과했다. 실제1/7kg 형태의 중첩 숫자를 JavaScript로 roundtrip하여 다른 행만 수정하는 저장·2차 revision·동일키 replay를 확인했다. 저장된 untouched proof의 numeric 문자열은 원본 그대로다.
- identity/evidence/text/key 추가·삭제/배열 순서/다른 float 값/numeric→string/flag 변조, owner/CAS/state/nutrition/prediction/changes 오류는 row·receipt 변경 없이 거절했다. helper 직접 실행과 overflow/underflow도 거절했다.
- DDL 중간 실패 rollback 시 전체 함수 catalog가 정확히 같았다. 적용 후 기존441함수는 같고 save1개 body 변경·helper1개 추가만 확인했다. 기존 save의 모든 catalog attributes 중 prosrc만 달랐다. 소유 컨테이너 정리를 확인했다.
- 타입 검사 통과. 독립 리뷰에서 제안한 float 출력 설정 고정·caller 설정 음성 검사·전체 기존 함수 존재 검사를 반영했다. 최종 통합 후 운영 적용·Chrome 재검증은 대기다. 격리 SQL 통과를 실제 음식의 무게 정확도로 해석하지 않는다.

실행: `node scripts/run-cooking-quantity-echo-postgres.mjs`. 로컬 보고서 `/tmp/homecook-cooking-echo-postgres-report.json`, 로그 `/tmp/homecook-cooking-echo-postgres.log`.
