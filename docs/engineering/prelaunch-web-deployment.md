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
