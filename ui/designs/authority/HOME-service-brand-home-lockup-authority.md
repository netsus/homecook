# HOME Service Brand Lockup — Final Authority

- verdict: `pass`
- reviewer: role-separated Codex `home_lockup_design_review`
- visual-verdict: `98 / 100` (iteration 2)
- blocker / major / minor: `0 / 0 / 0`
- Design Status: `confirmed`
- review result: `APPROVE`

> evidence:
> - `ui/designs/evidence/service-brand-home-lockup/HOME-before-390.png`
> - `ui/designs/evidence/service-brand-home-lockup/HOME-before-320.png`
> - `ui/designs/evidence/service-brand-home-lockup/HOME-desktop-before-1280.png`
> - `ui/designs/evidence/service-brand-home-lockup/HOME-after-390.png`
> - `ui/designs/evidence/service-brand-home-lockup/HOME-after-320.png`
> - `ui/designs/evidence/service-brand-home-lockup/HOME-desktop-after-1280.png`
> - `ui/designs/evidence/service-brand-home-lockup/HOME-accessibility-geometry-audit.json`
> - `ui/designs/evidence/service-brand-home-lockup/visual-verdict.json`

## Scorecard

| 항목 | 점수 | 근거 |
| --- | ---: | --- |
| mobile UX | 20/20 | 390px/320px에서 한 줄 보조 이름, page overflow 0, 첫 viewport 검색과 재료 버튼 유지 |
| interaction clarity | 20/20 | 기존 mobile heading과 desktop `/` link semantics 및 프로필·탭 interaction을 유지 |
| visual hierarchy | 20/20 | `무먹` 18/22px 아래 `무엇을 먹든` 11px을 세로 배치하고 inline-right 배치를 피함 |
| color/material fit | 19/20 | 기존 brand와 text token만 재사용하며 supporting text 대비 10.05:1 확인 |
| familiar app pattern fit | 19/20 | 제품명이 짧은명→정식명 순으로 자연스럽게 학습되고 HOME 외 shell은 단독 짧은명을 유지 |

## Geometry / Accessibility

- mobile nav: before/after 모두 52px이며 supporting name은 390px/320px 모두 1줄이다.
- desktop nav: before/after 모두 64px이다.
- desktop first tab 전체 rect는 before/after가 정확히 같다: `left 123.265625`, `right 167.953125`, `top 10.25`, `height 42.5`.
- supporting name 대비는 세 viewport 모두 `10.0497:1`로 작은 텍스트 WCAG AA 기준을 넘는다.
- mobile heading과 desktop HOME link의 accessible name은 각각 한 번만 `무먹, 무엇을 먹든`으로 계산되며 시각 span은 `aria-hidden`이다.
- page-level horizontal overflow는 390px/320px/1280px 모두 `0`이다.

## Iteration Record

첫 after에서 desktop brand의 넓어진 intrinsic width 때문에 첫 탭이 `12.109375px` 오른쪽으로 이동해 visual-verdict `84 / revise`를 기록했다. Supporting label을 링크 레이아웃 폭에서 제외하고 기존 클릭 영역과 40px gap을 유지하도록 수정한 뒤, 전체 tab rect equality assertion과 안정화된 screenshot을 다시 생성해 `98 / pass`로 전환했다.

## Findings

- blocker: 0
- major: 0
- minor: 0

## Recommendation

독립 final authority 검토 결과 HOME lockup은 승인한다. 공용 `mobile-ios-small` full-page raster 변동은 sticky/fixed 요소의 캡처 좌표를 테스트에서 안정화해 허용치 완화 없이 해소했으며, 디자인 blocker는 없다.
