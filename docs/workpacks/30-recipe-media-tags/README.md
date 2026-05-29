# Slice: 30-recipe-media-tags

## Goal
YouTube에서 가져온 레시피와 사용자가 직접 등록한 레시피에 이미지와 태그가 일관되게 붙도록 한다. YouTube 레시피는 추출 세션의 썸네일을 상세 이미지로 저장하고, 직접 등록 레시피는 사용자가 이미지 1장을 업로드할 수 있게 한다. 두 등록 경로 모두 같은 서버 결정론 태그 생성기를 사용해 `recipes.tags`를 자동 생성한다.

## Branches

- 백엔드: `feature/be-30-recipe-media-tags`
- 프론트엔드: `feature/fe-30-recipe-media-tags`

## In Scope
- 화면:
  - `YT_IMPORT` — 썸네일/태그 preview를 읽기 전용으로 표시
  - `MANUAL_RECIPE_CREATE` — 선택/교체/제거 가능한 이미지 1장 업로드
  - `RECIPE_DETAIL` — 썸네일 placeholder와 YouTube 썸네일 source note
  - `HOME` / `RECIPEBOOK_DETAIL` — 기존 카드 태그/썸네일 소비 유지
- API:
  - `POST /api/v1/recipes/images` — 직접 등록 이미지 업로드
  - `POST /api/v1/recipes` — current-user uploaded image reference만 허용, tags 서버 생성
  - `POST /api/v1/recipes/youtube/extract` — session `thumbnail_url`과 server-generated tag preview 반환
  - `POST /api/v1/recipes/youtube/register` — session thumbnail과 tags 서버 저장, client override 금지
- 상태 전이:
  - YouTube session: 기존 `draft -> consumed / expired` 유지
  - 이미지 업로드: 레시피 저장 전 임시 참조. 저장 전 제거/교체된 미사용 객체는 cleanup 대상
- DB 영향:
  - `recipes.thumbnail_url` — 기존 nullable 컬럼 사용
  - `recipes.tags` — 기존 text[] 컬럼 사용, 최대 6개
  - Supabase Storage `recipe-images` bucket/policy 추가
  - `youtube_extraction_sessions.draft_json` 또는 session metadata에 thumbnail/tags preview 저장
- Schema Change:
  - [ ] 없음 (읽기 전용)
  - [x] 있음 → `supabase/migrations/<파일명>.sql` 생성 필요. 신규 app table/column은 없지만 Storage bucket/policy를 migration으로 준비한다.

## Out of Scope
- YouTube 썸네일 다운로드, 리호스팅, 크롭, 압축
- YouTube register body에서 `thumbnail_url` 또는 `tags` client override 허용
- DB에 이미지 바이너리 저장
- 다중 이미지, `recipe_images` table, image moderation
- generated/AI image fallback
- 사용자 수동 태그 입력/수정 UI
- 정규화 tag table(`tags`, `recipe_tags`)과 tag search redesign
- 기존 recipe backfill
- 외부 재료 데이터 ingest 또는 taxonomy 확장

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `18-manual-recipe-create` | merged | [x] |
| `19-youtube-import` | merged | [x] |
| `20-youtube-real-import` | merged | [x] |
| `22-youtube-ingredient-registration` | merged | [x] |
| `27-youtube-import-quality-uplift` | merged | [x] |
| `27b-youtube-source-fallback` | merged | [x] |
| `29-youtube-author-comment-fallback` | merged | [x] |

> `28-external-ingredient-data-ingest-gate`는 이 슬라이스의 직접 선행 조건이 아니다. 태그 생성은 현재 recipe/ingredient/cooking-method 데이터만 사용한다.

## Backend First Contract
- `POST /api/v1/recipes/images`
  - request: `multipart/form-data`, field `image`, jpeg/png/webp, max 5MB
  - response: `{ success, data: { thumbnail_url, storage_path }, error }`
  - storage path: `recipe-images/{user_id}/{uuid}.{ext}`
  - auth required, cross-user path access denied
- `POST /api/v1/recipes`
  - optional `thumbnail_url`은 upload API가 반환한 현재 사용자 소유 참조만 허용
  - arbitrary external URL, signed URL, 다른 사용자 path는 422
  - `tags`는 body로 받지 않고 서버가 생성
- `POST /api/v1/recipes/youtube/extract`
  - provider thumbnail을 session에 저장하고 preview로 반환
  - tag generator preview를 최대 6개 반환
- `POST /api/v1/recipes/youtube/register`
  - client body의 thumbnail/tags는 무시가 아니라 계약상 비허용
  - `recipes.thumbnail_url`은 session thumbnail에서만 복사
  - `recipes.tags`는 session/server tag generator 결과만 저장
- 태그 생성기:
  - 입력: title, ingredient standard names, step text, cooking method labels, YouTube provider tags
  - normalize: trim, lower/canonical where applicable, duplicate removal, empty/promo/channel/hash-only removal
  - output: `string[]`, max 6, generate 불가 시 `[]`
- 권한 / 소유자 검증 / 상태 전이 / 멱등성:
  - 기존 YouTube session ownership/expiry/consumed guard 유지
  - upload reference는 current user scope로 검증
  - register consumed 재호출은 409 유지

## Frontend Delivery Mode
- 디자인 확정 전: 기능 가능한 임시 UI
- 필수 상태: `loading / empty / error / read-only / unauthorized`
- 로그인 보호 액션이면 return-to-action 포함
- 이미지 업로드 UI는 선택, 미리보기, 교체, 제거, 업로드 실패 retry를 포함한다.
- 태그는 읽기 전용 chip으로 표시한다. 사용자는 추가/수정/삭제할 수 없다.

## Design Authority
- UI risk: `high-risk`
- Anchor screen dependency: `RECIPE_DETAIL`, `MANUAL_RECIPE_CREATE`, `YT_IMPORT`
- Visual artifact: Stage 4에서 mobile/narrow screenshots 저장
- Authority status: `required`
- Notes: 이미지 업로드과 source note가 사용자-facing이므로 Stage 5 design/authority review가 필요하다.

## Design Status

- [x] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [ ] 확정 (confirmed) — Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과, Tailwind/공용 컴포넌트 정리 완료, authority blocker 0개
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

## Source Links
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.7.4.md`
- `docs/화면정의서-v1.5.11.md`
- `docs/유저flow맵-v1.3.11.md`
- `docs/db설계-v1.3.10.md`
- `docs/api문서-v1.2.14.md`
- `.omx/plans/recipe-media-tags-ralplan.md`

## QA / Test Data Plan
- Fixture baseline:
  - YouTube extract fixture with thumbnail and provider tags
  - YouTube register fixture verifying client thumbnail/tags are not accepted
  - Manual create fixture with valid user upload reference
  - Manual create negative fixtures for arbitrary external URL and cross-user storage URL
- Real DB smoke:
  - `pnpm dev:demo`
  - 실제 로그인 세션에서 `/menu/add/youtube` URL 입력 → extract → review preview → register → recipe detail image/source note/tags 확인 → cleanup
  - 직접 등록에서 이미지 선택 → 저장 → detail image/tags 확인 → recipe + storage object cleanup
- Seed / reset:
  - 신규 ingredient/system row 없음
  - Supabase Storage bucket/policy 준비 필요
- Blocker 조건:
  - Storage bucket/policy 미준비
  - image upload API가 current-user path ownership을 검증하지 못함
  - YouTube thumbnail/tags가 client body로 override 가능함

## Key Rules
- YouTube 썸네일은 원본 URL을 보존하고 리호스팅하지 않는다.
- 직접 등록 이미지는 Supabase Storage에 저장하고 DB에는 URL/path 참조만 저장한다.
- DB에는 이미지 바이너리를 저장하지 않는다.
- `recipes.thumbnail_url`에는 만료 signed URL을 저장하지 않는다.
- `recipes.tags`는 서버 생성 전용이며 클라이언트 임의 태그 입력은 MVP에서 금지한다.
- 모든 API 응답은 `{ success, data, error }` wrapper를 유지한다.
- error 객체는 `{ code, message, fields[] }` 구조를 따른다.

## Contract Evolution Candidates (Optional)
- 현재 계약: 사용자 업로드 이미지 1장만 허용
  - 제안 계약: generated/AI image fallback
  - 기대 사용자 가치: 사용자가 이미지를 준비하지 않아도 상세 카드 품질 상승
  - 영향 문서: 요구사항, 화면, API, DB, flow
  - 승인 상태: 미승인, MVP scope 밖
- 현재 계약: `recipes.tags text[]`
  - 제안 계약: normalized `tags` / `recipe_tags` table
  - 기대 사용자 가치: tag search/filter 품질 향상
  - 영향 문서: 요구사항, 화면, API, DB, flow
  - 승인 상태: 미승인, 후속 slice 후보

## Primary User Path
1. 사용자가 YouTube URL을 입력한다.
2. 앱이 썸네일과 태그 preview를 보여준다.
3. 사용자가 검수 후 등록한다.
4. 등록된 레시피 상세에서 썸네일, YouTube source note, 태그가 보인다.
5. 사용자가 직접 등록 화면에서 이미지를 선택하고 레시피를 저장한다.
6. 직접 등록 레시피 상세에서 업로드 이미지와 자동 태그가 보인다.

## Delivery Checklist
> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.
> Stage 2/3에서는 백엔드 관련 항목을, Stage 4~6에서는 남은 프론트/QA/디자인/closeout 항목을 닫는다.
> Stage 6 merge 시점에는 In Scope인데도 남아 있는 unchecked 항목이 없어야 하며, `N/A` 또는 후속 분리는 README/PR 본문에 근거를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.

- [ ] 백엔드 계약 고정 <!-- omo:id=delivery-backend-contract;stage=2;scope=backend;review=3,6 -->
- [ ] 이미지 업로드 API / Storage policy 구현 <!-- omo:id=delivery-image-upload-api;stage=2;scope=backend;review=3,6 -->
- [ ] 공유 tag generator 구현 <!-- omo:id=delivery-tag-generator;stage=2;scope=shared;review=3,6 -->
- [ ] YouTube extract/register thumbnail/tags 연결 <!-- omo:id=delivery-youtube-media-tags;stage=2;scope=backend;review=3,6 -->
- [ ] manual create thumbnail/tags 연결 <!-- omo:id=delivery-manual-media-tags;stage=2;scope=backend;review=3,6 -->
- [ ] 타입 반영 <!-- omo:id=delivery-types;stage=2;scope=shared;review=3,6 -->
- [ ] UI 연결 <!-- omo:id=delivery-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [ ] 상태 전이 / 권한 / 멱등성 테스트 <!-- omo:id=delivery-state-policy-tests;stage=2;scope=shared;review=3,6 -->
- [ ] 이 슬라이스의 `Vitest` / `Playwright` 자동화 범위 구분 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [ ] fixture와 real DB smoke 경로 구분 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [ ] Storage bucket / policy 준비 여부 점검 <!-- omo:id=delivery-storage-readiness;stage=2;scope=backend;review=3,6 -->
- [ ] `loading / empty / error / read-only` 상태 점검 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
