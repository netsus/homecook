# v74 추출기 운영 전환 준비 — 2026-10-16

## 현재 상태와 범위

사용자는 설명란·영상 작성자 댓글 우선과 자막 결속 보완의 원격 반영·PR·머지·배포를 요청했다. 남은 수량 미해결5건·마늘 누락1건은 수정하지 않으며 P5 통과를 선언하지 않는다. 실제 평가 v73와 저장 응답 재생 v74는 [평가 기록](youtube-caption-clause-evaluation-20261016.md)처럼 구분한다.

현재 단계는 **코드 통합과 배포 후보 준비이며 운영 미변경**이다. 운영 DB·credential·보안 설정이 필요하면 별도 확인하라는 이번 요청에 따라 실제 교체를 시작하지 않았다. 이전 v71/C04의 승인파일·고정 PIN·gen48 전환 권위를 새 전환에 재사용하지 않는다.

## 읽기 전용 현재 확인

- 확인한 origin/master: `e455a9a31f03006b2cf21c04b6cdabb7d2657d9d`. 최신 master를 작업 브랜치로 통합했고 두 공식 문서의 prepend 충돌만 해결해 양쪽 기록을 보존했다. 원 개발 폴더의 미커밋 변경은 손대지 않았다.
- 운영 웹: `0ae67d66c5ab330cf3f7ef7aff3a7ba40e99b1d7`, build `prelaunch-0ae67d66c5ab-DexI9I`, loaded=true·DB232·recoveryPending=false·rollbackAvailable=false다. master와 웹 commit은 이미 다르므로 이번 추출기만 반영됐다고 표시하지 않는다.
- 운영 worker: `6b610eb012da42b5d151b058531815dc12a8ca45`의 c04-quantity-v4 artifact, v71/verifier44, generation48. launchd running·PID58417·runs5이며 last exit code1은 과거 종료 기록이다. 현재 credential expiry는 `2026-10-20T14:52:30Z`다.
- `2026-10-16T13:15:43.675493Z` full-local target의 READ ONLY transaction에서 activeJobs0·permitHeld=false·activeEnqueueSessions0, generation48/current release 일치, policy.enabled=true·version3·pipeline `85fbf4877e6f2894841bfd160f2d9a63894eb709fd63e897483efe71fd4016cd`를 확인했다. 대상은 Compose `homecook-full-local-isolated`의 pinned PostgreSQL container다. 사용자 데이터나 credential/JTI 원문을 조회·출력하지 않았다.
- 알려진 web deploy.lock·worker install.lock·production promotion lock은 존재하지 않았다. 실제 변경 직전에는 기존 global lock과 fresh queue/permit/enqueue 확인이 다시 필요하다. 열린 관련 외부 PR은 이번 diff에 포함하지 않는다.

## 일관된 후보 결속

bundle만 바꾸면 웹의 고정 identity v71과 어긋나 `I031_IDENTITY_MISMATCH`가 발생한다. 배포에 필요한 최소 구성 변경으로 `lib/server/youtube-i031-runtime.ts`의 client/signature와 `lib/server/youtube-async-extraction.ts`의 pipeline hash를 실제 v74 worker가 계산한 값에 맞췄다. 모델·CLI·프롬프트·권한·기능 동작은 바꾸지 않는다.

- client: `codex-vision-source-anchored-v74-caption-shared-owner`
- verifier: `source-anchor-fidelity-v47-caption-shared-owner`
- executionConfigSignature: `06bdcbd216cd40f307ddbb74`
- pipeline identity: `0d81a76c8df4b3f0c8ec05f1a0ad9aeab5477b9cb7fa4b64e299ce83452b7583`
- policy version: 기존3 유지
- 새 계산 snapshot digest: `6ad984e1ff856c009698bb15d1c2afb72116264b29120390204cc6af32aef121`
- expected schema: 현재 C04의 schema-v2·hash `2ea26b772e3f69e7bbf524d6303c5c40072b6c721028204a821dba0699822e20` 유지. SQL·DB schema 변경은 없다.

## 검증

최신 master 통합 후 관련9파일 **367개 통과**, 실패·건너뜀0, `pnpm typecheck` exit0, `pnpm build` exit0을 확인했다. 빌드는 기존 React hook3개·owner-hints 미사용1개 경고를 출력했으므로 warning-free라고 부르지 않는다. 선택 ESLint 오류0, Anti Slop 신규 위반0, diff whitespace 검사를 통과했다. 초기에 새 테스트의 JS 추론 타입2건과 중복 identity 테스트의 nullable 인수 타입1건이 실패했으며, 제품 검증을 우회하지 않고 fixture 타입 문제를 정리하고 기존 runtime 통합 검사를 재사용했다.

이 배포 준비 단계의 실제 추출·모델 호출은0회다. 후보 검증·artifact 봉인은 실제 운영 설치·인증·기동·추출 검증을 대신하지 않는다.

## 별도 확인이 필요한 실제 변경과 복구 계획

기존 preflight는 `descriptor.release_sha == artifact.release_sha == credential.release_sha`와 snapshot의 정확 일치를 요구한다. 기존 gen48은 구 release/snapshot에 결속돼 있으므로 새 소스에 재사용할 수 없다. 기존 C04 제어 profile도 고정된47→48 전환만 허용하며49를 받아들이지 않는다. 이름만 바꾸거나 원 PIN을 바꿔 우회하지 않는다.

필요한 다음 변경은 아래 범위다.

1. 최종 merged source의 새 artifact/descriptor/policy를 저장소 밖 create-only·0700/0600 경로에 봉인한다. 기존 artifact/env/plist·현재 policy/credential singleton의 복구 자료를 보존하고 global lock 아래 fresh queue0/permitfalse/enqueue0를 확인한다.
2. 기존 권한·기존 signing key를 그대로 사용해 **generation49 worker credential 6일**, 별도 restricted credential-manager **최대300초**를 발급·사용·정리하는 제한된 후속 전환을 승인받는다. 새 signing key나 권한 확장은 없다.
3. full-local DB의 worker policy singleton을 새 pipeline/snapshot으로 전환하고 credential을 expected_generation48→49 CAS로 등록한다. schema/사용자 데이터는 변경하지 않는다. enqueue/worker 정책을 OFF로 둔 짧은 전환 구간에서 같은 DB session의 잠금·prestate 확인·commit 결과 재확인을 지킨다. C03/C01/C04·개인 writer·R2 OFF 설정은 보존한다.
4. 새 artifact/env/plist·web descriptor를 같은 merged source로 교체한다. 고정 보호 경로의 새 제한된 successor 전환·현재 DB232/web boundary를 검증한 뒤 `pnpm deploy:dev`의 일관된 웹 반영과 worker 기동/인증/health/동일 PID 관찰을 수행한다. 과거 exact-C04/v71 전환을 임의 일반화하지 않는다.
5. durable 검증 영수증 뒤 policy를 ON으로 전환하고, 중복 없는 대표 영상1건으로 실제 설치본을 확인한다. 최초 확인은 기존 세 영상 중 자막5건이 있는 소갈비찜을 권장하며 새 영상·전체3개 반복은 하지 않는다.

**복구 경계:** 새 credential 등록 전 실패는 기존 policy/credential이 그대로인 것을 읽어 확인한 뒤 원 plist·원 worker로 돌아갈 수 있다. 등록 commit 뒤에는 gen48이 즉시 무효라 plist-only 복원으로 서비스가 복구되지 않는다. 이때 승인된 gen49·새 정책을 OFF로 유지하고 동일 봉인 후보를 수리하는 forward repair가 기본 제안이다. predecessor로 실제 복귀하려면 구 release/policy에 묶인 gen50 추가 발급/CAS가 필요하므로 별도 승인 없이 자동 수행하지 않는다. 결과가 불확실한 CAS는 readback 전 재회전하지 않는다. DB 전체 복원·reset은 하지 않는다.

현재 위 credential/DB policy 변경은 **별도 확인 대기**이며 거부된 작업이 아니다. 실행하지 않았으므로 운영은 기존 web·worker·DB232 그대로다. 원격 코드 반영과 실제 배포 완료를 구분해 보고한다.
