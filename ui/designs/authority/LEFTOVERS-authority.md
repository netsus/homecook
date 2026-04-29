# LEFTOVERS Authority Precheck

> 대상 slice: `16-leftovers` Stage 4 `authority_precheck`
> evidence:
> - mobile-default-screenshot: `ui/designs/evidence/16-leftovers/LEFTOVERS-mobile.png`
> - mobile-narrow-screenshot: `ui/designs/evidence/16-leftovers/LEFTOVERS-mobile-narrow.png`
> - design reference: `ui/designs/LEFTOVERS.md`
> - critique reference: `ui/designs/critiques/LEFTOVERS-critique.md`
> - implementation reference: `components/leftovers/leftovers-screen.tsx`
> - page entry: `app/leftovers/page.tsx`
> - e2e reference: `tests/e2e/slice-16-leftovers.spec.ts`
> 검토일: 2026-04-29
> 검토자: Codex

## Verdict

- verdict: `pass`
- 한 줄 요약: LEFTOVERS 신규 화면은 모바일 기본/좁은 폭에서 남은요리 목록, 다먹음, 플래너 추가, 다먹은 목록 진입이 명확하게 보이며 Stage 4 이후 Stage 5 public design review를 시작할 수 있다.

## Scorecard

| 항목 | 점수 | 메모 |
|------|------|------|
| Mobile UX | 4/5 | 375px와 320px 모두 page-level horizontal overflow 없이 리스트와 하단 탭이 유지된다. |
| Interaction Clarity | 4/5 | 카드마다 `[다먹음]`과 `[플래너에 추가]`가 같은 위치에 반복되어 상태 전이와 재등록 행동이 분명하다. |
| Visual Hierarchy | 4/5 | 화면 제목, 보조 진입 링크, 카드 제목, 주요 액션의 위계가 안정적이다. |
| Color / Material Fit | 4/5 | `--brand`, `--brand-soft`, `--surface`, `--text-3`, `--line` 계열을 사용해 현재 Baemin-derived 토큰 방향과 맞는다. |
| Familiar App Pattern Fit | 4/5 | 모바일 앱의 app bar + list card + bottom tab 패턴을 따른다. |

## Mobile UX Rule Check

- Rule 1 (whole-page horizontal scroll): `pass`
- Rule 2 (scroll containment): `pass`
- Rule 3 (primary CTA): `pass`
- Rule 3a (control proximity): `pass`
- Rule 4/4a/4b (familiar pattern + information grouping): `pass`
- Rule 5 (mobile sentinel): `pass`

## Contract / Policy Check

- 로그인 필수: `pass` (`SocialLoginButtons nextPath="/leftovers"`)
- API wrapper 소비: `pass` (`lib/api/leftovers.ts`에서 `{ success, data, error }` 검증)
- 상태 전이: `pass` (`POST /eat` 성공 후 LEFTOVERS 리스트에서 제거)
- 플래너 재등록: `pass` (`createMeal()`에 `leftover_dish_id` 전달)
- read-only: `N/A-pass` (이 화면은 상태 전이 액션만 있고 read-only 서버 상태가 없음)

## Blockers

없음.

## Major Issues

없음.

## Minor Issues

| # | 위치 | 문제 | 제안 |
|---|------|------|------|
| 1 | 320px sentinel | 첫 화면에서 세 번째 카드 하단이 탭바 근처까지 내려와 정보 밀도가 높다. 첫 두 카드와 주요 CTA는 읽히므로 blocker는 아니다. | Stage 5에서 카드 간격/탭바 여백을 한 번 더 확인한다. |

## Decision

- Stage 4 authority_precheck 결과: `통과`
- Stage 5 public design review 시작 가능 여부: `가능`
- 추가 보강 필요: Stage 5에서 320px 하단 탭 근처 여백만 lightweight 확인
