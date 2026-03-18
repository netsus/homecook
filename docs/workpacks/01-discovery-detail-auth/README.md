# Slice: 01-discovery-detail-auth

## Goal
비로그인 사용자가 HOME에서 레시피를 탐색하고 RECIPE_DETAIL로 진입한 뒤,
좋아요/저장/플래너 추가 같은 보호 액션을 시도하면 로그인 게이트를 거쳐
소셜 로그인 후 원래 레시피 화면으로 돌아오게 만든다.

## Slice Role

- 현재 저장소의 부트스트랩 슬라이스다.
- 이후 슬라이스는 이 범위를 더 작은 기능 단위로 분리해 이어서 개발한다.

## Branches

- 백엔드: `feature/be-01-discovery-detail-auth` (merged)
- 프론트엔드: `feature/fe-01-discovery-detail-auth` (merged)

## In Scope
- 화면:
  - `HOME`
  - `RECIPE_DETAIL`
  - `LOGIN` 또는 로그인 모달
- API:
  - `GET /api/v1/recipes`
  - `GET /api/v1/recipes/:id`
  - `GET /auth/callback`
- 상태 전이:
  - 비로그인 -> 로그인 세션 생성
  - 보호 액션 -> return-to-action 복귀
- DB 영향:
  - `recipes`
  - `recipe_sources`
  - `recipe_ingredients`
  - `recipe_steps`
  - `recipe_likes`
  - `recipe_books`
  - `recipe_book_items`
- Schema Change:
  - [ ] 없음 (읽기 전용)
  - [x] 있음 → 초기 테이블 생성 마이그레이션 (`supabase/migrations/`)

## Out of Scope
- 재료 필터 팝업
- 좋아요/저장/플래너 추가 실제 쓰기 완료
- 플래너/장보기/요리/팬트리 기능

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| — (첫 슬라이스, 선행 없음) | — | — |

**인프라 전제 조건** (슬라이스 시작 전 완료 필요):
- Supabase 프로젝트 생성
- Google / Kakao / Naver 공급자 설정
- 레시피 읽기용 기본 데이터 적재

## Backend First Contract

- `GET /api/v1/recipes`: query `q` (검색어), `sort` → `{ success, data: Recipe[], error }`
- `GET /api/v1/recipes/:id`: path `id` → `{ success, data: Recipe, error }`
- `GET /auth/callback`: OAuth 콜백 — 항상 안전한 내부 경로로만 리다이렉트
- 권한: GET 엔드포인트는 비로그인 허용. 인증 콜백은 외부 URL 리다이렉트 금지.
- 멱등성: 읽기 전용 슬라이스, 쓰기 없음.

## Frontend Delivery Mode

- 디자인 확정 전: 기능 가능한 임시 UI로 구현
- 필수 상태: `loading / empty / error` (HOME, RECIPE_DETAIL 각각)
- 로그인 보호 액션: 안내 모달 → 소셜 로그인 → return-to-action 복귀

## Design Status

- [x] 임시 UI (temporary) — 기능 완성 기준으로 전달됨

## Source Links
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.6.md`
- `docs/화면정의서-v1.2.md`
- `docs/유저flow맵-v1.2.md`
- `docs/db설계-v1.3.md`
- `docs/api문서-v1.2.1.md`
- `docs/reference/wireframes/jibhap-wireframe-session3.md`

## Key Rules
- `HOME`은 제목 검색과 정렬을 지원한다.
- `RECIPE_DETAIL`은 비로그인 조회가 가능하다.
- 보호 액션 시 즉시 로그인 이동이 아니라 안내 모달을 먼저 보여준다.
- 로그인 성공 후 원래 보던 레시피 화면으로 복귀한다.
- 요리모드, 저장, 좋아요, 플래너 추가의 실제 쓰기 완료는 이번 슬라이스 밖이다.
- 읽기 API는 개발 환경에서 mock fallback을 허용할 수 있지만, 인증 콜백은 항상 안전한 내부 경로로만 리다이렉트한다.

## Primary User Path
1. 사용자가 `HOME`에서 검색어를 입력하거나 정렬을 변경한다.
2. 레시피 카드를 눌러 `RECIPE_DETAIL`로 이동한다.
3. 좋아요/저장/플래너 추가를 누른다.
4. 로그인 게이트 모달에서 소셜 로그인 버튼을 누른다.
5. 로그인 성공 후 같은 레시피 상세 화면으로 돌아온다.

## Delivery Checklist
- [x] 백엔드 계약 고정
- [x] API 또는 adapter 연결
- [x] 타입 반영
- [x] UI 연결
- [x] 상태 전이 / 권한 / 멱등성 테스트
- [x] 이 슬라이스의 `Vitest` / `Playwright` 자동화 범위 구분
- [x] `loading / empty / error` 상태 점검
- [x] 테스트 에이전트 전달용 수동 QA 시나리오 정리
