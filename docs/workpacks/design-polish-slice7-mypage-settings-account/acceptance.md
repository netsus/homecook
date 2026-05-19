# Acceptance Criteria - design-polish-slice7-mypage-settings-account

## Happy Path

- [x] MYPAGE 레시피북 탭/목록에서 레시피북을 열면 RECIPEBOOK_DETAIL이 정상 렌더링된다 <!-- omo:id=dp7-accept-open-recipebook-detail;stage=4;scope=frontend;review=6 -->
- [x] RECIPEBOOK_DETAIL 앱 헤더 뒤로가기는 마이페이지 레시피북 목록 맥락으로 바로 복귀한다 <!-- omo:id=dp7-accept-recipebook-direct-back;stage=4;scope=frontend;review=6 -->
- [x] MYPAGE 장보기 기록 탭/목록에서 완료 리스트를 다시 열면 SHOPPING_DETAIL이 read-only로 렌더링된다 <!-- omo:id=dp7-accept-open-shopping-detail;stage=4;scope=frontend;review=6 -->
- [x] SHOPPING_DETAIL 앱 헤더 뒤로가기는 마이페이지 장보기 기록 목록 맥락으로 바로 복귀한다 <!-- omo:id=dp7-accept-shopping-direct-back;stage=4;scope=frontend;review=6 -->
- [x] 두 복귀 흐름 모두 마이페이지 root/default 화면이 중간에 보이지 않는다 <!-- omo:id=dp7-accept-no-root-flash;stage=4;scope=frontend;review=6 -->

## State / Policy

- [x] return context가 없는 직접 진입에서는 기존 뒤로가기/fallback 동작을 유지한다 <!-- omo:id=dp7-accept-direct-entry-fallback;stage=4;scope=frontend;review=6 -->
- [x] 장보기 기록에서 열린 SHOPPING_DETAIL은 완료 리스트 read-only 정책을 유지한다 <!-- omo:id=dp7-accept-shopping-readonly-preserved;stage=4;scope=frontend;review=6 -->
- [x] 레시피북 상세의 제거/저장 해제 정책은 바뀌지 않는다 <!-- omo:id=dp7-accept-recipebook-policy-preserved;stage=4;scope=frontend;review=6 -->
- [x] 브라우저 back과 앱 헤더 back이 서로 다른 잘못된 탭 상태를 만들지 않는다 <!-- omo:id=dp7-accept-back-consistency;stage=4;scope=frontend;review=6 -->

## Error / Permission

- [x] MYPAGE loading 상태가 유지된다 <!-- omo:id=dp7-accept-mypage-loading;stage=4;scope=frontend;review=6 -->
- [x] 레시피북 목록/장보기 기록 empty 상태가 유지된다 <!-- omo:id=dp7-accept-list-empty;stage=4;scope=frontend;review=6 -->
- [x] 레시피북 상세/장보기 상세 error 상태가 유지된다 <!-- omo:id=dp7-accept-detail-error;stage=4;scope=frontend;review=6 -->
- [x] 비로그인 또는 권한 오류 시 기존 unauthorized/login 흐름을 유지한다 <!-- omo:id=dp7-accept-unauthorized;stage=4;scope=frontend;review=6 -->
- [x] 잘못된 return context가 무한 redirect를 만들지 않는다 <!-- omo:id=dp7-accept-no-return-loop;stage=4;scope=frontend;review=6 -->

## Data Integrity

- [x] API 응답 래퍼 `{ success, data, error }` 소비 방식이 바뀌지 않는다 <!-- omo:id=dp7-accept-api-envelope-preserved;stage=4;scope=shared;review=6 -->
- [x] API/DB/schema 변경 없이 기존 조회 데이터만 사용한다 <!-- omo:id=dp7-accept-no-api-db-change;stage=4;scope=shared;review=6 -->
- [x] return context는 사용자 리소스 식별자나 권한 정책을 우회하지 않는다 <!-- omo:id=dp7-accept-return-context-no-auth-bypass;stage=4;scope=frontend;review=6 -->

## Layout / Accessibility

- [x] 앱 헤더 뒤로가기 버튼의 접근 가능한 이름/터치 대상이 유지된다 <!-- omo:id=dp7-accept-back-a11y-preserved;stage=4;scope=frontend;review=6 -->
- [x] 목록 복귀 후 스크롤/탭 컨테이너가 incoherent overlap 없이 유지된다 <!-- omo:id=dp7-accept-list-layout-preserved;stage=4;scope=frontend;review=6 -->

## Data Setup / Preconditions

- [x] fixture에 시스템 또는 커스텀 레시피북 1개 이상과 상세 레시피가 있다 <!-- omo:id=dp7-accept-fixture-recipebook;stage=4;scope=frontend;review=6 -->
- [x] fixture에 완료된 shopping list 1개 이상과 read-only 상세 항목이 있다 <!-- omo:id=dp7-accept-fixture-shopping-history;stage=4;scope=frontend;review=6 -->
- [x] 기존 `17a/17b/10a/12a` 경로가 regression으로 유지된다 <!-- omo:id=dp7-accept-existing-regression;stage=4;scope=frontend;review=6 -->

## Manual QA

- verifier: Codex Stage 6
- environment: local Playwright fixture server, mobile default 390px, mobile narrow if needed
- scenarios:
  - MYPAGE 레시피북 탭 → RECIPEBOOK_DETAIL → 앱 헤더 뒤로가기 → 레시피북 탭 직접 복귀
  - MYPAGE 장보기 기록 탭 → SHOPPING_DETAIL(read-only) → 앱 헤더 뒤로가기 → 장보기 기록 탭 직접 복귀
  - 상세 URL 직접 진입 후 뒤로가기 fallback 확인

## Automation Split

### Vitest

- [x] MyPage 상세 링크/return context 생성 또는 navigation helper를 단위/컴포넌트 테스트로 고정 <!-- omo:id=dp7-accept-vitest-return-context;stage=4;scope=frontend;review=6 -->
- [x] detail back action이 return context를 우선 사용하고 없으면 fallback을 쓰도록 고정 <!-- omo:id=dp7-accept-vitest-back-helper;stage=4;scope=frontend;review=6 -->

### Playwright

- [x] MYPAGE 레시피북 목록 → RECIPEBOOK_DETAIL → 뒤로가기 직접 복귀 흐름을 브라우저 테스트로 고정 <!-- omo:id=dp7-accept-playwright-recipebook-back;stage=4;scope=frontend;review=6 -->
- [x] MYPAGE 장보기 기록 → SHOPPING_DETAIL → 뒤로가기 직접 복귀 흐름을 브라우저 테스트로 고정 <!-- omo:id=dp7-accept-playwright-shopping-back;stage=4;scope=frontend;review=6 -->
- [x] 중간 MyPage root/default 화면 노출 없음은 locator 또는 URL/query/state assertion으로 고정 <!-- omo:id=dp7-accept-playwright-no-root-flash;stage=4;scope=frontend;review=6 -->

### Manual Only

- [ ] 실제 기기에서 OS back gesture와 앱 헤더 back의 체감 전환 확인
