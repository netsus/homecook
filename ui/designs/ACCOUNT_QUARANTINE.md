# ACCOUNT_QUARANTINE

## Purpose

`ACCOUNT_QUARANTINE`는 `auth callback`과 `MYPAGE`보다 먼저 보이는 최소 quarantine interstitial이다.
이 화면의 목적은 일반 MYPAGE 구조를 다시 설계하는 것이 아니라, 현재 계정이 `quarantined`일 때만
복구/삭제 판단을 안전하게 가로채는 것이다.

- `auth-present`: 본인 확인 후 `계정 복구`와 `삭제 검토`만 제공
- `auth-absent`: 임의 복구/삭제 CTA 없이 지원과 `Manual Only` 안내만 제공
- public data 노출 금지
- exact session 재검증과 UUID `Idempotency-Key`는 내부 요청 메타로만 사용하고 사용자 UI에 노출하지 않는다
- quarantine gate는 독립 화면이며, MYPAGE 정보 구조를 바꾸지 않는다

## Aesthetic Direction

톤은 `운영 게이트`에 가깝다.
MYPAGE의 생활감이나 카드형 추천 화면보다 한 단계 더 절제된 정보형 화면으로 두고,
하나의 중심 카드와 한 개의 지원 패널만 사용한다.

- 배경: `--surface` / `--surface-fill`
- 기본 텍스트: `--foreground`, `--text-2`, `--text-3`
- quarantine 신호: `--warning`, `--warning-soft`, `--warning-border`, `--warning-strong`
- recovery primary CTA: `--brand-primary`, `--brand-primary-hover`, `--control-height-lg`
- destructive 신호: `--danger`, `--danger-soft`, `--danger-border`, `--danger-strong`
- 모양: `--radius-card`, `--radius-panel`, `--radius-sheet`, `--radius-control`
- 핵심 컨트롤: `--control-height-lg`
- 기본 모바일 gutter: `--space-4`
- desktop gutter: `--space-6`
- raw hex 금지, 역할 토큰만 사용

## Layout Rules

- 화면 전체는 하나의 세로 스크롤 컨테이너만 사용한다
- 가로 스크롤은 금지한다
- action 영역은 bottom safe area를 침범하지 않도록 여백을 둔다
- 390px 기본 폭, 320px 좁은 폭, desktop 보조 레이아웃을 모두 같은 정보 순서로 유지한다
- recovery는 primary CTA이고, delete는 먼저 `삭제 검토`로 진입한 뒤 별도 confirmation sheet에서만 submit한다
- 일반 MYPAGE content는 이 화면 뒤로 밀리지 않고 아예 렌더되지 않는다
- generic back CTA는 두지 않는다

## Information Architecture

1. quarantine header
2. identity / session verification summary
3. status message area
4. `auth-present` action stack 또는 `auth-absent` support panel
5. safety / retry note
6. bottom safe area

## Mobile Wireframe 390px

### `auth-present`

```text
┌──────────────────────────────────┐
│          ACCOUNT_QUARANTINE      │
│                                  │
│  [quarantine badge] 계정 보호 중 │
│  일반 MYPAGE는 열리지 않아요.    │
│  본인 확인 후에만 다음 동작을    │
│  이어갈 수 있어요.               │
│                                  │
│  ┌────────────────────────────┐  │
│  │ 본인 확인                   │  │
│  │ 로그인 상태를 안전하게      │  │
│  │ 다시 확인하고 있어요        │  │
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │ 계정 복구                   │  │
│  │ 확인이 맞으면 현재 계정을   │  │
│  │ 다시 사용할 수 있게 복구해요│  │
│  │                              │  │
│  │ [계정 복구]  primary CTA     │  │
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │ 삭제 검토                   │  │
│  │ 삭제는 별도 확인이 필요해요 │  │
│  │ 보존: 공개한 사용자 등록    │  │
│  │ 완제품과 공개 레시피는      │  │
│  │ 작성자 정보 없이 보존될 수  │  │
│  │ 있어요                      │  │
│  │ 삭제: 개인 레시피, 식사 기록 │  │
│  │ 배치, 비공개 이미지는 삭제  │  │
│  │ 대상이에요                  │  │
│  │                              │  │
│  │ [삭제 검토]  secondary      │  │
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │ 상태                        │  │
│  │ pending / replay /          │  │
│  │ cleanup_pending /           │  │
│  │ maintenance / conflict      │  │
│  │ stale / unauthorized /      │  │
│  │ retryable error             │  │
│  └────────────────────────────┘  │
│                                  │
│  bottom safe-area padding         │
└──────────────────────────────────┘
```

### `auth-present` delete confirmation sheet

`삭제 검토`를 누르면 아래 상태로 전환된다. 이 단계는 아직 submit이 아니고,
명시적 confirmation만 수행한다.

```text
┌──────────────────────────────────┐
│           ────────               │
│                                  │
│  정말 계정을 삭제할까요?         │
│                                  │
│  보존되는 것                     │
│  - 공개한 사용자 등록 완제품     │
│    (등록자 정보 없이 read-only)  │
│  - 공개 레시피는 작성자 정보    │
│    없이 보존될 수 있어요        │
│                                  │
│  삭제되는 것                     │
│  - 개인 레시피                  │
│  - 식사 기록                    │
│  - 배치                         │
│  - 비공개 이미지                │
│                                  │
│  [취소]              [삭제 시작] │
│                                  │
│  Back / ESC / 바깥 탭 = 취소     │
│  삭제 실패 시 다시 review부터    │
│  시작                            │
└──────────────────────────────────┘
```

### `auth-absent` swap

```text
┌──────────────────────────────────┐
│          ACCOUNT_QUARANTINE      │
│                                  │
│  [quarantine badge] 계정 확인   │
│  로그인은 되었지만 본인 연결이   │
│  없는 상태예요.                  │
│                                  │
│  ┌────────────────────────────┐  │
│  │ 지원 / Manual Only         │  │
│  │ 자동 복구와 자동 삭제는    │  │
│  │ 제공하지 않아요.           │  │
│  │ 운영 승인 또는 고객 지원    │  │
│  │ 절차를 통해서만 처리해요.  │  │
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │ 상태                        │  │
│  │ unavailable only            │  │
│  │ no CTA                      │  │
│  └────────────────────────────┘  │
│                                  │
│  bottom safe-area padding         │
└──────────────────────────────────┘
```

## Mobile Wireframe 320px

320px에서는 동일한 구조를 유지하되, 제목과 설명이 더 빨리 줄바꿈되고
상태 패널은 다중 행으로 유지한다. 핵심 copy를 한 줄로 축약하지 않는다.

```text
┌──────────────────────────────┐
│      ACCOUNT_QUARANTINE      │
│                              │
│  [badge] 계정 보호 중        │
│  일반 MYPAGE는 열리지 않아요 │
│  본인 확인 후에만 진행 가능 │
│                              │
│  본인 확인                   │
│  로그인 상태를 다시 확인해요 │
│                              │
│  [계정 복구]                 │
│                              │
│  삭제 검토                   │
│  보존: 공개 완제품과 공개   │
│  레시피는 작성자 정보 없이   │
│  보존될 수 있어요            │
│  삭제: 개인 레시피 / 기록    │
│  / 배치 / 비공개 이미지      │
│  [삭제 검토]                 │
│                              │
│  상태                        │
│  pending                     │
│  replay                      │
│  cleanup_pending             │
│  maintenance                 │
│  conflict / stale            │
│  unauthorized / error        │
│                              │
│  bottom safe-area padding    │
└──────────────────────────────┘
```

320px 규칙:

- 버튼은 모두 full-width로 쌓는다
- 복구와 삭제 사이 간격을 더 크게 둔다
- 상태 패널은 다중 행을 유지하고 ellipsis로 핵심 상태를 자르지 않는다
- 44px 미만 터치 타겟은 허용하지 않는다
- delete confirm sheet는 모바일 바텀시트 높이와 같은 긴 형태로 유지한다

## Desktop Wireframe

Desktop은 보조 레이아웃이다. MYPAGE 대시보드처럼 확장하지 않고,
가운데 gate card와 오른쪽 support rail 정도만 둔다.

```text
┌──────────────────────────────────────────────────────────────┐
│                      ACCOUNT_QUARANTINE                      │
│                                                              │
│            ┌──────────────────────────────┐   ┌────────────┐ │
│            │ quarantine gate card         │   │ support    │ │
│            │                              │   │ rail       │ │
│            │ 계정 보호 중                 │   │ support    │ │
│            │ 본인 확인 / 복구 / 삭제 검토 │   │ only       │ │
│            │ recovery primary CTA         │   │ no public  │ │
│            │ delete review -> confirm     │   │ data       │ │
│            │ status panel                 │   │            │ │
│            └──────────────────────────────┘   └────────────┘ │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Desktop 규칙:

- gate card가 시각 중심이어야 한다
- support rail은 보조 정보만 담는다
- 별도의 help/support surface는 두지 않는다
- MYPAGE 본문이나 public data 섹션을 붙이지 않는다
- 960px 이하에서는 desktop 2열을 강요하지 않고 세로 스택으로 전환한다

## Route Integration / Anchor Classification

- 진입 지점은 `auth callback` 또는 `MYPAGE` guard다
- quarantined lifecycle이면 일반 content를 먼저 열지 않고 gate를 다시 통과시킨다
- browser back / forward / direct revisit는 quarantine route를 re-gate한다
- non-quarantine은 auth callback의 원래 return target 또는 정상 MYPAGE로 즉시 이어진다
- production `legacy`에서는 quarantine gate를 노출하지 않는다
- 이 화면은 공식 anchor screen이 아니다
- 공식 anchor는 `HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK`이고, 이 슬라이스는 `new-screen + high-risk`인 독립 gate 화면이다

## Interaction Notes

- `auth-present`는 화면 진입 후 즉시 복구 검토와 삭제 검토를 선택할 수 있어야 한다
- `auth-absent`는 버튼을 숨기고 안내만 남긴다
- recovery 제출 시 exact session 재검증과 UUID `Idempotency-Key`는 내부 메타로만 사용한다
- delete는 `삭제 검토` -> confirmation sheet -> `삭제 시작` 순서로만 진행된다
- confirmation sheet의 `취소`, `Back`, `ESC`, backdrop tap은 모두 submit 없이 닫기 동작이다
- delete 실패 뒤 재시도는 confirmation부터 다시 시작한다
- 동일 요청 재진입은 새 mutation을 만들지 않고 이전 결과를 다시 보여준다
- `IDEMPOTENCY_KEY_REUSED`는 다른 payload와 충돌했을 때만 보이며 새 intent가 필요하다
- `cleanup_pending`은 완료가 아니라 정리 시작 상태다
- `ACCOUNT_LIFECYCLE_MAINTENANCE`는 일반 로그인 오류로 숨기지 않는다
- `ACCOUNT_SESSION_STALE`와 unauthorized는 auth callback return-to-action으로 되돌린다

## State Matrix

| State | User copy | Action | Retry timing | Intent / key |
|---|---|---|---|---|
| `loading` | 계정 상태를 확인하고 있어요 | CTA 없음 | guard 완료 후 자동 전환 | intent 보존, key 미노출 |
| `pending` | 처리 중이에요. 잠시만 기다려 주세요 | CTA 비활성 | 서버 완료 후 갱신 | 같은 intent 유지, 새 submit 금지 |
| `replay` | 이전 요청 결과를 다시 보여드려요 | CTA 비활성 | 재제출 불필요 | 이전 요청 식별자 유지 |
| `cleanup_pending` | 계정 정리를 시작했어요. 아직 완료되지 않았어요 | CTA 비활성 | 상태 갱신만 허용 | durable initiation 보존 |
| `IDEMPOTENCY_KEY_REUSED` | 요청이 달라 다시 확인이 필요해요 | 새 intent 필요 | 다른 key/intent로만 재시도 | 기존 key 폐기 |
| `ACCOUNT_LIFECYCLE_MAINTENANCE` | 지금은 계정 전환 작업 중이에요 | CTA 없음 | 작업 종료 후 다시 열기 | intent 보존, 자동 submit 금지 |
| `retryable error` | 잠시 후 다시 시도해 주세요 | `다시 시도` | 안전한 retry 가능 | 같은 intent 재사용, delete는 review부터 |
| `ACCOUNT_SESSION_STALE` / unauthorized | 세션이 바뀌었어요. 다시 로그인해 주세요 | `다시 로그인` | auth callback 이후 | return-to-action 유지 |
| `conflict` | 요청 내용이 달라서 처리할 수 없어요 | `다시 검토` | 새 intent로만 재시도 | 이전 key 사용 금지 |
| `auth-absent` | 자동 복구와 자동 삭제는 제공하지 않아요 | CTA 없음 | Manual Only 후속 | intent 없음 |

## Accessibility

- 모든 primary/secondary/destructive action은 44px 이상 터치 타겟을 유지한다
- recovery와 delete는 색만으로 구분하지 않고, 위치와 카드 구조로도 분리한다
- status panel은 `aria-live`로 읽히는 inline message 영역에 맞춘다
- keyboard focus는 header -> verification summary -> recovery -> delete review -> confirm sheet -> support 순서로 간다
- confirm sheet는 포커스를 자신의 제목과 버튼에만 두고, 취소 시 이전 trigger로 포커스를 복귀한다
- bottom safe area를 침범하지 않도록 390px/320px 모두 하단 padding을 둔다

## Open Risks

- 운영 문구가 더 구체화되면 support / Manual Only copy가 짧게 바뀔 수 있다
- delete confirmation 문구는 후속 문서에서 더 강한 재확인을 요구할 수 있다
- desktop 2열 support rail은 보조 레이아웃일 뿐이며, MYPAGE 본문으로 확장되면 안 된다

## Design Status

`temporary`

Stage 4 구현과 screenshot-based authority evidence가 생기기 전까지는
`confirmed`가 아니라 `authority-required` gate artifact로 유지한다.
