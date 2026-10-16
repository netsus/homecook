# YouTube 접수 — 기존 V2 키 복구 실행 준비

> 최신: [운영 반영 결과](youtube-fingerprint-v2-operating-20261017.md). 아래는 실행 전 준비 기록이다. 정책/웹은 반영됐고 Chrome 실제 신규 신청은 대상 계정 확인 대기다.

최종 범위는 **기존 V2 키를 그대로 쓰고 DB의 요구 버전을1→2로 복구**하는 것이다. 새 키 발급·키 교체·별도 비밀 파일·암호화 키 백업은 제외했다. 추출기 후보·완성 무게 후속·Anti Slop 정리도 포함하지 않는다. 실제 Keychain 승인 hash 등록·DB 전환·웹 재시작은 실행 시점 승인 대상이며 아직 수행하지 않았다.

## 조사에서 바로잡은 전제

처음에는 V1 종료 작업8건만을 보고 새 V2 발급안을 준비했다. 실제 READ ONLY prepare가 기존 V2 이력 때문에 안전하게 거절했고, 추가 집계에서 **V1 8건 + V2 33건(성공24/실패9)**을 확인했다. 현재 공식 웹 checkout의 `.env.production.local`에는 V2 키가 남아 있다. 33개 V2 작업의 당시 사용자/영상/결과 정책으로 계산한 HMAC이 **33/33 일치**했다. 원문 키·fingerprint·개인 식별자는 출력/저장하지 않았으며 집계만 남겼다.

따라서 기존 V2 namespace에 새 값을 만들면 안 된다. 중간 커밋 `890b8eef`의 새 키 발급 코드는 최종 후보에서 제거했으며 **그 중간 커밋을 실행하지 않는다**. 현재 장애는 policy가 요구하는 V1과 실제 남아 있는 V2 키의 불일치다. 최초 불일치 시점은 미확정이며 PR1731/1732가 새로 키를 유실시켰다고 단정하지 않는다.

## 구현 범위

- 전용 CLI: `prepare`, `authorize-plan`, `apply`, `retry-apply`, `reconcile`, `recover-receipt`, `recover-compensation-receipt`, `compensate`. 임의 SQL·key version·키 경로·target·환경 patch 옵션은 없다.
- 원 C04·DB232·v74 activation의 코드 고정 SHA와 기존 보호 관찰 유지. `primary` policy의 current `'1'→'2'`와 `updated_at`만 변경. previous/TTL=null, policyVersion3·enabled·pipeline/options 유지.
- READ COMMITTED에서 exclusive advisory lock86120317 획득 후 별도 statement의 새 snapshot으로 full policy CAS·전역 active0·유효 permit0·V1 terminal8·기존 V2 33을 확인. policy/credential/jobs/permit의 SHARE ROW EXCLUSIVE 잠금, lock5초·statement30초 제한. 기존41개 원행의 ID 해시별 전체 행 지문과 일반 자료·worker·구조를 전후 대조.
- 승인 plan/source 전체 blob 목록을 별도 Keychain 승인 hash에 연결. 원 v74 영수증을 먼저 검증하고, 후속 영수증으로 policy hash 두 개만 승계. 실제 DB full policy와 DB 계산 해시도 대조한다. 기존 영수증이나 guard를 덮지 않는다.
- 사전검사는 **실제 운영 checkout의 env-file loader를 격리 child에서 실행**해 최종 runtime env의 current/유효 previous 키 최소32 UTF8바이트를 확인한다. 복구 준비/실행에는 기존 V2의 33/33 HMAC 일치도 필요하다. copied env object에서 dotenv 값을 놓치는 오류를 피한다. 키/키 digest를 반환하지 않는다.
- 시작 전에는 마지막 결속 버전을 검사하고, 배포 baseline에서는 실제 DB 버전을 검사한다. 기존 metadata/readiness·인증 경로는 유지한다. cursor V1은 별도 용도다.

## 승인할 정확한 조치

| 항목 | 목적·위치·영향 |
|---|---|
| 기존 V2 키 | `~/.homecook/prelaunch-web/releases/53da069a4b27-BiZLes/checkout/.env.production.local`에 이미 존재. `HOMECOOK_YOUTUBE_EXTRACTION_FINGERPRINT_HMAC_KEY_V2`는 접수 active 중복 식별용 HMAC이다. 키 발급/값 변경/외부 전송/새 비밀 파일 생성0. 새 웹은 공식 배포의 기존 private dotenv 복사 경로로 동일 값을 받으며 시작 전 재검사 |
| 승인 hash1개 | `~/Library/Keychains/login.keychain-db`, service `homecook-youtube-fingerprint-recovery-v1`, account `approved-plan-sha256`. 승인 plan SHA256만 create-only 등록. 자동 update/delete 없음. 파일 묶음 변조 방어이며 같은 OS 사용자까지 막는 불변 저장소는 아님 |
| DB policy1행 | 기존 full-local PG17, systemIdentifier7669475895419854882. current1→2와 새 timestamp만. 기존41건·quota 기록·result·알림 식별값·schema/index/functions/GRANT/RLS·ledger232 보존 |
| 증거 파일 | `~/.homecook/operations/youtube-fingerprint-v2-20261017` 0700 아래 plan·정책 원행 백업·시도별 journal·후속 영수증0600. 키 값/키 digest/원 사용자 식별자 없음 |
| 공식 웹 배포 | 검토된 후보의 `pnpm deploy:dev` 경로. 필요한 경우 동일 후보의 `pnpm deploy:dev:install`로 도구 갱신. 기존 env/인수·R2 false 유지, 웹 프로세스 교체만. worker artifact/PID/gen49·C05/R2·auth 서버·Docker 구성 변경0 |
| 로그인 Chrome1회 | 확인된 QA 계정으로 대표 영상 `pjwILwDVC7U` 신청1회→동일 worker 처리→알림→결과→저장/플래너 연결. 실제 모델 실행 가능성이 있으므로 추가 반복/다른 영상/중복 클릭은 피함 |

기존 웹도 이미 V2 키를 가지고 있으므로 **policy2 commit 직후 새 접수를 받을 수 있다**. 새 웹 배포 전까지 계속503이라는 이전 전제는 폐기한다. 다른 배포와 겹치지 않게 진행하며, 웹 교체 때 짧은 중단은 가능하다. worker를 멈추거나 enabled를 토글하지 않는다.

## 실행 명령

아래는 **실행 승인 후** 검토된 깨끗한 checkout에서 실행한다. 먼저 최종 후보로 READ ONLY prepare를 수행해 실제 plan path/hash를 제시한다. 상태가 다르면 중단하며, 기존 원 사용자 checkout의 미커밋 변경을 건드리지 않는다.

```sh
node scripts/youtube-fingerprint-recovery.mjs prepare --candidate CANDIDATE_40_SHA --output PRIVATE_PLAN_JSON
node scripts/youtube-fingerprint-recovery.mjs authorize-plan --plan PRIVATE_PLAN_JSON --plan-sha256 APPROVED_PLAN_SHA256 --confirm preserve-v1-eight-and-enable-future-v2
node scripts/youtube-fingerprint-recovery.mjs apply --plan PRIVATE_PLAN_JSON --plan-sha256 APPROVED_PLAN_SHA256 --confirm preserve-v1-eight-and-enable-future-v2
pnpm deploy:dev -- --reviewed-ref CANDIDATE_40_SHA --already-applied-db --db-config /Users/cwj/.homecook/operations/mumeok-beta-db-backup-20261015-4g3a88bt/staged-production.env --test-script test:feedback-batch:web
```

Keychain이 잠겼거나 접근이 거절되면 그 조치만 중단한다. 새 키 생성·권한 수정·다른 저장 위치 탐색으로 우회하지 않는다. 승인된 plan의 원행/worker/source가 달라지면 새 검토가 필요하며 승인 hash를 자동 교체하지 않는다.

## 실패와 복구

- 커밋 전 실패는 transaction rollback. `reconcile`은 잠금과 새 snapshot에서 실제 결과만 읽는다. 원행 미적용이 확정되면 `recover-receipt`가 not-applied 증거만 남기고 같은 plan/키의 명시적인 `retry-apply`를 허용한다.
- commit 전송/응답·영수증 게시 유실은 uncertain. 원 plan/dispatch·실제 full policy/DB 해시·원41 지문·worker/구조가 일치하면 `recover-receipt`가 **로컬 영수증만** 복원한다. DB update·새 접수·키 발급은 없다.
- commit 뒤 새 V2 작업이 생기면 **보상은 금지**한다. 다만 정확한 commit과 원41 보존을 입증하면 영수증 복원은 허용한다(`committed-with-new-work`). 새 작업의 정상 결과 때문에 변한 일반 자료를 과거 hash로 덮지 않으며, 기존 DB 보호로 구조/권위·full policy를 확인한다. 활동 중인 worker가 있다면 idle 후 재확인한다.
- 웹이 원53da이며 **원41 이후 새 작업이 없고 전체 jobs 지문이 동일함**을 잠금 안에서 확인한 경우에만 승인된 `compensate`로 current2→1+새 timestamp를 기록한다. 이는 원래 접수 불가 상태로 돌아가는 것이며 복구 성공이 아니다. 원 영수증·기존 키를 남긴다.
- 원41 변경/유실, policy·worker·구조 불일치나 불확실 상태는 자동 보상/이력 삭제 없이 forward fix로 보고한다. 일반 웹 rollback을 DB 보상으로 사용하지 않는다.

## 완료 기준·검증 경계

운영 완료에는 실제 Mac Chrome의 로그인 HTTP 신청→V2 job1개→worker→알림→결과 열기→QA 저장/플래너 연결, 새로고침 복구와 기존 작업 조회/소유권 확인이 필요하다. metadata/키 검증이나 이전 worker 직접 smoke만으로 접수 성공을 선언하지 않는다. 패킷 상태를 캡처하지 못하면 HTTP200/202를 직접 측정했다고 쓰지 않는다. authenticated readiness RPC의 추가 문제가 남을 수 있다.

로컬 표적 회귀·실제 PG15/17 동시성·typecheck·lint·build·독립 검토의 최종 결과는 실행 준비 보고서에 기록한다. 합성 fixture/catalog stub은 실제 인증·RLS·PostgREST·운영 worker/모델 성공을 증명하지 않는다. 실제 Keychain 등록·DB update·운영 재시작·신규 추출은 준비 단계에서0이다.

## 준비 검사 결과

- 표적10파일 **367 PASS/0 FAIL**. 기존 배포/R2/C04/저장 보호, 최종 env 로딩, 기존 V2 HMAC, 승인 앵커와 full policy/보상/old41 경계 변조, commit 불확실성 포함.
- **PG15.15·PG17.6 각각13 PASS/exit0**, 동일 동결 core SHA `eb42487f9ca0fb0472f7c4fbc333bfbf80635eaa4cf80c9d69a1f4cb4df6ee30`. 원문 enqueue/digest/index의 설치 후 정의 hash까지 확인. 임시 DB/컨테이너 종료·삭제 완료.
- typecheck·변경 파일 ESLint(오류/경고0)·Next build·diff 검사 통과. build에는 변경 전 추출기 bundle의 기존 미사용 변수 경고가 남는다.
- 독립 검토에서 남은 CRITICAL/HIGH 없음. 실제 READ ONLY prepare의 운영 원41·worker·기존 key 일치 확인은 최종 후보에 결속해 별도 보고한다.
- 후보의 기준 master는 `61471885`다. 나중에 머지된 leftovers PR1734/1735 / master`12c17c3`는 이 후보에 포함하지 않았고 덮어쓰지 않는다. 최종 병합/배포 시 전체 diff를 다시 확인한다.

## 실행 승인 후 통합 준비 — 2026-10-16 UTC

사용자는 기존 V2 키 재사용 복구와 PR/머지·정책1행 전환·공식 웹 배포·Chrome1회 확인을 승인했다. 새 키·인증 접근권한 변경은 포함하지 않는다. create-only Keychain 항목은 공개될 수 있는 plan SHA만 담는 변조 방지 앵커이며 비밀 접근권한을 추가하지 않는다. 실제 Keychain 잠금/접근 거절은 우회하지 않는다.

최신 master `91aa40c5d`의 PR1734–1737(남은 요리 응답 파싱·에러 공통화, 경험치 중복 제거·메타데이터 정규화)을 충돌 없이 통합한다. 기존 웹53da→master의9파일 before/after SHA를 개별 고정하고 다른 bytes는 거부한다. 새 후보·전체 diff·검증 결과로 READ ONLY plan을 다시 만들며 이전 fbdd 계획을 다른 후보에 재사용하지 않는다. 별도 무게/추출기 후보는 제외한다.
