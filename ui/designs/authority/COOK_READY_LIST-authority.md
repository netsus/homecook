# COOK_READY_LIST Authority Precheck

> 대상 slice: `14-cook-session-start` Stage 4 `authority_precheck`
> evidence:
> - mobile-default-screenshot: `ui/designs/evidence/14-cook-session-start/COOK_READY_LIST-mobile-default-screenshot.png`
> - mobile-narrow-screenshot: `ui/designs/evidence/14-cook-session-start/COOK_READY_LIST-mobile-narrow-screenshot.png`
> - design reference: `ui/designs/COOK_READY_LIST.md`
> - implementation reference: `components/cooking/cook-ready-list-screen.tsx`
> - page entry: `app/cooking/ready/page.tsx`
> - e2e reference: `tests/e2e/slice-14-cook-session-start.spec.ts`
> 검토일: 2026-04-29
> 검토자: Claude (Stage 4 self-check), Codex (Stage 5 authority review)
> note: `pnpm build` passed. Screenshot evidence was captured from QA fixture dev mode because production `next start` intentionally disables the E2E auth override used for deterministic mock data.

## Verdict

- verdict: `pass`
- 한 줄 요약: COOK_READY_LIST 신규 화면은 prototype-derived design 기준으로 필수 상태(loading/empty/error/unauthorized/ready)를 구현했고, 390px 및 320px 모바일 캡처에서 카드, CTA, 하단 탭이 겹침 없이 유지된다.

## Scorecard

| 항목 | 점수 | 메모 |
|------|------|------|
| Mobile UX | 5/5 | 세로 카드 리스트 단일 흐름, 390px/320px 캡처에서 수평 스크롤 및 겹침 없음 |
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
- Rule 5 (mobile sentinel): `pass` — 320px 캡처에서 카드/CTA/하단 탭 겹침 없음

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

## Non-blocking Notes

- reference screenshot: 없음. `visual-verdict`는 screenshot-to-reference 비교용 워크플로라, 이번 검토는 `ui/designs/COOK_READY_LIST.md`와 mobile UX rules 기준의 structured authority review로 수행했다.
- 320px narrow evidence에서 하단 AppShell label은 기존 bottom navigation의 letter spacing을 그대로 따른다. 신규 COOK_READY_LIST 영역의 카드/CTA에는 겹침이나 잘림이 없다.
- `<img>` lint warning은 기존 planner 화면에도 같은 패턴이 있으며, Stage 5 blocker는 아니다. 추후 이미지 최적화 정리 때 `next/image` 전환을 함께 검토한다.

## Screenshot Evidence

- mobile-default (390px): `ui/designs/evidence/14-cook-session-start/COOK_READY_LIST-mobile-default-screenshot.png`
- mobile-narrow (320px): `ui/designs/evidence/14-cook-session-start/COOK_READY_LIST-mobile-narrow-screenshot.png`
- capture command: Playwright Chromium, QA fixture dev server at `http://127.0.0.1:3100`, mocked `GET /api/v1/cooking/ready`, auth override `authenticated`

## Final Authority Gate

- reviewer: Claude
- artifact: `.omx/artifacts/claude-delegate-14-cook-session-start-stage5-final-authority-gate-response-20260429T055358Z.md`
- decision: `pass`
- design_status_update_allowed: `yes`
- required_repairs: none
