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

## 후속 진행과 실행 전 승인 검토 차단 (2026-10-16 23:00 UTC)

이전 중단 후 부모가 기존 gen49·6일·manager300초·정책 전환·웹/worker 교체·대표1회 승인 범위에서 최소 도구 보완과 실제 배포까지 계속하도록 지시했다. 현재 준비한 코드는 원 C04 권위/영수증을 수정하지 않는다.

- `prelaunch-youtube-v74-cutover.mjs`: 정확한 웹0ae67→3e584와 metadata3경로만 허용한다. 다른 env/비밀경로/R2/port/검증 생략은 거절한다. 새49 successor는 원 personal/DB232/C04 activation·post 영수증과 연결하며 실제 activation bytes를 봉인하기 전 PIN은 null로 유지한다.
- `youtube-v74-controlled-cutover.mjs`: 정확한48→49에 한정한 전환 후보다. 웹 선배포·DB232/C04/queue0·OFF/구48정지 확인 후만49를 발급하며 CAS 불확정은 읽기 재확인하고 등록 뒤 구48 자동복귀/추가 generation 발급을 하지 않는다. 등록된 exact JTI/만료·actual launchctl root command/PID·인증/빈claim 거절·localhealth를 확인한다. **아직 실제 적용하거나 완결된 운영 복구 도구로 검증하지 않았다.**
- `verify-youtube-v74-cutover-native.mjs`: 운영 볼륨/키/네트워크 없는 일회 PostgreSQL17에서 실제 제한 manager CAS·rollback·중복false·fingerprint/digest 보존·manager 직접쓰기 거절9개를 통과했다. 최초 image platform 지정 누락은 startup 실패였고 ARM64/로컬image-only로 정정했다. 운영 DB는 건드리지 않았다.
- 새49 artifact37파일·descriptor/current-policy/config를 고정 새 경로에 준비하고 실제 도구 로그인과 기존 운영 DB232/C04 읽기 전용 preflight를 통과했다. 이는 credential 발급이나 운영 적용이 아니다.

공식 `pnpm deploy:dev -- --reviewed-ref 3e58467499c63ba20c3b3191d9dd7dec77a7aa44 --already-applied-db --db-config <기존 full-local 설정> --env-file <고정 metadata3경로 patch> --test-script test:feedback-batch:web` 실행 요청은 자동 승인 검토에서 **실행 전에 거절**됐다. 사유 원문: “이는 운영 웹을 실제 교체하는 배포이며, 원 사용자 요청은 운영 배포를 명시적으로 금지했고 해당 배포를 승인한 신뢰할 수 있는 사용자 발화가 없습니다.”

기존 승인 원문을 부모가 top-level delegation의 transcript_evidence로 전달해야 동일 작업을 재검토할 수 있다. 거절된 배포는 다른 명령/간접 경로로 재시도하지 않았다. 부모 thread로 상태 전달 도구는 `thread not found`로 실패했다. 이 문서/작업 최종 응답으로 정확한 차단을 전달한다.

현재 실제 웹/DB/worker 전환0·gen49 발급0·추가모델0이며 웹0ae67/DB232/worker6b610/gen48 유지다. 다음 실행 전에는 DB와 발급/intent 파일을 다시 읽어 중복을 방지해야 한다. 실제 웹 선배포→gen49 등록/교체/ON→대표1회→불변 activation PIN과 도구 설치/문서 반영은 미완료다. 선택 회귀·타입·lint와 native 결과를 운영 성공이나 전체 P5 통과로 확장하지 않는다.

최종 독립 검사는 선택 Vitest217개(7파일)·실패/skip0, native PostgreSQL17 9개·실패0, 선택 lint exit0/경고0, typecheck exit0, Anti Slop 신규0이다. 같은49 resume의 순수 검사4개는 추가 발급/CAS 없이 OFF forward repair·ON 영수증 대조·committed 읽기 확인·foreign49 거절을 다룬다. 실제 운영 resume의 성공 증거는 아니다. [기계 판독 준비/차단 기록](evidence/youtube-v74-cutover-preflight-20261016.json)을 보존한다.
