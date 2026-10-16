# C04 활성 worker를 유지하는 UI 후속 배포 준비

이 변경은 일반 `--reviewed-ref` UI 후속 배포의 읽기 검증만 보완한다. 원 C04
DB227·reader floor·writer·worker review 및 P1/P2를 바꾸거나 새 영수증을 발행하지 않는다.
배포는 기존 `pnpm deploy:dev`를 사용하며 SQL·worker 설치·정책·credential CAS를 수행하지 않는다.

기존 OFF 경로는 현재 `verified-policy-disabled` journal과 postOFF의 실제 PID/plist/DB 상태를
검사한다. ON 후속 경로는 현재 journal의 `activation-committed`와 원 immutable activation
verification/receipt를 추가로 소비한다. activation-not-applied, unknown, commit intent,
receipt 누락 또는 다른 검증과 섞인 receipt는 거부한다. historical post 조회만으로 ON을 허용하지 않는다.

ON 검증은 원 R/operation/DB2, reader/writer 영수증 bytes, post origin과 artifact·descriptor·
credential·source·schema·snapshot, 당시 OFF→ON 전체 policy 행 SHA와 enabled/updated_at을
제외한 stable policy SHA를 묶는다. 현재 DB227 catalog·ACL/함수 지문·원장·C03/C01/C04 ON과
worker ON, queue/processing 0·permit 미보유·enqueue 세션 0도 확인한다. 현재 업무 자료 해시는
검증하되 원 P1 당시 값과 같다고 요구하지 않는다.

자연 재시작은 원 영수증의 PID를 수정하지 않는다. 원 plist SHA와 고정 설치 경로의 봉인 artifact·
descriptor·credential bytes를 대조하고 현재 running PID를 두 번 관측한다. 기존
`verifyYoutubeResolutionWorkerCaller`의 인증 pre-request/빈 인증 거부와 봉인 runner의
`health`만 재사용한다. claim·job·모델 호출이나 provider 실행은 하지 않는다. 건강 확인 뒤
기존 고정 worker 상태 SQL로 policy/credential/catalog/queue를 다시 읽는다. PID 또는 설치
자료 변경·30분 이내 credential 만료·건강/인증 실패를 거부한다.

봉인 artifact의 식별값은 검증된 manifest의 logical `artifact_sha256`이며 JSON 파일의 raw
SHA와 구분한다. 원 before checkpoint에 결속된 `generation-47.plist`를 읽어 기존 launcher
환경 검증기로 PATH·TMPDIR·NVM Node 보존을 확인한다. node 앞의 승인된 env prefix를
파싱하므로 TMPDIR 때문에 고정 인덱스를 가정하지 않는다. 현재 plist 전체 SHA와 runner/flags의
정확 일치를 계속 요구하므로 새 환경 값을 허용하는 경로는 아니다.

새 PID의 launchctl 출력도 root-depth의 path/type/program/arguments/working directory/state/PID가
동일한 승인 plist 명령인지 확인한다. 누락·중복·불완전한 출력은 거부하고 health 뒤에도 같은
loaded 명령과 PID를 재확인한다. 환경/coalition/semaphore 등의 중첩 state는 root state와
구분한다. 기존 일반 상태 parser 자체는 바꾸지 않는다.

canonical worker plist는 macOS LaunchAgents 설치 파일 규칙으로만 읽는다. 고정 경로의 파일은
실제 일반 파일·owner·nlink1·0600·canonical 경로를, 부모는 owner·canonical·그룹/다른 사용자
쓰기 금지를 확인한다. 정상 LaunchAgents 0755는 허용하며 디렉터리 권한을 바꾸지 않는다.
NOFOLLOW fd/inode와 읽기 전후 파일/부모 결속을 검사하고 health 뒤에도 같은 reader로
재확인한다. private 영수증·토큰·secret root의 기존 0700 검사에는 예외를 추가하지 않는다.

일반 후속은 live reader floor의 Git 후손만 허용하고 환경 변경과 SQL/worker/protected source를
섞지 않는다. 기존 원 권위와 closed R2 marker/history를 유지하는 새 continuation marker만 만든다.

```sh
pnpm deploy:dev:plan -- --reviewed-ref <정확한-UI후손40자리SHA> --already-applied-db --db-config <기존승인config> --test-script test:feedback-batch:web
pnpm deploy:dev -- --reviewed-ref <동일SHA> --already-applied-db --db-config <동일config> --test-script test:feedback-batch:web
```

plan 통과는 실제 DB/worker 검증 통과를 뜻하지 않는다. 이 변경의 로컬 증거는 PIN을 중립화한
소유 fixture와 OS/file/network mock이다. 실제 activation 파일·키·DB·서비스는 로컬 검사에서
읽거나 실행하지 않았다. 실제 installed 도구와 정상 UI 후속 배포의 성공 확인은 총괄의 별도 단계다.


## 공개 레시피 수량 projection의 닫힘 승계 예외

C04 worker 단계의 기존 closed-R2 continuation에서만 공개 레시피 재료의
`quantity_input` exact projection 보완을 허용한다. CLI의 plan과 stage가 실제
live.ref/target의 Git blob 원문 SHA256 두 개를 계산하고, 보호 함수는 검토된
정방향 hash pair와 양쪽 R2/lead false를 모두 요구한다. working tree·환경변수·
새 CLI 옵션으로 이 증거를 바꾸지 않는다. 대상은
`lib/server/hybrid-auth/public-read-policy-runtime.mjs` 한 경로다.

다른 인증/marketing/SQL 파일, 누락·삭제·다른 해시·역방향, active R2 또는
환경/실행 설정 변경은 기존대로 거절한다. 전체 변경 파일 목록을 필터링하지
않으며 active readiness 승계에는 이 예외 증거를 전달하지 않는다. 기존
`verifyProtectedBaseline`의 실제 C04 원 권위·DB227·worker 검증은 그대로다.
이 예외는 새 DB 권한이나 범용 hybrid-auth 변경을 허용하지 않는다.

검토 대상 정책 raw SHA256은 `d7399684db1e10d0bc86847dad3e2d6a361d61f7c1589446b37b9eb0dc089639`
→ `e0d54ee86c56eeae6df11cd7ddf7346e744c72323d098599dc62425c006ac37e`다.
코드의 고정 비교값은 이 순방향 전환만 허용하며 정책 파일이 바뀌면 새 검토가 필요하다.
