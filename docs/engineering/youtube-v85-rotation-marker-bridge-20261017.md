# 키 회전 후 v85 웹 배포 도구의 marker 연속성

승인된 웹/worker 전환 capsule은 `cf5a80513d4e532c2319344af8d72c23375d2fc24fdabc2864dee318dfe11ad5`, 웹 target은 `15b1a36f9b4c4c293cd8f92c6f2824b13ba7eaf9` 그대로다. 원42개/현재43개 및 미귀속 일반·인증 자료 유지에 대한 사용자 승인, 원 plan/anchor, worker release/만료/권한은 바꾸지 않는다. [원 후속 계약](youtube-v85-continuation-20261017.md)을 따른다.

## 원인과 최소 수정

사용자 키 회전이 완료된 현재06a state는 승인된 새 plist를 가리키지만, 불변 closed-R2 marker는 회전 전 plist를 가리킨다. 일반 보호 검사에서는 두 지문이 같아야 하므로 공식 웹 plan이 중단됐다. 이 수정은 그 특정 회전 사건과06a→승인 target15에만 적용한다.

원 marker/receipt/anchor를 고치지 않는다. 명시적인 `rotationBridge` 인자에서 승인 capsule과 새 키 binding, 독립 고정 SHA로 봉인한 committed 회전 journal·state-before/after, stage receipt, state-before/after의 정확한 bytes, 실제 state, 공식 복구 원본 plist를 교차 검증한다. 원본→실제 plist의 차이는 승인된8종 값뿐이어야 한다. state 차이는 target plist 지문과 rotation marker뿐이어야 한다. 실제 live 지문을 과거 지문으로 대체하지 않고 역사 지문과 실제 지문을 별도로 검증한다. 현재 새8종·deny-old fence·수집/lead OFF·control·arm 검사를 유지한다. 누락·위조·추가 설정 변화는 중단한다.

## 도구 SHA와 웹 target의 별도 승인

이 운영 도구의 새 SHA는 기존 capsule의 웹 target15와 다르다. 배포할 제품은 여전히 target15다. 기존15 checkout은 worker stage/preflight/apply용으로 그대로 남겨 HEAD 검사를 생략하지 않는다. 새 도구는 source15 대비 나열한 운영 스크립트3개·회귀 검사3개·관련 문서만 달라야 하며, 사용자가 전달한 `--rotation-bridge-tool-ref <정확한 도구 SHA>`가 실제 clean HEAD와 일치해야 한다. 미추적 helper를 포함한 모든 미추적 파일도 거절한다. capsule/target도 고정값과 원 승인 anchor에 결속한다.

읽기 전용 `plan`은 같은 source/proof 검사를 수행하고 상태·승인·서비스를 쓰지 않는다. 실제 `deploy`는 로그/lock/설치/재시작 전에 Mac의 세 TTY를 확인하고 정확한 tool SHA·target15·capsule hash를 표시한 후 사용자 입력 `V85-BRIDGE`를 요구한다. 거절/nonTTY는 그 지점에서 중단한다. 웹 교체 직전에도 도구 결속을 다시 확인한다. 이 확인은 기존 capsule 승인과 구분되는 정확한 도구 명령 실행 승인이고, 새 영구 anchor나 토큰은 만들지 않는다.

## 실행 순서와 영향

먼저 원15 checkout에서 읽기 전용 worker `preflight`를 다시 통과시킨다. 새 도구 checkout에서 정확한 tool SHA 옵션과 target15, 기존 DB232 읽기 검증, metadata3경로 patch, `test:feedback-batch:web`를 사용하는 공식 `pnpm deploy:dev` 경로로 웹을 배포한다. 새8종/fence/OFF marker를 보존한다. 웹 배포는 worker50을 발급하지 않으며, 새 웹과 기존49 사이에는 추출 접수503이 가능하다.

웹 배포 결과를 읽기 전용으로 확인한 후, 사용자가 원15 checkout에서 `node scripts/youtube-v85-controlled-cutover.mjs apply`를 직접 실행하고 `V85-GEN50`을 입력한다. worker50 만료 `2026-10-22T14:27:30Z`, 기존 동일 권한, manager 최대300초, 등록 뒤49 무효·동일50 전진 복구 계약을 유지한다. 추가 자료 변화가 있으면 원 preflight/apply 보존 검사에서 중단한다. 실제 웹/worker 배포·접수→추출→저장 성공은 이 문서 준비만으로 완료되지 않는다.

## 검사 범위

회전/bridge Node48개와 관련 보호 배포·v85 Vitest387개, typecheck·변경 lint를 확인한다. 격리 복사 fixture의 local import와 설치된 의존성 연결도 갱신해 보호 핀 부재 시 실제 CLI가 운영 접근 전에 거절되는지 검사한다. 실제 공식 plan의 결과와 최종 도구 SHA는 PR 실행 증거에 기록한다. 제품/DB/의존성 변경은 없다.
