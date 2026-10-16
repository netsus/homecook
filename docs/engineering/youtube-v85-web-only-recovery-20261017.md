# v85 발급 전 중간 웹의 정확한 06a 복구

승인된 gen50 전환은 웹7b 배포 뒤 자료 보존 preflight에서 중단됐다.50/manager 발급·DB/정책/worker 변경은0이고, 웹7b와 worker v74/gen49의 metadata 불일치로 접수가 불가능하다. 원 일반 자료 차이는 레시피 조회수1이며 별도로 auth 사용자 갱신이 관측됐다. 원 plan/anchor를 새 해시로 바꿔50을 진행하지 않는다.

부모의 추가 승인에 따라 `pnpm deploy:dev:plan-v85-web-recovery`와 `pnpm deploy:dev:recover-v85-web`을 공식 배포 도구의 별도 고정 경로로 추가한다. 일반 rollback의 DB/reader floor guard는 수정하지 않는다. 이 경로는 관측한7b→06a의 source/build/plist/state SHA, 기존 previous state·닫힌 R2 marker, v74 artifact/descriptor와 원50 plan/anchor가 정확히 일치하고50이 전혀 발급되지 않은 경우만 허용한다. 인수·임의 ref·env override·guard skip은 없다.

- 기존06a checkout의 추적 파일·HEAD·BUILD_ID, DB232의 전체 migration bytes, 현재 DB232 catalog/함수/권한/controls와 원 C04/v74/V2 권위를 검증한다. SQL은 REPEATABLE READ READ ONLY 관찰뿐이며 DB write/restore/schema/grant/인증/worker/토큰 변경은 없다.
- 실제 launchctl의 웹 명령·plist·cwd·PID와3100 listener의 PPID/UID/cwd를 결속한다. worker의 실제 loaded 명령·고정 plist·동일PID·인증/health도 확인한다. 웹은 기존06a 보관 plist bytes 그대로만 적용한다. 이 차이는 실행 폴더/시작 스크립트 경로와 descriptor/schema/manifest3경로뿐이며 나머지 환경·권한·R2 false flag를 보존한다.
- 원42작업 전체행 SHA를 고정하고 기존33개 V2 입력의 HMAC을 실제06a production 환경에서 재현한다. 비밀값은 출력하거나 영수증에 저장하지 않는다.06a의 실제 readiness 함수를 source 경계에서 단독 컴파일하고06a 자체 artifact verifier를 사용해 읽기 전용 readiness RPC 결과와 대조한다. 새 enqueue/모델 호출은 없다.
- 고정 DB reader 호환성 확인 뒤 fresh before/after의 전체 normal/보호 행 해시, policy/credential/controls/catalog/ledger/권위/guard 및 worker PID를 엄격 비교한다. 이는 이번 웹 복구 전후 보존 검사이며 gen50 원 plan의 재기준화가 아니다. 드리프트는 무시하지 않는다.
- 기존 공식 isolated preview·웹 교체·health/정적 build asset·R2 공개 화면 확인을 재사용한다. 검증 후에만 원06a previous state bytes를 복원한다. 새 private intent/verified/complete 영수증은 별도 recovery 디렉터리에 create-only로 남긴다.
- activation 이후 확인 실패 시 자신의 정확한7b/06a plist/state와 원 worker·DB/guard만 소유함을 재검증하고7b bytes/state로 보상한다. foreign/newer 상태나 자료 차이는 덮어쓰지 않고 unresolved로 기록한다. SIGINT/SIGTERM은 확인 후 보상 경로로 전달한다. SIGKILL/전원 상실로 남은 intent는 자동 재시도하지 않는다. 원 state/plist 및 pending journal의 수동 대조가 필요하며 성공을 주장하지 않는다.

완료 조건은06a 실제 loaded 웹/정적 build·DB232/원42/gen49/V2·전후 전체 보존·06a 실제 접수 readiness와 production HMAC 일치다. 실제 신청은 별도 승인된 대표1건이 필요할 때만 중복 여부 확인 후 수행한다. 이 복구가 v85 배포 완료나 추출 품질 검증을 뜻하지 않는다.
