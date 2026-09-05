# Marketing Validation Preview Operations Runbook

상태: integrated tooling / no deployment authority / no server mutation

이 문서는 Homecook의 랜딩페이지 marketing preview를 운영 환경과 분리된 별도 namespace에서 준비할 때의 preflight 기준이다. 이 도구가 `master`에 포함되어도 범위는 preview contract 점검과 hand-off 체크리스트뿐이며, CWJ 서버 Mac의 Docker, launchd, Caddy, DB, 도메인, 운영 compose를 실제로 바꾸지 않는다.

## 목적

- `app.mumeok.kr` 운영 경로와 분리된 preview 경로만 허용한다.
- Supabase API/DB/Studio/pgMeta가 외부 interface에 열리지 않도록 fail-closed 한다.
- lead capture는 campaign, Turnstile, edge evidence가 모두 준비될 때만 열린다.
- preflight pass를 곧바로 배포 승인으로 해석하지 않는다.

## Preflight Command

preview 환경변수를 셸에 로드한 뒤 다음 명령만 실행한다.

```bash
pnpm marketing:preview:preflight
```

초안은 `docs/engineering/marketing-validation-preview.env.example`을 복사해 실제 키를 넣되, 실제 값이 든 파일은 커밋하지 않는다. 성공 조건은 JSON `ready: true`, `blockers: []`다. 명령은 현재 Mac의 listening socket을 `lsof`로 읽어 preview 앱 이외의 Supabase 계열 public listener도 함께 검사한다. 실패 시 stderr는 항상 `marketing-validation-preview-preflight: FAIL (redacted)`만 출력하고 secret 값은 내보내지 않는다. JSON의 `checks.listener_inventory`에는 허용/금지/무관 외부 listener의 `label`, `host`, `port`가 함께 담기므로, 어떤 프로세스가 preview boundary를 깨고 있는지 바로 확인할 수 있다.

## Required Environment Contract

helper 기준 preview 전용 키:

- `HOMECOOK_MARKETING_PREVIEW_NAMESPACE`
- `HOMECOOK_MARKETING_PREVIEW_ORIGIN`
- `HOMECOOK_PREVIEW_APP_PORT`
- `HOMECOOK_PREVIEW_SUPABASE_API_PORT`
- `HOMECOOK_PREVIEW_SUPABASE_DB_PORT`
- `HOMECOOK_PREVIEW_SUPABASE_STUDIO_PORT`
- `HOMECOOK_PREVIEW_COMPOSE_PROJECT`
- `HOMECOOK_PREVIEW_DB_VOLUME`
- `HOMECOOK_PREVIEW_STORAGE_VOLUME`

실제 Homecook 운영 키:

- `HOMECOOK_AUTH_AUTHORITY=local`
- `HOMECOOK_DATA_AUTHORITY=local`
- `DATA_SUPABASE_URL`
- `DATA_SUPABASE_PUBLISHABLE_KEY`
- `DATA_SUPABASE_SECRET_KEY`
- `ALLOWED_MARKETING_ORIGINS`
- `MARKETING_PAID_ATTRIBUTION_ORIGINS`
- `MARKETING_CAMPAIGN_END_AT`
- `MARKETING_LEAD_PROTECTION_READY`
- `MARKETING_TURNSTILE_ACTION=marketing_validation_lead_submit`
- `MARKETING_TURNSTILE_ALLOWED_HOSTNAMES`
- `NEXT_PUBLIC_MARKETING_TURNSTILE_SITE_KEY`
- `MARKETING_TURNSTILE_SECRET`
- `MARKETING_EDGE_RATE_LIMIT_RULE_EVIDENCE` 또는 `MARKETING_EDGE_RULE_EVIDENCE` (`sha256:` + 검토된 rule evidence의 64자리 소문자 SHA-256)

지원 alias:

- `MARKETING_PREVIEW_PUBLIC_ORIGIN` -> `HOMECOOK_MARKETING_PREVIEW_ORIGIN`
- `FULL_LOCAL_COMPOSE_PROJECT_NAME` -> `HOMECOOK_PREVIEW_COMPOSE_PROJECT`
- `FULL_LOCAL_POSTGRES_VOLUME_NAME` -> `HOMECOOK_PREVIEW_DB_VOLUME`
- `FULL_LOCAL_STORAGE_VOLUME_NAME` -> `HOMECOOK_PREVIEW_STORAGE_VOLUME`

`HOMECOOK_PREVIEW_SUPABASE_API_PORT`가 비어 있으면 `DATA_SUPABASE_URL`의 port를 사용한다. 나머지 preview port는 명시적으로 넣어야 한다.

## Fail-Closed Rules

preflight는 아래 중 하나라도 걸리면 실패한다.

- preview origin이 없거나 `https://app.mumeok.kr` 또는 `https://auth.mumeok.kr`를 가리킴
- `ALLOWED_MARKETING_ORIGINS` 또는 `MARKETING_PAID_ATTRIBUTION_ORIGINS`에 production origin이 포함됨
- `DATA_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_AUTH_SUPABASE_URL`, `LOCAL_SUPABASE_INTERNAL_URL` 중 하나라도 loopback origin이 아님
- `HOMECOOK_AUTH_AUTHORITY` 또는 `HOMECOOK_DATA_AUTHORITY`가 `local`이 아님
- preview compose project, DB volume, storage volume이 운영 이름을 재사용함
- preview app/API/DB/Studio port가 운영 예약 포트와 겹치거나 서로 중복됨
- lead gate가 켜졌는데 campaign 종료 시각, Turnstile action, hostname, secret, edge evidence 중 하나라도 빠짐
- Turnstile hostname에 preview hostname이 없거나 production hostname이 포함됨
- injectable listener inventory에서 외부 listener가 preview Next 공개 port 이외로 열려 있음
- injectable listener inventory에서 `supabase`, `postgrest`, `postgres`, `studio`, `pgmeta`, `kong`, `api-gateway`, `auth` 계열이 외부 listener로 발견됨

`MARKETING_TURNSTILE_ACTION`은 서버 동작을 바꾸는 값이 아니라, 클라이언트 위젯의 `action`과 서버 상수 `marketing_validation_lead_submit`이 같은지 preflight에서 선언·확인하는 값이다. secret은 서버에만 두고 `NEXT_PUBLIC_MARKETING_TURNSTILE_SITE_KEY`만 브라우저 번들에 노출한다.

운영 예약 충돌 기준:

- production origin: `https://app.mumeok.kr`, `https://auth.mumeok.kr`
- compose project: `homecook-full-local-isolated`
- volume: `homecook-full-local-postgres`, `homecook-full-local-storage`
- reserved ports: `3000`, `3100`, `54320`, `54321`, `54322`, `54323`, `54324`, `54325`, `54326`, `54481`, `54482`

## Preview Namespace Example

예시는 다음처럼 잡는다.

- namespace: `marketing-validation-preview`
- public origin: `https://beta-preview.mumeok.kr`
- app port: `3301`
- Supabase API/DB/Studio ports: `55431`, `55432`, `55433`
- compose project: `marketing-validation-preview`
- DB/storage volume: `marketing-validation-preview-postgres`, `marketing-validation-preview-storage`

원칙은 “운영 이름과 한 글자도 겹치지 않게”가 아니라 “운영 namespace와 충돌하지 않게”다. `prod`, `production`, `master`, `cwj` 같은 이름 조각은 preview namespace에 쓰지 않는다.

## Manual Handoff Checks

아래 항목은 이 문서 범위에서 자동 실행하지 않는다. 실제 서버 적용 직전에 별도 task에서 읽기 전용으로만 확인한다.

1. `lsof -nP -iTCP -sTCP:LISTEN`
2. `docker ps --format '{{.Names}} {{.Ports}} {{.Labels}}'`
3. `docker inspect <preview containers>`
4. 외부 기기에서 preview public origin 접속
5. 외부 기기에서 Supabase API/DB/Studio/pgMeta 직접 접근 negative probe
6. 외부 HTTPS 경로에서 생성한 `mumeok_validation_session` 쿠키에 `HttpOnly; SameSite=Lax; Secure`가 모두 있는지 확인

preview가 뜬 뒤 4~6번의 HTTP 경계 검사는 다음 명령으로 묶어서 실행한다. 이 명령은 익명 `view` 행 하나만 만들고 이메일이나 Turnstile token은 보내지 않는다.

```bash
pnpm marketing:preview:smoke --origin https://beta-preview.mumeok.kr
```

수동 판정 기준:

- `0.0.0.0` 또는 `::` listener는 preview Next 공개 port만 예외다.
- Supabase API, PostgREST, Kong 내부 gateway, PostgreSQL, Studio, pgMeta는 모두 loopback 또는 private boundary에만 있어야 한다.
- preview compose project, network, volume은 운영 namespace와 완전히 달라야 한다.
- 외부 기기에서 preview 앱은 열려도 Supabase API/DB/Studio/pgMeta direct path는 `403`, `404`, 또는 connection refused여야 한다.
- 외부 HTTPS 경로가 내부 HTTP 앱으로 proxy되더라도 Next가 인식하는 request URL은 HTTPS여야 하며 session cookie에는 `Secure`가 있어야 한다.

## Suggested Execution Order

1. 현재 Mac의 별도 worktree에서 preview env 초안을 만든다.
2. `pnpm marketing:preview:preflight`로 contract와 listener 검사를 통과시킨다.
3. preflight 결과를 기준으로 누락 env, namespace, port 충돌을 먼저 정리한다.
4. 운영 리허설 종료 후 별도 hand-off task에서 `docker ps/inspect`와 `pnpm marketing:preview:smoke --origin <preview-origin>`을 실행한다.
5. 그 결과까지 읽은 뒤에만 CWJ 서버 preview start 작업으로 넘어간다.

## DB 확인·분석·내보내기

이 도구의 DB 검증은 disposable isolated Supabase에서 전체 migration을 처음부터 두 번 재생하고, v2 fixture를 transaction 안에서 넣은 뒤 rollback하는 방식이다. 운영 또는 기존 full-local DB에는 쓰지 않는다.

```bash
HOMECOOK_ISOLATED_RUNTIME_INTEGRATION_TEST=tests/marketing-validation-analysis-postgres.integration.test.ts \
  pnpm verify:local-supabase-runtime:isolated
```

preview DB가 별도 namespace에서 준비된 뒤에는 campaign 구간만 정해 집계한다. 결과 SQL은 이메일과 raw `quiz_answers`를 출력하지 않고 A/B/C/D/default 및 q1~q4 enum 집계만 출력한다.

```bash
psql "$HOMECOOK_ISOLATED_RUNTIME_DATABASE_URL" \
  --set=campaign_start=2026-09-04T00:00:00Z \
  --set=campaign_end=2026-10-01T00:00:00Z \
  --file=docs/marketing/demand-validation-analysis.sql
```

v2 accepted lead만 0600 CSV로 내보내고 duplicate는 stdout의 숫자로만 확인한다. 결과 파일은 gitignored `.artifacts/marketing-validation` 아래만 허용된다.

```bash
pnpm marketing:leads:export \
  --campaign-key weekly_nutrition_2026 \
  --creative-key mumeok_funnel_prototype_v2 \
  --consent-version marketing-demand-validation-v2 \
  --output .artifacts/marketing-validation/v2-accepted-leads.csv
```

보유기간 삭제는 기존 `marketing:retention:purge`의 dry-run 증거를 먼저 읽고, 별도 승인·환경변수·`--confirm`이 모두 있을 때만 실행한다. preview 준비 단계에서는 실제 삭제를 실행하지 않는다.

## 현재 안전하게 끝낸 범위와 hand-off blocker

- 완료: v2 schema 전체 migration의 disposable replay, 광고별 funnel 및 4문항 분석, accepted/duplicate 분리 export, request Origin과 Turnstile hostname의 exact binding, preview env/listener preflight, 외부 HTTPS cookie/direct-service smoke 도구.
- hand-off 필요: CWJ 서버의 실제 preview namespace·port·volume 생성, 실제 Cloudflare Turnstile site key/secret, edge rate-limit rule, campaign 종료일·보유기간 최종값, 개인정보 문구 승인, 외부 HTTPS smoke.
- 이 hand-off가 끝나기 전 `MARKETING_LEAD_PROTECTION_READY`는 `0`을 유지한다.

## Non-Goals

- preview 검사 통과만으로 `master` 또는 production release 승인 처리
- `app.mumeok.kr` 배포
- CWJ 서버 Docker/launchd/Caddy mutation
- 운영 DB migration apply
- production secret 출력 또는 복사
- preflight pass만으로 Stage 독립 승인 처리
