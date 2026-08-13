# Workpack 33 Stage 4/6 Closeout Evidence

## Snapshot

- date: `2026-08-12 KST`
- clean base: `origin/master@ed1982a138ef67692aa17a3c014811bb255cb06d`
- implementation commit: `020bfbb5fd0fcfef5f060a7d68495ef6c00ef1c6`
- Draft PR: [#1341](https://github.com/netsus/homecook/pull/1341)
- lifecycle: `in_progress`
- authority boundary: 이 문서는 closeout 후보 근거를 준비하며, 작성자가 final Stage 6 승인이나 merge를 수행하지 않는다.

## Exact Acceptance Recalculation

최신 `origin/master` 기준 non-manual 미완료는 처음 9건이었다.

1. `accept-i031-localhost-arbitrary-url`
2. `accept-i031-loading-submit-lock`
3. `accept-i031-error-retry`
4. `accept-i031-no-new-settings-ui`
5. `accept-i031-browser-quality`
6. `accept-i031-playwright-flow`
7. `accept-i031-live-evidence-split`
8. `accept-i031-frontend-gates`
9. `accept-i031-current-head-green`

이 작업은 1~8을 아래 근거로 닫는다. 9는 모든 current-head check, 독립 Stage 6 승인, merge를 함께 요구하므로 체크하지 않는다.

## Live Evidence And Deterministic Evidence Split

### Retained real smoke

- source: merged [PR #1110](https://github.com/netsus/homecook/pull/1110), content head `db0b838a7e4d568c4e11a6ff9c5117fef4c8d476`, merge `438f5f9b83d0676d61d8d51d5e31ca96ee9b0a91`
- environment: macOS localhost production TypeScript runner, exact Codex CLI `0.144.0-alpha.4`, `gpt-5.4`/`gpt-5.4-mini`
- input: 평가 데이터셋과 무관한 공개 단일 레시피 URL 1건
- result: 3회 성공 `42.41s`, `51.03s`, `52.78s`; frames `36`; selected frames `8`; model calls `2`; remaining temp directories `0`
- repository source: `docs/engineering/youtube-codex-vision-ocr-production-integration-plan.md`와 이 workpack README Handoff

이 retained smoke는 임의 공개 URL의 strict production 경로 성공 근거다. 현재 작업 환경에는 task-scoped `YOUTUBE_API_KEY`, `APIFY_TOKEN`, Supabase 운영 credential이 설정되지 않아 fresh provider run을 가장하지 않았다. credential 값은 읽거나 출력하지 않았다.

### Current deterministic/browser evidence

- `tests/e2e/slice-33-youtube-i031-direct-extraction.spec.ts`
- loading 중 연속 click/Enter 요청이 프로젝트별 정확히 1회만 전송됨
- strict `502 PROVIDER_ERROR`가 기존 error/retry로 표시되고 retry가 review state로 복구됨
- settings/key/model UI 부재
- desktop 1280px, mobile 390px, mobile 320px에서 horizontal overflow `<= 1px`, capability overlap `false`, progress labels single-line
- browser console error `0`, page error `0`, unexpected HTTP error `0`

Screenshots:

- `ui/designs/evidence/33-youtube-i031-direct-extraction/desktop-1280-{loading,error-retry,review}.png`
- `ui/designs/evidence/33-youtube-i031-direct-extraction/mobile-390-{loading,error-retry,review}.png`
- `ui/designs/evidence/33-youtube-i031-direct-extraction/mobile-320-{loading,error-retry,review}.png`

## TDD Repair Evidence

1. duplicate-submit RED: extract request expected `1`, actual `3`
2. retry RED: existing retry button kept the component at `extracting` without rerunning the effect
3. 320px RED: progress label line-count `[1, 1, 2, 1]`
4. GREEN: synchronous in-flight guard, explicit extraction attempt token, and narrow progress typography made the same tests pass

No new dependency, endpoint, field, settings screen, key input, or model selector was added.

## Verification

| Command / evidence | Result |
| --- | --- |
| related Vitest: i031 runtime, backend import, Recipio import | `3 files / 116 passed` |
| workpack 33 Playwright, all configured projects | `7 passed / 2 intentional evidence-matrix skips` |
| `pnpm verify:frontend` product tests | `237 files passed / 12 skipped; 2729 passed / 175 skipped` |
| `pnpm verify:frontend` build/Lighthouse | Next.js production build `81` pages; Lighthouse `6` runs passed |
| full regression rerun | `942 passed / 174 skipped / 0 failed` |
| accessibility / visual / security | `18 passed / 15 skipped`; `22 passed / 23 skipped`; `12 passed` |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:32133 pnpm verify:backend` | lint, typecheck, product tests, build, security `12 passed` |

첫 full regression 실행에서 workpack 밖 `prepared-food-planner-entry` axe 1건이 병렬 loading-state timing으로 실패했다. 동일 exact test 즉시 재실행은 `1 passed`, 이어서 전체 regression 재실행은 `942 passed / 174 skipped / 0 failed`였다. 다른 작업자가 사용 중인 `3100` 포트는 종료하지 않고 Playwright를 격리 포트 `32133`에서 실행했다.

## Remaining Manual Only And Review Gate

- 사용자가 localhost에서 자신의 임의 공개 YouTube 레시피 URL 결과를 최종 확인
- Holdout promotion과 preview/production i031 enablement 별도 승인
- Vercel 외 production macOS worker 설치와 운영 secret 별도 승인
- 독립 Stage 6 reviewer는 Draft PR #1341의 최종 exact head와 해당 head에서 시작된 모든 GitHub check를 다시 확인해야 한다.
