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
