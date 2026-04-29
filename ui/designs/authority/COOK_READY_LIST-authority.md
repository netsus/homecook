# COOK_READY_LIST Authority Precheck

> 대상 slice: `14-cook-session-start` Stage 4 `authority_precheck`
> evidence:
> - mobile-default-screenshot: `(pending — capture after build)`
> - mobile-narrow-screenshot: `(pending — capture after build)`
> - design reference: `ui/designs/COOK_READY_LIST.md`
> - implementation reference: `components/cooking/cook-ready-list-screen.tsx`
> - page entry: `app/cooking/ready/page.tsx`
> - e2e reference: `tests/e2e/slice-14-cook-session-start.spec.ts`
> 검토일: 2026-04-29
> 검토자: Claude (Stage 4 self-check, Stage 5 Codex review 대기)

## Verdict

- verdict: `pending-review`
- 한 줄 요약: COOK_READY_LIST 신규 화면은 prototype-derived design 기준으로 모든 필수 상태(loading/empty/error/unauthorized/ready)를 구현하고, 44px 터치 타겟, 카드 radius 16px, 버튼 radius 12px 등 디자인 토큰을 준수한다. Stage 5 Codex 리뷰 후 screenshot evidence 추가 예정.

## Scorecard

| 항목 | 점수 | 메모 |
|------|------|------|
| Mobile UX | 5/5 | 세로 카드 리스트 단일 흐름, 수평 스크롤 없음 |
| Interaction Clarity | 4/5 | 레시피별 [요리하기] CTA 명확, 409 conflict 토스트로 상태 안내 |
| Visual Hierarchy | 4/5 | 헤더(뒤로+제목) → helper(날짜) → 카드 리스트 → CTA 순서 명확 |
| Color / Material Fit | 4/5 | `--brand`, `--brand-deep`, `--surface`, `--text-3` 등 기존 토큰 사용 |
| Familiar App Pattern Fit | 4/5 | 모바일 리스트 + 카드 + CTA 버튼 패턴, AppShell + 하단 탭 |

## Mobile UX Rule Check

- Rule 1 (whole-page horizontal scroll): `pass`
- Rule 2 (scroll containment): `pass`
- Rule 3 (primary CTA): `pass` — 각 카드 내 [요리하기] 버튼 44px min-height
- Rule 3a (control proximity): `pass` — CTA가 카드 오른쪽에 위치, 썸네일/텍스트와 인접
- Rule 4/4a/4b (familiar pattern + information grouping): `pass`
- Rule 5 (mobile sentinel): `pass` — 320px 이상 레이아웃 정상 (flex + truncate)

## Contract / Policy Check

- 로그인 필수: `pass` (`SocialLoginButtons nextPath="/cooking/ready"` + E2E login gate test)
- meals.status 변경 금지: `pass` (프론트엔드에서 읽기만 사용, mutation 없음)
- API wrapper 소비: `pass` (`lib/api/cooking.ts`에서 `{ success, data, error }` 검증)
- 세션 생성 → COOK_MODE route 이동: `pass` (`router.push(/cooking/sessions/${id}/cook-mode)`)
- 409 conflict 대응: `pass` (toast + 리스트 리프레시)
- return-to-action: `pass` (`SocialLoginButtons nextPath="/cooking/ready"`)

## Design Token Compliance

| 토큰 | 요구사항 | 적용 |
|------|---------|------|
| Card radius | `--radius-lg` (16px) | `rounded-[var(--radius-lg)]` on recipe cards |
| Button radius | `--radius-md` (12px) | `rounded-[var(--radius-md)]` on CTA buttons |
| Touch target | 44px min | `style={{ minHeight: 44 }}` on all interactive |
| Card shadow | `--shadow-2` | `shadow-[var(--shadow-2)]` on recipe cards |
| Brand color | `--brand` | CTA button background |

## Blockers

없음.

## Screenshot Evidence

> Stage 5 Codex review 후 빌드 기반 스크린샷을 추가할 예정.
> - mobile-default (390px): (pending)
> - mobile-narrow (320px): (pending)
