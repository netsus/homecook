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

`0.0.0.0`, `[::]`, `localhost`, hostname, HTTPS, allowlist 밖 port 또는 다른 path는 모두 fail-closed한다. HTTP redirect도 따르지 않고 최종 URL이 요청한 loopback URL과 정확히 같아야 한다. metrics body는 스트리밍 중 1 MiB를 넘는 즉시 중단한다.

Tunnel log는 고정 allowlist인 `/Users/cwj/.homecook/logs/cloudflare-tunnel.err.log`만 읽는다. canonical path, regular-file identity, `O_NOFOLLOW` descriptor를 검증하므로 임의 absolute path, symlink, 교체된 파일은 거부한다. CLI는 argument를 받지 않으며 metrics endpoint만 아래 non-secret 환경변수로 allowlist 안에서 선택할 수 있다.

```bash
CLOUDFLARE_TUNNEL_METRICS_ENDPOINT=http://127.0.0.1:20241/metrics \
pnpm cloudflare:tunnel-health
```

출력은 raw metrics/log를 포함하지 않는다. Phase 0의 기존 log parser와 metrics parser를 재사용해 다음 신호를 구분한다.

- critical: healthy connection `0`
- warning: healthy connection `1~3` 상태가 `60초 초과`
- warning: reconnect p95 `15초 초과`
- diagnostic: 4개 connection simultaneous disconnect

metrics는 `0~4` connection 범위, connection ID 개수 일치, healthy 상태의 location 표본을 함께 검증한다. build와 HA metric 이름이 나타난 모든 Prometheus 표본을 세며 각각 정확히 하나의 canonical 표본만 허용한다. 정상 unlabeled/labeled 표본은 허용하지만 label name, quoted value와 escape, comma, brace 문법 및 duplicate label을 검증한다. server-location도 같은 parser로 labelset 전체를 검증하며 `connection_id`와 `edge_location`을 각각 정확히 한 번 요구한다. 소수·0·timestamp가 붙은 비canonical 표본, malformed/duplicate/conflict, connection ID/location 중복·상충은 모두 거부한다. build/version과 connection count만 남은 잘린 응답은 healthy가 아니다. Recovered outage는 `recovered_at`, simultaneous incident는 `disconnect_completed_at` 기준으로 capture 시각 직전 24시간에 포함하고, cutoff 전부터 계속 열린 outage는 유지한다. capture 이후의 recovery는 당시 open outage로 취급하며, 미래 incident timestamp는 집계하지 않는다.

healthy connection이 `1~3`으로 내려간 뒤 `60초 이하`인 유예 구간은 canonical local state `degraded`로 출력하되 warning signal/incident를 아직 만들지 않고 CLI exit `1`로 표현한다. `60초 초과`부터 state `warning`과 `connector_below_4_over_60s` signal/incident가 생긴다. connector `0`만 critical이다.

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

public event의 exact key는 `probe_id`, `scheduled_at`, `observed_at`, `outcome`, `http_status`, `ttfb_ms`, `colo`, `network_label`이고 authenticated event만 `wrapper_valid`를 추가한다. 추가·누락 key는 해당 slot의 invalid failure로 처리하고 값은 출력하지 않는다. audience별 exact key, 익명 network label, `observed_at`이 집계 window 안인지 먼저 검증한 뒤 outcome을 판정한다. 이 검증을 통과한 명시적 timeout은 10초를 초과해 관측돼도 late보다 timeout이 우선한다.

익명 network label은 `wifi-*`, `lte-*`, `5g-*` 형식만 허용한다. 이 label은 한국 probe vantage를 익명으로 구분하기 위한 값이며 실제 ISP명, SSID, IP를 넣지 않는다.

## 24시간 집계와 독립 분모

집계 입력은 정확히 24시간 window와 result event 배열이다. Top-level key는 `window_start`, `window_end`, `events`만 허용하며 추가·누락·잘못된 타입은 값이 출력되지 않는 fail-closed 오류다. 파일 경로·credential 같은 값을 CLI argument로 전달하지 않고 stdin만 사용한다.

```bash
pnpm aggregate:cloudflare-external-probe < /repo-outside/private/probe-events.json
```

- public 예정 분모: endpoint별 1,440, 전체 4,320
- authenticated 예정 분모: 288
- completeness: 각 public endpoint와 authenticated endpoint에서 각각 `>=99%`
- missing, timeout 10초를 넘긴 late, schema invalid는 모두 failure 분모에 포함
- completeness pass와 response quality pass는 별도 필드다. 예를 들어 public endpoint의 `1/1,440` missing은 failure 수에는 남지만 endpoint completeness는 PASS다.
- public/authenticated 분모와 gate는 독립
- authenticated failure는 public failure를 숨기지 않음
- public paging readiness는 authenticated success를 요구하지 않지만 public endpoint별 completeness와 public response quality를 모두 포함한 public `gate_pass`를 요구함
- unknown/malformed event, credential 같은 추가 key, duplicate 등 rejected event가 하나라도 있으면 모든 gate는 fail-closed한다.

`aggregate` CLI의 exit code와 `public_paging_ready`는 public gate만 표현한다. `0`/`true`는 public endpoint별 completeness와 public response quality가 모두 통과했다는 뜻이며 authenticated 결과의 성공을 뜻하지 않는다. authenticated `gate_pass`, completeness, failure는 같은 JSON의 독립 필드로 확인한다. 따라서 auth-only failure는 CLI의 public 성공을 실패로 바꾸지 않지만 숨겨지지도 않는다. rejected event는 audience와 무관하게 exit `1`이다.

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

`composeIncidentTimeline()`은 local connector event와 external result event를 시간순으로 합친다. 단일 public timeout과 authenticated timeout은 warning이며, 같은 public endpoint의 timeout/52x 두 번째 연속 표본에서만 critical이 된다. pantry TTFB p95와 LAX 지속 진단, local `<4 >60s`, reconnect 경보도 같은 timeline에 고정된 allowlist status로 들어간다. `summarizeCloudflareMonitoring()`은 그 timeline의 severity count에서 status를 한 번만 유도한다.

기존 `capture-full-local-session-lifecycle-evidence.mjs`의 4개 phase와 schema version 1은 유지한다. 실제 capture 경로는 credential/provider 설정 없이 고정 local health CLI를 read-only로 실행하고, 공통 exact local-health validator가 root/nested key와 state/signal/incident 불변식을 모두 확인한 JSON만 redacted counts-only `cloudflare_monitoring` optional root field로 합성한다. Validator는 단일 reconnect 표본의 p50/p95/max 동일성, slow-reconnect incident 수가 표본 수 이하인지, 모든 incident가 capture 직전 24시간 안인지, allowlist projection이 완전히 같은 incident가 중복되지 않는지도 확인한다. Signal 없이 끝난 exit `0`/`1`만 허용하고, `healthy|warning=0`, `degraded|critical|unknown=1` 대응을 CLI와 lifecycle에서 같은 함수로 검증한다. 따라서 degraded/critical exit `1`의 안전한 summary는 보존하지만 truncated/extra/contradictory payload, exit `2`, signal 종료, exit/state 불일치는 생략한다. 기존 field를 바꾸거나 legacy JSON consumer에 필수값을 추가하지 않는다. Validator는 incident count 합계뿐 아니라 critical/warning count와 status의 불변식도 강제한다.

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
