# 레시피 원문 수량 입력 v4 — 비활성 로컬 준비

2026-10-14. C04 U3의 수동 생성·개인 편집·공개 레시피 복사 소비자다. C03 고정 제품/영양 버전과 첫 C04 변환기를 재사용한다. 운영 적용·정책 ON·원본 데이터 수정은 이 문서의 완료 범위가 아니다.

- 새 수량은 `quantity_input`에 원문 `raw_value`, `raw_unit`, 서버 근거의 `expected_context_sha256`만 보낸다. 제품은 기존 고정 `expected_product_nutrition_version_id`도 요구한다. 클라이언트가 승인 여부·밀도·영양·환산 결과를 주장하지 않는다.
- DB는 기존 v4 파서와 변환기로 분자/분모, 표시량, 정규량 또는 unknown, 근거 식별자/버전, context 지문을 계산한다. `1/3팩`을 표시용 반올림값으로 저장하지 않는다. 실제 조리문장 숫자와 단계 재료 연결을 자동 변경하지 않는다.
- 일반 재료의 최초 양은 빈칸이다. 카탈로그의 v4 추천 단위를 쓰고, 프로필이 없으면 실제 기본 단위가 부피인 경우 mL, 나머지는 g로 시작한다. 프로필이 없어도 원문 수량과 직접 g↔kg/mL↔L 전환은 보존한다. 영양 프로필 자체를 만들어 내지 않는다.
- 같은 재료의 단위 전환에 근거가 없거나 상충하면 기존 양·단위·원문을 모두 유지한다. 알과 통, 제공량과 개수를 같은 단위로 해석하지 않는다. 제품에는 고정 버전 자체의 관계만 사용한다.
- context가 바뀌면 저장과 단위 전환을 막고 원입력을 유지한다. 사용자가 수량 정보를 다시 확인한 뒤 명시적으로 수량을 재입력하면 새 근거에 결속한다. 다른 제품·버전 교체는 기존 C03의 빈량 재입력 동작을 유지한다.
- TO_TASTE/텍스트 재료는 수치 양을 새로 요구하지 않는다. 기존 원문, null 양·단위, 비가변 여부를 보존한다. 원문 정보의 누락과 명시적 null 취소를 구분한다. 기존 정보가 있는 행을 구형 serializer가 몰래 지우면 거절한다.
- 기존 quantity 정보가 없는 행과 스냅샷에는 새 null 키를 끼워 넣지 않는다. 과거 스냅샷·원장에 UPDATE/backfill하지 않는다. 신규 스냅샷만 새 정보를 포함한다.

## API·복귀 계약

기존 `{success,data,error}` 응답을 유지한다. 쓰기는 `X-Homecook-Quantity-Contract: quantity-v4`, 웹 환경 ON, 기존 private DB 정책 ON이 모두 필요하다. DB OFF에서는 새 쓰기와 새 preview를 거절한다. 저장된 원문 읽기와 동일 성공 receipt 재생은 DB OFF에서도 유지된다. 웹 OFF의 신규 v4 요청 거절과 DB OFF의 기존 receipt 재생을 같은 계약으로 부르지 않는다.

기존 상세 GET은 헤더를 협상한 경우에만 저장된 quantity 정보를 노출한다. 신규 읽기 POST `/api/v1/recipes/quantity-input-context`는 최대 200개 행의 rowKey/ingredient/product/version ID만 받는다. 원문·수량·owner는 URL이나 요청 주장에 넣지 않는다. 기존 owner/계정세대 검증과 source 읽기 RPC만 재사용한다. 새로운 scope/grant/key는 없다. 다른 계정의 비공개 제품, 숨김·삭제, 잘못된 고정 pair를 거절한다.

수량 정보 읽기는 사용자가 누른 버튼으로만 실행한다. 로그인 복귀는 같은 owner/generation/revision의 초안만 재개하며 자동 POST/preview/PATCH/저장을 하지 않는다. 재확인 안내와 버튼을 보여 준다. 취소/닫힘/재료 교체 후의 늦은 응답은 무시한다. 실패 시 원문·분량·고정 버전은 지우거나 최신 버전으로 바꾸지 않는다.

## SQL와 검증 경계

로컬 후보 `20261014220000_recipe_quantity_input_v4.sql`은 nullable 컬럼과 source writer/일반 recipe snapshot/read/영양 guard·source v4 분기, preview 정책 잠금을 추가한다. 기존 actor/session/owner/revision/멱등성 보호와 RPC 권한은 유지한다. 새 private helper는 PUBLIC/anon/authenticated/service_role 직접 EXECUTE를 회수한다.

카탈로그 함수 정의를 수정하는 SQL 세션에서는 기존 `public.similarity`를 먼저 호출해 pg_trgm 설정을 초기화한다. 호출 도구의 사전 초기화에 의존하지 않으며 기존 함수의 설정과 권한을 변경하지 않는다.

이 후보는 기존 C03 0a1f와 첫 C04 세 migration 이후다. C01 최신 및 제품 기록 editor와의 전체 통합은 별도 검사한다. saved editable→savedcanonical, worker/import/finalize의 구조화 수량 운반은 별도 C04 worker bridge 범위이며 여기서 구현 완료로 주장하지 않는다. 새 보안 함수 지문 등록과 운영 migration/웹 활성화 승인은 최종 통합 후 별도로 검토한다.

관련 검사와 실제 320/375/1440 fixture PNG, 소스 SHA/manifest는 최종 인계 산출물에 고정한다. fixture의 가짜 계정·제품·영양·저장은 실제 데이터 또는 운영 승인 증거가 아니다.


## 마지막 수량 제거 뒤 계산 버전

수치형 재료의 마지막 quantity를 TO_TASTE/null로 명시 변경해도 이미 확정한 v4 계산 방식을 v3로 되돌리지 않는다. 기존 owner/gen/session recipe entrypoint context와 서비스전용 nutrition input guard의 작은 서버 scalar만 사용한다. 새로운 client mode 입력, DB mode 컬럼, GUC, public catalog 경유 읽기는 없다.

quantity가 더 이상 없는 경우 현재 nutrition snapshot의 v4 버전, 같은 recipe/owner/baseServings, 연결된 immutable content snapshot과 현재 builder의 content_hash 일치가 모두 필요하다. 영양 snapshot 자체에는 revision 필드가 없으므로 현재 recipe revision도 함께 검증한다. builder는 영양 정보를 읽지 않아서 이 검증은 순환하지 않는다. 불일치는 unverified/재확인으로 처리하고 v3로 조용히 낮추지 않는다.

core는 기존 owner/revision 잠금 뒤, 변경 전에 이 모드를 캡처한다. 같은 원자 update에서 새 rows→실제 guard→v4 nutrition→새 content hash로 승계한다. 변경 없는 저장도 동일 버전을 유지하며 과거 meal/content/nutrition snapshot은 고쳐 쓰지 않는다. 서비스전용 snapshot writer는 서버가 계산한 버전과 실제 guard를 다시 비교한다. 새 클라이언트는 헤더로 capability만 협상한다. 모드 없는 기존 v3 요청의 body/hash와 계산은 유지한다.

이 웹 소스를 운영에 연결하기 전에 해당 비활성 schema migration이 먼저 준비돼야 한다. schema 설치와 웹·DB 정책 활성화는 별도 승인이다.
