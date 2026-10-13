# YouTube v71 worker 비운영 전환 준비 (2026-10-13)

## 범위와 결론

통합 master `8e515a6482a1dfaa292d6f67ae6aa8a06f84d2d4`의 v71 worker 바이트를 로컬 읽기 전용 artifact로 봉인했다. 이 준비는 운영 credential 생성·등록, DB policy 변경, queue/worker 정지, launchd 교체를 수행하지 않으며 그 권한도 부여하지 않는다.

현행 gen46을 같은 `c51d53871f31c7840fe24792b46b191ca963b11b` release로 연장하지 않는다. 최종 후보는 gen47을 v71 release와 새 policy snapshot에 직접 결속한다.

## 봉인된 후보

- release SHA: `8e515a6482a1dfaa292d6f67ae6aa8a06f84d2d4`
- release tree: `32337e7d09d76140f7c73855ae2ab648fefa6e7f`
- build/promotion: `youtube-integrated-8e515a6482a1` / `youtube-integrated-20261013-v71`
- pipeline identity: `85fbf4877e6f2894841bfd160f2d9a63894eb709fd63e897483efe71fd4016cd`
- policy version/snapshot: `3` / `17577b8be8be9da59d37aee80c4467e09fc27b8398a547f63497760c774dc6d7`
- schema identity/hash: `youtube-extraction-worker-schema-v2` / `d728e154663c05677eba4b5b4cfc578036707e8c70d1bee823dbca1ef4ee3fad`
- artifact identity: `5c391bf5e73ee345052e20e66194b8eefa7b214f18c3b7b7fd10718e4e0723ea`
- artifact manifest file hash: `5ccf1e4dd4c8019f65a4f31592891286911150ffde0fbe7cbd8e85ee50a89ed0`
- app descriptor file hash: `ead032f1916f8069e87c6b7b78e2e80ee736883db9a1605ea040a7c245c584f7`

로컬 생성물은 Git에서 제외되는 `.artifacts/` 아래에 있다.

- `youtube-v71-worker-8e515a6482a1/`: 읽기 전용 artifact와 `artifact.json`
- `youtube-v71-app-descriptor-8e515a6482a1.json`: 0600 app descriptor
- `youtube-v71-candidate-policy-final-8e515a6482a1.json`: 0600 candidate runtime policy, SHA-256 `fd98a2d0b185416ffb3b39307a8360eccccc47d8cd838a09dac2fc909e868bbf`
- `youtube-v71-preparation-final-8e515a6482a1.json`: 0600 비운영 전환 manifest, SHA-256 `73f57bf3820afc1a7a201a82da7ec3794c7cfff44d1202b0fb73d8ba395c12ec`

`scripts/youtube-v71-worker-preparation.mjs`는 정확한 artifact·descriptor digest와 v71 policy digest를 다시 계산해 일치할 때만 policy와 준비 manifest를 create-only로 쓴다. 두 출력 경로가 같으면 쓰기 전에 거절하고, 두 번째 create/write가 실패하면 이 호출이 만든 첫 번째 파일만 제거해 부분 준비물을 남기지 않는다. 출력 manifest는 `production_mutation_authorized=false`이며 credential·manager·policy 등록과 queue/worker 변경을 모두 `false`로 기록한다.

## 실제 전환에 필요한 별도 권한과 순서

운영 전환에는 이 준비물과 별개로 다음 범위를 정확히 승인해야 한다.

1. enqueue를 닫고 queued/processing 0, permit holder 없음, 활성 enqueue session 0을 확인한 뒤 gen46 worker를 정지한다.
2. credential singleton, current policy, 현재 plist를 변경 전 증거와 함께 백업한다.
3. 로컬 ES256 issuer로 release `8e515a648…`, schema v2, snapshot `17577b8…`에 묶인 gen47 worker credential을 정확히 6일(518,400초)로 생성한다.
4. worker credential과 분리된 `youtube_extraction_credential_manager` / `youtube-extraction-credential-manager` credential을 최대 5분으로 생성한다. issuer는 `https://worker.mumeok.kr`, audience는 `youtube-extraction`이며 manager role에는 `public.rotate_youtube_extraction_worker_credential(...)` 실행 외 권한을 추가하지 않는다. 이 단기 JWT 자체를 credential singleton에 저장하는 것이 아니라, 이 JWT로 worker gen47을 등록한다.
5. 검토된 DB authority의 한 transaction 안에서 v71 current policy를 먼저 등록하고 `expected_generation=46`, `new_generation=47` compare-and-swap RPC를 수행한다. RPC가 새 current policy의 계산 digest와 gen47 digest를 대조하게 하고 poststate를 확인한 뒤에만 commit한다.
6. 봉인된 artifact를 설치하고 동일 PID의 연속 두 번 running 관찰, 인증 요청 성공, 무자격 요청 거부, queue/permit 상태를 확인한다.
7. gen47 worker 검증 뒤에만 구형 secret 파일을 제거한다.

새 credential, manager token, signing key, raw JTI는 저장소·명령 인수·로그에 넣지 않는다. worker 설정은 service role·signing key를 받지 않는다.

## 중단과 복구 영향

gen47 등록 transaction이 commit되는 순간 gen46은 논리적으로 즉시 폐기된다. DB policy와 credential의 결속을 바꾸는 동안 추출 서비스의 일시중단이 필요하다.

등록 전 설치 실패는 기존 plist 복구와 gen46 재시작으로 돌아갈 수 있다. 반면 등록 후 설치 실패는 plist만 복구해도 gen46 credential이 이미 무효이고 predecessor policy와도 맞지 않으므로 서비스가 복원되지 않는다. 이 경우 선택지는 다음 두 가지뿐이다.

- gen47을 유지하고 봉인된 v71 설치를 수리·재시도한다.
- 별도 복구 승인을 받아 predecessor release/policy에 결속한 gen48을 새로 발급·등록하고 predecessor plist를 복원한다.

두 번째 경로는 새 credential과 추가 DB policy/credential 변경이므로 현재 준비 승인의 범위가 아니다. gen47 등록 전 이 post-registration recovery 결정을 운영 승인에 포함해야 한다.

## 검증

- 후보 policy digest를 기존 result-affecting options와 v71 pipeline identity로 재계산해 `17577b8…`와 일치했다.
- 읽기 전용 artifact의 37개 파일 inventory, runtime bundle closure, expected schema digest를 검증했다.
- 임시 home/secret root와 synthetic credential을 사용해 후보 install preflight를 통과시켰다.
- fake launchctl bootstrap 실패를 주입해 predecessor plist 바이트와 0600 mode가 복원되고 kickstart가 실행되지 않는 것을 확인했다.
- `tests/youtube-v71-worker-preparation.test.ts`와 기존 `tests/youtube-extraction-release-installer.test.ts`: 41/41 통과. 같은 출력 경로를 쓰기 전에 거절하고 두 번째 create 실패 시 첫 파일을 제거하는 failure-atomic 회귀도 포함한다.

격리 검증은 launchd 파일 교체와 preflight/rollback 계약을 확인한 것이며 운영 DB 등록·실제 인증 호출을 대신하지 않는다. 실제 운영 동작은 별도의 정확한 승인과 직전 read-only prestate 확인 뒤에만 수행한다.

## 시간상 차단

현행 gen46 만료는 `2026-10-14T17:14:31Z` (`2026-10-15 02:14:31 KST`)다. 그 전에 마치려면 다음이 실제 차단이다.

- v71 policy + gen47 발급/등록 + worker 교체 + post-registration recovery 범위를 포함한 사용자 승인
- credential manager의 최대 5분 권한을 생성·사용·폐기하는 검토된 실행 경로
- policy 변경과 credential CAS의 transaction/commit 불확실성을 다루는 운영 manifest 및 root authority
- gen47 등록 후 설치 실패 시 v71 수리 지속 또는 gen48 predecessor 복구 중 어느 경로를 승인할지 결정

## 승인된 gen47 전환 도구 (2026-10-13)

사용자는 gen47 worker credential을 정확히 6일로 발급하고, 별도 manager credential은 최대 5분으로 제한해 v71 policy 등록·gen46 정지·v71 기동을 한 번에 수행하도록 승인했다. gen48 발급, 권한 확장, 모델·추출 호출은 승인 범위가 아니다. DB·launchd·credential·policy를 변경하는 실제 실행은 `scripts/youtube-v71-controlled-cutover.mjs`의 정확한 confirmation을 요구한다.

전환 도구는 먼저 release `8e515a…` artifact·descriptor·schema·policy를 저장소 밖의 고정 경로에 create-only로 materialize하고, DB ledger 219·queue 0·processing 0·permit 미점유·active enqueue 0·c51d/gen46 결속·현재 launchd와 기존 credential의 authenticated pre-request를 읽기 전용으로 확인한다. 실행 시에는 다음 순서를 강제한다.

1. ES256 gen47 worker JWT를 518,400초로, manager JWT를 최대 300초로 각각 create-only 0600 파일에 발급한다. manager JWT는 별도 role/scope로 PostgREST pre-request를 통과해야 하며 DB 등록 직후 제거한다.
2. i031 도구·ChatGPT 로그인 preflight와 새 artifact install plan을 mutation 전에 완료하고, 마지막 queue/permit/enqueue 상태를 다시 확인한 뒤 gen46 launchd를 내린다.
3. 단일 serializable transaction에서 enqueue advisory lock과 policy·credential·jobs·permits table lock을 잡고 prestate를 재확인한다. v71 policy를 일시적으로 disabled로 등록한 다음 `expected_generation=46`, `new_generation=47` CAS RPC를 manager claims 아래 실행한다.
4. DB commit 뒤에는 gen46을 자동 재기동하지 않고 gen47을 유지한다. 설치 실패 시 `--resume`은 봉인된 v71 artifact와 gen47만 수리·재시도하며 gen48을 발급하지 않는다.
5. 새 plist는 기존 PATH·TMPDIR·NVM Node binding을 그대로 보존한다. 두 번 연속 같은 PID의 running 상태, gen47 authenticated pre-request, empty-claim 거절, local health를 확인하는 동안 DB policy를 disabled로 유지해 모델·추출 호출을 0으로 고정한다. 이 zero-budget 검증 receipt와 activation intent는 완전히 fsync한 동일 디렉터리 staging inode를 create-only hard link로 원자 publish하고 parent directory까지 fsync한 뒤에만, 같은 quiescence lock 아래 policy를 enabled로 commit한다. commit 뒤 process/session이 끊겨도 `--resume`은 durable verification/activation receipt와 DB enabled 상태를 대조해 정상 worker는 재설치하지 않고 journal만 보정한다. 수리가 필요하면 같은 잠금 안에서 queued/processing/permit/enqueue session이 모두 0임을 확인하고 policy를 먼저 disabled로 바꾼 뒤에만 worker를 재설치한다. receipt와 journal 사이에서 중단되어 orphan receipt가 남은 경우에도 DB가 disabled임을 잠금 안에서 확인한 뒤 해당 고정 receipt를 durable 삭제하고 새 worker 검증을 수행한다.

실행 전 `--prepare`가 만드는 private receipt와 전환 중 row/plist backup·journal·최종 receipt는 `~/.homecook/operations/youtube-v71-20261013`에 0700/0600으로 남긴다. JWT 원문은 영수증이나 stdout에 기록하지 않는다. DB commit 전 실패만 gen46이 여전히 current인 것을 readback으로 확인한 뒤 기존 plist를 다시 기동하고 미사용 gen47 파일을 제거할 수 있다.

전환 도구와 credential issuer 회귀는 `tests/youtube-v71-controlled-cutover.test.ts`, `tests/youtube-v71-worker-preparation.test.ts`, `tests/youtube-extraction-release-installer.test.ts` 49/49를 통과했다. 여기에는 pinned Node ESM runtime의 실제 모듈 로딩 검사가 포함되며, typecheck와 변경 파일 lint도 통과했다. 독립 리뷰에서 발견된 동시 실행 race, stale lock, metadata overwrite, pre-commit retry 차단, 비내구성 journal, policy enable 뒤 crash 복구, signing key 검증 누락, disabled orphan receipt, active worker 재설치 위험은 각각 PID 시작시각·nonce가 있는 create-only invocation lock과 stale 회수, credential metadata `wx`, gen46 readback 뒤 자체 생성 pre-commit artifact 정리, file·parent directory fsync, activation 전 durable verification receipt와 enabled/disabled 양쪽 reconcile, exact realpath·0600·owner 검증, disabled 잠금 확인 뒤 receipt 재생성, active 상태 receipt-only reconcile과 quiescent disable-before-repair로 수정했다.

