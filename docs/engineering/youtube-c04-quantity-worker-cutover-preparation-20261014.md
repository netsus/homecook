# C04 수량 worker 전환 준비 (2026-10-14)

상태: 로컬 source 준비. 원 v71의 8e source·46→47·DB219 PIN과 실행 경로는 유지한다. `c04-quantity-v4`는 별도 명시 profile이며 최종 release/artifact/원 검토 PIN/operationRoot가 모두 `null`이라 현재 실행은 거부된다. 아래 명령은 총괄의 향후 봉인·통합·검증을 위한 계약이며 실제 운영 완료 기록이 아니다.

## 고정 대상과 순서

같은 모델/정책3/pipeline85fb…/snapshot17577…/schema-v2를 유지한다. C04 SQL은 최신 C01 `60b9…` 뒤의 010000·200000·210000·213000·220000·223000 여섯 원문이며 worker phase는 SQL을 실행하지 않는다. 마지막 223000 `f586…`의 13 worker postimage와 sealed expected schema `2ea26…`/catalog `de001…`를 기존 artifact verifier가 검사한다.

| 단계 | 기존 CLI의 명시 호출 | 필요한 경계 / 결과 |
|---|---|---|
| 준비 | `node scripts/youtube-v71-controlled-cutover.mjs --profile c04-quantity-v4 --prepare` | 새 sealed artifact/descriptor와 원 검토·DB226·old47 정합. 준비 사본만 생성; 정책·credential·서비스 변경 없음 |
| 최초 정지 | 같은 prefix + `--quiesce LOCAL_FULL_PRODUCTION_YOUTUBE_C04_GEN48_QUIESCE` | DB226/catalog81362·source8e/gen47. DB worker 정책 OFF 후 queue/processing0·permitfalse·activeenqueue0이면 exact old47을 정지하고 pre를 발행 |
| worker DB | 기존 보호 DBtool의 worker-stage | 원 pre/R/T1을 소비하여 admin actor로 정확 223000만 적용. DB227/catalogde001 terminal 발행 |
| 교체 | 같은 prefix + `--execute LOCAL_FULL_PRODUCTION_YOUTUBE_C04_GEN48_CUTOVER` | DB2/pre/fresh47 OFF·정지. 기존 restricted issuer/300초 이내 manager로 CAS47→48. 설치·인증/빈 claim 거부·실제 local health·동일 PID 2회 후 **quantity/worker 모두 OFF**인 post 발행 |
| OFF 복구 | 같은 prefix + `--resume LOCAL_FULL_PRODUCTION_YOUTUBE_C04_GEN48_CUTOVER` | 원 journal과 동일 source48, quantity/worker OFF. 이미 등록된48을 재발급/재회전하지 않고 설치·건강을 재검증. 필요하면 새 불변 post 검증 발행 |
| reader/수량 ON | 기존 보호 reader/writer 경로 | reader의 publication P1과 ON 시 직접 검증한 P2를 각각 보존. 수량만 ON; worker는 OFF 보존 |
| worker 활성화 | 같은 prefix + `--activate LOCAL_FULL_PRODUCTION_YOUTUBE_C04_GEN48_ACTIVATE` | 정확 DB2·reader/ON 권위·원 post·source48·유효 credential·동일 plist/model/정책·queue0. 현재 안정 PID 2회/health 증거를 먼저 영속 저장한 뒤 worker.enabled만 CAS true. 별도 activation receipt |
| 활성화 후 복구 정지 | 같은 prefix + `--pause-for-repair LOCAL_FULL_PRODUCTION_YOUTUBE_C04_GEN48_PAUSE_FOR_REPAIR` | 기존 DBtool로 quantity OFF가 된 동일 R/DB2/48/launcher·원 activation 또는 durable intent만 허용. worker.enabled만 false. 남은 job/permit이면 `drain_pending`; 0이 된 뒤 exact48 정지 및 별도 repair-pause receipt |

C03/C01 writer ON은 보존한다. 모델/options/fingerprint key version/previous TTL을 초기화하지 않는다. local startup policy 파일의 `enabled=true`는 같은 정책의 startup attestation이며 실제 DB worker OFF를 켜는 권위가 아니다. DB OFF의 claim/enqueue fence와 zero queue는 별개로 확인한다. 실제 AI/extraction/job를 생성하는 health 검증을 하지 않는다.

## 원 검토와 영수증 결속

원 19필드 R이 source/target/UUID/operationRoot/CAS47→48/226→227/schema/artifact를 고정한다. pre/post digest의 조건부 null은 출처 검증 생략이 아니다. DBtool의 code PIN과 고정 guard loader가 T1/DB2를 읽으며 새 CLI 경로·SQL·generation·TTL 인수를 받지 않는다. 실행 전 PID나 미래 receipt hash를 원 R에 넣지 않는다.

33필드 pre/post는 `homecook.prelaunch-quantity-worker-before.v1` / `-after.v1`이다. pre.workerDatabaseReceiptSha256는 null, post는 정확 immutable DB2 원문 SHA다. artifact/descriptor는 두 phase 모두 **새 sealed target**을 뜻하며 pre의 실제 old artifact는 v71 고정 출처와 old47 metadata/plist로 따로 확인한다.

`pre-worker-origin.json`은 quiesced journal, `post-worker-origin.json`은 초기 post publication journal의 create-only 사본이다. receipt와 origin을 fsync/create-only 저장한 뒤 current journal의 `preWorkerOrigin`/`postWorkerOrigin`과 receipt pointer를 마지막에 갱신한다. 후속 CAS/activation state에서도 origin의 원 R/source/target/op/state/path/hash를 읽는다. 파일 소유자·0600/0700·symlink 금지·원 SHA가 필수다.

quantityOFF/workerOFF/동일48의 resume repair는 `verifications/<UUIDv4>/post-worker-terminal.json`과 같은 폴더의 `post-worker-origin.json`만 사용한다. 원 pre/post 파일은 삭제하거나 덮지 않는다. 같은 repairPause를 재사용한 자연 재시작 P3는 pause에 고정된 원 previousPost/origin·activation pointer 세트를 그대로 정책 근거로 삼고 current post pointer만 갱신한다. 새 pause가 생기면 새 basis를 고정하며 history 탐색/재귀는 하지 않는다. 원 R.postReceiptSha256가 nonnull이면 다른 post SHA를 자동 승격하지 않는다. quantityON 이후 자연 PID 변경은 post를 다시 발행하지 않고 activate의 같은 source/artifact/plist/credential·fresh PID/health 검증으로 처리한다.

reader의 P1과 ON의 P2는 서로 다른 불변 publication일 수 있다. worker profile은 DBtool의 검증된 loader만 소비하며 P1 PID/normalData와 P2를 임의 동일시하지 않는다. activation/repair-pause는 정책 raw row SHA와 before/after의 `policyStableSha256`, 원 post·activation proof pointer를 유지한다. stable SHA는 PG canonical `to_jsonb(policy)`에서 정확 `enabled`·`updated_at` 두 필드만 빼며 다른 필드는 모두 포함한다. 최초 P1 origin·activation before/after·pause before/after·P2 origin의 stable SHA는 같아야 한다. reader/writer와 worker profile의 이 교차 경계는 최종 통합 후 다시 검사한다.

## 오류·복구 경계

- 각 단계에서 기존 global deploy lock → owned invocation lock → 같은 DB session의 serializable/advisory/table lock 순서다. preflight의 target/backup 준비 확인은 DB lock 이전 1회이며, 잠금 안에서는 검증된 adapter의 고정 observation을 같은 transaction에 사용한다. phase 종료 시 잠금을 해제한다.
- 실제48 등록 이후 실패하면48/OFF와 원 journal을 유지한다. old47 plist 단순 복원·자동49 발급·unknown outcome 재회전은 없다. confirmed commit readback만 같은 credential resume을 허용한다.
- activation 전에 원 health 증거를 저장한다. 새 verification을 발행하면 current activationReceipt/activationReconciliation을 null로 비우되 옛 immutable 파일은 보존한다. commit 응답이 사라져도 원 durable intent와 exact48/정책 출처가 있어야 완료 readback 또는 명시 repair OFF가 가능하다. activation receipt가 없으면 `activation-reconciliations/<UUID>/receipt.json`의 원 OFF before·expected ON stable/semantic·실제 ON whole/stable을 기록한다. DBtool의 긍정 repair chain은 `committed` reconciliation만 채택하며 `not_applied`/혼합 상태를 ON 성공으로 처리하지 않는다. foreign source/credential/plist·무관한 journal은 거부한다.
- safe OFF 자체는 busy queue/만료 credential/불건강 worker를 이유로 막지 않는다. 남은 작업은 삭제/강제 lease clear/새 AI로 소진하지 않는다. 긍정 quiesced·resume·ON 증거는 queue0/permitfalse 등을 충족한 뒤에만 발행한다.
- activation-verified-policy-disabled/activation-not-applied 중 설치 실패는 원 OFF proof와 fresh quantity/worker OFF를 확인한 resume으로 설치·상태만 복구한다. 선택한 불변 verification pointer는 설치 전에 current journal.installationRepairBasis로 저장하여 재실패 후에도 같은 observation 기준을 유지한다. current verification과 path/SHA가 다르면 거부하며 새 verification에서만 이 current pointer를 비운다. quantityON을 OFF로 가정하지 않는다. 이미 ON 후 기존 DBtool safeOFF를 했다면 같은 writer actionjournal로 자동 재ON/reader 재발행할 수 없으며 새 정확 review/operation이 필요하다.
- 이미 만료된48은 OFF 정지는 가능하나 health/resume/활성화는 실패한다. 이 profile은 새 generation이나 credential 회전 권위를 만들지 않는다.
- DBtool의 C04 safeOFF는 quantity만 닫고 worker.enabled를 보존한다. worker의 복구 OFF는 위 명시 profile의 별도 권위다.

## 검증 범위

선택 unit은 fixed review/33필드/출처·조건부 digest/CLI 뒤쪽 임의 인수 거부, prepare side effect0, busy OFF, CAS47→48·manager cleanup, 확인된/unknown commit, 48 설치 실패 후 forward resume, durable activation 전에 ON0, reader/ON·fresh health 누락 거부, activation unknown 뒤 안전 OFF, 원량 데이터 hash 보존·repair, foreign 거부를 모의 transport로 검사한다.

실제 CLI의 publisher/reader는 owned 임시 HOME에서 원 pre/post/origin4파일 보존 및 UUID repair 경로·nonnull post PIN 거부를 확인한다. local attestation ON + DB claim OFF의 no-extraction 회귀도 모의 RPC다. v71 sealing fixture는 정확 Git `8e515a6482a1dfaa292d6f67ae6aa8a06f84d2d4` artifact 입력을 자기 임시 폴더에 archive하여 원 PIN/assertions를 유지한다.

실제 issuer·운영 DB·credential·launchctl·worker·모델/영상 실행은 미실행이다. DBtool helper 통합, 최종 source commit 후 artifact/descriptor 재봉인·PIN 결속, owned controlled-native 전체 phase와 installed worker 실제 zero-AI 건강 검증, 운영 후 자연 traffic 확인은 총괄의 후속 단계다. 로컬 fixture 통과를 해당 운영 증거로 사용하지 않는다.
