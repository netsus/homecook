# RECIPE_DETAIL Recipe Nutrition Authority Review

> Slice: `recipe-nutrition-calculation`
> Classification: `anchor-extension`
> Stage: 5/final authority
> Date: 2026-07-16
> Reviewer: author-separated Codex visual authority
> Visual verdict: `ui/designs/evidence/recipe-nutrition-calculation/visual-verdict.json`

> evidence:
> - 390px before: `ui/designs/evidence/recipe-nutrition-calculation/recipe-detail-before-390-final.png`
> - 390px approved after: `ui/designs/evidence/recipe-nutrition-calculation/recipe-detail-after-390-approved.png`
> - 320px before: `ui/designs/evidence/recipe-nutrition-calculation/recipe-detail-before-320-final.png`
> - 320px approved after: `ui/designs/evidence/recipe-nutrition-calculation/recipe-detail-after-320-approved.png`
> - desktop before: `ui/designs/evidence/recipe-nutrition-calculation/recipe-detail-before-desktop.png`
> - desktop after: `ui/designs/evidence/recipe-nutrition-calculation/recipe-detail-after-desktop.png`
> - desktop scrolled: `ui/designs/evidence/recipe-nutrition-calculation/recipe-detail-after-desktop-scrolled.png`
> - 390px nutrition card: `ui/designs/evidence/recipe-nutrition-calculation/recipe-detail-nutrition-card-390.png`
> - 320px nutrition card: `ui/designs/evidence/recipe-nutrition-calculation/recipe-detail-nutrition-card-320.png`
> - desktop nutrition card: `ui/designs/evidence/recipe-nutrition-calculation/recipe-detail-nutrition-card-desktop.png`
> - partial: `ui/designs/evidence/recipe-nutrition-calculation/recipe-detail-partial.png`
> - missing: `ui/designs/evidence/recipe-nutrition-calculation/recipe-detail-unavailable.png`
> - normal unavailable: `ui/designs/evidence/recipe-nutrition-calculation/recipe-detail-normal-unavailable.png`
> - temporary isolated: `ui/designs/evidence/recipe-nutrition-calculation/recipe-detail-temporarily-unavailable.png`
> - temporary desktop approved: `ui/designs/evidence/recipe-nutrition-calculation/recipe-detail-temporarily-unavailable-context-desktop-approved.png`
> - loading isolated: `ui/designs/evidence/recipe-nutrition-calculation/recipe-detail-nutrition-loading.png`
> - loading desktop: `ui/designs/evidence/recipe-nutrition-calculation/recipe-detail-nutrition-loading-context-desktop-final.png`
> - COOK_MODE regression: `ui/designs/evidence/recipe-nutrition-calculation/recipe-detail-cook-mode-no-serving-control.png`
> - visual verdict: `ui/designs/evidence/recipe-nutrition-calculation/visual-verdict.json`

## Verdict

- verdict: `pass`
- score: `96/100`
- blocker: `0`
- 한 줄 요약: 기존 Recipe Detail 흐름과 CTA를 보존하면서 1인분·선택 인분 예상 영양, 결측 상태, 출처와 계산 한계를 모바일·데스크톱에서 읽기 쉽게 추가했다.

## Required Evidence

| 검토 범위 | Before | After |
| --- | --- | --- |
| 390×844 | `ui/designs/evidence/recipe-nutrition-calculation/recipe-detail-before-390-final.png` | `ui/designs/evidence/recipe-nutrition-calculation/recipe-detail-after-390-approved.png` |
| 320×568 | `ui/designs/evidence/recipe-nutrition-calculation/recipe-detail-before-320-final.png` | `ui/designs/evidence/recipe-nutrition-calculation/recipe-detail-after-320-approved.png` |
| desktop | `ui/designs/evidence/recipe-nutrition-calculation/recipe-detail-before-desktop.png` | `ui/designs/evidence/recipe-nutrition-calculation/recipe-detail-after-desktop.png` |

추가 증거:

- desktop 스크롤: `recipe-detail-after-desktop-scrolled.png`
- 390/320/desktop 영양 카드: `recipe-detail-nutrition-card-390.png`, `recipe-detail-nutrition-card-320.png`, `recipe-detail-nutrition-card-desktop.png`
- partial/missing/normal unavailable/temporary/loading: `recipe-detail-partial.png`, `recipe-detail-unavailable.png`, `recipe-detail-normal-unavailable.png`, `recipe-detail-temporarily-unavailable.png`, `recipe-detail-nutrition-loading.png`
- 전체 문맥의 loading/temporary: `recipe-detail-nutrition-loading-context-desktop-final.png`, `recipe-detail-temporarily-unavailable-context-desktop-approved.png`
- COOK_MODE 회귀: `recipe-detail-cook-mode-no-serving-control.png`

## Authority Checks

| 항목 | 결과 | 근거 |
| --- | --- | --- |
| 기존 화면 위계 | pass | 인분 조절 다음에 영양 카드가 추가되고 재료·만들기·우측 행동 카드 순서는 유지된다. |
| 390px/320px containment | pass | 카드와 표가 좌우 여백 안에 있고 page-level 가로 overflow가 없다. |
| CTA와 하단 내비 | pass | 고정 CTA와 네 개 하단 탭이 잘리지 않고 영양 카드와 겹치지 않는다. |
| 선택 인분 이해 | pass | `1인분`과 `선택 3인분 전체` 열, 44px 이상 증감 버튼, 인분 안내가 함께 보인다. |
| 상태 구분 | pass | complete, partial, missing, normal unavailable, temporary error, loading이 문구와 구조로 구분된다. |
| 접근성과 문구 | pass | `약`, `최소`, `정보 준비 중`, `다시 시도`를 색상에 의존하지 않고 텍스트로 전달한다. |
| read-only와 출처 | pass | source/profile/snapshot 편집 제어 없이 승인된 최소 출처와 계산 한계만 노출한다. |
| COOK_MODE | pass | 인분 조절과 영양 카드가 추가되지 않아 기존 요리 흐름을 유지한다. |

## Review Iterations

- 초기 비교 증거는 Chromium 고정 레이어 캡처 과정에서 검은 합성 영역이 생겨 authority에서 거부됐다. 이는 제품 화면 결함이 아니라 screenshot artifact였지만 손상 증거로는 승인하지 않았다.
- 고정 레이어를 변형하지 않는 직접 viewport 캡처를 한 worker에서 다시 실행해 390px, 320px, temporary desktop 증거를 교체했다. 승인 경로는 일반 병렬 회귀가 쓰는 `candidate` 경로와 분리해 이후 테스트가 덮어쓰지 못한다.
- immutable 승인 경로만 본 독립 Codex 최종 검토는 `96/100`, blocker `0`, finding `0`으로 판정했다.

## Decision

- Stage 5 authority: `pass`
- final authority: `pass`
- Design Status: `confirmed`
- 남은 UI blocker: 없음

실제 물리 기기와 운영 환경 출처·라이선스 표시는 Manual Only 후속 검증으로 남긴다. 이 보고서는 격리된 fixture 브라우저 증거를 운영 배포 승인으로 해석하지 않는다.
