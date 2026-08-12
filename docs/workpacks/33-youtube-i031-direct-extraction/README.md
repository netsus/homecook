# 33 YouTube i031 Direct Extraction

## Goal

기존 localhost YT_IMPORT 화면에서 사용자가 임의의 공개 YouTube 레시피 URL을 입력하면, `cv-goal-i031-ocr`과 같은 source 조합·adaptive frame 추출·두 단계 Codex Vision prompt/client로 레시피를 직접 추출하고 기존 검수·등록 흐름에 연결한다.

## User Approval

- 2026-07-26 사용자는 Claude를 더 이상 사용하지 않고 현재 Codex 작업이 문서, 구현, 검증, merge를 끝내도록 승인했다.
- 사용자는 Gemini/YouTube key 없는 유사 구현이 아니라 실험환경과 일치하는 i031 직접 실행을 요구했다.
- 정확한 source 수집 때문에 server-only `YOUTUBE_API_KEY`는 필요하고, Gemini key는 사용하지 않는다. `APIFY_TOKEN`은 무료 transcript 경로가 실패해 유료 fallback이 실제 선택될 때만 필요하다.
- 원격 모델은 비결정적이므로 같은 URL의 문구/점수를 매번 byte-for-byte 보장하지 않는다. 대신 코드, prompt, client, execution identity와 단계 구조를 고정한다.

## Dependencies

- `19-youtube-import`, `20-youtube-real-import`, `21-ingredient-dictionary`, `22-youtube-ingredient-registration`, `27-youtube-import-quality-uplift`, `27b-youtube-source-fallback`, `29-youtube-author-comment-fallback`
- `31-recipe-media-tags`와 `32-youtube-visual-quantity-enrichment`은 선행조건이 아니다. i031은 기존 thumbnail/session shape만 소비하고 32의 Gemini visual recipe/quantity provider를 strict mode에서 호출하지 않는다.
- 기존 endpoint: `POST /api/v1/recipes/youtube/validate`, `POST /api/v1/recipes/youtube/extract`, `POST /api/v1/recipes/youtube/register`
- 기존 화면: `/recipes/new/youtube`, `/menu/add/youtube`
- exact runtime prerequisites:
  - `@openai/codex 0.144.0-alpha.4`와 ChatGPT login
  - `YOUTUBE_API_KEY`
  - `ffmpeg`, `ffprobe`
  - Python `yt-dlp`, OpenCV
  - transcript paid fallback이 선택될 때만 `APIFY_TOKEN`

## Locked i031 Identity

| 항목 | 값 |
| --- | --- |
| final model | `gpt-5.4` |
| selector model | `gpt-5.4-mini` |
| final prompt | `keyframe-final-v44-explicit-action-clause` |
| selector prompt | `keyframe-selector-v6-single-compact-json` |
| source prompt | `single-recipe-four-source-v2` |
| client | `codex-vision-keyframes-client-v19-onscreen-amount-recovery` |
| execution signature | `704359dfb34df5ac1d070078` |
| frame extractor | `extract-video-frames-v7-adaptive-screen-ocr` |
| exact runtime options | `singleRecipeOnly=true`, `sourceMode=source-text`, `frameMode=hybrid`, `interval=4`, `hybridAnchorBudget=36`, selector candidates `12`, selected frame limit `8`, selector/final effort `low`, `screenOcrMode=auto`, cold model calls `2` |
| historical exact candidate fingerprint | `17f475ae308ca3fa514b0388f93701907e94b439410764f3b1d2e5f8ca65cc53` |
| historical experiment manifest | `9a587a879ba2ffbcd0a521587c460d2d42adff7b25951a143fa0c442890fae77` |
| service safe-subset manifest | `9adc7876a02c2da55a92e3a65369bf4e803c78efb9a791717201eedc242c1908` |

## Evidence Baseline

| 검증 | 결과 |
| --- | --- |
| historical completed Validation | promotion PASS |
| fresh exact Validation | ingredient F1 `0.935`, amount accuracy `0.730`, amount coverage `0.783`, step similarity `0.573`, semantic avg `3.875`, bottom-2 `3`, promotion PASS |
| fresh exact Train deterministic | ingredient F1 `0.958`, amount accuracy `0.600`, amount coverage `0.669`, step similarity `0.655`, threshold `0.675` 미달로 FAIL |
| holdout | 이번 release의 승인 근거 없음 |
| leakage | known video ID/title/recipe hardcoding 금지, fixture allowlist 외 source scan 필수 |

재현 bundle과 report는 구현 저장소에 runtime 코드로 그대로 복사하지 않는다. 복구 근거는 `/Users/cwj/01_vibe_coding/homecook-youtube-i031-parity-plan/.omx/logs/i031-exact-reproduction-20260726/`에 보존돼 있다.

`screenOcrMode=auto`는 항상 로컬 OCR을 실행한다는 뜻이 아니다. 설명란·작성자 댓글·caption이 충분하면 local screen OCR scout를 건너뛰고, source가 부족할 때 exact macOS Vision helper를 실행한다. 어느 경우든 selector는 후보 frame을 직접 읽는다.

서비스 번들은 원본 monolithic file에 함께 있던 비활성 `public-source` 제목 복구와 `segmented` 제목별 bridge를 inert 처리했다. 이 두 분기는 strict worker의 `sourceMode=source-text`, `recipeMode=single`, `singleRecipeOnly=true`에서 도달하지 않으므로 i031 활성 경로의 source/frame/selector/final 동작은 바뀌지 않는다. 대신 service manifest를 별도로 잠그고, test-only fixture의 profile Train/Validation/Holdout/excluded video ID 32개와 recipe title 51개가 production `.mjs`에 없음을 자동 검사한다.

## Scope

### Stage 1 contract

- 공식 5문서와 `CURRENT_SOURCE_OF_TRUTH`를 새 버전으로 동기화한다.
- Codex-only slice 예외, acceptance, automation, workflow item을 잠근다.
- internal 1.5 독립 Codex critic PASS 후 docs PR을 먼저 merge한다.

### Backend

- `YOUTUBE_RECIPE_EXTRACTOR_MODE=legacy|i031_codex_vision` server-only selector를 추가한다. 미설정은 `legacy`다.
- 실험 harness의 grader, corpus runner, promotion script는 복사하지 않는다.
- exact source collector, frame extraction, selector/final client에 필요한 production 최소 파일만 전용 server module 경계로 옮긴다.
- i031 출력 JSON을 기존 `YoutubeRecipeExtractData` 조립 단계 직전의 내부 recipe shape로 변환한다.
- 이후 기존 ingredient dictionary matcher, cooking method resolver, session 저장, register 흐름을 재사용한다.
- i031 mode는 Gemini, legacy parser, visual recipe/quantity provider로 fallback하지 않는다.
- timeout/abort/subprocess failure/invalid JSON은 기존 error wrapper로 실패한다.
- 요청별 임시 디렉터리를 만들고 `finally`에서 raw video/frame/intermediate output을 정리한다.
- safe metadata만 `extraction_meta_json.i031_extractor`에 저장한다.

### Frontend

- 기존 화면과 API client를 그대로 사용한다.
- extract 요청의 장시간 loading, 중복 제출 방지, error/retry가 실제 strict error와 연결되는지 검증한다.
- 새 화면, 설정 UI, key 입력 UI, model 표시 UI를 만들지 않는다.

## Frontend Delivery Mode

- 기존 YT_IMPORT의 `loading / error / retry / review / unauthorized` 상태와 login return-to-action을 그대로 사용한다.
- 새 UI를 만들지 않고 strict backend 결과와 실패를 기존 화면에 연결한다.
- desktop 1280px, mobile 390px에서 loading/error/review 회귀 screenshot과 console error 0을 확인한다.

## Design Authority

- UI risk: `low-risk` — 기존 화면 구조, navigation, interaction model을 바꾸지 않는 backend mode 연결
- Anchor screen dependency: 없음
- Generator artifact: N/A
- Critic artifact: N/A
- Authority status: `not-required`
- Evidence plan: Stage 4에서 기존 YT_IMPORT desktop/mobile loading, error/retry, review 화면을 회귀 캡처한다.

## Design Status

- [ ] 임시 UI (temporary) — 해당 없음
- [ ] 리뷰 대기 (pending-review) — 해당 없음
- [x] 확정 (confirmed) — 기존 YT_IMPORT 화면 구조와 component를 변경하지 않는 low-risk 연결
- [ ] N/A — 화면 없는 BE-only 슬라이스

> 기존 confirmed YT_IMPORT를 그대로 재사용하므로 Stage 1 design generator/critic과 Stage 5 authority review는 필요하지 않다. Stage 4는 기능 연결과 회귀 screenshot만 남긴다.

## Service Module Boundary

```text
existing route
  -> youtube-import mode selector
    -> legacy pipeline (unchanged)
    -> i031 adapter
       -> preflight
       -> exact public-source collector
       -> temp video + adaptive frames
       -> exact selector
       -> exact final extraction
       -> schema validation
  -> existing ingredient/cooking-method resolution
  -> existing draft session/register
```

## Failure, Security, Cost And Observability

- 전체 실행 상한은 20분이며 selector/final child process에도 timeout과 abort signal을 전달한다.
- retry는 exact client가 가진 범위만 허용한다. route wrapper에서 모델 호출을 추가 반복하지 않는다.
- concurrent i031 요청은 localhost 기본 1개로 제한하고 초과 요청은 실패 또는 대기 상한 후 실패시킨다.
- raw URL, cookies, access token, API key, Codex credential, prompt body, raw media/provider payload를 log/DB/response에 기록하지 않는다.
- subprocess argument에 secret을 넣지 않고 env로만 전달한다. client bundle에 server env가 포함되지 않는지 검사한다.
- 로그는 correlation ID, safe stage, duration, exit/status, frame/model call count, non-reversible hash만 남긴다.
- 실패 단계와 cleanup 결과를 구조화해 운영 event에 기록하되 raw provider response는 금지한다.

## Rollout And Rollback

1. 기본값 `legacy`로 merge한다.
2. localhost에서 prerequisites와 Codex login을 확인한다.
3. `YOUTUBE_RECIPE_EXTRACTOR_MODE=i031_codex_vision`으로 임의 공개 URL smoke를 수행한다.
4. 정확도 회귀, 비용, timeout, leakage를 확인하기 전 preview/production에는 켜지 않는다.
5. rollback은 env를 `legacy`로 돌리고 프로세스를 재시작한다. 요청 단위 자동 fallback은 없다.

## Out Of Scope

- Vercel/production worker 배포
- holdout promotion 승인
- 새 public endpoint/field/error code
- 새 DB table/column/migration
- Gemini API fallback
- 특정 영상 결과 하드코딩
- 실험 grader/harness를 서비스 runtime에 포함
- UI redesign

## Required Verification

- exact identity/hash guard unit test
- mode selector default/strict unit test
- missing prerequisite, timeout, abort, invalid JSON, subprocess non-zero, cleanup regression test
- Gemini/legacy provider non-call assertion in i031 mode
- i031 result의 기존 ingredient matcher/session/register integration test
- secret/raw URL/raw frame 비저장 test
- no known video ID/title/recipe source scan
- `pnpm verify:backend`, `pnpm verify:frontend`, lint, typecheck, workflow/workpack validation
- localhost arbitrary public URL smoke와 기존 화면 screenshot/console 확인
- 독립 Codex code/security review와 current-head CI 전체 green

## Delivery Checklist

구현 완료 상태는 metadata가 잠긴 `acceptance.md`에서 관리한다. 이 섹션은 workflow v2 closeout validator가 workpack의 Delivery Checklist 경계를 확인할 수 있도록 유지한다.

## Stage 4/6 Closeout Evidence — 2026-08-12

- non-manual Stage 4 acceptance 8건은 [closeout evidence](./evidence/2026-08-12-stage4-6-closeout.md)의 retained real smoke와 current-head deterministic/browser 근거로 완료했다.
- TDD 수리는 loading 중 동기식 중복 제출 차단, explicit retry 재실행, 320px 진행 단계 단일 행 유지에만 제한했다. 새 화면·key/model 설정 UI·공개 API 계약은 추가하지 않았다.
- desktop 1280px, mobile 390px, mobile 320px에서 loading/error/retry/review를 캡처했고 console/page/HTTP error와 text overlap을 자동 검사했다.
- roadmap은 `in-progress`를 유지한다. Draft PR의 current-head checks와 독립 Stage 6 검토·merge가 모두 끝나야 `accept-i031-current-head-green`을 완료할 수 있다.
- 사용자 임의 URL 최종 확인, Holdout/preview/production 승인, production macOS worker와 운영 secret 승인은 계속 Manual Only다.

## Handoff

Stage 1 docs PR `#1107`과 internal 1.5 PASS는 `master`에 merge됐다. 구현 branch는 safe production subset, runtime preflight/manifest/timeout/cleanup, 기존 import adapter와 tests를 포함한다. 2026-07-26 평가 외 공개 단일 레시피 영상 1건을 production TypeScript runner로 세 번 실행해 `42.41s`, hardening 후 `51.03s`, 누수 제거 후 `52.78s`에 recipe, 36 frames, 8 selected frames, model call 2회를 확인했고 임시 작업 폴더가 남지 않았다. 같은 날 localhost fixture E2E는 mobile Chrome/iPhone SE에서 10건 PASS했고 공식 `verify:frontend`도 전체 통과했다. 사용자 로그인 상태에서 자신의 임의 링크를 최종 확인하는 Manual Only 항목과 fresh sealed Holdout은 별도 완료선이다.
