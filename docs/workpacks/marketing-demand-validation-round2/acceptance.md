# Acceptance Checklist

> `marketing-demand-validation-round2`는 Stage 1의 contract lock 문서이며, Stage 2~6에서 실체 증거가 생길 때 체크합니다.
> Manual Only는 외부 운영 승인/배포 승인 같은 비자동 항목만 허용합니다.

## Happy Path

- [ ] `/beta/r2/recording` 과 `/beta/r2/homeflow` 진입 시 올바른 `subject`/`round`가 기록된다 <!-- omo:id=accept-round2-route-boundary;stage=2;scope=backend;review=3,6 -->
- [ ] 메뉴 3개(`베타 알림 받기`, `집밥 사용 예시 보기`, `의견 남기기`)가 모두 노출되고 동작한다 <!-- omo:id=accept-round2-menu;stage=4;scope=frontend;review=5,6 -->
- [ ] 설문은 4문항으로만 진행한다 <!-- omo:id=accept-round2-4q;stage=4;scope=shared;review=6 -->
- [ ] 결과와 체험은 이메일 전 공개 화면으로 동작한다 <!-- omo:id=accept-round2-result-preview;stage=4;scope=frontend;review=5,6 -->
- [ ] `API` 계약이 `{ success, data, error }`를 유지한다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [ ] 에러 envelope가 `error: { code, message, fields[] }`만 반환한다 <!-- omo:id=accept-error-envelope-shape;stage=2;scope=backend;review=3,6 -->

## State / Policy

- [ ] v1 계약(`marketing-demand-validation`) row/쿠키가 r2에서 흡수되지 않는다 <!-- omo:id=accept-v1-boundary;stage=2;scope=backend;review=3,6 -->
- [ ] round/subject 분기와 기존 `/beta` 구분이 누락/혼합되지 않는다 <!-- omo:id=accept-round2-segmentation;stage=2;scope=backend;review=3,6 -->
- [ ] direct_apply는 설문 완료 전후 무관하게 별도 경로로 집계된다 <!-- omo:id=accept-direct-apply-path;stage=4;scope=frontend;review=5,6 -->
- [ ] 같은 브라우저 재방문/완료후 메뉴 복귀가 신규 방문 전환으로 계수되지 않는다 <!-- omo:id=accept-revisit-idempotency;stage=4;scope=backend;review=6 -->
- [ ] 동일 action replay는 first-write-wins이고 invalid transition은 `409`다 <!-- omo:id=accept-transition-enforcement;stage=2;scope=shared;review=3,6 -->
- [ ] 기존 lead duplicate 처리 규칙이 유지된다 <!-- omo:id=accept-duplicate-lead;stage=2;scope=backend;review=3,6 -->
- [ ] 유효성 실패는 `422`, 읽기/재개 경계는 `409`, server readiness 미완는 `503`으로 고정한다 <!-- omo:id=accept-error-code-matrix;stage=2;scope=backend;review=3,6 -->
- [ ] read-only 정책 및 fail-closed가 신규 경로에도 적용된다 <!-- omo:id=accept-read-only-failclosed;stage=2;scope=shared;review=3,6 -->

## Error / Permission

- [ ] loading 상태가 있다 <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [ ] error 상태가 있다 <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [ ] duplicate/invalid transition 처리 메시지가 정보 누설 없이 동작한다 <!-- omo:id=accept-error-safeness;stage=4;scope=frontend;review=6 -->
- [ ] turnstile/consent 실패가 이메일 저장 성공으로 위장되지 않는다 <!-- omo:id=accept-turnstile-failclosed;stage=4;scope=frontend;review=6 -->
- [ ] anonymous action의 `lead_submitted` 입력은 PII 쓰기 없이 reject 혹은 duplicate 처리만 한다 <!-- omo:id=accept-anon-boundary;stage=2;scope=backend;review=3,6 -->

## Data Integrity

- [ ] 1차 회차 데이터(및 통계 경로)는 v1 계산 방식과 호환되며 변경되지 않는다 <!-- omo:id=accept-v1-preserve;stage=4;scope=backend;review=6 -->
- [ ] 라운드+주제별 신청/완료 집계를 분리한다 <!-- omo:id=accept-round2-cohort;stage=4;scope=backend;review=6 -->
- [ ] 주제간 중복 참여(같은 이메일/브라우저)는 신규 고객 수에서 과대계산하지 않는다 <!-- omo:id=accept-cohort-dedup;stage=4;scope=backend;review=6 -->
- [ ] PII가 결과 응답/로그에 유출되지 않는다 <!-- omo:id=accept-pii-clean;stage=2;scope=backend;review=3,6 -->

## Manual QA

- verifier: 후속 reviewer
- environment: isolated full-local + controlled smoke
- scenarios:
  - `/beta/r2/recording` 직접 신청 경로 단일 탭 완료
  - `/beta/r2/homeflow` 설문→체험→완료→복귀→재시작
  - v1 쿠키로 /beta/r2 진입 시 신규 row 생성 확인
  - 동일 이메일으로 v1+v2 신청 시 중복 집계 기준 확인

## Automation Split

### Vitest

- [ ] state machine / action 유효성 / duplicate replay를 unit 테스트로 고정한다 <!-- omo:id=accept-vitest-state;stage=2;scope=shared;review=3,6 -->
- [ ] 분기 집계(회차, 주제, 메뉴경로) 계산 로직을 회귀 테스트로 분리한다 <!-- omo:id=accept-vitest-segmentation;stage=2;scope=shared;review=3,6 -->

### Playwright

- [ ] `/beta/r2/recording`과 `/beta/r2/homeflow`에서 메뉴 선택/직접 신청/복귀 플로우를 브라우저 테스트로 고정한다 <!-- omo:id=accept-playwright-round2-flow;stage=4;scope=frontend;review=5,6 -->
- [ ] 실 기기 크기(특히 390×844)에서 메뉴 및 완료/복귀 UI 깨짐이 없음을 고정한다 <!-- omo:id=accept-playwright-round2-mobile;stage=4;scope=frontend;review=5,6 -->
- [ ] PII 노출 가능성이 있는 값 노출 테스트를 분리해 고정한다 <!-- omo:id=accept-playwright-pii;stage=6;scope=frontend;review=6 -->

### Manual Only

- [ ] 운영 계약(privacy, Turnstile readiness, 이미지 권리) 미완료 시 lead fail-closed를 유지한다 <!-- omo:id=accept-manual-operations;stage=6;scope=shared;review=6 -->
- [ ] 제품 화면이 실제 서비스와 기대 일치(사용 예시)로 안내되는지 최종 수동 점검한다 <!-- omo:id=accept-manual-content-honesty;stage=6;scope=frontend;review=6 -->
