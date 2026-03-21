# Slice: 01-discovery-detail-auth

## Goal

비로그인 사용자가 HOME에서 레시피를 탐색하고 RECIPE_DETAIL로 진입한 뒤,
좋아요/저장/플래너 추가 같은 보호 액션을 시도하면 로그인 게이트를 거쳐
소셜 로그인 후 원래 레시피 화면으로 돌아오게 만든다.

> **Retrofit 컨텍스트 (2026-03-21)**
> 슬라이스 워크플로우, TDD/Vitest, 디자인 토큰(C2 명랑한 주방) 시스템이 구축된 이후
> 현재 시스템 기준에 맞게 문서·테스트·디자인을 보완하는 1단계 재작성이다.

## Slice Role

- 현재 저장소의 부트스트랩 슬라이스다. (`bootstrap` status)
- 이후 슬라이스는 이 범위를 더 작은 기능 단위로 분리해 이어서 개발한다.

## Branches

- 백엔드: `feature/be-01-discovery-detail-auth` (merged)
- 프론트엔드: `feature/fe-01-discovery-detail-auth` (merged)
- 리트로핏 백엔드: `feature/be-01-retrofit` (**미생성 — Stage 2 착수 시 Codex가 생성**)
- 리트로핏 프론트엔드: `feature/fe-01-retrofit` (**미생성 — Stage 4 착수 시 Codex가 생성**)

## In Scope

- 화면:
  - `HOME`
  - `RECIPE_DETAIL`
  - `LOGIN` (소셜 로그인 화면 + 로그인 게이트 모달)
- API:
  - `GET /api/v1/recipes` (목록 조회: `q`, `sort`, `cursor`, `limit`)
  - `GET /api/v1/recipes/themes` (테마 섹션 조회) ← **bootstrap 미구현, Retrofit Stage 2에서 추가**
  - `GET /api/v1/recipes/{recipe_id}` (상세 조회)
  - `POST /api/v1/auth/login` (소셜 로그인)
  - `PATCH /api/v1/auth/profile` (닉네임 설정, 신규 회원)
  - `GET /auth/callback` (OAuth 리다이렉트 핸들러 — 보안 검증 포함)
- 상태 전이:
  - 비로그인 → 로그인 세션 생성
  - 보호 액션 → 로그인 게이트 모달 → 소셜 로그인 → return-to-action 복귀
- DB 영향:
  - `recipes`
  - `recipe_sources`
  - `recipe_ingredients`
  - `recipe_steps`
  - `recipe_likes` (읽기 전용: 카운트 표시)
  - `recipe_books` (읽기 전용: 카운트 표시)
  - `recipe_book_items` (읽기 전용)
- Schema Change:
  - [ ] 없음 (읽기 전용)
  - [x] 있음 → 초기 테이블 생성 마이그레이션 (`supabase/migrations/`) — 최초 부트스트랩 시 완료

## Out of Scope

- 재료 필터 팝업 (`INGREDIENT_FILTER_MODAL`) — Slice 02
- 좋아요/저장/플래너 추가 실제 쓰기 완료 — Slice 03/04/05
- 플래너/장보기/요리/팬트리 기능
- 인분 조절 후 재료량 즉시 변경 계산 — RECIPE_DETAIL에는 UI 있으나 이 슬라이스에서 테스트 범위 아님
- `GET /ingredients` (재료 필터용) — Out of Scope (Slice 02)

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| — (첫 슬라이스, 선행 없음) | — | — |

**인프라 전제 조건** (슬라이스 시작 전 완료 필요):
- Supabase 프로젝트 생성
- Google / Kakao / Naver 공급자 설정
- 레시피 읽기용 기본 데이터 적재

## Backend First Contract

### `GET /api/v1/recipes`

- Query: `q` (string?, 제목 검색), `sort` (string?, `view_count`/`like_count`/`save_count`/`plan_count`, 기본 `view_count`), `cursor` (string?, opaque), `limit` (int?, 기본 20)
- `ingredient_ids`는 이 슬라이스 Out of Scope
- Response 200: `{ success: true, data: { items: Recipe[], next_cursor: string|null, has_next: bool }, error: null }`
- Error: 없음 (비로그인 허용, 검색 결과 없으면 빈 배열)

### `GET /api/v1/recipes/themes`

- Response 200: `{ success: true, data: { themes: [{ id, title, recipes: Recipe[] }] }, error: null }`

### `GET /api/v1/recipes/{recipe_id}`

- 비로그인 허용. 로그인 시 `user_status: { is_liked, is_saved, saved_book_ids }` 포함. 비로그인 시 `user_status: null`
- Response 200: `{ success: true, data: Recipe (ingredients + steps 포함), error: null }`
- Error: 404 (`RESOURCE_NOT_FOUND`) — 존재하지 않는 레시피

### `POST /api/v1/auth/login`

- Body: `provider` (`kakao`/`naver`/`google`), `access_token`
- Response 200: `{ success: true, data: { token, refresh_token, user }, error: null }`
- Error: 400 (`INVALID_REQUEST`) — 지원하지 않는 provider

### `GET /auth/callback`

- OAuth 리다이렉트 핸들러 (Supabase/Next.js)
- **보안**: 외부 URL 리다이렉트 금지 — 항상 안전한 내부 경로로만 리다이렉트
- `next` 파라미터 sanitization 필수

### 권한 / 멱등성

- 읽기 전용 슬라이스. 쓰기 없음 → 멱등성 N/A
- 인증 콜백은 외부 URL 리다이렉트 금지

## Frontend Delivery Mode

- 디자인 확정 전: 기능 가능한 임시 UI로 구현됨 (bootstrap 시점)
- 필수 상태 5개:
  - `loading`: HOME 목록/테마, RECIPE_DETAIL 상세 로딩
  - `empty`: HOME 검색 결과 없음 ("조건에 맞는 레시피가 없어요" + [필터 초기화])
  - `error`: HOME/RECIPE_DETAIL API 실패 ("레시피를 불러오지 못했어요" + [다시 시도])
  - `read-only`: N/A (이 슬라이스는 읽기 전용)
  - `unauthorized`: 보호 액션(좋아요/저장/플래너 추가) 시 로그인 게이트 모달
- 로그인 보호 액션: 안내 모달 → 소셜 로그인 → return-to-action 복귀

## Design Status

- [x] 임시 UI (temporary) — 기능 완성 기준으로 전달됨 (bootstrap 시점)
- [ ] 리뷰 대기 (pending-review) — Stage 4 리트로핏 완료 후 전환
- [ ] 확정 (confirmed) — Stage 5 디자인 리뷰 통과 후 전환
- [ ] N/A

> **Retrofit 디자인 목표**: 디자인 토큰 C2(명랑한 주방) 적용.
> `--brand(#FF6C3C)`, `--olive(#2ea67a)`, `--surface(#ffffff)`, `--background(#fff9f2)`,
> 카드 border-radius 16px, 터치 타겟 44px 기준 적용.
> 현재 임시 UI에서 `#d56a3a`, `#6e7c4a` 같은 하드코딩 색상을 교체해야 한다.
>
> Design Status 전이: `temporary` → `pending-review` (Stage 4 리트로핏 완료, Codex 변경)
>                   → `confirmed` (Stage 5 리뷰 통과, Claude 변경)

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.6.md`
- `docs/화면정의서-v1.2.md` — §1 HOME, §3 RECIPE_DETAIL, §4 LOGIN
- `docs/유저flow맵-v1.2.md`
- `docs/db설계-v1.3.md`
- `docs/api문서-v1.2.1.md` — §0 인증, §1 홈, §2 레시피 상세
- `docs/design/design-tokens.md`
- `docs/reference/wireframes/jibhap-wireframe-session3.md`

## Key Rules

- `HOME`은 제목 검색(`q`)과 정렬(`sort`)을 지원한다. 재료 필터(`ingredient_ids`)는 Slice 02.
- `HOME`에 테마 섹션(`GET /recipes/themes`)이 있어야 한다. — **bootstrap 미구현, Retrofit Stage 2에서 추가**
- `RECIPE_DETAIL`은 비로그인 조회가 가능하다.
- 보호 액션(좋아요/저장/플래너 추가) 시 즉시 로그인 이동이 아니라 안내 모달을 먼저 보여준다.
- 로그인 성공 후 원래 보던 레시피 화면으로 복귀한다 (return-to-action).
- 요리모드·저장·좋아요·플래너 추가의 실제 쓰기 완료는 이번 슬라이스 밖이다.
- `GET /auth/callback`의 `next` 파라미터는 반드시 안전한 내부 경로로만 허용한다.
- 읽기 API는 개발 환경에서 mock fallback을 허용할 수 있지만, 인증 콜백은 항상 안전한 내부 경로로만 리다이렉트한다.
- **디자인 토큰 (Retrofit)**: C2 명랑한 주방 토큰을 적용한다.
  - `--brand(#FF6C3C)`, `--brand-deep(#E05020)`, `--olive(#2ea67a)`, `--background(#fff9f2)`
  - 구버전 하드코딩 색상(`#d56a3a`, `#6e7c4a`) 사용 금지
  - 카드 border-radius 16px, 버튼 border-radius 12px, 터치 타겟 최소 44×44px

## Primary User Path

1. 사용자가 `HOME`에서 검색어를 입력하거나 정렬을 변경한다.
2. 테마 섹션 또는 검색 결과에서 레시피 카드를 눌러 `RECIPE_DETAIL`로 이동한다.
3. 좋아요/저장/플래너 추가를 누른다.
4. 로그인 게이트 모달에서 소셜 로그인 버튼을 누른다.
5. 로그인 성공 후 같은 레시피 상세 화면으로 돌아온다.

## Delivery Checklist

- [x] 백엔드 계약 고정
- [x] API 또는 adapter 연결
- [x] 타입 반영
- [x] UI 연결 (임시 UI)
- [x] 상태 전이 / 권한 / 멱등성 테스트 (기초 범위)
- [x] 이 슬라이스의 `Vitest` / `Playwright` 자동화 범위 구분
- [x] `loading / empty / error` 상태 구현
- [ ] **[Retrofit BE — Stage 2]** 기존 백엔드 코드 검토: 현재 시스템 기준 정합 여부 확인
- [ ] **[Retrofit BE — Stage 2]** Vitest 테스트 보강: happy path + 에러 + 권한 + callback sanitization
- [ ] **[Retrofit BE — Stage 2]** API 응답 계약(`{ success, data, error }`) 일관성 검증
- [ ] **[Retrofit BE — Stage 2]** `GET /recipes/themes` 엔드포인트 존재 여부 확인 및 보완
- [ ] `unauthorized` 상태 테스트 고정 (Vitest)
- [ ] 디자인 토큰(C2) 적용 (Retrofit Stage 4)
- [ ] `read-only` 명시적 N/A 처리 (Stage 4)
- [ ] 테스트 에이전트 전달용 수동 QA 시나리오 최신화 (Stage 4)
