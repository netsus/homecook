# Round2 8종 교체: 사용자 직접 반영 준비

## 최신 결과 — 사용자 설치 완료, 수집 OFF

사용자가 2026-10-17 02:01:23 UTC에 `R2_APPLY_COMMITTED_OFF`를 보고했다. 이후 에이전트는 설치 재실행 없이 읽기 전용 최종 검증만 수행했다. 아래의 준비/실패 문단은 이전 경과다.

| 검증 대상 | 실제 결과 |
| --- | --- |
| operation/journal | committed, startup_eight_match=true, collector_disabled_verified=true |
| 설치/fence/state 결속 | 승인 candidate·동일 fence hash 일치, 기존 state의 나머지 필드 그대로 |
| 실제 소비자 | launcher PID68884·HTTP child PID68891, 둘 다 UTC 02:01:05 시작; UID/cwd/부모/listener 재대사 |
| 새8종 실제 로드 | 두 PID의 고정8종 startup fingerprint 승인값 일치, 구키 금지 집합과 겹침 없음; 원문/전체환경 출력0 |
| 웹 | 06a3369f5c5e1c3ca49045f370f0ce12f049c805/build prelaunch-06a3369f5c5e-EWuEsS, loaded=true, recoveryPending=false, build HTTP bytes 일치 |
| R2/lead | env/control 모두OFF, arm 없음, 실제 POST {}는503 ROUND2_DISABLED, reactivationReady=false |
| DB/worker | 공식 READ ONLY 관찰의 ledger232·원 DB권위/원42 jobs·V2 확인, worker gen49/3e58467499c63ba20c3b3191d9dd7dec77a7aa44 active·policyEnabled·idle, 동일PID49750 |
| 웹 접수 readiness | 정확06a loader와 현재 DB readiness, production loader의 enqueue secret 검사 통과; 실제 로그인 HTTP 신청은 실행하지 않음 |
| 구키 복귀 방지 | 실제 state marker/fence 결속과 새8종 승인/금지 집합 검증, 공통restart fence 회귀7 PASS, 공식 status rollbackAvailable=false |
| 쓰기/외부 호출 | 최종 검증의 DB/운영 쓰기0·추가 설치0·provider API0·새 신청/모델0·Chrome/clipboard관찰0 |

rate journal의 마지막 쓰기 가능 시점+3600초는 **2026-10-17 03:01:06 UTC**다. 이는 rate 최소 폐쇄 시각이며 수집 재개 승인이나 Cloudflare 구키 만료 시각이 아니다. 자동 재개하지 않는다.

Cloudflare 구키 만료/현재 유예 여부는 **미확인**이다. 실제 회전시각과 즉시무효화 선택의 근거가 없으므로 사용자 보고시각+2시간을 확정 만료시각으로 쓰지 않는다. 새 Turnstile 키도 로컬 format/fingerprint/로드만 확인했으며 provider Siteverify 유효성을 확인한 것은 아니다. 기존 secret을 외부API로 보내 시험하지 않았다. 별도 완료기록 메뉴는 확인되지 않았으며 사용자에게 해당 메뉴를 찾도록 요구한 안내는 철회했다. 정상 challenge 검증은 재개 전 별도 승인된 닫힌 preflight 절차로만 수행한다.

구키가 포함될 수 있는 기존 백업2개의 존재·owner0600만 확인했고 내용 검사/삭제는 하지 않았다:

- `~/.homecook/prelaunch-web/releases/06a3369f5c5e-EWuEsS/previous.plist`
- `~/.homecook/prelaunch-web/releases/06a3369f5c5e-EWuEsS/closed-rollback.plist`

정리 전에는 알려진 백업·이전 복구 산출물·기존 transcript 보존 사본의 범위를 고정하고, 동일 새키 보존 복구 경로와 증거 보관 필요를 검토한 뒤 사용자 승인으로 처리한다. 이번 작업은 위2파일 외 전체 사본 부재를 증명하지 않는다. active fence/rotation marker/operation journal/stage candidate는 임의 삭제하지 않는다. 과거 도구·수동 복사는 전역 차단되지 않으므로 검토된 현재 공식CLI만 사용한다. 과거 Library v5 미검증 한계도 남는다. 영구삭제·권한변경·보안정책변경은 수행하지 않았다.

이번 결과는 **로컬8종 설치·두 소비자 로드·OFF 유지 완료**이며, R2 lead 재개·provider 구키 폐기 확정·v85/gen50 재개·베타 전체 검증 완료는 아니다.

### 03:51 UTC 후속 읽기 점검

같은 PID68884/68891의 승인8종 실제 로드·후보 설치·committed journal·활성 fence 결속이 유지되고 고정 build HTTP/503 OFF가 다시 통과했다. env/control OFF·arm 없음·worker PID49750도 유지된다. 설치 재실행·삭제·이동·권한변경·provider 호출·v85 실행은0이다.

현재 시각03:51 UTC는 새키 표시 사용자 보고01:11:22 UTC로부터 약2시간40분 뒤다. 공식 문서는 회전 동안 구·신키2시간 병행을 설명하므로 **정상 회전이 완료됐다면 유예가 지났을 것으로 예상**한다. 실제 provider 구키 만료나 새키 Siteverify 성공을 기록한 것은 아니다. 이 예상은 별도 완료기록 메뉴를 찾는 사용자 과제를 만들지 않는다.

기존 두 plist의 용도는 배포 시 원본 predecessor 백업과 closed-R2 복구 후보다. `deploy-prelaunch-web.mjs`의 `rollback()`은 state.backup/closed-rollback을 읽고, `previousClosedR2State()`와 고정 web recovery도 과거bytes/hash를 증거로 참조한다. 현재 `start-production.mjs`/runtime과8종 user-apply는 이 두 파일을 시작자료로 쓰지 않는다. 따라서 단순 삭제가 현재 웹을 바로 중단시킬 것으로 보이지는 않지만, 배포/복구 검증과 과거 증거 결속을 깨뜨릴 수 있어 **안전 삭제 가능으로 판정하지 않는다**. 구키 포함 여부는 내용을 열어 검사하지 않았다.

새키 자료는 별도 `round2-eight-key-rotation-stage-20261017/candidate.plist`와 fence/receipt, `round2-eight-key-rotation-apply-20261017/journal.json`·state-before/state-after, 활성 plist/fence/state다. stage3/apply3/활성fence·state2/기존백업2의 고정10파일 metadata에서 모두 소유자 일치·일반파일·0600·single-link·비symlink·부모0700을 확인했다. 실제 LaunchAgents plist는 기존 별도 private-file 검사와 후보bytes 일치 검사 대상이며 부모0700 목록에 포함하지 않는다. 새 후보가 있다고 해서 모든 과거 복구 계약을 자동 대체하는 것은 아니다. 새키 보존 복구와 증거 계약을 먼저 정리하고 나서 별도 승인으로 과거 사본을 정리해야 한다. 키 교체 자체를 닫힌 상태로 마무리하기 위한 사용자 추가 필수 입력·회전·재시도는 없다. 백업 정리와 R2 재개 전 provider 검증은 별도 후속이다.

2026-10-17. 사용자 승인 범위는 Round2 HMAC7종과 Turnstile 서버키1종이다. credential 생성·입력·설치·제출은 사용자 직접 실행 경계이며 에이전트는 실제 apply를 실행하지 않는다. 제품 코드·DB·worker·동의·기존 참여/영수증은 변경하지 않는다. [공식 R2 계약 §9](../marketing-demand-validation-r2-contract.md)를 따른다.

## 현재 사실과 한계

### 사용자 반영 중단 후 읽기 진단

사용자가 `R2_APPLY_STOPPED_REVIEW_REQUIRED`를 보고한 뒤 재실행 없이 확인했다. 설치 plist는 stage receipt의 원본 source와 일치하고 후보가 아니다. operation 디렉터리/journal/활성 fence가 없으며 deploy/control 잠금도 없다. 기존 launcher PID12220/HTTP 자식 PID12235가 유지되고 고정 build HTTP와 `503 ROUND2_DISABLED`가 통과했다. env/control OFF와 arm 닫힘도 유지된다. 후보 미설치이므로 실행 프로세스의 credential 환경을 읽지 않았다. 새8종 로드·로컬 폐기 완료가 아니다.

현재 `load_bundle()` 및 두 잠금 부모의 private-dir 검사는 통과했다. 당시 실패의 정확한 원인은 이전 CLI가 상세 코드를 버려서 확정할 수 없다. 범위는 journal 생성 이전의 사용자TTY/확인입력/잠금/잠금 내 사전조건/기존 census 등이다. 현재 건강하다는 사실로 과거의 일시적 실패를 배제하지 않는다.

실제 설치·복구·재시작은 하지 않았다. 최소 코드 보완으로 고정 phase와 허용된 오류코드만 출력하며 임의 parser/OS/예외 텍스트는 출력하지 않는다. 사용자 본인 Terminal에서 아래 읽기 전용 명령으로 세 TTY 상태만 확인한다. 운영 파일·credential·프로세스 env를 읽지 않고 잠금·파일 생성도 없다. 사용자 결과 대사 전 apply 재실행·구 설정 복원을 하지 않는다.

```sh
/usr/bin/python3 /tmp/homecook-v85-web-recovery-20261017/scripts/round2-eight-key-user-apply.py --check-terminal
```

오류 비표시와 읽기0IO 검사를 추가하여 Python apply fixture는13 PASS다. 기존11의 설치/실패 로직은 유지한다.

사용자는 같은 Terminal에서 `--check-terminal`의 stdin/stdout/stderr TTY가 모두true, operationalWrites=0이라고 보고했다. 직접 Python의 확인이며 과거 pnpm 자식의 상태를 소급 증명하지 않는다. 별도 own PTY·운영 I/O0 모형에서 실제 packageManager와 같은 pnpm10.32.1 → Node `spawnSync(stdio:inherit)` → Python의 세 TTY true 및 문자 `APPLY` 전달을 확인했다. wrapper 실패는 재현되지 않았고 당시 원인 확정은 보류한다. 최신 공식 읽기 plan은 다시 READY/consumer2/OFF/worker49750/operationalWrites0이며 apply fixture13도 재통과했다.

추가 사용자 확인 명령을 반복하지 않고 보완된 기존 공식 `deploy:dev:apply-round2-eight-keys`를 사용자 본인이 한 번 실행하는 것이 다음 최소 단계다. 비밀 재입력 없이 같은 stage를 사용한다. 중단 시 `R2_APPLY_FAILURE phase=... reason=...`의 고정 줄만 전달받고 대사한다. 에이전트는 이 재시도를 대신 실행하지 않는다.

### old_consumer_census / PROCESS_OWNER 후속

사용자 재시도는 `phase=old_consumer_census reason=R2_APPLY_PROCESS_OWNER`로 중단됐다. 다시 읽기 진단하여 원본 plist·operation/journal/fence 부재·기존 두 PID·정상 build HTTP/OFF·잠금 해제·control/arm 보존을 확인했다. 후보는 설치되지 않았고 실행 중 credential 환경은 읽지 않았다. 실제 두 PID의 숫자UID는501이며 실행 계정UID501과 같았다.

정확히 두 PID의 PID/PPID/숫자UID/lstart metadata만 C·en_US.UTF-8·ko_KR.UTF-8로 읽었다. 영문은 date5토큰/전체8, 한국어는 `년/월/일/요일/시/분/초`의 date7토큰/전체10이었다. 기존 소유자 검사가 전체8토큰을 전제하여 한국어 날짜를 PROCESS_OWNER로 잘못 분류하는 코드를 재현했다. 당시 사용자 프로세스 locale을 읽지는 않았으므로 과거 실행의 locale 자체를 확인했다고 주장하지 않는다.

최소 수정은 `process_identity()`의 읽기 전용 ps 자식에만 LC_ALL=C/LANG=C/TZ=UTC를 고정하는 것이다. PID·숫자UID·부모·시작시각·정확cwd 검사를 완화하지 않는다. caller/root/서비스 소유권이나 보안 설정을 바꾸지 않으며 sudo/종료/설치를 수행하지 않는다. 회귀는 수정 전 동일 PROCESS_OWNER로 ERROR → 수정 후14 PASS이며 잘못된UID/PID/cwd 거부도 포함한다. 한국어 locale·서울 시간대·own PTY의 실제 `pnpm deploy:dev:plan-round2-eight-keys`도 READY/consumer2/OFF/worker49750/operationalWrites0으로 통과했다. 이는 새키 실제 로드가 아니다.

- 사용자는 01:11:22 UTC에 Cloudflare 직접 회전 후 “새키 표시됨”이라고 보고했다. provider 회전의 사용자 보고이며 정확한 회전 시각·구키 폐기 시각·로컬 설치 증거가 아니다. 보고 시각+2시간으로 만료를 계산하지 않는다.
- 사용자는 01:16:26 UTC에 `R2_STAGE_STAGED_NOT_APPLIED`를 보고했다. 사용자 전용 TTY 입력으로 서버키를 비표시 두 번 입력하고 독립 CSPRNG32bytes HMAC7종을 생성하여 private stage에 저장했다. stage는 설치가 아니다.
- 새키가 화면에 표시된 뒤 Chrome DOM·자동 탭 연결·스크린샷·클립보드 관찰을 중단했다. 사용자가 키 화면을 닫았다고 확인하기 전 재개하지 않는다.
- 최신 읽기 전용 공식 plan은 `R2_APPLY_READY_FOR_USER`, stagedEightVerified=true, unrelatedSettingsPreserved=true, collection/lead=false/false, consumerCount=2, operationalWrites=0이다. runtimeKeyProof는 `not_checked_by_preflight`다.
- 대상은 웹 `06a3369f5c5e1c3ca49045f370f0ce12f049c805`, build `prelaunch-06a3369f5c5e-EWuEsS`, 기존 launcher PID12220/HTTP 자식 PID12235다. worker PID49750/v74/gen49 및 DB232를 보존한다. 실제 apply·키 설치·재시작·DB쓰기·push/PR·Library 업로드는 아직 하지 않았다. 현재 로컬 운영 키 교체 완료를 주장하지 않는다.

## 사용자 직접 실행

사용자 본인의 로컬 Terminal에서만 실행한다. 채팅·브라우저·agent exec/PTY로 실행하거나 키를 붙여 넣지 않는다.

```sh
cd /tmp/homecook-v85-web-recovery-20261017
corepack pnpm deploy:dev:apply-round2-eight-keys
```

비밀키를 새로 입력하는 명령이 아니다. 이미 보관된 동일8종 후보를 내부에서 읽고, 사용자가 확인창에 `APPLY`를 직접 입력해야 설치한다. 정상 완료 표시는 `R2_APPLY_COMMITTED_OFF`다. 실패 표시는 `R2_APPLY_STOPPED_REVIEW_REQUIRED`다. 파일·키·전체 로그를 공유하지 말고 고정 완료/중단 코드만 전달한다. 실패하면 무작정 재실행하거나 구 plist로 복원하지 않고 현재 결과부터 대사한다.

웹06a를 잠시 중단·재시작하므로 그동안 일반 웹 요청도 실패할 수 있다. 시작·검증 실패 시 새 설정과 fence를 보존하며 웹이 중단된 채 남을 수 있다. 노출 구키 자동 복귀는 하지 않는다. worker·DB·추출 generation 전환은 실행하지 않는다. R2/lead는 계속 OFF이며 성공해도 재개 준비 완료가 아니다.

## 고정된 적용 경계

`scripts/round2-eight-key-user-apply.py`는 macOS와 stdin/stdout/stderr 전부 사용자 TTY를 요구한다. `--check`만 읽기 전용이고 공식 CLI의 `plan-round2-eight-keys`로 연결한다. `apply-round2-eight-keys`는 같은 CLI에서 사용자 Python으로 연결하며 인수를 허용하지 않는다.

1. owner-only stage candidate/fence/receipt의 bytes/hash와 정확8종 이름·승인 fingerprint·구키8종 전체 금지 집합을 대사한다. 기존 plist에서 변경 가능한 것은8종뿐이며 다른 env·실행 인수·플래그는 같아야 한다. control은 원본 bytes/hash와 OFF가 같고 preflight arm은 없어야 한다.
2. 웹 ref/build/checkout tracked source 불변, 현재 launchd 프로세스 소유자·부모·cwd·listener, worker PID를 확인한다. deploy/control 잠금을 함께 획득하고 전제들을 다시 읽는다. 기존·stale 잠금은 빼앗지 않는다.
3. private operation journal과 state-before/state-after를 생성하고 활성 fence를 설치한다. 원본 plist와 원본 state 및 동일 `prepared` journal이 유지된 경우에만 실패했던 동일 fence 설치를 이어갈 수 있다. 임의 새 후보·다른 fence·부분 journal을 묵시적으로 수리하지 않는다.
4. 정확한 자기 launchd 트리를 bootout하고 모든 관찰 PID 소멸·포트3100 반환을 기다린다. 부분 시작의 parent-only 트리는 소유자/부모/cwd를 확인해 정리하며 외부 listener는 거부한다. 마지막 counter 쓰기 가능 시점은 drain 완료 시점보다 보수적으로 기록한다.
5. candidate를 0600 임시파일/fsync/원자적 교체로 설치한다. 기존 노출키 plist를 rollback 대상으로 복사하지 않는다. 같은 서비스만 bootstrap한다.
6. 고정 build manifest의 로컬 HTTP bytes를 비교하고 POST `{}`에 `503 ROUND2_DISABLED`를 확인한다. 이 OFF 경로는 RPC/rate/lead 저장 전에 종료한다. 실제 두 소비자의 새 PID/시작시각/부모/cwd/listener를 재대사한다.
7. 사용자 프로세스 안에서 macOS `KERN_PROCARGS2`를 정확히 소유한 두 PID에 한정해 읽고 고정8종의 SHA256만 내부 비교한다. 다른 env를 decode/출력/저장하지 않으며 원시 버퍼·키값은 반환하지 않는다. 읽기 전후 PID identity도 같아야 한다. plist hash만으로 실제 로드를 증명하지 않는다.
8. 실제 로드와 OFF 확인 후 state의 기존 필드를 보존하며 후보/fence/stage receipt hash를 결속한다. journal은 두 새 소비자 identity·startup_eight_match·OFF 확인·rate 최저시각·reactivation_ready=false만 기록한다.

외부 명령은 최대5초 또는 남은 예산의 짧은 쪽으로 제한한다. 중첩 drain30초/load40초와 전체 작업120초 예산을 적용한다. 동기 파일 I/O/OS 정지까지 강제로 중단하는 절대 wall-clock SLA는 아니다. 실패 시 unresolved/새 설정 보존으로 중단한다. 같은 승인 후보로만 전진 복구하며 새키 재생성·노출키 복귀·DB 복원을 하지 않는다. `prepared` 이전의 불완전 파일 생성은 자동 복구하지 않고 대사한다.

## 공식 재시작 경계

`round2-eight-key-rotation-fence.mjs`는 fixed8 승인 fingerprint와 구키 전체 금지 집합, OFF를 검사한다. `deploy-prelaunch-web.mjs`의 공통 `switchWeb()`가 bootout/write/bootstrap 직전에 다시 검사한다. 최초 관찰 fence는 clone 고정하므로 실행 도중 내용 변경·삭제를 거부한다. state rotation marker가 생기면 후속 invocation에서도 fence 필수 존재와 marker hash 일치를 요구한다. 미완료 apply journal이 있으면 일반 restart를 거부한다.

이 연결은 현재 작업 소스에 준비돼 있다. 아직 활성 fence를 설치하지 않았으므로 현재 운영 구키 복귀를 이미 막고 있는 것은 아니다. 과거 도구 직접 실행이나 수동 파일 교체까지 전역적으로 차단하지 않으므로 이번 검토된 명령과 동일 fence를 보존해야 한다.

## 검사 근거

- Python staging fixture9 PASS: 비TTY·echo fallback·취소/EOF·불일치·source/control 변경을 포함한다. 실제 운영 I/O/RNG는 mock이다.
- Python apply fixture13 PASS: 정확8종 변경, 환경 parser, 두 소비자 실제 verifier 경계, private atomic write/lock, 성공·bootstrap/timeout/load 실패, fence 실패 후 동일 후보 재진입, 부분 프로세스·외부 listener 거부, 중첩 deadline, 고정 오류 비표시와 읽기0IO 터미널 검사를 포함한다.
- Node fixture/fence15 PASS: 누락·중복·교차 구키 재사용·다른 승인값·ON·stale/누락 소비자·fence 교체/삭제·실제 restart helper 경계를 검사한다.
- 기존 배포/복구 Vitest162 PASS. 새 CLI 목록 때문에 기존 소스 단언1개가 처음 실패했고 목록을 갱신한 뒤162 PASS했다. 제품 로직 실패로 숨기지 않는다.
- 대상 eslint exit0. 독립 코드 리뷰에서 fence 실패 재진입·부분 시작 복구·명령 timeout 3건을 수정하고 재검토에서 추가 필수 blocker 없음. 실제 stage나 운영 적용을 reviewer가 실행한 것은 아니다.
- 실제 새 credential을 읽지 않는 own fixture 프로세스에서만 native startup8 proof 작동을 확인했다. 실제 새키 로드 증거는 사용자 apply 성공 이후에만 생성된다.
- 제품 TS/JS·의존성 변경이 없어 전체 typecheck/build/Anti Slop은 실행하지 않았다. 위 검사들은 실제 운영 교체 성공이나 모든 버그 부재를 증명하지 않는다.

```sh
PYTHONDONTWRITEBYTECODE=1 /usr/bin/python3 tests/round2-eight-key-user-stage.test.py
PYTHONDONTWRITEBYTECODE=1 /usr/bin/python3 tests/round2-eight-key-user-apply.test.py
node --test tests/round2-rotation-fixture-guards.test.mjs tests/round2-eight-key-rotation-fence.test.mjs
corepack pnpm exec vitest run tests/prelaunch-web-deploy.test.ts tests/prelaunch-v85-web-recovery.test.ts
corepack pnpm deploy:dev:plan-round2-eight-keys
```

## 재개 전 별도 조건

단일키 구조여서 과거 page/cookie/bootstrap/event/receipt가 새키에서 유효하지 않다. bad-MAC cookie 삭제·참여 재시작 UX, outbox/영수증 충돌, 이메일 dedup·집계 epoch 단절을 처리해야 한다. 원문 email이 없는 과거행을 전부 재hash할 수 있다고 가정하지 않는다. 기존 참여·이벤트·영수증·동의를 보존하며 자동 새 UUID·과거 digest 덮어쓰기·DB 복원을 금지한다.

rate 폐쇄는 전체 소비자 drain 후 마지막 쓰기 가능 시점부터 최대1시간을 확보한다. 그 시각이 지나도 자동 재개하지 않는다. 예전 proof를 새 fingerprint로 복사하지 않으며, 전체 lead readiness·provider 구키 폐기·타 배포 재사용 부재는 현재 검사로 증명하지 않는다. 필요한 정상 challenge는 별도 승인된15분 arm 안에서 두 topic 각1회(총2회), lead DB 저장0으로 제한하고 arm을 닫는 별도 절차다.

이전 incident scan은 선택된44대상에서 known8 표현과 일반 secret pattern0match였다. 과거 Library v5는 materialize file_id 불일치404로 독립검사하지 못했다. 최신본0match를 과거본 미노출로 일반화하지 않는다. 새 Library 업로드·공유·PR/push는 현재 보류 상태다.

## Cloudflare 확인 기록

사용자 로그인 후 사용자 Chrome tab692564119의 `Mumeok Round2 Beta Signup`, hostname `app.mumeok.kr`, 운영 public sitekey 전체 일치를 확인했다(문서에는 끝6자리 ZpMoYn만 기록). 다른 `Mumeok Beta Signup`과 구분했으며 에이전트는 Row actions → Edit Widget까지만 열고 Show/Copy/Rotate/Update를 누르지 않았다.

화면은 회전2시간 간격과 이전키 병행 유효를 안내했고 즉시 폐기 선택지는 보이지 않았다. [Cloudflare 회전 문서](https://developers.cloudflare.com/turnstile/troubleshooting/rotate-secret-key/)의 기본2시간 병행과 [공식 API](https://developers.cloudflare.com/api/resources/turnstile/subresources/widgets/methods/rotate_secret/)의 `invalidate_immediately`는 구분한다. 새 API token·권한·widget은 만들지 않았다. 사용자 회전 보고 이후 추가 provider 호출이나 키 화면 관찰은 하지 않았다.
