# 요리 실행분 표시명 결합

DB235와 웹d9e6c6b2 정상 반영 뒤 실제 Chrome의 기능 검증용 레시피에서 독립 요리 진입 오류를 재현했다. snapshot 저장 행에는 standard_name이 없고 기존 read_snapshot_v2_cook_mode가 표시명을 붙인다. 새 GET가 실행분 raw rows로 전체 배열을 교체해 기존 projector가 거절했다. worker 인증·readiness·queue0은 정상이었다.

실행분 수량은 유지하고 기존 권한 reader의 같은 row_key·ingredient·product·version을 확인한 표시명만 화면에 결합한다. 저장 행이나 원본 레시피, 인분 배율, 권한·DB 계약은 바꾸지 않는다. ID·행 수가 달라지면 거절한다.

실제 저장 형식(표시명 없는 행)의 GET revision0/수정revision1과 한번만 인분 환산되는 검사, 표시명만 결합·원본 불변·식별자 변조 거절을 추가했다. 관련29 PASS·typecheck/lint/diffcheck 통과. 기존 두 snapshot-v2 기대도 이미 공개된 product provenance와 JSON의 undefined 생략에 맞췄다. 이 문서 시점 후속 웹 배포와 Chrome 저장 흐름은 대기다.
