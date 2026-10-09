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
