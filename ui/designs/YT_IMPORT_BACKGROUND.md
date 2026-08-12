# YT_IMPORT_BACKGROUND — Stage 1 Design Decision Record

## Decision

기존 `YT_IMPORT`의 URL 입력·검수 visual language는 유지하고, 동기 대기 화면을 background 접수 확인 상태로 바꾼다. 사용자는 `가져오기` primary CTA로 작업을 접수한 뒤 `작업 보기` 또는 다른 앱 화면으로 이동할 수 있다. 이 문서는 design-generator 산출물이자 Stage 4 구현 계약이며, 구현 완료나 design authority PASS를 뜻하지 않는다.

- UI risk: `high-risk`
- Design Status: `temporary`
- Anchor dependency: 없음. 기존 `YT_IMPORT` shell을 기준으로 하며 `HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK` anchor screen은 수정하지 않는다.
- Primary CTA: `가져오기`; 접수 뒤 CTA는 `작업 보기`
- Mobile baseline: `390px`; narrow 검증: `320px`; desktop 검증: `1280px 이상`
- Scroll containment: 문서 전체가 한 축으로 스크롤되고 footer/CTA가 입력·오류·safe-area를 가리지 않는다.

## Contract Boundaries

- browser는 `{ youtube_url } | { retry_job_id }`만 전송한다. mode, policy version/digest, HMAC key/version, options를 노출하거나 전송하지 않는다.
- `202`가 확인되기 전에는 접수 성공을 추측하지 않는다. offline/timeout/response 미수신은 URL을 보존하고 재시도를 제공한다.
- active duplicate는 새 작업처럼 보이게 만들지 않고 동일 `job_id`, `deduplicated=true`를 설명한다.
- `POLICY_CHANGED`는 terminal notification이 아니며 입력을 보존한 안전 오류다.
- `/recipes/new/youtube` Quick Import UI와 sync response는 바꾸지 않는다.

## Mobile 390 Wireframe

```text
┌──────────────────────────────────────┐
│ ←  YouTube에서 가져오기              │
├──────────────────────────────────────┤
│ 레시피 영상 주소                     │
│ ┌──────────────────────────────────┐ │
│ │ https://youtube.com/watch?...    │ │
│ └──────────────────────────────────┘ │
│ 주소를 넣으면 백그라운드에서 추출해요 │
│                                      │
│ [            가져오기            ]     │ primary CTA
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ ✓ 추출 작업을 시작했어요         │ │ accepted
│ │ 다른 화면을 봐도 계속 진행돼요   │ │
│ │ [작업 보기]                      │ │
│ └──────────────────────────────────┘ │
│                                      │
│ (page-level single scroll)           │
└──────────────────────────────────────┘
```

접수 전에는 URL 입력과 primary CTA가 첫 viewport의 핵심이다. 접수 후에는 success card가 같은 영역을 대체하되 back navigation을 막지 않는다. background 상태를 spinner로 무기한 붙잡지 않는다.

## Narrow 320 Adaptation

- 좌우 padding은 role token 최소값까지 줄이되 input/CTA tap target은 44px 이상 유지한다.
- 긴 URL과 오류 문구는 줄바꿈하며 가로 overflow를 만들지 않는다.
- `가져오기`와 `작업 보기`는 세로 stack으로 한 줄 전체 폭을 사용한다.
- 200% text에서도 primary CTA와 browser bottom/safe-area가 겹치지 않도록 page-level scroll containment를 유지한다.

## Desktop Adaptation

- content column은 기존 YT_IMPORT 최대 폭 안에 유지하고 넓은 화면에 form을 과도하게 늘리지 않는다.
- header, input, CTA, accepted card의 읽기 순서는 mobile과 같다.
- 키보드 focus order는 back → URL → primary CTA → 작업 보기다.

## State Matrix

| 상태 | 화면 계약 | 행동 |
| --- | --- | --- |
| initial | URL input + 설명 + `가져오기` | valid URL만 submit |
| submitting/loading | CTA disabled, 짧은 진행 문구 | 중복 submit 차단 |
| accepted | 접수 완료, 이동 가능 안내 | `작업 보기` |
| active duplicate | 이미 진행 중인 작업 안내 | 같은 job으로 이동 |
| offline/unknown submit | URL 보존, 성공 추측 금지 | 연결 확인 후 재시도 |
| `POLICY_CHANGED` | 정책 갱신 안전 오류, terminal 취급 금지 | URL 보존 후 재시도 |
| validation/error | field 또는 safe outer error | 수정/재시도 |
| unauthorized | private 상태 노출 없음 | LOGIN + allowlisted return-to-action |
| read-only | terminal destination 재진입에서 수정 불가 의미 표시 | 작업 목록/recipe 이동 |

## Interaction And Accessibility

- submit 결과는 시각 문구로도 전달하고 색상만으로 상태를 구분하지 않는다.
- 오류 summary로 focus를 옮길 때 field focus와 중복 announce하지 않는다.
- accepted card는 자동 focus를 빼앗지 않는다. 사용자가 submit한 맥락의 status text로 알린다.
- reduced motion에서는 spinner/transition을 정적 상태 변화로 대체한다.
- `작업 보기`는 app shell notification list의 해당 job으로 이어지며 back navigation을 보존한다.

## Evidence Plan

| viewport/state | before | Stage 4 after target |
| --- | --- | --- |
| mobile 390 | `ui/designs/evidence/33-youtube-i031-direct-extraction/mobile-390-loading.png` | `ui/designs/evidence/youtube-async-extraction-notification/YT_IMPORT_BACKGROUND/mobile-390-accepted.png` |
| narrow 320 | `ui/designs/evidence/33-youtube-i031-direct-extraction/mobile-320-loading.png` | `ui/designs/evidence/youtube-async-extraction-notification/YT_IMPORT_BACKGROUND/mobile-320-offline.png` |
| desktop | `ui/designs/evidence/33-youtube-i031-direct-extraction/desktop-1280-loading.png` | `ui/designs/evidence/youtube-async-extraction-notification/YT_IMPORT_BACKGROUND/desktop-1280-active-duplicate.png` |

Stage 4는 initial/submitting/accepted/duplicate/offline/`POLICY_CHANGED`/unauthorized를 캡처하고, screenshot마다 exact frontend head SHA와 viewport를 evidence manifest에 기록한다.

## Generator Handoff

- owner: Stage 4 frontend implementer
- required review: Stage 4와 다른 design-reviewer precheck → Stage 5 → 별도 product-design-authority final verdict
- authority report: `ui/designs/authority/YT_IMPORT_BACKGROUND-authority.md`
- blocker: 390/320/desktop evidence, primary CTA, scroll containment, focus/200% text가 모두 검증되기 전 `confirmed` 금지
