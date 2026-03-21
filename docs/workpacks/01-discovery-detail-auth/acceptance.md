# Acceptance Checklist: 01-discovery-detail-auth

> **Retrofit 컨텍스트 (2026-03-21)**
> 디자인 토큰 적용 + TDD/Vitest 보강 리트로핏 기준으로 업데이트됨.
> `[x]` = 기존 구현에서 확인됨, `[ ]` = 리트로핏에서 검증/보완 필요

## Happy Path

- [x] HOME 목록이 보인다
- [x] HOME 테마 섹션(`GET /recipes/themes`)이 보인다
- [x] 검색어 입력 시 제목 기준으로 목록이 갱신된다
- [x] 정렬 변경 시 목록 순서가 갱신된다
- [x] 카드 선택 시 RECIPE_DETAIL로 이동한다
- [x] 비로그인 상태에서 보호 액션 시 로그인 모달이 열린다
- [x] 로그인 후 원래 레시피 상세 화면으로 복귀한다
- [x] API 응답이 `{ success, data, error }` 형식을 따른다 (Vitest로 계약 고정)
- [x] 백엔드 계약 TypeScript 타입과 프론트 타입이 일치한다 (Vitest)

## State / Policy

- [x] 조회는 비로그인 허용이다
- [x] 보호 액션은 로그인 전 실행되지 않는다
- [x] 요리모드/쓰기 액션은 이번 슬라이스 밖으로 남겨둔다
- [x] 중복 호출에도 결과가 꼬이지 않는다 — 읽기 전용 슬라이스, 멱등성 N/A

## Error / Permission

- [x] loading 상태가 있다 (HOME 목록, RECIPE_DETAIL 각각)
- [x] empty 상태가 있다 ("조건에 맞는 레시피가 없어요" + [필터 초기화])
- [x] error 상태가 있다 ("레시피를 불러오지 못했어요" + [다시 시도])
- [x] unauthorized 처리 — 보호 액션 시 로그인 게이트 모달이 열린다
- [x] conflict 처리 — 해당 없음 (이 슬라이스는 읽기 전용)
- [x] 로그인 게이트 후 return-to-action이 원래 레시피로 복귀한다
- [x] Supabase 설정 누락 시 API가 실패 응답을 준다
- [x] `unauthorized` 상태 흐름이 Vitest 단위 테스트로 고정되어 있다

## Data Integrity

- [x] 타인 리소스를 수정할 수 없다 — 해당 없음 (읽기 전용)
- [x] invalid input을 적절히 거부하거나 무시한다 — 검색어 sanitization, 콜백 URL 검증
- [x] 파생 필드와 비정규화 값이 맞다 — 해당 없음 (읽기 전용)
- [x] `GET /auth/callback` next 파라미터 sanitization이 Vitest로 고정되어 있다

## Manual QA

1. HOME에서 검색과 정렬을 바꿔본다.
2. 상세에서 보호 액션을 눌러 로그인 게이트를 확인한다.
3. 소셜 로그인 후 같은 레시피로 복귀하는지 확인한다.
4. **(Retrofit)** 디자인 토큰 적용 후: 배경색 `#fff9f2`, 주요 버튼 `#FF6C3C`, 카드 border-radius 16px 확인.
5. **(Retrofit)** 구버전 색상(`#d56a3a`, `#6e7c4a`) 잔존 여부 확인.

## Automation Split

### Vitest

- [x] pending action 저장 키와 parser가 안정적으로 동작한다
- [x] auth provider env parsing이 기본값과 fallback을 지킨다
- [x] callback next sanitization과 route helper가 고정되어 있다
- [x] **[Retrofit BE]** `GET /recipes` 응답 계약(`{ success, data, error }` 래퍼)이 단위 테스트로 고정되어 있다
- [x] **[Retrofit BE]** `GET /recipes/themes` 엔드포인트 존재 및 응답 형식이 고정되어 있다
- [x] **[Retrofit BE]** `GET /recipes/{recipe_id}` 404 에러 응답 형식이 고정되어 있다
- [x] **[Retrofit BE]** `POST /auth/login` invalid provider 에러 처리가 고정되어 있다
- [x] 로그인 게이트 트리거 조건(비로그인 + 보호 액션)이 단위 테스트로 고정되어 있다

### Playwright

- [x] HOME 목록, 검색, 정렬이 브라우저에서 동작한다
- [x] HOME 테마 섹션이 브라우저에서 보인다
- [x] 카드 클릭 후 상세 페이지로 이동한다
- [x] 비로그인 보호 액션 시 로그인 게이트가 열린다
- [x] 로그인 게이트가 닫기 버튼, ESC, 배경 클릭으로 닫힌다
- [x] `authError=oauth_failed` 피드백이 보인다
- [ ] **(Retrofit)** 디자인 토큰 적용 후 HOME/RECIPE_DETAIL 스냅샷 테스트 추가 (선택)

### Manual Only

- [ ] 실제 Google OAuth 로그인 후 원래 레시피 상세로 복귀한다
- [ ] **(Retrofit)** 실기기에서 터치 타겟 44×44px 및 모바일 레이아웃 확인
