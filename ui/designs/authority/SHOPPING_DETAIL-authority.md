# SHOPPING_DETAIL Authority Precheck

> 대상 slice: `10a-shopping-detail-interact` Stage 4 `authority_precheck`
> evidence:
> - `ui/designs/evidence/10a-shopping-detail-interact/SHOPPING_DETAIL-mobile-default.png`
> - `ui/designs/evidence/10a-shopping-detail-interact/SHOPPING_DETAIL-mobile-default-scrolled.png`
> - `ui/designs/evidence/10a-shopping-detail-interact/SHOPPING_DETAIL-mobile-narrow.png`
> - design reference: `ui/designs/SHOPPING_DETAIL.md`
> - critique reference: `ui/designs/critiques/SHOPPING_DETAIL-critique.md`
> - implementation reference: `components/shopping/shopping-detail-screen.tsx`
> - page entry: `app/shopping/lists/[list_id]/page.tsx`
> - e2e reference: `tests/e2e/slice-10a-shopping-detail-interact.spec.ts`
> 검토일: 2026-04-26
> 검토자: Codex (Stage 4 authority_precheck)

## Verdict

- verdict: `conditional-pass`
- 한 줄 요약: 모바일 기본/좁은 폭에서 SHOPPING_DETAIL의 핵심 구조(구매/제외 2영역, exclude→uncheck 반영 UI, read-only 안내)는 안정적이나, 항목 액션 버튼의 터치 타겟(44px) 보강이 Stage 5 전 확인 필요하다.

## Scorecard

| 항목 | 점수 | 메모 |
|------|------|------|
| Mobile UX | 4/5 | mobile default(390px), narrow(320px)에서 page-level horizontal overflow 없이 단일 세로 스크롤 구조가 유지된다. |
| Interaction Clarity | 4/5 | 체크 토글, 팬트리 제외/되살리기 액션이 카드 단위로 인접 배치되어 대상-행동 연결이 명확하다. |
| Visual Hierarchy | 4/5 | 앱바 → 제목/기간 → 구매 섹션 → 제외 섹션 위계가 안정적이고 read-only 안내도 명확하다. |
| Color / Material Fit | 4/5 | `--olive`, `--surface`, `--muted` 사용이 토큰 방향과 충돌하지 않는다. |
| Familiar App Pattern Fit | 4/5 | 모바일 체크리스트형 패턴(체크박스 + 항목 액션 + 섹션 분리)에 부합한다. |

## Mobile UX Rule Check

- Rule 1 (whole-page horizontal scroll): `pass`
- Rule 2 (scroll containment): `pass` (단일 세로 스크롤, 섹션 경계 명확)
- Rule 3 (primary CTA): `pass` (체크 토글/제외 액션이 첫 화면에서 인지 가능)
- Rule 3a (control proximity): `pass`
- Rule 4/4a/4b (familiar pattern + 정보 덩어리): `pass`
- Rule 5 (mobile sentinel): `pass` (320px에서 구조 유지)

## Anchor Screen Check

- anchor dependency: `PLANNER_WEEK` (장보기 생성 후 상세 진입)
- anchor-extension 여부: `간접 의존` (anchor 자체 구조 변경 아님)
- 판정: `pass` (anchor 흐름과 충돌하는 신규 interaction model 없음)

## Blockers

없음.

## Major Follow-Ups

| # | 위치 | 문제 | 제안 |
|---|------|------|------|
| 1 | `components/shopping/shopping-detail-screen.tsx:405` | `[팬트리 제외]/[되살리기]` 액션 버튼의 현재 패딩 조합(`px-3 py-1.5`, `text-xs`)은 모바일 최소 터치 타겟 44px 기준을 충분히 보장하지 못할 가능성이 높다. | Stage 5 전 버튼 높이를 명시적으로 44px 이상으로 고정(`min-h-11`, `px-4` 등)하고 좁은 폭에서도 동일 기준을 유지한다. |

## Minor Issues

| # | 위치 | 문제 | 제안 |
|---|------|------|------|
| 1 | `components/shopping/shopping-detail-screen.tsx:253` | 뒤로 버튼이 브라우저 히스토리 복귀가 아니라 홈(`/`)으로 고정 이동해, 상세 진입 컨텍스트에 따라 사용자가 기대하는 "직전 화면 복귀"와 차이가 날 수 있다. | Stage 5/6에서 `router.back()` 기반 동작 또는 fallback 전략(히스토리 없으면 홈 이동) 검토를 권장한다. |

## Decision

- Stage 4 authority precheck 진행 결과: `조건부 통과`
- Stage 5 공개 디자인 리뷰 진행 가능 여부: `가능` (blocker 0)
- `confirmed` 권고 조건:
  - 액션 버튼 터치 타겟 44px 기준 충족 여부 재확인
  - narrow viewport(320px)에서 버튼 라벨/높이 안정성 재캡처 확인
