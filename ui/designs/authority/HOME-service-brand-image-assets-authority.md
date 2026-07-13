# HOME Service Brand Image Assets Authority

- verdict: `pass`
- scope: `service-brand-image-assets`
- reviewed surface: mobile HOME `HomeAppBar`, desktop HOME `WebTopNav`, non-HOME `WebTopNav`
- canonical symbol: `ui/designs/brand/mumeok/exports/icons/app-icon-192.png`
- canonical source SHA-256: `7ada6b0bcdd46a78a11b353c89e3506ac6288b31a20df321abe097b02738ffe4`

> evidence:
> - mobile default before: `ui/designs/evidence/service-brand-image-assets/HOME-before-390.png`
> - mobile default after: `ui/designs/evidence/service-brand-image-assets/HOME-after-390.png`
> - mobile narrow before: `ui/designs/evidence/service-brand-image-assets/HOME-before-320.png`
> - mobile narrow after: `ui/designs/evidence/service-brand-image-assets/HOME-after-320.png`
> - desktop before: `ui/designs/evidence/service-brand-image-assets/HOME-desktop-before-1280.png`
> - desktop after: `ui/designs/evidence/service-brand-image-assets/HOME-desktop-after-1280.png`
> - geometry/accessibility audit: `ui/designs/evidence/service-brand-image-assets/accessibility-geometry-audit.json`
> - visual verdict: `ui/designs/evidence/service-brand-image-assets/visual-verdict.json`

## Scorecard

| Axis | Result | Evidence |
| --- | --- | --- |
| mobile UX | pass | 390px/320px에서 header, 검색, quick link, 첫 콘텐츠와 bottom tab이 잘림 없이 유지됨 |
| interaction clarity | pass | 기존 heading/link/focus semantics와 profile action 위치를 유지하고 새 action을 추가하지 않음 |
| visual hierarchy | pass | 공식 심볼 → `무먹` → 작은 `무엇을 먹든` 순서가 명확하며 본문보다 과도하게 크지 않음 |
| color/material fit | pass | 선택한 브랜드 파란색이 기존 파란 accent와 일치하고 임의 재착색·왜곡이 없음 |
| familiar app pattern fit | pass | 32px 앱 심볼 + 이름 조합이 mobile app bar와 desktop nav에서 익숙한 브랜드 패턴으로 읽힘 |

## Geometry / Accessibility

- 390px/320px page-level overflow: `0px`.
- desktop nav rect와 첫 tab rect: before/after 동일.
- mobile HOME accessible name: `무먹, 무엇을 먹든`.
- non-HOME brand accessible name: `무먹`.
- 심볼 `alt=""`, `aria-hidden="true"`; 인접 텍스트/heading label과 중복 낭독 없음.
- canonical symbol natural size: `192×192`, rendered size: `32×32`.
- HOME first viewport의 검색 입력과 `재료로 검색` 버튼 유지.

## Findings

- blocker: `0`
- major: `0`
- minor: `0`

## Verdict

선택한 공식 심볼은 기존 HOME 이름 학습 위계와 nav geometry를 보존하면서 app/web header에 자연스럽게 결합됐다. 320px sentinel, desktop 1280px, 접근성 이름, canonical asset 일치 조건을 모두 만족하므로 다음 Stage 5/6 및 merge 검토로 진행 가능하다.
