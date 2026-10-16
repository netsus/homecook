# YouTube 접수 fingerprint V2 실행 준비

범위는 기존 V1 종료 작업8건을 보존하고 미래 접수만 V2로 복구하는 것이다. 추출기 후보·완성 무게 후속·Anti Slop 정리는 포함하지 않는다. 구현·격리 검증만 승인됐고 실제 키 생성·보안 설정·DB 전환·웹 재시작은 별도 실행 시점 승인 대상이다. 이 문서는 운영 복구 성공 기록이 아니다.

## 구현

- `scripts/youtube-fingerprint-recovery.mjs`: `prepare`, `stage-key`, `resume-key`, `apply`, `retry-apply`, `reconcile`, `recover-receipt`, `recover-compensation-receipt`, `compensate`만 제공한다. 임의 SQL·key version·키 경로·target·환경 patch 옵션은 없다.
- 원 C04·DB232·v74 activation의 코드 고정 SHA와 기존 보호 관찰을 유지한다. 정책의 current 버전 `'1'→'2'`와 `updated_at`만 바꾼다. 이전 버전/TTL은 null 유지, worker gen49/PID·credential·snapshot·catalog·DB ledger232·기존 jobs·일반 자료·writer 상태를 보존한다. 기존 종료 작업은 다시 활성화하지 않는다.
- READ COMMITTED 전용 transaction에서 exclusive advisory lock86120317을 먼저 획득하고 별도 statement의 새 snapshot으로 전체 policy CAS·전역 active0·유효 permit0·V1 terminal8·V2 이력0을 확인한다. jobs/정책/credential/permit의 SHARE ROW EXCLUSIVE 잠금과 lock5초/statement30초 제한을 사용한다. 원행·일반 자료는 잠금 안에서 전후 비교한다.
- Keychain의 별도 승인 hash와 private plan/source 전후 blob 목록을 연결한다. 후속 배포는 원 v74 영수증을 검증한 다음 새로운 영수증으로 policy hash 두 개만 이어받는다. 실제 DB full policy와 DB 계산 해시도 매번 비교한다. 원 영수증이나 guard를 덮거나 해시 비교를 생략하지 않는다.
- 고정 private 파일에서 V2 환경값1개만 주입한다. plist와 다른 dotenv/설정은 바꾸지 않는다. 시작 전에는 마지막 결속 버전, 배포 baseline에서는 실제 DB 버전에 필요한 current/유효 previous 키의 UTF8 최소32바이트를 최종 runtime env에서 검사한다. 기존 metadata/readiness·인증 검증은 그대로 유지한다. cursor V1은 접수용 키와 구분한다.

## 승인할 정확한 운영 범위

| 항목 | 목적·위치·변경 |
|---|---|
| V2 비밀1개 | 32 random bytes를 base64url로 표현. 접수의 사용자·영상·결과 정책 HMAC으로 active 중복을 식별한다. 로그인/JWT/worker credential 키가 아니다. `~/.homecook/youtube-extraction/fingerprint-hmac-v2`, 소유자 현재 사용자·0600, 기존 parent0700. 웹 child의 `HOMECOOK_YOUTUBE_EXTRACTION_FINGERPRINT_HMAC_KEY_V2`로만 주입 |
| 암호화 복구본1개 | `/Volumes/HomecookOffMac/homecook-backup/youtube-fingerprint-v2-20261017.key.enc.json`, 0600. 기존 parent0700 필요. 기존 공식 backup encryption Keychain 항목을 메모리에서만 읽어 별도 purpose의 AES-256-GCM envelope 생성, 복호화/동일성 검증. 네트워크 전송·평문 외장 복사 없음. 기존 백업 키/issuer는 변경하지 않음 |
| 승인 hash1개 | `~/Library/Keychains/login.keychain-db`, service `homecook-youtube-fingerprint-recovery-v1`, account `approved-plan-sha256`. 비밀값 대신 승인된 plan SHA256만 create-only 등록. 자동 update/delete 없음. 파일 묶음 변조 방어이며 같은 OS 사용자까지 막는 불변 저장소로 주장하지 않음 |
| 운영 정책1행 | `private.youtube_extraction_current_policy`의 `primary` current `1→2`와 `updated_at`만. 이전 버전 null, policyVersion3·enabled·pipeline/options 유지. target systemIdentifier7669475895419854882 / PG17 / 기존 full-local config byte 결속 |
| 증거 파일 | `~/.homecook/operations/youtube-fingerprint-v2-20261017` 0700 아래 승인 plan·정책 원행 백업·append-only 시도별 journal·후속 영수증0600. key 값/키 digest 없음 |
| 공식 웹 배포 | 검토된 후보 ref의 공식 `pnpm deploy:dev` 경로. 새 도구 설치가 필요하면 같은 후보의 `pnpm deploy:dev:install`로 한정. plist retarget와 기존 프로세스 교체만 수행, 모든 기존 환경/인수/R2 false 보존 |
| Chrome 통합1회 | 사용자 Mac Chrome의 확인된 QA 계정에서 기존 대표 영상 `pjwILwDVC7U` 신청1회. 성공 시 worker 모델 실행이 발생하므로 추가 반복·새 영상은 별도 판단. 실패 시 중복 클릭/자동 재신청하지 않음 |

스키마·함수·index·DB ledger·GRANT/RLS·auth 서버·Docker 구성·worker artifact/PID/gen49·C05/R2 설정은 변경하지 않는다. 기존 V1 키를 새 값으로 채우지 않으며, 기존8건의 fingerprint·결과·알림 식별값을 재작성하지 않는다.

## 실행 순서와 명령

아래 명령은 **승인 전 실행하지 않는다**. 먼저 최종 후보 SHA로 읽기 전용 prepare를 실행해 private plan과 SHA256을 제공한다. 실행 시에는 보고된 정확한 후보/plan path/hash를 대입하고 새 관찰이 일치하지 않으면 중단한다. 원 사용자 checkout은 사용하지 않고 검토된 깨끗한 checkout에서 수행한다.

```sh
node scripts/youtube-fingerprint-recovery.mjs prepare --candidate CANDIDATE_40_SHA --output PRIVATE_PLAN_JSON
node scripts/youtube-fingerprint-recovery.mjs stage-key --plan PRIVATE_PLAN_JSON --plan-sha256 APPROVED_PLAN_SHA256 --confirm preserve-v1-eight-and-enable-future-v2
node scripts/youtube-fingerprint-recovery.mjs apply --plan PRIVATE_PLAN_JSON --plan-sha256 APPROVED_PLAN_SHA256 --confirm preserve-v1-eight-and-enable-future-v2
pnpm deploy:dev -- --reviewed-ref CANDIDATE_40_SHA --already-applied-db --db-config /Users/cwj/.homecook/operations/mumeok-beta-db-backup-20261015-4g3a88bt/staged-production.env --test-script test:feedback-batch:web
```

`stage-key`는 기존 키를 교체하지 않는다. 백업 생성 후 primary 생성 전에 중단되면 `resume-key`로 같은 암호화 복구본에서만 복원한다. 키 파일이 이미 있으면 두 복사본의 일치를 확인한다. 외장디스크·Keychain이 잠겼거나 접근이 거절되면 중단하며 권한 수정/우회·다른 위치 탐색을 하지 않는다.

DB를 V2로 전환한 뒤 기존 웹은 여전히 접수 실패 상태이며, 새 공식 웹이 올라와 V2를 읽을 때 접수가 복구될 수 있다. 이 전환 구간에는 짧은 웹 재시작 중단과 접수 실패가 가능하다. 다른 배포와 동시에 진행하지 않는다. worker를 멈추거나 enabled를 토글하지 않는다. 새 웹 canary·health·배포 보호 확인을 마친 후에만 실제 Chrome 신청을 한다.

## 실패·보상

- 커밋 전 검증 실패: DB transaction rollback. 새 key는 보존한다. `reconcile`은 exclusive lock과 새 snapshot으로 읽기 판별만 한다. 자동 재시도하지 않는다.
- commit 전송/응답 또는 영수증 publication 유실: uncertain으로 기록하고 새 DB update·키 재발급을 금지한다. `recover-receipt`는 원 plan/dispatch/실제 full policy·DB 해시·일반 자료·worker 일치가 증명될 때 로컬 영수증만 복원한다. DB write0이다.
- 실제 미적용이 확정되면 `recover-receipt`로 시도의 not-applied 증거를 남긴 뒤, 같은 승인 plan·같은 key의 `retry-apply`만 명시적으로 허용한다. 새로운 상태/계획이 필요하면 재승인해야 하며 기존 Keychain 승인을 자동 교체하지 않는다.
- 웹이 여전히 원53da 상태이고 V2 작업이 **한 번도 생성되지 않았음**을 잠금 안에서 확인한 경우에만 승인 범위의 `compensate`로 policy2→1+새 timestamp를 기록할 수 있다. 이는 원래의 접수 불가 V1 상태로 돌아가는 것이며 복구 성공이 아니다. 키·백업·원 영수증은 남긴다. 보상 commit 유실은 `recover-compensation-receipt`로 같은 방식으로 판별한다.
- V2 작업 생성 후, 실제 웹 교체 후, 원행·일반 자료·worker drift 또는 불확실한 결과에는 자동 보상/이력 삭제/키 제거가 없다. 읽기 재조정 후 V2를 보존한 forward fix가 필요하다. 일반 웹 rollback을 DB 보상으로 사용하지 않는다.

```sh
node scripts/youtube-fingerprint-recovery.mjs reconcile
node scripts/youtube-fingerprint-recovery.mjs recover-receipt --plan PRIVATE_PLAN_JSON --plan-sha256 APPROVED_PLAN_SHA256 --confirm preserve-v1-eight-and-enable-future-v2
node scripts/youtube-fingerprint-recovery.mjs compensate --plan PRIVATE_PLAN_JSON --plan-sha256 APPROVED_PLAN_SHA256 --confirm preserve-v1-eight-and-enable-future-v2
```

## 완료 기준과 검증 경계

운영 완료는 key/readiness 메타데이터만으로 선언하지 않는다. 배포 후 실제 사용자 Mac Chrome 로그인 HTTP 신청→V2 job1개→동일 worker 처리→알림→결과 열기→QA 레시피북 저장 및 플래너 연결까지 확인해야 한다. 새로고침/뒤로가기에서도 작업이 복구되고 기존8건 조회/소유권·일일 quota가 유지돼야 한다. 동일 active 요청의 dedupe는 격리 테스트에서 확인하며 운영에서 모델 호출을 늘리기 위한 반복 클릭은 하지 않는다. 실제 HTTP 상태를 캡처하지 못하면 패킷 수준의200/202를 측정했다고 쓰지 않는다.

현재 기존 worker smoke는 직접 모델 경로를 통과했지만 로그인 접수 경로를 통과하지 않았다. V1 key 누락은 독립적인 접수 차단이며 authenticated readiness RPC의 추가 문제는 아직 분리되지 않았다. V2 연결 뒤에도 실패하면 그 경로를 조사해야 한다.

검사 결과·최종 후보·private plan hash·독립 검토 판정은 실행 준비 보고서에 기록한다. 미실행 운영·권한/RLS·로그인 HTTP·모델 품질/완성무게 정확도를 이 문서의 구현 완료로 확대하지 않는다.

## 로컬 검증 결과

- 표적 회귀: 10파일370 PASS/0 FAIL. V2 key/secret-file·승인 앵커·전체 policy·보상 preimage·commit-dispatch/응답/영수증 유실과 기존 R2/C04/저장/웹 배포 보호 포함.
- 실제 PostgreSQL: native15.15와 기존 로컬 pinned Docker17.6에서 각각13 PASS. enqueue/digest/index를 운영 읽기 정의와 같은 SHA로 설치한 뒤 실제 `pg_get_*` 해시도 대조했다. V1 경합·활성 거절·stale V1·동시 V2·terminal 재신청·quota/admin·old8/일반 자료/credential/permit 보존·V2 이력의 보상 금지를 확인했다. 양쪽 임시 DB 종료·삭제 완료.
- `tsc --noEmit`, 변경 파일 ESLint(오류/경고0), `next build`, `git diff --check` 통과. build에는 기존 추출기 bundle의 미사용 변수 등 기존 경고가 남는다. 제품 UI/계산 로직 변경이 없어 새 Chrome 화면 검증은 운영 전환 후의 로그인 접수 기준으로 남겼다.
- 독립 검토에서 세션 이름·source plan 연결·독립 승인 앵커·보상 full preimage 누락을 수정했다. 최신 검토는 CRITICAL/HIGH 잔여 없음이며 실제 준비 관찰과 실행 승인을 대신하지 않는다.

PG fixture는 합성 테이블/자료와 catalog assertion stub을 사용하므로 운영 RLS·PostgREST·실제 인증·worker/모델 성공을 증명하지 않는다. 기존 종료 작업의 소유권 조회와 실제 로그인 HTTP 통합은 운영 전환 뒤 별도로 확인한다. 실제 키/보안 설정/DB update/운영 재시작/신규 추출은 이번 준비에서0이다.
