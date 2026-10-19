# 요리 개선 DB·웹 반영 전 최소 백업/복구 순서

2026-10-19 계획 전용. 이 문서는 운영 중지·백업·DB 변경·push/PR/머지·배포의 실행 기록이 아니다. 부모가 전달한 08:56 UTC 관찰은 gen50 healthy/PID98098, policy ON, 작업43개·queued0·processing0·permit 없음·active enqueue0이다. 실행 직전 같은 항목을 다시 확인한다. 고정 웹 PID39019/39025와 DB232도 관찰 당시 값이다.

## 기존 무중단 경로의 범위

- `scripts/lib/marketing-round2-controlled-deploy.mjs:289`의 `backupRecordingSnapshot`은 exported snapshot을 사용하는 전체 DB custom dump와 비밀번호 없는 roles dump를 생성한다. archive 목록과 전체 decode, SHA·target·snapshot을 확인하며 API/worker를 멈추지 않는다.
- `scripts/lib/prelaunch-database.mjs:1060`의 보호 배포 엔진은 같은 transaction의 관찰·잠금·snapshot·직전 DB 백업·SQL/원장 commit을 지원한다. 기존 기능별 exact review 경로이며 요리233/234/235를 현재 그대로 받지는 않는다.
- 이 경로는 Storage payload·암호화·off-Mac 사본·전체 플랫폼 clean restore와 24시간 readiness를 대체하지 않는다. `supabase-local-only-operations.md`의 별도 DB snapshot 추가 경로도 이 구분을 명시한다. 관찰된 플랫폼 백업은10월14일자로 오래됐고, 파일 존재만으로 갱신할 수 없다.
- 따라서 **새 일반 백업 도구는 만들지 않는다.** 기존 플랫폼 백업/검증/사본/clean restore/readiness 경로를 먼저 완료하고, 실제 DB 변경 직전에는 기존 온라인 snapshot 엔진을 재사용한다. 현재 플랫폼 도구에는 worker 수명주기와 admission fence 연동이 없어 아래의 작은 연결 작업이 선행되어야 한다.

## 보존과 승인 경계

기존 사용자의 최신 백업·검증 및 일시 서비스 재시작 승인 범위에 정확한 서비스 중지/동일 설정 재시작이 포함된다. 운영 담당자가 확인한 exact `launchctl bootout gui/501/com.homecook.youtube-extraction-worker`와 **기존 plist 그대로**의 `launchctl bootstrap gui/501 <검증한 기존 plist 경로>`만 사용한다. RunAtLoad=true를 확인하며 재설치/새 plist/자격 발급/세대 전환을 하지 않는다. 새 PID는 정상 재시작 관찰값으로 별도 기록한다.

보존 대상은 gen50·자격/만료2026-10-22T14:27:30Z·policy ON/updated_at·고정 A/B·activation/approval/history·R2/lead/C05 OFF다. A resume은 이미 활성화된 실행을 검증할 뿐 재시작하지 않는다. 과거 증거를 바꾸거나 PID 검사를 제거하지 않는다. 웹 변경은 정상 다음 `pnpm deploy:dev` handoff로 새 SHA/build/PID를 기록한다. 백업은 개인 데이터의 새 사본을 만들므로 기존 승인된 비공개 경로/암호화/보관 정책을 따른다. 역할/권한/키 범위를 넓히지 않고 비밀값·전체 env는 출력하지 않는다.

## 실행 전 필요한 작은 연결 작업 — 현재 미완료

1. **정확한 admission fence와 복구 연결:** 현재232 schema에서 enqueue 함수는 insert 전에 `pg_advisory_xact_lock_shared(86120317)`을 취한다. 기존 v71 코드에도 session-level exclusive lock 선례가 있다. 동일 키의 전용 exclusive session을 사용하면 먼저 들어온 enqueue가 끝날 때까지 기다리고 이후 enqueue를 막으며 COMMIT 뒤에도 유지할 수 있다. 과거 v71 CLI 자체는 gen47/policy 변경을 포함하므로 실행하지 않는다. deploy.lock은 배포 CLI 직렬화용이며 요청 차단이 아니다.
2. fence session/backend 소유권·현재 lock 보유·연결 생존을 별도 관찰한다. 과거45초/60초 transaction timeout을 백업 시간에 그대로 쓰지 않는다. 시간 한도와 취소/실패 경로를 정하고 live session을 잃으면 성공 또는 queued0으로 간주하지 않는다. DB에서 차단 중인 신규 요청의 timeout/재시도 응답과 중복 방지도 확인한다. 기존 active enqueue 관찰은 lock 대기 중 요청도 active로 센다. 따라서 exclusive 이전 shared holder가 모두 끝났다는 증거와, 그 exclusive 뒤에서 정상 대기 중인 새 enqueue를 구분하는 좁은 관찰/시간 한도가 필요하다. 기존 지문/gate의 active0 조건을 임의 완화하지 않으며 이 구분은 아직 미검증이다.
3. **실패 시 gateway 복구 조건:** session lock은 연결이 끊기면 풀린다. 현재 플랫폼 finally는 worker와 무관하게 API를 모두 복구하므로 그대로 조합해서는 이 실패를 감쌀 수 없다. 기존 consistent-cut의 정확한 gateway stop/start 경계에 좁은 복구 연결을 넣는다. 유효한 fence를 확인한 상태에서는 gateway/API를 먼저 재시작해 worker RPC를 허용하고, worker healthy 확인 뒤에만 fence를 풀어 enqueue를 허용한다. fence가 불명확하면 gateway를 자동 개방하지 않는다. 중간 lock 상실은 race 가능성이 있는 UNKNOWN으로 기록하고, gateway 폐쇄 상태에서 재획득·진행 중 enqueue/queue 재관찰 뒤에만 재개한다. lock 상실부터 gateway 폐쇄까지의 순간을 무요청으로 증명할 수 없으므로 새 queued/processing/permit가 있으면 중지 상태를 자동 확정하지 않는다. 완전한 durable maintenance 모드가 이미 있는 것으로 위장하지 않는다.
4. 기존 backup CLI는 시작 시 gateway/auth/PostgREST/Storage(+존재하는 realtime)가 모두 running이어야 한다. gateway를 먼저 외부에서 끄고 무수정 CLI를 호출하지 않는다. worker restore와 gateway 조건은 기존 cut controller의 순서·실패 복구에 연결하고, 대상/원래 running 상태·정확 ID를 보존한다. worker가 gateway를 통해 Data API를 쓰면 해당 경로를 먼저 복구하고, **유효한 fence가 유지된 상태**에서 동일 plist bootstrap/health를 확인한다. gateway/API running과 enqueue 허용은 다른 상태다. 내부 PostgREST만 살아 있다는 이유로 worker 준비 완료로 세지 않는다. 복구 도중 fence 상실은 위 UNKNOWN 경로로 돌아간다.
5. **요리 DB exact review:** 기존 보호 엔진에 원233/234/후속235 source SHA·DB232 preimage·DB235 postimage·기존 역할/ACL/행 보존·한 transaction 원장 규칙만 지정한 좁은 검증 연결이 필요하다. quick lane 분류기/전역 allowlist를 완화하지 않는다. 새 readiness/config의 SHA가 기존 승인 binding과 달라지면 새 exact binding을 만들고 옛 증거는 보존한다.
6. **정상 웹 successor handoff:** A의 DB232/옛 웹 census를 DB235/새 웹에 그대로 통과시키거나 역사 A/B를 덮어쓰지 않는다. 현재 gen50 자격/정책/활성화 보존과 새 DB receipt/웹 build·PID·인증/readiness를 연결한 다음 정상 배포 handoff를 운영 담당자와 고정한다.

이 연결을 코드/fixture로 검증하고 독립 리뷰하기 전에는 아래 순서를 실행 가능한 완성 도구로 주장하지 않는다. 새 운영 작업을 승인받기 위한 포괄 프레임워크가 아니라 현재 경로의 정확한 중단/복구 누락을 메우는 범위다.

## 실제 진행 순서와 중단 조건

| 단계 | 실행/성공 조건 | 실패·불확실 시 |
|---|---|---|
| 0 준비 | 부모 직렬화 확인, 단일 deploy.lock, 현재 source/target/구조·서비스 ID/기존 plist SHA·policy/자격 지문·만료·R2 OFF 확인. 백업 목적지/키 복구 자료와 isolated restore 자원 준비. | 다르면 운영 mutation 없이 중단. 전체 env/자격 원문 수집 금지. |
| 1 신규 enqueue 차단 | 전용 session exclusive86120317 획득과 보유 확인. 이전 shared holder0과 exclusive 뒤 신규 blocked waiter를 구분하고, 진행 중 실제 enqueue가 없음을 확인. 먼저 queued가 있으면 worker가 처리하도록 계속 가동하되 정해진 시간 내 drain만 기다린다. | lock 실패/상실·시간 초과는 중단 또는 UNKNOWN 복구. policy OFF→ON 금지. |
| 2 fresh drain | 실제 fence 아래 queued0/processing0/permit 없음과 gen50/정책 지문 동일 확인. worker stop 바로 전 재확인. | 기존 drain helper의 maintenance_mode=true를 만들어 넣지 않는다. 이 helper는 검사 전용이며 현재 실재 fence 근거와 구분한다. |
| 3 정확 worker 중지 | exact label bootout, 해당 PID/프로세스 부재 확인. plist/activation/자격은 보존. | 이미 실행됐는지 확인 후 판단하며 무조건 bootout 재시도하지 않는다. API를 아직 멈추지 않았으면 동일 plist 복구 후 종료한다. |
| 4 기존 플랫폼 백업 | 기존 승인 config·새 immutable 출력 경로로 platform-backup. 도구가 정확 writer set을 멈춰 DB+Storage 동일 cut을 만들고 복구한다. fence 생존과 worker/gateway 연결 조건을 유지한다. | 부분 stop도 정확히 성공한 서비스만 역순 복구. finally 오류를 숨기지 않는다. archive 실패여도 Data API/worker 복구를 우선하며 DB는 변경하지 않는다. |
| 5 API·worker 복구 | 유효 fence 확인 → worker가 사용하는 gateway/API 경로 재시작·readiness 확인(enqueue는 fence로 계속 차단) → 같은 plist bootstrap → 새 PID/health/정책·자격·만료·queue와 실제 인증/요청 권위 확인 → fence 해제. | restart 실패 시 intake를 닫아 보존하고 원인/상태를 보고한다. lock 상실이면 gateway 조건부 폐쇄 및 UNKNOWN 재관찰. 새 세대/키로 복구하지 않는다. |
| 6 백업 확정 | 기존 archive verify → 승인된 off-Mac 사본 및 키 복구 확인 → 별도 isolated 전체 clean restore → 실제 evidence로 readiness 기록. | stale metadata 재서명/시간만 갱신 금지. 이 단계 동안 운영 중단/fence를 계속 유지할 필요는 없다. |
| 7 push/PR/merge | 백업 증명 뒤 로컬 검증 후보를 작은 PR로 push/독립 검토/merge. 정확 최종 master와 배포 대상 고정. | 타 작업/v85 refactor는 합치지 않는다. build/검토 대기 때문에 worker를 멈춰 두지 않는다. |
| 8 DB233→234→235 | 최신 readiness(<24h)·승인 target/source/ledger 재확인. 별도 짧은 fence/drain/동일 worker 중지·복구 창을 반드시 반복한다. 해당 엔진의 job/permit/policy 잠금 중 polling을 계속시키지 않는다. 기존 보호 엔진의 online exported snapshot 전체 DB 백업 뒤3 SQL+원장을 한 transaction에 적용하고 exact postimage/행·권한 보존을 확인한다. | commit 불명확은 read-only 원장/구조 reconcile 전 재시도 금지. DB reset/복원/수동 이력 덮어쓰기 금지. |
| 9 정상 웹 handoff | worker/Data API 정상 복구 뒤 부모와 직렬화해 pnpm deploy:dev. 새 DB receipt와 SHA/build/PID를 정상 successor 기록으로 연결. 인증/권위/readiness/history 및 R2 OFF 확인. | 웹 실패는 호환성이 증명된 이전 웹만 복구. DB235는 유지하고 옛 A의 검사를 삭제하지 않는다. |
| 10 실제 흐름 | 운영 Mac Chrome에서 모바일/데스크톱 요리 실행분 수정·새로고침·영양/완성무게 추정/실측·완료 저장/재조회, 레시피·끼니 영양표, 남색 배경/책 탐색 확인. 최근 영양 대상 데이터 보정은 별도 승인된 최소 백업 범위로만 진행. | 합성 HTTP/SQL을 실제 사용자·브라우저 통과로 승격하지 않는다. 저장/권위/표시 문제는 별도 수정/검증한다. |

단계8의 기존 보호 엔진은 현재 요리 feature를 받지 않는다. 위 exact review 연결과 worker/gateway/fence 실패 경로가 완료될 때까지8을 호출하지 않는다. 각 중단 창은 별도 fresh 관찰을 사용하며 long PR/build/restore 기간 동안 transaction·worker stop을 유지하지 않는다.

## 확인과 남은 증거

- 현재 운영 구조를 비밀번호/개인 행 없이 격리한 원233/234/235 HTTP17 PASS, 기존 SQL25 PASS, schema 비교기8 PASS는 앞선 [현재 구조 기록](data/cooking-current-schema-preflight-20261019.json)을 따른다. 운영 인증/웹 성공 증거는 아니다.
- 이번 계획 검토의 선택 회귀: `full-local-platform-backup.test.ts`, `full-local-backup-readiness.test.ts`, `prelaunch-database.test.ts`, `youtube-v71-controlled-cutover.test.ts` **4파일107 PASS**. mock/로컬 fixture 검사이며 운영 서비스·backup·restore·launchctl 실행은0이다.
- 별도 첫 선택 실행은 앞 두 파일67 PASS이나 `prelaunch-recipe-request-role-maintenance.test.ts`가 파생 fixture의 `round2-closed-marker-rotation-bridge.mjs` import 누락으로 collection 실패(exit1)했다. 무관한 도구를 수정하거나 전체 green이라고 쓰지 않는다.
- pure quick migration 분류기는233/234의 procedural SQL과235의 ALTER FUNCTION을 모두 거절했다. 이를 우회하지 않는다. 현재232 schema 오프라인 대조에서는86120317 참조가 enqueue 함수 하나에만 있었고 worker claim이 같은 fence를 잡는다고 주장하지 않는다.
- 추가로 검증할 fixture는 exclusive/shared 대기·COMMIT 뒤 유지·연결 상실 해제, 이전 enqueue 완료/신규 enqueue 차단·blocked waiter 구분·timeout/재시도, lock 상실 각 시점의 gateway containment, partial API stop 복구, worker bootstrap 실패, backup 실패 후 동일 plist 복구, DB commit 불명확 reconcile, 정확 source/ledger/postimage 거절 사례다. 신규 도구 대신 기존 controller/session/engine의 좁은 연결에 집중한다.

독립 읽기 리뷰에서 P2 세 가지(복구 시 gateway와 enqueue 개방 구분, DB 적용창 worker 중지 필수화, 정상 blocked enqueue와 active enqueue 구분)를 받아 위 계획에 반영했다. 수정 후 독립 재리뷰의 잔여 확정 P1/P2는0건이다. 새 실패 경로의 실행/검증 완료를 뜻하지 않는다.

현재 결과: 무중단 **DB-only** 경로 확인, 전체 플랫폼 백업의 서비스 중단 필요/worker 복구 누락 확인, 복구 순서와 실패 조건 구체화. 운영 중지·새 백업·복원 검증·push/PR/merge·DB/웹 반영은 미실행이다.

## 실행 준비 보완 — 운영 중단 전 기록

부모의 후속 실행 지시에 따라 기존 consistent-cut에 재시작 전후 admission fence 확인을 연결했다. `cooking-maintenance-local.mjs`는 현재 정확 target·고정 activation/기존 plist·policy ON/자격/만료/43jobs·웹/R2 지문을 관찰한다. 신규 enqueue는 기존86120317 exclusive session으로 막고, 이전 shared holder와 해당 lock 뒤 blocked waiter를 구분한다. worker는 exact bootout 뒤 동일 plist bootstrap만 사용한다. 로컬 health에 더해 기존 실제 loopback 인증200/빈 claim 거절·readiness·catalog/release 및 동일 PID 두 관찰을 확인한 뒤에만 fence를 푼다.

기존 동기 플랫폼 백업은 별도 Node Worker thread에서 수행해 main의500ms fence 감시를 유지한다. fence 상실은 영구 UNKNOWN으로 기록하고 gateway를 반복 폐쇄한다. 진행 중이던 늦은 API start가 차단을 뒤집지 못하도록 start 후 재검사에 실패하면 같은 writer를 다시 멈춘다. 복구 실패 시 신규 키/세대/정책 전환으로 우회하지 않는다. 독립 코드 재리뷰의 잔여 P1/P2는0건이다.

예상 영향: snapshot cut 동안 gateway/auth/PostgREST/Storage(+현재 realtime)가 일시 중단되어 로그인·API·이미지 요청이 실패할 수 있고, 요리 데이터 저장도 잠시 재시도가 필요하다. 유튜브 신규 접수는 fence에서 대기/timeout될 수 있다. worker는 정상적으로 새 PID가 되며 config/plist/자격/만료는 그대로다. 실제 중단 길이는 데이터/Storage 크기에 달려 있어 상한을 보장하지 않는다. 백업 검증·off-Mac 복사·격리 복원·PR/build 동안에는 운영을 복구해 둔다.

실패 복구: dump/Storage 실패도 원래 정확 API set을 복구한 뒤 동일 plist worker와 실제 인증/health를 확인한다. 차단 연결·API/worker 복구를 확인할 수 없으면 gateway를 닫고 해당 상태/소유 fence/backend/receipt를 대조한 뒤 재개하며, 불확실 호출을 중복 실행하지 않는다. DB commit과 운영 데이터 변경은 이 백업 단계에 없다. 실제 백업 성공 전 source/target/config·출력 경로와 실행 결과를 별도 비공개 receipt로 남긴다.

새 검증: 선택3파일82 PASS, lint0. 소유 network-none·port0·mount0 PG17의 실제 advisory/함수5검사 PASS(이전 shared holder, COMMIT 뒤 exclusive 유지, 일반 읽기 허용, blocked enqueue 분류, 연결 종료 후 대기 요청 재개); 소유 컨테이너 정리 확인. 운영 읽기 사전 관찰은 같은PID98098·실제 인증/readiness 성공·큐/processing/permit0을 확인했다. 연결 단절 호출은 생성 전 실패해 파일/로그 불변을 대조했고, 그 뒤 로컬 변경·검사만 재실행했다. 이 기록 시점 운영 중지/백업/DB/웹 변경은0이다.
