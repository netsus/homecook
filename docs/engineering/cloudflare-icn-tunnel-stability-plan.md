# Cloudflare ICN 경로 및 Tunnel 안정화 계획

- 상태: **계획 확정 / 구현·운영 변경 전 별도 승인 필요**
- 작성일: 2026-08-09 KST
- 변경 유형: `docs-governance` 이후 별도 `hotfix` 구현
- 작업 브랜치: `hotfix/cloudflare-icn-tunnel-stability`
- 기준 커밋: `6981a432e9d64beb06d2bb9fd2729cba4dca8bb1` (`origin/master`)
- 대상: `https://app.mumeok.kr`, `https://auth.mumeok.kr`, Mac의 `cloudflared` 운영 경로
- 비대상: 팬트리 제품 계약 변경, DB 스키마 변경, UI 재설계, OAuth/Auth 계약 변경

## 1. 결론

팬트리 오류와 체감 지연은 하나의 원인으로 단정하지 않는다. 현재 증거는 다음 두 P0를 동시에 보여준다.

1. **P0-A, 간헐 장애:** 4개의 QUIC tunnel connection이 같은 시각에 모두 끊기는 구간이 반복됐다. 연결 수가 4개여도 같은 Mac·같은 회선·같은 프로토콜 경로를 공유하므로 현재 장애에는 충분한 격리가 되지 않았다.
2. **P0-B, 상시 지연:** 같은 한국 클라이언트에서 일반 Cloudflare 경로는 `ICN`인데 `app.mumeok.kr`의 client-facing edge는 `LAX`로 관측됐다. 공개 `/pantry`의 서버 응답 시작은 로컬보다 수백 ms 느렸다.

즉시 실행안은 **현재 Mac 배포를 유지한 채** `cloudflared` 업데이트, 연결 사전 점검, QUIC/HTTP2 통제 실험, 지표·경보, 경로 증거 수집을 먼저 도입하는 것이다. 다만 Cloudflare Anycast의 특정 colo를 애플리케이션이 직접 지정할 수 있다고 가정하지 않는다. LAX가 지속되면 정해진 증거 묶음으로 Cloudflare/ISP에 에스컬레이션하고, 독립 호스트 replica 또는 managed hosting 전환을 별도 결정한다.

운영 plist, tunnel, DNS, Cloudflare dashboard, `launchctl` 변경은 모두 **Manual Only**다. 이 계획 PR에서는 운영 환경을 변경하지 않는다.

## 2. 확인된 증거와 아직 모르는 것

### 2.1 2026-08-09 확인된 사실

| 항목 | 관측 | 해석 |
| --- | --- | --- |
| Tunnel 동시 단절 | `2026-08-09 19:07:43 KST`에 connIndex 0~3 모두 `timeout: no recent network activity` | 단일 connection 문제가 아니라 공통 네트워크/프로토콜 경로 장애 가능성이 높음 |
| 재연결 | 1개는 약 1초, 나머지 3개는 약 14초 뒤 `icn01/icn05/icn06`에 재등록 | origin-side connector는 ICN에 붙지만 장애 동안 가용 연결 수가 급감/소진됨 |
| 반복성 | 같은 4-connection 단절이 17:25, 17:40에도 관측 | 우발적인 단발 로그로 보기 어려움 |
| cloudflared | `2026.3.0`, 실행 중, `--no-autoupdate` | 수동 업데이트와 명시적 rollback 절차 필요 |
| client-facing colo | `app.mumeok.kr/cdn-cgi/trace`: `colo=LAX`; 동일 Mac의 `www.cloudflare.com`: `colo=ICN` | origin-side tunnel location과 사용자 요청이 진입한 edge colo는 별개이며, 도메인/경로별 라우팅 차이가 존재 |
| 공개 `/pantry` | 5회 total `0.612~0.931s`, TTFB `0.605~0.923s` | 현재 체감 지연을 재현 |
| 로컬 `/pantry` | 5회 total `0.013~0.020s`, TTFB `0.010~0.015s` | 같은 시점의 Next origin 자체는 주 병목이 아님 |
| 현재 검증 공백 | `verifyPublicOrigins()`는 HEAD status/header만 검사 | colo, TTFB, tunnel connection, reconnect, protocol을 회귀 gate로 잡지 못함 |

근거 위치:

- 운영 로그: `/Users/cwj/.homecook/logs/cloudflare-tunnel.err.log` 4176~4206행
- 설치 plist: `/Users/cwj/Library/LaunchAgents/com.homecook.cloudflare-tunnel.plist`
- 공개 검증의 현재 한계: `scripts/capture-full-local-session-lifecycle-evidence.mjs:1059`
- Cloudflare public boundary 기준: `docs/engineering/full-local-supabase-production-plan.md:505`
- 기존 안정화 요구: `docs/engineering/full-local-supabase-production-plan.md:577`
- workpack의 Cloudflare 범위: `docs/workpacks/full-local-supabase-production/README.md:28`
- 외부 LTE/5G 검증 미완료: `docs/workpacks/full-local-supabase-production/acceptance.md:49`

### 2.2 아직 확정하지 않은 가설

- LAX 라우팅이 Cloudflare 측 prefix/Anycast 문제인지, ISP peering인지, IPv4/IPv6 차이인지, DNS resolver나 계정 설정 영향인지 아직 확정하지 않는다.
- QUIC timeout이 로컬 UDP 7844 차단/품질 저하인지, 공유기/회선 NAT state인지, `cloudflared 2026.3.0` 결함인지 아직 확정하지 않는다.
- 팬트리 데이터 요청의 `ACCOUNT_SESSION_STALE::409`는 별도 app/auth 결함일 수 있다. Phase 0부터 transport timeout/Cloudflare 52x와 독립 분류하고, 재현되면 tunnel/edge 작업과 병행해 별도 app/auth 이슈를 개설한다. 실제 app/auth 수정 구현만 이 계획의 범위 밖으로 둔다.
- `ICN` 한 글자만을 성공 기준으로 삼지 않는다. Cloudflare는 신뢰성을 위해 지리적으로 가장 가까운 colo 이외의 위치로 보낼 수 있으므로, 사용자 성능과 오류율을 함께 판정한다.

## 3. 원칙과 핵심 결정 요인

### 원칙

1. **가용성이 먼저다.** 간헐적인 전체 tunnel 단절을 평균 속도보다 먼저 막는다.
2. **측정 없이 프로토콜을 고정하지 않는다.** QUIC 권장값을 유지하되 UDP 경로가 실제로 불안정한 경우에만 HTTP2를 선택한다.
3. **colo와 성능을 분리해 본다.** ICN은 중요한 진단 신호지만 최종 합격은 오류율·TTFB·재연결 시간으로 판단한다.
4. **운영 변경은 작고 되돌릴 수 있어야 한다.** binary, plist, protocol을 한 번에 바꾸지 않고 canary/rollback evidence를 남긴다.
5. **secret은 측정 산출물에 들어가지 않는다.** tunnel token, cookie, JWT, 사용자 식별자는 출력·diff·artifact에서 제거한다.

### 핵심 결정 요인 Top 3

1. 팬트리와 로그인 경로의 실제 가용성: tunnel 전체 단절, 5xx/timeout, 복구 시간
2. 한국 사용자의 실제 성능: public TTFB/total, client-facing colo, 로컬 origin 대비 overhead
3. 운영 안전성과 복구 가능성: secret 비노출, canary, 자동 관측, 5분 이내 rollback

## 4. 선택지 비교와 결정

| 선택지 | 장점 | 단점/위험 | 결정 |
| --- | --- | --- | --- |
| A. 현 Mac tunnel 보강 | 가장 빠르고 작으며 기존 배포를 유지; binary/protocol rollback 쉬움 | Mac·회선 단일 장애점은 남음 | **즉시 채택** |
| B. 독립 호스트/회선에 tunnel replica 추가 | host/회선 장애 격리; Cloudflare tunnel HA 활용 | 두 번째 origin의 데이터/세션 일관성, 비용, 운영 복잡도 필요 | 24시간 안정화 결과가 미달이면 결정 |
| C. 앱/Auth/Data를 managed/cloud로 이전 | 단일 가정용 Mac·회선 위험을 구조적으로 제거 | 범위·비용·migration 위험이 큼; 현 hotfix와 혼합 불가 | 별도 ADR/프로젝트 |
| D. 즉시 `--protocol http2` 고정 | UDP 문제가 원인이면 빠른 완화 가능 | 원인이 아니면 성능/안정성 악화, 진단 증거 소실 | **선행 A/B 없이 기각** |
| E. “ICN 강제 설정”만 수행 | 목표가 단순해 보임 | 일반 Cloudflare 설정에서 client-facing colo 직접 pin을 전제로 할 수 없음 | **기각**; 증거 기반 지원/ISP 에스컬레이션으로 대체 |

## 5. 목표와 범위

### 목표

- tunnel 4개 연결의 동시 단절을 탐지하고, 원인 분기와 복구 시간을 자동 기록한다.
- 지원되는 최신 `cloudflared`로 재현 가능한 방식으로 업데이트하고 rollback할 수 있다.
- QUIC와 HTTP2의 오류율·재연결·TTFB를 동일 조건에서 비교해 프로토콜을 결정한다.
- 한국 네트워크에서 LAX 우회가 지속되는지 다중 네트워크·IPv4/IPv6 표본으로 확인한다.
- public origin 검증에 status뿐 아니라 colo, TTFB, tunnel health를 추가한다.
- Phase 0부터 팬트리 실패를 transport timeout/Cloudflare 52x, app/auth 409, 정상 응답으로 분리하고 app/auth 문제를 별도 이슈로 이관할 증거를 남긴다.

### 범위 밖

- Cloudflare API/대시보드의 실제 변경, DNS 변경, tunnel 재시작, launchd 교체
- 팬트리 API/DB/UI 코드 수정
- 기존 full-local production 계약 완화
- 두 번째 origin 구축 또는 managed migration 구현
- 운영 token 재발급/회전

## 6. 실행 단계

각 단계는 이전 단계의 증거가 있어야 다음 단계로 진행한다. 운영 변경 단계는 반드시 별도 승인과 maintenance window를 요구한다.

### Phase 0 — 무변경 기준선 고정

산출물:

- `scripts/lib/cloudflare-tunnel-diagnostics.mjs`: 순수 parser와 판정 로직
- `scripts/cloudflare-tunnel-diagnostics.mjs`: read-only 수집 CLI
- `tests/cloudflare-tunnel-diagnostics.test.ts`: 로그/trace/timing fixture 기반 단위 테스트
- `package.json`: `verify:cloudflare-tunnel-diagnostics` 스크립트
- repo 밖 evidence JSON: timestamp, network label, address family, protocol, client colo, tunnel colo, HTTP status, connect/TTFB/total, 4-connection health, reconnect duration

구현 요구:

1. `/cdn-cgi/trace`, response headers의 `CF-RAY`, `curl --write-out`, cloudflared version, `launchctl print`, tunnel log tail을 read-only로 수집한다.
2. 홈 Wi-Fi와 LTE/5G 각각 최소 30회, IPv4와 가능한 경우 IPv6를 분리한다. 각 표본에는 네트워크 이름 대신 익명 label만 기록한다.
3. `www.cloudflare.com/cdn-cgi/trace`를 같은 시각의 Cloudflare baseline으로 함께 수집한다.
4. 로그 parser는 connection index 0~3의 disconnect/re-register 묶음과 outage window를 계산한다.
5. raw IP는 기본 산출물에서 `/24` 또는 해시로 축약하고 token/cookie/header 원문을 저장하지 않는다.
6. test account의 authenticated pantry read는 HTTP status, redacted error code, correlation ID, connect/TTFB/total을 수집하고 `transport_timeout_or_52x` / `app_auth_409` / `success`를 별도 분모로 집계한다. `ACCOUNT_SESSION_STALE::409`가 한 번이라도 재현되면 네트워크 조사와 독립된 app/auth 이슈를 즉시 개설하되 수정 구현은 이 계획에 섞지 않는다.

진입/종료 기준:

- 기존 운영 프로세스 재시작 0.
- fixture에 secret marker를 넣어도 CLI stdout/stderr/evidence의 marker 일치 0.
- 최소 Wi-Fi 30표본 + LTE/5G 30표본, 실패 요청도 누락 없이 기록.
- authenticated pantry read의 timeout/52x, app/auth 409, 정상 응답별 실행·성공·실패 분모와 latency가 분리되어 있고, 409 재현 시 별도 app/auth 이슈 ID가 evidence에 연결됨.

### Phase 1 — cloudflared update preflight

1. Cloudflare release note와 현재 stable 버전을 실행 당일 다시 확인한다.
2. 기존 binary 경로, version, SHA-256, plist hash, redacted arguments, tunnel connection 상태를 snapshot한다.
3. 현재 token file은 읽거나 복제하지 않고 **경로와 mode만** 검증한다.
4. 먼저 tunnel이 locally-managed인지 remotely-managed인지 판별한다. 현재 token-file 실행은 remotely-managed로 취급한다.
5. `cloudflared tunnel ingress validate`는 로컬 ingress config가 있는 locally-managed tunnel에만 수행한다. remotely-managed tunnel에서 config file 부재를 실패로 취급하지 않는다.
6. remotely-managed tunnel의 일반 preflight는 `cloudflared tunnel diag`를 호출하지 않는다. `scripts/cloudflare-tunnel-preflight.mjs`가 Cloudflare 공식 manual workflow의 DNS, UDP/TCP 7844, management API reachability를 각각 read-only로 검사하고, 대상 hostname·address family·성공 여부·latency·redacted error만 JSON으로 직렬화한다. raw packet/IP, tunnel state, CLI/tunnel config, log, metric, system/runtime 정보는 수집하지 않는다. Cloudflare dashboard 설정은 별도 read-only snapshot으로 남긴다.
7. full logs/config/system/raw traceroute, tunnel state/config를 포함할 수 있는 `cloudflared tunnel diag` 전체 진단 ZIP은 Cloudflare 지원 요청이 실제로 열린 경우에만 Manual Only 제한 support bundle로 생성한다. 보호된 임시 directory와 `umask 077`에서 생성하고, 공유 전에 token/cookie/JWT/email/UUID 및 기타 secret을 fail-closed scan하며 finding이 하나라도 있으면 공유를 중단한다.
8. 새 binary의 단기 shadow 검증이 불가능하면 staging tunnel을 별도로 사용하며 production token을 재사용하지 않는다.

결정 gate:

- 해당 관리 방식에 적용되는 precheck가 실패하면 업데이트를 강행하지 않고 네트워크 원인으로 분기한다.
- 새 stable이 현재 플랫폼에서 실행되고 해당 관리 방식의 precheck가 통과할 때만 Manual Only in-place maintenance로 이동한다.
- remotely-managed tunnel에 로컬 config가 없는 정상 상태는 PASS이며, locally-managed tunnel의 config 누락만 FAIL이다.
- focused preflight test가 모두 통과하고, live preflight evidence가 allowlist 필드만 포함하며 raw IP/secret marker 일치와 `cloudflared tunnel diag` process invocation이 모두 0일 때만 PASS다.

### Phase 2 — protocol 실험 설계와 staging-only rehearsal

이 단계에서는 production protocol을 바꾸지 않는다. forced QUIC/HTTP2의 production crossover는 Phase 4 외부 monitor가 정상이고 Phase 5에서 새 exact binary의 `auto` rollout·immutable rollback rehearsal이 통과한 뒤에만 Phase 5 안에서 실행한다.

실험 순서:

1. 최신 binary + `auto`를 30분 관측하고 각 표본에 실제 협상 protocol을 기록한다.
2. UDP와 TCP 7844 precheck가 모두 통과하면 staging tunnel에서 forced QUIC/HTTP2를 같은 요청 수·부하·시간대의 crossover 순서(QUIC → HTTP2 → HTTP2 → QUIC)로 각각 총 30분 이상 rehearsal한다.
3. TCP 7844가 실패하면 HTTP2 비교는 `N/A: TCP precheck failed`, UDP 7844가 실패하면 QUIC 비교는 `N/A: UDP precheck failed`로 기록하고 실패 transport를 운영 선택지에서 제외한다.
4. staging에서조차 한 transport의 forced 실행이 안전 조건을 충족하지 못하면 해당 transport를 production 후보에서 제외하고 이유를 기록한다.
5. 각 구간 사이에 기존 상태 복귀와 4-connection healthy를 확인한다.

production crossover 진입 gate:

- Phase 4의 독립 외부 public/authenticated monitor가 정상이고 실제 통지가 시험됨
- Phase 5의 새 exact binary + `auto`가 healthy 4 connections와 app/Auth/pantry smoke를 통과함
- 이전 immutable binary/plist rollback rehearsal가 목표 RTO 안에 PASS
- maintenance window와 운영자 승인이 각 forced protocol 전환마다 기록됨
- 위 조건 중 하나라도 없으면 production crossover 실행 0

비교 지표:

- 전체 요청 수, timeout/52x/5xx 비율
- 4개 connection 동시 단절 횟수와 최장 outage
- connection 재등록 p50/p95/max
- `/`, `/pantry`, `/api/pantry`의 TTFB p50/p95/max(인증 필요 API는 전용 비식별 test account)
- CPU/RSS와 connector restart 횟수

선택 규칙:

- 두 transport가 모두 검증 가능하면 crossover 결과로 오류율, 전체 outage, reconnect, TTFB를 비교한다. `auto/QUIC`에서 목표를 만족하고 HTTP2보다 열등하지 않으면 QUIC 유지.
- QUIC에서만 UDP timeout이 재현되고 HTTP2에서 제거되며 다른 지표가 악화되지 않으면 HTTP2를 임시 선택하고 네트워크 개선 follow-up을 연다.
- 한 transport가 precheck 실패로 `N/A`이면 통과한 transport만 임시 선택하되 비교 미수행 사유와 후속 네트워크 조사를 acceptance에 남긴다.
- 모두 실패하면 protocol 변경을 원복하고 회선/공유기 또는 Cloudflare incident로 에스컬레이션한다.

### Phase 3 — LAX 경로 원인 분기

수집 묶음:

- Wi-Fi와 LTE/5G의 timestamped `/cdn-cgi/trace`
- IPv4/IPv6 분리 결과
- app 도메인과 일반 Cloudflare baseline의 `colo`, `CF-RAY`, TTFB
- `dig` 결과와 사용 resolver 유형(public/local만 기록)
- app 도메인과 Cloudflare 진단 목적지의 traceroute/MTR(개인 IP redaction)
- 문제 시간대와 정상 시간대 각각 최소 30표본

분기:

1. 동일 address family·resolver·시간대 통제 뒤 한 ISP에서만 LAX이면 `ISP-correlated hypothesis`로 분류한다. 반복 관측과 Cloudflare/ISP 확인 전에는 peering/routing을 root cause로 확정하지 않는다.
2. 여러 한국 네트워크에서 app 도메인만 LAX이면 Cloudflare zone/account/routing 이슈 가능성으로 지원 요청한다.
3. IPv4/IPv6 중 하나에서만 LAX이면 해당 address family의 DNS/prefix/peering 문제로 분리한다.
4. colo가 ICN/근거리 APAC으로 바뀌어도 TTFB가 느리면 tunnel/origin/API timing으로 다시 분해한다.

중요: Cloudflare 지원 답변이나 공식 기능 확인 없이 DNS/proxy 설정으로 ICN을 강제할 수 있다고 문서화하지 않는다.

### Phase 4 — 관측과 회귀 gate

구현 후보:

- `scripts/capture-full-local-session-lifecycle-evidence.mjs`에 진단 모듈 결과를 합성하되 기존 4개 phase와 기존 JSON 소비자를 깨지 않는다.
- 별도 `scripts/cloudflare-tunnel-health.mjs`가 metrics endpoint와 로그를 읽어 상태를 JSON으로 출력한다.
- launchd plist의 metrics endpoint는 loopback만 사용하고 public bind를 금지한다.
- 경보는 다음을 구분한다: connector down, healthy connection `<4`, 동시 disconnect, reconnect p95 초과, public 52x/timeout, LAX 지속 관측, TTFB budget 초과.
- Mac·회선과 독립된 외부 synthetic monitor가 app/Auth public probe를 실행하고, Mac 안의 collector는 connector/metrics/log를 담당한다. 두 신호를 같은 incident timeline으로 합친다.
- 외부 monitor의 provider 설정, notification destination, secret은 repo 밖 Manual Only 자산이다. repo에는 provider-neutral probe 계약과 redacted evidence schema만 둔다.
- 공개 probe와 인증 test-account probe를 분리한다. test-account credential/session은 외부 monitor secret store에만 두며 public probe 실패 판정의 필수 조건으로 사용하지 않는다.

probe 계약과 경보 초기값:

- external public probe: 매 60초 `GET https://app.mumeok.kr/`와 `GET https://app.mumeok.kr/pantry`는 `200`, `HEAD https://auth.mumeok.kr/auth/v1/health`는 현재 public contract의 `401`; 각 timeout 10초
- external authenticated probe: 매 5분 전용 test account로 pantry API read 1회; 정상 status와 data wrapper를 검사하고 public probe와 별도 분모로 집계
- 24시간 합격 window: public endpoint별 예정 표본 1,440개, authenticated 표본 288개; completeness `>=99%`. 실행 누락·수집 누락은 성공이 아니라 failure로 분모에 포함
- critical: healthy connection 0 또는 public timeout/52x가 연속 2회(60초 cadence 기준 2분)
- warning: healthy connection `<4`가 60초 초과
- warning: reconnect가 15초 초과
- warning: 한국 표본의 public `/pantry` TTFB p95가 500ms 초과
- diagnostic: 한국 2개 이상 네트워크에서 LAX가 연속 10표본 관측

초기값은 24시간 자료 후 조정한다. LAX 자체는 장애 paging 조건이 아니라 조사 신호다.

### Phase 5 — in-place maintenance rollout, 관측, rollback

현재는 독립 connector가 없으므로 이 단계는 canary가 아니라 **100% 트래픽의 in-place maintenance**다. update 재시작 동안 짧은 blackout이 발생할 수 있다. 무중단 canary라는 표현은 독립 host/회선 replica가 준비된 Option B에서만 사용한다.

사전 조건:

- focused test, lint, typecheck, diagnostics dry-run 통과
- 기존 binary/plist hash와 rollback 명령 검증
- Homebrew symlink가 가리키는 이전 Cellar exact binary를 repo 밖 immutable release directory에 보존하고 SHA-256과 실행 가능 여부 확인
- production token 비노출 검증
- 유지보수 시간과 운영자 승인

in-place rollout 순서:

1. 기존 exact binary, plist, symlink target을 snapshot하고 rollback용 immutable path가 직접 실행되는지 확인한다.
2. 새 exact binary를 별도 immutable path에 설치하고 SHA-256을 확인한다. Homebrew의 현재 symlink만을 rollback 자산으로 간주하지 않는다.
3. plist의 binary 경로만 새 exact path로 바꾸고 `auto`를 유지한 채 maintenance restart한다.
4. 예상 blackout은 60초 이내로 공지하고, 외부 monitor에서 실제 시작/종료 시각을 기록한다.
5. 4개 connection 등록과 app/Auth/pantry smoke 확인.
6. 30분 maintenance 관측에서 오류율·TTFB·로그를 확인한 뒤, fault injection으로 이전 immutable binary/plist rollback rehearsal를 통과하고 새 binary + `auto`를 다시 활성화한다.
7. Phase 2의 staging rehearsal와 위 production crossover 진입 gate가 모두 통과한 경우에만 forced QUIC/HTTP2 production crossover를 별도 maintenance restart로 실행한다. 각 전환마다 외부 monitor, blackout, healthy 4 connections를 확인한다.
8. crossover 결과가 선택한 protocol을 또 하나의 별도 maintenance 변경으로 적용한다. 비교 `N/A`이면 통과한 transport만 적용하고 사유를 남긴다.
9. 24시간 post-maintenance 관측 뒤 최종 설정을 확정한다.

즉시 rollback 조건:

- 4개 connection이 60초 안에 모두 healthy가 되지 않음
- app/Auth health 실패 또는 52x/timeout 연속 2회
- login callback/pantry smoke 실패
- 새 binary crash loop 또는 CPU/RSS 2배 이상 증가
- token/민감 정보가 출력됨

rollback:

1. 새 job을 bootout한다.
2. 보관한 이전 immutable binary와 plist의 SHA-256을 확인하고 plist가 이전 exact path를 가리키도록 원자적으로 복구한다. Homebrew symlink나 `brew cleanup` 이후 남아 있을 수 있는 keg에 의존하지 않는다.
3. 기존 job을 bootstrap/kickstart한다.
4. 4개 connection, app/Auth, pantry smoke를 재확인한다.
5. rollback 원인과 시각을 evidence에 기록한다.

목표 RTO는 5분이다. Next.js, Docker, DB는 tunnel hotfix rollback 때문에 재시작하지 않는다.

## 7. 파일별 구현 계획

| 파일 | 계획된 변경 | 완료 조건 |
| --- | --- | --- |
| `scripts/lib/cloudflare-tunnel-diagnostics.mjs` | trace/header/timing/log/metrics parser, redaction, budget 판정 | 외부 I/O 없는 deterministic unit test 가능 |
| `scripts/cloudflare-tunnel-diagnostics.mjs` | read-only capture CLI, JSON schema/version, exit code | 실패도 redacted JSON으로 기록 |
| `tests/cloudflare-tunnel-diagnostics.test.ts` | disconnect grouping, mixed colo, percentile, redaction, malformed input | happy/error/boundary fixture 통과 |
| `scripts/lib/cloudflare-tunnel-preflight.mjs` | 공식 manual workflow의 DNS·UDP/TCP 7844·management API 결과를 순수 판정하고 allowlist schema로 축약 | 외부 I/O 없이 실패 조합·timeout·명령 부재를 deterministic 판정 |
| `scripts/cloudflare-tunnel-preflight.mjs` | read-only connectivity 실행기, deadline/exit code, raw 응답 비직렬화, `tunnel diag` 호출 금지 | 허용 필드 외 출력 0, raw IP/secret 0, 모든 check 통과 때만 exit 0 |
| `tests/cloudflare-tunnel-preflight.test.ts` | DNS 실패, UDP/TCP 각각 실패, 양쪽 실패, management API 실패, timeout, 명령 부재, schema/redaction/process-spawn 회귀 | 각 실패가 거짓 PASS하지 않고 `cloudflared tunnel diag` 호출 0 증명 |
| `scripts/capture-full-local-session-lifecycle-evidence.mjs` | 선택적 Cloudflare evidence 합성 | 기존 phase/consumer backward compatible |
| `tests/full-local-session-lifecycle-evidence.test.ts` | 새 optional field와 구버전 evidence 회귀 | 기존 4 phases와 legacy JSON 통과 |
| `package.json` | focused verify/capture script | `pnpm --silent` 실행 가능, secret arg 금지 |
| `ops/launchd/com.homecook.cloudflare-tunnel.plist.template` | token **경로만** 받는 repo-managed template, loopback metrics | token 값 0, deterministic render |
| `scripts/lib/cloudflare-tunnel-launch-agent.mjs` | validate/render/status/install/rollback helper | install은 explicit Manual Only flag 없으면 거부 |
| `tests/cloudflare-tunnel-launch-agent.test.ts` | plist, mode, exact binary, rollback failure 테스트 | 이전 plist/job 복구 증명 |
| `docs/engineering/cloudflare-tunnel-operations-runbook.md` | 외부 public/authenticated probe 계약, incident timeline, Manual Only provider/notification 설정, in-place blackout/rollback | Mac·회선 장애를 외부에서 탐지하고 담당자/경보 경로가 명시됨 |
| `docs/engineering/full-local-supabase-production-plan.md` | Stage 6/9에 tunnel health·colo/latency evidence 링크 | 기존 계약을 완화하거나 중복하지 않음 |
| `docs/workpacks/full-local-supabase-production/acceptance.md` | 실제 LTE/5G gate에 evidence 기준 연결 | 공식 제품 계약 변경 없이 운영 acceptance만 구체화 |

실제 구현에서 더 작은 기존 utility로 충족되면 새 파일을 줄인다. 특히 launchd 설치/rollback은 `scripts/lib/full-local-launch-agent.mjs`와 account-maintenance scheduler 패턴을 먼저 재사용한다.

## 8. 테스트 계획

### 단위 테스트

- 4개 index가 같은 outage window에 끊길 때 1건의 simultaneous outage로 묶는다.
- 일부 connection만 끊긴 경우 전체 outage로 오판하지 않는다.
- log 순서 뒤섞임, duplicate reconnect, missing reconnect, malformed line을 안전하게 처리한다.
- `cdn-cgi/trace`의 ICN/LAX/누락/알 수 없는 colo를 구분한다.
- p50/p95/max와 sample minimum 계산 경계를 고정한다.
- token, cookie, JWT, email, UUID, raw IP fixture가 모든 output에서 redacted된다.
- preflight는 DNS 실패, UDP 실패, TCP 실패, 양 transport 실패, management API 실패, timeout, 필수 명령 부재를 각각 FAIL로 판정한다.
- preflight JSON은 schema allowlist 밖 필드와 raw IP를 직렬화하지 않고, fake process runner에서 `cloudflared tunnel diag` 호출이 0임을 고정한다.
- plist renderer가 loopback metrics와 token-file path만 포함하고 token 값은 포함하지 않는다.
- install 실패 후 이전 plist/job 복구 분기를 고정한다.

### 통합 테스트

- 임시 HOME과 fake `cloudflared`, `curl`, `launchctl`로 capture/status/install dry-run을 검증한다.
- 이전/새 cloudflared stdout 차이를 fixture로 고정한다.
- 기존 session-lifecycle evidence JSON을 새 코드가 그대로 읽는다.
- metrics endpoint timeout/invalid payload가 public health를 거짓 PASS로 만들지 않는다.
- remotely-managed tunnel의 local config 부재는 PASS, locally-managed tunnel의 config 부재는 FAIL로 판정한다.
- fake DNS/UDP/TCP/HTTPS runner로 preflight deadline, 개별 check exit code, 전체 fail-closed aggregation을 재현한다.
- QUIC 정상, QUIC만 실패, 양 transport 실패 fixture에서 protocol 선택 또는 명시적 `N/A`로 종료한다.
- 24시간 probe 누락·지연·Auth `401` 정상·52x·timeout fixture로 completeness와 오류율 분모를 재현한다.

### E2E/운영 smoke

- Wi-Fi와 LTE/5G에서 `/`, `/pantry`, app Auth health, 실제 test-account pantry API를 검사한다.
- tunnel reconnect 중 UI가 무한 loading이 아니라 기존 error/retry 상태로 끝나는지 확인한다.
- login callback과 pantry 요청의 `CF-RAY`, status, timing을 같은 test run id로 연결한다.
- Mac sleep/wake나 reboot 시험은 별도 maintenance window에서만 한다.
- maintenance window에서 tunnel 프로세스 종료와 Mac egress 차단을 각각 주입하고, 독립 외부 monitor가 2분 안에 탐지·통지하며 recovery timestamp를 남기는지 확인한다.
- 새 binary 즉시 종료/등록 실패 fault injection에서 이전 immutable binary/plist가 목표 RTO 안에 복구되는지 rehearsal한다.
- production protocol crossover dry-run은 새 exact binary 활성, 외부 monitor 정상, immutable rollback PASS, maintenance/operator 승인 네 gate가 모두 없으면 fail-closed 한다.

### 성능 및 관측 검증

- 각 네트워크·address family별 최소 30표본으로 p50/p95/max를 산출한다.
- 24시간 post-maintenance 관측에서 4-connection 동시 단절, 52x/timeout, reconnect 시간을 기록한다.
- 로컬 origin TTFB를 같은 시각에 측정해 edge/tunnel overhead와 앱 처리 시간을 분리한다.
- collector 자체 CPU/RSS와 log volume을 확인해 관측 기능이 장애를 만들지 않게 한다.

## 9. 합격 기준

### Hotfix 완료 기준

- [ ] 지원되는 stable `cloudflared`와 이전 binary의 version/SHA-256/rollback 절차가 기록됨
- [ ] UDP/TCP 7844와 DNS/management precheck 결과가 기록됨
- [ ] QUIC/HTTP2 결정이 crossover A/B evidence에 근거함. 한 transport precheck 실패 시 명시적 `N/A` 사유와 통과 transport evidence가 있음
- [ ] 24시간 동안 4-connection 동시 단절 0
- [ ] 60초 public probe endpoint별 최소 1,440 예정 표본과 5분 authenticated probe 최소 288 예정 표본 중 completeness `>=99%`; 누락은 failure로 집계
- [ ] 24시간 동안 public app/Auth timeout 또는 Cloudflare 52x 0건/실행 표본 수
- [ ] connector 단절 event가 있으면 healthy 4개 복귀 p95 `<=15s`, max `<=30s`; event 0이면 percentile은 `N/A (no disconnect)`이고 4-connection 연속 healthy evidence로 대체
- [ ] 한국 Wi-Fi와 LTE/5G 각각 30표본 이상, public `/pantry` TTFB p95 `<=500ms`, total p95 `<=800ms`
- [ ] public overhead(`public TTFB - local TTFB`) p95 `<=400ms`
- [ ] LAX가 2개 네트워크에서 지속되면 Cloudflare 지원용 evidence bundle과 case ID가 남음
- [ ] secret scanner finding 0; 일반 evidence의 raw token/cookie/JWT/full IP 저장 0; 제한 support bundle은 아래 redaction contract와 보존 기한 준수
- [ ] rollback rehearsal에서 5분 안에 기존 binary/plist와 healthy 4 connections 복구
- [ ] Mac 내부 collector와 독립 외부 monitor가 tunnel 종료·egress 차단을 2분 안에 탐지·통지하고 recovery timestamp를 기록
- [ ] Phase 0부터 pantry read의 transport timeout/Cloudflare 52x, app/auth 409, 정상 응답이 별도 분모로 기록되고 409 재현 시 독립 app/auth 이슈 ID가 연결됨

### 장기 가용성 결정 gate

7일 관찰은 최종 production 설정이 적용되고 4 connections healthy가 확인된 시각부터 시작한다. 60초 public probe는 endpoint별 10,080개, 5분 authenticated probe는 2,016개를 예정 표본으로 고정하고 각각 completeness `>=99%`를 요구한다. 누락 표본은 failure로 집계하며, 기준 미달이면 “동시 단절 0회”여도 7일 gate는 PASS가 아니다. 종료 시 실행·성공·실패·누락 분모, outage/recovery event, endpoint별 latency, app/auth 409 분리 집계가 포함된 repo 밖 redacted evidence artifact와 Option B `go`/`no-go` 결정을 남긴다.

다음 중 하나라도 발생하면 Option B(독립 host/회선 replica)를 별도 계획으로 올린다.

- 7일 내 4-connection 동시 단절 1회 이상
- 동일 Mac/회선 장애로 app과 Auth가 함께 중단
- 24시간 목표를 두 차례 연속 달성하지 못함
- 운영자 없는 시간에 자동 복구가 5분을 초과

managed/cloud 이전(Option C)은 비용·데이터 권한·백업·Auth migration을 포함한 별도 ADR로만 결정한다.

## 10. Pre-mortem

### 실패 1 — HTTP2 전환이 증상을 숨기고 성능을 더 악화

- 조기 신호: QUIC timeout은 사라지지만 TTFB/CPU/reconnect가 악화
- 예방: update와 protocol 변경을 분리하고 30분 A/B 표본을 고정
- 복구: `auto`로 즉시 원복, UDP 경로 조사 계속

### 실패 2 — LAX를 ICN으로 바꾸려다 DNS/Auth callback 장애 발생

- 조기 신호: hostname mismatch, TLS/callback 오류, auth 4xx 증가
- 예방: colo 직접 pin을 전제로 한 DNS 변경 금지; 지원 case 우선
- 복구: 기존 DNS/tunnel mapping 복구, app/Auth smoke 후 재개

### 실패 3 — launchd 교체 중 token이 노출되거나 job이 사라짐

- 조기 신호: plist/log/diff secret scanner finding, `launchctl print` unloaded
- 예방: token-file 경로만 template에 포함, mode 검증, atomic backup/restore 테스트
- 복구: 로그 접근 차단·token 회전, 이전 plist/job 복구

### 실패 4 — 평균값은 좋아졌지만 짧은 전체 outage를 놓침

- 조기 신호: p95는 정상인데 사용자 retry/52x가 간헐적으로 증가
- 예방: connection-index event와 실패 요청을 개별 보존, max와 outage count 병행
- 복구: 관측 window 확대, 독립 replica gate 발동

### 실패 5 — 네트워크를 고쳤지만 팬트리만 계속 실패

- 조기 신호: edge/tunnel 지표 정상인데 pantry API 409/5xx 지속
- 예방: 페이지·API·Auth 단계별 status/timing/correlation id 분리
- 복구: `ACCOUNT_SESSION_STALE::409`를 별도 auth/pantry fix로 이관하고 네트워크 hotfix와 섞지 않음

## 11. ADR

### ADR-CF-001: current Mac tunnel을 먼저 계측·보강하고 colo pin을 가정하지 않는다

- 결정: Option A를 즉시 수행하고, 성능/가용성 gate 실패 시 Option B를 평가한다. Option C는 별도 프로젝트다.
- 이유: 현재 origin은 빠르고 tunnel/edge 구간의 장애와 지연이 재현된다. 가장 작은 변경으로 원인을 분리하고 rollback할 수 있다.
- 제약: Cloudflare Anycast는 가장 가까운 colo를 항상 보장하지 않으며, 일반 설정으로 특정 client-facing colo pin을 전제할 수 없다.
- 기각: 증거 없이 HTTP2 고정, DNS로 ICN 강제, 동일 Mac에 replica만 추가.
- 결과: P0 완화는 빨라지지만 Mac·회선 단일 장애점은 남으므로 7일 결과로 후속 HA 결정을 해야 한다.
- 재검토 시점: 24시간 post-maintenance 관측과 7일 안정화 종료 시점.

## 12. 운영 안전 경계

- Cloudflare dashboard/API, DNS, tunnel token, production launchd, binary 교체는 Manual Only.
- production token을 CLI argument, git diff, test fixture, artifact에 넣지 않는다.
- 일반 evidence는 repo 밖 `0700` directory/`0600` file에 저장한다. IP는 원문 직렬화 전에 run마다 새로 만든 비저장 HMAC key로 pseudonymize하고 key를 폐기한다. IPv4/IPv6 모두 full address를 JSON/stdout/stderr에 쓰지 않는다. 일반 preflight는 `cloudflared tunnel diag`를 호출하지 않고 공식 manual connectivity workflow를 별도 read-only 도구로 구현해 DNS·UDP/TCP 7844·management API 판정값만 직렬화한다.
- route 비교용 prefix가 필요하면 일반 evidence에는 IPv4 `/24`, IPv6 `/48`까지만 별도 필드로 저장한다. 이 값은 full IP가 아니지만 개인정보로 취급해 30일 후 삭제한다.
- Cloudflare/ISP 지원이 full client/traceroute IP 또는 전체 진단을 요구할 때만 **제한 support bundle**을 Manual Only로 생성한다. repo 밖 암호화 저장, directory/file mode `0700/0600`, 접근자 기록, 7일 만료를 적용한다. 공유 전 fail-closed secret scan을 실행하고 finding이 하나라도 있으면 공유하지 않으며, token/cookie/JWT/email/UUID는 이 예외에도 허용하지 않는다.
- 공유용 support bundle schema는 capture time, network pseudonym, address family, resolver class, colo/CF-RAY, timing, redacted traceroute와 필요한 경우에만 제한 raw IP를 구분한다. 일반 evidence와 제한 bundle을 같은 파일에 섞지 않는다.
- 외부 요청은 GET/HEAD health와 test account의 허용된 read만 사용한다.
- 운영 app/Auth/DB/Docker는 tunnel hotfix 때문에 함께 재시작하지 않는다.
- 실제 변경 전 `git status`, exact commit, current plist/binary hash, current healthy connections를 기록한다.

## 13. 공식 문서와 참고 자료

저장소 기준:

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/full-local-supabase-production/README.md`
- `docs/workpacks/full-local-supabase-production/acceptance.md`
- `docs/engineering/full-local-supabase-production-plan.md`
- `docs/engineering/agent-workflow-overview.md`
- `docs/engineering/git-workflow.md`

Cloudflare 공식 자료:

- [Cloudflare Tunnel overview](https://developers.cloudflare.com/tunnel/)
- [Tunnel configuration and protocol](https://developers.cloudflare.com/tunnel/configuration/)
- [Connectivity prechecks](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/troubleshoot-tunnels/connectivity-prechecks/)
- [Tunnel monitoring](https://developers.cloudflare.com/tunnel/monitoring/)
- [Tunnel troubleshooting](https://developers.cloudflare.com/tunnel/troubleshooting/)
- [2026.5.2 connectivity precheck changelog](https://developers.cloudflare.com/changelog/post/2026-05-27-cloudflared-connectivity-prechecks/)
- [Geographic traffic routing](https://developers.cloudflare.com/support/troubleshooting/general-troubleshooting/geographic-traffic-routing/)
- [Troubleshooting evidence collection](https://developers.cloudflare.com/support/troubleshooting/general-troubleshooting/gathering-information-for-troubleshooting-sites/)

## 14. 실행 인계

권장 실행 형태는 한 명의 owner가 순차 gate를 관리하는 `$ralph`다. 다음 명령은 **계획 승인 후 별도 구현 세션**에서만 사용한다.

```text
$ralph docs/engineering/cloudflare-icn-tunnel-stability-plan.md를 기준으로 Phase 0부터 구현해. 운영 Cloudflare/launchd 변경은 Manual Only로 멈추고, 테스트·dry-run·redaction evidence까지 완료해.
```

독립 작업이 명확해지는 Phase 4 이후에는 `$team`으로 다음 ownership만 분리할 수 있다.

- executor A: diagnostics parser/CLI/tests
- executor B: launchd template/rollback/tests
- verifier: public performance/colo evidence와 secret redaction 검증

같은 운영 plist나 evidence schema를 여러 agent가 동시에 수정하지 않는다. 모든 운영 변경 판단과 최종 verification은 leader가 소유한다.

## 15. 계획 검토 기록

- 초안: 2026-08-09, Codex. 운영 변경 없이 live read-only evidence와 저장소 계약을 연결함.
- 독립 검토: 작성 작업과 다른 **ChatGPT/Codex 새 작업(task)** 에서 구조화된 Findings가 0이 될 때까지 보완한다. 같은 작업의 서브에이전트 검토는 탐색·문서 정비 보조로만 사용하고 독립 승인 evidence를 대신하지 않는다.
- 완료 evidence: reviewer task ID, 검토한 commit 또는 absolute plan path, 반복 횟수, 최종 `Verdict: OK`, unresolved finding 0을 이 절에 기록한다.
- 1차 검토: task `019fe621-6193-7f43-8f2a-b471a5ac2184`, `CHANGES_REQUESTED`. CF-001~CF-007을 모두 수용해 remote-managed preflight, in-place maintenance/immutable rollback, 외부 monitor, protocol `N/A`, probe 분모, IP redaction, ISP 상관 가설로 수정함.
- 2차 검토: 같은 task에서 CF-001~CF-007 해결, `CHANGES_REQUESTED` CF-008 1건. protocol production 실험이 외부 monitor와 binary rollback보다 앞서던 순서를 수정해 Phase 2를 staging-only로 제한하고 production crossover를 Phase 5 안전 gate 뒤로 이동함.
- 3차 검토: 같은 task에서 CF-008 해결 확인. 최종 `Verdict: OK`, `Findings: None`, unresolved finding 0. 검토 반복 3회.
