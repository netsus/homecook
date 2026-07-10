# AUTH_PROVIDER_MEMORY_LINKING — LOGIN / MYPAGE 인증 연결 설계

> 기준: 화면정의서 v1.5.18 2026-07-10 addendum, 요구사항 v1.7.11 2026-07-10 addendum
> UI risk: high-risk auth/account flow
> 대상: `LOGIN`, `MYPAGE`
> Design Status: temporary

> mobile baseline: 390px (기존 375px 계열 모바일 기준과 호환) / narrow: 320px
> primary CTA: remembered provider action 또는 link action
> scroll containment: LOGIN page와 MYPAGE body의 세로 스크롤만 사용하고 dialog 내부 action은 고정 footer에서 잘리지 않게 한다.
> anchor: 공식 anchor screen 변경은 없지만 auth/account 핵심 흐름이라 high-risk authority review를 수행한다.

## 설계 목표

- 최근 provider를 개인 정보 없이 안내한다.
- 다른 provider를 눌러도 강제로 막지 않고, OAuth 전에 계정 차이 가능성을 확인시킨다.
- 연결된 identity와 최초/primary provider 의미를 혼동시키지 않는다.
- error/conflict copy에서 이메일·사용자 ID·provider payload를 노출하지 않는다.

## LOGIN — 최근 provider

```text
┌──────────────────────────────────┐
│            집밥                  │
│ 이 브라우저에서 최근 사용        │
│                                  │
│ [K] 카카오로 시작하기   최근 로그인│
│ [N] 네이버로 시작하기            │
│ [G] Google로 시작하기            │
│                                  │
│ 최근 로그인 표시는 계정 확인이    │
│ 아니며 다른 계정으로 계속 가능    │
└──────────────────────────────────┘
```

- 기억값이 없으면 안내/강조를 숨긴다.
- provider 이름 외 email/nickname/avatar를 표시하지 않는다.
- 같은 provider는 즉시 OAuth를 시작한다.
- loading 동안 모든 provider 버튼의 중복 탭을 막는다.

## LOGIN — 다른 provider 확인 dialog

```text
┌──────────────────────────────────┐
│              dim                 │
│  ┌────────────────────────────┐  │
│  │ 다른 로그인 방법을 쓸까요? │  │
│  │ 이 브라우저에서는 최근      │  │
│  │ 카카오 로그인을 사용했어요. │  │
│  │                            │  │
│  │ [카카오로 로그인]           │  │
│  │ [Google로 다른 계정 계속]   │  │
│  │ [취소]                     │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

- primary: remembered provider.
- secondary: selected provider + “다른 계정 계속”.
- cancel/ESC/backdrop: OAuth 호출 없음, 원래 selected button으로 focus 복귀.
- 320px에서도 footer action이 모두 보이고 각 touch target은 44px 이상이다.
- destructive warning color를 과하게 쓰지 않는다. 위험 경고가 아니라 선택 확인이다.

## LOGIN — safe errors

```text
email_required
┌──────────────────────────────────┐
│ 이메일 제공 동의가 필요해요       │
│ 제공자 설정에서 이메일 동의 후    │
│ 다시 시도해주세요.                │
│ [다시 로그인]                    │
└──────────────────────────────────┘

account_conflict
┌──────────────────────────────────┐
│ 계정을 안전하게 확인하지 못했어요 │
│ 기존 로그인 방법으로 다시         │
│ 시도해주세요.                     │
│ [로그인 방법 선택]                │
└──────────────────────────────────┘
```

- `expectedProvider`, email, user id, technical payload를 표시하지 않는다.
- error banner와 provider 버튼 사이에 충분한 간격을 두되 첫 CTA를 viewport 아래로 밀지 않는다.

## MYPAGE — 연결된 로그인 제공자

```text
┌──────────────────────────────────┐
│ 내 계정                           │
│ 가입 로그인 방법  카카오           │
│                                  │
│ 연결된 로그인 방법                │
│ 카카오          연결됨             │
│ Google         연결됨             │
│ 네이버          [연결]             │
│                                  │
│ 연결 해제와 계정 병합은 제공하지 않음│
└──────────────────────────────────┘
```

- “가입 로그인 방법”은 `public.users.social_provider`, “연결된 로그인 방법”은 Supabase identities다.
- connected row는 read-only status다. unlink/primary-change menu를 두지 않는다.
- unconnected enabled provider에만 `[연결]`을 제공한다.
- link pending은 해당 row만 disabled + spinner, 나머지 MYPAGE는 유지한다.
- no available provider는 “사용 가능한 로그인 방법이 모두 연결됐어요” 완료 상태로 표시한다.
- unauthorized는 link action을 시작하지 않고 로그인 복귀를 제공한다.

## Link result states

| 상태 | copy/action | 금지 |
| --- | --- | --- |
| success | “로그인 방법이 연결됐어요” + identity list refresh | last-login memory 변경 |
| cancelled | “연결을 취소했어요” + 기존 상태 유지 | error처럼 과장 |
| conflict | “이 로그인 방법을 현재 계정에 연결하지 못했어요” + 닫기/재시도 | 다른 계정 정보 노출 |
| failed | “연결에 실패했어요. 다시 시도해주세요.” | raw Supabase/provider error 노출 |

## Responsive / Accessibility

- 기본 mobile 390px, sentinel 320px, desktop 1440px를 검증한다.
- dialog는 `role="dialog"`, accessible name, focus trap, ESC close를 제공한다.
- status는 색만으로 구분하지 않고 `최근 로그인`, `연결됨`, `연결 중` 텍스트를 사용한다.
- provider button/row/action은 44px 이상이며 keyboard focus ring을 유지한다.
- 긴 Google/네이버 label은 320px에서 action을 밀어내지 않도록 label 영역을 flex-shrink/ellipsis 처리한다.

## Stage 4 Evidence Plan

- before: LOGIN/MYPAGE 390px + 320px
- after: recent-provider, provider dialog, email/account error, connected-provider list, link pending/conflict 390px + 320px
- desktop: LOGIN/MYPAGE 1440px
- authority: `ui/designs/authority/AUTH_PROVIDER_MEMORY_LINKING-authority.md`

## Non-goals

- provider unlink UI
- duplicate account merge UI
- primary provider picker
- provider memory cross-device sync
- email/provider identity detail disclosure
