# 서버 MacBook local-first production 운영 계획

상태: **local-first 초기 배포 계약 기준**
최종 갱신: 2026-07-29 KST
서비스: `homecook` Next.js 앱
기본 접속 주소: `http://127.0.0.1:3100`
자동 실행 라벨: macOS `launchd`의 `com.homecook.production`

## 딱 한 줄 요약

현재 production의 뜻은 **서버 MacBook 한 대에서 local Supabase와 Next.js production server를 같이 띄우는 것**이다. 실제 고객은 없고, 검증용 테스트 데이터만 사용한다.

> `127.0.0.1`은 이 MacBook 자신만 뜻한다. 같은 와이파이의 다른 기기나 인터넷 사용자는 이 주소로 접속할 수 없다.

## 현재 사실

| 항목 | 현재 기준 | 쉬운 설명 |
| --- | --- | --- |
| 사용자 범위 | 실제 사용자 없음 | 테스트 데이터와 운영자 검증만 허용한다. |
| production DB | local Supabase | DB/Auth/Storage authority가 이 MacBook 안에 있다. |
| app server | Next.js production build | 개발 서버가 아니라 배포용 build를 띄운다. |
| 노출 범위 | `127.0.0.1:3100` | 같은 MacBook에서만 열린다. |
| 자동 실행 | `launchd` | 로그인 후 자동 시작, 비정상 종료 시 재기동을 맡는다. |
| 환경 파일 | `.env.production.local` | production용 키만 복사하고 권한은 `600`이어야 한다. |
| 로그 | `~/.homecook/logs/homecook-production.out.log`, `~/.homecook/logs/homecook-production.err.log` | 앱 stdout/stderr를 본다. |
| staging | 격리 local rehearsal | 원격 staging이 아니라 별도 로컬 리허설이다. |
| 최종 barrier | local `auth.users SHARE ROW EXCLUSIVE` lock | cutover 마지막 잠금 기준이다. |

## 실제 구성도

```mermaid
flowchart LR
  A["현재 MacBook의 브라우저"] --> B["127.0.0.1:3100"]
  B --> C["launchd: com.homecook.production"]
  C --> D["부팅 wrapper"]
  D --> E["Docker Desktop 준비"]
  E --> F["local Supabase start + status"]
  F --> G["Node.js + Next.js production server"]
  G --> H["local Supabase API/Auth/Storage"]
  H --> I["local PostgreSQL 17"]
```

원격 Supabase 프로젝트는 이번 계약에서 삭제된 것으로 본다. 따라서 원격 migration, 원격 verifier, provider-managed maintenance barrier는 이 문서 범위에서 `N/A`다.

2026-07-29 이전의 원격 Supabase 운영·migration 완료 서사는 이 문서에서 **superseded**다. 과거 이력은 참고용일 수 있지만, 현재 production 정의와 재현 절차의 authority로 사용하지 않는다.

## production과 rehearsal 구분

| 구분 | 의미 | 대표 명령/행동 |
| --- | --- | --- |
| 개발 | 코드 수정용 빠른 서버 | `pnpm dev` |
| rehearsal | 배포 직전 격리 로컬 검증 | clean reset 또는 backup restore 뒤 smoke |
| production build | 배포용 결과물 생성 | `./scripts/run-local-mac-production.sh build` |
| production install | LaunchAgent 등록 + readiness 확인 | `./scripts/run-local-mac-production.sh install` |

## 남은 배포 증거

코드는 local-first 계약에 맞게 정렬됐다.

- production validator는 `HOMECOOK_PRODUCTION_EXPOSURE=local-only`이고 앱·사이트 origin도 loopback일 때만 local Supabase URL을 허용한다. `public`, 혼합 origin, exposure 누락은 계속 거부한다.
- `com.homecook.production` LaunchAgent는 `scripts/start-local-mac-production.mjs`를 실행한다.
- 부팅 wrapper는 `Docker 준비 → pnpm dlx supabase@2.110.0 start → pnpm dlx supabase@2.110.0 status → Next.js start` 순서를 강제한다.
- `install`은 LaunchAgent를 등록하기 전에 고정된 Supabase CLI를 한 번 실행해 pnpm cache를 준비한다. 준비에 실패하면 설치도 중단한다.
- 실제 부팅은 `npm_config_offline=true`로 그 cache만 사용한다. 따라서 재부팅 복구 중 npm registry에 접속하지 않는다.
- 부팅 wrapper는 Supabase CLI에 `HOME`, `PATH`, Docker 설정처럼 필요한 환경만 전달한다. 앱의 anon key나 service-role key는 전달하지 않는다.
- Docker 또는 Supabase 준비가 실패하면 Next.js를 시작하지 않고 비정상 종료한다. launchd의 `KeepAlive.SuccessfulExit=false`와 `ThrottleInterval=10`이 10초 간격 재시도를 맡는다.
- launchd가 wrapper를 종료할 때 `SIGTERM`, `SIGINT`, `SIGHUP` 신호를 자식 Next.js 프로세스까지 전달해 고아 프로세스가 남지 않게 한다.
- 아직 남은 증거는 **실제 서버 MacBook에서의 설치 및 재부팅 smoke**다.

> 따라서 아래의 `build`·`install` 절차는 코드로 자동화됐지만, 실제 서버 MacBook 재부팅 smoke가 통과하기 전에는 “다른 MacBook 배포 완료”라고 기록하지 않는다.

## 지금 바로 확인하는 방법

브라우저에서 아래 주소를 연다.

```text
http://127.0.0.1:3100
```

서비스 상태를 확인한다.

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

`pid`는 프로세스 번호라서 재시작 때마다 바뀌는 것이 정상이다.

## 다른 MacBook에서 다시 만드는 절차

아래 절차는 **초보자 기준**으로 적었다. 핵심은 "같은 소스 버전 + 같은 로컬 DB 상태 + 새 환경 변수 + 새 LaunchAgent"다.

### 1. 정확한 소스 버전 맞추기

- 이 문서 작성 시 검증 기준 Git SHA: `fb15e77697f54f44e318852e227bd4ff97fa3a55`
- 실제 설치 기준: 배포 직전에 승인한 release head SHA. 위 SHA를 영구 고정값으로 사용하지 않는다.
- repo 고정 버전:
  - `pnpm@10.32.1`
  - `next@15.5.21`
  - `react@19.1.0`
  - `react-dom@19.1.0`
  - `@supabase/supabase-js` manifest 범위 `^2.57.4`, 현재 lock 해석 `2.99.1`
  - `@supabase/ssr@0.7.0`
  - 부팅용 Supabase CLI package `supabase@2.110.0`
  - local Supabase PostgreSQL major version `17` (`supabase/config.toml`)
- 실제 재현 authority는 위 설명보다 `pnpm-lock.yaml`이 우선한다. 버전 범위를 보고 수동 설치하지 말고 반드시 `pnpm install --frozen-lockfile`을 사용한다.
- 주의:
  - Node.js 실행 파일 경로는 repo가 고정하지 않는다. 새 MacBook에서도 source Mac과 같은 `node -v` 결과를 먼저 기록한 뒤 맞추는 것이 가장 안전하다.
  - Supabase CLI는 `package.json` 의존성으로 추가하지 않고 부팅 wrapper와 이 문서의 exact package version으로 고정한다. 버전을 바꿀 때는 코드·테스트·문서를 같이 갱신한다.

### 2. 코드와 의존성 설치

왜 필요한가: 앱 build와 local Supabase helper가 같은 버전을 써야 하기 때문이다.

```bash
git checkout <승인한-release-head-SHA>
pnpm install --frozen-lockfile
```

### 3. local Supabase 상태 준비

왜 필요한가: production authority가 remote가 아니라 local DB/Auth/Storage이기 때문이다.

두 가지 길 중 하나를 고른다.

#### A. 깨끗한 기준선으로 새로 만들기

테스트 데이터를 다시 만들 수 있을 때 쓴다.

```bash
pnpm dlx supabase@2.110.0 start
pnpm dlx supabase@2.110.0 db reset --local --yes
```

- 위 reset은 `supabase/migrations/` 전체와 `supabase/seed.sql`을 다시 적용한다.
- 추가 demo 데이터가 필요하면 별도 local seed 스크립트를 쓴다.
  - `pnpm local:seed:demo`
  - 필요 시 `pnpm qa:seed:01-05 -- --user-id <supabase-user-uuid>`

#### B. source Mac의 상태를 그대로 복원하기

같은 테스트 데이터, 같은 계정, 같은 이미지가 꼭 필요할 때 쓴다.

- source Mac에서 챙길 것:
  - local Postgres backup(SQL dump 또는 verified restore artifact)
  - Storage bucket 파일 백업
  - 새 Mac에서 다시 발급할 env 값 목록
- 새 Mac에서는 clean local Supabase를 띄운 뒤 backup을 복원한다.
- 복원 후에 migration head가 현재 repo와 같은지 다시 확인한다. local backup이 오래됐으면 replay보다 오히려 위험하다.

### 4. Storage와 이미지 상태 맞추기

왜 필요한가: SQL만 복원해도 bucket object가 없으면 화면에서 이미지가 깨질 수 있다.

- clean replay 경로라면 seed가 준비한 기본 데이터만 사용한다.
- exact 복원 경로라면 source Mac의 local Storage object도 함께 옮긴다.
- old-path reference를 지우는 작업은 여기서 하지 않는다. irreversible delete는 별도 gate다.

### 5. 환경 변수 새로 발급하기

왜 필요한가: local Supabase 키와 앱 origin이 새 MacBook 기준으로 바뀌기 때문이다.

- source `.env.local` 또는 승인된 비밀 저장소를 준비한다.
- production 파일은 스크립트로 다시 만든다.

```bash
./scripts/run-local-mac-production.sh prepare-env --force
```

- 이 스크립트는 `.env.production.local`을 만들면서:
  - 필요한 production 키만 복사한다.
  - `HOMECOOK_PRODUCTION_EXPOSURE=local-only`를 강제로 넣는다.
  - `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`을 `http://127.0.0.1:3100`으로 맞춘다.
- 파일 권한은 `600`이어야 한다.
- OAuth client secret, service role key, YouTube 관련 키는 새 Mac 기준으로 다시 확인해야 한다. "복사만 하면 된다"고 가정하면 안 된다.

### 6. build 만들기

왜 필요한가: LaunchAgent는 `.next/BUILD_ID`가 있는 production build를 전제로 동작한다.

```bash
./scripts/run-local-mac-production.sh build
```

이 단계는 내부적으로 ESLint를 한 번 돌린 뒤 `next build --no-lint`를 수행한다.

### 7. LaunchAgent 다시 생성하기

왜 필요한가: LaunchAgent plist 경로와 Node 경로는 Mac마다 다를 수 있기 때문이다.

```bash
./scripts/run-local-mac-production.sh install
```

이 명령은 아래를 다시 만든다.

- plist: `~/Library/LaunchAgents/com.homecook.production.plist`
- stdout log: `~/.homecook/logs/homecook-production.out.log`
- stderr log: `~/.homecook/logs/homecook-production.err.log`
- 고정 CLI cache: `supabase@2.110.0`을 한 번 확인하고 이후 부팅에서는 offline으로 재사용한다.
- 부팅 wrapper: Docker를 준비하고 local Supabase의 start/status를 확인한 뒤 Next.js를 시작한다.
- 준비 실패 시: Next.js를 띄우지 않고 종료하며 launchd가 10초 뒤 다시 시도한다.

Node가 표준 위치에 없으면 `HOMECOOK_NODE_BIN`으로 새 Mac의 실행 파일 경로를 먼저 지정한다.
`install` 때만 고정 CLI cache를 처음 준비할 네트워크가 필요하다. 이후 재부팅은 npm registry 없이 복구한다. pnpm cache를 지웠다면 네트워크가 있는 상태에서 `install`을 다시 실행한다.

### 8. smoke 확인하기

왜 필요한가: build가 성공해도 local DB/Auth/Storage 연결이 틀리면 실제 화면은 깨질 수 있기 때문이다.

```bash
./scripts/run-local-mac-production.sh status
curl -I http://127.0.0.1:3100
curl -I http://127.0.0.1:3100/manifest.webmanifest
curl -I 'http://127.0.0.1:3100/api/v1/recipes?limit=1'
```

### 9. cutover가 필요한 경우 마지막 `auth.users` write barrier 지키기

왜 필요한가: 이번 계약에서 원격 provider freeze 대신 local DB lock이 최종 barrier이기 때문이다.

- rehearsal과 production 데이터를 바꾸는 마지막 순간에는 local PostgreSQL의 `auth.users`에 `SHARE ROW EXCLUSIVE` write barrier를 잡는다. 이 lock은 전체 read freeze가 아니다.
- Auth Admin/import/dashboard create/delete 동결, external write attempt 0, 15분 간격 Storage inventory 2회 일치는 lock과 별도로 필요하다.
- quiet window는 최초 cutover 1회성 운영 창이다. 같은 작업 안에서 시간이 조금 늘어나도 별도 재승인을 다시 요구하지 않는다. 다만 lock 상실, digest 불일치, 새 auth/external write, DB·서비스 restart/restore, secret 교체, Auth 동결 해제가 발생하면 즉시 중단하고 quiet 관측과 Storage inventory를 처음부터 다시 수집한다.
- 실패하면 local rollback 또는 clean restore로 되돌린다. 별도 원격 검증기를 기다리는 단계는 없다.

## 운영 명령

### 상태 확인

```bash
./scripts/run-local-mac-production.sh status
```

### 재시작

```bash
./scripts/run-local-mac-production.sh restart
```

### 다시 설치

```bash
./scripts/run-local-mac-production.sh build
./scripts/run-local-mac-production.sh install
```

### 등록 해제

```bash
./scripts/run-local-mac-production.sh uninstall
```

### 오류 로그 보기

```bash
tail -n 100 ~/.homecook/logs/homecook-production.err.log
```

## 장애 확인 순서

1. 브라우저에서 `http://127.0.0.1:3100`을 다시 연다.
2. `./scripts/run-local-mac-production.sh status`에서 `running: yes`인지 본다.
3. `./scripts/run-local-mac-production.sh restart`를 실행한다.
4. 계속 실패하면 stderr 로그 마지막 100줄을 확인한다.
5. 코드를 바꿨다면 `build` 후 `install`을 다시 한다.
6. local Supabase가 내려갔다면 stderr 로그에서 Docker 또는 Supabase 준비 실패를 확인한다. LaunchAgent가 10초 간격으로 자동 재시도한다.

## 안전선

- `.env.production.local`과 secret 값은 Git에 올리지 않는다.
- `SUPABASE_SERVICE_ROLE_KEY`를 `NEXT_PUBLIC_` 변수로 만들지 않는다.
- `127.0.0.1` host 제한을 임의로 `0.0.0.0`으로 바꾸지 않는다.
- local-only production은 같은 와이파이 다른 기기에서도 보이지 않는다. 이 한계를 무시하고 QA 범위를 넓히면 안 된다.
- public 인터넷 공개, 도메인, HTTPS, OAuth production callback, reverse proxy, tunnel, 방화벽은 전부 별도 계약이다.
- Mac이 꺼지거나 잠들면 서비스도 멈춘다. 전원, 로그인 상태, sleep 정책을 운영자가 직접 관리해야 한다.
- old-path irreversible delete는 이번 범위 밖이다.

## 이번 범위 밖

- 같은 와이파이의 다른 기기에서 접속하는 LAN 공개
- 인터넷 공개 배포
- hosted Supabase 또는 managed provider 복귀
- HTTPS/도메인/OAuth production callback 전환
- 외부 heartbeat와 24시간 장애 알림
- old-path Storage 영구 삭제
- 실제 고객 데이터 운영

## 참고한 파일

- `package.json`
- `supabase/config.toml`
- `supabase/seed.sql`
- `scripts/run-local-mac-production.sh`
- `scripts/local-mac-production.mjs`
- `scripts/start-local-mac-production.mjs`
- `scripts/lib/local-mac-production.mjs`
- `scripts/lib/local-supabase-env.mjs`
- `scripts/lib/production-data-quality.mjs`
