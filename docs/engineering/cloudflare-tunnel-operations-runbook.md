# Cloudflare Tunnel 관측 운영 Runbook

## 목적과 범위

이 문서는 `docs/engineering/cloudflare-icn-tunnel-stability-plan.md` Phase 4의 provider-neutral 관측 계약을 설명한다. 저장소가 소유하는 범위는 다음뿐이다.

- Mac 내부 connector metrics/log의 read-only 판정
- 외부 public/authenticated probe 결과 event의 24시간 집계
- local/external event를 같은 allowlist incident timeline으로 합성
- 기존 full-local session lifecycle evidence의 선택적 요약 필드

Cloudflare dashboard/API/DNS 변경, tunnel·launchd install/reload/restart, binary/protocol 변경, production probe 실행은 이 runbook의 자동화 범위가 아니다. 제품 API·DB·화면 계약도 바꾸지 않는다.

## Local connector health

`scripts/cloudflare-tunnel-health.mjs`는 metrics와 tunnel log를 읽기만 한다. metrics endpoint는 다음 조건을 모두 만족해야 한다.

- scheme: `http`
- host: 명시적 `127.0.0.1`
- port: `20241`~`20245` allowlist
- path: `/metrics`

`0.0.0.0`, `[::]`, `localhost`, hostname, HTTPS, allowlist 밖 port 또는 다른 path는 모두 fail-closed한다. CLI는 argument를 받지 않으며 기본값을 바꿀 때만 아래 non-secret 환경변수를 사용한다.

```bash
CLOUDFLARE_TUNNEL_METRICS_ENDPOINT=http://127.0.0.1:20241/metrics \
CLOUDFLARE_TUNNEL_LOG_PATH=/absolute/private/cloudflared.log \
pnpm cloudflare:tunnel-health
```

출력은 raw metrics/log를 포함하지 않는다. Phase 0의 기존 log parser와 metrics parser를 재사용해 다음 신호를 구분한다.

- critical: healthy connection `0`
- warning: healthy connection `1~3` 상태가 `60초 초과`
- warning: reconnect p95 `15초 초과`
- diagnostic: 4개 connection simultaneous disconnect

## Provider-neutral external probe contract

고정 계약은 다음 명령으로 확인한다.

```bash
node scripts/cloudflare-external-probe.mjs contract
```

| Probe ID | Audience | 요청 | 기대 결과 | Cadence | Timeout | 24시간 예정 표본 |
| --- | --- | --- | --- | ---: | ---: | ---: |
| `public_app_root` | public | `GET https://app.mumeok.kr/` | `200` | 60초 | 10초 | 1,440 |
| `public_pantry` | public | `GET https://app.mumeok.kr/pantry` | `200` | 60초 | 10초 | 1,440 |
| `public_auth_health` | public | `HEAD https://auth.mumeok.kr/auth/v1/health` | `401` | 60초 | 10초 | 1,440 |
| `authenticated_pantry_read` | authenticated | 전용 test account pantry read | `200` + 정상 `{ success, data, error }` wrapper | 5분 | 10초 | 288 |

authenticated credential/session은 provider secret store 안에서만 사용한다. 저장소 input schema, CLI argument, 결과 event, stdout/stderr, evidence에는 credential/session/cookie/token/header/body를 넣지 않는다. 외부 monitor는 인증을 수행한 뒤 아래 결과 event만 전달한다.

```json
{
  "probe_id": "authenticated_pantry_read",
  "scheduled_at": "2026-08-10T00:00:00.000Z",
  "observed_at": "2026-08-10T00:00:01.000Z",
  "outcome": "response",
  "http_status": 200,
  "ttfb_ms": 180,
  "colo": "ICN",
  "network_label": "wifi-01",
  "wrapper_valid": true
}
```

허용 event key는 `probe_id`, `scheduled_at`, `observed_at`, `outcome`, `http_status`, `ttfb_ms`, `colo`, `network_label`, `wrapper_valid`뿐이다. 추가 key가 있으면 해당 slot은 invalid failure로 처리하고 값은 출력하지 않는다. public event에는 `wrapper_valid`를 보내지 않는다.

익명 network label은 `wifi-*`, `lte-*`, `5g-*` 형식만 허용한다. 이 label은 한국 probe vantage를 익명으로 구분하기 위한 값이며 실제 ISP명, SSID, IP를 넣지 않는다.

## 24시간 집계와 독립 분모

집계 입력은 정확히 24시간 window와 result event 배열이다. 파일 경로·credential 같은 값을 CLI argument로 전달하지 않고 stdin만 사용한다.

```bash
pnpm aggregate:cloudflare-external-probe < /repo-outside/private/probe-events.json
```

- public 예정 분모: endpoint별 1,440, 전체 4,320
- authenticated 예정 분모: 288
- completeness: 각 audience에서 `>=99%`
- missing, timeout 10초를 넘긴 late, schema invalid는 모두 failure 분모에 포함
- public/authenticated 분모와 gate는 독립
- authenticated failure는 public failure를 숨기지 않음
- public paging readiness는 authenticated success를 요구하지 않음

출력 incident timeline은 fixed status/error/colo/network-label projection만 가진다. raw status 문자열, provider error, IP, header/body, URL/path, token/cookie/JWT/email/UUID는 직렬화하지 않는다. Colo는 `ICN`, `LAX`, `OTHER`, `MISSING` 중 하나로 축약한다.

## Alert 판정

- critical: local connector `0`
- critical: 같은 public endpoint에서 timeout 또는 Cloudflare `52x` 연속 2회
- warning: connector `<4`가 60초 초과
- warning: reconnect p95 `>15s`
- warning: 한국 `public_pantry` TTFB p95 `>500ms`
- diagnostic: 한국 익명 network label 2개 이상에서 LAX가 각 10표본 연속 관측

LAX diagnostic은 paging 조건이 아니다. 초기 threshold는 24시간 자료 뒤 별도 승인 범위에서 조정한다.

## Incident timeline과 lifecycle evidence

`composeIncidentTimeline()`은 local connector event와 external result event를 시간순으로 합친다. `summarizeCloudflareMonitoring()`은 그 timeline을 counts-only 요약으로 줄인다.

기존 `capture-full-local-session-lifecycle-evidence.mjs`의 4개 phase와 schema version 1은 유지한다. `cloudflare_monitoring`은 호출자가 안전한 요약을 명시적으로 제공할 때만 생기는 optional root field다. 기존 field를 바꾸거나 legacy JSON consumer에 필수값을 추가하지 않는다.

## Manual Only 자산과 후속 live gate

다음 항목은 모두 repo 밖 Manual Only다.

- 외부 monitor provider 계정과 monitor 생성
- test-account credential/session 저장 및 rotation
- notification destination, escalation policy, webhook와 secret
- 실제 provider schedule 활성화
- 실제 tunnel process 종료/Mac egress 차단 fault injection
- 실제 notification delivery 확인과 recovery timestamp evidence

Phase 4 코드와 fixture 통과만으로 “실제 통지가 동작한다”거나 “24시간 안정화가 완료됐다”고 주장하지 않는다. 실제 notification test와 24시간 collection은 후속 live gate이며, 이번 구현 PR에서는 `N/A / pending independent live verification`으로 기록한다.

## 저장소 검증

```bash
pnpm verify:cloudflare-tunnel-health
pnpm verify:cloudflare-external-probe
pnpm verify:cloudflare-tunnel-diagnostics
pnpm verify:full-local-session-lifecycle-evidence
```

테스트 fixture는 token/cookie/JWT/email/UUID/full IP/path/header/body marker가 output/stdout/stderr에 0건임을 고정한다. 새 dependency는 사용하지 않는다.
