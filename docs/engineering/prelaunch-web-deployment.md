# 출시 전 빠른 개발 배포

상태: 2026-09-05 사용자 승인 — 고객 0명, 광고 미집행 개발 서버

이 경로는 웹 화면·웹 API·환경 설정과 기존 앱에 호환되는 추가형 DB 변경을 처리한다.
사용자 요청으로 기존 랜딩 전용 도구를 일반 개발 폴더에서 사용할 수 있도록 확장했다.
`NODE_ENV=production`은 최적화된 빌드 방식이며, 고객 운영 단계라는 뜻은 아니다.
정식 production promotion의 2회 전체 리허설·tag·attestation 잠금은 유지하되 이 개발 경로에 요구하지 않는다.

## 일반 개발 폴더에서 사용

최신 master가 있는 저장소에서 실행한다. 특정 Codex worktree 경로는 필요 없다.

```bash
pnpm deploy:dev:plan       # 변경 종류·필요 설정·검증 명령 확인, 배포하지 않음
pnpm deploy:dev            # 기본 origin/master를 별도 빌드·확인 후 웹 교체
pnpm deploy:dev:status     # 실행 버전·복구·DB 적용 기록 확인
pnpm deploy:dev:rollback   # 이전 웹과 환경 설정 복원 (DB 복원 아님)
```

일반 개발 폴더에 미커밋 변경이나 오래된 브랜치가 있어도 그 작업을 덮어쓸 필요가 없다.
공용 명령을 한 번 설치하면 어느 폴더에서든 동일한 도구를 실행할 수 있다.

```bash
pnpm deploy:dev:install
homecook-deploy status
homecook-deploy plan
homecook-deploy deploy
```

설치는 `~/.local/bin/homecook-deploy`와 `~/.homecook/prelaunch-web/tools/`의 커밋 기반 도구 snapshot을 만든다.
미디어·node_modules를 복제하지 않고 실행 scripts/infra/config만 보존한다. Git 명령은 원래 저장소를
사용하므로 개발 폴더의 checkout이나 미커밋 파일을 바꾸지 않는다. PATH에 `~/.local/bin`이 없으면
그 절대 경로로 실행한다. 도구 갱신 후 같은 설치 명령을 다시 실행한다. 무관한 기존 명령은 덮어쓰지 않는다.

`origin/master`는 로컬에서 마지막으로 가져온 기준이다. 원격 변경이 있다면 먼저 `git fetch origin master`를 실행한다.
기존 `deploy:dev:landing` 별칭도 유지하지만 이제 같은 일반 개발 배포 경로를 실행한다.
검토·테스트한 미병합 긴급 수정은 `--reviewed-ref <40자리 SHA>`로 지정한다. 현재 웹 commit의 후속 commit이어야 한다.

## 어떤 검사와 변경을 실행하나

| 변경 종류 | 자동 처리 | 추가 입력 |
| --- | --- | --- |
| 화면·스타일·이미지 | 의존성 고정 설치, Next 빌드, 별도 포트 확인, 웹 교체 | 필요하면 특정 commit |
| 웹 API·서버 애플리케이션 코드 | 위 과정 전에 `test:product` 자동 실행 | 기능별 검증은 `--verify-script` 선택 |
| 웹 환경·Turnstile 키 | 비공개 dotenv 병합, 기존 plist 값도 갱신, 새 빌드·재시작 | `--env-file` |
| 추가형 DB 변경 | 격리된 전체 migration 검증, 로컬 DB 전체 snapshot, 새 SQL와 checksum 이력 한 transaction, PostgREST schema reload | `--db-config`, 최초 `--db-baseline`, `--db-compatible` |
| worker·Docker 구성·도메인·프로세스 런타임 | 빠른 배포에서 거부, 별도 절차 | 해당 운영 작업 |
| DROP·TRUNCATE·데이터 재작성·동적 SQL | 빠른 DB 배포에서 거부 | 별도 검토·운영 절차 |

`eslint.config.mjs`는 임의 변경을 허용하지 않는다. 검토된 pnpm 플러그인 경로 보완만
Git의 원본 bytes SHA256 `516f348fb17cd091ba8bb033aea2de9230672cf910d02171833419058930f43d`
→ `632dfa7702050ae3c0b21a3b578922eed714a883954ee97864410c9152a9c32a`로 일치할 때 웹 빌드 변경으로 처리한다.
이 보완은 기존 설치된 플러그인 위치를 찾는 3줄이며 규칙·ignore·의존성을 바꾸지 않는다.
삭제·역방향·다른 bytes·다른 설정 파일은 계속 거부하고 CLI/env 승인 우회 옵션은 두지 않는다.

모든 웹 배포는 `/beta`, 고유 build manifest, 실제 정적 파일 GET을 확인한다.
이것만으로 임의 API의 업무 기능이나 실제 Turnstile 키의 유효성을 보장하지 않는다.
관련 테스트가 자동 실행되며, 필요하면 저장소에 정의된 검증 명령을 추가한다.

```bash
pnpm deploy:dev -- --verify-script test:product
```

`test:*`, `verify:*`, `marketing:preview:*`, `marketing:production:*` 중 대상 package.json에
실제 정의된 키만 사용할 수 있다. 추가 셸 인수는 받지 않는다. test 명령은 OS 실행 기본값과 CI만 전달받아 NODE_ENV=test로 실행하고, verify/marketing 운영 검증은 실제 운영 환경을 유지한다.
실제 외부 기능을 검사하는 스크립트는 그 스크립트의 준비 조건을 따른다.

변경 범위에 맞는 테스트 묶음을 명시하려면 `--test-script <test 이름>`을 사용한다.
대상 `package.json`에 정의된 `test` 또는 `test:*` 명령만 허용하고 실제 실행한다.
지정하지 않으면 API 변경의 기존 기본값 `test:product`를 유지한다.
`--verify-script`는 여전히 선택한 기본 테스트 뒤에 실행하는 추가 검증이다.
두 옵션 모두 `--skip-automated-tests`와 함께 사용할 수 없다. 배포 기록에는
선택한 기본 명령과 실행한 전체 검증 목록을 남기며 빌드·별도 포트·운영 GET 확인을 유지한다.

## 웹 보안키·환경 설정

Git 저장소 밖의 실제 파일을 만들고 권한을 0600으로 설정한다. 값은 명령 인수나 PR에 넣지 않는다.
파일은 전체 환경 복사본이 아니라 변경할 키만 담는 dotenv patch다.

```bash
chmod 600 ~/.homecook/config/web-update.env
pnpm deploy:dev -- --env-file ~/.homecook/config/web-update.env
```

Turnstile의 공개 site key와 서버 secret 등 일반 웹 설정을 지원한다.
원래 plist가 같은 키를 가지고 있어도 새 값이 적용되며, 이전 값은 이전 release에 남아 웹 rollback 시 복원된다.
`NEXT_PUBLIC_*` 설정도 새 번들에 반영되도록 매번 고유 build ID로 빌드한다.

HOME/PATH/NODE_OPTIONS, QA 우회, 공개 이름의 secret/password, local authority를 remote로 바꾸는 설정은 거부한다.
DB/session의 외부 secret store가 권한을 가진 키는 이 dotenv patch로 회전하지 않는다.
이 도구를 병합·설치해도 실제 키가 생성되거나 이메일 접수가 켜지지 않는다. 현재 접수 비활성 선택을 유지한다.
R2 광고 설문의 repository root·release SHA·readiness가 현재 실행 checkout과 일치하고,
보호 코드·SQL·동의 화면·라우팅·관련 환경 설정이 바뀌지 않은 웹 수정만 기존 증거를 승계한다.
승계 시 원 검증 시각과 증거 파일·해시는 보존하고 비공개 readiness 사본의 release SHA,
repository root와 readiness path를 새 checkout에 함께 연결한다. 관련 변경이나 DB 동시 배포는
기존 증거로 진행하지 않고 새 R2 검증을 요구한다.

### 승인된 R2 수집 중지 상태의 F01 정정과 후속 웹 배포

2026-10-14 사용자가 PR #1672·#1677과 정확한 웹 `76ff4efe438f → 87cd04e11607`,
두 수집 환경 설정의 false 전환을 승인했다. `CLOSED_R2_REVIEW_PIN`은 승인된 비공개 검토 파일의
경로·SHA-256에 고정한다. 실제 predecessor/candidate SHA와 전체 변경 파일 bytes, build/plist,
중지 receipt, control, 원 readiness/proof 9개, 읽기 전용 DB source/applied 목록이 모두 일치해야 한다.
CLI·환경 입력으로 pin을 바꿀 수 없으며, 빈 pin은 운영 파일에 접근하기 전에 거부한다.
이 승인은 수집 재개나 DB·worker 변경을 포함하지 않는다. 머지나 pin 설정 자체는 실제 배포 완료 증거가 아니다.

최초 예외는 `app/privacy/page.tsx`, `app/page.tsx`, `components/home/home-screen.tsx` 세 제품 파일과
지정한 테스트·설명 문서의 exact diff만 허용한다. 기존 7개 지정 경로에 위 홈 제품 2개와
`tests/home-screen.test.tsx`, 이미 반영된 운영 증거 `docs/engineering/mumeok-beta-v9-progress-20261013.md`와
`docs/유저flow맵-v1.3.38.md`만 더해 총 12개 경로로 제한하며 세 제품 파일은 검토한 기존 파일의
before/after bytes가 모두 필요하다. 새 제품 파일이나 기존 보호 파일 전체에 예외를 주지 않는다.
홈 수정은 서버의 명시 `MUMEOK_ROUND2_ENABLED=false` 때만 모바일 R2 진입 두 개와 데스크톱
R2 배너를 숨겨 recording404로 가는 깨진 링크를 없앤다. unset/true의 기존 표시와 collector/API/
recording route는 그대로다. 이 UI 변경은 수집 권한을 부여하지 않는다.
비공개 dotenv patch는 다음 두 줄만 포함한다.
patch 해시는 파싱한 객체가 아니라 줄바꿈을 포함한 **원 dotenv bytes**의 SHA-256이다.

```dotenv
MUMEOK_ROUND2_ENABLED=false
MUMEOK_ROUND2_LEADS_ENABLED=false
```

승인 후 사용할 기존 명령 형태는 다음과 같다. `--`는 pnpm이 Node에 전달하는 인수 경계이므로
생략하지 않는다. 경로에는 Git 밖의 소유자 전용 파일을 지정하고 키 값을 인수에 넣지 않는다.
아래 명령의 자리표시자에는 고정된 검토 파일과 일치하는 승인된 실제 값을 사용한다.

```bash
pnpm deploy:dev:plan -- --reviewed-r2-closed-maintenance \
  --reviewed-ref <FINAL_F01_SHA> --env-file <PRIVATE_FALSE_PATCH> \
  --test-script <REVIEWED_EXISTING_TEST> --already-applied-db --db-config <FULL_LOCAL_CONFIG>
pnpm deploy:dev -- --reviewed-r2-closed-maintenance \
  --reviewed-ref <FINAL_F01_SHA> --env-file <PRIVATE_FALSE_PATCH> \
  --test-script <REVIEWED_EXISTING_TEST> --already-applied-db --db-config <FULL_LOCAL_CONFIG>
```

DB 쓰기와 SQL source 변경은 금지한다. `--already-applied-db --db-config` 쌍으로 기존
읽기 전용 container/volume·migration ledger/source 검사를 실행한다. pending/baseline은 0이어야
하며 ordered source와 applied bytes 해시가 같아야 한다. 검토 핀의 `databasePlanSha256`는
`JSON.stringify({ source: plan.source, applied: plan.applied })`의 SHA-256이고 준비 전후 결과도
같아야 한다. 이 검사는 전체 실제 DB schema 동일성의 증명이 아니다. backup/apply/transact,
baseline 추가, `--db-compatible`, 테스트 생략은 이 경로에서 받지 않는다.

두 flag 외 기존 환경·실행 설정은 유지하며 R2 release/root/readiness 세 결속과 원 proof 파일을
원본 그대로 보존한다. `round2-closed-maintenance.json`은 활성화를 허용하지 않는 source/build/
plist 감사 기록이다. 기존 활성 readiness의 새 SHA 권위로 사용하지 않는다. 원 proof가 현재
direct DNS 운영과 맞는다는 주장도 하지 않는다. 수집 재활성화는 별도 fresh proof 전까지 거부한다.

후속 일반 웹 변경은 기존 `--reviewed-ref`의 현재 live 후손·clean·전체 diff 검사와 원래
protectedSources/worker/DB/환경 가드를 그대로 통과해야 한다. F01 성공 계보의 실제 marker와
state/from/cwd/build/plist, false/false flag, control hash·generation 1, 원 proof 9개가 모두 일치할
때만 닫힘을 승계한다. `plan`도 보호 파일/환경/SQL 거부를 실행한다. 새 env patch, 다른 reviewed
모드나 DB 쓰기는 허용하지 않는다. 실제 인증·권한 의미 변경의 사용자 승인 규칙은 계속 적용되며
이 파일 경로 검사가 그런 의미 변경을 자동 판정하지는 않는다.

```bash
pnpm deploy:dev:plan -- --reviewed-ref <NEXT_REVIEWED_WEB_SHA> \
  --already-applied-db --db-config <FULL_LOCAL_CONFIG> --test-script <RELATED_EXISTING_TEST>
pnpm deploy:dev -- --reviewed-ref <NEXT_REVIEWED_WEB_SHA> \
  --already-applied-db --db-config <FULL_LOCAL_CONFIG> --test-script <RELATED_EXISTING_TEST>
```

후속 릴리스는 실제 새 from/to/build/plist와 직전 marker·state snapshot 해시를 기록한다.
실패 보상은 직전부터 닫혀 있던 plist와 그 릴리스 고유 marker/state를 복원한다. 최초 F01 실패만
원 predecessor의 두 flag를 false로 덮은 별도 plist로 복구하며 원 true plist는 감사용으로 보존한다.
그 닫힘 predecessor에서 같은 exact F01을 재시도할 수 있으나 누락 state, 다른 candidate,
변조 backup/marker, 원 true 환경 복구는 거부한다. 재시도 실패도 전회 marker를 덮어쓰지 않는다.
준비·빌드에는 제어 잠금을 잡지 않고 교체·확인·보상에는 기존 R2 writer와 같은 control.lock
owner/inode 잠금을 사용한다. 잠금을 훔치거나 control 값을 기록하거나 generation을 줄이지 않는다.
교체 직전 실제 웹을 다시 읽고, 실패 보상 직전에도 준비한 target 또는 검토한 predecessor와
source/build/plist가 일치해야 한다. 다른 웹이 감지되면 보상으로 덮지 않고 복구 기록을 유지한다.

수동 `deploy:dev:rollback`의 DB `backwardCompatible=false`와 통합 DB guard는 그대로다.
현재 DB219의 해당 guard가 남아 있으면 수동 rollback은 계속 거부되며 상태 파일을 편집해서
우회하지 않는다. SQL이 없는 이번 웹 교체 실패의 즉시 전 웹 보상과, 과거 DB218 웹으로의
수동 복구는 다른 범위다.

미리보기·교체·보상 시 기존 `/beta`·build/static 검사를 유지하고 R2 POST 503 `ROUND2_DISABLED`,
recording 404, homeflow의 저장 없는 공개 안내, `/`·`/login`·`/privacy` GET을 확인한다.
이는 로그인 성공·공개 recipe 업무 기능·신청 화면 전체·Turnstile widget 부재 또는 승인한
privacy 문구의 실제 표시나 홈 R2 진입 부재를 모두 증명하지 않는다. 이 항목들은 승인 후보의 별도 화면 확인이
필요하며 로컬 fixture 통과를 실제 운영 검증으로 보고하지 않는다.

### C03 보호 DB·reader·조건부 쓰기 전환

기존 `pnpm deploy:dev`에 정확한 보호 전환을 연결한다. 새 독립 배포 CLI·일반 SQL scanner
예외는 없다. `PROTECTED_ROLLOUT_REVIEW_PIN`과 `PROTECTED_WRITER_REVIEW_PIN`은 CLI/env로
덮어쓸 수 없다. 아래 단계는 최종 C03 source·SQL·권한·격리 증거,
실제 prestate와 별도 사용자 승인 파일이 고정되기 전에는 private state/env 조회 전에 거부된다.
F01 승인이나 과거 YouTube/R2 승인을 C03으로 전용하지 않는다.

2026-10-14 사용자가 DB219→220·웹87cd→1c676·백업 설정 승격·조건부 ON/안전 OFF를 포함한 C03 전체 적용을 명시 승인했다. DB/reader 자료 SHA `0112e9ba64f6765a24fe64a891bd96fe2fb6edc19a314d398d0b5a7fbbdb2b6f`, 별도 writer 자료 SHA `87d989c6ca9c50da8cb93ec0c0da4af95d1f30941a9ed2255d67e3ccdea663c4`를 비공개 파일과 코드에 고정했다. 이 기록은 아직 운영 적용 완료를 뜻하지 않는다. 빈 pin 거부는 임시 사본의 실제 CLI로 계속 검사하며 실제 승인 pin을 테스트가 덮어쓰지 않는다. 사용자는 이번 v9 계획의 후속 검증된 변경도 반복 승인 없이 적용하도록 지시했으며, 각 단위의 정확 대상·증거·복구와 운영 확인 기록은 계속 남긴다.

C03 전용 review는 기존 테스트의 source dependency인 `scripts/lib/full-local-security-inventory.mjs`와 공개 읽기 경계인 `lib/server/hybrid-auth/public-read-policy-runtime.mjs` 두 정확 경로만 기존 before/after SHA가 모두 있을 때 추가 검토한다. 일반 scripts 경로·기존 거부 대상인 다른 auth/R2 경로와 normal closed guard는 유지하며 이 로컬 준비가 실제 권한/운영 승인인 것은 아니다. 별도 source/security 검토에는 기존 `recipes` scope의 `find_public_recipe_ids_by_product_name`/`read_recipe_product_ingredient_classification`, `recipe-detail`·`recipe-cook-mode` scope의 `read_public_recipe_product_sources` 세 공개 RPC의 정확 POST body 경계와 고정 source_kind/id select를 포함한다.

실제 plan 경로도 전체 source·SQL·증거·현재 닫힘 경계를 먼저 검증한 뒤 이 검사 모듈 한 파일을 support로 분류한다. 일반 분류기의 scripts 허용 목록은 넓히지 않는다. 계획 명령은 `pnpm deploy:dev:plan -- <공통 옵션>`, 적용 명령은 `pnpm deploy:dev -- <공통 옵션>`이다. 각 package script가 이미 plan/deploy를 포함하므로 명령을 중복 인수로 넣지 않는다.

공통 입력은 `--reviewed-protected-rollout --reviewed-ref <APPROVED_EXACT_SHA>
--db-config <APPROVED_PRIVATE_CONFIG> --test-script test:feedback-batch:web`다.
`--protected-phase`에 다음 단계 하나를 지정한다. env patch, 다른 reviewed mode,
DB baseline/compatible/already-applied, 검증 생략은 이 경로에서 허용하지 않는다.

| 단계 | 조건과 결과 |
| --- | --- |
| `database` | 실제 from/build/plist/closed artifact·전체 source diff·새 migration만 정확히 비교한다. config bytes와 별도의 실제 DB identity pin, 기존 인증된 platform/USB/restore readiness와 승인된 inventory bytes를 확인한다. 기존 controlled session의 serializable/advisory/ledger lock·exported snapshot·full archive decode/roles 백업 뒤 exact payload와 ledger를 같은 transaction에서 실행한다. writer는 OFF다. |
| `reconcile` | unknown에서 migration SQL/apply/backup를 다시 실행하지 않는다. 자기 session 비활성·target/ledger/승인된 catalog/불변 권한을 관찰해 committed 또는 not-applied로 결속한다. mixed/active/foreign는 unknown을 유지한다. committed일 때만 같은 attempt의 schema 갱신 요청을 완료한 뒤 terminal receipt를 기록하며 실패하면 unknown guard를 보존한다; 이 요청 완료는 실제 reader API의 cache 전파 완료를 보증하지 않는다. |
| `database-retry` | 같은 승인·source pair의 정확한 not-applied receipt 뒤에만 새 attempt를 명시 생성한다. 직전 guard와 receipt를 보존하며 미확정/committed/변조/다른 후보에서 재시도하지 않는다. |
| `reader` | 새 DB commit receipt와 모든 신형 marker/rowref OFF의 legacy 호환 격리 증거가 필요하다. 기존 설치·test·build·preview·swap·실제 smoke/R2 검사 경로를 사용한다. 실제 reader 건강 확인 뒤 source/build/plist/DB/업무 흐름 receipt와 floor를 게시한다. metadata 완료만 중단됐으면 같은 actual target을 다시 검사해 서비스 교체 없는 forward 복구를 한다. |
| `writer-on` | 첫 DB/reader 승인과 다른 writer 승인 파일을 읽는다. 실제 ready receipt↔live marker↔승인된 source/build/plist, DB after·reader 흐름·floor를 확인하고 기존 private boolean singleton에 고정 UPDATE만 실행한다. 자동 ON은 없다. |
| `writer-off` | 같은 별도 승인에 포함된 안전 OFF다. 검증된 정상 UI 후손에서도 target/catalog/원 R2 history/floor를 보존해 새 쓰기를 닫는다. 현재 로컬 설계는 긴급 OFF에 새 USB backup 재인증을 요구하지 않고 기존 local-target/catalog/receipt 검사를 유지한다. 이 복구 조건 차이는 최종 사용자 승인 범위에 명시한다. |
| `writer-on-reconcile` / `writer-off-reconcile` | control COMMIT 응답 유실도 자동 재실행하지 않는다. 별도 OFF가 이미 완료됐으면 이전 ON을 never-applied로 가장하지 않고 closed-after-unknown으로 기록한다. floor는 유지한다. |
| `writer-on-retry` / `writer-off-retry` | 같은 source/DB/reader/control 승인에서 not-applied를 확인한 뒤의 명시 새 attempt다. OFF로 닫힌 같은 승인을 ON 재시도로 재활성화하지 않는다. |

배포 DB transaction만 기존 `supabase_admin` 접속을 사용해 그 소유인 migration 이력을 잠그며, 최초 잠금 제한은5초다. 즉시 `SET LOCAL ROLE postgres`로 바꾸고 기존 고정 postgres 읽기 전용 조회의 `search_path`/`TimeZone` 두 설정을 안전한 SQL literal로 LOCAL 적용한다. exact payload·catalog 검사는 postgres이고 ledger INSERT 때만 admin으로 잠시 바꾼 뒤 postgres로 돌아온다. 이력과 SQL은 같은 transaction·exported snapshot/full backup·commit 검증을 유지한다. 원 권한/owner 변경과 CLI role override는 없으며 일반/R2/writer/reload 세션은 postgres 그대로다.

`plan`은 소스·증거·대상·현재 phase를 읽기 전용으로 확인한다. 실행은 항상 사용자 승인 뒤
root operator만 한다. 새 DB가 committed이지만 reader가 pending인 동안 status는 과거 DB219를
현재 기준으로 표시하지 않으며 normal 웹 승계를 거부한다. unknown도 현재 ledger 수를 추정하지
않는다. 정상 UI 후속은 현재 승인된 DB receipt/after ledger/catalog와 기존 SQL0·protected source·
env/read-only guard를 함께 확인한다. 최초 F01 review/원 proof9는 historical bytes로 그대로 보존한다.

ON 승인 파일은 source/DB/reader-flow 증거를 고정한 명시 조건부 형태
(`readerReceiptSha256: null`) 또는 실제 ready receipt bytes까지 고정한 형태를 지원한다.
조건부 형태에서도 tool이 검증·게시한 ready receipt의 실제 source/build/plist/floor를 다시 확인하며
live postimage를 승인 catalog로 학습하지 않는다. 두 승인 권위는 하나의 사용자 질문으로 설명할 수
있지만 하나를 다른 권위로 자동 사용하지 않는다.

고정 semantic catalog probe는 C03의 함수 정의·owner/ACL/config/security/volatility, 관계의
column/constraint/index/trigger/RLS/policy·schema ACL과 역할 속성/멤버십을 비교한다. 원 R2·
Auth 내부/bootstrap·YouTube 권한 catalog는 불변이다. Auth/R2/worker **행**은 migration의
exported snapshot 안에서 SQL 전후 hash를 비교한다. 정상 로그인/worker 활동으로 바뀌는 행
hash를 영구 baseline으로 고정해 다음 UI 배포를 막지 않는다. 모든 신형 marker/rowref OFF와
legacy reader 호환은 source에 묶인 isolated 증거를 요구하며 nullable-only OFF를 인정하지 않는다.

첫 reader 실패의 old predecessor 보상은 실제 OFF table lock을 유지하고, source/build/plist가
captured predecessor 또는 prepared target일 때만 가능하다. 다른 웹을 덮지 않는다. ready/floor가
게시된 뒤에는 old reader 보상을 거부하며 새 reader/DB를 유지한다. ON/OFF 후에도 floor를 내리지
않고 COUNT 0으로 old reader를 허용하지 않는다. 기존 DB219 backwardCompatible=false와 통합
rollback guard도 지우거나 true로 바꾸지 않는다. 웹 rollback은 DB를 역변환하지 않는다.

현재 구현은 첫 C03의 고정 control 계약을 대상으로 한다. C01/C04/C05의 새 DB/권한/control은
각자의 exact descriptor·실제 before/isolated after·별도 사용자 승인이 필요하다. 이 scaffold를
범용 bootstrap/auth/R2 예외로 사용하지 않는다. 새 feature control을 runtime 입력의 임의 SQL/
식별자로 선택하지 않고 기존 helper에 검토된 고정 계약만 추가한다. 최종 C03 migration과 UI
source가 아직 변하므로 두 pin은 계속 비워 둔다. owned network-none PG의 원자/ack-loss/ON/OFF
검증은 운영 SQL·실제 C03 UI·로그인 또는 prod permission 검증을 대신하지 않는다.

## DB 변경

CREATE TABLE, 일반/UNIQUE INDEX, ALTER TABLE ADD COLUMN/CONSTRAINT를 지원한다.
기존 migration 파일 수정·삭제·순서 변경, 트랜잭션을 벗어나는 명령, psql 메타 명령,
DROP·TRUNCATE·UPDATE·DELETE·프로시저/동적 SQL 등은 빠른 경로에서 거부한다.
SQL 분류는 검토한 추가형 migration의 가드이며 임의 SQL의 완전한 보안 분석기가 아니다.

추가형이라는 사실만으로 이전 앱과 호환된다고 가정하지 않는다. 새 필수 컬럼/제약조건이 기존 요청을
깨지 않는지 테스트한 뒤 `--db-compatible`을 지정한다. 호환되지 않으면 별도 배포 절차를 사용한다.

```bash
pnpm deploy:dev -- \
  --db-config ~/.homecook/config/full-local.env \
  --db-baseline ~/.homecook/config/db-baseline.json \
  --db-compatible
```

설정은 기존 full-local config 형식이며 exact Compose project, PostgreSQL 이미지, DB/Storage volume을 지정한다.
현재 사용자 소유 0600 파일이어야 한다. Docker는 로컬 Unix socket만 사용하고 container ID·health·image·volume을 검사한다.

### 최초 한 번: 기존 반영 이력 확인

현재 웹의 Git commit이 DB에 실제 적용된 이력이라는 가정을 하지 않는다.
실제 Supabase migration history 또는 DB 상태를 확인한 담당자가 적용 완료 파일의 목록·원본 SHA-256를 작성한다.

```json
{
  "schema": "homecook.prelaunch-db-baseline.v1",
  "verified": true,
  "applied": [
    { "filename": "20260905010000_example.sql", "sha256": "실제 파일의 64자리 SHA-256" }
  ]
}
```

위 값은 형식 설명용이며 그대로 실행하는 baseline이 아니다. `verified: true`만 적는 것으로 DB 검증을 대신하지 않는다.
빈 목록은 실제로 적용된 application migration이 없는 새 DB에서만 사용한다.
기존 Supabase history가 있으면 그 버전 목록과도 비교한다. 첫 적용 이후에는 내부
`homecook_deploy.migrations` checksum ledger를 읽으므로 `--db-baseline`을 계속 제공할 필요가 없다.
이 ledger는 사용자 API에 노출하지 않는다.

### 적용과 실패

- 격리 검증·백업 실패 시 DB 적용과 웹 교체는 하지 않는다.
- 백업은 schema+data를 포함한 DB 전체 `pg_dump`이며 저장소 밖 0700 디렉터리/0600 파일에 보관한다.
- `pg_restore --list`, 파일 SHA-256와 metadata를 기록한다. 이는 전체 플랫폼/Storage/off-Mac 백업을 대체하지 않는다.
- 새 SQL 전체와 이력 기록은 advisory lock 아래 한 transaction으로 처리한다. SQL 실패 시 부분 적용하지 않는다.
- DB 반영 후 웹 검증이 실패하면 DB 반영 여부·백업 위치를 보존한다. 호환성이 확인된 이전 웹만 복원하며 DB 자동 reset/restore는 실행하지 않는다.
- DB commit 여부가 불확실하면 상태 확인 전 자동 웹 rollback을 막는다.
- ON_ERROR_STOP SQL 오류로 transaction 롤백이 확실한 경우에는 백업·실패 기록만 보존하고 재배포를 막지 않는다. SQL을 수정한 뒤 다시 실행할 수 있다.
- 취소 요청을 받은 뒤 새 DB transaction을 시작하지 않는다. 이미 실행 중인 동기 DB 명령은 timeout/완료까지 기다리고 실제 결과를 기록하며, 취소가 DB 복원을 의미하지 않는다.

## 검증과 적용 범위

명령 parser/classifier/env/웹 복구/launcher/DB 계획·실패 경계를 단위 테스트한다.
실제 disposable PostgreSQL에서 schema+data dump를 다른 DB로 복원하고,
적용 성공·재실행·SQL 실패의 원자성·이력 변조 거부를 검증한다.

```bash
pnpm test:dev-deploy
pnpm test:dev-deploy:db
```

실제 서비스 DB의 마이그레이션 적용은 이 구현/병합 작업에서 실행하지 않는다.
기존 실행 앱·데이터와 사용자의 미커밋 작업은 보존한다. 실제 고객 유입 또는 광고 집행 전에는
이 개발 예외와 정식 운영 배포 절차를 다시 검토한다.

기준: AGENTS.md, agent-workflow-overview.md, supabase-local-only-operations.md,
local-mac-production-release-promotion.md. 기존 정식 promotion kill switch는 변경하지 않는다.

## 2026-09-19 — 이미 반영된 복구 DB와 웹 분리 배포

사용자가 자동 테스트 생략과 새 웹 배포를 요청했다. `--skip-automated-tests`는 자동 `test:product`를 생략한 사실을 배포 상태에 기록한다. 추가 검증 명령과 함께 쓰지 못하며 고정 의존성 설치·production 빌드·별도 포트와 실제 운영 포트의 build/정적 파일 확인은 유지한다.

`--already-applied-db --db-config <비공개 설정>`은 대상 checkout의 모든 SQL checksum을 실제 로컬 DB ledger와 대조한다. 미적용 SQL·새 baseline·변조가 있으면 중단하며 SQL 적용이나 격리 테스트를 실행하지 않는다. 빌드 후 웹 교체 직전에도 이력을 다시 대조한다. 원래의 추가형 DB 적용 경로와 서버 구성 변경 거부는 유지한다.

`--reviewed-repair-readiness`는 2026-09-18 복구 웹의 정확한 출발/도착 commit과 검토한 CSS·SQL에만 사용하는 한정된 재검증이다. 기존 readiness 승계 규칙을 일반적으로 완화하지 않는다. 실제 DB의 보존된 R2 권한 함수·마케팅 구조/함수와 기존 증거 해시를 대조하고, 기존 provider·ingress 검증 시각과 파일 해시를 보존한다. 새 소스 검토 기록은 release의 별도 `round2-source-review.json`에 남긴다. 적용 DB 확인 옵션이 필수다.

운영 도구 변경은 이미 별도 고정 snapshot에 설치되어 있다. 웹은 `5d9c5b09624dff83b43d91983704cec3171087da`를 `--reviewed-ref`로 선택한다. 앱 코드가 master와 동일한지 대조하며 운영 도구를 웹 배포 과정에서 재실행하지 않는다.

## 2026-09-22 — 베타 기능 웹의 한정된 R2 재검증

`--reviewed-beta-readiness`는 운영 웹 `6fa49be6ac55d77a6537d097cf872dba785e0533`에서
검토된 웹 후보 `3f1fc55038f7e172ec052cda2b8a802808e1d64e`로 바꾸는 한 쌍만 허용한다.
일반 R2 승계 규칙·worker/Docker/runtime 변경 거부·추가형 SQL 판정을 완화하지 않는다.
동적 SQL은 별도 대상·백업·검증 절차로 먼저 적용하고, 웹 명령에는
`--already-applied-db --db-config <비공개 full-local 설정>`을 함께 지정해야 한다.

후보의 전체 Git diff와 보호파일 9개의 이전/이후 SHA-256을 고정한다. 이 중
`lib/supabase/server.ts`는 제품 영양의 개당 중량 조회 범위 한 줄,
`package.json`은 실제 관련 테스트 묶음 한 키이며, SQL 7개는 이미 검토된 원본이다.
전체 migration ledger를 실제 DB와 대조하고 원본 R2 proof·ingress proof 해시,
동일 DB 자원, 기존 R2 receipt·권한, immutable scope 및 원래 마케팅 catalog를 재확인한다.
새 제품 영양 wrapper는 격리된 전체 182개 migration 재현에서 얻은 정확한
7개 함수의 이름·본문·owner·ACL·설정 hash 및 기존 delegate 연결로 검증한다.
기존 운영에는 NULL/빈 scope를 더 엄격히 거부하는 블록과 호출되지 않는 과거
owner-only 별칭 2개가 남아 있다. 오늘 변경 전의 인증된 플랫폼 백업에서 이
3개 원문을 추출하고, 앞서 검증한 서명된 복원 manifest의 archive/schema hash와
연결한 비공개 증거 파일 2개의 SHA를 고정했다. 실제 9개 전체 hash와 이 원문을
대조한 뒤, 검증용 메모리 사본에서만 정확한 거부 블록과 별칭을 분리하면
격리 기준 7개와 완전히 같아야 한다. 별칭을 호출하는 다른 public/private 함수나
PostgREST DB 설정이 없어야 하며 owner-only 권한도 그대로 확인한다.
기존 거부 블록·함수·권한을 운영에서 수정하거나, 운영에서 관측한 새 hash를
자동으로 신뢰값에 넣지 않는다.

검증은 준비 시와 웹 교체 직전에 반복한다. 원 provider/ingress 검증시각을 새 시각으로
꾸미지 않고 보존하며 `round2-beta-source-review.json`에 이번 source/DB 확인을 별도로 남긴다.
새 모드 활성화와 실제 저장 완주 확인은 웹 배포의 GET 확인과 별개다.

## 2026-09-27 — 피드백 수정의 exact source 재검증

`--reviewed-feedback-readiness`는 실행 웹 `5d05a180b6c0850dc4e87bfe0945a609ff450e90`에서
검토한 웹 전용 후속 commit 하나로 배포하기 위한 별도 경로다. 기존 일반 승계,
beta/repair의 고정 source pair, 서버 구성 변경 거부는 유지한다.
`scripts/lib/prelaunch-feedback-readiness.mjs`의 `FEEDBACK_REVIEW_PIN`이 비어 있으면
웹 준비를 시작하기 전에 중단한다. CLI나 환경 변수로 승인 대상을 바꾸지 않는다.

운영자는 다음 증거를 준비하고 검토한 뒤 manifest의 절대 경로와 SHA-256을 코드에 고정한다.

1. 최종 통합 코드 commit과 현재 실행 웹을 부모로 하는 웹 전용 후보 commit을 확정한다.
   웹 후보의 모든 변경 파일에 이전/이후 byte SHA-256을 기록하고 보호 파일을 명시적으로 검토한다.
   `app/components/lib/stores/types/hooks/public` 변경은 통합 코드 commit과 byte가 같아야 한다.
2. **SQL 적용 전** 새 외부 0700 작업 디렉터리에서 `createRecordingDockerAdapter`와
   `captureFeedbackDatabaseBefore(adapter)`를 사용해 읽기 전용 증거를 수집하고 0600/create-only
   JSON으로 저장한다. 결과는 대상 identity, 185개 기존 ledger, R2 receipt·catalog·불변 권한·
   마케팅 데이터 hash, 기존 scope 함수별 body hash·owner·ACL·설정이다. 사용자 데이터 원문은
   이 증거에 넣지 않는다. 실제 DB 변경 직전에는 별도 새 논리 백업을 만들고 확인한다.
3. 새 SQL의 검토된 격리 실행에서 예상 scope 함수 목록과 각 body·owner·ACL·설정을 확정한다.
   운영에 적용한 결과를 그대로 새 신뢰값으로 채택하지 않는다. 기존 active 함수가 새 이름으로
   위임되는 경우에도 그 본문·권한은 그대로 남아야 하며, 기존 이름의 delegate도 유지한다.
4. 현재 R2 readiness의 `JSON.stringify` 결과 SHA-256, 원본 proof 6개와 proxy proof 3개의
   SHA-256을 manifest에 넣는다. provider 검증 시각을 새 시각으로 바꾸지 않는다.

manifest 형식은 `homecook.prelaunch-feedback-review.v1`이며 다음 필드를 가진다.

- `from`, `to`: 현재 실행 SHA와 검토한 웹 후보 SHA.
- `migrationSourceRef`, `migrationCount`: 테스트한 통합 코드 SHA와 정확히 `197`.
- `files`: 전체 변경 파일별 `[이전 SHA 또는 null, 이후 SHA 또는 null]`.
- `protectedSources`: 위 파일 중 별도 검토한 보호 파일 목록. 미기재 보호 파일은 일반 승계에서 거부한다.
- `originalReadinessSha256`, `proofDigests`: 변경되지 않은 원본 readiness와 9개 증거의 hash.
- `preApplyProof`: SQL 적용 전 저장한 JSON의 `path`, `sha256`.
- `expectedScopeFunctions`: 격리 실행·검토로 확정한 함수별 `name`, `bodySha256`, `owner`, `acl`,
  `securityDefiner`, `config`. 수집 형식은 `feedbackScopeEvidence`를 재사용한다.

이번 SQL은 별도 통제 절차로 한 번 적용한다. 웹 전용 후보에 SQL 파일을 섞지 않으며,
이 플래그의 읽기 전용 DB 확인은 `migrationSourceRef`의 **197개 SQL 전체**와 실제 ledger를
대조한다. 후보에 없는 SQL을 허용하는 일반 예외가 아니라 고정된 source·count·predecessor
증거를 요구하는 이 rollout 전용 검증이다. 일반 `--already-applied-db` 동작은 바뀌지 않는다.

```bash
pnpm deploy:dev -- \
  --reviewed-ref <검토한 웹 후보의 40자리 SHA> \
  --already-applied-db \
  --db-config <기존 비공개 full-local 설정> \
  --reviewed-feedback-readiness \
  --test-script <이번 변경에 맞는 기존 test 명령>
```

준비 시와 웹 교체 직전에 전체 source·실제 ledger·원본 증거·R2 catalog/행/권한·scope 위임을
다시 확인한다. 검증 기록은 release의 `round2-feedback-source-review.json`에 남긴다.
이 경로가 SQL을 적용하거나 플랫폼 백업/복원·CI·전체 제품 테스트를 새로 강제하지 않는다.
기존 유효한 백업 증거와 해당 변경 직전 논리 백업을 사용하고 `/beta`·build·정적 파일 확인 및
실제 변경 사용자 흐름 검증은 유지한다.

## 2026-09-28 — 누적 피드백 후속 배포

동일한 `--reviewed-feedback-readiness` 경로의 현재 고정 대상은 운영 웹
`f8824662e90f268b922962b1c6f3d3934aee1575` → 웹 후보
`8d9dc57efe223b8e14c41db0597b062f954ab18e`다. 통합 앱/SQL 소스는
`7dade32ca9f214a70856bb65ccd57c50c991397e`, 기존 이력197개 →198개다.
CLI나 환경변수로 이 고정 대상·검토 manifest 해시를 바꿀 수 없다.
새 SQL은 최근 식사 후보에서 소진된 음식을 제외하는 조회 함수 하나이며,
실제 스키마·역할의 격리 적용/rollback과 이전 함수 소유권·권한 보존을 확인한다.
새 논리 DB 백업 및 유효한 전체 플랫폼 복원 증거 확인 뒤 별도 transaction으로 적용한다.

후보에 포함된 보호 파일 변경은 `app/globals.css`의 선택한 모바일 전체화면
스크롤 규칙뿐이다. 마케팅·동의·인증 경계와 기존 scope 함수들은 그대로여야 한다.
R2 원본 증거·검증 시각을 보존하고 현재 외부 manifest의 파일별 byte 해시로 재검증한다.
검사 키 `test:feedback-batch:web`는 후속 저장·식사 기록·탈퇴·모바일 회귀를 포함한다.

전체 플랫폼 백업에서 지난 배포의 영속 이미지 공개 저널
`private.manual_recipe_publication_images`가 누락 분류되어 중단되는 오류도 수정한다.
해당 테이블 하나만 include 목록에 추가하고, 다른 미분류 테이블은 계속 거부한다.
기존24시간 신선도·암호화·off-Mac·복원·서명 검사를 완화하지 않는다.

## 2026-10-07 — 화면 개선과 완료된 재료 DB 통합

현재 고정 대상은 `8d9dc57efe223b8e14c41db0597b062f954ab18e` → `9ad9d2ed9a9741f936facc701345c1719c347d80`, 통합 소스는 `0549174660f866e4ae55ba45187f55cfc156db83`다. 실제 원장201개에서 미적용 SQL3개만 추가해204개로 검증한다. 최신 재료SQL3개는 이미 적용돼 있으므로 전체 기존 파일명·checksum을 보존하며 순서상 앞선 미적용3개를 추가한다. SQL전체204개와 실제원장 일치, 기존권한·R2증거·데이터 보존은 그대로 요구한다. 새 내부검사 delegate3개를 명시적으로 포함해 본문·owner·ACL·설정을 격리postimage와 비교한다. 오프라인 영양 도구/검사 파일은 검토된 정확한 경로만 support로 분류하며 worker/Docker/임의운영스크립트 거부는 유지한다. 웹 후보는 기존실행package·의존성을 유지하고 앱코드는 통합소스와 동일하다.

배포기록: [통합 반영 기록](feedback-batch-release-20261007.md).

## 2026-10-08 — UI 피드백9개 웹 전용 반영

현재 검토 고정 대상은 `899954434a51a44770ea96d78c1e71ee51176cbe` → `974f52a426cf6877fff915fc3a020ec4be9dd625`, 통합소스 `b62d320e017dea4cded0b86a3f71f7994ae04ee5`다. 보호파일은 `app/globals.css`의 모바일 책 전용 선택자 변경뿐이며 마케팅/동의 화면과 관련없음을 검토했다. 운영 원장204개·권한검사14개·기존R2자료를 읽기만 해서 확인하고 그대로 보존한다. 이번 반영에 신규 SQL·데이터 변경·백업/복원 반복은 없다. `--reviewed-feedback-readiness --already-applied-db`는 검토한 CSS와 변경없는204개DB를 대조할 뿐 SQL을 실행하지 않는다. 일반 보호파일 거부규칙과 정확한source·파일hash·증거검사는 유지한다.

## 2026-10-08 — AI 영양의 한정된 배포 검증

`--reviewed-ai-nutrition-readiness`는 비공개 manifest에 고정한 출발/도착 웹과 별도 통합 SQL 소스를 검증한다. `--reviewed-ref`, `--already-applied-db`, `--db-config`가 필요하다. 기존 204개 migration의 checksum을 보존하고 검토한 AI SQL 3개만 더한 실제 207개 ledger, 기존 R2 증거/데이터/권한과 내부 scope의 원본문 보존·정확히 두 delegate 추가를 확인한다. 원본 증명 시각을 새 검증 시각으로 바꾸지 않는다.

현재 핀은 운영 웹 `974f52a426cf6877fff915fc3a020ec4be9dd625` → 웹 후보 `7b672ef55370137367f4b77848feeb1416c9a2ea`, 통합 소스 `ad86aa7c617011583bc2a57c352c49afefce5738`에만 유효하다. 과거 플랫폼/호스트 변경을 다시 배포하지 않도록 현재 웹에 검토한 AI 변경만 겹친 후보이며, 애플리케이션 트리는 통합 소스와 동일하다. 다른 후보·환경변수로 핀을 바꿀 수 없다.

Next 표준 앱 시작 파일 `instrumentation.ts`는 웹/API 코드로 분류해 관련 검사를 실행한다. 기존 호스트 시작 스크립트·Docker·별도 worker 구성을 허용하지 않는다. 과거 대표 영양/람부탄 render·SQL 4개는 실행하지 않는 감사 자료로만 분류한다.

DB 설정은 준비 및 교체 직전까지 `enabled=false`여야 한다. 앱 환경 flag가 켜져 있어도 후보 포트에서 AI를 생성할 수 없다. 실제 웹 build/GET 검증 후 별도 통제 작업으로 활성화·두 재료 enqueue를 진행한다. 이 전용 경로는 SQL을 적용하거나 비활성 확인을 생략하지 않는다.

이 후보의 `test:ingredient-ai-nutrition:web`은 웹 계산·모델·작업·표시 회귀를 실행한다. 과거 SQL 파일이 필요한 migration 정적 검사는 통합 소스의 `test:ingredient-ai-nutrition` 및 실제 격리 SQL 검사에서 수행한다. 검사를 통과시키기 위해 과거 플랫폼 SQL을 웹 후보에 복사하지 않는다.

## 2026-10-09 — YouTube 수동 시험의 exact reviewed 배포

`--reviewed-youtube-trial-readiness`는 운영 웹 `7b672ef55370137367f4b77848feeb1416c9a2ea`의 정확한 후속 웹 후보 한 개만 허용한다. `--reviewed-ref`, `--already-applied-db`, `--db-config`가 모두 필요하며 다른 reviewed readiness와 함께 사용할 수 없다. 비공개 review PIN이 비어 있거나 source pair·전체 파일 hash·R2 proof가 다르면 build 전에 중단한다.

DB는 별도 통제 절차에서 `20261008180000_youtube_saved_recipe_results.sql`, `20261009001000_youtube_trial_quantity_bridge.sql`, `20261009002000_youtube_trial_catalog_attestation.sql` 세 개를 적용한 뒤 기존 207개 checksum과 순서를 보존한 exact 210개 ledger로 검증한다. quantity bridge는 async resolver가 검증된 수량 metadata를 보존하게 하고, catalog attestation은 현재 canonical YouTube fingerprint를 재고정한다. live 207과 격리 208이 이미 같은 fingerprint를 보였으므로 saved-results wrapper를 drift 원인으로 해석하지 않는다. catalog attestation은 과거 stale guard를 bridge 적용 후 격리 재현한 canonical 값으로 교체하는 reviewed repair이며 guard 범위를 넓히지 않는다. fingerprint와 expected-schema pin은 운영 관측값이 아니라 격리된 전체 replay 결과로 확정한다. 기존 immutable marketing/R2 authority, 데이터 digest, scope chain을 보존하고 검토한 alias 하나만 추가한다. 사전 증거에서 AI 영양 설정은 단일 행 `enabled=false`였다. 원인은 이 배포에서 추정하지 않으며, 이 boolean과 설정 전체 digest를 manifest에 고정해 전후 exact 동일성을 요구한다. 이 경로는 false→true 또는 true→false 어느 방향의 변경도 허용하지 않는다.

Live 웹 Git에는 DB에 이미 적용된 historical migration 22개가 없지만 reviewed 웹 후보는 전체 210개 source closure를 가진다. 따라서 source diff에는 이 22개가 추가 파일로 보인다. readiness는 고정된 22개 filename·SHA가 pinned pre-apply 207 ledger와 frozen migration source 양쪽에 exact 존재하고 Git pair가 `[null, same SHA]`일 때만 source backfill로 인정한다. 이를 신규 DB 적용으로 세지 않으며 실제 transition은 마지막 세 SQL의 207→210뿐이다. 변경·삭제·unknown historical SQL이나 ledger/source hash 불일치는 모두 거부한다.

웹 후보에는 앱 runtime bundle과 artifact self-validator에 필요한 `scripts/lib/youtube-extraction-worker-artifact.mjs`, `scripts/manifests/youtube-extraction-expected-schema.json`의 검토된 exact bytes를 포함한다. 이 두 파일은 유효한 trial manifest의 source pair와 전체 파일 hash를 먼저 확인한 경로에서만 support로 분류한다. worker ops/install/backup 파일과 classifier의 일반 거부 규칙은 완화하지 않는다. Luna worker는 별도 controlled installer로 먼저 반영·확인하고, 비공개 rollout proof의 release SHA, runtime tree, descriptor, 설치 artifact, queue policy가 웹 review manifest와 exact 일치할 때만 웹 readiness를 승인한다. 임의 runtime 경로나 환경변수는 신뢰 핀으로 사용하지 않는다.

별도 prelaunch worker installer는 정식 production promotion installer를 수정하거나 release manifest/attestation을 가장하지 않는다. 코드에 고정한 비공개 trial manifest 하나만 읽으며 PIN이 비어 있으면 prepare와 execute 모두 중단한다. 기본 호출은 검증된 install plan만 출력하고, `--execute LOCAL_PRELAUNCH_YOUTUBE_TRIAL_WORKER_INSTALL`만 실제 변경을 허용한다. manifest는 사용자 승인 root record, exact 웹 SHA, DB 210 적용 영수증, 최신 인증 백업·off-Mac/restore/escrow proof, worker artifact·descriptor·policy·expected schema·credential generation/expiry를 모두 고정한다.

Worker env와 full-local DB config는 서로 다른 고정 private path다. Worker install plan에는 worker env만 전달하고, DB adapter와 공식 backup readiness verifier에는 full-local config만 전달한다. 두 경로가 같으면 중단한다. prepare와 mutation 직전에는 실제 DB policy v3·snapshot·pipeline/options, credential generation/JTI hash/expiry/release/schema/digest, queued/processing 0, permit 미점유, DB target/210 receipt를 읽기 전용으로 대조한다. 별도 maintenance 컬럼을 가정하지 않으며, 이전 실행 웹 `7b672ef…`의 고정 plist/cwd Git SHA/build ID와 policy v2 불일치가 새 enqueue를 거부하는 기존 fence도 확인한다.

installer는 worker 전용 O_EXCL lock을 잡고 canonical production promotion lock이 있으면 거부한다. 고정 LaunchAgent label/path의 기존 plist hash와 loaded 상태를 다시 확인하고, create-only 비공개 백업 뒤 0600 원자 교체·bootout/bootstrap·running/current-input attestation을 수행한다. 실패하면 이전 plist와 이전 loaded 상태만 복원한다. DB policy rollback을 했다고 주장하지 않으며 journal에 `dbPolicyRollbackPerformed:false`를 남겨 coherent forward fix가 필요함을 보존한다. HTTP/Docker/access 범위를 추가하지 않고 모델을 호출하지 않는다.

## 2026-10-09 — 대표 재료 검색 반영

`--reviewed-ingredient-search-readiness`는 운영 웹 `370483030665cb25548c40865544c3b6f4f49cbc` → 웹 후보 `4fe84f825c547904c4af969c8c72756d4e59a54b`, 통합 소스 `4680b207b8e5000bc5a1343c9faccdd3e1f544d2`를 비공개 manifest와 파일별 해시로 고정한다. `--already-applied-db --db-config`와 함께 사용하며 SQL을 실행하지 않는다. 별도 백업·격리 복원·실제 역할 검사·rollback 사전 실행 후 적용한 `20261009090000_ingredient_canonical_search.sql` 하나만 기존211개 원장에 더해212개임을 확인한다.

기존 영양정보와 사용 기록, 동의어는 보존하고 옛 이름17개만 추가한다. 내부 권한검사 체인은 그대로 두며 익명 조회는 ingredients scope의 GET alias view 하나만 추가한다. 비동기 추출 역할에는 alias 행의 재료ID·대표ID·표시분류 세 열 SELECT만 허용한다. 기존 R2 증거·시각·데이터와 실제 권한을 교체 직전까지 다시 대조한다. AI 영양 자동 실행은 사용자 선택에 따라 계속 비활성화한다.

웹 후보는 현재 Luna 추출 앱 코드를 보존하며 통합 소스의 앱 트리와 동일하다. 웹 검사는 `test:ingredient-canonical-search:web`을 사용하고 SQL 정적 검사 및 실제 역할 검사는 통합 소스와 격리 DB에서 수행한다. worker 설치·환경·Docker 변경은 포함하지 않는다.

## 2026-10-09 — 개수 단위 근거와 v3 영양 계산 반영

`--reviewed-piece-unit-readiness`는 운영 웹 `4d7238de7e8fa08f4ae51853d7b0139b8bbe6308` → 후보 `91355997309321e9f775eac93a3a88c8352104e5`, 통합 소스 `2c920141b1e95c0d8c512a550a03e8c6271e8505`를 비공개 검토 manifest에 고정한다. `--reviewed-ref --already-applied-db --db-config`가 필요하며 새 SQL1개는 백업/복원·격리 검증·운영 rollback 사전 실행 뒤 별도 transaction으로 적용한다. 원장212→213, SQL 해시, helper5개와 consumer6개의 정의·권한, 기존 내부/익명/worker 권한 체계와 R2 원본 증명·시각·자료를 준비와 교체 직전에 확인한다. AI 자동 영양은 계속 비활성이다.

웹 후보 앱 트리는 통합 소스와 동일하며 최신 화면과 Luna worker 설정을 보존한다. 새 순수 환산 helper는 lib/nutrition에 포함된다. 운영 데이터 보완용 SQL 렌더러는 웹 후보에 넣지 않는다. `test:ingredient-piece-units:web`으로 관련 웹 회귀를 실행한다. 새 guard는 이전v2 앱의 쓰기와 호환되지 않으므로 SQL과웹을 연속 반영한다.

이 옵션은 검증된 DB 계획에서 `backwardCompatible:false` 기록을 만들고, 준비 중 기존 성공 배포 기록에도 이 DB 경계만 덧붙여 이전 웹으로 수동 rollback하는 것을 막는다. 빌드/preview 준비 실패는 recovery 파일을 새로 남기지 않아 검토 경로로 전진 재시도할 수 있다. 실제 교체 후 실패하면 완성된 복구 기록을 남기고 v2 자동 복귀를 하지 않는다. DB가 되돌아갔다고 주장하지 않으며, SQL과 맞는 v3 앱을 복구해야 한다. 다른 배포 옵션의 기존 자동 복구 동작은 유지한다. status.rollbackAvailable은 기존처럼 기록 존재 여부이며 실제 rollback 허용 여부를 뜻하지 않는다.

### C01 개인 무게 근거 후속 — 고정 두 기능의 승인 관계

C01은 기존 `pnpm deploy:dev -- --reviewed-protected-rollout --protected-phase ...`와 동일한 DB/reader/ON/OFF/reconcile/retry 단계를 사용한다. 최초 준비 단계의 새 rollout/writer PIN은 null이었다. 현재 소스는 사용자의 v9 상시 승인 아래 총괄이 검증한 최종 source/실제220/예상 postimage에 별도 PIN을 결속한다. 이 소스의 결속은 설치·운영 적용 성공을 뜻하지 않는다. C03의 원 승인·DB220·reader·ON receipt와 floor를 고쳐 C01 권위로 전용하지 않는다. C01은 `protected-cooked-weight-*` 고정 경로를 별도로 사용하고 승인된 새 DB221을 현재 baseline으로 게시한다.

제어 기능의 선택에는 `--reviewed-ref`에 해당 **원 승인 reader ref**를 사용한다. C03 OFF는 원 C03 ref, C01 OFF는 원 C01 ref다. 실제 live가 정상 UI 후손이면 해당 floor의 Git 후손 및 marker/source/build/plist/receipt를 별도로 검사한다. 둘과 일치하지 않는 ref를 다른 기능의 OFF로 해석하지 않는다. 임의 feature/control/table/role/SQL 옵션은 없다. 현재 검토한 C03 floor는 `1c676f43c99f3268801e7ca4b1072859331503c8`이다. 최종 C01 웹 후보는 `32ab591babf7ec30b7f56b0cbddce65ec1e46e3a`다. 비로그인 요리의 명시 로그인 복귀와 DB OFF 미리보기 호환 수정(SQL SHA `60b9f4008768fc0846eb0b3a104fac3ef0650975535371adf876b95dcb711aa0`)을 포함한다. 정확 before/after65파일·원장220→221·예상 full catalog523f를 결속했으며, 기존 e10 후보/0c92 SQL/b5e 예상값은 역사 자료다. 조건부 writer 승인에 ready receipt가 null이어도 실제 새 reader/source/build/plist/floor 확인은 생략하지 않는다.

DB 단계는 기존 admin-owned ledger 잠금·postgres payload·exported snapshot/full backup·SQL+ledger 원자 commit을 재사용한다. C01의 정확한 새 migration 하나와 그 고정 주석/transaction envelope만 처리하며 기존 lexer 경계를 바꾸지 않는다. C03 control은 ON으로 잠가 보존하고 C01 control은 기본 OFF다. 기존 whole immutable query와 그 원래 OR 의미를 그대로 두고 before/after 기대값을 각각 비교한다. 추가 remainder query는 private `verify_full_local_internal_scope()`의 정확한 zero-argument outer 하나만 제외하며 나머지 R2/bootstrap/worker/role 영역은 동일해야 한다. outer/이전 body alias는 전체 definition·owner/rawACL/config/security/volatility/parallel/leakproof/strict 지문으로 비교하고 alias header만 원 outer header로 정규화해 before body/metadata의 보존을 확인한다. live after를 승인값으로 학습하지 않는다.

reader 단계에서만 서버의 `HOMECOOK_COOKED_WEIGHT_EVIDENCE` 한 키를 실제 승인된 before 값에서 문자열 `1`로 바꾼다. 나머지 환경과 R2 false/false·generation·원 proof9는 유지한다. DB OFF일 때 명시 source 없는 정상 완료/구 수동 입력은 신뢰된 서버 disabled 응답에 한정해 기존 RPC로 처리하고, 명시 실측·stale ON 입력은 임의로 구 입력으로 바꾸지 않는다. 첫 reader는 C01 OFF와 C03 ON을 잠가 검증하며 새 healthy source/build/plist/flow receipt를 게시한 후 별도 조건부 C01 ON을 허용한다. C01 ON/OFF는 C03 row의 공유 잠금을 유지하고 C01 row만 배타 잠금으로 바꾸며 진행 중 evidence mutation의 공유 잠금이 완료되기를 기다린다. 과거 분모·관찰·예측·두 reader floor는 보존한다.

C01 뒤에도 C03의 원 안전 OFF는 사용할 수 있다. 원 C03 OFF 승인과 보존된220 receipt·현재 C01의 정확한221/target/catalog/scope·전승 링크를 함께 검증한 뒤 product control만 닫는다. C01 제어는 바꾸지 않고 C03 ON을 자동 갱신하거나 재승인하지 않는다. C01 reader가 이미 ready이면 이 정당한 C03 OFF receipt를 확인하여 두 기능 상태를 독립적으로 읽으며 C01 자체 ON/OFF와 일반 비보호 웹 승계를 지원한다. unresolved/foreign/mixed writer 또는 DB 결과는 normal 배포를 막고 SQL/backup/control의 자동 재실행을 허용하지 않는다. status의 ledger/제어 정보는 journal 기록이며 실제 DB 확인은 실행 전 기존 readonly 검증에서 수행한다.

C01 DB만 committed이고 reader가 pending일 때 C03 안전 OFF를 먼저 실행하면, 현재 C01 첫 reader 증거의 productON 전제와 맞지 않아 reader 재시도/복구 및 C01 ON을 명시적으로 중단한다. C03 OFF·C01 OFF·원 C03 reader/floor와 두 guard/history를 유지하며 자동 C03 재ON이나 옛 authority 삭제로 풀지 않는다. 다음 단계에는 해당 OFF 상태에서의 정확한 reader 흐름과 이 중단 조건을 바꾸는 좁은 도구 검토가 필요하다. 이 한계를 범용 복구 기능이나 현재 `passed` 주장으로 숨기지 않는다.

임시 full pg_dump가 C03 control을 이미 포함한다는 것과 정규 platform backup/restore의 관계 분류는 별개다. 기존 분류기에 `private.recipe_product_only_write_control`, `private.cooked_batch_weight_evidence_control`, `private.cooked_batch_weight_evidence` 정확히 세 관계만 include로 추가한다. 다른 private 관계의 미분류 거절, 암호화/동일 target/USB/격리 복원·semantic 비교는 유지한다. 개인 evidence를 C05 공동 수집이나 미정 보유기간 정책으로 해석하지 않는다. DB full restore·C03/C01 쓰기 재개는 웹 rollback과 별도 운영 경계다.

설치 snapshot의 기존 선택 경로는 그대로다. runtime은 fixed catalog/scope SQL을 사용하며 `docs/security` JSON을 읽는 source-inventory helper를 새로 호출하지 않는다. 기존 installer의 실제 archive·모듈 load·고정 C01 helper invoke를 격리 HOME에서 확인하고, 검증되지 않은 문서 복사나 새 runner로 누락을 감추지 않는다. C01 whole/immutable 기대값의 source/actual-before/isolated 변경 투영 및 원 데이터 보존은 별도 준비 증거이며 owned clone의 전체 hash를 운영 기대값으로 채택하지 않는다.

## C04 수량 정책의 보호 경로 준비 · 2026-10-14

기존 `--reviewed-protected-rollout`에 `ingredient-quantity-v4`의 정확 5+1 단계를 연결한다. 최초 준비의 C04 PIN은 모두 null이었다. 현재는 사용자의 v9 상시 승인 아래 검토한 웹 `6b610eb012da`, 첫 consumers DB 단계와 원 worker 제어 자료·데이터 비교식을 소스에 고정했다. 실제226 영수증을 확인한 뒤 worker DB 검토와 조건부 writer 검토를 별도로 고정했다. 실제 worker 중지·DB227·새 worker·reader 영수증 검사는 각 실행 단계에서 계속 필수이며, 임의 경로나 환경변수로 대신하지 않는다. 이 소스 결속은 운영 적용·worker 설치·policy 활성화의 완료 기록이 아니다. F01/C03/C01 원 PIN과 권한·SQL은 보존한다.

PR #1694·도구 `6306f862552f`로 first5를 반영하고 실제 DB226·C03/C01 ON·C04 OFF·worker47 및 기존 웹 `5be05649968e`를 확인했다. 실제 T1 영수증 `ea7887576f0fac6062d265eead00ba5329b4e94bad4262dc1174d1e9575a4c28`만 후속 검토에 연결한다. worker를 중지하기 전에 두 후속 검토를 고정하고 기존 도구를 갱신한다. 원 R/UUID/operationRoot/HOME는 유지하고 새 도구 ROOT의 고정 `.artifacts` 경로에 동일 봉인 소스·descriptor를 복사한다. 검토의 worker OFF는 실행 전제이며 현재 중지 완료를 뜻하지 않는다. 아직 생기지 않은 policy 행 SHA와 reader/post 영수증 SHA의 null은 원 controlled journal·실제 pre/post·fresh DB 검사를 생략할 권한이 아니다. 이후 prepare/quiesce→실제 pre 검증→DB227→CAS48/설치/postOFF→reader→writer ON→별도 worker 활성화 순서를 지킨다. 새 영수증을 미리 생성하거나 원 검토로 역참조하지 않는다.

계획 검사에서는 C04의 전체 변경 파일·전후 byte·선행 증거를 먼저 검증한 경우에만 `scripts/lib/youtube-extraction-worker-runtime.mjs`와 `scripts/manifests/youtube-extraction-expected-schema.json`을 지원 파일로 분류한다. 일반 웹 및 C03/C01 분류에는 이 예외가 없고, 다른 worker 명령·설정 파일은 계속 거부한다. 이 분류로 worker를 실행하거나 교체하지 않으며 실제 전환은 별도 고정 worker 경로가 담당한다.

- `database`/`database-retry`/`reconcile`: source227의 정확 first5 postgres payload·admin ledger만 실행하는 221→226 OFF 단계. reader floor나 ON을 게시하지 않는다.
- `worker-database`/`worker-database-retry`/`worker-reconcile`: terminal226 출처와 worker quiesced checkpoint를 검증한 뒤 정확 f586 admin payload·원장1개를 실행하는 226→227 OFF 단계. 두 단계는 각각 같은 snapshot의 full archive decode/roles 백업·기존 데이터·원 원장 행·scope/ACL/control을 보존하며 unknown에서 자동 재실행하지 않는다.
- `reader`: 실제 terminal227 bytes와 새 sealed worker의 원 검토 자료·controlled journal·post terminal 및 fresh target/catalog/queue/credential/plist/PID를 검증한 뒤 정확 웹 source/build/plist/floor를 게시한다. C01의 committed DB/reader/floor/실제 writer ON과 C03 ON을 먼저 요구한다.
- `writer-on`: 위 reader/DB/worker 조건과 별도 원 writer 검토 자료에서만 C04 policy를 ON한다. `writer-off`는 원 출처·실제 target/catalog/scope/권한·reader 하한을 유지하며 C04 policy만 닫는다. 정상 queue 증가, worker 장애, credential 만료가 안전 OFF를 막지 않게 구분하되 worker policy/credential/C03/C01은 바꾸지 않는다. 원 수량·과거 snapshot/영양과 성공 receipt는 OFF에서도 보존한다.

5표의 새 nullable JSONB 열만 기존 열의 정확 projection과 별도 SQL NULL 검사를 사용한다. 다른 명시 domain 표와 기존 auth/R2/YouTube10표의 전체 행/중첩 JSON, 배포 원장의 원 행도 보존한다. root가 확인한 5표의 모든 이름/type/default/nullability와 고정 source 이후의 메타데이터 지문을 비교하며 source 밖 열을 자동 제외하지 않는다. NULL 준비 조건은 DDL 단계에만 적용한다. 각 transaction의 데이터 보존 증거는 별개이며 두 단계 사이의 정상 쓰기를 소급 손상 또는 묵시 허가로 해석하지 않는다. T1 이후 prepare는 원 committed 영수증의 `rowsPreservedInTransaction=true`, 유효한 원 자료 SHA와 `interstageDataContinuityAsserted=false`를 확인하며 이후의 정상 조회수까지 옛 SHA와 같게 만들지 않는다. 원 T1 영수증·SHA는 그대로 보존하고 현재 snapshot은 별도로 관측한다. quiesce transaction의 전후 자료 비교와 실제 pre→T2→CAS의 엄격한 지문 비교는 유지한다. T2 before의 실제 normalDataSha256은 worker checkpoint에 기록한다.

worker는 이 웹/DB 도구의 실행 소유가 아니다. 별도 기존 worker CLI의 C04 profile이 quiesce/CAS/install을 수행하고 DB 도구는 생성 기록을 소비한다. 원 `homecook.youtube-c04-controlled-cutover-review.v1`은 source/target/CAS47→48/226·227/artifact/schema를 고정한다. `preReceiptSha256`/`postReceiptSha256`는 null 조건부로 두고 생성 기록의 실제 PID·row timestamps를 원 review SHA·승인된 UUID·고정 operation root·controlled journal의 immutable pointer와 fresh state에 결속한다. 원 review를 덮거나 생성 receipt 해시를 원 review 해시에 되물리지 않는다. post의 `workerDatabaseReceiptSha256`은 실제 DB2 terminal bytes와 같아야 한다. 임의 유효기간을 정하지 않으며 별도 새 PIN의 결속이 원 권위를 대체하지 않는다.

worker CLI가 재사용하는 최소 export는 기존 lib의 `loadQuantityV4DatabaseReceipt(repositoryRoot, stage)`, `observeQuantityV4WorkerBoundary({repositoryRoot, stage})`, `acquirePrelaunchDeployLock()`이다. 첫 함수는 code-bound review와 고정 global guard→immutable receipt만 읽으며 임의 locator를 받지 않는다. 관찰 preflight는 원 config/protection/actual target/backup readiness를 확인하고 `{authority, observation, adapter}`를 반환한다. 잠금 안에서는 `adapter.observe(sql => session.query(sql), applicationName)`의 고정 쿼리를 같은 transaction에서 재사용하며 target-open/USB verifier를 다시 실행하지 않는다. 기존 global deploy.lock의 mkdir/rmdir를 공유하고 소유 inode만 release하며 stale lock을 자동 삭제하지 않는다. worker pure lib의 DB 역방향 import는 추가하지 않는다.

C04 normal 자료 검사는 같은41표·5표의 원 열·JSON/null/중복을 유지하며 canonical 행별 SHA256을 정렬해16,384개씩 묶는다. 묶음 집계 입력은 고정32byte 해시 기준 최대512KiB이고 전체 정렬의 임시 디스크 사용은 남는다. 같은 transaction callback은 그대로 사용하며, 거래 밖의 이 고정 쿼리만 기존 postgres 읽기 session에서 READ ONLY·lock5초·statement30초·transport33초로 실행한다. 다른5초 관찰·DB180초·writer/worker30초·권한은 바꾸지 않는다. 실제 읽기 전용 사전 측정19.148초와 합성390만 행21.3~21.7초는30초 한도 채택의 근거이며 이후 경합·자료 증가로 한도를 넘으면 취소한다. DB apply는 이 검사를 잠금 안에서3회, writer는2회 반복하므로 해당 실측만으로 약57초/38초의 쓰기 지연이 추가될 수 있고 백업·나머지 검사 시간은 별도다. 원 snapshot의 행 보존 비교를 생략하거나 현재 digest를 새 expected로 채택하지 않는다. 운영 전 안내와 실제 단계 시간은 별도 기록한다.

백업/복원 classifier에는 정확 `private.quantity_input_v4_policy` 한 표만 추가한다. OFF/ON bytes를 그대로 복원하며 unknown private 표의 거부, R2·인증 복원 조건은 유지한다. source SQL6과 역사 actor/권한은 그대로다. 제어 engine 전체를 실제 구성한 owned rehearsal와 독립 검토·최종 source/postimage/PIN 결속은 운영 전에 별도로 수행한다.

worker publication의 immutable origin은 고정 `pre-worker-origin.json`/`post-worker-origin.json`이며 current cutover journal의 source/target/원 review/UUID와 pointer bytes를 교차 검증한다. 자연 restart의 좁은 재검증은 같은 opdir의 `verifications/<UUIDv4>/post-worker-terminal.json`과 같은 디렉터리의 origin snapshot만 허용한다. publisher는 quantity OFF/worker OFF/gen48/같은 source·artifact·plist에서 fresh PID 두 번을 확인해야 하며 원 post 파일을 덮지 않는다. 원 review의 post digest가 nonnull이면 새 digest를 자동 승격하지 않는다. reader/최초 quantity ON은 현재 검증 pointer와 fresh PID 일치를 요구한다. 안전 quantity OFF 또는 별도 worker 활성화는 immutable post 출처를 읽는 historical 경로와 현재 실행 상태를 구분한다.

별도 worker `--activate`는 runtime profile 소유이며 이 DB 도구는 worker 정책을 바꾸지 않는다. worker CLI는 고정 `loadQuantityV4ReaderWriterReceipts(repositoryRoot)`로 DB227·원 C04 reader/floor·원 writer 승인과 실제 quantity ON receipt를 소비한다. `observeQuantityV4WorkerBoundary`의 고정 `quantityWriterState='on'`도 이 출처와 실제 quantity ON을 함께 확인한다. worker 활성화·일시 중지는 별도 profile의 원 review/confirmation·fresh 검증·자체 기록이 필요하며 DB writer ON/OFF와 서로 대신 수행한다고 가정하지 않는다. 원 postOFF publication과 activation 기록은 구분한다.

활성화의 내부 `worker/on` transaction만 같은 worker 4표에 `SHARE ROW EXCLUSIVE`를 사용한다. 실제 실행 중인 worker의 pre-request 읽기와 빈 claim의 `SELECT FOR UPDATE`가 필요로 하는 ACCESS SHARE/ROW SHARE는 허용하고, 모든 INSERT/UPDATE/DELETE의 ROW EXCLUSIVE 및 다른 제어 잠금은 계속 배타한다. queued/processing/permit/enqueue=0 검사, 원 권한·advisory 잠금·5초 lock timeout·직렬화·같은 transaction의 자료 지문·PID/plist 검사는 유지한다. quiesce/CAS/pause는 기존 ACCESS EXCLUSIVE를 유지한다. 기존 잠금에서는 긴 자료 관측 중 poll이 DB timeout으로 종료·재시작해 PID 보호가 활성화를 거절했다. `activation-not-applied`가 실제 OFF로 확인된 뒤에만 기존 activate 경로에서 현재 PID를 새 immutable verification에 기록하며, 원 P1/reader/writer/실패 verification을 덮지 않는다. 이 변경은 timeout 증가·PID 검사 생략·새 worker 봉인 소스나 SQL 변경이 아니다.

C01 predecessor의 원 DB/reader/ON 출처와 floor32ab는 이후 정상 웹 continuation의 live5be와 구분한다. C04의 실제 from/build/plist는 live를 검증하고 원 C01 floor→live→C04 후보의 git ancestry를 별도로 확인하며 원 C01 review/receipt를 retarget하지 않는다.

reader publication P1과 quantity ON 시점의 fresh P2는 서로 다른 기록이다. C04 reader의 `workerReceipt:{path,sha256}`는 원 P1을 보존하고, C04 quantity ON receipt의 같은 필드는 실제 검증한 P2를 보존한다. 각 고정 initial/UUID locator의 immutable origin과 원 review/op/source/target/artifact/descriptor/plist/gen48/DB2·credential·당시 worker OFF를 대조하며 이전 PID나 normalData 값을 같게 만들지 않는다. 원 nonnull post/approval digest와 다른 P2를 자동 승격하지 않는다. ON 이후 자연 restart P3는 원 P2를 덮지 않고 별도 runtime activation의 fresh stable PID 두 번/health로 검증한다. activation authority loader는 P1/P2의 역사 출처를 검증하고 P2.pid를 현재 PID로 retarget하지 않는다.


P1 OFF 이후 별도 worker 활성화·명시 복구 중지로 P2 OFF의 전체 정책 행 해시가 바뀌면 원 immutable 활성화→중지 영수증의 정확한 OFF→ON→OFF 해시 연결만 허용한다. `policyStableSha256`은 PostgreSQL에서 정책 전체 JSON의 `enabled`와 `updated_at` 두 열만 제외한 고정 SHA이며 원본 origin과 모든 단계의 observation에 보존한다. 옵션·키 버전·이전 키 만료·model/pipeline 등 나머지 열은 모두 포함된다. checkpoint33 필드는 바꾸지 않는다.

소비자는 고정 초기/UUID activation verification·activation receipt·repair pause·P2 origin을 소유권·권한·symlink·bytes hash와 원 R/op/source/target/artifact/gen48/DB2로 검증한다. 이전 post publication은 정확 1개만 읽으며 재귀 탐색하지 않는다. `drain_pending`·체인 없는 행 변경·혼합 출처는 거부한다. activation receipt가 null이면 동일 durable OFF verification과 정확 실제 ON을 기록한 고정 `activation-reconciliations/<UUID>/receipt.json`의 `committed` 기록이 필수다. `not_applied`는 새 P2의 긍정 활성화 권위가 아니며 원본을 보존한다. DB writer는 worker 정책을 변경하지 않고 별도 runtime profile만 활성화·복구 중지를 수행한다.

동일 pause 뒤 quantity ON 전 자연 재시작 P3는 pause가 고정한 원 P1의 previous post/origin을 그대로 보존하고 현재 post pointer만 새 immutable P3로 갱신한다. PID·normalData는 각 시점의 기록이며 같게 만들지 않는다. quantity writer가 이미 ON 완료된 뒤 safe OFF했거나 두 번째 정책 수명에 들어간 경우에는 새 정확 review/operation 준비 없이 재활성화하지 않는다. 현재 reader phase는 원 first-source/build/plist를 요구하고 기존 writer journal은 자동 재활성화를 거부한다. 원 receipt나 이 guard를 덮거나 완화하지 않고 quantity OFF와 현재 reader를 유지한다. 이 범위를 자동 복구 완료로 확대하지 않는다.
