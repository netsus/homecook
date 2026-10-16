# v74/gen49 준비 검증과 전환 전 중단 — 2026-10-16

## 승인과 실제 상태

사용자가 gen49 6일, manager 최대300초, DB worker policy·generation 변경, 웹·worker 교체, 대표 영상1회와 등록 후 gen48 즉시 복귀 불가를 직접 승인했다. 승인은 확보됐지만 신규 위험 발견 시 안전하게 중단하라는 요청에 따라 아래의 운영 결속 불일치를 확인한 뒤 **실제 전환을 시작하지 않았다**. 승인 거절이나 credential 전달 도구의 차단이 아니다.

실제 credential/manager 발급0, DB 변경0, launchd 변경0, 웹 배포0, 새 영상/모델 호출0이다. 기존 worker는 `6b610eb012da-c04-quantity-v4`·PID58417/running을 마지막 읽기 전용 확인에서도 유지했다. PR #1729/머지 `3e58467499c63ba20c3b3191d9dd7dec77a7aa44`와 sealed artifact는 그대로다.

## 별도 준비 후보

`scripts/lib/youtube-v74-cutover-preparation.mjs`는 순수 준비 함수뿐이며 filesystem·network·issuer·SQL executor·launchd adapter/CLI가 없다. raw JWT나 signing key를 읽거나 만들지 않는다. preparation intent는 승인 문서나 실제 운영 권위가 아니며 productionExecutorAvailable=false다. 후속 실제 adapter는 원 검토·승인·소유 파일/영수증의 진위를 별도로 검증해야 한다.

- 정확 candidate3e/artifact89d78/schema-v2/catalogde001/DB232·기존48/source6b·새49를 검증한다.
- worker의 기존 role/scope/issuer/audience, 정확6일, manager 최대300초와 미래 발급 시각을 확인한다. 새 역할/권한을 추가하지 않는다.
- 새 정책은 pipeline/snapshot·enabled=false만 바꾸는 intent다. current/previous fingerprint key version·TTL, options, 사용자/권한 지문, C03/C01/C04·개인 writer와 R2 OFF를 보존한다.
- 등록 전 readback이 원48 credential/정책/행 지문과 정확히 같아야 원 policy와 소유한48 복구를 계획할 수 있다.
- 등록 후49/OFF readback은 같은49 수리만 계획한다. 재발급·재CAS·old48 복귀는 허용하지 않는다. ON readback만으로 활성화 성공을 선언하지 않고 원 durable activation receipt의 읽기 전용 재확인을 요구한다.
- mixed/foreign target·policy·credential·launcher·만료·변조 intent는 unknown/read-only-reconcile로 분류한다. self-consistent한 임의 intent를 승인 권위로 취급할 수 없으며, 실제 운영 adapter/원본 영수증 검증은 아직 구현하지 않았다.

## 비밀 없는 합성 검증

새25개와 원 v71/C04 고정 제어를 합한 관련4파일 **111개 통과**, 실패/건너뜀0이다. 선택 lint와 typecheck exit0을 확인했다. intent의 generation50 변조와 previous fingerprint 초기화를 받아들이던 초안2건을 실패로 재현한 뒤 exact candidate/CAS/predecessor/worker/policy patch를 다시 검사해 수정했다. 원47→48 고정 경로와 원 PIN은 수정하지 않았다.

합성 fixture의 commit 응답 유실·미적용·등록/OFF·ON/원 receipt 미확인·외부 세대·부분 policy 변경·다른 launcher·expiry·busy queue를 확인한 것이다. 실제 DB transaction, native PostgreSQL fixture, 인증·서명·launchd·웹 전환·운영 복구 검증은 **아직 미실행**이며 이 테스트를 운영 경로 검증 완료로 표시하지 않는다.

## 확인한 신규 위험과 정확히 멈춘 동작

1. 현재 운영 웹 `0ae67d66c5ab`의 plist와 `.env.production.local`의 세 메타데이터 경로가 `c51d53871f31-youtube-resolution`을 가리킨다. 현재 worker/DB credential은 `6b610eb012da`/gen48인데, 이 설정의 실제 descriptor/manifest 결속이 이전 source다. 실제 프로세스의 모든 유효 환경까지 조회한 것은 아니므로 서비스 전체 장애를 단정하지 않지만, 현재 파일 기준이 일치한다고 전제해 새 전환을 시작할 수 없다.
2. 기존 `prelaunch-database.mjs`의 `assertAttestationWorker`와 C04 보호 관측은 원 review의 credentialGeneration/credentialRowSha/policyRowSha/policyStableSha/snapshot/workerReleaseSha를 대조한다. `prelaunch-web-deploy.mjs`도 gen48의 원 receipt와 current service를 검증한다. gen49를 먼저 등록하면 원48은 즉시 무효가 되는데, 후속 웹 배포/보호 관측이 새 세대를 거부해 서비스가 OFF인 상태로 남을 수 있다.
3. 따라서 현재 동작을 그대로 통과시키려고 원 receipt를49로 덮거나 현재 관측을48로 재표시하거나 general guard를 완화하면 안 된다. 원 C04·DB228~232 권위를 보존한 별도 v74 successor proof, 정확한 source/metadata 경로 허용, 발급/등록 전 웹 준비·전환 순서, 같은49 forward repair를 함께 검증해야 한다.

멈춘 작업은 **gen49 발급·CAS·DB policy 변경·웹/worker 교체와 대표 영상 실행**이다. 상태는 기술적 사전 검증 미충족으로 중단된 것이며 실행 결과가 불확실한 mutation은 없다. gen49 또는 다른 세대를 이미 만들었다고 가정해 재발급하지 않는다. 새 승인 범위를 임의로 추가하지 않으며, 승인된 전환 안에서 위 결속 경계를 먼저 해결·검증해야 한다.
