# HOME Authority Review

> 대상 slice: `h1-home-first-impression` Stage 5 authority review
> evidence:
> - `ui/designs/evidence/h1-home-first-impression/HOME-before-mobile.png`
> - `ui/designs/evidence/h1-home-first-impression/HOME-after-mobile.png`
> - `ui/designs/evidence/h1-home-first-impression/HOME-after-narrow.png`
> - `ui/designs/evidence/h1-home-first-impression/HOME-after-scrolled.png`
> - `ui/designs/evidence/h1-home-first-impression/HOME-filter-active.png`
> - `ui/designs/evidence/h1-home-first-impression/HOME-sort-active.png`
> - `ui/designs/evidence/h1-home-first-impression/HOME-carousel-strip.png`
> - design reference: `ui/designs/HOME.md`
> - critique reference: `ui/designs/critiques/HOME-critique.md`
> - implementation reference: `components/home/home-screen.tsx`
> 검토일: 2026-04-17
> 검토자: product-design-authority (Stage 5 review by Codex)

## Verdict

- verdict: `pass`
- 한 줄 요약: H1 redesign 이후 `HOME`은 검색과 재료 필터를 first viewport의 주인공으로 유지하면서도, compact carousel strip 덕분에 `모든 레시피 [정렬▾]` 헤더가 첫 화면 안에 자연스럽게 들어와 더 이상 설명성 패널이나 내부 데모처럼 보이지 않는다.

## Scorecard

| 항목 | 점수 | 메모 |
|------|------|------|
| Mobile UX | 4/5 | 390px에서 섹션 헤더가 first viewport 안에 들어오고, 320px에서도 필터 단독 행이 안정적이다. |
| Interaction Clarity | 4/5 | 검색/재료 필터는 discovery 영역, 정렬은 `모든 레시피` 헤더라는 의미 구분이 명확하다. |
| Visual Hierarchy | 4/5 | 검색바 → 필터 → 테마 strip → 레시피 리스트 순서가 분명하고, 이전보다 실제 콘텐츠가 빨리 보인다. |
| Color / Material Fit | 4/5 | 기존 warm kitchen 톤을 유지하면서도 compact strip과 muted sort pill이 과한 장식 없이 정리됐다. |
| Familiar App Pattern Fit | 4/5 | 검색 우선 + compact editorial strip + 대상 섹션 정렬 패턴이 요즘 모바일 콘텐츠 탐색 앱과 잘 맞는다. |

## Evidence Notes

- `HOME-before-mobile.png` 대비 `HOME-after-mobile.png`에서 가장 큰 차이는 테마 영역의 compact strip 전환과 `모든 레시피 [정렬▾]` 헤더의 first viewport 진입이다.
- `HOME-after-mobile.png`에서 검색바와 재료 필터는 여전히 가장 강한 discovery block으로 읽히고, 테마 strip은 보조 editorial 영역으로 한 단계 낮아졌다.
- `HOME-after-narrow.png`는 320px sentinel 폭에서도 discovery panel과 carousel strip, `모든 레시피` 헤더가 겹치거나 잘리지 않음을 보여준다.
- `HOME-after-scrolled.png`에서 carousel 이후 레시피 그리드로 자연스럽게 이어지고, page-level horizontal overflow 징후는 없다.
- `HOME-sort-active.png`는 정렬 bottom sheet가 `모든 레시피` 대상과 가깝게 열리며, grid와 시각적으로 충돌하지 않는다는 점을 보여준다.
- `HOME-carousel-strip.png`는 strip 자체가 과도한 높이를 차지하지 않고, localized horizontal scroll로 제한되어 있음을 보여준다.

## Resolved Since Previous Baseline

| # | 항목 | 이전 문제 | 현재 상태 |
|---|------|----------|----------|
| 1 | first viewport 밀도 | 테마 2열 그리드가 상단을 크게 차지해 `모든 레시피`와 정렬이 스크롤 아래로 밀렸다. | 해소. compact strip 전환으로 `모든 레시피 [정렬▾]` 헤더가 first viewport 안에 들어온다. |
| 2 | 섹션 위계 | 테마 섹션과 모든 레시피가 같은 2열 그리드여서 정보 위계가 약했다. | 해소. 테마는 compact strip, 목록은 2열 카드 그리드로 역할이 분리됐다. |
| 3 | control proximity | 정렬이 대상 콘텐츠와는 맞지만, first viewport에서 보이지 않아 체감상 멀었다. | 해소. 정렬은 같은 헤더에 유지하면서도 viewport 안으로 올라왔다. |
| 4 | first impression tone | discovery panel과 콘텐츠 사이 간격이 길어 웹 프로토타입처럼 느껴질 여지가 있었다. | 해소. 검색 우선 구조는 유지하면서 콘텐츠 진입 지점이 빨라졌다. |

## Major Issues

없음.

## Minor Issues

| # | 위치 | 문제 | 제안 |
|---|------|------|------|
| 1 | carousel affordance | 현재 evidence는 단일 테마 카드 데이터 기준이라 `1.5장 peek`의 체감이 실제 2개 이상 데이터보다 약하게 보일 수 있다. | 실제 운영 데이터가 늘어났을 때 peek/gradient hint 조합을 한 번 더 확인한다. |
| 2 | filter-active evidence | `HOME-filter-active.png`는 활성 상태 경로를 담고 있지만, 선택 개수 강조가 강하게 드러나는 장면으로는 다소 보수적이다. | 후속 polish 또는 evidence refresh 시 active count가 더 분명한 상태를 남긴다. |

## Decision

- Stage 4 진행 가능 여부: `완료`
- Stage 5 confirmed 가능 여부: `가능`
- 다음 행동:
  - `ui/designs/HOME.md`와 현재 구현은 H1 계약과 일치하는 상태로 유지한다.
  - workpack `Design Status`를 `confirmed`로 올리고 authority review closeout을 닫는다.
  - FE PR에서는 updated Linux visual baselines와 함께 policy/template/visual green을 확인한 뒤 merge 판단으로 넘어간다.

## Stage 5 Conclusion (H1)

- **신규 blocker**: 없음
- **신규 major**: 없음
- **신규 minor**: 2개
- **잔존 major**: 없음
- **최종 verdict**: `pass`
- `HOME` H1 compact carousel hybrid baseline은 evidence, 설계 문서, 구현이 서로 일치하며 anchor-screen redesign으로서 merge 가능한 수준이다.
