# Marketing Validation Production Readiness

상태: staged / production mutation 없음

이 문서는 `/beta` 랜딩을 서버 Mac에 승격하기 전에 필요한 Turnstile, 캠페인 기간, 보유기간, edge rate-limit, 이메일 저장 계약을 검증한다. 명령은 환경을 읽고 비밀이 제거된 판정만 출력하며 서버, Cloudflare, Caddy, LaunchAgent, DB를 변경하지 않는다.

## 확정된 캠페인 계약

- 공개 주소: `https://app.mumeok.kr`
- 캠페인 종료: `2026-09-15T15:00:00.000Z` (`2026-09-16 00:00 KST` 직전)
- 이메일 보유기간: 캠페인 종료 후 `180일`
- retention 종료: `2027-03-14T15:00:00.000Z` (`2027-03-15 00:00 KST`)
- Turnstile action: `marketing_validation_lead_submit`
- Turnstile hostname: `app.mumeok.kr`
- 이메일 수집 activation 전 기본값: `MARKETING_LEAD_PROTECTION_READY=0`

## 두 단계 검사

배포 후보를 만들 때는 lead를 닫은 상태로 검사한다.

```bash
pnpm marketing:production:readiness -- --mode staged
```

배포, 외부 HTTPS smoke, 실제 Turnstile 확인을 마치고 이메일 수집을 열기 직전에만 activation 검사를 사용한다.

```bash
pnpm marketing:production:readiness -- --mode activation
```

두 명령 모두 JSON의 `ready: true`, `blockers: []`가 성공 조건이다. site key와 secret은 present/valid 여부만 나오며 원문은 출력하지 않는다.

## 필요한 운영 자산

- `mumeok.kr`과 하위 도메인을 허용한 Cloudflare Turnstile widget, 그리고 Siteverify에서 `app.mumeok.kr`만 exact 허용하는 서버 검증
- 검토된 Cloudflare edge rate-limit rule의 exact content digest: `sha256:66c79a94d2175a3219fb1ec324ffde7ee5ad673738d247caeafe1613d6104394`
- 서버 Mac의 private production env authority
- `/beta`의 Turnstile script/iframe CSP와 외부 HTTPS 확인
- 이메일 accepted/duplicate 집계 및 retention 확인

브라우저에 공개되는 site key와 비민감 evidence digest는 저장소 계약에 고정한다. secret과 Cloudflare rule 원문은 Git이나 이 문서에 넣지 않으며 `.env.example`도 secret에는 실패하는 placeholder만 제공한다.

## 이메일 저장 검증

자동 검증은 disposable isolated Supabase에서만 수행한다.

```bash
HOMECOOK_ISOLATED_RUNTIME_INTEGRATION_TEST=tests/marketing-validation-lead-postgres.integration.test.ts \
  pnpm verify:local-supabase-runtime:isolated
```

검증 항목:

- accepted 신청 한 건만 email을 보관한다.
- duplicate 신청은 상태만 기록하고 email은 `null`이다.
- 같은 email의 두 번째 accepted 저장은 unique constraint로 거부한다.
- 두 행의 `retention_until`은 `2027-03-14T15:00:00.000Z`다.
- 테스트 출력에는 email 주소가 나오지 않는다.

운영 DB의 실제 이메일 저장 확인은 새 빌드 승격과 Turnstile·edge activation 이후 한 건의 승인된 canary 신청으로만 수행한다.

## Cloudflare 설정 증거

- Turnstile: `Mumeok Beta Signup`, Managed, `mumeok.kr` hostname, pre-clearance off
- Turnstile readback: `docs/engineering/evidence/2026-09-05-marketing-turnstile-readback.json`
- rate limit: IP 기준 `/api/v1/marketing/validation` 10초당 20회, 초과 시 10초 block, active/first
- rate-limit readback: `docs/engineering/evidence/2026-09-05-marketing-edge-rate-limit-readback.json`
- rate-limit evidence SHA-256: `66c79a94d2175a3219fb1ec324ffde7ee5ad673738d247caeafe1613d6104394`

## 현재 외부 blocker

- Cloudflare에 보관된 새 Turnstile site key/secret을 서버 Mac private env authority에 안전하게 연결
- 경량화된 production promotion 절차 완료

이 blocker가 남아 있는 동안 `MARKETING_LEAD_PROTECTION_READY=0`을 유지한다.
