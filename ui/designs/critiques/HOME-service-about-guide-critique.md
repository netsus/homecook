# HOME `집밥 둘러보기` Anchor Extension 설계 리뷰

> 검토 대상: `ui/designs/HOME.md` §Service About Guide HOME Anchor Extension Addendum
> 기준 문서: 화면정의서 v1.5.18 §1 HOME / 요구사항 기준선 v1.7.11 §1-1 / 유저Flow맵 v1.3.18 §①-a
> 검토일: 2026-07-12
> 분류: HOME anchor extension / Stage 4 screenshot authority 필수

## 종합 평가

**등급: 조건부 통과**

사용자 승인 범위를 기존 fixed prototype authority 위에 좁게 덧붙였고, rail 밖 HOME 구조를 보존한다. `빠른 이동 → 집밥 둘러보기 → 모든 레시피`, guide Link/theme button의 혼합 역할, guide-only fallback과 filter 숨김 규칙이 명확하다. 구현 후 320/390 before/after 비교가 남아 있으므로 final authority는 보류한다.

## Blocker

없음.

## 승인 범위와 prototype authority

| 항목 | 판정 |
| --- | --- |
| rail 위치 이동 | 사용자 승인 addendum이 기존 prototype을 supersede |
| heading `집밥 둘러보기` | 사용자 승인 addendum이 supersede |
| 첫 guide card | 사용자 승인 addendum이 supersede |
| guide-only fallback | 사용자 승인 addendum이 supersede |
| compact rail geometry | 사용자 승인 addendum이 supersede |
| app bar/hero/search/tag/quick links | 기존 fixed prototype authority 유지 |
| recipe cards/bottom tabs | 기존 fixed prototype authority 유지 |
| token/type/material | 기존 fixed prototype authority 유지 |

기존 prototype을 전체 refreeze할 이유가 없으며, 이 변경을 parity defect로 취급해서도 안 된다.

## UX·접근성 검토

- rail outer height `≤220px`, card `136–144px` 범위로 recipe entry 하강 위험을 제한했다.
- 다음 카드 peek와 rail-local overflow로 swipe 가능성을 알리면서 page-level overflow를 금지했다.
- guide는 `Link[href="/about#how-to"]`, theme은 `button[aria-pressed]`로 역할이 분리돼 있다.
- theme empty/error에서도 guide 접근이 남아 API 의존성이 없다.
- search/ingredient/tag filter active에서는 quick links와 rail을 함께 숨겨 결과 우선 원칙을 보존한다.
- desktop HOME에 중복 guide card를 만들지 않고 web 공통 nav를 사용한다.

## Stage 4 authority risk

| 우선순위 | 위험 | 확인 방법 |
| --- | --- | --- |
| blocker 후보 | rail 또는 card fixed width로 320px page overflow 발생 | viewport scrollWidth 측정 + 320 after screenshot |
| major | rail을 위로 옮긴 뒤 모든 레시피가 지나치게 밀림 | before/after에서 section outer height와 recipe entry 비교 |
| major | guide card가 theme filter처럼 보여 role이 혼동됨 | 브랜드 soft surface, badge, CTA copy 및 DOM role 확인 |
| major | guide-only 상태에서 빈 rail처럼 보임 | `HOME-guide-only-390.png` 확인 |
| major | loading 종료 후 guide까지 사라짐 | theme empty/error integration test + screenshot |
| major | filter active인데 rail이 남아 결과 집중을 방해함 | `HOME-filter-hidden-320.png` 확인 |
| minor | 320px에서 supporting text가 과하게 잘림 | line clamp와 title hierarchy 시각 확인 |
| minor | guide placeholder와 실제 guide card geometry가 달라 layout shift 발생 | loading→ready DOM geometry 비교 |

## Evidence gate

현재 before authority:

- `ui/designs/evidence/service-about-guide/HOME-before-390.png`
- `ui/designs/evidence/service-about-guide/HOME-before-320.png`

필수 after authority:

- `ui/designs/evidence/service-about-guide/HOME-after-390.png`
- `ui/designs/evidence/service-about-guide/HOME-after-320.png`
- `ui/designs/evidence/service-about-guide/HOME-guide-only-390.png`
- `ui/designs/evidence/service-about-guide/HOME-filter-hidden-320.png`

## 판정

- Stage 4 구현 진입: 가능
- Stage 1 blocker: 0
- anchor extension final authority: after evidence 전까지 보류
- confirmed 조건: 320/390 page overflow 0, rail `≤220px`, mixed roles 정확, guide-only/filter-hidden 상태 검증, unresolved blocker 0
