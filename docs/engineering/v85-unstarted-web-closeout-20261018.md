# 2026-10-18 웹 미전환 실패 기록 종결

이번 변경은 운영 도구·관련 검사·문서만 포함한다. 제품, DB, worker, 자격 범위를 바꾸지 않는다.

## 확인한 실패와 최소 수정

웹06a→15 배포 준비·빌드·격리 포트 확인은 통과했지만 교체 직전 회전 fence가 75,021바이트 state를 기본65,536바이트 reader로 읽어 거부했다. 시작 가드가 서비스 중지보다 먼저 실행되므로 기존06a(PID68884/HTTP68891)는 계속 실행됐다. 전환과 보상 경로가 모두 같은 reader에서 실패해 recovery.json이 남았다. 이는 배포 성공이나 실제 rollback 완료를 뜻하지 않는다.

해당 state 읽기 한 곳에 기존 private reader가 지원하는 명시512KiB(524,288바이트) 상한을 적용했다. 기본 상한, JSON 파싱, 파일 소유권·0600·일반 파일·단일 링크·O_NOFOLLOW·inode·크기 검사와 회전 fence/보호 필드 검사는 유지한다.

## 이번 사건에만 허용하는 종결

공식 deploy CLI의 인수 없는 `plan-v85-unstarted-closeout`와 `close-v85-unstarted`는 아래 근거가 모두 일치해야 한다. 경로·ref·핀을 CLI나 환경 인수로 바꾸는 기능은 없다.

- 현재 웹06a `prelaunch-06a3369f5c5e-EWuEsS`, 원래 PID/시작시각·부모/자식·사용자·cwd·단일3100 listener, 실제 manifest와 R2 disabled503.
- 실패 후보15 `prelaunch-15b1a36f9b4c-8dYuqq`, 정확한 state/recovery bytes, 실패 건의 previous/closed-rollback plist와 현재 plist가 동일. 옛06a state의 backup은 복원에 쓰지 않는다.
- 새8키 fence, 회전 journal committed, control/수집/리드 OFF, preflight arm 없음, 기존 전체 guard와 DB 메타데이터 불변.
- 고정된 깨끗한 d69 도구에서 실제 Keychain anchor3개를 읽어 원42·후속43·auth successor d397 승인을 모두 검증. 기존 full protected projection/원42와43 jobs, DB232·V2·idle worker49·기존 worker plist·gen50 미발급을 재검증한다. 현재06a의 실제 enqueue readiness loader와 비밀 파일 결속도 읽기 전용으로 확인한다.

공통 deploy/control 잠금을 보유한다. 검증 중 변화, 다른 PID, 후보15의 부분 전환, auth/일반 데이터/작업/스키마/승인/키/guard drift는 종결을 거부한다. 별도 도구는 기존 d397의 d69 source 결속을 대체하지 않는다.

일반0755 `LaunchAgents` 폴더는 권한을 바꾸지 않는다. 고정된 기존 웹/worker plist 두 파일만 별도 bounded reader로 읽으며 소유권·0600·단일 링크·O_NOFOLLOW·inode·512KiB 상한과 상위 폴더의 비쓰기/정규 경로 검사를 적용한다. 그 밖의 비공개 자료에는 기존0700 폴더 reader를 그대로 사용한다.

## 보존과 중단 처리

`~/.homecook/prelaunch-web/v85-unstarted-web-closeout-20261018/`에0600 intent와 실패 recovery 원문을 보존한다.0700 디렉터리·소유권·허용 파일명을 확인하고 파일/디렉터리를 fsync한다. private scratch를 완성한 뒤 macOS `renamex_np(RENAME_EXCL)`로 기존 파일을 덮어쓰지 않고 원자 게시한다. 중단된 scratch는 기대 bytes의 정확한 prefix일 때만 이어 쓰며 다른 내용은 거부한다.

기록 제거 직전 전체 근거를 다시 검증하고 원본 inode/bytes·lease를 확인한다. archive가 정확히 보존된 경우에만 active recovery를 제거한다. 이후 같은 전체 근거를 재검증하고 별도 complete receipt를 게시한다. 중단되면 pending으로 남으며 같은 사건·같은 실행 source·같은 증거에서만 재진입한다. 부분 intent, archive 또는 receipt를 완료로 보고하지 않는다. 이 도구의 일반 배포 경로는 종결 pending 중에 차단된다. 원 state, plist, DB guard, worker, 키, DB는 수정하지 않는다.

## 확인과 다음 전환 경계

관련 회귀 검사는512KiB 경계, 보호 필드, 고정 파일/프로세스 변경 거부, 실제 임시 파일의 원문·권한·덮어쓰기 거부, 게시 전후 중단·재진입, 제거 전후 drift와 기존 rollback/승인 가드를 검증한다. Python 검증은 `-B`, 하위 프로세스는 preload 옵션 없는 제한 환경과 제한시간을 사용한다. 원본 비밀 값이나 DB 행은 출력하지 않는다.

기록 종결은 서비스 복구/배포/세대50 활성화와 다르다. 현재 d397 승인은 d69 도구에 결속되어 있으므로 이번 수정 도구로 다음 웹 전환을 자동 재개하지 않는다. 다음 실제 전환은 수정 도구의 source 결속을 명시적으로 해결한 후 기존 공식 배포 경로를 사용해야 한다. credential 발급·등록은 별도 기존 확인 경계를 유지한다.

## 실제 실행 결과 — 2026-10-18 09:48 UTC 확인

깨끗한 고정 source `e860b66b20b6dd088d4ce77a7d79f3c1683b0907`에서 공식 plan을 통과한 뒤 종결을 실행했다. 제거 전후 전체 운영 검증과 최종 status가 모두 통과했다. 실패 recovery 원문은 위 디렉터리에 보존됐고 active recovery는 없다. intent/complete는0600, 디렉터리는0700이다. deploy/control 잠금은 모두 해제됐다.

| 확인 대상 | 결과 |
| --- | --- |
| 웹 |06a·빌드EWuEsS, launcher68884/HTTP68891와 원 시작시각 유지 |
| worker |v74·gen49·PID49750 유지, gen50 미발급 |
| DB |232개 이력·43jobs·원42·full 보호 projection 및 승인3개 일치 |
| R2 |새8키·fence·OFF·arm 닫힘 유지 |
| 기존 보호 자료 |원 state/plist/worker/승인/fence/journal8개 해시 모두 불변, 전체 DB guard 불변 |
| 쓰기 범위 |실패 기록 archive/intent/complete와 active recovery 제거만 실행; DB 쓰기0·서비스 재시작0·자격 변경0 |

보존 recovery SHA256=`bddb7e174b80ecc4512dcc845933e75d81222e475eb450bfe600ba38cb7fb44e`, intent=`389efc11162efb6c5503d30f2add4d847a6bbf609fabf6248cb3aaf19f08eab3`, complete=`07eba6c533b813e0a63311fbc9c6c7d03e0e8e3979b3749616567fb5488ac7c6`다. 이는 배포 완료 receipt가 아니다.

최신master 통합 작업트리의 관련7개 Vitest suite326검사, 별도 Node40검사, 타입 검사·린트와 독립 코드 리뷰를 통과했다. 제품/DB/의존성 변경은 없다. 다음06a→15 전환은 아직 실행하지 않았으며 위 source 결속 경계를 먼저 해결해야 한다. 최신master의 별도 제품·스키마 변경을 이번 실행 후보에 섞지 않았다.

## 10:31 UTC reader 시도


독립 source 결속 도구 bf38/e92의 준비 후 검증이 state 원본과 durableJson의 줄바꿈을 같은 지문으로 간주해 웹 교체 전에 중단됐다. 현재 서비스 PID/시작시각/state/new8/DB232/43/active49를 재검증하고 build `prelaunch-15b1a36f9b4c-0owBF1`, recovery SHA `1631d134cdfe455540605836d21435010b72d44480b1386d44f07c0f91c0d627`만 별도 `v85-reader-attempt-closeout-20261018`에 보존한다. 첫 closeout의 원본 3개 지문도 유지한다. 실행 웹 재시작, DB 변경, 자격 발급은 없다.

실제 종결 source는 `e057c61d1`이며 세 차례 전체 상태 검증 후 recovery 없음이 확인됐다. 기존 서비스 재시작·DB 쓰기·자격 변경은 없었다. 새 archive intent=`9f218d01276fed875d2958e6f4c3a3fb41e93850e2dd8f8af96f4136e24826f0`, complete=`61505f3177d3cbdd29e38d30d1488d2e7cf866e4d97a10892ee736cd0e62ccb7`다.
