# Slice: 33b-mypage-progress-ui

## Goal

마이페이지 프로필 영역의 하드코딩 레벨 문구를 실제 사용자 progress 데이터로 교체한다. 사용자는 닉네임 아래에서 현재 레벨, 다음 레벨까지 남은 XP, 진행률을 작게 확인할 수 있고, progress API 실패가 나머지 마이페이지 사용을 막지 않는다. 이 슬라이스는 33c 배지/퀘스트/토스트보다 먼저, 집밥 서비스에 맞는 조용한 성장 UI의 기반을 닫는다.

## Branches

- 문서: `docs/33b-mypage-progress-ui`
- 백엔드: N/A
- 프론트엔드: `feature/fe-33b-mypage-progress-ui`

## In Scope

- 화면:
  - `MYPAGE` 프로필/account 영역의 compact progress UI
  - 모바일 프로필 텍스트 영역 안의 inline level/progress bar
  - 데스크톱 profile card 안의 compact progress card
  - 모바일 `components/mypage/mypage-mobile-screen.tsx`
  - 데스크톱 `components/mypage/mypage-screen.tsx`에 동일 계약 적용 여부 확인
- API:
  - `GET /api/v1/users/me/progress` 소비
  - `GET /api/v1/users/me`는 profile/settings-only 유지
- 상태 전이:
  - 없음. 이 슬라이스는 조회 UI만 다룬다.
- DB 영향:
  - 없음. 33a의 `user_progress_events`, `user_progress_summary`를 읽는 progress endpoint만 소비한다.
- Schema Change:
  - [x] 없음 (읽기 전용)
  - [ ] 있음 → `supabase/migrations/<파일명>.sql` 생성 필요

## Out of Scope

- 배지, 대표 배지, 배지 안내 모달/popover
- 퀘스트/업적, 튜토리얼 퀘스트, 업적별 배지
- XP 획득 toast/popup, 실시간 progress highlight
- progress timeline/history
- leaderboard, competitive rank, pressure streak, season reset, loot/reward box
- 신규 progress API, 기존 API 응답 필드 추가, DB schema 변경
- 클라이언트 측 XP/레벨 계산
- `GET /api/v1/users/me`에 progress를 섞는 변경

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `33a-user-progress-foundation` | merged (PR #719, merge commit `c6637521`) | [x] |
| `17a-mypage-overview-history` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 상태가 아니면 이 슬라이스를 시작하지 않는다.

## Backend First Contract

- request body / query / path 파라미터
  - `GET /api/v1/users/me/progress`
  - request body 없음
  - query/path 파라미터 없음
- response `{ success, data, error }`
  - success:
    - `data.level.current_level`
    - `data.level.total_xp`
    - `data.level.current_level_start_xp`
    - `data.level.next_level_start_xp`
    - `data.level.xp_into_current_level`
    - `data.level.xp_to_next_level`
    - `data.level.progress_ratio`
    - `data.level.progress_percent`
    - `data.event_counts.cooking_completed`
    - `data.event_counts.shopping_completed`
    - `data.event_counts.recipe_saved_distinct_ever`
    - `data.event_counts.custom_book_created`
    - `data.last_updated_at`
  - error: 33a route의 `{ code, message, fields[] }` envelope를 그대로 따른다.
- 권한 / 소유자 검증 / 상태 전이 / 멱등성
  - 로그인 사용자 본인의 progress만 조회한다.
  - 프론트엔드는 progress endpoint 실패를 MYPAGE 전체 실패로 승격하지 않는다.
  - 조회 전용이므로 멱등하다.
  - 클라이언트는 XP/level을 계산하지 않고 서버 응답 필드를 표시한다.

## Frontend Delivery Mode

- 디자인 확정 전: `ui/designs/MYPAGE_PROGRESS.md`와 정적 prototype 기준으로 compact UI를 구현한다.
- 필수 상태:
  - `loading`: progress 영역만 skeleton으로 표시
  - `empty`: `current_level=1`, `total_xp=0` 또는 event count 0인 초기 progress를 정상 상태로 표시
  - `error`: progress 영역만 soft-fail copy 표시, 마이페이지 core는 유지
  - `read-only`: 조회 전용 progress UI라 편집/액션 없음
  - `unauthorized`: MYPAGE 로그인 게이트를 따르며 progress 별도 호출/표시는 하지 않는다
- 로그인 보호 액션이면 return-to-action 포함:
  - 이 슬라이스에는 신규 보호 액션이 없다. 기존 MYPAGE 로그인 게이트를 유지한다.

## Design Authority

- UI risk: `high-risk`
- Anchor screen dependency: 없음
- Visual artifact:
  - `ui/designs/MYPAGE_PROGRESS.md`
  - `ui/designs/critiques/MYPAGE_PROGRESS-critique.md`
  - `ui/designs/prototypes/33b-mypage-progress-ui/index.html`
  - Stage 4 evidence 예정:
    - `ui/designs/evidence/33b-mypage-progress-ui/mobile-390.png`
    - `ui/designs/evidence/33b-mypage-progress-ui/mobile-320.png`
    - `ui/designs/evidence/33b-mypage-progress-ui/desktop-1440.png`
- Authority status: `required`
- Notes:
  - 게임형 참고 이미지는 톤 참고만 한다.
  - UI는 MYPAGE 프로필 영역 안의 compact card/bar로 제한한다. 모바일은 첫 화면 밀도를 유지하기 위해 프로필 텍스트 영역 안의 inline bar로 표시한다.
  - 33c에서 배지/퀘스트가 붙을 수 있는 시각적 여지는 남기되, 33b에서는 CTA/모달/토스트를 넣지 않는다.

## Design Status

- [ ] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [x] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [ ] 확정 (confirmed) — Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과, Tailwind/공용 컴포넌트 정리 완료, authority blocker 0개
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

> Design Status 전이: `temporary` (Stage 1 기본값)
>   → `pending-review` (Stage 4 완료 후)
>   → `confirmed` (Stage 5 public review 통과 후, authority-required면 final authority gate 통과 후)

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/33a-user-progress-foundation/README.md`
- `docs/workpacks/33a-user-progress-foundation/acceptance.md`
- `docs/요구사항기준선-v1.7.7.md`
- `docs/화면정의서-v1.5.14.md`
- `docs/유저flow맵-v1.3.14.md`
- `docs/db설계-v1.3.12.md`
- `docs/api문서-v1.2.16.md`
- `ui/designs/MYPAGE.md`
- `ui/designs/critiques/MYPAGE-critique.md`
- `docs/design/mobile-ux-rules.md`
- `docs/engineering/product-design-authority.md`

## QA / Test Data Plan

- fixture baseline / auth override / fault injection
  - MYPAGE 테스트 fixture에 progress success, zero-progress, progress-fetch-failure를 추가했다.
  - auth override는 기존 MYPAGE 테스트 패턴을 따른다.
  - fault injection은 progress endpoint만 실패시키고 profile/recipebook/shopping history는 성공하는 케이스를 둔다.
- real DB smoke 경로
  - 33a route/level/event 테스트로 progress contract를 재확인했다.
  - local Supabase + local Next route smoke에서 `GET /api/v1/users/me/progress`의 unauthenticated 401 envelope를 확인했다.
  - Stage 4에서는 MYPAGE가 progress API 실패에도 렌더되는지 브라우저에서 확인했다.
- seed / reset 명령
  - 신규 seed 없음.
  - 33a의 survivor-only backfill/reconcile 또는 기존 progress fixture를 사용한다.
- bootstrap이 생성해야 하는 시스템 row / 기본 데이터
  - 신규 bootstrap 없음.
  - `recipe_books` 등 기존 MYPAGE bootstrap은 17a 기준을 따른다.
- blocker 조건
  - `GET /api/v1/users/me/progress`가 master에 없거나 33a response shape와 다르다.
  - MYPAGE에서 progress fetch 실패가 전체 화면 error로 전파된다.
  - 320px에서 progress label/bar/text가 겹치거나 잘린다.
  - 하드코딩 레벨 문구가 남아 있다.

## Key Rules

- `components/mypage/mypage-mobile-screen.tsx`의 하드코딩 레벨 subtitle은 제거한다.
- desktop MYPAGE에도 동일한 정적 레벨 표현이 있으면 제거한다.
- progress는 `GET /api/v1/users/me/progress`에서만 가져온다.
- `GET /api/v1/users/me` 응답에 progress를 추가하지 않는다.
- 클라이언트는 XP/level을 계산하지 않는다.
- progress area failure는 soft-fail이며 MYPAGE 전체 error가 아니다.
- progress UI는 조회 전용이다.
- 배지/퀘스트/토스트/튜토리얼 진입점은 33c 전까지 숨긴다.

## Contract Evolution Candidates (Optional)

- 없음. 33a contract-evolution으로 공식 문서에 추가된 progress endpoint와 MYPAGE compact progress display만 소비한다.

## Future Hooks For 33c

- progress card 아래 또는 옆에 대표 배지 row를 붙일 수 있는 layout 여지는 남긴다.
- XP toast가 progress card를 highlight하는 동작은 33c에서 추가한다.
- 퀘스트/업적 진입 CTA와 badge guide modal은 33c 범위다.
- 33b는 위 hook을 위한 prop, CTA, route, modal을 미리 만들지 않는다.

## Primary User Path

1. 로그인한 사용자가 하단 탭에서 MYPAGE에 진입한다.
2. 프로필 영역에서 닉네임/로그인 제공자와 함께 실제 서버 progress 기반 레벨과 progress bar를 본다.
3. progress API가 느리면 해당 영역만 skeleton으로 보이고, 실패하면 MYPAGE 나머지 내용은 계속 사용할 수 있다.
4. 320px/390px 모바일에서도 progress 텍스트와 bar가 겹치지 않고 한눈에 스캔된다.

## Delivery Checklist

> 이 체크리스트는 Stage 4~6 동안 계속 갱신하는 living closeout 문서다.
> Stage 2/3 backend는 FE-only라 N/A이며, Stage 4에서 구현과 evidence를 닫는다.
> Stage 6 merge 시점에는 In Scope인데도 남아 있는 unchecked 항목이 없어야 하며, `N/A` 또는 후속 분리는 README/PR 본문에 근거를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

- [x] Stage 1 design/prototype artifact 잠금 <!-- omo:id=delivery-stage1-design-prototype;stage=4;scope=frontend;review=5,6 -->
- [x] progress API adapter/type 연결 <!-- omo:id=delivery-progress-api-adapter;stage=4;scope=frontend;review=5,6 -->
- [x] MYPAGE 모바일 하드코딩 레벨 subtitle 제거 <!-- omo:id=delivery-mobile-hardcoded-level-removal;stage=4;scope=frontend;review=5,6 -->
- [x] MYPAGE 데스크톱 progress 계약 확인 및 필요 시 동일 적용 <!-- omo:id=delivery-desktop-progress-contract;stage=4;scope=frontend;review=5,6 -->
- [x] compact progress card UI 연결 <!-- omo:id=delivery-progress-card-ui;stage=4;scope=frontend;review=5,6 -->
- [x] `loading / empty / error / read-only / unauthorized` 상태 점검 <!-- omo:id=delivery-progress-state-ui;stage=4;scope=frontend;review=5,6 -->
- [x] progress soft-fail이 MYPAGE 전체 error로 전파되지 않음 <!-- omo:id=delivery-progress-soft-fail;stage=4;scope=frontend;review=5,6 -->
- [x] 클라이언트 XP/level 계산 없음 <!-- omo:id=delivery-server-authority-display;stage=4;scope=frontend;review=5,6 -->
- [x] 390px/320px visual evidence 확보 <!-- omo:id=delivery-mobile-visual-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
