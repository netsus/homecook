# AUTH_PROVIDER_MEMORY_LINKING 설계 리뷰

> 검토 대상: `ui/designs/AUTH_PROVIDER_MEMORY_LINKING.md`
> 검토일: 2026-07-10
> 기준: official 2026-07-10 auth addendum, mobile UX rules, product design authority

## 종합 평가

**등급: 🟢 통과**

최근 provider 안내를 identity proof와 분리했고, 다른 provider 확인 dialog가 사용자를 막지 않으면서 OAuth 전 명시적 선택을 요구한다. normal login과 manual linking의 UI 의미도 분리되어 있으며, account conflict와 link conflict copy에 PII가 없다. Stage 4 screenshot authority review 전제로 설계 blocker는 없다.

## 필수 계약 정합성

- LOGIN recent provider는 advisory only다.
- 같은 provider는 즉시 OAuth, 다른 provider는 dialog action 전 OAuth 0회다.
- cancel/ESC/backdrop focus restoration이 명시됐다.
- `provider_mismatch` / `expectedProvider` 대신 safe `account_conflict`를 사용한다.
- MYPAGE primary provider와 connected identities의 truth가 분리됐다.
- unlink/duplicate merge/primary change가 UI에 없다.
- link success가 last-login memory를 바꾸지 않는다.

## UX / Accessibility

- 390px/320px/desktop evidence 계획이 있다.
- 44px touch target, dialog focus trap/ESC, text status가 명시됐다.
- dialog가 destructive confirmation처럼 과도하게 경고하지 않는다.
- error banner가 provider CTA를 first viewport 밖으로 밀 수 있는 위험을 Stage 4 evidence에서 확인해야 한다.

## Stage 4 확인 항목

1. 320px에서 dialog action 3개가 footer 밖으로 잘리지 않는가.
2. dialog close 후 선택 provider 버튼으로 실제 focus가 복귀하는가.
3. recent-provider 강조가 account ownership처럼 보이지 않는가.
4. link pending이 MYPAGE 전체를 불필요하게 막지 않는가.
5. “가입 로그인 방법”과 “연결된 로그인 방법”이 사용자가 구분할 수 있는 copy/위계인가.
6. account/link conflict UI와 브라우저 URL에 provider/email/user id가 없는가.

## Verdict

- Critical: 0
- Major: 0
- Minor: 0
- 다음 단계: 구현 전 current-state 390px/320px screenshot을 먼저 저장하고, Stage 4 after evidence로 authority precheck를 진행한다.
