# Slice: 36e-recipe-tags-frontend

## Goal

36a~36d에서 잠근 레시피 태그 v2 백엔드 계약을 HOME, MANUAL_RECIPE_CREATE, YT_IMPORT production UI에 연결한다. 사용자는 HOME에서 태그로 검색하고 tag chip/theme로 정확 필터를 적용할 수 있으며, 직접 등록과 YouTube 등록에서는 서버 추천 태그를 보고 삭제하거나 직접 추가한 뒤 저장할 수 있다. 서버 자동 태그 생성은 유지되며, 사용자가 태그를 수정하지 않으면 백엔드 추천값이 그대로 저장된다.

이 slice는 FE-only다. `tags` / `recipe_tags` canonical write, P0 의미 태그 규칙, backfill dry-run, usage count reconcile은 36b~36d 백엔드 계약을 소비한다.

## Branches

- 백엔드: N/A
- 프론트엔드: `feature/fe-36e-recipe-tags-frontend`

## In Scope

- 화면:
  - `HOME` 검색 input을 제목+승인 태그 검색으로 연결
  - `HOME` tag chip 정확 필터와 tag-backed theme 진입 UX
  - `MANUAL_RECIPE_CREATE` 서버 추천 tag chip, 직접 추가, 삭제, inline validation
  - `YT_IMPORT` extract 결과의 서버 추천 tag chip, 직접 추가, 삭제, register body 연결
- API:
  - `GET /api/v1/recipes?q=<query>`
  - `GET /api/v1/recipes?tag=<normalized_key>`
  - `GET /api/v1/tags`
  - `GET /api/v1/recipes/themes`
  - `POST /api/v1/recipes/tag-suggestions`
  - `POST /api/v1/recipes`
  - `POST /api/v1/recipes/youtube/register`
- 상태 전이:
  - HOME search query 입력/초기화
  - HOME tag chip/theme 선택/해제
  - tag suggestion loading/success/error fallback
  - tag add/delete/duplicate/length validation
  - register/create submit 중 tag body 포함
- DB 영향:
  - 없음. 36e는 클라이언트에서 기존 API 계약만 소비한다.
- Schema Change:
  - [x] 없음 (읽기 전용/기존 write API 소비)
  - [ ] 있음 -> N/A

## Out of Scope

- 신규 API endpoint 또는 DB migration
- 서버 자동 태그 추천 rule 변경
- 기존 recipe production backfill 실제 적용
- usage count reconcile 실제 운영 실행
- 사용자 자유 tag moderation/admin 승인 UI
- P1 후보 태그(`유명셰프요리`, `SNS화제`, `검증된레시피`) 자동 부여
- 자동 romanization slug 생성
- HOME theme seed 정책 변경

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `36a-recipe-tags-contract-evolution` | merged | [x] |
| `36b-recipe-tags-model-write` | merged | [x] |
| `36c-recipe-tags-search-themes` | merged | [x] |
| `36d-recipe-tags-rules-backfill` | merged | [x] |

## Backend First Contract

- Backend 구현 없음.
- 모든 응답은 기존 `{ success, data, error }` envelope를 소비한다.
- HOME:
  - `q`는 제목 + public/approved tag label 검색어다.
  - `tag`는 `tags.normalized_key` 정확 필터이며 P0에서는 한글 key를 그대로 사용한다. 예: `tag=한식`.
  - tag-backed theme 응답의 `tag_key`가 있으면 해당 key로 exact filter를 호출한다.
  - `GET /tags` 결과는 공개 autocomplete/tag chip 후보로만 사용한다.
- MANUAL_RECIPE_CREATE:
  - 저장 전 `POST /recipes/tag-suggestions`는 recipe row를 만들지 않는 preview다.
  - 추천 실패는 저장을 막지 않는다.
  - 사용자가 tag를 수정하지 않고 저장하면 `tags` body를 생략해 서버 fallback 추천을 유지할 수 있다.
  - 사용자가 삭제/추가/수정하면 검수된 label 배열을 `POST /recipes` body의 `tags`에 포함한다.
- YT_IMPORT:
  - extract/session의 `tags` 또는 `suggested_tags`를 검수 chip으로 표시한다.
  - 사용자가 tag를 수정하지 않고 등록하면 `tags` body를 생략해 session 추천값을 저장한다.
  - 사용자가 삭제/추가/수정하면 검수된 label 배열을 `POST /recipes/youtube/register` body의 `tags`에 포함한다.
- Error:
  - tag suggestion/API 오류는 inline error 또는 empty tag state로 격리하고, 레시피 작성/등록 자체를 불필요하게 막지 않는다.
  - API가 `VALIDATION_ERROR fields: [{ field: "tags" }]`를 반환하면 tag 영역에 inline error를 표시한다.

## Frontend Delivery Mode

- 디자인 상태: 기존 confirmed 화면에 기능을 얹는 anchor extension이다.
- 필수 상태: `loading / empty / error / read-only / unauthorized`
- HOME은 비로그인 조회 가능이며, 로그인 보호 action이 새로 추가되지 않는다.
- MANUAL_RECIPE_CREATE와 YT_IMPORT의 기존 auth gate/return-to-action을 유지한다.
- tag chip row는 작은 모바일에서 줄바꿈/가로 overflow 없이 동작해야 한다.
- 추천 tag가 없거나 추천 실패 시에도 사용자는 직접 태그를 추가하거나 태그 없이 저장할 수 있다.

## Design Authority

- UI risk: `anchor-extension`
- Anchor screen dependency: `HOME`
- Visual artifact:
  - Existing baseline: `ui/designs/HOME.md`, `ui/designs/MANUAL_RECIPE_CREATE.md`, `ui/designs/YT_IMPORT.md`
  - Existing critique: `ui/designs/critiques/HOME-critique.md`, `ui/designs/critiques/MANUAL_RECIPE_CREATE-critique.md`, `ui/designs/critiques/YT_IMPORT-critique.md`
  - Stage 4 evidence target: `ui/designs/evidence/36e-recipe-tags-frontend/`
- Authority status: `required`
- Notes:
  - HOME은 anchor screen이라 tag search/filter/theme UX가 기존 첫 화면 정보 구조를 과도하게 밀면 실패다.
  - 등록 화면의 tag 검수는 기존 긴 작성 flow를 늘리는 부가 기능이므로 compact chip editor로 제한한다.

## Design Status

- [x] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [ ] 확정 (confirmed) — Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과
- [ ] N/A — BE-only 슬라이스

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/36a-recipe-tags-contract-evolution/README.md`
- `docs/workpacks/36b-recipe-tags-model-write/README.md`
- `docs/workpacks/36c-recipe-tags-search-themes/README.md`
- `docs/workpacks/36d-recipe-tags-rules-backfill/README.md`
- `docs/요구사항기준선-v1.7.11.md` §2-15
- `docs/화면정의서-v1.5.18.md` §1, §9, §10
- `docs/유저flow맵-v1.3.18.md` ①, ⑨, ⑩
- `docs/api문서-v1.2.20.md` §1-1, §1-2, §1-2b, §6-4, §7-0b, §7-1
- `docs/design/mobile-ux-rules.md`
- `docs/design/anchor-screens.md`
- `docs/engineering/product-design-authority.md`

## QA / Test Data Plan

- Fixture baseline:
  - HOME recipe list title-only match
  - HOME tag-label-only match
  - tag-backed theme with `tag_key='한식'`
  - public tag autocomplete list
  - manual recipe form with enough title/ingredients/steps to return `초보가능`, `한식`
  - YouTube extract draft with `tags` and `suggested_tags`
  - tag validation: duplicate, empty, leading `#`, too long
- Real DB smoke:
  - 36b~36d migrations applied locally or linked environment already contain `tags`, `recipe_tags`, 36c read RPCs, 36d seed/RPCs.
  - 36e itself does not run production backfill/reconcile.
- Visual evidence:
  - `HOME` mobile 390 and narrow 320 with search/tag filter/theme state
  - `MANUAL_RECIPE_CREATE` mobile tag editor state
  - `YT_IMPORT` mobile tag review state
  - desktop HOME tag search/filter state
- Blocker:
  - HOME tag chip/theme가 private/pending/user tag를 theme seed처럼 노출
  - `tag=hansik` 같은 자동 romanization filter를 UI가 만들거나 문서화
  - 사용자가 tag를 수정하지 않았는데 클라이언트가 빈 `tags: []`를 보내 서버 추천 저장을 막음
  - suggestion 실패가 레시피 저장 자체를 막음
  - 모바일 320px에서 chip/editor/search text가 넘치거나 CTA를 가림

## Key Rules

1. 서버 자동 태그 생성 기능은 유지한다.
2. 사용자가 태그를 수정하지 않은 경우 `tags` body를 생략해 서버 추천/session 추천을 저장한다.
3. 사용자가 태그를 수정한 경우에만 검수된 `tags` label 배열을 전송한다.
4. P0 exact tag key는 한글 `normalized_key`를 그대로 사용한다.
5. HOME theme seed 정책은 백엔드 결과를 신뢰하고 클라이언트에서 사용자 자유 tag를 theme로 승격하지 않는다.
6. tag suggestion 실패는 작성/등록 실패가 아니다.
7. tag validation은 빈 값, 중복, 앞 `#`, 길이 초과를 사용자 입력 단계에서 막는다.
8. 기존 auth gate, return-to-action, image upload, quantity review, ingredient registration flow를 깨뜨리지 않는다.
9. HOME first viewport는 기존 탐색 구조를 유지하고 tag UX는 compact하게 배치한다.
10. 운영 backfill dry-run/reconcile은 이 UI slice의 자동 실행 범위가 아니다.

## Contract Evolution Candidates

- 없음. 36a 공식 계약과 36b~36d 구현 계약을 그대로 소비한다.

## Primary User Path

1. 사용자가 HOME에서 검색어를 입력하면 레시피 제목과 승인된 tag label 기준으로 결과가 갱신된다.
2. 사용자가 tag chip 또는 tag-backed theme를 선택하면 `GET /recipes?tag=<normalized_key>` exact filter가 적용된다.
3. 사용자가 직접 레시피를 작성하면 서버 추천 tag가 chip으로 표시되고, 사용자는 삭제하거나 직접 tag를 추가할 수 있다.
4. 사용자가 YouTube 레시피를 추출하면 session 추천 tag가 검수 chip으로 표시되고, 등록 시 수정 여부에 따라 `tags` body를 포함하거나 생략한다.
5. 저장된 레시피는 기존 카드/상세의 `recipes.tags` projection으로 표시된다.

## Delivery Checklist

> 이 체크리스트는 Stage 4~6 동안 계속 갱신하는 living closeout 문서다. 36e는 FE-only이며 Stage 2/3 backend 구현은 없다.

- [ ] 누락된 36e workpack/acceptance/automation metadata 보강 <!-- omo:id=delivery-36e-workpack-gap;stage=4;scope=shared;review=5,6 -->
- [ ] HOME API helper/state가 `q`, `tag`, `GET /tags`, tag-backed themes를 소비 <!-- omo:id=delivery-home-tag-api-state;stage=4;scope=frontend;review=5,6 -->
- [ ] HOME 검색 input이 제목+승인 tag label 검색으로 동작 <!-- omo:id=delivery-home-title-tag-search;stage=4;scope=frontend;review=5,6 -->
- [ ] HOME tag chip/theme 선택이 한글 `normalized_key` exact filter로 동작 <!-- omo:id=delivery-home-exact-tag-filter;stage=4;scope=frontend;review=5,6 -->
- [ ] MANUAL_RECIPE_CREATE tag suggestion/review chip editor 구현 <!-- omo:id=delivery-manual-tag-editor;stage=4;scope=frontend;review=5,6 -->
- [ ] MANUAL_RECIPE_CREATE에서 수정 안 한 태그는 `tags` body 생략, 수정한 태그만 전송 <!-- omo:id=delivery-manual-tag-submit-policy;stage=4;scope=frontend;review=5,6 -->
- [ ] YT_IMPORT tag review chip editor와 register body 정책 구현 <!-- omo:id=delivery-youtube-tag-editor-submit;stage=4;scope=frontend;review=5,6 -->
- [ ] duplicate/empty/leading-hash/too-long tag validation과 inline error 구현 <!-- omo:id=delivery-tag-validation-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] suggestion/search/theme loading / empty / error / unauthorized 상태 점검 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] Vitest와 Playwright 자동화 범위 구분 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [ ] 320/390/mobile/desktop evidence와 authority report 작성 <!-- omo:id=delivery-design-evidence-authority;stage=4;scope=frontend;review=5,6 -->
- [ ] 운영 backfill/reconcile이 UI slice에서 실행되지 않음을 closeout에 기록 <!-- omo:id=delivery-ops-boundary-closeout;stage=4;scope=shared;review=6 -->
