# YouTube 접수 fingerprint V2 복구 대안 — 읽기 전용 조사·계획

> 아래는 읽기 전용 조사 당시의 제안과 근거다. 후속 사용자 승인으로 복구 도구를 구현·격리 검증했으며 현재 실행 범위와 제한은 [실행 준비 문서](youtube-fingerprint-v2-execution-readiness-20261017.md)를 따른다. 실제 운영 전환은 여전히 별도 승인 대상이다.

기준: master `61471885a`, 운영 웹 `53da069a4b27672bb5eb9d0a617783c1b9c33d5f` / `prelaunch-53da069a4b27-BiZLes`, worker `3e58467499c63ba20c3b3191d9dd7dec77a7aa44` / v74·verifier47·gen49. 이 문서는 검토 제안이며 실행 승인·구현 완료·운영 복구를 뜻하지 않는다. 이번 초안 작성에서 키 발급, 제품 코드·운영 환경·DB·권한 변경, 신규 신청·모델 호출은 모두 0이다.

## 판단과 우선순위

**원래 V1 키를 권위 있는 출처에서 복구하는 것이 우선이다.** 승인된 외장디스크 탐색은 아래 범위까지 완료했으며 키 후보는 발견하지 못했다. 디스크 전체나 DB/Storage 내용을 검색하지 않았으므로 모든 저장 위치에서 키가 없다고 단정하지 않는다. 이 문서는 V1을 복구하지 못했을 때 검토할 V2 대안이다. V1 후보를 찾더라도 이름·파일 위치·32바이트 충족만으로 동일 키라고 단정하지 않는다. 기존 권위 또는 알려진 fingerprint와의 비공개 동일성 검증이 필요하며 키 원문·검증용 digest를 공개 보고서에 남기지 않는다.

읽기 증거가 유지되고 아래 동시성·권위 보호가 구현·검증된다면, 미래 접수를 V2로 전환해도 **현재 완료된 V1 8건의 기존 중복 처리 의미는 보존할 수 있다.** 이는 기존 작업을 영구 재사용한다는 뜻이 아니다. 실제 함수는 같은 사용자의 `queued`/`processing` 작업만 재사용하며, `succeeded`/`failed` 작업은 새 요청의 재사용 대상이 원래부터 아니다.

따라서 terminal 8건의 원행·V1 fingerprint·결과·완료 서명·관련 레시피·알림을 수정하지 않고, 활성 작업이 전역 0인 경계에서 미래 V2만 시작하는 방식은 현재 중복 계약과 양립한다. V1 활성 작업이 단 1건이라도 있거나 그 부재가 불확실하면 이 대안은 성립하지 않는다. V1 키가 없으므로 이전 버전 fingerprint를 만들 수 없으며 `previous=V1`이라고 허위 등록할 수 없다.

## 확정된 근거와 한계

- `readonly-readiness.json`: `ready=true`, 정책 버전3, 현재 fingerprint 버전 `1`, 이전 버전·TTL 모두 null, gen49 만료 2026-10-22, 실패 신청 전 15초부터 해당 영상 신규 job 0.
- `web-metadata-check.json`, `runtime-key-check.json`: metadata 3경로와 artifact/schema/catalog/policy는 일치하지만 설치 웹 plist + Next production env 로딩의 요구 V1 키는 없다. 최종 full-local 비밀 파일 주입 allowlist에도 fingerprint 키는 없어 별도 주입 경로 누락은 확인되지 않았다.
- `v2-live-contract-readonly.json`: 운영 함수·digest 함수·부분 unique index 정의, V1 `succeeded=7`, `failed=1`. 활성 작업 전역 0은 전환 직전 잠금 안에서 다시 확인해야 하는 가변 조건이다.
- 실제 enqueue는 정책 공유 advisory transaction lock `86120317` 이후 정책을 읽고 key version을 검사한다. 같은 소유자는 별도 advisory lock으로 중복·quota·삽입을 직렬화한다. 부분 unique index는 `(user_id, request_fingerprint_key_version, request_fingerprint)`의 `queued`/`processing`만 제한한다.
- snapshot digest의 입력은 extractor mode, pipeline identity, result-affecting options, policy version이다. fingerprint current/previous key version은 이 digest에 포함되지 않는다. **digest 불변은 policy row hash나 기존 배포 권위까지 불변이라는 뜻이 아니다.**
- 공식 해시 연결을 검증한 과거 plist 18개에서도 V1 키는 모두 없었다(`key-recovery-bound-history.json`). PR1731/1732 이전에도 누락 증거가 존재하며 이번 수정에서 새로 유실됐다고 단정할 수 없다. 실제 최초 누락 시점은 미확정이다.
- 이전 대표 smoke는 worker와 같은 임시 소스로 모델1회 실행하고 DB pinned readiness 관찰값을 주입한 검증이었다. 로그인 사용자 HTTP 접수 검증이 아니었다(`youtube-v74-operating-20261016.md`, 검증 범위 절). 이번 실서비스 HTTP 실패와 모순되지 않는다.
- 키 누락은 readiness가 통과하더라도 `fingerprintKeys -> requireSecret -> 503`이 되는 독립적인 차단 원인이다. 실제 authenticated readiness RPC에 추가 문제가 있는지는 아직 열려 있다. V2 연결만으로 종단간 복구 성공을 선언할 수 없다.

## 외장디스크 읽기 전용 조사 결과

사용자가 이 컴퓨터의 외장디스크 확인을 요청한 범위에서, 마운트된 두 디스크의 집밥 전용 폴더만 조사했다. 두 디스크 모두 마운트되어 있었으며 잠금·접근 거절을 우회하지 않았다. 확인 시각은 2026-10-16 20:01:53 UTC다. 날짜가 붙은 문서명은 기존 작업의 명명 규칙을 따른다.

| 대상 | 확인 범위·시각 | V1 후보·동일성 검증 |
|---|---|---|
| `/Volumes/HomecookOffMac/homecook-backup` 및 바로 아래 백업 폴더 | 암호화 백업22개 중21개 인증·파일 목록 확인. 전부 `data.sanitized.sql`, `manifest.json`, `roles.sql`, `schema.sql`, `storage.payload.tar`만 포함 | 독립된 env/plist 파일0, V1 키 후보0. 후보가 없으므로 fingerprint 일치 검증 미실행 |
| 같은 폴더의 `mumeok-beta-db-backup-20261015-4g3a88bt/platform.tar.gz.enc` | 복원 manifest상 생성 2026-10-14 21:22:11 UTC, 파일 수정 21:23:37 UTC. 인증 성공 | 위와 동일. 실제 V1 값의 DB/Storage 내 존재 여부는 조사하지 않음 |
| `/Volumes/HomecookEscrow/homecook-escrow` | 대응 백업의 키 복구 증명·복원 manifest 파일명과 필요한 메타데이터만 확인 | 앱 환경설정 파일 후보 없음. backup key escrow·복구 issuer 비밀은 V1 fingerprint 키가 아니므로 후보로 취급하거나 원문을 읽지 않음 |
| `/Volumes/HomecookOffMac/homecook-backup/pre-youtube-progress-prod-20260828.1.tar.gz.enc` | 파일 수정 2026-08-27 19:35:55 UTC. 인증 메타데이터 무효로 확인 중단 | **미검증1개**. 우회 복호화·수정·재생성 없음. 같은 날짜의 `-authenticated`·`-v2` 형제본은 인증 성공, 동일한 DB/Storage 파일5개만 확인 |

기존에 등록된 백업 암호화 키를 공식 Keychain 항목에서 메모리로만 읽어 인증하고, 승인된 백업의 파일 목록만 스트리밍했다. 비밀값·DB·Storage 본문을 출력하거나 평문 파일로 만들지 않았고 복원도 실행하지 않았다. 복구용 개인키·credential·escrow 원문 및 다른 개인 폴더는 읽지 않았다. 새 키 발급·키 외부 전송·환경변수 변경·프로세스 재시작은 모두0이다.

증거는 `/tmp/mumeok-beta-integration-20261017/external-all-backup-entry-check.json` 및 `external-backup-entry-check.json`이다. 전자는22개 전체의 경로·파일시각·인증 결과·파일 목록을 기록한다. 인증 실패한1개를 포함해 미확인 내용에서 키가 절대 없다는 결론은 내리지 않는다. 현재 결과만으로 기존 V1 복구 성공을 보고할 수 없다.

## 제안 변경 범위 — 승인 전 실행 금지

| 대상 | 허용 후보 | 보존·거절 조건 |
|---|---|---|
| 미래 fingerprint 비밀 | 새 독립 V2 키 1개를 승인 후 비공개 저장·웹 주입 | V1 키인 척 재사용/대체하지 않음. 원문을 저장소·명령 인수·로그·보고서에 넣지 않음 |
| 웹 실행 환경 | 정확히 V2 환경 키 1개의 비공개 주입과 검토된 공식 재시작 지원 | 다른 env/키·인증·공개 scope·R2 설정 변경 금지. 현재 route는 readiness 버전으로 키를 선택하므로 접수 알고리즘 교체는 불필요 |
| DB policy `primary` 1행 | `fingerprint_key_version: '1' -> '2'`, `updated_at`만 변경 | previous version/TTL은 원래 null 그대로. enabled, policy version3, pipeline, options 등 나머지 필드는 정확히 불변 |
| 보호·배포 도구 | 정확한 원행·새행/웹 env 전후·source/target를 결속한 좁은 검토 지원 및 후속 영수증 | 기존 closedR2/C04/v74 원 영수증 덮어쓰기·검증 생략·범용 env/정책 변경 허용 금지 |
| worker/DB 구조 | 변경 없음 | gen49 재발급, worker 재설치·PID 변경, schema·함수·index·ledger232·권한 변경 금지 |
| 기존 데이터 | 변경 없음 | V1 terminal8 및 기존 일반 데이터·요청/결과·quota 기록·완료 서명 재작성 금지 |

현재 closedR2 보호는 임의 env/row hash 변경을 거절한다. 키 버전은 policy stable hash에도 들어가므로 새 snapshot digest가 같다는 이유로 기존 권위를 통과시킬 수 없다. 원 C04·v74 권위에 연결되는 **새로운 제한 전환 영수증**과 이후 공식 배포/상태 검사가 읽을 수 있는 연속성이 먼저 필요하다. 기존 권위를 새 관측값으로 덮는 방식은 제안하지 않는다.

## 전환 설계의 필수 조건

1. 원 V1 복구 탐색 결과를 먼저 닫고, 실패라면 이 V2 대안을 별도 승인받는다. 검토용 코드·격리 테스트·계획을 먼저 준비하되 실제 키 발급은 승인 후 수행한다.
2. 변경 전에 정확한 target·ledger232·web/build·worker/PID/gen49·schema/catalog·기존 보호 영수증·policy 원행 hash·V1 terminal8 및 일반 데이터 지문을 고정한다. 모든 활성 버전의 queued/processing 수, 유효 permit/lease 및 미확정 전환 상태를 확인한다. 예상 밖 상태는 중단 사유다.
3. V2 키를 비공개로 준비하고 웹이 V2를 읽을 수 있게 하는 단계와 DB 전환 단계를 journal로 구별한다. 정책이 V1인 동안 웹에 V2 키만 추가되면 기존 접수 차단은 계속될 수 있다. 이 중간 상태를 정상 서비스라고 보고하지 않는다. 다른 웹 인스턴스·이전 프로세스가 남지 않도록 공식 경로로 상태를 확인한다.
4. DB 전환은 짧은 단일 transaction에서 **exclusive advisory lock `86120317`을 먼저 획득**한 뒤 실제 policy 원행 전체 CAS와 전역 활성0을 다시 확인한다. 잠금 대기/실패는 제한 시간 내 중단하며 다른 요청을 계속 막고 기다리지 않는다. 원행 CAS는 current='1', previous/TTL=null뿐 아니라 승인된 나머지 전체 원행과 권위도 확인해야 한다.
5. enqueue는 같은 lock을 shared로 잡으므로 먼저 통과한 접수 transaction이 있으면 exclusive 획득이 기다린다. 획득 후 새 snapshot에서 활성0을 다시 확인하여 그 사이 삽입을 놓치지 않는다. REPEATABLE READ의 잠금 전 stale snapshot을 재사용하면 안 된다. READ COMMITTED에서 잠금 다음 별도 statement로 확인하거나, 동등한 격리 안전성을 실제 PostgreSQL 동시성 테스트로 입증한다.
6. 전역 활성0은 lock 안에서 판단한다. worker의 retry/reaper는 processing에서 queued로 바꿀 수 있지만 terminal8을 다시 활성화하는 경로는 이 제안에 추가하지 않는다. 다른 쓰기 경로가 terminal을 부활시킬 수 있거나 유효 작업/permit이 남아 있으면 중단한다. 단순 사전 count=0만으로 충분하다고 주장하지 않는다.
7. 오직 current version과 updated_at을 갱신하고, 이전 null·나머지 policy field·snapshot digest·credential row·worker·schema·catalog·ledger·기존8건/일반 데이터 지문을 비교한다. 정확한 한 행 갱신과 후속 영수증을 확인한 뒤 commit한다. DB commit과 파일 영수증 기록 사이 장애도 journal의 미확정 상태로 처리해야 한다.
8. 전환 직전에 readiness V1을 읽은 옛 요청이 잠금 이후 늦게 enqueue해도, DB current V2 검사에서 `POLICY_CHANGED`가 되어 삽입되지 않아야 한다. 새 웹 요청은 V2/current만 제출하고 previous pair를 null/null로 보낸다. V1 키를 모르는 상태에서 fallback fingerprint를 추측하지 않는다.
9. commit 후 읽기 진단으로 exact V2 전환·readiness·환경 충족·old8/worker/일반 데이터 불변·공식 보호 체인 연속성을 먼저 확인한다. 실제 로그인 HTTP 신청/모델 호출은 이 읽기 계획과 별개인 승인된 횟수/대상 안에서만 실행한다.

## 기존 작업·quota·중복 계약

- V1 terminal8은 계속 소유권을 검사하는 기존 read projection으로 조회된다. V2가 old job ID·결과·알림을 바꾸지 않는다. 기존 완료 식별값·서명은 재작성하지 않는다. 소스의 completion delivery key는 job ID와 완료 시각의 SHA-256이며 fingerprint HMAC 키로 계산하지 않는다. archive cursor는 별도 `HOMECOOK_YOUTUBE_EXTRACTION_CURSOR_HMAC_KEY_V1`을 사용하므로 이 키도 변경 범위에 넣지 않는다.
- 사용자 retry API는 허용된 원 작업의 영상 ID를 읽고 현재 정책으로 새 접수를 수행한다. 원 terminal 행을 queued로 바꾸는 방식이 아니다. 이는 `youtube-async-extraction-routes.ts`의 `parsed.kind === "retry"` 경로와 이어지는 공통 접수 흐름에서 확인했다.
- 같은 V2 사용자·영상·결과 정책의 동시 요청은 첫 job이 queued/processing인 동안 같은 job을 반환해야 한다. 서로 다른 키 버전의 active 중복을 index 자체가 막지는 않으므로 V1 active0 전환 경계가 필수다.
- 첫 요청이 이미 terminal이 된 뒤 같은 영상을 새로 신청하면 새 job을 만들 수 있다. 이는 기존 함수의 상태 계약이며 “영구 중복 방지”나 “완료 결과 자동 재사용”으로 설명하지 않는다. 동시2요청 테스트는 worker 완료를 보류해 활성 겹침을 보장해야 한다.
- quota는 key version별로 초기화하지 않는다. 운영 함수는 소유자 전체 job의 active 수와 24시간 count를 계산한다. 기존 admin의 일일 한도 예외와 active 2개 한도는 유지한다. V2 전환이 기존 일일 사용량을 없애지 않아야 한다.
- V1 terminal8의 content/signature 불변과 V1 키 없이 새 V1 fingerprint를 만들 수 없다는 사실을 구분한다. terminal 조회를 위해 fingerprint 비밀을 다시 계산해야 하는 다른 코드 경로가 있으면 전환 전에 별도 검토한다.

## 실패·보상·forward fix

현재 `rollbackAvailable=false`다. 이 대안은 정상 동작했던 이전 웹으로 즉시 되돌릴 수 있다는 보장이 아니다.

| 실패 시점 | 허용 가능한 계획 | 금지·한계 |
|---|---|---|
| 키 준비/웹 준비 중, DB 미commit | 중단하고 staging 자원을 비공개로 보존 또는 검토된 정리. DB V1·기존 데이터 유지 | 현재의 broken53 상태를 복구 성공으로 보고하지 않음 |
| DB transaction 내부 | CAS/활성0/검증 실패 시 rollback. 원 policy·기존 행 보존 | lock 밖에서 임의 재시도·새 키 재발급하지 않음 |
| commit 확인, V2 job이 전혀 생성되지 않았음이 lock 안에서 재확인됨 | 사전에 격리 검증·승인한 경우에만 exclusive lock+정확한 postimage CAS로 V1 의미 상태에 보상 전환 가능. 웹 환경과 보호 영수증도 함께 보상 기록 | V1 키가 여전히 없으므로 도착 상태는 broken53 수준. 원래 updated_at/영수증을 덮어 과거와 같았다고 꾸미지 않음. 미검증 자동 rollback 제공 금지 |
| V2 job 생성 후, 진행 작업 존재, commit/응답 유실 등 결과 불확실 | 먼저 읽기·journal reconciliation. V2 키·영수증을 보존하며 forward fix | V2 job 삭제/키 제거/V1 무조건 회귀/중복 새 신청 금지. terminal 여부만 보고 이미 생성된 V2 이력을 지우지 않음 |

보상 자체도 정책/환경을 변경하는 별도 실제 조치다. 최초 전환 승인에 정확한 보상 범위가 포함되지 않았다면 실행 전에 승인이 필요하다. 외부 파일과 DB의 원자성은 없으므로, DB commit 후 영수증 기록 실패를 “전환 안 됨”으로 간주하지 않는다.

## 제안 검증 matrix — 아직 실행하지 않음

| 환경/검사 | 필수 결과 |
|---|---|
| 격리 PostgreSQL, 실제 운영 enqueue/digest/index 정의 | current1·previousnull·terminal8 prestate 재현. 원 digest 입력에 key version 없음 확인 |
| 격리, V1 active 한 건 또는 foreign active version | exclusive lock 획득 후 전환 거절, 기존 상태 불변 |
| 격리, 먼저 시작한 V1 enqueue와 전환 경합 | 앞선 enqueue 완료를 기다린 후 활성0 조건에서 거절. 유실·cross-version 중복 없음 |
| 격리, readiness V1 후 늦은 enqueue | 전환 후 POLICY_CHANGED, 새 V1 job0 |
| 격리, 두 V2 동시 요청·첫 job 활성 유지 | 1 insert, 동일 job_id, 한 응답 deduplicated=true, quota 증가1 |
| 격리, 첫 V2 job terminal 뒤 재신청 | 기존 계약대로 새 job 가능. 영구 중복 방지라고 오해하지 않음 |
| 격리, 서로 다른 영상/사용자·active/daily quota·admin | 소유자별 직렬화·active2·일반 daily10·기존 admin 예외 유지, old V1 사용량 포함 |
| 격리/API, V1 terminal 결과 조회·소유권 | old8 내용·서명·결과·job ID 불변. 타인·비로그인 조회 거절 |
| 격리, missing/짧은 V2키·previousnull | missing키는 접수 전503; previous RPC pair null/null; 없는 V1키 요구 없음 |
| 격리, CAS drift/lock timeout/환경 교체 실패/commit 전 실패 | side effect 없음 또는 명시적 보상, 원행 보존 |
| 격리, commit 응답 유실/영수증 기록 실패/V2job 생성 후 실패 | uncertain reconciliation·forward fix, 새 요청·과거 덮기 없음 |
| 격리, 허용 범위 밖 env/정책/worker/gen/schema 변경 | 좁은 도구가 모두 거절. closedR2/C04/v74 체인 생략 불가 |
| 승인 후 운영 READ ONLY 전후 대조 | ledger232/원8/일반 데이터/credential/gen49/worker/PID/schema/catalog/정책digest 불변, current2+updated_at만 변경 |
| 별도 승인 후 로그인 Chrome 통합 | 원 실패 재현과 인접 정상 흐름. 실제 HTTP enqueue·queue/result를 관찰하며 승인된 새 모델 횟수만 사용 |

## 승인 전 남은 위험

1. 승인된 외장 백업의 파일 목록 범위에서 V1 후보를 찾지 못했다. 인증 실패1개와 DB/Storage 본문·다른 미확인 위치는 미검증이다. 다른 권위 있는 V1 보관 위치가 확인되면 V2 전환 필요성을 다시 판단한다.
2. V2 변경을 허용하면서 기존 closedR2/C04/v74 권위를 보존하는 정확한 도구·영수증 설계 및 격리 검증이 없다. 기존 guard를 우회해 실행할 수 없다.
3. 실제 authenticated readiness RPC의 동시 문제·지연은 아직 완전히 분리하지 못했다. 키 연결 후에도 503이 남을 수 있다.
4. 전환 중 이중 웹 프로세스·지연 요청·DB commit과 파일 journal 간 틈에 대한 실패 검증이 필요하다.
5. 소스상 완료 delivery key·archive cursor와 접수 fingerprint 키는 분리되어 있다. 운영에서 기존 terminal8의 소유자 조회와 기존 알림·커서 동작을 다시 확인해야 하며, 그 비밀이나 기존 식별값을 이번 전환 범위에 넣지 않는다.

결론은 **조건부로 가능한 fallback 설계이며 실행 준비 완료가 아니다.** 원 V1 복구가 실패한 뒤에만 범위와 위험을 사용자가 검토할 수 있도록 제안한다.

## 코드·문서 근거와 이번 산출물 경계

- 접수 오류·retry·키 선택: [youtube-async-extraction-routes.ts](../../lib/server/youtube-async-extraction-routes.ts), 특히 retry226행·오류처리246–258행·최소길이525행·동적 키 선택697행.
- HMAC의 입력과 최소길이: [youtube-async-extraction.ts](../../lib/server/youtube-async-extraction.ts), `buildYoutubeExtractionFingerprint`.
- 원 함수·인덱스·완료 키 계약: [20260812160000_youtube_async_extraction_notification.sql](../../supabase/migrations/20260812160000_youtube_async_extraction_notification.sql). 실제 최신 함수는 읽기 전용 운영 정의와도 대조했다. 마이그레이션 원문만으로 현재 운영 정의라고 가정하지 않는다.
- 기존 smoke의 실제 범위: [youtube-v74-operating-20261016.md](youtube-v74-operating-20261016.md).
- 이미 반영된 UI4건과 웹/worker 구분: [beta-audit-four-ui-fixes-20261017.md](beta-audit-four-ui-fixes-20261017.md), [PR1731](https://github.com/netsus/homecook/pull/1731)·[PR1732](https://github.com/netsus/homecook/pull/1732)·문서 [PR1733](https://github.com/netsus/homecook/pull/1733).

이번 변경은 이 문서1개이며 제품 구현·설정·보호 도구는 변경하지 않았다. 외장백업 조사 결과 JSON과 읽기 전용 DB 함수·인덱스 관찰값을 대조하고 로컬 참조 경로·diff 형식을 확인했다. 위 제안 검증 matrix, 실제 키 복구·발급, V2 접수·배포·보상은 **미실행**이다. 원 checkout과 별도 추출기 구현은 보존했다.
