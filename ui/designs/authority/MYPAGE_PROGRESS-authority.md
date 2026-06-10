# Authority Report: MYPAGE_PROGRESS

> slice: `33b-mypage-progress-ui`
> stage: 4 authority precheck
> reviewer: Codex
> date: 2026-06-10

## Design Status

**reviewed**

MYPAGE 프로필 영역의 하드코딩 레벨 문구를 실제 `GET /api/v1/users/me/progress`
응답 기반 compact progress UI로 교체했다. 33b 범위는 레벨/XP/progress bar만
포함하며, 배지/퀘스트/토스트/튜토리얼/가이드 모달은 33c로 유지했다.

## Changes Summary

- 모바일 프로필 subtitle의 `🍳 집밥 러너 · 레벨 5`를 제거하고 로그인 제공자 문구와 inline progress bar로 대체했다.
- 데스크톱 profile card 안에도 같은 서버 progress UI를 배치했다.
- progress fetch는 profile/recipebook 로딩을 막지 않으며, 실패 시 progress 영역만 fallback copy를 표시한다.
- progress bar는 `progress_percent`, 레벨은 `current_level`, XP 문구는 `xp_to_next_level`과 `total_xp`만 사용한다.
- zero-progress는 error가 아닌 시작 상태로 표시한다.

## Contract / State Risk

- API/DB/schema 변경 없음.
- `GET /api/v1/users/me/progress`만 새로 소비한다.
- `GET /api/v1/users/me`는 profile/settings-only 계약을 유지한다.
- 클라이언트에서 XP threshold나 level curve를 계산하지 않는다.
- progress UI는 조회 전용이며 편집/claim/reward/guide 액션이 없다.
- 401은 기존 MYPAGE auth gate로 넘기고, 5xx/network/invalid response는 progress 영역 soft-fail로 격리한다.

## Evidence

> evidence:
> - mobile 390 success: `ui/designs/evidence/33b-mypage-progress-ui/mobile-390.png`
> - mobile 320 success: `ui/designs/evidence/33b-mypage-progress-ui/mobile-320.png`
> - desktop 1440 success: `ui/designs/evidence/33b-mypage-progress-ui/desktop-1440.png`
> - mobile 390 progress error: `ui/designs/evidence/33b-mypage-progress-ui/mobile-390-error.png`

## Verification

- `pnpm vitest run tests/user-progress-api-client.test.ts tests/mypage-progress-card.test.tsx tests/mypage-screen.test.tsx` - passed, 57 tests.
- `pnpm vitest run tests/user-progress-route.test.ts tests/user-progress-level.test.ts tests/user-progress-events.test.ts` - passed, 15 tests.
- `pnpm exec playwright test tests/e2e/slice-17a-mypage.spec.ts --project=desktop-chrome --project=mobile-chrome --grep "shows profile and recipe books|keeps MYPAGE usable when the progress endpoint fails|no content overlaps bottom nav"` - passed, 6 tests.
- `pnpm exec playwright test tests/e2e/slice-17a-mypage.spec.ts --project=desktop-chrome --project=mobile-chrome --project=mobile-ios-small --grep "no content overlaps bottom nav"` - passed, 3 tests.
- `curl -i http://127.0.0.1:3100/api/v1/users/me/progress` against local dev + local Supabase - returned 401 `UNAUTHORIZED` envelope.
- `pnpm qa:eval -- --checklist .artifacts/qa/33b-mypage-progress-ui/stage4-final/exploratory-checklist.json --report .artifacts/qa/33b-mypage-progress-ui/stage4-final/exploratory-report.json --fail-under 90` - passed, score 100/100.
- `pnpm typecheck` - passed.
- `pnpm lint` - passed.
- `pnpm verify:frontend:pr` - passed.
- `pnpm verify:frontend` - failed with 46 existing broader regression failures; the directly related MYPAGE bottom-nav failure was fixed and the targeted MYPAGE checks passed afterward.
- Screenshot capture script generated 390px, 320px, desktop 1440px, and progress-error evidence.
- Claude final Stage 4 review via session `c2d15736-d4d8-430f-9028-debee1c90df6` - `Verdict: OK`, blockers/major/minor 0.

## Scorecard

| Dimension | Score | Notes |
| --- | --- | --- |
| Mobile Fit | 5/5 | 390px와 320px에서 level, percent, XP copy, bar가 프로필 영역 안에 맞고 하단 내비 겹침 회귀도 통과한다. |
| Information Hierarchy | 4/5 | 모바일 progress는 프로필 텍스트 안의 inline bar로 보이고, 데스크톱은 profile card 안의 compact card로 기존 stats/레시피북 흐름을 밀어내지 않는다. |
| Contract Safety | 5/5 | dedicated progress endpoint만 소비하고 `/users/me` 계약은 유지했다. |
| Error Handling | 5/5 | progress error 상태에서도 프로필, stats, 레시피북 진입이 유지된다. |
| 33c Separation | 5/5 | 배지/퀘스트/토스트/튜토리얼 UI를 추가하지 않았다. |

## Verdict

verdict: pass

**PASS** - `33b-mypage-progress-ui` Stage 4 구현은 compact progress UI 기준을 충족한다.

- Blockers: 0
- Major issues: 0
- Minor issues: 0
