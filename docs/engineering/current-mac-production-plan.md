# 현재 맥 production 운영 계획

상태: implementation complete / live activation blocked
생성일: 2026-07-29
변경 유형: low-risk docs/config
대상 서비스: `homecook` Next.js 앱
목표 환경: 현재 Mac에서 production build로 상시 실행

> 운영 차단 사유: 연결된 Supabase DB에 공식 계약이 요구하는 `recipes.visibility`가 없다.
> 필요한 공식 migration: `supabase/migrations/20260723170000_recipe_visibility_read_hardening.sql`부터 원격 미적용 migration 확인 및 순차 적용.
> 안전 조치: launchd 설치·재시작 검증 후 `com.homecook.production` 등록을 해제했으며, Amphetamine만 계속 실행 중이다.

## 딱 한 줄 요약

production 운영 코드와 launchd 흐름은 구현·검증했지만, 원격 DB migration이 코드보다 뒤처져 있어 실제 서비스는 안전하게 중지한 상태다.

비유하면, `pnpm dev`는 요리 연습용 주방이고 `pnpm build && pnpm start`는 손님에게 내기 전에 같은 레시피를 실제 판매 주방에서 다시 만드는 과정이다.

## 현재 repo 근거

| 항목 | 확인한 값 | 의미 |
| --- | --- | --- |
| 패키지 매니저 | `pnpm@10.32.1` | 명령어는 `pnpm` 기준으로 실행한다. |
| 프레임워크 | `next@15.5.21`, `react@19.1.0` | production 실행은 Next.js build/start 흐름을 따른다. |
| 개발 서버 | `pnpm dev` -> `next dev --turbopack` | 개발 확인용이다. production 운영 명령이 아니다. |
| production build | `pnpm build` -> `next build` | 배포 전 반드시 통과해야 한다. |
| production start | `pnpm start` -> `node scripts/start-production.mjs` | 내부에서 `next start`를 실행하기 전에 route manifest 정리를 수행한다. |
| 환경 변수 예시 | `.env.example` | 필요한 키 이름의 기준이다. 실제 secret 값은 repo에 쓰지 않는다. |
| production 품질 게이트 | `pnpm validate:production-data-quality` | QA fixture, local auth, localhost DB 같은 위험 설정을 잡는다. |
| 보안 헤더 | `next.config.ts` | production에서는 CSP와 보안 헤더가 전체 route에 적용된다. |

## 목표

1. `pnpm build`가 production 환경 기준으로 통과한다.
2. 현재 Mac에서 `127.0.0.1:3100`으로 서비스가 열린다.
3. `launchd`로 Mac 로그인 후 자동 실행되고, 죽으면 다시 켜진다.
4. 로그 위치, health check, 중지/재시작/롤백 방법이 문서화된다.
5. 초보 개발자가 `개발 서버`, `production build`, `외부 공개`의 차이를 이해한다.

## 범위

### 이번 계획에 포함

- 현재 Mac에서 production build 실행
- `.env.production.local` 준비 기준
- local-only, LAN-only, public internet 공개의 차이 정리
- `launchd`를 이용한 상시 실행과 운영 명령
- 검증 명령, 운영 체크리스트, 롤백 절차

### 이번 계획에서 제외

- DB migration 적용
- Supabase 프로젝트 생성/변경
- OAuth 앱 설정 변경
- 도메인 구매, HTTPS 인증서 발급, reverse proxy 구성
- 법률 문서 최종 검토
- cloud 배포, Vercel 배포, Docker 배포

## 이번 구현 결과

| 구현 | 파일 또는 명령 | 역할 |
| --- | --- | --- |
| production 환경 준비 | `corepack pnpm mac-production:prepare` | `.env.local`을 그대로 복사하지 않고 허용된 키만 골라 `.env.production.local`을 `600` 권한으로 만든다. |
| launchd 설치 | `corepack pnpm mac-production:install` | DB 품질 게이트 통과 후에만 plist를 등록하고, HTTP 준비 실패 시 자동 롤백한다. |
| 상태/재시작/삭제 | `mac-production:status`, `mac-production:restart`, `mac-production:uninstall` | 초보자도 직접 plist를 수정하지 않고 운영할 수 있다. |
| local-only 품질 게이트 | `HOMECOOK_PRODUCTION_EXPOSURE=local-only` | localhost 앱 주소는 이 명시적 모드에서만 허용하며 localhost Supabase와 QA/local auth는 계속 차단한다. |
| 선택 포트 | `3100` | 기존 개발 서버가 `3000`을 사용 중이라 충돌을 피했다. |

실제 검증 중 HOME의 `GET /api/v1/recipes?sort=view_count`가 PostgreSQL `42703`으로 실패했다. 기존 품질 게이트가 이 스키마 불일치를 놓치던 문제도 수정해, 이제 같은 상태에서는 `PRODUCTION_DATA_SCAN_FAILED`로 설치 전 차단된다.

현재 Mac에서는 NVM의 Node와 Corepack을 사용한다. `corepack pnpm`은 `package.json`에 고정된 `pnpm@10.32.1`을 실행하므로 Codex 런타임의 다른 pnpm 버전과 섞이지 않는다.

구현·검증은 사용자 작업을 보호하기 위해 `/Users/cwj/01_vibe_coding/homecook-mac-production` 전용 worktree에서 수행했다. 아래 `--source-env /Users/cwj/01_vibe_coding/homecook/.env.local`은 기존 개발 환경 값을 읽기 위한 의도된 원본 경로이며, 값은 출력하거나 Git에 추가하지 않는다.

## 중요한 구분

| 구분 | 명령 또는 예시 | 용도 | 주의 |
| --- | --- | --- | --- |
| 개발 서버 | `pnpm dev` | 코드를 고치면서 바로 확인 | production 성능/보안 조건과 다르다. |
| production build | `pnpm build` | 실제 운영 전에 앱을 컴파일 | 여기서 실패하면 운영 시작 금지. |
| production server | `pnpm start` | build 결과물을 실제 실행 | 먼저 `pnpm build`가 필요하다. |
| local-only 운영 | `-H 127.0.0.1` | 현재 Mac에서만 접속 | 외부 사용자는 못 들어온다. |
| LAN 운영 | `-H 0.0.0.0` + Mac 내부 IP | 같은 와이파이/사내망에서 접속 | 방화벽과 IP 노출 범위를 확인해야 한다. |
| public internet 운영 | 도메인 + HTTPS + reverse proxy/tunnel | 외부 사용자가 접속 | 현재 계획에서는 후속 단계로만 둔다. |

## production 환경 변수 기준

production에서는 `.env.local`을 그대로 복사하지 않는다. 개발용 flag와 secret이 섞여 있을 수 있으므로 `.env.example`과 현재 운영 목적을 기준으로 `.env.production.local`을 따로 만든다.

### 최소 필수 후보

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_ENABLED_AUTH_PROVIDERS=
```

### 기능별 선택 후보

YouTube import를 production에서도 열 때만 아래 값을 준비한다.

```bash
HOMECOOK_ENABLE_YOUTUBE_IMPORT=1
NEXT_PUBLIC_HOMECOOK_ENABLE_YOUTUBE_IMPORT=1
YOUTUBE_API_KEY=
YOUTUBE_RECIPE_LLM_ENABLED=
YOUTUBE_RECIPE_LLM_PROVIDER=
GEMINI_API_KEY=
GEMINI_API_KEY_FREE=
GEMINI_API_KEY_PAID=
GEMINI_API_KEYS=
YOUTUBE_RECIPE_VISUAL_RECIPE_ENABLED=
YOUTUBE_RECIPE_VISUAL_QUANTITY_ENABLED=
```

현재 Mac 전용 비공개 운영에는 아래 값을 사용한다.

```bash
HOMECOOK_PRODUCTION_EXPOSURE=local-only
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3100
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3100
```

외부 공공 데이터 수집을 production에서 직접 실행할 때만 아래 값을 준비한다.

```bash
DATA_GO_KR_API_KEY=
KOREANFOOD_RDA_API_KEY=
```

### production에서 켜면 안 되는 값

아래 값은 테스트/개발 편의 기능이다. production-like 환경에서는 켜지면 안 된다.

```bash
HOMECOOK_ENABLE_QA_FIXTURES=1
NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES=1
HOMECOOK_ENABLE_LOCAL_DEV_AUTH=1
NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_DEV_AUTH=1
NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_GOOGLE_OAUTH=1
HOMECOOK_YOUTUBE_FIXTURE_PROVIDER=fixture
```

### 주소 값 선택 규칙

| 운영 모드 | `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SITE_URL` 예시 | 판단 |
| --- | --- | --- |
| 현재 Mac에서만 확인 | `http://127.0.0.1:3100` | 이번에 구현한 local-only 운영 주소다. Mac 밖에서는 접속할 수 없다. |
| 같은 네트워크에서 확인 | `http://192.168.0.25:3000` | LAN 내부 테스트 후보. Mac IP가 바뀌면 다시 수정해야 한다. |
| 실제 사용자 공개 | `https://your-domain.example` | 권장 production 후보. HTTPS, OAuth callback, legal/trust 점검이 필요하다. |

`app/layout.tsx`는 `NEXT_PUBLIC_SITE_URL`이 없으면 `https://homecook-flame.vercel.app`를 fallback으로 사용한다. 현재 Mac을 기준 주소로 쓰려면 `NEXT_PUBLIC_SITE_URL`을 명시한다.

## 실행 계획

### 0단계: 공개 범위 결정

이번 구현은 `local-only`로 고정한다. `3000`은 기존 개발 서버가 사용 중이므로 `3100`을 쓴다.

```bash
corepack pnpm start -- -H 127.0.0.1 -p 3100
```

운영 스크립트는 안전을 위해 `127.0.0.1` 이외의 host를 거부한다. LAN이나 외부 사용자에게 공개하려면 도메인/HTTPS/reverse proxy 또는 tunnel 계획을 별도 문서로 잠근다.

### 1단계: production 환경 파일 만들기

아래 명령은 source env에서 production 허용 키만 골라 파일을 만들고 권한도 자동으로 좁힌다. 기존 파일을 교체할 때만 `--force`를 붙인다.

```bash
corepack pnpm mac-production:prepare -- \
  --source-env /Users/cwj/01_vibe_coding/homecook/.env.local \
  --port 3100
```

주의: `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용 master key에 가깝다. `NEXT_PUBLIC_` 접두사를 붙이면 브라우저로 노출될 수 있으므로 절대 붙이지 않는다.

### 2단계: 설치와 기본 검증

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test:product
```

실패하면 production 실행 전에 고친다.

### 3단계: production 품질 게이트

production처럼 검사하려면 아래처럼 실행한다.

```bash
NODE_ENV=production HOMECOOK_VALIDATE_PRODUCTION_DATA=1 corepack pnpm validate:production-data-quality -- --require-db
```

기대 결과:

```text
Production data quality gate passed.
```

실패 예시:

| 실패 코드 | 뜻 | 조치 |
| --- | --- | --- |
| `PRODUCTION_QA_FLAG_ENABLED` | QA fixture 또는 local auth flag가 켜짐 | `.env.production.local`에서 제거한다. |
| `PRODUCTION_LOCAL_SUPABASE_URL` | production에서 Supabase URL이 localhost | 운영 Supabase URL로 바꾼다. |
| `PRODUCTION_LOCAL_APP_URL` | production 후보 주소가 localhost | LAN IP 또는 도메인으로 바꾼다. |
| `FORBIDDEN_PRODUCTION_DATA_PATTERN` | DB에 fixture/mock/demo/test 데이터 흔적 | 데이터를 정리하거나 운영 DB를 분리한다. |

### 4단계: build

```bash
corepack pnpm build
```

`next build`가 실패하면 `pnpm start`를 실행하지 않는다.

### 5단계: 수동으로 production server 실행

local-only:

```bash
corepack pnpm start -- -H 127.0.0.1 -p 3100
lsof -nP -iTCP:3100 -sTCP:LISTEN
```

### 6단계: 접속 확인

```bash
curl -I http://127.0.0.1:3100
curl -I http://127.0.0.1:3100 | grep -Ei 'content-security-policy|x-frame-options|x-content-type-options|referrer-policy|permissions-policy'
```

브라우저에서 최소로 확인할 화면:

1. HOME 첫 화면
2. 레시피 상세
3. 로그인 버튼
4. 플래너
5. 장보기
6. 마이페이지
7. `/privacy`
8. `/terms`

### 7단계: launchd로 상시 실행

수동 실행이 안정적이면 저장소 스크립트로 등록한다. plist는 직접 작성하지 않는다. 현재 Node 절대 경로, 로그 경로, 자동 재시작 정책이 자동으로 들어간다.

```bash
corepack pnpm mac-production:install -- \
  --node-bin /Users/cwj/.nvm/versions/node/v22.19.0/bin/node \
  --port 3100
```

상태 확인:

```bash
corepack pnpm mac-production:status
tail -f ~/.homecook/logs/homecook-production.err.log
```

재시작:

```bash
corepack pnpm mac-production:restart
```

등록 해제:

```bash
corepack pnpm mac-production:uninstall
```

### 8단계: Mac 운영 조건 확인

현재 Mac을 production 서버처럼 쓰려면 아래 조건이 필요하다.

| 조건 | 이유 | 확인 방법 |
| --- | --- | --- |
| Mac이 잠자기 상태로 들어가지 않음 | 잠들면 서버도 멈춘다. | 시스템 설정의 전원/잠자기 설정 확인 |
| 안정적인 네트워크 | IP가 바뀌면 접속 주소가 바뀐다. | 공유기 DHCP reservation 또는 고정 IP |
| 충분한 디스크 공간 | `.next`, 로그, cache가 쌓인다. | `df -h` |
| 방화벽 정책 | LAN/public 노출 범위 제어 | macOS Firewall, router 설정 |
| secret 파일 보호 | service role key 노출 방지 | `.env.production.local`이 Git ignored이고 `chmod 600`인지 확인 |

## 검증 명령 모음

작은 검증:

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test:product
corepack pnpm build
```

운영 전 권장 검증:

```bash
corepack pnpm verify:frontend:pr
NODE_ENV=production HOMECOOK_VALIDATE_PRODUCTION_DATA=1 corepack pnpm validate:production-data-quality -- --require-db
```

서버 실행 후 smoke:

```bash
curl -I http://127.0.0.1:3100
curl -sS http://127.0.0.1:3100 >/tmp/homecook-home.html
```

보안 헤더:

```bash
curl -I http://127.0.0.1:3100 | grep -Ei 'content-security-policy|strict-transport-security|x-frame-options|x-content-type-options|referrer-policy|permissions-policy'
```

## 롤백 계획

1. `corepack pnpm mac-production:uninstall`로 현재 launchd job을 멈춘다.
2. 마지막으로 성공했던 Git commit 또는 branch로 돌아간다.
3. `pnpm install --frozen-lockfile`을 다시 실행한다.
4. `pnpm build`를 다시 실행한다.
5. `launchctl kickstart -k`로 재시작한다.

중지 명령:

```bash
corepack pnpm mac-production:uninstall
```

재시작 명령:

```bash
corepack pnpm mac-production:restart
```

## 위험과 완화책

| 위험 | 왜 문제인가 | 완화책 |
| --- | --- | --- |
| Mac sleep | 서버가 멈춘다. | 운영 중 잠자기 방지, 전원 연결, 필요 시 dedicated machine 사용 |
| `localhost` URL 사용 | 다른 사용자가 접속할 수 없고 OAuth callback이 꼬일 수 있다. | LAN IP 또는 HTTPS 도메인으로 명시 |
| QA fixture flag 노출 | 가짜 데이터/테스트 UI가 운영에 보일 수 있다. | `validate:production-data-quality` 실행 |
| service role key 노출 | DB 권한 우회 위험 | repo에 저장 금지, `.env.production.local` 권한 제한 |
| HTTP public 공개 | 로그인/session/개인정보 보호에 취약 | public internet은 HTTPS 전까지 열지 않음 |
| 로그 방치 | 장애 원인 추적이 어렵고 디스크가 찰 수 있다. | 로그 위치 고정, 주기적 정리 |

## 완료 기준

- [x] `.env.production.local`이 production 전용 값으로 준비됨
- [x] production 금지 flag가 없음
- [x] `corepack pnpm install --frozen-lockfile` 통과
- [x] `corepack pnpm lint` 통과
- [x] `corepack pnpm typecheck` 통과
- [x] `corepack pnpm test:product` 통과
- [x] `corepack pnpm build` 통과
- [ ] `corepack pnpm validate:production-data-quality -- --require-db` 통과: `recipes.visibility` 원격 migration 필요
- [x] `corepack pnpm start -- -H 127.0.0.1 -p 3100` 수동 실행 성공
- [x] `curl -I http://127.0.0.1:3100` 응답 확인
- [x] 보안 헤더 확인
- [ ] 핵심 화면 브라우저 smoke 통과: 렌더링은 정상이나 HOME recipe API가 DB schema mismatch로 실패
- [x] launchd 설치·상태·재시작·등록 해제 실제 검증
- [ ] 재부팅/로그인 후 자동 실행 확인: migration 적용 후 재설치하여 확인
- [x] 중지/재시작/롤백 명령 확인

## 다음 의사결정

1. Supabase CLI를 연결하고 원격 migration 목록을 확인한 뒤, 공식 순서대로 pending migration을 적용한다.
2. production 품질 게이트와 브라우저 smoke가 모두 통과하면 `mac-production:install`을 다시 실행한다.
3. 현재 구현은 `local-only`로 유지한다. LAN/public으로 넓힐 때는 이 스크립트의 host 제한을 임의로 풀지 않는다.
4. public internet이면 도메인, HTTPS, OAuth callback, 개인정보처리방침/이용약관, 보안 헤더, logging 정책을 별도 launch plan으로 잠근다.
