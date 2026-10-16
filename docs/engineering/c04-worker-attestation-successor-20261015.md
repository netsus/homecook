# 개인 실측 DB228 이후 C04 worker 제어의 증거 연결

이 변경은 기존 C04 제어 도구가 별도로 검증된 개인 실측 successor를 소비하도록 연결한다.
원 DB226/T1·DB227/T2·gen47→48·P1/reader/writer/activation review와 PIN, historical
checkpoint/origin 검증은 그대로다. SQL224500 최종 bytes와 expected postimage, 격리 native
결과 및 실제 terminal receipt가 없으면 DB228 운영 준비 완료로 판정할 수 없다.

`observeQuantityV4WorkerBoundary`는 원227 authority를 유지하고 별도 successor를 반환한다.
동일 adapter의 매 관측과 transaction session 관측은 현재228 target/ordered ledger/full
catalog/immutable/scope/source를 검사한다. worker 제어 도구는 receipt path/SHA, review SHA,
원DB2 SHA, target, migration SHA, ledger228을 현재 관측과 새 기록에 결속하며 worker critical
catalog de001·gen48·source/schema/snapshot·credential·stable policy를 유지한다.

원226/gen47 quiesce는 successor를 사용할 수 없다. DB228 resume는 기존48 post와 현재228
pause/activation 원인이 있어야 한다. 키 발급/CAS47→48을 다시 실행하지 않는다. 실행 중인
정확48은 그대로 검증하고, 명시 pause 뒤 stopped 상태만 같은 기존 plist를 bootstrap한다.
새 plist 내용 생성이나47 backup으로의 복구는 하지 않는다. 프로세스 restart 없이 정상 유지되는
경로와 명시 복구를 위한 same48 start는 구분한다.

현재228 checkpoint는 별도 `after-successor.v1` schema, successor 결속, 원227 predecessor
record 및 원 immutable receipt/origin pointer를 포함한다. 원 validator는228을 거절한다.
현재 activation verification/receipt/reconciliation/repair pause도 별도 successor schema로
기록한다. 기존227 activation 완료를 확인하는 경우 원 영수증을 덮지 않고 현재228 readback의
새 immutable receipt만 추가한다. 이전227 관측은 역사 필드 그대로 남으며228로 재표시하지 않는다.
응답 유실의 unknown reconciliation은 동일 successor가 결속된 새 intent가 있어야 한다.

합성 검사는 원227 기록 보존, current228 same48 pause/resume, locked-session successor
변경 거절, 임의 ledger/critical catalog/foreign receipt 거절, 실제 CLI preflight/기록 함수의
결속을 다룬다. 원본CLI 실행·운영config/키/DB/worker/network/AI 호출 없이 내부 adapter와
합성 데이터만 사용한다. 실제227→228 격리 적용 후 same48 pause/resume/activation과
unknown 결과 재확인 검증은 별도 native 작업으로 남는다. 해당 검증과 source 최종 동결 전에는
이 문서를 배포 승인이나 성공 영수증으로 사용하지 않는다.


## V2: 결과 불명 intent의 경계 고정

독립 검토에서 원227 unknown intent가 fresh OFF228만으로 새 intent에 덮여 ON으로
진행되는 경로가 확인됐다. `activation-commit-intent`와 `activation-outcome-unknown`은
ON/OFF 분기 전에 원 verification의 observation이 고정한 ledger·successor·원DB2/T1·
reader/writer·credential·stable policy를 현재 checked context와 대조한다. enabled만
바꾸는 transaction이므로 이 원 observation의 DB identity가 expected-after identity다.
OFF는 원 intent의 whole policy 행까지 같아야 한다. 다른 경계면 원 journal/intent pointer를
보존하며 거절하고, 같은228 intent의 정확 OFF 재시도와 ON finalize는 유지한다.

`verifyCandidate`는 누락 파일을 만들 수 있으므로 pending intent일 때만 위 읽기 전용
검사 뒤로 지연한다. source/artifact/credential 검사를 생략하지 않으며, gate를 통과한 뒤
기존 검사를 수행한다. cross227→228 unknown 거절에서는 후보 준비·새 verification 발행·
transaction·ON·finalize를 모두 호출하지 않는 회귀를 확인한다.
