# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Happy Path

- [x] 광고 클릭 뒤 `/beta`에서 Hero, 퀴즈, 결과, concept, intent, email, followup이 같은 메시지 흐름으로 이어진다 <!-- omo:id=accept-happy-path;stage=4;scope=frontend;review=5,6 -->
- [x] 결과와 해결 아이디어가 이메일 전에 공개된다 <!-- omo:id=accept-result-before-email;stage=4;scope=frontend;review=5,6 -->
- [x] API 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [x] 백엔드 계약과 프론트 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->

## State / Policy

- [x] `view → quiz_started → quiz_completed → solution_viewed → intent_selected → lead_submitted → followup_submitted` 상태 전이가 공식 문서와 일치한다 <!-- omo:id=accept-state-transition;stage=2;scope=shared;review=3,6 -->
- [x] read-only 정책이 지켜진다. lead gate가 막히면 결과는 계속 보인다 <!-- omo:id=accept-read-only;stage=2;scope=shared;review=3,6 -->
- [x] 중복 호출에도 결과가 꼬이지 않는다. duplicate email은 generic success다 <!-- omo:id=accept-idempotency;stage=2;scope=backend;review=3,6 -->

## Target Qualification

`target_qualified`는 서버 pure function으로 계산하며, 아래 truth table과 일치해야 한다.

| 조건 조합 | target_qualified |
|---|---|
| `Q1=해보려 했지만 시작하지 못함` 또는 `Q1=시작했지만 중단함` 또는 `Q1=가끔 기록 중`, `Q2=2~3일` 또는 `Q2=4~7일`, `Q4`가 pain option 중 하나, `Q5`가 `현재 방식으로 충분함`이 아님 | `true` |
| `Q1=관심 없음` | `false` |
| `Q1=꾸준히 기록 중` | `false` |
| `Q2=0일` 또는 `Q2=1일` | `false` |
| `Q4=특별히 불편하지 않음` | `false` |
| `Q5=현재 방식으로 충분함` | `false` |

`Q4` pain option은 다음 중 하나 이상이다.

- 레시피에 있는 재료를 다시 입력할 때
- 조리 후 무게와 내가 먹은 양을 계산할 때
- 집밥과 완제품을 따로 기록할 때
- 하루 합계와 주간 흐름을 한눈에 못 볼 때

`Q5`는 `현재 방식으로 충분함`만 적합도 false다. 빠른 추정, 자동 계산, 정확한 계산, 아직 잘 모르겠음은 Q1/Q2/Q4 조건을 함께 만족하면 target_qualified가 될 수 있다.

## Error / Permission

- [x] loading 상태가 있다 <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [x] session cookie만 남고 로컬 결과가 없을 때 복구 안내 empty 상태가 있다 <!-- omo:id=accept-empty;stage=4;scope=frontend;review=5,6 -->
- [x] error 상태가 있다 <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [x] unauthorized는 N/A다. `/beta`와 validation route는 로그인 없는 public funnel이며 사용자 소유 리소스를 읽거나 수정하지 않는다 <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [x] conflict 처리 흐름이 있다. 역순 action은 409 후 server-state 재동기화하고 fail-closed readiness는 503과 재시도 안내로 막는다 <!-- omo:id=accept-conflict;stage=4;scope=frontend;review=6 -->
- [x] 로그인 보호 액션이 없더라도 session 복귀 / retry 흐름이 맞다 <!-- omo:id=accept-return-to-action;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [x] 타인 리소스를 수정할 수 없다 <!-- omo:id=accept-owner-guard;stage=2;scope=backend;review=3,6 -->
- [x] invalid input을 적절히 거부하거나 무시한다 <!-- omo:id=accept-invalid-input;stage=2;scope=backend;review=3,6 -->
- [x] 파생 필드와 비정규화 값이 맞다 <!-- omo:id=accept-derived-fields;stage=2;scope=backend;review=3,6 -->

## Data Setup / Preconditions

- [x] fixture / mock에서 필요한 baseline 데이터가 준비되어 있다. `view`, `quiz`, `result`, `intent`, `lead`, `followup`의 대표 경로가 있어야 한다 <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
- [x] real DB smoke에 필요한 테이블 / seed / bootstrap이 준비되어 있다. 단일 session row와 단일 table만 사용한다 <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
- [x] 시스템 row 자동 생성이 필요한 슬라이스면 owning flow와 기대 결과가 명시되어 있다 <!-- omo:id=accept-bootstrap-owning-flow;stage=2;scope=shared;review=3,6 -->

## Manual QA

- verifier: 후속 Stage 4 구현자 또는 Stage 6 reviewer
- environment: 로컬 개발 환경 또는 합의된 smoke 환경
- scenarios:
  1. 390×844에서 광고 메시지와 Hero CTA가 첫 viewport에 함께 보이는지 확인한다.
  2. 5문항을 모두 단일 선택으로 마치고 결과가 이메일 전에 공개되는지 확인한다.
  3. `satisfied_control`가 실패로 보이지 않고 대조군 문구로만 유지되는지 확인한다.
  4. 동일 email 재제출이 generic success인지 확인한다.
  5. `MARKETING_LEAD_PROTECTION_READY`가 없거나 Turnstile가 실패하면 lead가 fail closed인지 확인한다.
  6. `/privacy` 링크가 Hero와 email form에서 모두 보이는지 확인한다.

## Automation Split

### Vitest

- [x] 로직 / 유틸 / 상태 전이 / API helper 범위가 분리되어 있다 <!-- omo:id=accept-vitest-split;stage=2;scope=shared;review=3,6 -->
- [x] 회귀 위험이 큰 계산과 정책이 단위 테스트로 고정되어 있다. 특히 `target_qualified` pure rule과 `satisfied_control`가 고정되어야 한다 <!-- omo:id=accept-vitest-regression;stage=2;scope=shared;review=3,6 -->
- [x] Stage 6 운영 테스트가 PII 비노출 stdout, safe artifact path, CSV injection 방지, dry-run/confirm purge, paid allowlist cohort, Wilson interval, retention internal scope를 고정한다 <!-- omo:id=accept-stage6-operations-lock;stage=6;scope=shared;review=6 -->

### Playwright

- [x] 실제 사용자 흐름, 라우팅, modal-like stepper, 권한 게이트가 브라우저 테스트로 고정되어 있다 <!-- omo:id=accept-playwright-flow;stage=4;scope=frontend;review=5,6 -->
- [x] 외부 연동이 필요한 경우 기본 게이트와 선택 실행 시나리오가 구분되어 있다 <!-- omo:id=accept-playwright-live-split;stage=4;scope=frontend;review=6 -->

### Stage 6 Operations

- [x] `docs/marketing/demand-validation-analysis.sql`이 paid allowlisted `weekly_nutrition_v2` cohort만 대상으로 unique 세션, accepted/duplicate lead, Green/Yellow/Red, Wilson 95%, target mismatch, result/target/planner 진단 분포를 direct identifier 없이 계산한다 <!-- omo:id=accept-stage6-analysis-sql;stage=6;scope=backend;review=6 -->
- [x] `scripts/export-marketing-leads.mjs`는 consent가 있는 accepted lead의 연락 필드 `email / consent_version / consented_at`만 CSV로 export하고 `.artifacts/marketing-validation/*.csv` 밖 경로를 거부하며 stdout에 email/session 식별자를 남기지 않는다 <!-- omo:id=accept-stage6-lead-export-safe-path;stage=6;scope=backend;review=6 -->
- [x] export CSV는 수식 시작 문자 escape와 `0600` 권한을 강제한다 <!-- omo:id=accept-stage6-lead-export-permissions;stage=6;scope=backend;review=6 -->
- [x] `scripts/purge-expired-marketing-validation.mjs`는 dry-run 기본, `--confirm` + `MARKETING_VALIDATION_ALLOW_PURGE=1` 이중 게이트, mock fixture 전용 `--now`, non-PII `--operator-id`, `.artifacts/marketing-validation/*.json` evidence 강제를 지킨다 <!-- omo:id=accept-stage6-retention-purge-gates;stage=6;scope=backend;review=6 -->
- [x] purge는 `retention_until < now` row만 삭제하고 evidence JSON에는 직접 식별자 없이 count, mode, non-PII operator alias, remaining count만 남긴다 <!-- omo:id=accept-stage6-retention-purge-redaction;stage=6;scope=backend;review=6 -->
- [x] `supabase/migrations/20260831110000_marketing_validation_retention_operations.sql`는 기존 내부 scope를 유지하면서 `marketing-validation-export` exact GET과 `marketing-validation-purge` exact GET/DELETE path만 추가한다 <!-- omo:id=accept-stage6-retention-scope-migration;stage=6;scope=backend;review=6 -->
- [x] `docs/marketing/demand-validation-result-template.md`가 accepted/duplicate/deliverable 분리, primary threshold, Manual Only readiness sign-off를 고정한다 <!-- omo:id=accept-stage6-result-template;stage=6;scope=shared;review=6 -->
- [x] Stage 6 운영 테스트 `tests/marketing-validation-operations.test.ts`가 export/purge/analysis/migration 경계를 회귀로 고정한다 <!-- omo:id=accept-stage6-operations-tests;stage=6;scope=shared;review=6 -->

### Manual Only

- [ ] 실제 operator privacy facts와 Turnstile production keys/hostname가 준비되어 있다
- [ ] `/privacy` 운영 반영과 launch-readiness-blockers PR1/2/3가 완료되었다
- [ ] `ALLOWED_MARKETING_ORIGINS` production origin/hostname가 확정되어 있다
- [ ] `/api/v1/marketing/validation` edge rate-limit rule 캡처와 정상 7-stage smoke가 있다
- [ ] `MARKETING_LEAD_PROTECTION_READY=1` production enable 승인과 증거가 있다
- [ ] 실제 iOS Safari에서 주요 퍼널 smoke가 완료되었다
- [ ] `MARKETING_CAMPAIGN_END_AT`와 캠페인 종료 + 180일 retention 값이 확정되어 staging/production 환경에 반영되었다
- [ ] staging/production full-local Supabase migration apply가 별도 승인·backup·target 확인 뒤 완료되었다
- [ ] 실제 베타 초대 발신 이메일과 발신 도메인이 제공되고 발송 가능 상태로 검증되었다
- [ ] 위 준비 상태를 모두 확인한 뒤 paid ads 집행 승인이 기록되었다

> Manual Only가 남아 있어도 fail-closed code closeout은 가능하다. 위 항목이 모두 체크되기 전 production email 저장·광고 집행은 금지한다.
