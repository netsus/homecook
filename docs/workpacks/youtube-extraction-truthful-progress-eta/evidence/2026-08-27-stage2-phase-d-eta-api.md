# Stage 2 Phase D — ETA/API evidence

## Scope

- pure versioned ETA estimator v1
- duration bucket `unknown / <=60 / 61..300 / >300`
- promotion gate `isolated 20 / telemetry 50 / bucket 10 / coverage 80%`
- exact status success data 9 keys와 nullable progress 8 keys
- shared TypeScript API/client contract

Frontend rendering, visual evidence, release promotion, production rollout은 이 evidence 범위가 아니다.

## TDD RED

- 신규 pure module 부재로 targeted suite가 import failure로 RED였다.
- 기존 terminal exact response test는 additive `progress=null`이 추가되며 RED가 됐다.

## GREEN

- targeted ETA/API/UI compatibility suite
  - `6 files passed`, `95 tests passed`
- YouTube async broader suite
  - `10 files passed`, `137 tests passed`
- `pnpm verify:backend`
  - lint/typecheck pass
  - product `2809 passed`, `175 skipped`
  - production build pass
  - security E2E `12 passed`

## Contract evidence

- `confirmed_percent`는 exact stage floor `0/10/25/45/65/90`이며 request 시간만으로 변하지 않는다.
- terminal/legacy/invalid/retry-backoff old snapshot은 `progress=null`이다.
- notification list payload에는 progress를 추가하지 않았다.
- 운영 `YOUTUBE_EXTRACTION_ETA_V1` evidence count는 0이며 promotion false라 numeric remaining/confidence는 null, delayed false다.
- injected promoted fixture에서만 elapsed range와 delayed upper 경계를 계산한다.
- range low/high는 non-negative이고 low <= high다.

## Independent review

- code review: Findings 0
- security review: Findings 0

## Boundaries

- 새 endpoint/status/error/dependency 0
- remote/cloud/production mutation 0
- Phase E frontend와 final closeout은 pending이다.
