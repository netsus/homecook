# Stage 2 Phase C — truthful worker progress evidence

## Scope

- parent worker의 exact job/worker/lease/permit/attempt fenced progress RPC
- immutable child bundle의 non-blocking progress IPC
- actual `source_fetch → video_download → frame_extraction → model_analysis → finalizing` boundary
- progress soft-fail과 heartbeat/permit fatal 경계
- finalize 전 ordered progress queue의 단일 최대 2초 bounded flush

ETA/API public projection, frontend, release promotion, production rollout은 이 evidence 범위가 아니다.

## TDD RED

구현 전 targeted suite에서 다음 6개 실패를 확인했다.

- parent fenced progress RPC와 finalizing report 없음
- child progress IPC allowlist/sequence 처리 없음
- progress 오류가 critical child RPC failure로 승격됨
- bounded pre-finalize flush 없음
- bundled Python source-ready/frame boundary marker 없음
- model analysis callback과 bundle manifest hash 갱신 없음

## GREEN

- targeted worker/bundle/release/provider suite
  - `4 files passed`, `151 tests passed`
- `pnpm verify:backend`
  - lint pass
  - typecheck pass
  - product `2809 passed`, `175 skipped`
  - production build pass
  - security E2E `12 passed`
- Python bundle source compile
  - pass
- immutable bundle manifest hash verification
  - pass

## Contract evidence

- child progress는 exact four-stage allowlist, increasing sequence, 512-byte bound, duration `1..86400|null`만 허용한다.
- `finalizing`은 child가 보낼 수 없고 parent만 resolve/finalize 직전에 같은 ordered queue로 보고한다.
- malformed/progress RPC error/`applied=false`는 extraction 결과를 바꾸지 않는다.
- heartbeat 또는 permit fence loss는 기존과 동일하게 abort/stale-fence다.
- Python은 source preparation 시작에 `video_download`, source가 준비된 뒤 frame 작업 전에 `frame_extraction`을 보낸다.
- model client는 유효한 frame 배열을 확인한 뒤에만 `model_analysis`를 보낸다.

## Independent review

- security review: Findings 0
- same-attempt forward skip은 공식 계약이며 parent no-jump 강제 대신 immutable bundle hash + boundary tests + DB monotonic authority를 사용한다.

## Boundaries

- Supabase Cloud/linked/remote 사용 0
- production mutation 0
- operational full-local destructive reset 0
- Phase D ETA/API와 Phase E frontend는 pending이다.
