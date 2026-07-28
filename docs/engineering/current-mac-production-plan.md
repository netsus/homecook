# 현재 Mac production 운영 계획

상태: **운영 중 (local-only production)**
최종 갱신: 2026-07-29 KST
서비스: `homecook` Next.js 앱
접속 주소: `http://127.0.0.1:3100`
자동 실행: macOS `launchd`의 `com.homecook.production`

## 딱 한 줄 요약

현재 Mac에서 production build가 `launchd`로 상시 실행 중이며, 원격 Supabase migration, 보안 권한, 전체 테스트, 데스크톱·모바일 화면, 재시작 복구까지 확인했다.

> 이 서비스는 **현재 Mac 안에서만** 열린다. `127.0.0.1`은 내 컴퓨터를 뜻하므로 같은 와이파이의 다른 기기나 인터넷 사용자는 접속할 수 없다.

## 지금 바로 확인하는 방법

브라우저에서 아래 주소를 연다.

```text
http://127.0.0.1:3100
```

서비스 상태를 확인하려면 다음 명령을 실행한다.

```bash
./scripts/run-local-mac-production.sh status
```

정상 예시:

```text
loaded: yes
running: yes
state: running
pid: 29719
```

`pid`는 실행 중인 프로그램 번호라서 재시작할 때마다 바뀌는 것이 정상이다.

## 현재 운영 상태

| 항목 | 현재 값 | 초보자용 설명 |
| --- | --- | --- |
| 실행 모드 | production build | 개발용 서버가 아니라 최적화된 운영 build다. |
| 접속 범위 | `127.0.0.1` | 현재 Mac에서만 접속할 수 있다. |
| 포트 | `3100` | 기존 개발 서버의 `3000`과 충돌하지 않는다. |
| 프로세스 관리자 | `launchd` | Mac 로그인 시 켜고, 비정상 종료 시 다시 시작한다. |
| 서비스 이름 | `com.homecook.production` | `launchd`가 서비스를 구분하는 이름이다. |
| 환경 파일 | `.env.production.local` | 허용된 production 키만 들어가며 권한은 `600`이다. |
| 표준 오류 로그 | `~/.homecook/logs/homecook-production.err.log` | 서버 오류를 확인하는 파일이다. |
| 잠자기 방지 | Amphetamine 실행 중 | Mac이 잠들어 서버가 멈추는 일을 방지한다. |

## production이란 무엇인가

| 구분 | 명령 | 용도 |
| --- | --- | --- |
| 개발 서버 | `pnpm dev` | 코드를 고치면서 빠르게 확인한다. |
| production build | `./scripts/run-local-mac-production.sh build` | 현재 Mac에서 Node 경로를 자동으로 찾아 운영용 코드로 컴파일하고 최적화한다. |
| production server | `pnpm start` | build 결과물을 실행한다. |
| 현재 운영 방식 | 운영 래퍼의 `build` 후 `install` | 새 build를 만든 뒤 품질 검사, `launchd` 등록, HTTP 확인을 수행한다. |

`pnpm dev`가 연습용 주방이라면, production build는 손님에게 내기 전에 같은 레시피를 실제 운영 주방에서 다시 만드는 과정이다.

## 구성도

```mermaid
flowchart LR
  A["현재 Mac의 브라우저"] --> B["127.0.0.1:3100"]
  B --> C["launchd: com.homecook.production"]
  C --> D["Node.js + Next.js production server"]
  D --> E["원격 Supabase DB / Auth / Storage"]
```

## 해결한 근본 원인

### 1. 원격 DB가 코드보다 뒤처져 있었다

증상:

- 홈의 레시피 API가 PostgreSQL `42703` 오류로 실패했다.
- 원격 DB에 `recipes.visibility`를 포함한 공식 schema가 없었다.
- 로컬 build는 성공해도 실제 데이터 요청은 실패했다.

해결:

- 적용 전 schema와 데이터를 각각 SQL dump로 백업했다.
- 원격에서 빠진 공식 migration 33개를 순서대로 적용했다.
- 이번 작업에서 발견한 보안·호환성 migration도 추가 적용했다.
- 마지막 migration 목록에서 로컬과 원격이 일치함을 확인했다.

백업:

```text
/tmp/homecook-pre-migration-20260729.sql
/tmp/homecook-pre-migration-data-20260729.sql
```

### 2. recipe visibility guard가 `public` schema를 읽지 못했다

증상:

- guard 함수 소유자는 필요한 테이블 `SELECT` 권한이 있었지만 `public` schema `USAGE` 권한이 없었다.
- 함수가 schema 안의 테이블 이름을 해석하지 못했다.

해결:

- `USAGE`만 허용하고 `CREATE`는 계속 금지하는 migration을 추가했다.
- guard 소유자는 로그인, superuser, RLS 우회, DB 생성 권한이 모두 없다.
- 익명·로그인 역할은 함수 실행만 가능하고 `service_role`은 직접 실행할 수 없다.

### 3. Supabase hosted PostgreSQL에서 검색 함수 생성이 거부됐다

증상:

- 검색 함수가 `pg_trgm.word_similarity_threshold`를 함수 안에서 바꾸려 했다.
- Supabase hosted 환경은 이 설정 변경을 허용하지 않아 migration이 `42501`로 실패했다.

해결:

- 제한된 설정 변경과 `<%` 연산자 의존을 제거했다.
- 기존 short-ngram GIN index로 후보를 먼저 줄인 뒤 `word_similarity(...) > 0.3`을 명시적으로 계산한다.
- 검색 의미는 유지하면서 index를 사용하도록 만들었다.

검증 결과:

```text
Recall@20: 1.0000
Precision@20: 0.9211
DB p95: 43.30ms
Route p95: 16.79ms
```

### 4. Supabase 기본 권한과 보안 검증기의 가정이 달랐다

증상:

- 익명·로그인 역할에 레시피 관련 직접 쓰기 권한이 넓게 남아 있었다.
- `tags`는 의도적으로 일부 열만 읽게 했는데 검증기는 전체 테이블 `SELECT`가 없다고 오판했다.
- PostgreSQL 17의 제한형 guard 관리 멤버십을 일반 멤버십 누수로 오판했다.

해결:

- 레시피·단계·재료·태그 관련 익명/로그인 직접 쓰기 권한을 table과 column 수준에서 모두 회수했다.
- `service_role`의 `recipe_tags` 직접 쓰기도 회수하고 공식 함수만 사용하게 했다.
- `tags`는 공개 허용 열 7개를 각각 검사하도록 검증기를 수정했다.
- Supabase의 guard 관리 멤버십은 `INHERIT=false`, `SET=false`, 안전한 grantor인 경우 1개만 허용한다.
- 기존 공개 이미지 업로드 호환성은 한 릴리스 동안 유지하되, 비공개 bucket 쓰기 policy는 0개임을 검증한다.

원격 read-only 검증 결과:

```text
schema_ready: true
role_matrix_ok: true
reader_missing_select_count: 0
reader_table_mutation_count: 0
reader_column_mutation_count: 0
service_role_tag_table_mutation_count: 0
service_role_tag_column_mutation_count: 0
guard_unsafe_membership_count: 0
storage_mutation_policy_count: 3
unallowlisted_storage_mutation_policy_count: 0
remote_writes: 0
```

### 5. 최신 pnpm 설정 위치와 Mac의 Node 경로가 달랐다

증상:

- 최신 pnpm은 project 설정을 `pnpm-workspace.yaml`에서 읽는다.
- 현재 작업 셸에는 시스템 `node`가 없어 설치 스크립트와 관리 명령이 실패했다.
- 검토되지 않은 build script는 pnpm이 fail-closed 방식으로 차단했다.

해결:

- 보안 override와 patch 설정을 `pnpm-workspace.yaml`로 옮겼다.
- build script는 `esbuild@0.28.1`, `unrs-resolver@1.11.1` 두 정확한 버전만 허용했다.
- production 관리 래퍼가 시스템 Node를 먼저 찾고, 없으면 현재 Mac의 Codex Node를 찾는다.
- 운영 래퍼의 `build`, `status`, `restart`, `install`, `uninstall`이 Node나 pnpm 경로를 직접 입력하지 않아도 동작한다.

## 완료한 실행 계획

1. [x] 공식 문서와 저장소 운영 규칙 확인
2. [x] 별도 worktree와 작업 branch로 사용자 변경 보호
3. [x] 원격 DB schema/data 백업
4. [x] 원격 pending migration 적용
5. [x] hosted PostgreSQL 검색 호환성 수정
6. [x] recipe visibility 권한과 guard 경계 수정
7. [x] production 전용 환경 파일 생성 및 `600` 권한 적용
8. [x] dependency install, lint, typecheck, 전체 test, production build
9. [x] production 데이터 품질 게이트 통과
10. [x] `launchd` 설치 및 HTTP readiness 확인
11. [x] 데스크톱·모바일 홈과 레시피 상세 확인
12. [x] `launchd` 재시작 후 새 PID와 HTTP/API `200` 확인
13. [ ] 실제 Mac 재부팅 확인

실제 재부팅은 현재 사용자 세션을 강제로 끊기 때문에 수행하지 않았다. 대신 같은 `launchd` 경로의 강제 재시작과 자동 HTTP 준비 검사를 통과했다.

## 최종 검증 결과

| 검증 | 결과 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 통과 |
| `pnpm lint` | 통과 |
| `pnpm typecheck` | 통과 |
| 전체 Vitest | 421 files passed, 4,309 tests passed |
| recipe visibility 실제 PostgreSQL | 75 tests passed |
| prepared food 실제 PostgreSQL | 32 tests passed |
| `pnpm build` | 74 static pages 생성, build 통과 |
| production 데이터 품질 | 통과 |
| 원격 검색 검증 | 통과, remote writes 0 |
| 원격 recipe 권한 검증 | 통과, remote writes 0 |
| 홈 화면 | desktop/mobile 통과 |
| 레시피 상세 | desktop/mobile 통과 |
| 깨진 이미지 | 0 |
| 가로 화면 넘침 | 0 |
| 브라우저 warning/error | 0 |
| 재시작 후 홈/API | HTTP `200` |

## 운영 명령

### 상태 확인

서비스가 켜져 있는지 확인한다.

```bash
./scripts/run-local-mac-production.sh status
```

### 재시작

새 build를 반영하거나 일시 오류를 복구한다.

```bash
./scripts/run-local-mac-production.sh restart
```

### 오류 로그 확인

서버가 켜지지 않거나 화면에서 `500`이 보일 때 확인한다.

```bash
tail -n 100 ~/.homecook/logs/homecook-production.err.log
```

### 다시 설치

코드로 새 build를 만든 뒤, 품질 검사를 거쳐 `launchd`에 등록한다.

```bash
./scripts/run-local-mac-production.sh build
./scripts/run-local-mac-production.sh install
```

### 운영 중지와 등록 해제

현재 Mac에서 더 이상 자동 실행하지 않을 때 사용한다.

```bash
./scripts/run-local-mac-production.sh uninstall
```

## 장애 확인 순서

1. 브라우저에서 `http://127.0.0.1:3100`을 다시 연다.
2. `./scripts/run-local-mac-production.sh status`에서 `running: yes`인지 본다.
3. `./scripts/run-local-mac-production.sh restart`를 실행한다.
4. 오류가 계속되면 `~/.homecook/logs/homecook-production.err.log`의 마지막 100줄을 본다.
5. 코드를 바꿨다면 운영 래퍼의 `build` 후 `install`을 실행한다.
6. 환경 변수만 바꿨다면 운영 래퍼의 `install`을 다시 실행한다.

HTTP만 빠르게 확인하려면 다음 명령을 쓴다.

```bash
curl -I http://127.0.0.1:3100
curl -I http://127.0.0.1:3100/manifest.webmanifest
curl -I 'http://127.0.0.1:3100/api/v1/recipes?limit=1'
```

## 안전선

- `.env.production.local`과 secret 값은 Git에 올리지 않는다.
- `SUPABASE_SERVICE_ROLE_KEY`에 `NEXT_PUBLIC_` 접두사를 붙이지 않는다.
- `127.0.0.1` host 제한을 임의로 `0.0.0.0`으로 바꾸지 않는다.
- public internet 공개 전에는 HTTPS, 도메인, OAuth callback, 방화벽, 법률 문서 검토가 필요하다.
- Mac이 꺼지거나 잠들면 서비스도 멈춘다. 전원 연결과 Amphetamine 상태를 유지한다.
- 원격 migration 전 백업 파일은 검증이 끝날 때까지 삭제하지 않는다.

## 이번 범위 밖

다음 항목은 현재 local-only production과 별도 계획이 필요하다.

- 같은 와이파이의 다른 기기에서 접속하는 LAN 공개
- 인터넷 사용자가 접속하는 public 배포
- 도메인과 HTTPS 인증서
- reverse proxy 또는 tunnel
- OAuth production callback 변경
- 24시간 장애 감시와 외부 알림
- 실제 Mac 재부팅 smoke test

## 다음 단계

현재 목표는 완료됐다. 외부 사용자에게 공개하려면 다음 순서로 별도 작업한다.

1. 공개 범위와 예상 사용자를 결정한다.
2. 도메인과 HTTPS 방식을 정한다.
3. OAuth callback과 보안 헤더를 공개 주소 기준으로 갱신한다.
4. 외부 heartbeat와 장애 알림을 붙인다.
5. LAN 또는 public exposure 전용 보안 검토를 통과한다.

## 참고한 공식 문서

- [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Supabase custom Postgres configuration](https://supabase.com/docs/guides/database/custom-postgres-config)
- [PostgreSQL pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html)
- [pnpm project settings](https://pnpm.io/settings)
