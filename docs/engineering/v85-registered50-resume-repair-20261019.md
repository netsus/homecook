# v85 등록50 이후 단계별 검사와 동일50 복구

## 실제 복구 완료와 후속 검증

2026-10-19T07:45:54.134Z 실제 사용자 Terminal의 확인 입력 뒤 기존 등록50 resume가 성공했다. executor A `0d64dc2bdccd5bc6b7d813e240346cfd6aa22b6b`와 binding B `3b3485a2c5b025a24a954f25d201288009dfdc17`는 별도 독립검토와 실제 공식 reconcile로 결속을 확인했다. A/B와 원8455/d69 checkout은 보존한다. 이후 실행 기록은 통합 브랜치 문서에만 추가한다.

activation SHA256은 `3837afcebb57f880c29fe7b937c917fa876a4be317a3dbf1e5702cc35617a14d`이며 독립 seal을 포함한 공식 읽기 전용 reconcile은 `activated/mayIssue=false/mayRegister=false/historicalJobsPreserved=true/postActivationJobs=0`이다. worker PID98098, release1be5, DB232, 원4승인과 고정 만료2026-10-22T14:27:30Z를 유지한다.

07:50:07 UTC 별도 읽기 전용 후속검증에서 실제 token 인증200, 빈claim은 정확한 session 거부500/ACCOUNT_SESSION_STALE, worker health ok/ready 및 동일PID, 실제웹15 loader/시작환경 enqueue readiness ready(V2·이전키없음), 역사 V2 지문33/33일치,43jobs/queued0/processing0을 확인했다. 전체43지문 `ee4735ef8af42dd2e97931ad89ed0de9dd05ba90c228d1ceab72565c89ae9f63`은 이전과 같다. R2 collector는503/ROUND2_DISABLED, 로컬·공개로그인은200이다. 새 발급·재등록·모델호출·신규추출은0이다. 사용자 로그인 HTTP로 실제 새 추출을 신청하는 전체 UI 흐름은 이번 검증 범위가 아니다.

비밀 없는 후속 근거는 `/private/tmp/homecook-v85-registered-resume-terminal-20261019/postverify-result.json`이다. 원격push/PR/merge는 별도 자동승인 검토에서 게시 대상·범위 승인 불명확으로 거부돼 미실행이며 재시도하지 않는다. 아래 준비 단계의 미실행 설명은 고정 executor A 작성 시점의 역사 기록이다.

사용자가 실제 Terminal의 두 확인을 마친 뒤 gen50 서명과49→50 등록은 완료됐다. 06:57:57 UTC 실패 기록과 공식 읽기 전용 reconcile은 `registered/mayIssue=false/mayRegister=false`다. 현재 policy OFF·worker 미실행이며 웹15의 로그인은200이다. DB232·43개 작업 전체 지문·고정 만료2026-10-22T14:27:30Z는 유지됐다. manager 파일은 정리됐다. 활성화 완료로 보고하지 않는다.

## 원인

PR1799에서 추가한 웹 시작8키 확인이 `round2-eight-key-user-apply.py`의 `census()`를 재사용했다. 이 함수는 웹 프로세스를 조사하기 전에 원 worker49 PID49750을 확인한다. 정상 quiesce에서49를 중단한 뒤 DB 등록50 commit 후 registration 영수증을 게시하기 위한 webReady가 이 조건으로 실패했다. 같은 조건을 읽기 전용 재현해 `R2_APPLY_WORKER_CHANGED`를 확인했다. 원 실패 기록의 errorKind는Error이며 자세한 예외 문구는 저장되지 않았다.

## 단계별 보호

기존 rotation `census()`의49 PID 보호는 유지한다. 새 `web_census()`는 웹 launcher/HTTP의 UID·cwd·부모자식·추가소비자 부재·3100리스너를 동일하게 확인한다. 실제웹15의 PID39019/39025·시작시각·state/plist 지문과 전후 시작8키·R2 OFF도 유지한다.

worker는 별도 단계로 확인한다. 등록 전 running49는 원 config/plist/PID/credential/policy와 일치해야 한다. quiesce 후49는 OFF·미등록서비스여야 한다. 등록 후50은 서명된 기존 token/metadata/issued 영수증과 DB50·pipeline/artifact/schema·고정만료·원42/43·데이터/권한/control 보호가 일치해야 한다. 미설치 단계는 이전 또는 정확한 새 launcher만 허용하고, 설치된 단계는 정확한 새50 launcher와 실행 PID를 요구한다. 정상 소유 launcher의 부분 설치는 같은50 설치로만 보완한다. verified/ON은 실제 인증·empty-claim 거부·health와 동일PID·durable 검증을 유지한다.

## 같은50만 허용하는 복구

`resumeRegisteredV85Cutover`는 읽기 전용 reconcile→정확한 registered50 확인→install→verify→OFF이면activate→finish만 수행한다. 일반 resume의 unissued/not-applied 발급/CAS 분기를 재사용하지 않는다. 이 source의 quiesce/issueWorker/issueManager/register는 직접 호출해도 거부한다. 원 token·metadata·issued 영수증이 없거나 서명·해시가 다르면 중단하며 자동 재구성하지 않는다. commit 뒤 저장되지 못한 registration 영수증만 현재 등록50과 원 intent·전 보호 지문을 대조한 뒤 별도 옵션으로 복구한다. 실패는 동일50을 보존하고 필요 시 그 소유 정책만 OFF로 닫는다.51·49복귀·발급·재등록·만료연장은 금지다.

## 기존 승인과 별도 소스 결속

원 d69와8455 실행 checkout, 원 plan/continuation/d397/32f795 캡슐 및 네 독립 anchor는 바꾸지 않는다. 고정 executor A는8455의 단일 부모 자손이며 유한9개 운영·회귀·문서 파일의 전체 전후SHA와 commit/tree를 결속한다. binding B는A의 단일 부모 자손이고 diff가 source manifest1개뿐이어야 한다. manifest도 실제 committed regular file이어야 한다. 이 결속은 지정 executor의 `resume/reconcile`에만 적용하고 다른 action은 거부한다. 웹·평가 worker source나 실제 캡슐의toolRef를 교체하지 않는다.

별도 불필요한 데이터/자격 재승인을 만들지 않는다. 실제 기존 macOS Terminal의 resume 확인은 유지하고, 입력 전에 실제 A/B source와 원 capsule SHA, 등록50 전용·발급/CAS금지를 표시한다. Keychain 확인이 필요한 경우 사용자만 처리한다. 자동 확인 입력이나 OS 승인 대행은 없다.

## 회귀와 운영 한계

실제 run/resume orchestration과 실제 adapter closure를 메모리 DB/파일/서비스에 연결해 등록 commit 후 receipt 부재, 정상 설치·검증·ON, bootstrap 실패 뒤 재개, ON 실패 뒤 재개, credential/issued 부재, 모든 발급 함수 거부를 검사한다. 단계별 foreign launcher·51·정책·추가 drift와 A/B 부모/tree/파일 범위 거부를 검사한다. Python은 실제 web_census가 worker49 중단 후에도 웹 보호를 통과하고, 기존census는 거부하며 cwd/owner/listener/추가 자식을 거부하는지 검사한다.

아직 실제 동일50 resume는 실행 전이다. 다음은 정확한 source pin 검증·독립 리뷰 뒤 실제 사용자 Terminal resume 확인이며, 완료 후 공식 reconcile·인증/readiness/health와 기존 결과 연결을 모델 호출 없이 확인한다. 요리 배포·데이터 복원·보호 필드 제외는 범위에 없다.

2026-10-19 수정본에서 관련 Vitest 7개 파일 227개 검사, Python web-only 2개 및 기존 apply 14개 검사, 전체 TypeScript 검사, 변경 JS/TS lint, diff 공백 검사를 통과했다. 독립 보안 리뷰는 활성화 완료 확인의 실패가 정책/파일/manager를 변경하지 않는 경로와 명시적 untracked 검사 보강을 재검토했고 추가 차단 이슈를 찾지 않았다. A/B 실제 commit 결속과 운영 복구는 이 로컬 결과와 별도로 확인한다.
