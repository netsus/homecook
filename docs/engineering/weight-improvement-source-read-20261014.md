# C05 D3 — 계정 원천 읽기의 기록 결속

상태: 비활성 로컬 준비. 실제 C01/C05 역할·스키마에서 원천 관계를 읽는 최소 repository/RPC와 직접 검사를 준비한다. 제품 caller·collector·registry·삭제·모델은 연결하지 않는다. 참여/수집은 OFF, 운영 문서·보유기간·품질 기준은 미정이다. W4 개인 보정에 C05 동의를 요구하지 않는다.

## 실제 읽기와 닫힌 경계

`createWeightImprovementSourceRepository`는 기존 verified session 인자를 재사용한다. explicit read OFF, 현재 미완결 정책, 미참여/철회, 주체·목적·문서 불일치에서는 service client를 만들거나 RPC를 호출하지 않는다. 주소는 owner/계정세대/purpose와 정확 batch/evidence/original revision에만 한정하고 원문·수량·owner 주장을 URL에 넣지 않는다. 실제 원천 RPC는 하나이며 새 공개 API는 없다.

새 `read_weight_improvement_sample_source`는 기존 `weight-improvement` 내부 scope의 정확 POST 경로와 service_role만 허용한다. 기존 session authority가 현재 owner/generation을 검증하며 expected generation은 전제조건이다. 현재 문서/hash·consent revision·opted_in과 원래 cooked_at의 동의 이후 여부는 DB에서 별도로 검증한다. 제어·참여 행의 공유 잠금은 읽기 transaction 동안 철회/정책 전환과 순서를 유지한다. OFF/문서 미완결/철회/옛 동의이면 C01 source를 조회하지 않는다. 새로운 키·scope·private 표 권한은 없다.

D3 정책의 기본 NULL과 expires_at NULL은 유지한다. DB의 문서 조건이 완결됐다는 것은 측정 품질·기간의 자동 승인이 아니다. 현재 repository의 기본 정책으로는 호출0이며, 실제 원천을 읽는 격리 양성 검사는 완결된 가짜 문서·가짜 입력의 검사다. `collection_enabled CHECK(false)`와 기존 D1/D2 동작을 바꾸지 않는다.

## current 관계를 판단하는 근거

관찰은 ID로 지정하며 최신 관찰을 골라 현재 사실로 삼지 않는다. 다음 원본 관계와 상태가 모두 일치할 때만 `current`로 읽는다.

- 같은 verified owner/generation의 exact observation→prediction, batch, 완료된 snapshot_v2 session, 고정 recipe content snapshot을 연결한다. snapshot의 owner와 인분·recipe 참조 및 예측의 schema/input/model/catalog 판본도 확인한다.
- 관찰에 결속된 C01 wrapper receipt의 succeeded/terminal_result, owner/generation, operation_scope, result_reference와 저장된 결과의 success/error·batch ID·known/measured·실제 g·원 revision을 직접 확인한다. 같은 key의 core receipt도 성공 상태와 결과가 같아야 한다.
- 예측의 원 완료 wrapper receipt는 session/contract/status·batch/최초 revision·원 cooked_at·인분과 일치해야 한다. 나중 측정의 core receipt와 별도로, 원 완료 wrapper에 대응하는 same owner/generation/key의 snapshot_v2_complete core도 terminal success/reference/저장 결과가 일치해야 한다. 없거나 미완료/불일치면 unknown이다. 관찰/예측의 observed_at은 해당 receipt의 원 완료 시각에 결속한다. 편집/재저장으로 원 요리 시각을 새로 만드는 경로는 없다.
- 현재 batch의 raw weight_status/source/finished g이 같은 관찰과 일치하고 다른 관찰·후속 전체무게 receipt가 없어야 한다. legacy projection의 measured fallback을 사용하지 않는다.

검토한 현재 core는 missing/estimated를 측정값으로 바꿀 수 있지만 이미 measured인 전체무게를 다시 설정할 수 없다. 이 전제와 실제 거절을 native에서 확인한다. 잔량/섭취/조정 event는 remaining g과 batch revision을 바꾸므로 현재 revision을 observation original revision과 같다고 요구하지 않는다. 원 측정과 영수증에 결속된 전체무게는 보존한다. unsupported/누락/불일치 상태는 unknown/unavailable이며 false current를 만들어 내지 않는다. 이 판단은 현재 고정 writer 계약에 의존하므로 향후 실측 정정/무효화 경로를 추가하면 관계 규칙도 함께 갱신해야 한다.

## 최소 투영과 아직 미확인인 사실

DB/decoder는 batch와 관찰/예측 ID·owner/generation·snapshot/revision·원시각·보고 g, 제한된 예측 입력만 투영한다. row 수·segment 수는200 이내다. 원량·원단위·고정 제품 version·이미 batch-scaled인 g·quantityOrigin·환산/조리 fact의 선언된 필드만 보존한다. recipe 이름/본문·원사진·전체 prediction JSON·receipt 원문·session key는 반환하지 않는다. 응답 subject/address/snapshot/ref를 다시 비교하고 unknown enum·추가 필드·비유한/잘못된 수량·과도한 배열은 거절한다.

관계 current는 **기록의 연결이 현재 유효함**만 뜻한다. physical whole/tare/pre-consumption/non-QA/실제 사용량·기기검증을 확정하지 않는다. 기존 reader의 qa/whole/container/timing NULL, planned origin, expiry NULL을 유지하므로 실제 적격 표본은0이다. 가짜 완결 정책으로 현재 C01 원천을 투영한 단위 검사도 draft:null/collection:false/storage:false다. 원기록 저장 성공과 향후 선별 실패를 분리해야 하며 현재 caller는 없다.

## SQL·지문·통합 기준

순서는 schema-only219→정확 C03 `0a1f...`→최종 C01 `60b9...`→기존 C05 `bc263...`→`20261014231000_weight_improvement_source_read.sql`이다. 원 C05230000 SQL은 그대로다. C05 원 scope 함수는 새 predecessor alias에 body/owner/ACL/full configuration을 보존한다. 추가된 정확 read path만 새 outer가 처리하고 나머지는 기존 chain으로 위임한다.

`weight-improvement-source-read-function-postimages.json`은 실제 자료0행·고정 image/network-none의 source-derived4함수 body MD5와 규범 속성에 결속한다. actual 운영 metadata에서 기대값을 배우지 않는다. 보안 도구의 `includeWeightImprovementSourceReadFunctions`는 participation/C01/C03의 선행 선택을 요구한다. 기본 계약은 그대로이며, 새 그룹4·보존 C05그룹8·결합48을 full configuration/body/owner/ACL로 검사한다. full inventory의 함수 수만 기존97→100이며 역할·정책·표·ACL 기대/기존 drift는 면제하지 않는다.

C04가 중간에 합쳐지면 scope chain과 공유 함수의 preimage가 달라질 수 있다. 이 검사는 C04 전체 통합 증거가 아니며 그 정확 순서의 source 지문/타입/빌드/native를 다시 결속해야 한다. 운영 단계는 정확 대상·복구·통합 검증과 총괄 적용을 따른다. 읽기 권한 준비를 수집·모델 활성화로 해석하지 않는다.

## 검증과 한계

관련 단위/권한 지문·native·타입·lint·Anti Slop의 최종 수치와 파일 SHA는 인계 자료에 고정한다. native는 실제 configured pre-request와 기존 authority/service_role을 사용하며 완료/나중 측정, 원 receipt·현재 관계, 수량 event 후 revision, measured 재설정 거절, stale/foreign/잘못된 path/method/scope, OFF/철회/옛 문서/동의시각, 미완료/잘못된 receipt, read 쓰기0, 별도4/8/48 지문과 config/grant/다른 source 변조 탐지를 검사한다. 자기 UUID/CID/image/network/mount/port 소유 검증과 자기 정리만 수행한다.

기존 영양 fixture의 잘못된 quality/불완전 상태와 RPC 이름·in_progress lease 제약을 교정한 준비 실패도 보존한다. DB 제약·기존 actor/guard를 제거하지 않았다. 실제 운영/기본 DB/네트워크·실제 사용자 자료·외부 AI/실추출·collector/모델0이다. 실제 HTTP JWT/gateway transport와 C04 통합은 이 fixture가 증명하지 않는다.
