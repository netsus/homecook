# 계획·요리 조회의 원수량과 표시 정밀도

2026-10-15 로컬 변경. 기준은 master `02ed02214e16372fdc316f19ecb0318f0e7d3450`이며 운영 반영 전이다.

계획에 저장된 레시피와 요리 조회가 일반 재료의 표시용 수량을 소수 둘째 자리로 먼저 줄이고 저장된 `quantity_input`을 누락했다. 저장한 `1/3L`를 같은 인분으로 읽으면 `0.33L`, `1/7kg`를 2→3인분으로 읽으면 `0.21kg`가 됐다. 이 재현은 조회 DTO와 화면의 문제이며 DB 저장량·영양·과거 기록의 손실을 뜻하지 않는다.

## 읽기·표시 계약

- 기존 normal recipe validator를 두 reader가 공유한다. context가 있는 recipe proof는 원 **base row**의 수량·단위, context 형식, recipe의 `batch_basis=null`, 고정 제품 version과 대조한다. worker saved proof는 기존 context-free snapshot validator로 별도 검사하며 context hash를 만들지 않는다.
- 유효한 선택 metadata가 있으면 기존 `scaleProductAmount`로 현재 인분의 DTO 수량을 한 번 환산한다. 함께 반환하는 `quantity_input`은 원 base 양의 기록이며 환산된 DTO 수량에 맞추어 고치거나 현재 식품 근거로 재해석하지 않는다.
- 동일 단위이고 인분이 같거나 고정량이면 기존 원분수 표시를 재사용한다. 그 외는 기존 `formatQuantityAmount`/`formatProductQuantity`로 짧게 표시한다. 표시 문자열을 계산·저장값으로 되돌리지 않는다. 계획 화면과 요리 전체 재료·사용 재료 선택창은 이 표시를 소비한다.
- metadata가 없거나 잘못되면 선택 raw 정보만 채택하지 않고 기존 row·조리 단계·legacy 수량/표시를 보존한다. non-finite 원분수도 표시 근거로 채택하지 않는다. `TO_TASTE`, 미확인량, 고정량, 제품·영양 version과 row key의 의미를 바꾸지 않는다.
- snapshot-v2 projector를 무게 예측기가 steps 읽기에 재사용한다. 잘못된 선택 raw 때문에 전체 projection을 없애지 않는다. 예측기는 계속 원 frozen ingredients를 읽으며 malformed frozen proof를 삭제해 legacy 질량 근거로 승격하지 않는다.
- legacy session의 저장 JSON·live recipe 조회와 authenticated standalone 조회에 선택 metadata를 연결한다. 익명 standalone의 exact SELECT·공개 제품 RPC와 권한 조건은 그대로다. 승인된 공개 saved-result parser의 선택 metadata는 검증 후 전달한다.

조리법 문장·숫자, 완료 요청 body, 원 snapshot JSON, 당시 인분·영양·weight_basis, DB/SQL, 인증·권한·모델·배포 도구는 바꾸지 않는다. 원 helper의 정상 recipe strict 오류도 유지한다. B08 안내는 기존 문구를 유지한다.

## 확인과 한계

- 새 원수량/정밀도 회귀 3건과 화면 회귀 2건을 변경 전 실패로 보존했다. 정상 metadata, malformed/stale proof, 제품 version, 변환된 raw 단위, 근거 없는 밀도, 매우 큰 원분수, frozen 예측 입력과 조리 단계 보존을 검사한다.
- 관련 18 suite 212개 통과. 기존 standalone 양성 검사 실패는 공개 제품 식별 RPC가 mock에 없던 원인이다. 원 기준 route에서도 동일 실패를 확인했고, 승인 결과 mock과 정확 RPC 호출 검증만 보완하여 원 route 9개가 통과했다. 200·DTO 기대값은 유지했다.
- 타입·해당 파일 ESLint·anti-slop 새 위반 0, production build exit0(기존 무관 경고 4건)을 확인했다. 실제 Next 모형 화면은 계획·요리 ×320/375/1440의 6표본·18PNG, 새로고침·원문·B08 보존, 가로 넘침·page error·외부 origin·console 경고/오류 0을 확인했다. 브라우저·개발/가짜 backend 서버를 정리했고 같은 `.next`의 dev/build는 순차로 실행했다. 명령·종료 상태는 최종 `/tmp/mumeok-cooking-quantity-final-freeze.json` 및 handoff에 고정한다.
- 화면은 별도 포트·가짜 QA 환경·모든 API 모형·외부 origin 차단 조건으로 확인한다. 실제 운영·DB·AI·OAuth·worker 실행이나 실제 사용자 기록 변경 검증을 대체하지 않는다. 운영 반영과 후속 실제 확인은 총괄 담당이다.
