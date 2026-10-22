# DB240 동일 권한 worker51 갱신

이 도구는 별도 승인된 동일 권한·최대7일 갱신 한 번을 위한 역사적 실행기다. 코드 공개·머지는 새 갱신 승인이 아니다. 30일/90일 정책 변경이나 자동 rotation 활성화는 승인 범위가 아니다. 원 gen50 activation seal과 파일·키·기존 승인들은 보존한다. 49→50 전환 또는 same50 복구를 재실행하지 않는다.

이번 전용 도구는 고정된 full-local DB target/PostgreSQL17·원장240·gen50·기존 만료/release/schema/snapshot, 정책 전체 행, 실제 launcher/UID/cwd/PID/start, 키 파일 SHA, R2 OFF와 최신 DB maintenance pointer를 별도 plan으로 결속한다. 기존 enqueue 배타 advisory fence86120317 아래 queue/processing/permit0을 확인한 뒤 worker를 중지하고, create-only0600 자격51과 최대300초 manager로 기존 rotation RPC를 호출한다. RPC와 credential/policy/jobs/permit 잠금 안에서 exact50 CAS와 정상 데이터·catalog·controls·원장·역사 작업 후상을 확인한다. 정책 ON과 timestamp는 바꾸지 않는다.

등록 뒤 기존 plist의 credential 경로 한 곳만 새51 metadata로 바꾸고 같은 봉인 release를 bootstrap한다. 실제 loaded 명령/UID/cwd/start와 health 전후 동일 PID, 인증200·빈claim거부, 실제 운영 웹 loader/환경의 readiness와 R2 OFF를 확인한다. 별도 plan/receipt를 create-only Keychain anchor에 결속한다. COMMIT 응답이 불명확하면 새 연결에서 exact50/exact51/unknown만 분류하고 자동 재발급·재등록하지 않는다. 원50으로 서비스 복구는 DB exact50과 원plist가 입증될 때만 가능하다. 등록51 뒤 실패는 정확히 소유한51만 중지하며 원50·정책행을 되돌리지 않는다.

운영 실행 전 독립 검토, 입력/후상 보호 회귀 및 기존 격리 RPC 검사를 확인한다. 시간 임박이나30분 보호 진입은 검사 생략 근거가 아니다. 실제 결과는 별도 private operation receipt에 기록한다. 이 문서 작성 시점에는 운영 발급·등록·정지를 실행하지 않았다.

미래 배포의 기존 gen50 고정 authority 소비자는 별도51 receipt 승계 구현과 검증이 필요하다. 이번 작업에서 과거 seal을 바꿔 이를 숨기지 않는다. 자동 rotation은 별도 제한 발급 주체·사전 갱신·CAS/교체 실패 복구·알림·기존 권한/데이터 보존 설계로만 후속 검토하며 활성화하지 않는다.
