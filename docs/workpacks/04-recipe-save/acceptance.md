# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.

## Happy Path
- [ ] 사용자가 RECIPE_DETAIL에서 [저장] 버튼 클릭 시 SAVE_MODAL이 오픈된다
- [ ] SAVE_MODAL에서 저장 가능한 레시피북 목록(saved/custom)이 노출된다
- [ ] 기존 레시피북을 선택하고 [저장] 클릭 시 레시피가 해당 책에 저장된다
- [ ] "새 레시피북 만들기" 입력 후 저장 시 커스텀 레시피북이 생성되고 레시피가 저장된다
- [ ] 저장 성공 시 SAVE_MODAL이 닫히고 RECIPE_DETAIL의 save_count가 증가한다
- [ ] 저장 후 RECIPE_DETAIL의 user_status.is_saved가 true로 변경된다
- [ ] 저장 후 user_status.saved_book_ids에 저장한 book_id가 포함된다
- [ ] API 응답 형식이 `{ success, data, error }` 래퍼를 따른다
- [ ] 백엔드 계약과 프론트 타입이 일치한다

## State / Policy
- [ ] book_type이 'saved' 또는 'custom'인 레시피북만 저장 대상으로 노출된다
- [ ] book_type이 'my_added' 또는 'liked'인 레시피북으로 저장 시도 시 409 CONFLICT 반환된다
- [ ] 동일 레시피를 동일 레시피북에 재저장 시 409 CONFLICT 반환된다
- [ ] 다른 유저의 레시피북으로 저장 시도 시 403 FORBIDDEN 반환된다
- [ ] 레시피북 생성 시 book_type은 자동으로 'custom'으로 설정된다
- [ ] 저장 성공 시 recipes.save_count가 1 증가한다

## Error / Permission
- [ ] SAVE_MODAL 로딩 상태가 있다 (레시피북 목록 조회 중)
- [ ] 저장 처리 로딩 상태가 있다 (저장 API 호출 중)
- [ ] 레시피북 목록 조회 실패 시 에러 메시지가 노출된다
- [ ] 저장 실패 시 에러 메시지가 노출되고 모달이 닫히지 않는다
- [ ] 비로그인 상태에서 [저장] 버튼 클릭 시 로그인 게이트 모달이 노출된다
- [ ] 로그인 게이트 모달에서 [로그인] 선택 시 로그인 화면으로 이동한다
- [ ] 로그인 완료 후 SAVE_MODAL이 자동으로 오픈된다 (return-to-action)
- [ ] 존재하지 않는 레시피에 저장 시도 시 404 RESOURCE_NOT_FOUND 반환된다
- [ ] 존재하지 않는 레시피북에 저장 시도 시 404 RESOURCE_NOT_FOUND 반환된다

## Data Integrity
- [ ] 타인의 레시피북에 저장할 수 없다 (403)
- [ ] 레시피북 생성 시 name 필드가 누락되면 422 VALIDATION_ERROR 반환된다
- [ ] 레시피북 생성 시 name이 50자를 초과하면 422 VALIDATION_ERROR 반환된다
- [ ] 레시피북 목록은 로그인된 사용자의 책만 조회된다
- [ ] 저장 후 recipe_book_items 테이블에 (book_id, recipe_id) row가 생성된다
- [ ] 중복 저장 시도 시 recipe_book_items UNIQUE 제약으로 409 반환된다

## Manual QA
1. 비로그인 상태에서 저장 버튼 클릭 → 로그인 게이트 모달 확인 → 로그인 → 저장 모달 재오픈 확인
2. 저장 모달에서 "저장한 레시피" 책 선택 후 저장 → 성공 메시지 및 모달 닫힘 확인
3. 저장 모달에서 "새 레시피북 만들기" 입력 후 저장 → 커스텀 책 생성 및 레시피 저장 확인
4. 동일 레시피를 동일 책에 재저장 시도 → 409 에러 메시지 확인
5. 저장 후 레시피 상세에서 save_count 증가 및 저장 상태 반영 확인
6. 저장된 레시피북에서 해당 레시피 노출 확인 (별도 슬라이스 17b에서 최종 검증)

## Automation Split

### Vitest
- [ ] 레시피북 목록 조회 로직 (book_type 필터링)
- [ ] 레시피북 생성 로직 (name 검증, book_type 자동 설정)
- [ ] 레시피 저장 로직 (중복 저장 방지, 권한 검증)
- [ ] save_count 증가 로직
- [ ] user_status 업데이트 로직 (is_saved, saved_book_ids)
- [ ] book_type 제한 정책 (saved/custom만 허용)
- [ ] 에러 케이스 (401, 403, 404, 409, 422)

### Playwright
- [ ] 비로그인 상태에서 저장 버튼 클릭 → 로그인 게이트 → 로그인 후 return-to-action 흐름
- [ ] 저장 모달 오픈 → 레시피북 목록 노출 → 기존 책 선택 → 저장 → 모달 닫힘 흐름
- [ ] 저장 모달 오픈 → 새 레시피북 만들기 → 저장 → 모달 닫힘 흐름
- [ ] 저장 후 레시피 상세 화면의 save_count 증가 확인
- [ ] 저장 후 user_status 반영 확인 (is_saved=true)

### Manual Only
- [ ] 소셜 로그인 복귀 후 저장 모달 재오픈 동작 (OAuth 흐름)
- [ ] 저장된 레시피북 상세에서 레시피 노출 확인 (별도 슬라이스 17b 의존)
- [ ] 저장 해제 기능 (별도 슬라이스 17b 의존)
