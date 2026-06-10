# Slice: recipebook-diary-port

## Goal

레시피북을 단순 저장 목록이 아니라 사용자가 직접 만든 레시피 다이어리처럼 느끼도록 `MYPAGE`와 `RECIPEBOOK_DETAIL`의 화면 구조와 디자인 기준을 잠근다. 이번 후속 작업은 승인된 contract-evolution에 따라 레시피북 리더용 읽기 전용 상세 조회를 추가하고, 책 안에서 재료와 만들기까지 볼 수 있게 한다.

## Branches

- 백엔드: N/A (FE-only design/docs lock)
- 프론트엔드: `feature/recipebook-diary-service`
- Stage 1 문서 브랜치: `docs/recipebook-diary-port`

## In Scope

- 화면:
  - `MYPAGE`: 레시피북 목록을 작은 책/책장 형태로 표현하되 기존 생성/수정/삭제/상세 진입 흐름 유지
  - `RECIPEBOOK_DETAIL`: 웹에서 프로토타입처럼 왼쪽 목차 패널과 오른쪽 레시피북 리더를 분리하고, 리더 안에서 `책`/`목록` 전환과 단일 레시피 책 페이지를 제공
  - `RECIPEBOOK_DETAIL`: 모바일에서 레시피북 이름 앱바 + 목차 중심 상단 + 단일 레시피 카드 흐름으로 다이어리 감성 유지
- 라우트:
  - 기존 `/mypage` 유지
  - 기존 `/mypage/recipe-books/{book_id}` 유지
  - 레시피 항목 클릭은 기존 `RECIPE_DETAIL`로 이동
- API:
  - 기존 `GET /api/v1/recipe-books`
  - 기존 `POST /api/v1/recipe-books`
  - 기존 `PATCH /api/v1/recipe-books/{book_id}`
  - 기존 `DELETE /api/v1/recipe-books/{book_id}`
  - 기존 `GET /api/v1/recipe-books/{book_id}/recipes`
  - 신규 `GET /api/v1/recipe-books/{book_id}/recipes/{recipe_id}`: 레시피북 리더용 read-only 상세 조회
  - 기존 레시피 제거/좋아요 해제 mutation은 `17b` 계약 유지
- 상태 전이: 없음. 저장/좋아요/제거/권한 정책은 기존 슬라이스 계약 유지
- DB 영향: `recipe_books.cover_color_key`, `recipe_books.cover_image_url` additive metadata 추가. 기존 `recipe_book_items`, `recipes` 조회/관계와 저장 정책은 유지
- Schema Change:
  - [x] `recipe_books` 커버 색상/이미지 메타데이터 additive column 추가

## Out of Scope

- API request/response/error 구조 변경
- status enum, recipebook type 변경
- 저장 가능한 레시피북 타입 확장 (`saved`, `custom`만 유지)
- 삭제된 `DELETE /recipes/{id}/save` endpoint 복원
- `GET /api/v1/recipes/{id}`를 숨은 preview source로 사용하는 구현
- 레시피북 리더용 상세 조회 외의 preview endpoint 추가
- 레시피 저장/좋아요 정책 변경
- 직접 레시피 등록, 유튜브 가져오기, 식단 플래너 연동 정책 변경
- 레벨/등급 시스템 구현

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `17a-mypage-overview-history` | merged | [x] |
| `17b-recipebook-detail-remove` | merged | [x] |
| `17c-settings-account` | merged | [x] |
| `wave1-port-account-library-leftovers` | merged | [x] |
| `mvp2-polish-mypage-return-loading` | merged | [x] |
| `ux-latency-resolution` | merged | [x] |

## Classification

- **UI risk: `high-risk`**
- 이유: 새 API/DB 없이 기존 화면을 개선하지만, 레시피북 목록과 상세의 시각 은유, 웹 정보 구조, 모바일 카드 밀도를 함께 바꾸는 사용자-facing 재구성이다.
- Anchor screen dependency: 없음 (`HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK` 직접 변경 없음)
- design-generator / design-critic: 필요. 이번 Stage 1에서 prototype, design doc, critique를 기준으로 후속 FE 구현의 target을 잠근다.
- product-design-authority: required. Stage 4 후 데스크톱 1440, 모바일 390, 모바일 320 evidence와 authority report가 필요하다.

## Product Direction

### Track 1: This Slice

기존 공식 계약을 유지하면서 레시피북을 "책"처럼 느끼게 한다.

- `MYPAGE`의 레시피북 목록은 작은 책 표지/책등이 모인 bookshelf 형태로 바꾼다.
- 각 책은 이름, 타입, 레시피 수, 주요 액션을 읽기 쉽게 제공한다.
- 책 형태는 감성 요소지만 CRUD와 상세 진입을 가리지 않는다.
- `RECIPEBOOK_DETAIL` 웹은 책장 화면과 상세 화면을 분리하되, 상세 화면 자체는 프로토타입의 열린 책뷰를 핵심 은유로 유지한다.
- 웹 상세는 왼쪽 목차 패널, 오른쪽 레시피북 리더 헤더, `책`/`목록` segmented control, 단일 레시피 책 페이지, 하단 페이지 선택 버튼을 프로토타입 구조와 맞춘다.
- `책` 모드는 한 번에 한 레시피 페이지를 보여주고, `목록` 모드는 기존 카드 목록을 펼쳐 관리/탐색 효율을 유지한다.
- 모바일 상세는 앱바에 레시피북 이름을 표시하고, 앱바 아래 공간을 목차 중심으로 사용한다.
- 레시피북 리더 안에서는 `GET /api/v1/recipe-books/{book_id}/recipes/{recipe_id}`로 재료와 만들기를 읽기 전용으로 표시한다.
- 리더용 상세 조회는 `GET /api/v1/recipes/{id}`를 사용하지 않으며 `view_count`를 증가시키지 않는다.

### Track 2: Future Contract Evolution

진짜 책처럼 페이지를 넘기며 각 레시피의 상세 내용을 보는 reader는 승인되었다. 구현은 `GET /api/v1/recipes/{id}`를 재사용하지 않고, `view_count`를 증가시키지 않는 레시피북 소속 검증 전용 endpoint로 제한한다. 물리적인 page-turn 애니메이션은 탐색 보조 효과일 뿐 필수 경로가 아니다.

## Backend First Contract

- Backend 변경 있음: 레시피북 리더용 read-only 상세 조회 추가.
- 기존 응답 래퍼 `{ success, data, error }` 소비 방식 유지.
- `GET /api/v1/recipe-books`는 `MYPAGE` 책장 목록 source이며 커버 색상/이미지 메타데이터를 포함한다.
- `GET /api/v1/recipe-books/{book_id}/recipes`는 `RECIPEBOOK_DETAIL` 목록 source다.
- `GET /api/v1/recipe-books/{book_id}/recipes/{recipe_id}`는 `RECIPEBOOK_DETAIL`의 재료/만들기 source이며, 요청자의 레시피북 소속을 검증하고 `view_count`를 증가시키지 않는다.
- `POST/PATCH /api/v1/recipe-books`는 커스텀 레시피북의 `cover_color_key`, `cover_image_url`을 선택적으로 저장한다.
- saved/custom 제거와 liked unlike 분기는 `17b` 서버 계약을 유지한다.
- 권한/소유자 검증은 기존 API가 담당한다.
- 프론트는 unauthorized/error/empty/loading 상태를 기존 API 결과에 맞춰 표시한다.
- hidden preview를 위해 `GET /api/v1/recipes/{id}`를 자동 호출하지 않는다.

## Frontend Delivery Mode

- 디자인 상태: high-risk redesign planning. Stage 4 구현 후 public review + authority gate 필요
- 필수 상태:
  - `loading`: 책장/상세 skeleton이 레이아웃 shift 없이 표시
  - `empty`: 레시피북 없음, 책 안 레시피 없음
  - `error`: 목록/상세 fetch 실패
  - `unauthorized`: 비로그인 접근 시 로그인 안내와 return-to-action 유지
  - `read-only`: 시스템 책/liked 책/제거 불가 정책을 기존 방식대로 표현
- 보호 액션:
  - 레시피북 생성/수정/삭제, 제거/좋아요 해제는 기존 로그인 게이트와 권한 정책 유지
- 반응형:
  - 웹 넓은 화면에서는 `RECIPEBOOK_DETAIL`을 왼쪽 목차 패널 + 오른쪽 단일 책 페이지 리더 구조로 표시
  - 모바일에서는 desktop split을 강제로 축소하지 않고 세로 카드 흐름 사용
  - 320px에서 텍스트, 아이콘 버튼, book cover label이 넘치지 않아야 한다

## Design Authority

- UI risk: `high-risk`
- Anchor screen dependency: 없음
- Visual artifact:
  - `ui/designs/prototypes/recipebook-diary/index.html`
  - `ui/designs/evidence/recipebook-diary-prototype/desktop-1440.png`
  - `ui/designs/evidence/recipebook-diary-prototype/mobile-390.png`
  - `ui/designs/evidence/recipebook-diary-prototype/mobile-320.png`
  - `ui/designs/MYPAGE.md`
  - `ui/designs/RECIPEBOOK_DETAIL.md`
- Authority status: `required`
- Notes: prototype은 이번 상세 리더의 구조 target이다. 실제 서비스 적용에서는 기존 HOMECOOK 상단 내비게이션, API 데이터 범위, 관리 액션, 브랜드 색상 토큰을 유지한다.

## Design Status

- [x] 임시 UI (temporary) -- Stage 1 design direction lock. 후속 Stage 4 구현 전
- [ ] 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed)
- [ ] N/A

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/workpacks/17a-mypage-overview-history/README.md`
- `docs/workpacks/17b-recipebook-detail-remove/README.md`
- `docs/workpacks/17c-settings-account/README.md`
- `docs/요구사항기준선-v1.7.5.md`
- `docs/화면정의서-v1.5.12.md`
- `docs/유저flow맵-v1.3.12.md`
- `docs/db설계-v1.3.11.md`
- `docs/api문서-v1.2.15.md`
- `docs/engineering/slice-workflow.md`
- `docs/engineering/agent-workflow-overview.md`
- `docs/engineering/product-design-authority.md`
- `docs/design/mobile-ux-rules.md`
- `docs/design/anchor-screens.md`
- `ui/designs/MYPAGE.md`
- `ui/designs/RECIPEBOOK_DETAIL.md`
- `ui/designs/critiques/MYPAGE-critique.md`
- `ui/designs/critiques/RECIPEBOOK_DETAIL-critique.md`

## QA / Test Data Plan

- fixture baseline:
  - 시스템 책 `liked`, `saved`, `my_added`와 커스텀 책 1개 이상
  - `saved/custom` 책에는 레시피 3개 이상과 empty 책 1개
  - liked 책은 unlike 동작 확인 가능
  - 긴 레시피북 이름, 긴 레시피명, 0개/1개/다수 레시피 case
- real DB smoke:
  - 신규 API/DB가 없으므로 required real DB smoke는 기존 `17a/17b` 경로 재사용
  - 후속 FE PR에서는 `/mypage`, `/mypage/recipe-books/{book_id}` 수동 브라우저 smoke와 screenshot evidence 확보
- seed/reset: 신규 seed 없음
- bootstrap: 기존 회원별 시스템 레시피북 생성 흐름 유지
- blocker 조건:
  - 웹 1440에서 오른쪽 단일 책 페이지가 읽기에 부족할 정도로 좁다
  - desktop split이 모바일에서 그대로 축소되어 가로 overflow 또는 작은 tap target을 만든다
  - 책/다이어리 효과 때문에 생성/수정/삭제/제거 액션이 숨는다
  - 레시피 항목 preview를 위해 `GET /api/v1/recipes/{id}`가 자동 호출된다
  - 320px에서 book title/count/action 텍스트가 겹치거나 잘린다
  - keyboard/screen reader 사용자가 목차와 목록을 탐색할 수 없다

### 검증 전략

- `pnpm validate:workpack -- --slice recipebook-diary-port`
- `pnpm validate:workflow-v2`
- `git diff --check`
- 후속 FE 구현:
  - targeted Vitest: `MYPAGE` 책장 rendering, CRUD action discoverability, route href 유지
  - targeted Vitest: `RECIPEBOOK_DETAIL` desktop/mobile layout state, remove action 유지, hidden recipe detail fetch 없음
  - Playwright desktop 1440: shelf, detail split, no cramped recipe area
  - Playwright mobile 390/320: no horizontal overflow, tap target >= 44px, text overlap 없음
  - Design Authority report: `ui/designs/authority/RECIPEBOOK_DIARY_PORT-authority.md`
  - exploratory QA/eval: high-risk UI 변경 기준에 따라 Stage 5/6에서 수행

## Key Rules

1. 공식 문서에 없는 API/status/field/endpoint를 추가하지 않는다.
2. `GET /api/v1/recipe-books/{book_id}/recipes`를 상세 목록 source로 둔다.
3. 리더 상세는 `GET /api/v1/recipe-books/{book_id}/recipes/{recipe_id}`만 사용하고, `GET /api/v1/recipes/{id}`를 숨겨서 호출하지 않는다.
4. 레시피 항목 클릭은 기존 `RECIPE_DETAIL`로 이동한다.
5. saved/custom 제거와 liked unlike 정책은 `17b` 그대로 유지한다.
6. `my_added` 책 제거 불가 정책을 완화하지 않는다.
7. 책 형태는 affordance를 해치면 안 된다. 액션은 익숙한 아이콘/버튼과 tooltip/label을 유지한다.
8. 모바일에서 가로 스크롤 없는 세로 흐름을 우선한다.
9. 320px에서도 제목, count, action, card metadata가 겹치지 않는다.
10. 열린 책 효과는 웹 상세의 핵심 시각 은유지만, page-turn effect는 유일한 navigation이 되면 안 된다.

## Contract Evolution Candidates

| 후보 | 현재 계약 | 제안 계약 | 기대 사용자 가치 | 영향 문서 | 승인 상태 |
| --- | --- | --- | --- | --- | --- |
| Read-only recipebook reader data path | `RECIPEBOOK_DETAIL`은 `GET /recipe-books/{book_id}/recipes` 목록을 보여주고, 상세 내용은 `RECIPE_DETAIL`에서 조회한다. `GET /recipes/{id}`는 조회수 증가 의미가 있다. | view_count를 증가시키지 않는 recipebook reader/preview 전용 data path를 공식화한다. | 책 안에서 페이지를 넘기며 레시피 상세를 읽는 진짜 레시피북 경험 제공 | 요구사항, 화면정의서, 유저플로우, API, DB 영향 검토 | 승인됨 |
| Page-turn full reader | 현재 레시피북 상세는 목록/관리 화면이다. | 사용자가 책 페이지를 넘기듯 레시피 상세 내용을 탐색하는 reader mode를 추가한다. | 다이어리/레시피북 컨셉 강화, 장기 사용 감성 강화 | 요구사항, 화면정의서, 유저플로우, API | 승인됨 |

## Primary User Path

1. 사용자가 `MYPAGE`에 들어간다.
2. 레시피북 탭에서 시스템/커스텀 책을 작은 책장 형태로 스캔한다.
3. 커스텀 책을 생성/수정/삭제하거나, 책 하나를 선택한다.
4. `/mypage/recipe-books/{book_id}`에서 왼쪽 목차 패널과 오른쪽 단일 레시피 책 페이지가 분리된 리더 화면을 본다.
5. 웹에서는 목차/페이지 버튼으로 책 페이지를 바꾸거나, `목록`으로 기존 카드 목록을 펼친다.
6. 레시피 카드 또는 상세 보기 액션을 선택하면 기존 `RECIPE_DETAIL`로 이동한다.
7. 필요하면 기존 정책대로 저장 책에서 제거하거나 liked 책에서 좋아요를 해제한다.

## Delivery Checklist

- [ ] Stage 1 workpack README/acceptance/automation-spec 생성 <!-- omo:id=recipebook-diary-stage1-docs;stage=1;scope=docs;review=5,6 -->
- [ ] `docs/workpacks/README.md`와 `.workflow-v2` 항목 등록 <!-- omo:id=recipebook-diary-roadmap-workflow;stage=1;scope=docs;review=5,6 -->
- [ ] `MYPAGE` 책장형 레시피북 목록 UI 연결 <!-- omo:id=recipebook-diary-mypage-bookshelf;stage=4;scope=frontend;review=5,6 -->
- [ ] `RECIPEBOOK_DETAIL` desktop 열린 책 상세 구조 구현 <!-- omo:id=recipebook-diary-detail-desktop-split;stage=4;scope=frontend;review=5,6 -->
- [ ] `RECIPEBOOK_DETAIL` mobile cover/summary + list card flow 구현 <!-- omo:id=recipebook-diary-detail-mobile-flow;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 CRUD/remove/unlike/route behavior 회귀 없음 확인 <!-- omo:id=recipebook-diary-existing-behavior;stage=4;scope=frontend;review=5,6 -->
- [ ] hidden `GET /recipes/{id}` preview 호출 없음 테스트로 확인 <!-- omo:id=recipebook-diary-no-view-count-preview;stage=4;scope=frontend;review=5,6 -->
- [ ] `loading / empty / error / unauthorized / read-only` 상태 점검 <!-- omo:id=recipebook-diary-state-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] desktop 1440, mobile 390, mobile 320 screenshot evidence 확보 <!-- omo:id=recipebook-diary-screenshot-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] Design Authority report 통과 <!-- omo:id=recipebook-diary-authority-report;stage=5;scope=frontend;review=6 -->
- [ ] targeted Vitest / Playwright / exploratory QA 통과 <!-- omo:id=recipebook-diary-targeted-verification;stage=5;scope=frontend;review=6 -->
