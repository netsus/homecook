# v85 웹 도구 reader1줄 수정의 별도 실행 결속

사용자는 v85 전환에 필요한 작업을 승인했고, 이후 필요한 로컬 변경의 머지·운영 반영과 이번 reader 수정의 비자격 웹 전환 실행을 명시했다. 이는 새 웹 도구 실행의 직접 승인이다. 기존 d397 capsule이 새 도구를 승인한 것으로 해석하지 않는다.

## 고정 범위

- d397 capsule·원42/43/auth 승인3개와 Keychain을 수정하지 않는다. 실제 발급·등록은 원 d69 도구에 결속하며 새 checkout의 approve/apply/resume는 기존 검사에서 거부된다.
- 웹 대상은15, 기존은06a, DB232·idle worker49·43jobs/원42·V2·새8키/OFF/arm 닫힘이다. 요리 개선 master와 추가 migration은 포함하지 않는다.
- 공식 `deploy-prelaunch-web.mjs`는 정확한 reader1줄만 수정한다. 원파일 SHA=`8d6fa4d85ceb11fbfa47867d79766602d613ba1b6b9ce288b8cfb0821ab8b569`, 수정파일=`ea751d9e159f81f718fc5d3d35089b61b07bca92dffa93a656ec0c59145921df`다.512KiB 상한과 기존 보호 검사는 유지한다.
- bridge에는 웹 전용 결속/확인 분기만, runner에는 exported web boundary 분기만 추가한다. 이를 제거한 전체 bytes는 원 d69와 같아야 한다. 발급 함수·main·원 source 검사·자격 TTL/scope는 변경하지 않는다.

## 별도 검증 실행기

검토된 executor commit은 d69의 직접 후속이며 변경9개 파일 전체 SHA와 tree를 source pin에 기록한다. 별도 launcher commit은 executor의 직접 후속으로 source-pin JSON 한 파일만 추가할 수 있다. 두 checkout 모두 tracked/untracked 변경0이어야 한다. launcher의 코드도 executor에서 검토된 동일 bytes여야 한다. 일반 CLI/env의 skip/confirm-off 옵션은 없다.

고정 launcher의 `plan`/`deploy`만 지원한다. 실제 승인3개·source 전체·완료된 이전 실패 종결/보존 archive·원06a 프로세스를 검증하고, 원 d69의 비자격 preflight를 먼저 완료한다. 공식 CLI에는 익명 pipe로 현재 부모PID/시작시각·부모source·현재도구source·고정명령·60초 내 최초 사용 nonce를 전달한다. 부모의 실제 사용자·cwd·명령·source를 확인하고 이후 같은 살아있는 invocation만 재사용한다. 파일이나 임의 객체로 증명을 주입할 수 없다.

검증된 메모리 review만 이번 웹 실행에서 내부 V85-BRIDGE 문자열 입력을 대신한다. 원 capsule 승인은 그대로 표시하고 별도 직접 승인에 따른 비자격 실행임을 표시한다. 검증 뒤, build 뒤 실제 교체 직전에 원 d69의 실제 승인 loader/전체 DB preimage/원49/새8키/OFF를 다시 읽기 전용으로 확인한다. 바뀌면 전환하지 않는다. d69의 원 V85-GEN50/OS Keychain 승인 경계는 바꾸지 않는다.

## 실패·전환 뒤

기존 공식 deploy가 새8키의 현재06a plist를 이번 시도의 previous/closed-rollback으로 저장하고 기존 제한된 보상 경로를 사용한다. 옛 state.backup 복원이나 DB 복원은 하지 않는다. pending recovery가 있으면 새 시도를 하지 않는다.

전환 직후 실제15 source/build/manifest·웹 GET·실제plist 새8키/OFF·DB232/43jobs·worker49 보존과 원 승인/보호파일을 확인한다. gen50 발급 전에는 새 추출 readiness가 막히는 중간 상태를 예상하며 이를 성공적인 v85 활성화로 보고하지 않는다. 다음 필수 단계는 기존 d69 실행 경로의 제한된 gen50 발급·등록·worker 전환 및 실제 인증 health/empty-claim/기존 결과 연결 검증이다.49는 등록 뒤 무효화되고 만료는2026-10-22T14:27:30Z, manager는 기존 ES256·최대300초다. 새 모델 추출 호출은 별도로 필요한 대상/횟수를 확인한다.
