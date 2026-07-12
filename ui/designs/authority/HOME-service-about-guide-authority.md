# HOME Service About Guide Design Authority

- 검수일: 2026-07-12
- 대상: mobile `HOME`의 `집밥 둘러보기` anchor extension
- verdict: `pass`
- visual score: `95 / 100`
- 다음 행동: 바로 진행 가능. 승인된 좁은 supersession 밖의 변화는 관찰되지 않았다.
- 접근성 재검수: guide badge 글자색을 깊은 브랜드 파랑 `#005b91`로 조정한 after evidence를 재검수했고, `pnpm test:e2e:a11y:core`는 `8 passed / 1 skipped`다.

> evidence:
> - mobile 390 before: `ui/designs/evidence/service-about-guide/HOME-before-390.png`
> - mobile 390 after: `ui/designs/evidence/service-about-guide/HOME-after-390.png`
> - mobile 320 before: `ui/designs/evidence/service-about-guide/HOME-before-320.png`
> - mobile 320 after: `ui/designs/evidence/service-about-guide/HOME-after-320.png`
> - theme loading: `ui/designs/evidence/service-about-guide/HOME-theme-loading-390.png`
> - theme empty/error guide-only: `ui/designs/evidence/service-about-guide/HOME-guide-only-390.png`
> - filter-active rail hidden: `ui/designs/evidence/service-about-guide/HOME-filter-hidden-320.png`

## 판정 요약

기존 추천 테마 영역을 `집밥 둘러보기`로 확장한 변경은 승인된 다섯 항목에 한정되어 있다. guide card가 첫 항목으로 추가됐지만 기존 theme image card와 같은 높이·폭·모서리 언어를 사용하고, badge와 soft surface로 navigation 역할을 구분한다. 320px에서 다음 theme card가 보이는 localized rail affordance가 유지되며 화면 전체 가로 넘침이나 레이아웃 붕괴는 관찰되지 않는다.

## Scorecard

| 항목 | 점수 | 근거 |
| --- | ---: | --- |
| mobile UX | 19/20 | `빠른 이동 → 집밥 둘러보기 → 모든 레시피` 흐름이 좁은 화면에서도 짧고 연속적이다. |
| interaction clarity | 19/20 | 대비가 강화된 guide badge/soft surface와 theme의 이미지 카드가 역할을 구분하며 next-card peek가 swipe 가능성을 알린다. |
| visual hierarchy | 19/20 | rail heading, 카드, recipe entry가 과한 여백 없이 이어진다. |
| color/material fit | 20/20 | `#005b91` badge text가 기존 blue/white card 언어를 보존하면서 밝은 badge surface와 충분히 구분된다. |
| familiar pattern fit | 18/20 | localized horizontal rail과 guide-only 단일 카드가 일반적인 mobile discovery 패턴에 맞는다. |

## Mobile default / narrow

- 390px guide-only evidence에서 빠른 이동 다음에 `집밥 둘러보기`, 그 다음 recipe loading 영역이 이어져 승인된 섹션 순서를 확인할 수 있다.
- guide card 높이는 evidence 기준 144px이고 heading·rail·하단 여백을 합친 section은 약 207px로 `220px 이하` 잠금을 만족한다.
- 320px after evidence에서도 card 높이 144px가 유지되고 두 번째 theme card가 충분히 보여 horizontal swipe 가능성을 알린다.
- rail 바깥 app bar, 검색, tag rail, recipe card, bottom tabs의 재질과 배치 언어는 BEFORE와 동일하게 유지된다.
- 390px after에서는 rail 직후 `모든 레시피` heading과 첫 recipe card가 진입해 새 영역이 핵심 콘텐츠를 과도하게 아래로 밀지 않는다.

## Special states

- `HOME-theme-loading-390.png`: guide/theme placeholder rail과 구분선 아래 recipe loading이 독립적으로 보여 한 상태가 다른 영역을 가리지 않는다.
- `HOME-guide-only-390.png`: theme empty/error에서 실제 guide card 하나만 남고 존재하지 않는 다음 항목을 암시하는 image/fade가 없다.
- `HOME-filter-hidden-320.png`: 검색 활성 시 빠른 이동과 guide/theme rail이 모두 사라지고 `검색 결과`가 바로 우선된다.
- `HOME-after-320.png`: ready 상태의 compact rail과 next-card peek가 320px에서도 레이아웃을 밀지 않는다.

## Accessibility

- guide card는 `가이드` badge와 설명 문구를 사용하고 theme card는 이미지·레시피 수를 사용해 시각적으로 역할을 구분한다.
- guide badge 글자색 `#005b91`은 밝은 badge surface에서 명확히 읽히며, 수정 후 core axe 검증이 `8 passed / 1 skipped`로 통과했다.
- card 자체의 폭과 높이는 44px 최소 터치 영역보다 충분히 크다.
- next-card peek는 rail 내부에서만 나타나며 page-level overflow처럼 보이지 않는다.
- Link와 `aria-pressed` button의 실제 의미 구조는 screenshot만으로 확정하지 않으므로 Stage 4 자동화 계약을 그대로 유지해야 한다.

## Supersession ledger

| 차이 | 분류 | 판정 |
| --- | --- | --- |
| 추천 rail 위치 이동 | 사용자 승인 기능 계약 | 허용 |
| heading `집밥 둘러보기` | 사용자 승인 기능 계약 | 허용 |
| 첫 guide card 추가 | 사용자 승인 기능 계약 | 허용 |
| guide-only fallback | 사용자 승인 기능 계약 | 허용 |
| compact rail geometry | 사용자 승인 기능 계약 | 허용 |
| rail 밖 visual difference | unclassified | 0개 |

## Findings

### Blocker

- 없음.

### Major

- 없음.

### Minor

- 일부 캡처 하단에 검은 원형 포인터 overlay가 남아 있다. 제품 UI와 무관하며 외부 공유용 이미지만 재캡처하면 된다.

## Before-merge 권고

- 디자인 blocker 0으로 바로 진행 가능하다.
- guide badge 대비 수정과 재캡처 후에도 visual-verdict `95 / pass`, core axe `8 passed / 1 skipped`를 유지한다.
- mixed Link/button 의미 구조, 320px `scrollWidth === clientWidth`, filter-active 숨김은 Playwright 결과와 함께 최종 확인한다.
