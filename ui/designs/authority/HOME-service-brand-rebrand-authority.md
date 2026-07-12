# HOME Service Brand Rebrand — Stage 5 + Independent Final Authority

- verdict: `pass`
- public Stage 5: `APPROVE`
- independent final authority: `pass`
- reviewed head: `7e51a5d162f25393ebe21df53dd6f40621acf8bd`
- reviewed at: `2026-07-13`
- visual-verdict: `98 / 100` (iteration 2)
- blocker / major / minor: `0 / 0 / 0`
- Design Status: `confirmed`
- stage boundary: Stage 5 public review와 역할 분리된 Codex final authority만 확정했다. Stage 6, Ready 전환, CI merge gate, merge는 수행하지 않음.

> evidence:
> - `ui/designs/evidence/service-brand-rebrand/HOME-before-390.png`
> - `ui/designs/evidence/service-brand-rebrand/HOME-before-320.png`
> - `ui/designs/evidence/service-brand-rebrand/HOME-after-390.png`
> - `ui/designs/evidence/service-brand-rebrand/HOME-after-320.png`
> - `ui/designs/evidence/service-brand-rebrand/HOME-guide-only-after-320.png`
> - `ui/designs/evidence/service-brand-rebrand/ABOUT-after-1280.png`
> - `ui/designs/evidence/service-brand-rebrand/MYPAGE-account-after-390.png`
> - `ui/designs/evidence/service-brand-rebrand/visual-verdict.json`
> - `ui/designs/evidence/service-brand-rebrand/HOME-background-audit.json`

## Scorecard

| 항목 | 점수 | 근거 |
| --- | ---: | --- |
| mobile UX | 20/20 | 390px/320px에서 page-level overflow가 없고 bottom tab과 핵심 조작 영역이 유지됨 |
| interaction clarity | 20/20 | guide Link, theme button, filter-active rail 숨김, guide-only fallback 의미가 유지됨 |
| visual hierarchy | 19/20 | `무먹`/`무먹 둘러보기`/`무먹 가이드`가 기존 위계 안에서 자연스럽게 교체됨 |
| color/material fit | 20/20 | token, background, border, shadow, card material 변경 없음 |
| familiar app pattern fit | 19/20 | localized rail peek와 44px 이상 조작 영역이 기존 패턴을 유지함 |

## Comparison

- `HOME-before-390.png` ↔ `HOME-after-390.png`: AppBar, rail heading, guide card, system source badge의 승인된 문자열만 변경됐다.
- `HOME-before-320.png` ↔ `HOME-after-320.png`: 짧은명 적용 후에도 줄바꿈, 잘림, page-level overflow, touch target 축소가 없다.
- `HOME-guide-only-after-320.png`: 테마 empty/error 계열에서 guide Link만 남고 존재하지 않는 theme button은 노출되지 않는다.
- 단일 clean 3000 server computed-style audit: `html`, HOME root, sticky header는 `rgb(255, 255, 255)`, background-image `none`, page-level overflow `0`이다.
- guide-only PNG를 `sips` 24-bit BMP로 디코딩한 181,760 pixels 중 RGB<32는 0개, RGB<64는 2,323개(1.28%, 정상 텍스트 수준)였다. 일시적 검은 영역은 `view_image` 표시 artifact이며 PNG 원본에는 없다.
- assertions-only Playwright 실행 전후 HOME 390/320/guide-only PNG의 SHA-256과 mtime은 모두 불변이며 routine test가 authority evidence를 덮어쓰지 않는다.
- `ABOUT-after-1280.png`: 기존 section order, CTA, accordion, nav geometry를 유지하며 공식명과 canonical heading만 반영한다.
- `MYPAGE-account-after-390.png`: 기존 non-empty nickname `집밥러`를 보존하고 계정/성장 header geometry를 유지한다.

## Findings

- blocker: 0
- major: 0
- minor: 0
- manual/custom web recipe card에는 새 source badge를 추가하지 않고 기존 동작을 유지한다.
- `system` web card에는 `무먹 추천`, 기존 `youtube` card에는 `유튜브`를 표시한다.

## Recommendation

Stage 5 public `APPROVE`와 독립 final authority `pass`를 근거로 Design Status를 `confirmed`로 확정한다. 다음 단계는 Stage 6이며, 이 판정은 Ready 전환·CI 확인·merge 완료를 뜻하지 않는다.
