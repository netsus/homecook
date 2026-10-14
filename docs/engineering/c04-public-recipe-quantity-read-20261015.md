# 공개 레시피 수량 contract 조회 정합성

C04 상세 화면과 preview는 `X-Homecook-Quantity-Contract: quantity-v4`를 보낸다.
레시피 API가 익명 조회에도 `quantity_input` 컬럼을 선택했지만, 기존 공개 read adapter의
exact projection 목록에 없어서 세션 확인 오류로 분류됐다. 이 조합은 5be→6b에서 추가됐으며
79e의 UI 후속 변경과 독립적이다.

`recipe-detail`의 기존 source-kind ingredient projection 앞에 `quantity_input,`을 붙인
정확한 목록 한 개만 허용한다. 기존 목록·method/path/scope·단일 parent filter·query keys·
정렬 조건은 유지하고 wildcard/추가 product·owner 컬럼/다른 테이블/추가 필터/쓰기 요청은
거부한다. 비공개 레시피와 공개되지 않은 소유자의 데이터는 기존 RLS와 API 가림 응답을 따른다.
제품 이름/버전은 기존 공개 전용 RPC의 조건을 그대로 사용한다.

recipe 수량 snapshot은 schema/raw 입력/분수/정규량/표시량/품질/이유/근거·source version IDs와
context hash로 제한된다. owner/session/token/contact는 없다. recipe SQL은 batch revision 입력을
거부하고 batch basis를 null로 생성한다. API normalizer는 추가 키·batch 참조·제품 version 불일치를
거부한다. 이를 일반적인 ‘아무 public metadata’ 형식으로 바꾸지 않는다.

DB pre-request는 기존 recipe-detail GET/recipe_ingredients 경로를 이미 허용하고, 기존 table SELECT와
recipe-parent RLS를 사용한다. 이 수정은 DB 함수/alias/권한/지문/원장/행/worker를 바꾸지 않는다.
세션 검증 wrapper를 생략하거나 익명 scope를 다른 조회에 재사용하지 않는다.

헤더 없는 DTO와 인증된 조회는 유지한다. 공개 preview는 조회수를 올리지 않고 일반 상세 방문의
기존 조회수 의미는 유지한다. 일반 상세 GET은 부수효과가 있어 자동 재시도 목록에 추가하지 않는다.

검증은 실제 API→SDK→익명 gateway를 연결한 소유 mock과 기존 관련 회귀로 수행한다.
실제 API/DB/브라우저/키·운영 실행은 총괄의 별도 단계다. 이 protected policy 파일을 일반 배포에
넓게 허용하지 않으며 총괄이 검토한 exact before/after bytes만 기존 도구에 별도 결속한다.
