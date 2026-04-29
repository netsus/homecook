# ATE_LIST Authority Precheck

> 대상 slice: `16-leftovers` Stage 4 `authority_precheck`
> evidence:
> - mobile-default-screenshot: `ui/designs/evidence/16-leftovers/ATE_LIST-mobile.png`
> - mobile-narrow-screenshot: `ui/designs/evidence/16-leftovers/ATE_LIST-mobile-narrow.png`
> - design reference: `ui/designs/ATE_LIST.md`
> - critique reference: `ui/designs/critiques/ATE_LIST-critique.md`
> - implementation reference: `components/leftovers/ate-list-screen.tsx`
> - page entry: `app/leftovers/ate/page.tsx`
> - e2e reference: `tests/e2e/slice-16-leftovers.spec.ts`
> 검토일: 2026-04-29
> 검토자: Codex

## Verdict

- verdict: `pass`
- 한 줄 요약: ATE_LIST 신규 화면은 모바일 기본/좁은 폭에서 다먹은 항목과 `[덜먹음]` 복귀 액션이 명확하게 배치되어 Stage 5 public design review를 시작할 수 있다.

## Scorecard

| 항목 | 점수 | 메모 |
|------|------|------|
| Mobile UX | 5/5 | 375px와 320px 모두 가로 넘침 없이 카드 행, 날짜, 복귀 액션이 안정적으로 보인다. |
| Interaction Clarity | 4/5 | `[덜먹음]` 버튼이 각 항목 오른쪽에 고정되어 상태 복귀 의미가 분명하다. |
| Visual Hierarchy | 4/5 | 제목, 레시피명, 다먹은 날짜, 복귀 액션의 우선순위가 명확하다. |
| Color / Material Fit | 4/5 | 흰 카드, 약한 그림자, 브랜드 outline 버튼이 LEFTOVERS와 같은 재료감을 유지한다. |
| Familiar App Pattern Fit | 5/5 | 모바일 히스토리 리스트 + 항목별 보조 액션 패턴으로 학습 비용이 낮다. |

## Mobile UX Rule Check

- Rule 1 (whole-page horizontal scroll): `pass`
- Rule 2 (scroll containment): `pass`
- Rule 3 (primary CTA): `pass`
- Rule 3a (control proximity): `pass`
- Rule 4/4a/4b (familiar pattern + information grouping): `pass`
- Rule 5 (mobile sentinel): `pass`

## Contract / Policy Check

- 로그인 필수: `pass` (`SocialLoginButtons nextPath="/leftovers/ate"`)
- API wrapper 소비: `pass` (`GET /leftovers?status=eaten`, `POST /uneat`)
- 상태 전이: `pass` (`POST /uneat` 성공 후 ATE_LIST 리스트에서 제거)
- auto-hide: `pass-by-backend-contract` (Stage 2 서버 필터링과 Stage 4 API 소비 계약으로 고정)
- read-only: `N/A-pass` (이 화면은 상태 복귀 액션만 있고 read-only 서버 상태가 없음)

## Blockers

없음.

## Major Issues

없음.

## Minor Issues

없음.

## Decision

- Stage 4 authority_precheck 결과: `통과`
- Stage 5 public design review 시작 가능 여부: `가능`
- 추가 보강 필요: 없음
