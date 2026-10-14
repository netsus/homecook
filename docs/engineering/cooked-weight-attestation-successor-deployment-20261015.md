# 개인 실측 확인227→228: 기존 보호 경로의 후속 준비

앱 후보 `af88126b44cf5abb6fa06f7c08f9eee23ca7de99`와 SQL raw hash `d334ebe8824db1d4e94f865bc0bbd692c46cdde2f6c2077e4cac9d9f8db8d146`를 새 rollout/writer PIN에 결속했다. 원 운영227 metadata에 검증한 SQL delta만 적용한 기대228 지문, 독립 리뷰·격리 DB·private 파일 검증, 새 암호화 백업·USB 사본·격리 복원 증거를 사용한다. 실제 새 운영 DB/reader/ON/worker 건강은 적용 단계에서 따로 확인하며 이 문서로 완료를 주장하지 않는다. C05 전체 동의·자료수집·기간·학습/모델과 별개다.

기존 `deploy-prelaunch-web.mjs`의 `--reviewed-protected-rollout`에 고정 `attestation-database`, `attestation-database-retry`, `attestation-reconcile`, `attestation-reader`, `attestation-writer-on/off` 및 각 `-retry/-reconcile` 단계만 추가한다. 새 CLI/임의 target·ledger·SQL·authority override는 없다. env는 추가하지 않는다.

원 C04 R/T1/T2/P1/reader/writer/activation bytes는227의 역사로 그대로 검증한다. 별도 `cooked-weight-user-attestation` review가 원227 prefix+정확224500 한 파일, scope outer/새 alias의 원 body·owner/ACL/config 보존, 새2표·원행 불변·workercritical de001 및same48 source/credential/모델·정책을 결속한다. 실제 after를 expected로 학습하지 않고 source/격리 postimage에서 기대값을 고정한다. native clone before catalog가 실제 before와 다른 경우 그대로 운영 PIN으로 채택하지 않는다.

DB 단계는 기존 protected engine의 source 검증·snapshot backup·원 admin ledger+postgres DDL·원행 전후 hash·commit intent/unknown reconcile을 재사용한다. 신규 personal control만 기본 OFF이며 C03/C01/C04와worker 원 controls는 보존한다. reader는 OFF fence/새 facts0에서만 최초 이전 웹 보상을 허용하며 reader floor 게시 또는 새 fact 생성 뒤에는 옛 reader로 자동 downgrade하지 않는다.

개인 ON/OFF는 새 control 행을 FOR UPDATE로 잠그고 기존 admitted writer의 FOR SHARE 완료를 기다린다. 개인 OFF는 해당 enabled만 닫고 read/retract/replay를 막지 않는다. C04 safe OFF는 기존 quantity enabled만 닫아 개인 control/원 worker row를 보존한다. 기존 source/권한/멱등·5초lock/unknown 재실행 거부는 유지한다.

`loadCookedWeightAttestationSuccessor(root)`는 고정 guard가 없으면 null, 있으면 새 code PIN부터 검사해 {review,record,pointer,guardPointer,predecessor}를 반환한다. `cookedWeightAttestationSuccessorBinding`의 공개7필드는 schema/reviewSha256/receipt/predecessorDatabaseReceiptSha256/targetSha256/ledgerCount228/migrationSha256이다. 원 DB2 authority는 교체하지 않는다.

기존 `observeQuantityV4WorkerBoundary`는 worker stage에서만 checked successor/current228 adapter를 추가 반환한다. 같은 session/snapshot의 fixed SQL을 재사용하고 원 consumer226/quiesce47에는 successor를 거부한다. worker CLI만 enabled/timestamp 변경에 대한 원 controlled before/after whole+stable proof를 담당하며 current UI/개인 controls는 immutable 후속 영수증이 증명하는 현재 whole을 소비한다. 자연 restart의 PID는 원 영수증에 재표시하지 않고 기존 exact loaded command/plist/artifact/credential의 stable PID 두 번+zero-AI 건강으로 검증한다.

현재 worker 정책은 원 journal과 고정 UUID 경로의 immutable activation/pause/후속 publication에서 검증한다. activation 영수증이 없는 경우에도 같은228의 durable intent와 committed reconciliation이 정확히 결속되면 소비하며 unknown/not_applied나 원227 intent의228 재사용은 거절한다. pause의 원 post/origin은 딱 한 번 읽어 바이트를 대조하고 반복 restart가 원 pause basis를 바꾸지 못한다. 개인 OFF 계획의 expiry/queue 예외는 ON 계획에 적용하지 않는다. 일반 사용자 기록 이후 달라진 normal-data hash는 새 읽기 관측으로 따로 확인한다.

새 private2표는 root 소유의 기존 backup/restore exact 분류에 포함한다. private.* 전체 허용/미분류 면제/권한 완화/원 PIN 재작성은 없다. 최종 SQL/원actual before와 같은 canonical source postimage·owned native/full restore·독립 리뷰를 마친 후 root가 실제 authority를 결속하고 기존 경로로 실행한다. 운영 DB/reader/ON은 이 경로의 실제 실행 결과로만 완료 처리한다.

새 개인 ON 및 ON retry에는 C03/C01/C04 모두 ON과 기존 fresh worker 검증이 필수다. 정확 C04 OFF 영수증은 읽기·개인 OFF·같은 operator intent의 writer-on-reconcile 관측에만 사용한다. reconcile가 committed/not_applied를 확인해도 quantity OFF에서 새 ON 실행이나 ON retry 권위를 만들지 않는다. 이 구분은 engine 내부 apply/reconcile 경로와 기존 CLI의 고정 phase에 결속하고 새 공개 override 옵션은 두지 않는다.

## V3: worker228 same-session 관측 문맥

격리 native에서 worker admin 잠금 세션의 첫 관측은 원 postgres 관측과 full/immutable catalog만 달라 정책 UPDATE 전에 거절됐다. 다른 필드와 원 source/owner/ACL guard는 그대로였다. 원 기대 hash를 바꾸지 않고 checked successor의 preflight가 실제 원 postgres 연결에서 actor/search_path/UTC를 읽는다. 같은 잠금 세션의228 관측은 원 locks 뒤 SAVEPOINT 안에서 postgres role과 캡처된 GUC를 적용해 기존 전체 fixed-query 관측을 수행한다. 성공 또는 오류 뒤 ROLLBACK TO SAVEPOINT→RELEASE→원 admin role/search_path/TimeZone tuple 재확인이 필요하다. `$user`와 백슬래시 표현을 정규화하지 않는다. 후속 enabled UPDATE는 원 admin 권한으로만 실행한다.

227 또는 session 밖 관측은 기존 경로를 유지한다. 초기 role/session 실패, 문맥 적용 실패나 복원 실패는 성공으로 게시하지 않고 원 finally가 세션을 중단하며 정책 UPDATE/COMMIT를 진행하지 않는다. 살아 있는 aborted transaction은 savepoint rollback으로 복원 후 원 관측 오류를 전파한다. 실제 psql transport가 오류로 종료되면 복원 시도도 실패하므로 세션 중단/전체 rollback이 필요하며, 다음 UPDATE를 실행하거나 전체 흐름 PASS로 기록하지 않는다. 모의 actor/config 복원 검사는 실제 worker/native pause/resume 재검증과 별개다.
