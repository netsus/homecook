# Acceptance Criteria - mvp2-polish-mypage-return-loading

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.

## Happy Path

### 헤더 Loading 안정화

- [ ] MYPAGE 진입 시 loading 상태의 헤더 "마이페이지" title과 ready 상태의 헤더 title이 동일한 위치/정렬을 사용한다 <!-- omo:id=mvp2-accept-header-loading-alignment;stage=4;scope=frontend;review=6 -->
- [ ] loading → ready 전환 시 헤더 title이 중앙에서 좌측으로 점프하거나 위치가 이동하지 않는다 <!-- omo:id=mvp2-accept-header-no-jump;stage=4;scope=frontend;review=6 -->

### 레시피북 상세 복귀

- [ ] MYPAGE 레시피북 탭/목록에서 레시피북을 열면 RECIPEBOOK_DETAIL이 정상 렌더링된다 <!-- omo:id=mvp2-accept-open-recipebook-detail;stage=4;scope=frontend;review=6 -->
- [ ] RECIPEBOOK_DETAIL 앱 헤더 뒤로가기는 마이페이지 레시피북 목록 맥락으로 바로 복귀한다 <!-- omo:id=mvp2-accept-recipebook-direct-back;stage=4;scope=frontend;review=6 -->

### 장보기 상세 복귀

- [ ] MYPAGE 장보기 기록 탭/목록에서 완료 리스트를 다시 열면 SHOPPING_DETAIL이 read-only로 렌더링된다 <!-- omo:id=mvp2-accept-open-shopping-detail;stage=4;scope=frontend;review=6 -->
- [ ] SHOPPING_DETAIL 앱 헤더 뒤로가기는 마이페이지 장보기 기록 목록 맥락으로 바로 복귀한다 <!-- omo:id=mvp2-accept-shopping-direct-back;stage=4;scope=frontend;review=6 -->

### 중간 화면 flash 제거

- [ ] 레시피북 상세와 장보기 상세 모두에서 뒤로가기 시 마이페이지 root/default 화면이 중간에 보이지 않는다 <!-- omo:id=mvp2-accept-no-root-flash;stage=4;scope=frontend;review=6 -->

### 장보기 상세 Skeleton

- [ ] SHOPPING_DETAIL 초기 loading 상태가 generic spinner가 아닌 skeleton UI를 렌더링한다 <!-- omo:id=mvp2-accept-shopping-detail-skeleton;stage=4;scope=frontend;review=6 -->
- [ ] skeleton은 장보기 상세의 실제 레이아웃(헤더, 아이템 목록 구조)과 유사한 형태다 <!-- omo:id=mvp2-accept-skeleton-layout-match;stage=4;scope=frontend;review=6 -->

## State / Policy

- [ ] return context가 없는 직접 진입에서는 기존 뒤로가기/fallback 동작을 유지한다 <!-- omo:id=mvp2-accept-direct-entry-fallback;stage=4;scope=frontend;review=6 -->
- [ ] 장보기 기록에서 열린 SHOPPING_DETAIL은 완료 리스트 read-only 정책을 유지한다 <!-- omo:id=mvp2-accept-shopping-readonly-preserved;stage=4;scope=frontend;review=6 -->
- [ ] 레시피북 상세의 제거/저장 해제 정책은 바뀌지 않는다 <!-- omo:id=mvp2-accept-recipebook-policy-preserved;stage=4;scope=frontend;review=6 -->
- [ ] 브라우저 back과 앱 헤더 back이 서로 다른 잘못된 탭 상태를 만들지 않는다 <!-- omo:id=mvp2-accept-back-consistency;stage=4;scope=frontend;review=6 -->

## Error / Permission

- [ ] MYPAGE loading 상태가 유지된다 (헤더 정렬 안정화 포함) <!-- omo:id=mvp2-accept-mypage-loading;stage=4;scope=frontend;review=6 -->
- [ ] 레시피북 목록/장보기 기록 empty 상태가 유지된다 <!-- omo:id=mvp2-accept-list-empty;stage=4;scope=frontend;review=6 -->
- [ ] 레시피북 상세/장보기 상세 error 상태가 유지된다 <!-- omo:id=mvp2-accept-detail-error;stage=4;scope=frontend;review=6 -->
- [ ] 비로그인 또는 권한 오류 시 기존 unauthorized/login 흐름을 유지한다 <!-- omo:id=mvp2-accept-unauthorized;stage=4;scope=frontend;review=6 -->
- [ ] 잘못된 return context가 무한 redirect를 만들지 않는다 <!-- omo:id=mvp2-accept-no-return-loop;stage=4;scope=frontend;review=6 -->

## Data Integrity

- [ ] API 응답 래퍼 `{ success, data, error }` 소비 방식이 바뀌지 않는다 <!-- omo:id=mvp2-accept-api-envelope-preserved;stage=4;scope=shared;review=6 -->
- [ ] API/DB/schema 변경 없이 기존 조회 데이터만 사용한다 <!-- omo:id=mvp2-accept-no-api-db-change;stage=4;scope=shared;review=6 -->
- [ ] return context는 사용자 리소스 식별자나 권한 정책을 우회하지 않는다 <!-- omo:id=mvp2-accept-return-context-no-auth-bypass;stage=4;scope=frontend;review=6 -->

## Layout / Accessibility

- [ ] 앱 헤더 뒤로가기 버튼의 접근 가능한 이름/터치 대상이 유지된다 <!-- omo:id=mvp2-accept-back-a11y-preserved;stage=4;scope=frontend;review=6 -->
- [ ] 목록 복귀 후 스크롤/탭 컨테이너가 incoherent overlap 없이 유지된다 <!-- omo:id=mvp2-accept-list-layout-preserved;stage=4;scope=frontend;review=6 -->
- [ ] 장보기 상세 skeleton이 적절한 aria-busy/aria-label 또는 시각 표현을 갖는다 <!-- omo:id=mvp2-accept-skeleton-a11y;stage=4;scope=frontend;review=6 -->

## Data Setup / Preconditions

- [ ] fixture에 시스템 또는 커스텀 레시피북 1개 이상과 상세 레시피가 있다 <!-- omo:id=mvp2-accept-fixture-recipebook;stage=4;scope=frontend;review=6 -->
- [ ] fixture에 완료된 shopping list 1개 이상과 read-only 상세 항목이 있다 <!-- omo:id=mvp2-accept-fixture-shopping-history;stage=4;scope=frontend;review=6 -->
- [ ] 기존 `17a/17b/10a/12a/design-polish-slice7` 경로가 regression으로 유지된다 <!-- omo:id=mvp2-accept-existing-regression;stage=4;scope=frontend;review=6 -->

## Manual QA

- verifier: Codex Stage 6
- environment: local Playwright fixture server, mobile default 390px, mobile narrow 320px
- scenarios:
  - MYPAGE 진입 → loading 헤더 title alignment 확인 → ready 상태와 일치하는지 확인
  - MYPAGE 레시피북 탭 → RECIPEBOOK_DETAIL → 앱 헤더 뒤로가기 → 레시피북 탭 직접 복귀 (MyPage 홈 flash 없음)
  - MYPAGE 장보기 기록 탭 → SHOPPING_DETAIL(read-only) → 앱 헤더 뒤로가기 → 장보기 기록 탭 직접 복귀 (MyPage 홈 flash 없음)
  - SHOPPING_DETAIL 진입 시 skeleton 표시 → 데이터 로드 후 정상 렌더링
  - 상세 URL 직접 진입 후 뒤로가기 fallback 확인

## Automation Split

### Vitest

- [ ] MyPage loading skeleton 헤더와 ready 상태 헤더의 title alignment 일관성을 단위 테스트로 고정 <!-- omo:id=mvp2-accept-vitest-header-alignment;stage=4;scope=frontend;review=6 -->
- [ ] MyPage 상세 링크/return context 생성 또는 navigation helper를 단위/컴포넌트 테스트로 고정 <!-- omo:id=mvp2-accept-vitest-return-context;stage=4;scope=frontend;review=6 -->
- [ ] detail back action이 return context를 우선 사용하고 없으면 fallback을 쓰도록 고정 <!-- omo:id=mvp2-accept-vitest-back-helper;stage=4;scope=frontend;review=6 -->
- [ ] SHOPPING_DETAIL skeleton 컴포넌트가 올바르게 렌더링되는지 고정 <!-- omo:id=mvp2-accept-vitest-shopping-skeleton;stage=4;scope=frontend;review=6 -->

### Playwright

- [ ] MYPAGE 진입 시 loading → ready 헤더 title alignment 일관성을 브라우저 테스트로 고정 <!-- omo:id=mvp2-accept-playwright-header-stability;stage=4;scope=frontend;review=6 -->
- [ ] MYPAGE 레시피북 목록 → RECIPEBOOK_DETAIL → 뒤로가기 직접 복귀 흐름을 브라우저 테스트로 고정 <!-- omo:id=mvp2-accept-playwright-recipebook-back;stage=4;scope=frontend;review=6 -->
- [ ] MYPAGE 장보기 기록 → SHOPPING_DETAIL → 뒤로가기 직접 복귀 흐름을 브라우저 테스트로 고정 <!-- omo:id=mvp2-accept-playwright-shopping-back;stage=4;scope=frontend;review=6 -->
- [ ] 중간 MyPage root/default 화면 노출 없음은 locator 또는 URL/query/state assertion으로 고정 <!-- omo:id=mvp2-accept-playwright-no-root-flash;stage=4;scope=frontend;review=6 -->
- [ ] SHOPPING_DETAIL loading 시 skeleton UI 렌더링을 브라우저 테스트로 고정 <!-- omo:id=mvp2-accept-playwright-shopping-skeleton;stage=4;scope=frontend;review=6 -->

### Manual Only

- [ ] 실제 기기에서 OS back gesture와 앱 헤더 back의 체감 전환 확인
- [ ] 실제 기기에서 마이페이지 진입 시 loading 헤더 alignment shift의 체감 확인
