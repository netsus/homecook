# Slice: youtube-extraction-truthful-progress-eta

## Goal

기존 `YT_IMPORT_BACKGROUND`의 브라우저 경과시간 기반 가짜 진행 표시를 실제 worker 단계 기반 진행 바로 교체해 사용자가 지금 어디까지 왔는지 솔직하게 이해할 수 있게 한다. 숫자 ETA는 근거가 충분할 때만 범위형으로 보여 주고, 근거가 부족하면 `예상 시간 계산 중`으로 숨겨 거짓 정밀도를 만들지 않는다. 기존 retry, terminal redirect, notification, `sync_wait` 호환, 5초 polling은 유지한다.

## Branches

- Stage 1 문서: `docs/youtube-progress-eta-stage1-current`
- Stage 2 백엔드: `feature/be-youtube-extraction-truthful-progress-eta`
- Stage 4 프론트엔드: `feature/fe-youtube-extraction-truthful-progress-eta`

## In Scope

- 화면:
  - 기존 `YT_IMPORT_BACKGROUND` accepted/processing/retry surface의 progress/ETA copy 교체
  - 기존 terminal redirect/retry CTA 유지 (`YT_IMPORT`, `APP_SHELL_YOUTUBE_NOTIFICATIONS`의 terminal destination 계약 변경 없음)
- API:
  - `POST /api/v1/recipes/youtube/extraction-jobs` — queued snapshot만 additive로 생성, public shape 변경 없음
  - `GET /api/v1/recipes/youtube/extraction-jobs/{job_id}` — exact nullable `progress` key를 포함하는 9-key success data
  - `GET /api/v1/recipes/youtube/extractions/{extraction_id}` — review/recipe destination read는 유지
  - `POST /api/v1/recipes/youtube/extract` — `submission_mode=sync_wait` 호환 유지, public shape 변경 없음
- 상태 전이:
  - stored job: `queued -> processing -> succeeded | failed`
  - public progress stage: `queued -> source_fetch -> video_download -> frame_extraction -> model_analysis -> finalizing`
  - 같은 attempt 안에서는 stage가 뒤로 가지 않고, 새 attempt에서만 `source_fetch`로 reset된다
- DB 영향:
  - `youtube_extraction_jobs` nullable progress snapshot 5컬럼
  - `private.youtube_extraction_progress_stage_events`
  - exact fenced RPC `report_youtube_extraction_progress(...)`
- worker/release:
  - parent runtime이 authoritative attempt를 주입하고 child progress IPC를 검증한 뒤 exact fenced RPC로 보고한다.
  - `source_fetch -> video_download -> frame_extraction -> model_analysis -> finalizing`을 실제 작업 경계에서만 보고한다.
  - 실제 source video 준비 완료와 frame extraction 시작의 경계는 bundled `codex-vision-client.mjs`와 `extract-video-frames.py`의 bounded marker/callback으로 관측한다.
  - progress IPC는 non-blocking ordered queue를 사용하고 finalize 전 최대 2초 bounded flush만 허용한다. 기존 30초 IPC timeout을 progress stage마다 기다리지 않는다.
  - progress transport 실패는 non-fatal이지만 heartbeat/permit fence loss는 계속 fatal이며 child abort와 mutation write 0을 유지한다.
  - 새 DB surface와 RPC는 `youtube-extraction-worker-schema-v2`, expected-schema/catalog fingerprint, worker artifact/credential/app same-SHA attestation에 함께 반영한다.
- Schema Change:
  - [ ] 없음 (읽기 전용)
  - [x] 있음 → Stage 2에서 additive migration + expected-schema 갱신 필요

## Out of Scope

- 새 public endpoint/status/error 추가
- active progress를 notification list payload에 추가하는 변경
- WebSocket/SSE
- ML 또는 요청별 aggregate query 기반 ETA 예측기
- 새 npm/pnpm 의존성 추가
- 새 화면 생성 또는 `YT_IMPORT_BACKGROUND` 구조 재설계
- `youtube-async-extraction-notification`의 terminal 알림/권한/설치 경계 재정의
- `release-promoter` 실행, production rollout 실행, production migration apply
- Supabase Cloud/linked/remote target 사용
- 운영 full-local destructive reset

## Dependencies

| 선행 슬라이스/계약 | 상태 | 확인 |
| --- | --- | --- |
| `youtube-async-extraction-notification` | merged | [x] |
| official tuple `1.7.34 / 1.5.38 / 1.3.36 / 1.3.36 / 1.2.41` | current | [x] |
| 승인 계획 SHA-256 `e3bf440a3708b50e2430f1f2fda770fbe2a1f30bdaf3eb79fb6237affd5bbe60`, 609 lines | independent `APPROVE / Findings 0` | [x] |

> 제품 구현은 이 Stage 1 docs가 independent internal 1.5에서 Findings 0으로 승인되고 `master`에 merge된 뒤에만 시작한다.

## Backend First Contract

- `GET /api/v1/recipes/youtube/extraction-jobs/{job_id}` success data의 exact field set은 `job_id`, `status`, `submitted_at`, `started_at`, `completed_at`, `result`, `error`, `can_retry`, `progress` 9개다. `progress` key는 항상 존재하며 terminal/legacy active no-snapshot은 `null`이다.
- `progress` exact field set은 `attempt`, `stage`, `confirmed_percent`, `updated_at`, `remaining_seconds_low`, `remaining_seconds_high`, `estimate_confidence`, `delayed` 8개다.
- 공개 단계와 `confirmed_percent` floor는 `queued=0`, `source_fetch=10`, `video_download=25`, `frame_extraction=45`, `model_analysis=65`, `finalizing=90`이다.
- active confirmed floor는 최대 90이고 active UI는 95를 넘지 않는다. `succeeded일 때만 100`이다.
- 첫 release는 promotion gate 전 numeric ETA를 숨기고 `예상 시간 계산 중`을 사용한다.
- numeric ETA promotion은 대표 duration bucket을 포함한 isolated/golden successful run 최소 20개, successful stage telemetry 최소 50개, duration bucket별 최소 10개, holdout coverage `>=80%`를 모두 통과한 뒤에만 허용한다.
- range upper를 넘기면 `delayed=true`, numeric remaining/confidence는 `null`이며 terminal status를 바꾸지 않는다.
- status success data의 nullable `progress` key는 additive다. 이전 client는 이를 무시할 수 있어야 한다.
- `private.youtube_extraction_progress_stage_events`는 `queued`를 제외한 stage 진입만 기록하며 attempt당 최대 5행이다.
- `video_duration_seconds`는 `1..86400` nullable integer만 허용하고 범위 밖 값은 write 0이다.
- `report_youtube_extraction_progress(...)`의 exact return은 `TABLE(applied boolean)`이며 duplicate는 멱등, stale/terminal/역행은 `applied=false`다.
- stale job/worker/lease/permit/attempt update는 `applied=false`, write 0이다.
- progress 기록 실패가 extraction/finalize를 failed로 바꾸지 않는다.
- heartbeat/permit fence loss는 best-effort progress 실패와 구분하며 계속 fatal이다.
- progress IPC는 non-blocking ordered queue로 처리하고 finalize 전 최대 2초 bounded flush만 허용한다. 기존 30초 IPC timeout을 progress stage마다 기다리지 않는다.
- 실제 source video 준비 완료 뒤에만 `frame_extraction`을 보고한다. 이를 위해 bundled `codex-vision-client.mjs`와 `extract-video-frames.py`의 실제 download/frame 경계를 관측한다.
- expected-schema identity는 `youtube-extraction-worker-schema-v2`로 올리고 app/worker/credential/schema attestation을 같은 release에 묶는다.
- notification list payload에는 active progress를 넣지 않는다.
- 새 public endpoint, WebSocket/SSE, ML, 새 npm/pnpm 의존성은 없다. 기존 5초 polling을 재사용한다.
- Supabase Cloud/linked/remote target은 N/A/forbidden이며, operational full-local destructive reset 0을 유지한다.

## Frontend Delivery Mode

- 디자인 확정 전: 기능 가능한 임시 UI
- 필수 상태: `loading / empty / error / read-only / unauthorized`
- 추가 상태:
  - `accepted`: queued 0% + leave-safe copy
  - `processing`: stage-derived segmented bar + stage copy
  - `eta-pending`: `예상 시간 계산 중`
  - `delayed`: `예상보다 오래 걸리고 있어요. 추출은 계속 진행 중이에요.`
  - `retry`: `다시 분석 중 (2/3)` 형식 attempt copy
- 로그인 보호 액션이면 기존 return-to-action을 유지한다.
- notification list와 terminal CTA는 기존 payload/route를 유지하고 active progress UI는 `YT_IMPORT_BACKGROUND` 내부에만 추가한다.

## Design Authority

- UI risk: `low-risk`
- Anchor screen dependency: 없음
- Visual artifact: `ui/designs/evidence/youtube-extraction-truthful-progress-eta/`
- Authority status: `not-required`
- Notes:
  - 기존 `YT_IMPORT_BACKGROUND` progress surface 내부 교체다.
  - segmented progress copy, ETA copy, retry copy만 바꾸며 CTA 구조와 destination은 유지한다.
  - Stage 4는 새 evidence root `ui/designs/evidence/youtube-extraction-truthful-progress-eta/`에 320/390/desktop screenshot과 browser flow evidence를 남긴다.
  - predecessor evidence/SHA/closeout은 dependency 근거로만 남기고 이 slice의 evidence root로 재사용하지 않는다.

## Design Status

- [x] 임시 UI (temporary) — Stage 1에서는 low-risk rationale과 evidence 계획만 잠근다
- [ ] 리뷰 대기 (pending-review) — Stage 4 구현 후
- [ ] 확정 (confirmed) — Stage 5 lightweight design review와 Stage 6 closeout 후
- [ ] N/A — BE-only 슬라이스

> Design Status 전이: `temporary` → `pending-review` → `confirmed`

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.7.34.md`
- `docs/화면정의서-v1.5.38.md`
- `docs/유저flow맵-v1.3.36.md`
- `docs/db설계-v1.3.36.md`
- `docs/api문서-v1.2.41.md`
- `docs/engineering/slice-workflow.md`
- `docs/engineering/agent-workflow-overview.md`
- `docs/engineering/tdd-vitest.md`
- `docs/engineering/qa-system.md`
- `docs/engineering/supabase-local-only-operations.md`
- `docs/workpacks/youtube-async-extraction-notification/README.md`
- `/Users/cwj/01_vibe_coding/homecook/.omx/plans/youtube-extraction-truthful-progress-eta-plan-20260826.md` — SHA-256 `e3bf440a3708b50e2430f1f2fda770fbe2a1f30bdaf3eb79fb6237affd5bbe60`, 609 lines

## QA / Test Data Plan

- fixture baseline:
  - queued snapshot (`attempt=0`, `stage=queued`, ETA null)
  - active snapshots for `source_fetch`, `video_download`, `frame_extraction`, `model_analysis`, `finalizing`
  - promotion 이전 numeric ETA hidden case
  - delayed case (`delayed=true`, numeric ETA null)
  - retry backoff queued case (이전 attempt snapshot hidden)
  - terminal/legacy active no-snapshot case (`progress=null`)
- real DB smoke:
  - pinned isolated local replay로 additive migration, exact RPC, `attempt당 최대 5행`, stale write 0, direct table access 0 확인
  - 실제 app route에서 5초 polling으로 status snapshot 복원 확인
- seed/reset:
  - 신규 기능용 baseline seed는 추가하지 않는다.
  - Supabase Cloud/linked/remote target은 N/A/forbidden이다.
  - operational full-local destructive reset 0을 유지한다.
- external/live smoke:
  - PR 전 external smoke는 운영 volume과 분리된 pinned isolated local stack에서 `isolated-local-single-public-url-canary-after-same-sha-preflight` 한 건만 수행한다.
  - `release-promoter` 실행, production canary, rollout queue drain, first-30 aggregate 관찰은 모두 Manual Only다.
- blocker:
  - official tuple drift
  - stage floor drift 또는 active UI 95 초과
  - `progress` null semantics drift
  - stale write가 write 0이 아님
  - stage event가 attempt당 5행을 초과함
  - remote link/credential 사용
  - predecessor evidence 재사용

## Stage 1 Validation Boundary

- Stage 1 pre-merge gate는 현재 branch의 README, acceptance, automation/workflow bookkeeping을 직접 읽는 local doc gate와 targeted Vitest다.
- `origin/master`에 아직 이 workpack이 없으므로 Stage 1 current gate에 `validate:workpack`를 넣지 않는다.
- current required commands:
  - `pnpm validate:source-of-truth-sync`
  - `pnpm validate:workflow-v2`
  - `node scripts/validate-automation-spec.mjs --slice youtube-extraction-truthful-progress-eta`
  - `pnpm validate:omo-bookkeeping`
  - `node --input-type=module -e "import { evaluateDocGate } from './scripts/lib/omo-doc-gate.mjs'; const result = evaluateDocGate({ slice: 'youtube-extraction-truthful-progress-eta' }); console.log(result.summary); if (result.outcome !== 'pass') process.exit(1);"`
  - `pnpm exec vitest run tests/youtube-extraction-truthful-progress-eta-stage1.test.ts tests/workflow-v2-docs.test.ts tests/omo-automation-spec.test.ts tests/omo-bookkeeping.test.ts tests/omo-doc-gate.test.ts tests/source-of-truth-sync.test.ts`
- post-merge / Stage 2 preflight:
  - `BRANCH_NAME=feature/be-youtube-extraction-truthful-progress-eta pnpm validate:workpack -- --slice youtube-extraction-truthful-progress-eta`

## Key Rules

1. `confirmed_percent`는 시간 기반 증가율이 아니라 worker가 실제로 통과한 stage floor다.
2. 같은 attempt 안에서는 stage가 뒤로 가지 않는다.
3. 새 attempt에서만 `source_fetch`로 reset할 수 있다.
4. retry backoff queued 동안은 이전 attempt snapshot을 public progress로 노출하지 않는다.
5. terminal `succeeded|failed|expired`와 legacy active no-snapshot은 `progress=null`이다.
6. numeric ETA는 promotion gate 전 숨긴다.
7. delayed는 ETA upper 초과 의미일 뿐 worker/lease health error가 아니다.
8. stage event table은 `queued`를 제외한 stage 진입만 attempt당 최대 5행이다.
9. stale job/worker/lease/permit/attempt update는 `applied=false`, write 0이다.
10. progress 기록 실패는 best-effort로 격리하고 extraction/finalize 결과를 바꾸지 않는다.
11. 새 public endpoint, WebSocket/SSE, ML, 새 npm/pnpm 의존성은 도입하지 않는다.
12. `release-promoter`, production rollout, remote target, 운영 full-local destructive reset은 Manual Only다.
13. `youtube-extraction-worker-schema-v2`와 app/worker/credential/schema identity는 같은 release에서만 승격한다.
14. progress IPC는 non-blocking ordered queue이며 finalize 전 최대 2초만 flush한다.
15. heartbeat/permit fence loss는 progress report 실패와 달리 계속 fatal이다.

## Contract Evolution Candidates

없음. current official tuple `1.7.34 / 1.5.38 / 1.3.36 / 1.3.36 / 1.2.41`가 이미 이 slice의 public contract를 잠갔다.

## Primary User Path

1. 사용자가 `/recipes/new/youtube` 또는 기존 background consumer에서 URL 검증을 마친다.
2. enqueue 성공 뒤 `YT_IMPORT_BACKGROUND` accepted 화면에서 queued 0%와 leave-safe copy를 본다.
3. 기존 5초 polling으로 status를 다시 읽으면 실제 stage에 맞춰 segmented progress가 전진한다.
4. promotion 이전이면 numeric ETA 대신 `예상 시간 계산 중`을 본다.
5. upper를 넘긴 active job이면 delayed copy만 보여 주고 retry/redirect 계약은 유지한다.
6. 새로고침 또는 화면 이탈 뒤에도 DB snapshot으로 같은 stage를 복구한다.
7. terminal 성공/실패/만료 뒤 기존 review/retry/notification 흐름으로 이어진다.

## Delivery Checklist

> Stage 1에서는 모두 unchecked가 정상이다. 구현 evidence가 생긴 뒤에만 체크한다.

- [ ] job status exact 9-key success data와 nullable `progress` key 구현 <!-- omo:id=delivery-progress-status-contract;stage=2;scope=backend;review=3,6 -->
- [ ] `progress` exact 8-key field set과 terminal null semantics 구현 <!-- omo:id=delivery-progress-null-semantics;stage=2;scope=backend;review=3,6 -->
- [ ] stage floor `0/10/25/45/65/90`, active max 95, success 100 규칙 구현 <!-- omo:id=delivery-progress-stage-floors;stage=2;scope=backend;review=3,6 -->
- [x] private stage event가 `queued` 제외 attempt당 최대 5행을 지킴 <!-- omo:id=delivery-stage-event-cap;stage=2;scope=backend;review=3,6 -->
- [x] stale job/worker/lease/permit/attempt update `applied=false`, write 0 보장 <!-- omo:id=delivery-stale-write-zero;stage=2;scope=backend;review=3,6 -->
- [x] progress 기록 실패가 extraction/finalize를 failed로 바꾸지 않음 <!-- omo:id=delivery-progress-nonfatal;stage=2;scope=backend;review=3,6 -->
- [ ] numeric ETA promotion gate 전 hidden, 근거 부족 시 `예상 시간 계산 중` 유지 <!-- omo:id=delivery-eta-hidden-before-promotion;stage=2;scope=backend;review=3,6 -->
- [ ] delayed active job이 numeric ETA 없이 delayed copy만 표시 <!-- omo:id=delivery-delayed-copy;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 5초 polling, reload, background leave, retry CTA를 유지 <!-- omo:id=delivery-polling-reload-retry;stage=4;scope=frontend;review=5,6 -->
- [ ] `YT_IMPORT_BACKGROUND`의 segmented progress/copy regression을 새 evidence root에 고정 <!-- omo:id=delivery-low-risk-evidence-root;stage=4;scope=frontend;review=5,6 -->
- [ ] `loading / empty / error / read-only / unauthorized` 상태를 회귀시키지 않음 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] Stage 4 320/390/desktop screenshot과 browser flow evidence 확보 <!-- omo:id=delivery-320-390-desktop-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] product PR이 production mutation 0을 유지하고 `release-promoter`/rollout/first-30 관찰을 Manual Only로 분리 <!-- omo:id=delivery-manual-rollout-boundary;stage=2;scope=shared;review=3,6 -->
