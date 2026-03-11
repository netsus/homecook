# Slice: 01-discovery-detail-auth

## Goal
비로그인 사용자가 HOME에서 레시피를 탐색하고 RECIPE_DETAIL로 진입한 뒤,
좋아요/저장/플래너 추가 같은 보호 액션을 시도하면 로그인 게이트를 거쳐
소셜 로그인 후 원래 레시피 화면으로 돌아오게 만든다.

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

## Out of Scope
- 재료 필터 팝업
- 좋아요/저장/플래너 추가 실제 쓰기 완료
- 플래너/장보기/요리/팬트리 기능

## Dependencies
- Supabase 프로젝트 생성
- Google / Kakao / Naver 공급자 설정
- 레시피 읽기용 기본 데이터 적재

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

## Primary User Path
1. 사용자가 `HOME`에서 검색어를 입력하거나 정렬을 변경한다.
2. 레시피 카드를 눌러 `RECIPE_DETAIL`로 이동한다.
3. 좋아요/저장/플래너 추가를 누른다.
4. 로그인 게이트 모달에서 소셜 로그인 버튼을 누른다.
5. 로그인 성공 후 같은 레시피 상세 화면으로 돌아온다.

## Delivery Checklist
- [ ] `HOME` 로딩/빈 상태/에러 상태
- [ ] `RECIPE_DETAIL` 로딩/에러 상태
- [ ] Supabase 기반 소셜 로그인 버튼
- [ ] return-to-action payload 저장/복귀
- [ ] 기초 테스트 추가
