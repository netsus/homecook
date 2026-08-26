# Acceptance Checklist

> Current official tuple lock: `1.7.34 / 1.5.38 / 1.3.36 / 1.3.36 / 1.2.41`
> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

## Happy Path

- [ ] 기존 background accepted 화면이 실제 stage 기반 segmented progress를 표시한다 <!-- omo:id=accept-happy-stage-progress;stage=4;scope=frontend;review=5,6 -->
- [ ] API success data가 exact 9-key shape와 nullable `progress` key를 유지한다 <!-- omo:id=accept-api-envelope-progress;stage=2;scope=backend;review=3,6 -->
- [ ] 백엔드 계약과 프론트 타입이 `progress` exact field set까지 일치한다 <!-- omo:id=accept-progress-types;stage=4;scope=shared;review=6 -->

## State / Policy

- [ ] `confirmed_percent`가 시간만으로 증가하지 않고 stage floor만 사용한다 <!-- omo:id=accept-stage-floor-only;stage=2;scope=backend;review=3,6 -->
- [ ] active confirmed floor는 최대 90이고 active UI는 95를 넘지 않는다. `succeeded일 때만 100`이다. <!-- omo:id=accept-active-max95-success100;stage=4;scope=frontend;review=5,6 -->
- [ ] 같은 attempt에서 stage 역행이 없고 새 attempt에서만 `source_fetch`로 reset된다 <!-- omo:id=accept-attempt-reset-only;stage=2;scope=backend;review=3,6 -->
- [ ] retry backoff queued 동안 이전 attempt snapshot이 public progress에 남지 않는다 <!-- omo:id=accept-queued-hides-old-attempt;stage=2;scope=backend;review=3,6 -->
- [ ] terminal/legacy active no-snapshot은 `progress=null`이다 <!-- omo:id=accept-terminal-null-progress;stage=2;scope=backend;review=3,6 -->

## Error / Permission

- [ ] promotion gate 전 numeric ETA를 숨기고 `예상 시간 계산 중`을 표시한다 <!-- omo:id=accept-eta-hidden-before-promotion;stage=4;scope=frontend;review=5,6 -->
- [ ] delayed active job은 numeric ETA 없이 delayed copy만 표시한다 <!-- omo:id=accept-delayed-copy;stage=4;scope=frontend;review=5,6 -->
- [ ] progress 기록 실패가 extraction/finalize 결과를 failed로 바꾸지 않는다 <!-- omo:id=accept-progress-nonfatal;stage=2;scope=backend;review=3,6 -->
- [ ] progress IPC는 non-blocking ordered queue이고 finalize 전 최대 2초 bounded flush만 하며 기존 30초 timeout을 stage마다 기다리지 않는다 <!-- omo:id=accept-progress-ipc-bounded;stage=2;scope=backend;review=3,6 -->
- [ ] heartbeat/permit fence loss는 계속 fatal이고 progress report soft-fail과 섞이지 않는다 <!-- omo:id=accept-heartbeat-fence-fatal;stage=2;scope=backend;review=3,6 -->
- [ ] unauthorized, retry, terminal redirect의 기존 흐름을 회귀시키지 않는다 <!-- omo:id=accept-auth-retry-redirect-preserved;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [ ] private stage event는 `queued`를 제외한 stage 진입만 attempt당 최대 5행이다 <!-- omo:id=accept-stage-event-max5;stage=2;scope=backend;review=3,6 -->
- [ ] stale job/worker/lease/permit/attempt update는 `applied=false`, write 0이다 <!-- omo:id=accept-stale-write-zero;stage=2;scope=backend;review=3,6 -->
- [ ] browser/anon/authenticated/service_role direct progress table access는 0이다 <!-- omo:id=accept-private-progress-access-zero;stage=2;scope=backend;review=3,6 -->
- [ ] raw URL/video ID/title/transcript/frame/prompt/provider payload/user UUID를 progress event에 중복 저장하지 않는다 <!-- omo:id=accept-progress-pii-zero;stage=2;scope=backend;review=3,6 -->
- [ ] `video_duration_seconds`는 `1..86400`만 허용하고 `report_youtube_extraction_progress`는 exact `TABLE(applied boolean)`을 반환한다 <!-- omo:id=accept-progress-rpc-shape;stage=2;scope=backend;review=3,6 -->
- [ ] actual source video 준비 완료 뒤에만 `frame_extraction`을 보고하도록 bundled `codex-vision-client.mjs`와 `extract-video-frames.py` 경계가 연결된다 <!-- omo:id=accept-truthful-frame-boundary;stage=2;scope=backend;review=3,6 -->
- [ ] schema identity가 `youtube-extraction-worker-schema-v2`로 승격되고 app/worker/credential/schema attestation이 같은 release에 묶인다 <!-- omo:id=accept-schema-v2-attestation;stage=2;scope=shared;review=3,6 -->

## Data Setup / Preconditions

- [ ] fixture baseline이 queued/source_fetch/video_download/frame_extraction/model_analysis/finalizing/delayed/retry/null cases를 모두 포함한다 <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
- [ ] numeric ETA promotion fixture가 isolated/golden 20, successful telemetry 50, bucket별 10, holdout coverage 80% gate를 검증한다 <!-- omo:id=accept-eta-promotion-gate;stage=2;scope=backend;review=3,6 -->
- [ ] real DB smoke가 additive migration, exact RPC, stale write 0, direct access 0을 검증할 수 있다 <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
- [ ] Supabase Cloud/linked/remote target은 N/A/forbidden이고 operational full-local destructive reset 0을 유지한다 <!-- omo:id=accept-remote-forbidden-full-local-zero;stage=2;scope=shared;review=3,6 -->

## Manual QA

- verifier: 사용자 또는 수동 QA 담당자
- environment: same-SHA local app + restricted worker + local-only Supabase
- scenarios:
  1. accepted → `source_fetch` → `model_analysis`까지 stage가 실제 순서대로 보이는지 확인
  2. numeric ETA promotion 전에는 `예상 시간 계산 중`만 보이는지 확인
  3. delayed fixture에서 delayed copy만 보이고 retry/redirect가 깨지지 않는지 확인
  4. reload/leave/relogin 뒤 progress snapshot이 복구되는지 확인

## Automation Split

### Vitest

- [ ] progress contract/status projection/unit boundary가 분리되어 있다 <!-- omo:id=accept-vitest-split;stage=2;scope=shared;review=3,6 -->
- [ ] stage floor, null semantics, delayed, retry reset, stale write 0 regression이 단위 테스트로 고정된다 <!-- omo:id=accept-vitest-regression;stage=2;scope=shared;review=3,6 -->

### Playwright

- [ ] background progress flow, reload, retry, delayed copy가 브라우저 테스트로 고정된다 <!-- omo:id=accept-playwright-flow;stage=4;scope=frontend;review=5,6 -->
- [ ] 320/390/desktop screenshot과 browser flow evidence가 같은 새 evidence root에 묶인다 <!-- omo:id=accept-playwright-evidence-root;stage=4;scope=frontend;review=5,6 -->
- [ ] 외부 연동이 필요한 경우 기본 게이트와 선택 실행 시나리오가 구분된다 <!-- omo:id=accept-playwright-live-split;stage=4;scope=frontend;review=6 -->

### Manual Only

- [ ] `release-promoter`를 통해 same-SHA app/worker/schema preflight와 queue drain 절차를 확인한다
- [ ] production rollout에서 exact same-SHA preflight, 단일 public URL canary, queue/permit drain을 확인한다
- [ ] rollout 후 첫 30 terminal jobs의 stage 누락률, ETA coverage, delayed 비율을 aggregate-only로 검토한다
