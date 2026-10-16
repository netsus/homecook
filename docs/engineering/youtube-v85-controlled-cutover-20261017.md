# v85 전환 도구 — 신규 자격 발급 실행 확인 전

PR1753의 제품/추출기 release `1be5eeea5dd946d8a54edf6c5fd0c3c28d1815fa`와 기존 봉인을 유지하면서, 운영 웹06a·v74/gen49·V2·DB232에서 generation50으로 전환하는 전용 도구를 준비한다. 이번 변경은 **운영 도구·검사·문서**다. 제품 소스, 추출 번들, DB migration, grant/역할/키는 변경하지 않는다. 기존48→49 도구와 C04/v74/V2 영수증은 수정하지 않는다.

## 고정 대상과 승인 경계

- worker release: `1be5eeea5dd946d8a54edf6c5fd0c3c28d1815fa`.
- artifact SHA256: `1a477eea93cccde17e1afc7a2a371195e8dc4ab1c5bf82eed9306766eee13d3e`, 38파일. 새 도구가 있는 소스에서도 같은 artifact를 재생성·검증했다. 새 reseal은 필요하지 않다.
- descriptor SHA256: `df9f89d3fa1f415d7266cb86a3fec09502e03b466f29b5d2d695209324579457`.
- pipeline: `6dd494410f160937b550bc23fb355d6669b3abe7805c00eabd40fed1e799c618`.
- snapshot: `9307203ad29f0048655a62e6d2f430ef977dad75405ce606fbf68319a7a36d51`.
- worker generation49→50, role `youtube_extraction_worker`, scope `youtube-extraction-worker`, issuer `https://worker.mumeok.kr`, audience `youtube-extraction`.
- 기존 local ES256 signing key 사용. 새 signing key·권한 확대·Cloud 연결 없음.
- 새 worker의 만료는 기존49와 같은 **2026-10-22T14:27:30Z**이며 연장하지 않는다. 발급 시점부터 해당 시각까지 남은 시간만 사용하고 7일 이하를 검사한다.
- manager는 같은 issuer/audience의 role `youtube_extraction_credential_manager`, scope `youtube-extraction-credential-manager`, 최대300초다. 소유 hash 영수증과 맞는 임시 파일만 재사용/정리한다.

실제 발급·정책전환·worker 재시작·smoke는 **실행 시점 확인 대기**다. 일반 머지/배포 승인으로 이 확인을 대체하지 않는다. `prepare`와 fixture만으로 새 자격, 새 승인 anchor, 운영 정책/서비스를 변경하지 않는다. 새 토큰·키를 명령 인수나 로그에 넣지 않는다.

## 구현된 보호

1. `scripts/manifests/youtube-v85-reviewed-source.json`에 운영06a→평가된1be5의 전체37파일 before/after hash를 고정한다. 제품과 artifact 파일은 같은 bytes여야 한다. 추가 도구·검사·관련 문서만 명시적으로 허용하고, 최종 웹/도구 SHA와 전체 diff는 별도 plan hash에 결속한다. DB/인증/R2 등 인접 소스 예외를 만들지 않는다.
2. 기존 v74 activation 고정 hash와 C04 원 권위, V2 fingerprint 복구의 독립 anchor·전체 policy 영수증을 먼저 검증한다. 그 결과인 원49를 새50의 predecessor로 검증한다. 새 activation도 독립 create-only Keychain hash에 봉인한다. 기존 anchor/영수증은 덮어쓰지 않는다.
3. 웹 handoff는 기존 launcher의 작업 폴더 retarget 외 **app descriptor / expected schema / worker manifest 3경로**만 바꿀 수 있다. R2/C05·비밀·포트·실행 인수·권한은 보존한다. 일반 배포의 no-env 규칙은 유지한다.
4. 전환·재개는 공식 웹 배포와 같은 단일 소유 deploy lock을 사용한다. SQL은 READ COMMITTED에서 advisory86120317을 얻은 뒤 **다음 statement**로 table lock을 얻고 fresh snapshot을 읽는다. SERIALIZABLE의 첫 snapshot을 기다리는 동작을 복제하지 않았다.
5. 실제49 credential 전체 행과 OFF policy 전체 행, 빈 queue/permit/enqueue, 기존42작업 전체 hash 및 일반 자료·writer controls·DB232·catalog·원 권위를 잠금 안에서 다시 확인한다. 새 pipeline 변경과 실제 rotation RPC49→50을 같은 transaction에 넣고 정확한50/JTI/만료/스키마/snapshot 후상을 확인한다.
6. 발급 intent·발급 토큰/metadata hash·등록 intent를 먼저 내구 기록한다. 파일은 fsync한 임시 파일을 create-only hard link로 원자 게시해 찢어진 최종 영수증과 기존 파일 덮어쓰기를 막는다. commit 응답이 불확실하면 실제 exact row를 읽는다. `not-applied`일 때만 이미 발급한 같은50으로 다시 등록하며, `registered`는 재등록하지 않는다. foreign/newer/mixed/다른 JTI·지문·자료 변경은 unknown으로 멈춘다.
7. 등록 후에는 원49로 돌아가지 않는다. OFF에서 같은50·같은 artifact로 install→인증200/empty claim 거절→health/실제 launcher·동일 PID→내구 verification→ON 순서로 복구한다. activation commit 뒤 연결 유실도 먼저 대조한다. 이미 완료된 실행의 재개는 읽기 검증이다.
8. 준비 파일은 동일 bytes인 경우만 재사용한다. 발급 전 OFF/stop 단계 중단은 원49·백업·원 launcher를 대조한 후 첫50 발급으로 이어갈 수 있다. 이미 만들어진 토큰이 있으면 기존 public key의 ES256 서명과 고정 claims를 대조해 누락된 metadata/발급 영수증만 복구한다. 새 토큰을 만들지 않는다. intent는 있으나 토큰 자체가 없거나 서명/claims가 맞지 않으면 자동 재발급하지 않으며 수동 대조를 요구한다. 소유 근거가 없는 manager 파일도 자동 삭제하지 않는다.

## 실행 순서 — 아직 미실행

1. 검증된 최종 도구/웹 SHA의 깨끗한 checkout에서 다음을 실행한다. 이 단계는 기존 full-local DB를 REPEATABLE READ READ ONLY snapshot으로 읽고 `/tmp`에 검토용 plan을 만든다. 새 credential·운영 DB write·서비스 변경은 없다.

   `node scripts/youtube-v85-controlled-cutover.mjs prepare <EXACT_TOOL_WEB_SHA> /tmp/<NEW_REVIEW_DIRECTORY>`

2. plan의 정확한 SHA256·웹/worker SHA·권한/만료·기존49 무효화·실패 영향·smoke 범위를 부모에게 보고한 후, 사람이 실행 시점 확인을 한다. 확인된 plan만 `approve-plan <PRIVATE_PLAN_FILE> <APPROVED_PLAN_SHA256>`으로 create-only 독립 anchor에 결속한다. plan이 오래되거나 자료/작업이 바뀌면 멈추고 새 검토가 필요하며 기존 anchor를 교체하지 않는다.
3. `stage`로 고정38파일 artifact와 descriptor/config/local policy/3경로 env patch를 준비하고 `preflight`를 실행한다. 이 단계도 token 발급·DB write·worker/web 재시작을 하지 않는다.
4. 공식 `pnpm deploy:dev -- --reviewed-ref <EXACT_TOOL_WEB_SHA> --already-applied-db --db-config <EXISTING_LOCAL_CONFIG> --env-file ~/.homecook/operations/youtube-v85-gen50-20261017/web-metadata.env --test-script test:feedback-batch:web`로 웹을 반영한다. **웹의 pipeline이 새v85이고 DB/worker는 이전v74인 짧은 구간에는 새 추출 접수가503으로 거절될 수 있다.** 기존 결과/자료를 지우지 않는다. worker 전환까지 이어서 실행해야 한다.
5. `apply`: 원49·빈 queue를 재확인하고 full-local custom-format backup을 만들고 decode한다. OFF/drain→원 worker stop→첫50/manager 발급→잠금/CAS 등록→동일 환경 launcher install→인증/empty claim/health/동일 PID→ON/activation seal 순서다. 이 명령은 기존 정책의 fingerprint2/previous=null·DB232·C05/R2 OFF·writer·42작업을 바꾸지 않는다.
6. 실패/응답 유실은 `reconcile`로 판정하고 `resume`으로 같은50만 복구한다. foreign/unknown은 접수 복구를 자동 주장하지 않고 exact blocker를 보고한다. DB232의 기존 웹 rollback 보호를 우회하지 않는다. 발급 전에도 웹이 이미 새 pipeline이면 단순 worker49 복귀만으로 접수가 복구되지 않으므로 자동 웹 rollback을 약속하지 않는다.

기본 smoke 범위는 실제 worker 인증200·empty claim 거절·health/identity/PID·기존 결과 화면 연결이며 **새 모델0**이다. 신규 영상 신청의 실제 모델 평가는 이 도구에 포함하지 않는다. 대표 신규 신청1건을 추가하려면 영상/시도/모델 호출 범위를 별도로 정하고 실제 횟수를 기록해야 한다. v85 품질 한계(소갈비 모호량3건·낙지 당근 선택 속성)는 유지하며 전체P5 완료를 주장하지 않는다.

## 검증 근거와 한계

- 운영 전환/권위/기존 웹 배포 등9파일 **405 PASS**, 실패/skip0.
- pinned PostgreSQL17의 격리된 no-network/no-port/no-volume 임시 인스턴스에서 **7 PASS**, cleanup 확인. 실제 기존 rotation RPC를 사용해 동시 CAS, 늦은 shared-lock 접수, rollback, commit 후 자기 연결 종료, manager scope 거절, stale CAS와42가짜 작업 보존을 확인했다. 운영 연결·실제 credential·모델0이다.
- 프로젝트 typecheck·Next build 통과. 새/변경 파일 lint 오류0/경고0, Anti Slop fixture/type/baseline 검사 통과(173/신규0).
- 원38파일 artifact 재생성 hash 동일. 제품/번들 diff0.
- 실제 launchctl 변경·자격 발급·DB 정책/credential write·공식 새 웹 배포·운영 HTTP/Chrome v85 신청은 아직 하지 않았다. fixture가 실제 인증/서비스 복구를 대신하지 않는다. 실제 토큰 유실·서명 대조가 안 되는 partial local issuance·외부 상태 변경은 자동 재발급/권한 완화 없이 사람이 대조해야 한다.
