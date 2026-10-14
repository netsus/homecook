# C05 D3~D5 비활성 준비안

상태: 로컬 검토용 초안. 운영 문서·보유기간·표본 수집·모델 배포 승인이 아니다. D1/D2의 운영 정책/동의문/기간은 NULL, 참여/수집은 OFF다. 90일·1년·무기한 기본값을 넣지 않는다. 개인정보 페이지와 로그인 필수 흐름은 변경하지 않는다.

## 목적별 최소 자료와 분리

| 용도 | 필요한 자료 | 제외/분리 |
| --- | --- | --- |
| 개인 실측 서비스 | 본인 음식의 무게·식사/남은 양 계산에 이미 쓰는 원기록 | 참여 여부와 무관하게 동일 기능 제공. 개선 선별 실패로 원기록 저장을 취소하지 않음 |
| 음식 조리 전후 무게 개선용 선별본 | 구조화된 재료 종류/고정 제품 버전, 확인된 실제 투입량과 단위/환산 근거·exact/estimated 품질, 고정 인분, 조리 조건, 보고된 전체 완성 무게, 입력/모델/단위 버전 | 계정 ID, 연락처, 레시피 원문/이름, 자유메모, 사진, 건강/체중, 정확한 식사 시각 제외. 행 UUID/원기록 ID는 모델 입력에 넣지 않음 |
| 삭제·중복 연결 | sample ID ↔ owner/account-generation/purpose/consent-revision/source batch/evidence/original-revision | 제한된 사설 연결로 별도 보관. 학습 조회에 연결표 제공하지 않음. 모델 영향 확인 전에 삭제키를 없애지 않음 |
| 최소 선택 증거 | D1 서버시각·명시 행동·문서 버전/hash·revision·surface·멱등 receipt | 표본을 증거 명목으로 보존하지 않음. 새 IP/UA 수집 없음. 증거 보유기간도 별도 승인 전 NULL |
| 집계/작은 계수 모델 | 조건별 표본 수·오차/불확실성·버전·삭제 대상 영향 manifest·검증 결과 | 희소 집단/재식별 검토 전 공개하지 않음. 계정별 추천·유지칼로리·광고·외부 AI 목적에 재사용하지 않음 |

## 현재 C01으로 편입 가능한 표본은 0건

C01 담당이 인계한 `SnapshotWeightPrediction`은 `cooked-weight-evidence-v1` / `snapshot-weight-v2` / `bounded-weight-v2`이며 현재 재료 `quantityOrigin`은 항상 `planned`다. private evidence의 `event_kind`는 prediction/reported_measurement/manual_entry, `input_source`는 conditional_estimate/unavailable/reported_measured/manual_estimate, `measurement_path`는 completion/before_consumption이다. 원래 `batch.cooked_at`과 `original_revision`을 보존한다. 예측의 `learningEligible=false`를 유지하고 DB의 영구 `learning_eligible` 필드는 넣지 않았다. 조건일치 MIX의 가정도 실제 투입량/측정 경계 확인으로 승격하지 않는다.

`reported_measured`는 사용자가 전체무게를 보고한 경로이며 기기를 검증했다는 뜻이 아니다. 실제 투입량, 용기 제외, 물리적 섭취 전, 전체 배치, non-QA 확정 facts는 현재 저장되지 않는다. 안내 문구·숫자 입력·실측이라는 이름만으로 이 facts를 true로 만들지 않는다. `CURRENT_C01_MEASUREMENT_CONFIRMATIONS`는 NULL이다. 현재 원천 adapter/collector는 연결하지 않는다.

새 pure 평가 함수는 서버가 확인한 같은 owner/generation/purpose/현재 문서와 consent revision, 동의 이후 **원래 새 요리 시각**, 현재 유효 evidence, 정정/삭제 여부, 중복, actual 양/유효 단위/고정 제품 버전, 전체 배치/섭취 전/용기 제외/non-QA/조리 조건을 확인한다. 조리 protocol은 검토된 식별자 allowlist에 있어야 하며 자유문구를 모델 입력으로 옮기지 않는다. 원래 요리를 재저장하거나 재참여했다고 동의 시각 이후로 바꾸지 않는다. 증거의 original revision과 mutation 이후 batch revision을 단순 비교하지 않고 서버 reader가 현재 유효 evidence 관계를 확인해야 한다. 모르는 값·예정량·예측·수동 추정·legacy·QA·부분 잔량은 부적격이다.

`assessWeightImprovementSample`은 완결된 **가짜 fixture**에서 최소 features 투영을 검증해도 `collection_allowed=false`다. 실제 writer/API/queue/권한 확장은 없다. 입력과 원기록을 변경하지 않는다. 선별 실패와 개인 서비스 성공을 분리하며, 후속 durable 재시도는 기존 원기록 성공 뒤에만 연결해야 한다.

## 표본량과 자료 나이에 따른 보유기간 제안 방법

1. 수집 시작 전 비교할 기준 모델, 조건 구간, 개선 지표(완성 무게 절대/상대 오차·과대/과소 편향), 실측 오차 허용 범위, 독립 검증 단위, 의미 있는 개선 폭과 불확실성 기준을 정한다. 수치는 현재 NULL이다.
2. 동일 계정/같은 요리의 반복값을 독립 표본으로 세지 않는다. 계정 단위 묶음과 시간으로 훈련/검증 자료를 나눠 정보 누출을 막는다. 조건별 학습 곡선과 계정 단위 재표집으로 오차 감소/신뢰 구간을 확인해 필요한 표본량을 **측정**한다. 작은 표본/희소 조건은 보류하고 기본 규칙으로 복귀한다.
3. 최근 구간을 고정 검증 자료로 두고 오래된 자료를 포함/제외한 모델의 개선 폭·편향·조건 변화·불확실성을 비교한다. 자료 나이에 따른 유용성이 사라지거나 검증되지 않은 구간은 추가 보존 근거로 삼지 않는다. 표본 증가의 한계효용이 사전 기준에 못 미치면 수집/보존 범위를 줄이는 안을 제안한다.
4. 이 결과와 실제 삭제/복구 시험·동의 증거 필요성·희소 집단 위험을 함께 보고 **가장 짧게 근거를 충족하는 후보 기간**을 운영자 검토에 올린다. 학습용 표본, 삭제 연결, 최소 동의 증거, 집계/모델의 기간을 따로 제안한다. 법정기간이나 무기한의 자동 결정으로 표현하지 않는다.
5. 승인된 규칙과 검증 결과가 없으면 보유기간은 NULL이며 collection OFF다. pure 평가도 승인 규칙에서 서버가 계산할 명확한 `expires_at`이 없거나 만료되면 부적격이다. fixture만 테스트 종료 시각을 가짜 만료값으로 쓰며 실제 기간을 약속하지 않는다. 자료 나이 분석/만료 시각 계산·재평가 주기·삭제 재시도·백업 회전·실제 완료 약속은 승인 이후 구현/실험한다. “정확도 개선에 필요한 만큼”만으로 계속 저장하지 않는다.

## 철회·정정·삭제·탈퇴와 모델 영향

서버 철회 상태가 확정되면 신규 선별과 영향 모델의 새 배포/캐시 사용을 먼저 차단한다. 기존 안전한 규칙으로 미래 예측만 복귀하고, 삭제 연결로 원표본과 영향 manifest를 찾아 제외 재계산·독립 검증 후 새 모델 버전을 낸다. 조리/식사 당시 저장한 무게·영양 snapshot은 덮어쓰지 않는다. 개인 원기록은 참여 철회만으로 삭제하지 않는다.

원실측 정정/무효화, 원요리/기록 삭제, 계정 탈퇴는 같은 삭제 연결을 통해 표본/영향 모델을 정리해야 한다. current account generation을 재검증하며 옛 세대 상태·표본을 재가입에 부활시키지 않는다. 삭제 링크를 FK cascade로 먼저 없애지 않는다. 재참여는 새 동의 이후 새 요리만 대상으로 하고 철회 공백/삭제 표본을 복원하지 않는다. C01 정정/무효화와 account lifecycle 연결 구현은 아직 남은 작업이다.

표본은 복구백업 제외를 우선 검토한다. 제외라는 설정만으로 완료하지 않고 실제 restore 시험으로 입증한다. 포함되는 경우 tombstone을 적용하기 **전** 선별·모델 사용을 열지 않는다. 백업 자료 재적용, 재시도 큐, 배포 대기, 캐시, 영향 manifest까지 검증하지 못했거나 실패하면 pending/retrying이다. `assessWeightImprovementCleanup`은 가짜 proof의 필요조건만 평가하며 completion write/model release는 항상 false다. 실제 worker/삭제/복구를 실행하거나 완료를 표시하지 않는다.

## D5 이후 활성화에 남은 구체적 경계

- 승인: 목적별 필드·보유기간·동의문·민감성/아동/희소 집단·삭제/모델 재계산 약속 검토. API/DB/요구/화면/Flow와 공개 정책을 같은 구현 묶음에 맞춤. 기존 개인정보 안내 배포 차이는 F01 담당 범위.
- 원천: 실제 투입·측정 범위·QA·현재 evidence/정정/무효화의 저장 권위, C04 고정 환산 근거를 연결. 추가 사용자 필수 입력을 임의로 만들지 않음.
- 처리: 별도 사설 최소 선별본/삭제 연결·중복 멱등·원기록 성공 후 선별 재시도·철회 경합 lock·expiry/삭제/account lifecycle/restore 연결. 새 권한/scope/worker가 필요하면 exact 실행 경계를 먼저 제안.
- 모델: 작은 조건 계수 모델의 표본 manifest·희소 조건 기준·시간/계정 독립 검증·fallback·삭제 대상 영향·배포/캐시 차단. 외부 AI/일반 생성형 모델 학습 없음.
- 확인: C05 12개 수용 시나리오 중 D1/D2 로컬 증거와 D3~D5 미실행 영역을 분리. 원본 서비스 동일·동의전/옛 요리/철회후0건·정정/삭제/탈퇴·복구 tombstone·거짓 완료0까지 실제 격리 환경에서 통과한 뒤 별도 운영 승인.

이 초안은 D3~D5 구현 완료를 뜻하지 않는다. 로컬 fixture 검사 외 수집·모델 훈련·삭제·운영 DB 적용·동의문 공개·배포는 0이다.

## 2026-10-14 · D3a 비활성 저장 계약과 합성 source binding

`buildWeightImprovementSampleStorageDraft`는 기존 pure gate를 그대로 호출하고 `{features, private_binding}`을 명시적으로 분리한다. features는 기존 허용 특징만 재사용하며, private binding에는 sample ID와 owner/generation/purpose, consent revision·문서 version/hash, batch/evidence ID·original revision만 둔다. 원기록 내용·정확한 시각·연락처·사진·건강 정보를 복제하지 않는다. 새 private ID나 정확한 시각을 허용 특징 슬롯에 다시 넣은 알려진 값의 충돌도 거절한다. 이는 임의 개인정보를 익명화하는 일반 도구가 아니다. 실제 source reader는 catalog 식별자·버전의 적격성과 고정 metadata를 별도로 확인해야 하며 아직 연결되지 않았다.

독립 배치 주소는 **owner/generation/고정 purpose/batch**다. consent revision, evidence ID, sample ID를 바꿔도 주소는 같고 이미 선택한 관계가 있으면 초안을 거절한다. 정정 대상은 이전 evidence/original revision에 결속된 `source_invalidated` 주소로 나타낸다. 기존 대상을 메모리에서 지우거나 주소를 만들었다고 정정 적용·삭제 완료·새 표본 저장을 선언하지 않는다. 실제 transaction·UNIQUE/index·현재 선택 조회와 경합 규칙은 후속 writer 범위다.

`buildWeightImprovementSampleInvalidationAddress`는 withdrawal/source_invalidated/source_deleted/account_deleted만 받으며, 같은 owner/generation/purpose/batch/evidence/original revision의 사설 연결만 가리킨다. 과거 동의의 문서·revision도 연결 안에 그대로 보존하므로 철회 후 현재 동의가 없어졌다는 이유로 삭제 대상을 잃지 않는다. 정정 후 새 evidence를 이전 표본 삭제 주소에 대신 넣지 않는다. 실제 원본 삭제 전 hook·tombstone·모델 영향 조회는 미구현이다.

모든 정상 합성 초안도 `collection_allowed=false`, `storage_write_allowed=false`다. 무효화 주소와 기존 cleanup 판정은 `completion_write_allowed=false`, `model_release_allowed=false`를 유지한다. 정책/기간은 NULL, 실제 C01 투입·측정 확인 facts는 기존대로 미확인·planned이며 실제 적격 표본은 0이다. 실제 source 권위, 저장/삭제/복원, queue/worker, 모델 학습/활성화, 운영 변경은 수행하지 않았다.

검증 범위는 가짜 fixture의 주체·목적·문서·원본 revision 결속, malformed private ID/hash, 동일 배치 중복·정정 주소, 철회/재참여의 옛 요리·옛 세대 거절, 허용외 정보 분리와 원기록 불변이다. 완료 표현은 **D3a 비활성 저장 계약·합성 fixture 검증 완료**까지이며 D3 실수집 완료가 아니다.

## 2026-10-14 · D3b 비활성 원천 reader/adapter 준비

`lib/server/weight-improvement-source-reader.ts`는 C01의 `private.cooked_batch_weight_evidence`와 `prediction_json`에서 쓰는 필드만 받는 typed projection과 주입형 read-only repository 경계를 준비한다. 기본 `enabled=false`이고 환경 스위치·실제 caller·SQL client·새 RPC/권한을 추가하지 않는다. 기본 OFF 또는 정책 미완결, 미참여/철회/옛 주체·세대/동의 revision·문서 불일치에서는 repository를 조회하지 않는다. 완결된 가짜 정책과 명시 read gate를 쓰는 합성 검사도 collection/storage 권한은 false다. 이 read gate가 실제 운영 control이나 수집 승인인 것은 아니다.

reader는 같은 owner/generation/batch/evidence/snapshot과 prediction 참조·original revision을 검증하고, future reader가 제공할 명시 `current_relation`을 요구한다. 이 관계는 현재 C01 column이 아니며 메모리 객체만으로 서버 권위가 생기지 않는다. latest observation이나 batch revision 등치로 관계를 추정하지 않는다. 실제 SQL reader가 원천·현재 세대/동의·정정/삭제 관계를 일관되게 읽고 검증하는 구현은 남아 있다. typed boundary는 외부 JSON decoder를 대신하지 않는다.

원 amount/unit/fixed product version과 이미 batch-scaled인 g를 다시 환산하지 않고 기존 D3a gate에 전달한다. 현재 C01의 planned origin, qa/whole/container/timing 확인 null, expires_at null을 그대로 보존한다. 확인된 단일 구조화 조리 구간만 조건으로 투영하고 inferred MIX·여러 구간·모르는 조건은 null이다. 새로운 measurement fact·보유기간을 추정하지 않으므로 실제 eligible 표본은 0이다. private candidate/lineage는 서버 준비 입력이며 public/model DTO로 전달하지 않는다. 표준 catalog 식별자·환산 metadata의 실제 검증, 현재 선택 registry 조회도 아직 연결하지 않았다.

입력과 원천을 변경하지 않으며 조회/투영 실패는 초안을 만들지 않는다. 모델용 features/private_binding 분리는 기존 gate를 재사용한다. 독립 배치 등록·정정/삭제·철회 worker·tombstone/restore·모델 처리는 추가하지 않았고 완료 권위도 없다. 실제 caller 연결 때에는 개인 원기록 성공과 선별 실패를 분리해야 하며 현재 이 흐름을 연결한 증거는 없다. 완료 표현은 **D3b 비활성 source-reader/adapter 코드와 합성 관계 검사 준비**까지다.


## 2026-10-14 · 표시 주체와 현재 인증 주체의 경합 방지

C05 mutation의 `expected_subject={owner_uuid,account_generation}`는 화면에 표시된 주체를 고정하는 필수 기술 전제조건이다. 새 고객 입력칸이나 권한 근거가 아니다. owner·세대·session args는 계속 검증된 인증에서만 구하며, PATCH는 expected owner가 current verified owner와 다르면 `409 PARTICIPATION_SUBJECT_CHANGED`로 RPC 호출 전에 거절한다. SQL은 실제 authority가 계산한 generation을 expected generation과 비교하여 receipt 조회/replay·참여 쓰기 전에 같은409를 반환한다. 요청 hash에도 expected generation을 결속한다. 이전 계정/세대의 선택이나 동일 UUID가 현재 계정/세대에서 새 동의로 적용되지 않는다. 미적용 migration의 signature/fixtures를 함께 변경하며 collection OFF·정책/기간NULL·scope/권한은 유지한다.

## 2026-10-14 · D3c 계정 원천 읽기 결속

앞 D3b의 SQL reader 미연결 문장은 당시 준비 기록이다. [원천 읽기 결속](weight-improvement-source-read-20261014.md)에 최종 C0160b9 뒤의 bounded server-only repository/정확 내부 read RPC와 source-derived4함수 지문을 준비했다. exact observation과 성공 wrapper/core receipt·고정snapshot/session·현재 raw known/measured g으로 current 관계를 판정한다. 최신 관찰 또는 batch revision 등치를 사용하지 않고, source/권한/원문·시각·분모는 보존한다. 원측정 facts/planned/QA/expiry NULL과 실제 적격0은 그대로다. 실제 caller/registry/삭제/collector/D4 모델/기간 확정은 연결하지 않았다. C04 후속 순서와 정확 대상·복구·통합 검증은 별도다.


## 개인 자기보고와 C05 준비 코드의 분리 · 2026-10-15

개인224500 후 C05 원230000/231000을 연결한 로컬 후보에서도 D3a 주소 builder·D3b/c bounded reader만 존재한다. 개인 user_attested 기록은 물리 검증/QA 제외/실제 투입량을 확정하지 않고 현재 선별 facts는 NULL·planned 그대로다. 새 빈 registry/13인자 overload/withdraw pending hook은 추가하지 않았다. 원 withdraw의 pending 영수증과 개인 retract/원g·식사 분모 보존은 격리 검증 대상이며 삭제 완료/모델 해제 권위가 아니다. 표본 writer/caller·선택 registry·선별 품질/정정 무효화·탈퇴/기간/백업 복원·D4/D5는 미완료이고 전역 수집은 계속 OFF다.
